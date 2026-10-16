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
