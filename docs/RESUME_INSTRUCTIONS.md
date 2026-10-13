# Resume

1. Fetch/check out `feat/modax-omega-foundation`; inspect project_state.json, PROJECT_STATE, TEST_REPORT and git status/log. Do not repeat verified modules or assume all master-prompt phases are complete.
2. Python 3.12: venv then `pip install -e '.[dev]'`. Run `python -m pytest -q`, lint, frontend syntax, and the optional Godot test with MODAX_TEST_GODOT set.
3. Start the server from repo root with exactly one worker. Create user through scripts/create_user.py, keep signup disabled unless explicitly demonstrating locally.
4. Recover tasks via persisted BLOCKED state after restart. Read result and workspace files before `/resume`; never rerun a completed task implicitly. Runtime execution remains opt-in and Docker-only.
5. Next exact action: configure authorized local Ollama URL/model; execute an end-to-end real chat and JSON code task; record provider version and actual outputs. If no model service exists, keep demo clearly labeled and proceed to a dedicated Docker validation environment.
6. Review GitHub CI status and draft PR; do not merge/deploy without explicit authorization. No work runs after the assistant turn except explicitly configured application processes/CI.
