# Resume

1. Fetch/check out `feat/modax-omega-foundation`; inspect project_state.json, PROJECT_STATE, TEST_REPORT and git status/log. Do not repeat verified modules or assume all master-prompt phases are complete.
2. Python 3.12: venv then `pip install -e '.[dev]'`. Run `python -m pytest -q`, lint, frontend syntax, and the optional Godot test with MODAX_TEST_GODOT set.
3. Start the server from repo root with exactly one worker. Create user through scripts/create_user.py, keep signup disabled unless explicitly demonstrating locally.
4. Recover tasks via persisted BLOCKED state after restart. Read result and workspace files before `/resume`; never rerun a completed task implicitly. Runtime execution remains opt-in and Docker-only.
5. Next exact action: configure authorized local Ollama URL/model; execute an end-to-end real chat and JSON code task; record provider version and actual outputs. If no model service exists, keep demo clearly labeled and proceed to a dedicated Docker validation environment.
6. Review GitHub CI status and draft PR; do not merge/deploy without explicit authorization. No work runs after the assistant turn except explicitly configured application processes/CI.

Current primary blocker is DATABASE_URL binding for the live free Render service. Read current project_state.json; first website and v0.2 APIs are already deployed. Do not recreate resources, rotate MODAX_SECRET_KEY, or repeat verified features. Actual PostgreSQL support passed in CI, but production is not connected. User aborted dashboard sign-in; do not retry credential entry unless user authorizes resuming it. Six daily continuation attempts are configured Oct 14–19.

Milestone0.3: use POST /api/v1/tasks/{id}/start for202 acceptance and GET task for state/steps. Completed tasks cannot restart. FAILED/BLOCKED require explicit resume toREADY first. Active cancelled workers must finish cleanup before resume. FAST default; confirm_external_reviews required for real SMART/OMEGA code tasks. Diagnose Godot through result.failed_stage and result.checks output, never infer a timeout means success.

Optional POST /api/v1/tasks/{id}/project multipart file before start imports source ZIP. GET /api/v1/tasks/{id}/patch exports unified changes vs generator snapshot. Validate with git apply --check in the original source checkout before applying. No external publication is performed by these endpoints.

Managed engine checks only the exact built-in primitive template and run smoke_test.gd directly; imported/custom assets must use full editor-import validation through a suitable operator worker. Do not infer a runtime success means editor import or export succeeded. Token display uses actual completed provider counters; unknown isnull, and no actual billing cost is derived.
