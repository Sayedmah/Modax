# Current project state

Verified release: 0.3.6 on 2026-10-15
Repository: https://github.com/Sayedmah/Modax
Branch: feat/modax-omega-foundation
Draft PR: https://github.com/Sayedmah/Modax/pull/2
Website: https://modax-omega.onrender.com/
Verified implementation: 5b4212bdc2829c6b0585794bf796ab64997eea0c

The website opens directly into an isolated guest session. Existing chat/history/streaming, owner-encrypted provider profiles, document retrieval, opt-in notes, small Arena checks, source-aware Coder, background tasks/reviews, original seeded Godot Crystal Island and PostgreSQL support remain implemented. OpenRouter free inference was verified on 2026-10-14; no inference was requested in this release. Gemini, paid inference, native builds and media workers remain unverified.

Current increment: Settings restores chat copies directly from account ZIP exports, including into a new guest session. Every chat/message ID is regenerated; existing data is not overwritten. UTF-8/CRLF and message states are preserved, with running responses marked interrupted. Credentials, usage/costs, notes, projects and files are not restored or executed. Validation and writes are bounded/transactional. See CHAT_RESTORE.md for exact limits.

Validation:122 local Python tests passed, 1 PostgreSQL skip in 16.06 seconds with checksum-pinned Godot 4.6; Ruff/JavaScript syntax and2 Node session tests passed.15 normal and6 guest Chromium flows passed with zero errors. CI 38695366873 passed both backend/Godot/browser and genuine PostgreSQL restore jobs: https://github.com/Sayedmah/Modax/actions/runs/38695366873.

Render dep-db87hljrjlhs73cs9vkg is live. Actual hosted export/import across two guests returned 201, preserved text/new IDs, rejected source-owner access 404 and invalid ZIP 422 without partial copies. Probe ZIP 2137 bytes; 55.82 seconds includes auth/export/import/history and network, not model/server inference latency. Probe data and tokens were cleaned up.

Production storage is still local/ephemeral until DATABASE_URL is securely bound. Previously aborted dashboard sign-in must not be retried without user authorization. Guest tokens are browser-session scoped; manual chat restore is not permanent storage or whole-account recovery. Dedicated generated-code runtime, native export/signing and GPU/media workers remain outside this verified release.

Next: explicit opt-in saved-note restoration with its own validation and ownership tests. Read project_state.json before changes. Use [skip render] for docs/state-only checkpoints; code releases still require CI and live verification. No continuous work or complete universal platform is claimed.

