# Executed test report — 2026-10-13

Development environment: Linux, Python 3.12.14, Node 24.19.0, Godot 4.6.stable.official.89cea1439, Playwright 1.55.1 / Chromium 140. Tests used temporary databases and mocked remote providers; no paid inference or GPU calls.

| Check | Actual result |
|---|---|
| `MODAX_TEST_GODOT=... python -m pytest -q` | 46 passed, 9.40 s |
| `python -m ruff check backend tests scripts` | All checks passed |
| `node --check apps/web/app.js` | exit 0 |
| `NODE_PATH=... python scripts/check_ui.py` | passed; no JS page errors |
| Browser flows | signup, streamed DEMO chat, coder files, memory create/delete, mobile overflow, account-switch isolation |
| Godot CLI generator with seed 42 | passed; actual import and smoke exit codes 0, 0 |
| Godot assertions | floor collision, movement, jump, camera, touch actions, collectibles, save/load persistence |
| ComfyUI protocol | submit/status/download, path denial, pending cancellation, active interrupt refusal; mock service only |
| Docker sandbox | disabled/missing-tool behavior and readable staging/immutable-image command contract; no real container run |
| Native / export builds | not run; Flutter/SDK/signing/export templates absent |
| GitHub Actions | implementation commit 417755b passed run 38415160639; Python/Godot, browser QA and generated source artifact all succeeded |

Measured suite wall time is not an inference latency/FPS score. There is no production benchmark or model superiority evidence. Headless assertions do not prove mobile device performance, rendering or real gamepad input.

Independent review found five important defects; regression coverage now rejects truncated/malformed streams, account-switch state leakage and file-count poisoning. Docker readable staging is contract-tested, not daemon-tested. Snapshots bounded to ten. No important reviewer finding knowingly left unresolved.

Master MVP matrix: demo chat/history/model selection/planning/file generation/gameplay/security pass; application-owned GitHub publishing, Docker execution and native/export build acceptance remain blocked or unimplemented. The complete master MVP is not claimed.

Verified CI run: https://github.com/Sayedmah/Modax/actions/runs/38415160639. Documentation-only checkpoints trigger new runs separately.

## Web increment 0.2
Local full run: 59 passed, 1 skipped in 10.90 seconds; skipped check is genuine PostgreSQL because no connection credential is available. Godot 4.6 check ran. Node session regression tests: 2 passed. Browser checks: signup, streaming, coder, notes, mobile, account switching, CSV upload/search, Arena, and preferences all passed with zero page errors. Added CI PostgreSQL 16 service to run migration/auth/chat/doc/task integration separately. Render first deployment is live; final increment and database connection are verified/reported separately.
