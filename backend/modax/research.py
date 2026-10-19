"""Opt-in bounded SearXNG search. Never fetch result URLs or send private history."""

import asyncio
import ipaddress
import json
from urllib.parse import urlsplit

import httpx
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from .workspace import SECRET


def public_link(value):
    try:
        parsed = urlsplit(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return False
        host = parsed.hostname.lower().rstrip(".")
        if host == "localhost" or host.endswith((".localhost", ".local", ".internal")):
            return False
        try:
            return ipaddress.ip_address(host).is_global
        except ValueError:
            return "." in host
    except (TypeError, ValueError):
        return False


class SearchInput(BaseModel):
    query: str = Field(min_length=1, max_length=240)
    confirm_external_search: bool = False


_search_slots = asyncio.Semaphore(2)


async def search_web(endpoint, query, confirmed):
    if _search_slots.locked():
        raise HTTPException(429, "Search busy; try again later")
    async with _search_slots:
        try:
            async with asyncio.timeout(15):
                return await _search(endpoint, query, confirmed)
        except TimeoutError:
            raise HTTPException(504, "Search time budget exceeded") from None


async def _search(endpoint, query, confirmed):
    if not confirmed:
        raise HTTPException(403, "Confirm sending this query to the external search service")
    if not query.strip() or len(query) > 240 or SECRET.search(query):
        raise HTTPException(422, "Invalid search query; never include secrets")
    if not endpoint:
        raise HTTPException(503, "Web search unavailable: MODAX_SEARXNG_URL is not configured")
    if not public_link(endpoint):
        raise HTTPException(503, "Search endpoint must be an approved public HTTPS service")
    try:
        async with httpx.AsyncClient(timeout=12, follow_redirects=False) as client:
            async with client.stream(
                "GET",
                endpoint.rstrip("/") + "/search",
                params={
                    "q": query,
                    "format": "json",
                    "safesearch": 1,
                },
            ) as response:
                response.raise_for_status()
                raw = bytearray()
                async for block in response.aiter_bytes():
                    raw.extend(block)
                    if len(raw) > 262144:
                        raise ValueError("Search response too large")
        data = json.loads(raw)
        results = []
        seen = set()
        for item in data["results"][:50]:
            if not isinstance(item, dict):
                continue
            url = item.get("url", "")
            if not isinstance(url, str) or len(url) > 2048 or not public_link(url) or url in seen:
                continue
            seen.add(url)
            results.append(
                {
                    "url": url,
                    "title": str(item.get("title", ""))[:200],
                    "snippet": str(item.get("content", ""))[:1200],
                }
            )
            if len(results) == 5:
                break
        return {"query": query, "results": results, "kind": "search_snippets_not_page_reads"}
    except (httpx.HTTPError, ValueError, TypeError, KeyError):
        raise HTTPException(
            502, "Search failed; check SearXNG availability and JSON support"
        ) from None


def install_research(app):
    @app.get("/api/v1/workspace/capabilities")
    def capabilities(user=Depends(app.state.owner_dependency)):
        return {
            "modes": ["M", "X"],
            "web_search": public_link(app.state.settings.searxng_url),
            "memory": "explicit_private_notes",
            "weight_training": False,
            "project_builder": "bounded_coder_and_original_godot_template",
        }

    @app.post("/api/v1/research/search")
    async def search(body: SearchInput, user=Depends(app.state.owner_dependency)):
        return await search_web(
            app.state.settings.searxng_url, body.query, body.confirm_external_search
        )
