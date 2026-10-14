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

Verified web implementation eb1fd093: GitHub Actions run 38435478287 completed successfully, including genuine PostgreSQL 16 migration/auth/chat/document/task integration. Live Render HTTP checks passed for v0.2 health, encrypted profile create/delete, CSV extraction, demo streaming, Arena scoring, coder completion and ZIP download. Hosted Godot check recorded separately.

Hosted Godot attempt returned FAILED / Command timed out after 75.17 seconds. This is not a passed engine check. Local and CI Godot checks are passed; the live host limitation is separate. Render log lookup returned 503/502 and was unavailable. Generator preserves project files even when hosted validation fails.

Latest web validation: 59 passed and one local PostgreSQL skip; 2 Node session tests passed; nine browser flows passed. PostgreSQL integration separately passed in CI run 38435478287. Live hosted Godot failed at 75.17 seconds with Command timed out; no hosted engine success.

## Milestone 0.3 local execution
71 Python tests passed, 1 skipped (local PostgreSQL connection), 12.12s, with real Godot4.6. Ruff passed. Two Node session regressions passed. Ten Chromium flows passed including background-task acceptance/history; zero page errors. New regressions: timeout retains actual stdout/stage/duration, real subprocess cancellation, duplicate start, owner access, Docker cancellation cleanup retains slots (fake runtime transport; not real Docker), repeated cancellation drain, separate review artifacts, critical finding blocks completion, and changing AUTO provider cannot bypass external review consent. Playwright first CDN download was corrupt; supported fallback downloaded successfully. GitHub run38512131764 and hosted validation pending.

Hosted0.3: Render deploy dep-db7gcre0tbcc73bri4bg live. Background Coder OMEGA demo completed with two clearly-labelled fixed review fixtures. Hosted Godot failed in import after60.082s; engine4.6.stable.official.89cea1439; output only version header. End-to-end probe80.65s includes network/polling, not engine runtime. GitHub run38512131764 successful, both jobs. Verbose instrumentation is next diagnostic step, not a claimed fix.

Source-project milestone:80passed/1 local PostgreSQL skip,12.13s with realGodot; Ruff/Node syntax passed;12browserflows including ZIP import and downloaded patch,zero page errors. Regression for CRLF gitapply failed before fix and passed after. Existing Docker cleanup race guard extended to rollback.
