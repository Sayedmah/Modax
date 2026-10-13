# MODAX OMEGA foundation design

The supplied master prompt is the product brief. This milestone delivers a working local-first vertical slice rather than claiming the entire roadmap. Existing main contains README only at bb0295d55483a9e1733fdc09399058afd3979534. Other remote branches are not merged or rewritten.

## Architecture
FastAPI serves an Arabic/English adaptive web operator console and versioned API. SQLite migrations hold users, hashed sessions, chats/messages, tasks/steps, memory, assets, usage and audit events. All resource lookups are scoped to the authenticated owner. Provider registry advertises only configured capabilities. A clearly marked demo adapter works without credentials; compatible HTTP and Ollama adapters use server-side configuration, never client keys.

## Workflows
Chat writes user and assistant records, streams provider deltas using SSE, persists terminal status, and reports interrupted/failed generations. Tasks use explicit transitions and restart recovery. Coder requests JSON files from a provider, rejects path escape, secrets, symlinks and oversized edits; Python parsing verifies syntax without executing generated code. Execution of untrusted tests is Docker-only, disabled by default, with no network, read-only root, process/memory/CPU limits and bounded output. No host-shell endpoint exists.

Game Forge generates a deterministic original Godot 4.x third-person island with collision, collectible crystals, keyboard/controller/touch controls, save/load and headless smoke tests. This is a fixed template parameterized by seed/title, not unconstrained game synthesis. Game validation is reported separately from export. No APK/IPA is claimed without SDKs/templates/signing.

## Security and scope
Password hashing uses scrypt; random expiring tokens are stored hashed and provided in Authorization headers. Disable public signup unless explicitly configured. Demo mode is never advertised as real AI. Per-user workspace quotas; secrets never stored in project memory. Remote model addresses are operator-configured, not request-controlled. API quotas and strict body limits. No paid calls, training, GPU generation or deployment in this milestone. ComfyUI is an optional queue adapter tested against transport mocks, not a claimed generated image/video.

## Verification
API integration tests with temporary databases; adversarial authorization/path tests; mocked HTTP protocol contracts; migration/restart/stream cancellation tests; actual Godot import and gameplay assertions if engine acquisition succeeds; frontend syntax and browser checks where tooling exists. CI mirrors reproducible checks.
