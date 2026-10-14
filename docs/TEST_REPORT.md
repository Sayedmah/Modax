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

Milestone0.3.2 tests cover same-provider concurrent usage isolation, persisted reported chat counters, Anthropic cumulative usage/Ollama terminal counts, malformed/partial usage unknown, managed exact-template tamper rejection, mandatory gameplay marker and cancelled download cleanup. Local fresh primitive runtime completed with actual GAMEPLAY_CHECKS_PASSED in3.967s without editor import. Hosted0.3.1 ZIP upload201, CoderCOMPLETED, downloadedpatch314bytes; hosted editor import still timedout60.035s, whole probe74.84s. GitHub run38513080033 successful on2861275. Final0.3.2 CI/live evidence pending.

Final verification:93Pythonpassed/1localPostgreSQLskip in12.98s. GitHub Actions38514227710 succeeded for e98ec2 (both PostgreSQL and backend/Godot/browser). Hosted0.3.2 exact primitive game completed, engine4.6.stable.official.89cea1439, gameplay process5.8s, whole HTTP probe20.24s including network/polling. Actual marker:GAMEPLAY_CHECKS_PASSED: collision movement jump camera touch collect save load. Import not required for exact primitive template; full host editor import remains blocked and exports not attempted.

## Account export 0.3.3
Executed local suite100passed/1PostgreSQLskip in13.64s with real Godot4.6. New7tests cover owner isolation across chats/notes/tasks/source, credential exclusion, exact CRLF, limits and gate recovery, consistent read-only snapshots during writes, concurrency bounds, SQL interruption and bounded PostgreSQL cursor transport. PostgreSQL CI test now checks actual exported documents/task counts. Browser13flows pass with zero page errors, including downloading and reading the export manifest. Ruff/JSsyntax/Node2 regressions passed. CI/live new release pending; no paid inference performed.

Final0.3.3 verification: CI38526383889 success on32566b3673a17c26bf3ad4a29f40ecd04e8700de, including actual PostgreSQL export. Render dep-db7ikkijnfac73db4dj0 live. Hosted account export checked with one message/one note: valid ZIP2222bytes, HTTPprobe2.72s; authentication token absent and account fields onlyid/username. No live inference or paid services invoked. Checkpoint next step: bounded chat re-import while secure PostgreSQL binding remains blocked.
# Gemini/OpenRouter0.3.4 validation

107Python tests passed,1PostgreSQL test skipped locally,14.50s with Godot4.6. Ruff and JavaScript syntax passed;2Node state tests passed;14Chromium flows passed with zero page errors, including named-provider endpoint selection. Seven mock transport/API tests cover streaming text/usage, pinned endpoints, encrypted profiles, owner isolation, server registration and sanitized failures. No actual provider inference or paid request occurred. CI38583462449 passed both jobs on ac73bddf9a3932e5d9df288746e1ac514e679437. Render dep-db7pbavavr4c73fjidl0 live; hosted health0.3.4 and provider UI verified.

# Configured OpenRouter and API controls

Implementation117df3efca36d57995b7eca86cde8b87d8a9b9c4:107local tests passed/1PostgreSQLskip in13.83s; Ruff/JS and2Node tests passed;14browser flows passed with zero errors, including the header shortcut and active Settings navigation. CI38585205403 passed both jobs. Hosted button present; authenticated registry model openrouter/free; real text fixture completed with11characters and expected marker, done event and no error. Message/history probe18.74s including network. Probe chat removed and session logged out. Authorized key stays in Render; no paid model inference. Gemini real inference still unverified.

# Guest entry0.3.5

110Python tests passed/1local PostgreSQLskip in30.99s with Godot4.6; Ruff/JS syntax and2Node session regressions passed.14existing browser flows and5new guest flows passed with zero page errors. New backend tests cover disabled access, ownership isolation, revocation and rate limits. Browser checks cover direct entry, streaming, reload, separate guests and New Session. A real short-height sidebar scrolling bug was reproduced and fixed. Parameterized guest capacity query avoids PostgreSQL placeholder ambiguity; targeted3tests passed/1skip, and genuine PostgreSQL guest checks passed in CI38619242431. Both CI jobs passed on d99b01d3d045de11c9d5c5086a61c74126fb11b0. Hosted0.3.5 health, guest201, ownership404, signup403 and session revocation verified. Direct remote Chromium transport returned ERR_EMPTY_RESPONSE from this runtime; hosted HTTP validation passed, browser UI validated locally/CI. No paid inference.

