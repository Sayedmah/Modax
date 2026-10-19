# SPDX-License-Identifier: AGPL-3.0-only
"""Private bounded JSON gateway; no query logging, page fetching or open proxy."""

import hmac
import json
import threading
import time
from collections import deque
from urllib.parse import parse_qs, urlencode


class SearchGateway:
    def __init__(self, app, token, limit=30, clock=time.monotonic):
        if len(token) < 32:
            raise ValueError("A server-only search token of at least 32 characters is required")
        self.app, self.token, self.limit, self.clock = app, token, limit, clock
        self.slots = threading.BoundedSemaphore(2)
        self.lock, self.hits = threading.Lock(), deque()

    def response(self, start, code, payload):
        raw = json.dumps(payload, ensure_ascii=False).encode()
        start(
            code,
            [
                ("Content-Type", "application/json; charset=utf-8"),
                ("Content-Length", str(len(raw))),
                ("Cache-Control", "no-store"),
                ("X-Content-Type-Options", "nosniff"),
            ],
        )
        return [raw]

    def __call__(self, environ, start):
        path = environ.get("PATH_INFO", "/")
        if environ.get("REQUEST_METHOD") != "GET":
            return self.response(start, "405 Method Not Allowed", {"error": "GET only"})
        if path in {"/", "/health", "/source"}:
            return self.response(
                start,
                "200 OK",
                {
                    "service": "MODAX SearXNG gateway",
                    "status": "ready",
                    "upstream_availability": "checked per query; not guaranteed",
                    "license": "AGPL-3.0",
                    "source": "https://github.com/Sayedmah/Modax/tree/feat/modax-omega-foundation/deployment/searxng",
                    "upstream_source": "https://github.com/searxng/searxng/tree/1c10abe2d",
                },
            )
        if path != "/search":
            return self.response(start, "404 Not Found", {"error": "Unknown route"})
        supplied = environ.get("HTTP_X_MODAX_SEARCH_TOKEN", "")
        if not hmac.compare_digest(supplied.encode(), self.token.encode()):
            return self.response(start, "401 Unauthorized", {"error": "Unauthorized"})
        try:
            raw_query = environ.get("QUERY_STRING", "")
            if len(raw_query) > 4096:
                raise ValueError()
            params = parse_qs(raw_query, keep_blank_values=True, max_num_fields=6)
            query = params.get("q", [""])
            if len(query) != 1 or not query[0].strip() or len(query[0]) > 240:
                raise ValueError()
            if set(params) - {"q", "format", "safesearch"}:
                raise ValueError()
        except ValueError:
            return self.response(start, "422 Unprocessable Entity", {"error": "Invalid query"})
        with self.lock:
            now = self.clock()
            while self.hits and self.hits[0] <= now - 60:
                self.hits.popleft()
            if len(self.hits) >= self.limit:
                return self.response(
                    start, "429 Too Many Requests", {"error": "Query budget reached"}
                )
            self.hits.append(now)
        if not self.slots.acquire(blocking=False):
            return self.response(start, "429 Too Many Requests", {"error": "Search busy"})
        stream = None
        try:
            internal = dict(environ)
            internal.pop("HTTP_X_MODAX_SEARCH_TOKEN", None)
            internal.pop("HTTP_AUTHORIZATION", None)
            internal.pop("HTTP_COOKIE", None)
            internal["QUERY_STRING"] = urlencode({"q": query[0], "format": "json", "safesearch": 1})
            status = []

            def capture(code, headers, exc_info=None):
                status.append(code)

            stream = self.app(internal, capture)
            raw = bytearray()
            for block in stream:
                raw.extend(block)
                if len(raw) > 1048576:
                    raise ValueError()
            if not status or not status[0].startswith("200"):
                raise ValueError()
            data = json.loads(raw)
            if not isinstance(data.get("results"), list):
                raise ValueError()
            results = []
            for item in data["results"][:30]:
                if not isinstance(item, dict):
                    continue
                results.append(
                    {
                        key: str(item.get(original, ""))[:bound]
                        for key, original, bound in (
                            ("url", "url", 2048),
                            ("title", "title", 200),
                            ("content", "content", 1200),
                        )
                    }
                )
                if len(results) == 10:
                    break
            failures = data.get("unresponsive_engines", [])
            failures = len(failures) if isinstance(failures, list) else 0
            if not results and failures:
                return self.response(
                    start, "502 Bad Gateway", {"error": "Search engines unavailable"}
                )
            return self.response(
                start,
                "200 OK",
                {"results": results, "unavailable_engine_count": min(failures, 1000)},
            )
        except Exception:
            return self.response(start, "502 Bad Gateway", {"error": "Search failed"})
        finally:
            try:
                if stream is not None and hasattr(stream, "close"):
                    stream.close()
            finally:
                self.slots.release()
