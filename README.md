# Modax — MODAX OMEGA

An implemented local-first foundation for persistent AI chat, bounded software development tasks and original playable Godot project generation. **This is a verified first milestone, not the complete OMEGA roadmap or a trained foundation model.**

## Hosted website

Chat archives can be restored from Settings into the current guest session as new copies. This chat-only operation does not restore keys, projects or notes. See [chat restore limits and workflow](docs/CHAT_RESTORE.md).

Saved notes have a separate, explicitly confirmed restore button. Restoration never changes memory-context preferences or restores provider keys. See [note restore limits and workflow](docs/NOTE_RESTORE.md).

Document deletion requires UI confirmation and atomically removes extracted text/search chunks. Previous chat transcripts and already-sent provider context are not erased. See [document deletion and reference retention](docs/DOCUMENT_DELETION.md).

Model Arena supports private immutable JSON datasets, content-versioned result snapshots and bounded exact/JSON output grading. External models require explicit consent; datasets never execute code. See [custom Arena datasets and limits](docs/ARENA_DATASETS.md).

The current Render service is https://modax-omega.onrender.com, deployed from the development branch. This is a free preview, not a production release. PostgreSQL was created but its connection secret could not be bound because dashboard sign-in was not completed. Until DATABASE_URL is configured, hosted account data uses local ephemeral storage and can be lost on sleep/redeploy. Do not treat it as durable production storage.

### Added in web milestone 0.2

Encrypted per-owner provider profiles for compatible/OpenAI endpoints and Anthropic; no keys returned to clients. Configure an actual provider in Settings to use real AI (provider API billing applies). PDF/DOCX/XLSX/CSV/text extraction in a bounded subprocess, chunk search, referenced attachments, opt-in user notes, chat import/edit/delete APIs, safe Markdown/code blocks, a three-case objective Arena and prompt-template comparisons, two bounded syntax-repair attempts, transactional daily chat quotas, PostgreSQL support and database-backed project files/snapshots. These are system capabilities, not trained weights or evidence of equivalence to frontier/world models.

A six-run daily continuation automation is configured for October 14–19, 2026 at approximately 09:00 Africa/Cairo. Scheduled runs depend on the execution tools available at that time and are not continuous work or a guaranteed completion deadline.

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
- Owner-controlled notes with edit/delete/export API; notes are only sent when explicitly enabled. Request latency records with honest unknown token/cost fields.
- Optional independent ComfyUI queue transport adapter with submit/status/pending cancellation/media download. Tested with mocks; not connected to the public UI or a GPU worker.

## Provider configuration

Server environment variables are listed in `.env.example` (export them yourself; .env is not automatically loaded). Configure `MODAX_PROVIDER_URL` as an approved compatible base ending in `/v1`, `MODAX_PROVIDER_MODEL` and `MODAX_PROVIDER_KEY`, or `MODAX_OLLAMA_URL` and `MODAX_OLLAMA_MODEL`. Remote addresses require HTTPS; loopback development addresses allow HTTP. No key appears in browser responses. AUTO selects a configured real text provider before demo; it is not a measured capability-ranking system yet.

## Generate a game directly

```bash
python scripts/generate_game.py /tmp/modax-island --seed 42 --godot /path/to/godot
```

Open the output's project.godot in Godot 4.6. Export presets are configuration only: matching engine templates and platform SDK/signing are still needed. Generated worlds use original procedural geometry, not Genie/Muse model weights.

## Verify

Create HTML generates a single downloadable `index.html` through a configured
model or explicit DEMO fixture, with basic structure checks and no script execution.
See [HTML Forge](docs/HTML_FORGE.md) for API, limits and download behavior.

M/X workspaces: M is concise chat; X provides project planning and actual Coder,
Godot and history actions. Each mode has separately filtered private conversations.
The switch does not train weights or promise complete arbitrary projects.
Optional SearXNG search needs an authorized JSON-enabled instance; production
search is currently unconfigured. See [workspace modes and search](docs/WORKSPACE_MODES.md).

```bash
python -m pytest -q
python -m ruff check backend tests
node --check apps/web/app.js
MODAX_TEST_GODOT=/path/to/godot python -m pytest -q
```

The optional engine test skips unless MODAX_TEST_GODOT is set. Read [TEST_REPORT](docs/TEST_REPORT.md), [KNOWN_LIMITATIONS](docs/KNOWN_LIMITATIONS.md), [REFERENCE_PROJECT_AUDIT](docs/REFERENCE_PROJECT_AUDIT.md) and [RESUME_INSTRUCTIONS](docs/RESUME_INSTRUCTIONS.md). Docker Compose configuration is provided; Docker itself has not been available to verify an image build. Native Flutter/Windows/Android/iOS clients are not built in this milestone. The present client is a web operator console.

## Files and Sandbox (0.6.4)

Use Sandbox in the website to upload UTF-8 Python source or a source-only ZIP,save/download exact files and receive a JSON verification report. Coder/history also offer individual file attachments and reports. Supported runtime is standard-library Python unittest on a separate authenticated Docker worker; network-disabled,non-root,read-only and bounded. Actual container and API-to-worker integration are tested in dedicated CI. Public Render execution is not enabled until an authorized dedicated worker is connected; it records BLOCKED rather than executing on the website host. See [Sandbox setup and limits](docs/SANDBOX.md). No paid runtime is created automatically.
