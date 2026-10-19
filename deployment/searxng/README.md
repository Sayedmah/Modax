# MODAX SearXNG service

This independent AGPL-3.0 service uses the official upstream 2026.10.17 container, source commit `1c10abe2d3e4ab7ddcc4e9da1a7d07dc7ca7f8f4`, linux/amd64 digest `2fc7a1ee644edac36b7ab2b7885b83b991720da8d81a03838ddf8c228893ca4e`. The pinned upstream Dockerfile labels the image AGPL-3.0-or-later. Our gateway files are AGPL-3.0-only; the accompanying LICENSE preserves the upstream license text. These service files are separate from the original MODAX API/client. No model weights or ComfyUI source are bundled.

Official installation/configuration: https://docs.searxng.org/admin/installation-docker and https://docs.searxng.org/admin/settings/settings . Upstream source: https://github.com/searxng/searxng/tree/1c10abe2d3e4ab7ddcc4e9da1a7d07dc7ca7f8f4 . Service source is available from the public `/source` endpoint; retain source access and applicable notices when redistributing/modifying this component. This is not a blanket license-compatibility opinion.

## Runtime contract

Build from the repository root with `docker build -f deployment/searxng/Dockerfile .`. Set a cryptographically random server-only `MODAX_SEARCH_TOKEN` of at least32characters. The entrypoint binds to `0.0.0.0:$PORT` (8080default), reuses that secret as upstream SEARXNG_SECRET, uses the existing upstream virtual environment/Granian and runs as uid977. There is no shell execution or arbitrary URL input in the gateway API. No Redis/database is required because access control and admission are provided by the gateway; upstream public-instance/bot-limiter functionality is not being offered.

- Public GET `/health` reports application readiness, not availability of every search engine.
- Public GET `/source` provides source/license references.
- GET `/search?q=...` requires `X-Modax-Search-Token`. Only a single1–240character q plus format/safesearch fields is admitted. JSON and safe-search1 are enforced. Other paths/methods/engine-selection input are rejected.
- At most2active calls,30admitted requests per minute per process,1MiB upstream response,10projected results. Engine requests use6s/default,8smaximum; no evasion of CAPTCHA/rate-limit blocks. Bing and Mwmbl are explicitly enabled (upstream defaults disable them), alongside DuckDuckGo and Wikipedia. All-engine failures become502,partial results carry a failure count. Rate/capacity state resets on restart.
- Gateway code does not log queries/secrets and strips cookies, owner Authorization and gateway credentials before calling SearXNG. Hosting/engine infrastructure may retain its own metadata. Health/source contain no secret values. Keep logs/config private.

In MODAX set `MODAX_SEARXNG_URL` to the deployed public HTTPS service origin and `MODAX_SEARXNG_TOKEN` to the same secret, using hosted environment settings only. The browser never receives this token. Existing unkeyed authorized SearXNG instances remain supported when the token is blank. Only the user-approved query reaches search; private conversation history/notes are not sent. Result pages are not fetched. Snippets remain untrusted.

## Free-host limits and verification

Render Free may sleep after15minutes and take about a minute to wake, exceeding the API's deliberate15ssearch budget. Retry a failed cold-start request later; no keep-alive scheduler is configured. Workspace free hours are shared, and outbound/pipeline allowances have limits. No paid upgrade or quota increase is authorized. Search engines may block hosting IPs; readiness never guarantees all-web coverage or complete results.

Python tests verify gateway permissions,bounds,token separation,partial/failure behavior and cleanup with fake producers. The container CI job builds the exact pinned image and verifies actual startup/health/source/unauthenticated401 without public-engine queries. Live search must be checked separately after deployment before claiming connection.
