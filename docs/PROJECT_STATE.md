# Current project state

Release: 0.6.3, 2026-10-19
Repository: https://github.com/Sayedmah/Modax
Branch: feat/modax-omega-foundation
Draft PR: https://github.com/Sayedmah/Modax/pull/2
Website: https://modax-omega.onrender.com/
Verified source: 4b2b08d4f00a2350c862baf540ec005946370ca9

An independent free SearXNG service is deployed and connected through server-only matching tokens. Actual Python and Arabic Cairo searches returned HTTP200, five source links each, partial=true and two unavailable engines. Cloud browser also verified Python documentation and Arabic results, with an explicit partial-result warning. Search remains opt-in: no-consent403 and unauthenticated private gateway401 were verified. Only the query is sent to search, not conversation history/notes. Snippets are untrusted and result pages are not fetched.

The pinned upstream2026.10.17 image/source and AGPL service license are recorded in deployment/searxng/README.md and LICENSE. Gateway enforces token authentication, bounded queries/responses, two active calls and30requests/minute. Real container build/readiness/source/auth passed CI39276320489. Main CI39276320379 passed backend/Godot, real PostgreSQL,8Node and full normal51/guest42 browser flows. Local176passed/1PGskip24.05s with Godot4.6; four new gateway/transport tests,Ruff/JS/shell checks passed. Local full normal/guest browser flows also passed.

Initial live search failed: Brave did not respond and upstream defaults had disabled Bing/Mwmbl. Explicitly enabling Bing/Mwmbl restored real results without bypassing engine safeguards. Some engines still fail; no full-web coverage claim. Initial main CI39275224662 failed because the note-restore UI test navigated before logout finished; the test now waits for the auth view. Final full CI passed; the original failure is retained as evidence.

Free search service srv-dbb34k3bc2fs73dbt5o0 is live on dep-dbb37vbbc2fs73dc7gbg. Existing MODAX service srv-db75ucmi0phs738mfg6g is live on dep-dbb37u67bikc73f8nc50, same source. Only search service/configuration was added; existing providers and other services were preserved. Search auto-deploy is disabled; manually deploy its future source changes. No paid inference/service/training. Free services sleep and share limited hours; cold-start requests may time out. No keep-alive scheduler exists.

Measured live API searches13.53s/13.58s include proxy/network and are not isolated engine or model benchmarks. Probe created no chat/file/note records. A deployment invalidated the first disposable session; the successful search harness subsequently attempted logout but incorrectly parsed its empty response as JSON. No cleanup verification is inferred from that harness. A separate fresh-session lifecycle probe correctly observed logout204 and subsequent authenticated request401. Browser guest holds only harmless query inputs, no chat.

Existing0.6.2 identity/starters/model labels,0.6.1 HTML Forge and M/X workflows remain verified in regression CI. Gemini remains disabled after prior failed inference; OpenRouter AUTO remains configured. Production DATABASE_URL is still unbound/SQLite ephemeral; the warning and export controls remain. No GPU/native/custom editor import/weight training or autonomous cross-user learning is claimed.

Next: owner-scoped Arena evaluation-history JSON export/delete and quota recovery. Preserve working search and providers. Keep main unchanged and PR draft. Docs-only checkpoints use [skip render].
