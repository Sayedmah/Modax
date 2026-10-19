# M chat and X work spaces —0.6.0

The physical right rail has M above X. Select a mode to see its conversations;
press the selected letter again to collapse/open the sidebar. M is concise chat.
X uses project-planning instructions and provides actual Coder, Godot and task
history handoffs. Enter a goal in X, choose Build Project, then review the Coder
options and explicitly submit. Project files and validation reports come from
the existing bounded engine, not a claim that every requested project is complete.

Both modes use the selected configured model. The switch changes instructions,
history and workflow, not foundation-model weights or a measured intelligence
score. FAST/SMART/OMEGA remain separate Coder review settings; real extra reviews
still require explicit consent. Unavailable execution workers are not simulated.

Migration6 adds chat_modes without changing existing chat columns. Missing mode
rows/old archives are M. New chat/import/account export and restore preserve M/X.
Mode filtering is owner-scoped; it is a workspace grouping, not a separate account
permission boundary. Existing chat/task tools remain accessible. The same user's
optional notes can be used in both modes. Reload starts at M; select X to reopen
its history. Sign-out/new guest clears private views and search consent.

Memory remains explicit private notes, enabled separately in Settings. Conversation
history is not automatic weight training, and other users' records never become
shared training context. Current hosted storage remains ephemeral until PostgreSQL
is securely bound. Manual archives are not durable hosted storage.

## Search integration

Set server-owned MODAX_SEARXNG_URL to an authorized public HTTPS SearXNG base URL
with JSON enabled. It is disabled by default. No credentials are required by this
adapter; private/credentialed endpoints are not supported. The configured instance
and its upstream engines receive the query; they do not receive session headers,
chat history, notes or attachments from MODAX. Do not send secrets.

Official protocol reference: https://docs.searxng.org/dev/search_api.html
GET /search?q=...&format=json&safesearch=1. Public instances may disable JSON or
require security checks. Do not bypass them or rotate through blocked instances.
The single public candidate search.inetol.net returned a security-check HTML page
on2026-10-19; it was not configured as a working backend. No live web-search success
is claimed. Missing configuration returns503; lack of consent403. Contract tests
use httpx mock transport, never fabricated production search results.

POST /api/v1/research/search accepts query<=240characters and
confirm_external_search=true. It returns at most5unique HTTPS links with bounded
literal title/snippet text; unsafe schemes/private literal hosts are excluded.
No result URL is fetched, no browser actions/scripts are executed. Results are
search snippets, not visited pages or verified facts. HTTPS links open separately
with noopener/noreferrer. Up to2active searches/process,15s total,12s I/O timeout,
256KiB decompressed response limit,50upstream candidates. Redirects are rejected.

The per-message Web checkbox sends just that message as the explicit search query
and resets after use. Search is completed before message/inference reservation;
failure writes no messages and starts no inference. Returned snippets are marked
untrusted in the model context; provider text cannot gain execution privileges.
Actual source URLs are appended to the saved reply even if the model omits them.
The standalone research panel does not call a model or permanently save results.
There is no autonomous general-purpose browser yet, and no promise of searching
every internet source or bypassing access restrictions.
