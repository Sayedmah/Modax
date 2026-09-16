# MODY Game Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add New Chat plus the first safe, testable MODY Game Studio workflow for planning and eventually building playable Godot games.

**Architecture:** Extend the existing MODY web client with isolated chat sessions and a Game Studio workspace. Extend the Node backend with focused Game Studio endpoints and a Godot worker contract; only verified worker exports may become playable previews.

**Tech Stack:** Vanilla HTML/CSS/JS web client, Node.js backend, existing provider adapters, Godot worker contract, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-16-mody-game-studio-design.md`

## Global Constraints
- Provider API keys remain server-side environment secrets.
- Never claim a generated game is playable until a real Godot validation/export succeeds.
- New Chat preserves old chat history and creates an isolated message session.
- Mobile layout must remain usable at 320 CSS px.
- Generated project paths must reject absolute paths and `..` traversal.

---

### Task 1: Chat sessions and New Chat

**Files:**
- Modify: `index.html`
- Create: `tests/web-chat-state.test.mjs`

**Interfaces:**
- Produces: `createChat(title)`, `selectChat(id)`, `appendChatMessage(id,message)` browser-state behavior.

- [ ] **Step 1: Write failing state tests** covering creation of two independent chats and preservation of the first chat's messages.
- [ ] **Step 2: Run** `node --test tests/web-chat-state.test.mjs` and verify failure before implementation.
- [ ] **Step 3: Implement** a New Chat button, chat ids using `crypto.randomUUID()` with timestamp fallback, history rendering, and per-chat messages persisted locally for the demo.
- [ ] **Step 4: Run** `node --test tests/web-chat-state.test.mjs` and verify pass.
- [ ] **Step 5: Commit** `feat: add isolated MODY chat sessions`.

### Task 2: Game Studio workspace UI

**Files:**
- Modify: `index.html`
- Create: `tests/game-studio-ui.test.mjs`

**Interfaces:**
- Consumes: active chat state from Task 1.
- Produces: game brief fields `title`, `dimension`, `genre`, `targets`, `idea`; project status rendering.

- [ ] **Step 1: Write failing UI contract tests** asserting Game Studio navigation, brief controls, Plan/Files/Build/Play states, and disabled Play without an artifact.
- [ ] **Step 2: Run** `node --test tests/game-studio-ui.test.mjs` and verify failure.
- [ ] **Step 3: Implement** responsive Game Studio cards and project workspace; keep Play disabled with an explicit reason until `previewUrl` is verified.
- [ ] **Step 4: Run** the UI tests and syntax check embedded JavaScript.
- [ ] **Step 5: Commit** `feat: add MODY Game Studio workspace`.

### Task 3: Game plan backend contract

**Files:**
- Modify: `backend/server.mjs`
- Create: `backend/game-studio.mjs`
- Create: `tests/game-studio-api.test.mjs`

**Interfaces:**
- Produces: `POST /v1/game-studio/plan` accepting `{provider,model,brief}` and returning `{projectId,plan,status:"planned"}`.
- Produces: `validateBrief(brief)` and `buildDirectorPrompt(brief)`.

- [ ] **Step 1: Write failing API tests** for missing fields, valid 2D/3D briefs, provider failure propagation, and structured-plan validation.
- [ ] **Step 2: Run** `node --test tests/game-studio-api.test.mjs` and verify failure.
- [ ] **Step 3: Implement** strict brief validation and a Game Director prompt requesting JSON fields: `game`, `coreLoop`, `scenes`, `systems`, `controls`, `milestones`, `acceptanceTests`.
- [ ] **Step 4: Parse and validate** the provider response; reject malformed plans instead of presenting invented project state.
- [ ] **Step 5: Run tests** and commit `feat: add Game Studio planning API`.

### Task 4: Godot worker safety contract

**Files:**
- Create: `backend/godot-worker.mjs`
- Create: `tests/godot-worker.test.mjs`

**Interfaces:**
- Produces: `validateProjectPath(path): string`, `validateManifest(files): Array<{path,content}>`, `buildRequest(projectId,files): object`.
- Future worker result: `{status:"passed"|"failed", diagnostics:[], previewUrl?:string, artifactVersion?:string}`.

- [ ] **Step 1: Write failing tests** rejecting `/etc/passwd`, `C:\\...`, `../secret`, empty paths, oversized manifests, and duplicate paths; accept `project.godot`, `scenes/main.tscn`, `scripts/player.gd`.
- [ ] **Step 2: Run** `node --test tests/godot-worker.test.mjs` and verify failure.
- [ ] **Step 3: Implement** pure validation functions with no shell execution in the public API process.
- [ ] **Step 4: Run tests** and verify all safety cases pass.
- [ ] **Step 5: Commit** `security: define isolated Godot worker contract`.

### Task 5: Wire Game Studio to MODY providers

**Files:**
- Modify: `index.html`
- Modify: `backend/server.mjs`
- Test: `tests/game-studio-api.test.mjs`

**Interfaces:**
- Consumes: `/v1/models`, `/v1/game-studio/plan`.
- Produces: visible planned/error states; never a fake build-success state.

- [ ] **Step 1: Add failing integration tests** for provider/model selection and plan errors.
- [ ] **Step 2: Run tests** and confirm failure.
- [ ] **Step 3: Implement** Create Game Plan from the Game Studio brief using the selected real model; display structured milestones and systems.
- [ ] **Step 4: Verify** offline/demo mode labels planning as unavailable rather than generating a fake Godot project.
- [ ] **Step 5: Run all tests** with `node --test tests/*.test.mjs` and commit `feat: connect Game Studio to MODY AI`.

### Task 6: Verified Play Preview integration boundary

**Files:**
- Modify: `index.html`
- Modify: `backend/godot-worker.mjs`
- Test: `tests/godot-worker.test.mjs`

**Interfaces:**
- Consumes future trusted worker result.
- Produces Play enabled only for `status === "passed"` plus an allowed HTTPS preview artifact URL.

- [ ] **Step 1: Add failing tests** proving failed/unverified results cannot enable Play.
- [ ] **Step 2: Implement** result validation and preview-state rendering.
- [ ] **Step 3: Run tests** and confirm pass.
- [ ] **Step 4: Document** that actual Godot export requires deployment of a worker with a pinned Godot engine; do not mark this integration complete until CI executes a real export.
- [ ] **Step 5: Commit** `feat: gate Play on verified Godot exports`.

### Task 7: Full verification and review

**Files:**
- Review all files changed above.

- [ ] **Step 1: Run** `node --check backend/server.mjs` plus checks for all new `.mjs` modules.
- [ ] **Step 2: Run** `node --test tests/*.test.mjs`; expected: all pass.
- [ ] **Step 3: Review mobile CSS** for 320/390/768 px breakpoints and ensure New Chat/Game Studio primary controls are reachable without horizontal overflow.
- [ ] **Step 4: Review security invariants**: no provider key in frontend, no arbitrary shell/path execution, no unverified Play state.
- [ ] **Step 5: Open a PR** summarizing implemented features, tests actually run, and remaining Godot-worker deployment requirement.