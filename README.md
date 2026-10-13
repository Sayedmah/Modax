# Modax — MODAX OMEGA

An implemented local-first foundation for persistent AI chat, bounded software development tasks and original playable Godot project generation. **This is a verified first milestone, not the complete OMEGA roadmap or a trained foundation model.**

## Run locally

Python 3.12 required. From the repository root:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
python scripts/create_user.py
python -m uvicorn modax.api:create_app --factory --host 127.0.0.1 --port 8000 --workers 1
```

Open http://127.0.0.1:8000. Public signup defaults off. For a disposable local demonstration, explicitly export `MODAX_ALLOW_SIGNUP=true`. API docs: http://127.0.0.1:8000/docs. Keep one worker: restart recovery and in-process cancellation currently assume a single instance.

## Working workflows

- Authenticated streaming chat, persisted history and title search, model selection, cancellation and JSON export.
- Explicit DEMO adapter without credentials; server-configured compatible HTTP and Ollama streaming adapters. Real inference is unverified until an authorized service is configured.
- Rule-based structured plans, persisted state transitions, restart recovery and step/audit history.
- Coder JSON edit proposals, Python/JSON syntax checks, bounded project files, ten retained rollback snapshots and source ZIP downloads. Demo coder produces a genuine Python module and unittest file; it is explicitly a deterministic fixture.
- Optional digest-pinned Docker-only runtime tests. Disabled by default and not executed in this development environment.
- Game Forge: original seeded 3D Crystal Island, terrain collision, keyboard/controller/touch controls, third-person camera, twelve collectibles and save/load. Actual Godot 4.6 import and headless gameplay assertions run in tests.
- Owner-controlled notes with edit/delete/export API; notes are not silently sent to providers. Request latency records with honest unknown token/cost fields.
- Optional independent ComfyUI queue transport adapter with submit/status/pending cancellation/media download. Tested with mocks; not connected to the public UI or a GPU worker.

## Provider configuration

Server environment variables are listed in `.env.example` (export them yourself; .env is not automatically loaded). Configure `MODAX_PROVIDER_URL` as an approved compatible base ending in `/v1`, `MODAX_PROVIDER_MODEL` and `MODAX_PROVIDER_KEY`, or `MODAX_OLLAMA_URL` and `MODAX_OLLAMA_MODEL`. Remote addresses require HTTPS; loopback development addresses allow HTTP. No key appears in browser responses. AUTO selects a configured real text provider before demo; it is not a measured capability-ranking system yet.

## Generate a game directly

```bash
python scripts/generate_game.py /tmp/modax-island --seed 42 --godot /path/to/godot
```

Open the output's project.godot in Godot 4.6. Export presets are configuration only: matching engine templates and platform SDK/signing are still needed. Generated worlds use original procedural geometry, not Genie/Muse model weights.

## Verify

```bash
python -m pytest -q
python -m ruff check backend tests
node --check apps/web/app.js
MODAX_TEST_GODOT=/path/to/godot python -m pytest -q
```

The optional engine test skips unless MODAX_TEST_GODOT is set. Read [TEST_REPORT](docs/TEST_REPORT.md), [KNOWN_LIMITATIONS](docs/KNOWN_LIMITATIONS.md), [REFERENCE_PROJECT_AUDIT](docs/REFERENCE_PROJECT_AUDIT.md) and [RESUME_INSTRUCTIONS](docs/RESUME_INSTRUCTIONS.md). Docker Compose configuration is provided; Docker itself has not been available to verify an image build. Native Flutter/Windows/Android/iOS clients are not built in this milestone. The present client is a web operator console.
