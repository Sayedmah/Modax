# Current limitations — hosted web v0.2

- Live website: https://modax-omega.onrender.com/. This free Render service is a preview, not a complete production platform.
- PostgreSQL support passed genuine PostgreSQL 16 CI tests. Render database modax-omega-data exists but DATABASE_URL remains unbound because secure dashboard sign-in was aborted. Hosted account/document/project records are currently local and ephemeral across sleep/redeploy. Free database expiry: 2026-11-12.
- Per-owner compatible/OpenAI and Anthropic profile keys are encrypted. No real inference key was supplied or used by development checks; default DEMO is a deterministic adapter. No frontier-equivalence claim.
- PDF/DOCX/XLSX/CSV/text parsing and chunk search are implemented. Scanned PDF OCR, image vision, vector indexing and full learning workflows remain absent.
- Coder has two bounded observed-error syntax repair attempts and database-backed files/snapshots. Actual Docker runtime, internal GitHub publishing and full multi-agent execution are not verified/implemented.
- Arena runs three real smoke cases with objective scoring. It is not a comprehensive intelligence leaderboard or weight training.
- Original Godot project passes local and CI gameplay checks. The live Render engine check failed: Command timed out after 75.17 seconds. Project files remain generated/downloadable, but hosted gameplay/export success is not claimed. Render logs were unavailable (503/502). Diagnose bounded process/host resources before another attempt.
- No real image/video GPU worker or generated media, trained foundation model, native Flutter client, Windows installer, APK or IPA is delivered.
- Six daily continuation attempts are configured Oct 14–19 around 09:00 Africa/Cairo. Availability of tools governs execution; this is not continuous development or a guaranteed six-day completion.

### Milestone 0.3 boundaries
Background jobs use one application process, not a distributed/durable worker scheduler. Restart interrupts active work; recover() marks interrupted persisted tasks BLOCKED. Free-host ephemeral storage remains a blocker. SMART/OMEGA code reviews use separate prompts against the same selected provider; this does not provide independent model diversity. Demo approvals are fixed fixtures, not real assessments. A review is advisory and cannot replace runtime tests. Up to three generation calls and two reviews; token costs unknown unless provider supplies usage. No full planning/repair of reviewer findings yet; rejected artifacts remain BLOCKED for review.

Hosted Godot stall located at import, not download/version or gameplay. Root cause still unconfirmed; bounded verbose logs will identify initialization progress. Do not label hosted GameForge validated yet.

Project import accepts a small source subset, not arbitrary repositories, binaries/dependencies or git credentials. Invalid Python/JSON source currently rejected by syntax validation during import. Patches compare current task files against latest generation snapshot; manual review is required. No server GitHub OAuth/push integration exists yet.

Hosted editor import is still not validated; verbose showed cold editor help-cache preparation. The managed primitive template can be checked without editor import, while future imported assets require a suitable worker. API token counters are provider-reported completed counts, not verified invoices; Anthropic cached token breakdown and all dollar costs are not yet recorded. Non-OpenAI compatible APIs are not forced to accept stream_options; reported usage is parsed if present. Paid inference remains unverified.

Final0.3.2: hosted exact-template gameplay IS verified. Earlier hosted editor-import failures remain historical and apply to full editor/imported assets. Native export still not attempted. Production data is still ephemeral until DATABASE_URL securely bound.

Account export is private unencrypted data; keep it securely. It exports extracted document text, not original PDF/DOCX/XLSX binaries, and omits rollback snapshots/credentials. Bounded chat restoration and separately confirmed note restoration are available in Settings; whole-account restore and restoration of other collections are not implemented. Imports create new copies and can reject large archives explicitly; see CHAT_RESTORE.md and NOTE_RESTORE.md. Note restoration never changes memory-context preferences. Database binding remains blocked; export/restore is not permanent server storage.

2026-10-16 hosted verification: source0.4.0 CI and actual API note semantic checks passed, but direct remote HTML/browser checks from this runner returned502/timeout/ERR_EMPTY_RESPONSE. Render's own root probe200 does not establish client browser success. Root cause is undetermined. Fixture cleanup was incomplete after a harness status error and subsequent transport failure; three harmless synthetic notes remain in isolated disposable guest workspaces, not user accounts. No credentials or user data were included.

2026-10-17 update:0.4.1 local/CI/PostgreSQL and hosted API deletion checks passed; CURRENT probe cleanup succeeded and rootHTTP200. Prior note-probe cleanup is historical and not claimed repaired. Hosted browser remains unverified: direct ERR_EMPTY_RESPONSE; using the configured proxy yields certificate-trust failure. TLS checks were not bypassed; do not infer invalid public-site TLS from the runner's trust error. Deleting a document is permanent for its stored text/chunks, not transcript/provider/external-export erasure.

## 2026-10-18 — Arena datasets0.5.0

Implemented owner-only immutable datasets (20/owner,10cases,32KiB), exact/finite canonical-JSON grading, content SHA-256 versions and retained run snapshots. Added real create/select/JSON-export/delete controls, additive migration5, account ZIP inclusion,180s run budget/per-process concurrency gate and100run quota. External-model consent is checked before inference; no dataset code executes and expected answers are not sent in prompts. See ARENA_DATASETS.md for limits and retention.

151localPythonpassed/1localPGskip20.04s with actual Godot4.6; Ruff/JS passed;6Node regressions passed after fixing stale release badge. Normal15+6notes+7files+5Arena and guest6+6notes+7files+5Arena flows passed with mobile overflow check and zero page errors. Isolated smoke servers avoid accidental120rpm fixture exhaustion without weakening production limits. Feature77bb5c7 CI39105168962 both jobs passed, including real PostgreSQL restart/isolation/export/retention.

Hosted0.5.0 API create201,foreign404,external-consent403,explicit DEMO score0 and snapshot retention passed. Probe51.38s includes network/auth/cleanup,not model latency. Source fixture deleted and two sessions revoked; one harmless evaluation remains intentionally. Cloud browser opened direct guest/Arena UI without login/TLS bypass; two extension-origin metadata errors only. Follow-up5dcb5e0 binds the visible release badge to health rather than stale v0.3.6. No paid inference/training/services or credential changes.

Remaining: ephemeral production storage until secure PostgreSQL binding; Gemini/real GPU media/native/dedicated Docker unverified. Next: owner-scoped evaluation-history export/delete with retention-aware confirmation and quota tests. This is not a complete platform or general-intelligence benchmark.

## 2026-10-19 — M/X workspaces0.6.0

Implemented physical-right M/X rail, collapsible mode sidebar, separate owner-scoped chat histories and preserved archive modes. M uses concise instructions; X plans projects and hands off real goals to existing Coder/Godot/task tools. Additive migration6 keeps chat columns intact. Optional private notes remain user-controlled; there is no automatic cross-user learning/weight training or guarantee of complete arbitrary projects.

Implemented explicit-consent SearXNG protocol, standalone research and optional per-message snippets with saved source URLs.5unique HTTPS links,256KiB,15s total,2active slots; no result-page fetch or remote scripts. Real search remains UNCONFIGURED: one public candidate returned security-check HTML, not JSON. No bypass, live search success, paid calls/new resources or secret changes are claimed. See WORKSPACE_MODES.md.

Local full157passed/1PGskip158.89s with Godot4.6 preceded one added search-gate regression; final focused7passed8.69s. Normal15+6notes+7files+5Arena+6modes and guest6+6notes+7files+5Arena+6modes passed,zero page errors,320/390/768/1440 rail checks.8Node regressions passed, including late chat-load and owner search-consent reset. Final focused browser additionally checks LTR while the rail stays right.

Real PostgreSQL CI exposed IndeterminateDatatype for the optional IS NULL parameter; explicit CAST AS TEXT fixed it. Source6dae7353 CI39238702549/39238695865 passed both jobs (backend158passed/1skip27.24s,realPG successful). Final UI correction adds LTR content direction and guards chat creation/stream finalization before mode switching. Earlier normal browser run exposed the timing race rather than a model failure.

Hosted feature e98aef3 direct guest M/X UI and0.6.0 API passed: histories separated,foreign404,explicitDEMOstream,search403withoutconsent/503unconfigured. Whole probe110.73s includes network/auth/cleanup,not LLM latency; test chats deleted and sessions revoked. Production storage still ephemeral. Final UI-fix CI/deploy proof is recorded in project_state.json after verification. Next: authorized SearXNG connection and actual grounded search; Arena history lifecycle remains pending.

Final0.6.0 sourcefc19eb827f2baccc3e8b6296415e56104dd0914f: CI39239307570/39239301841 success,both jobs; backend158passed/1PGskip20.88s and8Nodepassed,actual PostgreSQL job passed. Normal+guest mode UI including LTR passed. Render dep-dbav7svlk1mc73da026g live; cloud browser actual LTR/right rail verified; recent runtime error logs empty. Source previous successful PG fix6dae7353 remains ancestor. Live search stays unconfigured; no new inference/training/service/secret change. CI:https://github.com/Sayedmah/Modax/actions/runs/39239307570

## 2026-10-19 — single HTML Forge0.6.1

Added sidebar/X HTML creation form,configured-model selector,background task kind html and direct index.html download/history action. One90s generation call,64KiB source,strict JSON/basic document structure and likely-secret rejection before saving. No generated scripts execute on host/client. Attachment is octet-stream/filename index.html/nosniff/no-store/restrictive sandbox CSP; middleware preserves route-specific restrictive CSP. Existing workspace storage/snapshots/ZIP/account export support .html; imported Coder ZIP subset is unchanged. FAST only; execute=true rejected before claim. See HTML_FORGE.md.

Local168passed/1PGskip96.74s preceded one added case; final focused11passed5.21s,Ruff/JS/8Nodepassed. Normal/guest5HTML checks each passed,including actual download bytes/history/reload/320px. Exact source0fb1b68e6df073c6e84a1d58c56e5e00e683de60 CI39243436830 passed169tests/1backendPGskip21.71s plus genuine separate PostgreSQL,including HTML persistence across restart/owner404/account export. Full browser normal44/guest35flows passed. https://github.com/Sayedmah/Modax/actions/runs/39243436830

Existing free Render dep-dbavo01srm7s73atjlrg live; cloud guest UI0.6.1 HTML form verified. Actual configured openrouter/free non-demo generation COMPLETED; downloaded417bytes/HTTP200/requested marker,foreign-owner404,scripts_executed=false. Provider reported130input/239output tokens; cost/resolved weights unknown. Whole probe70.08s includes network/auth/polling/download/cleanup,not model latency. Both sessions revoked; one harmless private synthetic task/file remains(no task deletion API). No paid model/service/new resources/training/key changes.

Basic structure validation is not JavaScript/CSS/browser/security validation; generated pages are untrusted and never previewed inline. Production storage still ephemeral. Live SearXNG remains unconfigured. Next: resume authorized search connection; task/Arena history deletion remains pending.
