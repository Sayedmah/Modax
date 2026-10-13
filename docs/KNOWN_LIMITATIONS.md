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
