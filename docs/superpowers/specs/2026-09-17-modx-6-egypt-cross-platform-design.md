# MODX 6 Egypt — Cross-Platform AI Studio Design

Date: 2026-09-17
Status: Proposed for implementation

## 1. Product identity

Name: **MODX 6 Egypt**

Goal: one lightweight AI creation application with the same user-facing capabilities on Windows, macOS, Linux, Android, and iOS. The user should be able to create games, generate/edit video, learn with an adaptive tutor, and use a browser agent from any supported device.

The execution location may differ by device, but the UI, project model, commands, and results remain consistent.

## 2. Core product principle

MODX 6 Egypt uses a unified **Execution Fabric**. Every task is described once, then a capability router chooses one of three execution targets:

1. **Local** — run directly on the current device when supported and efficient.
2. **Paired Device** — run on another registered desktop owned by the same user.
3. **Cloud Worker** — run on a managed worker when local execution is unavailable or too heavy.

The default UX hides this complexity. Advanced settings may expose the selected execution target and allow manual override when available.

## 3. Platform strategy

### Shared app shell

Use **Flutter** for the primary UI across:

- Windows
- macOS
- Linux
- Android
- iOS/iPadOS
- optional web companion later

### Shared native core

Use **Rust** for the shared native core and bridge it to Flutter. The Rust core owns:

- capability detection
- task dispatch
- device pairing
- local file/project operations
- local process execution on desktop
- secure transport
- local cache
- background task coordination
- permission mediation

Platform-specific adapters provide OS-native capabilities and enforce OS permissions.

## 4. Product modules

### 4.1 Game Studio

Purpose: create, inspect, modify, repair, build, and test game projects.

Engine support roadmap:

- Godot first-class support from V1
- Unity support after Godot workflow is stable
- Unreal Engine support after Unity workflow is stable

Godot workflow borrows architectural ideas from `Godot4-Addons/ai_assistant_for_godot`:

- project context indexing
- file mentions/context injection
- agentic tool loop
- patch/apply workflow
- undo/approval model
- loop guards
- permission manager

MODX does not copy provider-key handling from that plugin. Provider keys remain in the MODX backend for managed SaaS use.

Desktop Local Agent may:

- detect installed engines
- open projects
- read/write project files within approved roots
- run engine CLI commands
- run tests/builds
- collect diagnostics
- return artifacts/logs to the app

Mobile apps expose the same Game Studio UI and commands. Heavy engine execution on mobile routes to a paired desktop or cloud worker.

### 4.2 Video Studio

Use **ComfyUI** as the primary workflow orchestration layer for open video/image generation where practical.

Initial model/workflow families:

- LTX / LTX-Video
- Wan 2.2
- HunyuanVideo 1.5

MODX provides a simplified UI over reusable ComfyUI workflows instead of exposing raw node graphs by default.

Supported tasks target:

- text-to-video
- image-to-video
- video-to-video
- video extension
- keyframe-driven generation where supported
- speech/audio-driven video where supported
- character animation where supported
- upscaling/interpolation via compatible workflows

The router chooses model/workflow by task, device capability, VRAM, expected latency, plan entitlement, and available execution targets.

### 4.3 Education Studio

Use OpenTutor as architectural inspiration for:

- adaptive tutor
- source-grounded explanations
- upload and ingestion of PDF/DOCX/PPTX
- flashcards
- quizzes
- study plans
- spaced repetition
- knowledge graph concepts
- learner progress state

MODX will not reuse OpenTutor's single-user assumptions for hosted mode. The MODX implementation must remain multi-user and isolated per account.

### 4.4 Browser Agent

Browser Agent is a controlled browsing capability for research and approved interactions.

Rules:

- user-visible action plan
- explicit permission for sensitive actions
- no silent credential capture
- no unrestricted arbitrary OS execution through the browser layer
- separate browser sandbox from the application backend
- downloadable results and extracted project assets are scanned/validated before import where applicable

Desktop may support a local browser executor. Mobile may use cloud or platform browser sessions depending on OS limits.

## 5. Same-power user experience across devices

"Same power" means **same visible capabilities and same project actions**, not identical local OS privileges.

Examples:

- On Windows, a Godot build may run locally.
- On iPhone, the same command is accepted by the app and dispatched to a paired PC or cloud worker.
- On Android, a video task may run locally only if a supported local runtime exists; otherwise it is routed elsewhere.

The user should not lose features simply because the current device cannot execute them locally.

## 6. Device model

Each signed-in device registers a capability profile including:

- platform
- architecture
- app version
- CPU class
- RAM class
- GPU presence and optional VRAM class
- installed game engines on desktop
- local ComfyUI availability
- available disk space class
- supported background execution features
- permission state

Sensitive raw hardware details are minimized. Only data needed for routing is sent to the service.

## 7. Pairing and remote execution

A user may register multiple devices under one account.

Paired device execution requires:

- explicit device enrollment
- per-device cryptographic identity
- user approval for new device trust
- encrypted job transport
- project-root allowlists
- per-task permission scopes
- revocation from account settings

No remote control is granted by default. MODX jobs are task-scoped rather than unrestricted desktop access.

## 8. Lightweight design requirements

The application should remain small and responsive by keeping heavy runtimes external to the base app.

The app package should NOT bundle:

- Godot engine binaries
- Unity editor
- Unreal Engine
- ComfyUI model weights
- Wan/LTX/Hunyuan model weights

Instead MODX detects or connects to these runtimes on demand.

Targets:

- fast cold start
- lazy-loading studio modules
- on-demand downloads for optional components
- compressed asset bundle
- minimal background services
- shared Rust core rather than duplicated native implementations

## 9. Backend and account model

MODX 6 Egypt should use a separate application surface from the existing Modax AI Chat UI.

Shared concepts may include:

- Supabase Auth
- account identity
- plan/credits later

But MODX 6 Egypt must have its own application routing and task APIs so changes cannot break the current Modax chat experience.

Proposed API namespaces:

- `/v1/modx/devices/*`
- `/v1/modx/tasks/*`
- `/v1/modx/game/*`
- `/v1/modx/video/*`
- `/v1/modx/education/*`
- `/v1/modx/browser/*`

## 10. Security boundaries

Non-negotiable controls:

- provider API keys never shipped to clients
- no service-role/secret Supabase keys in apps
- all user-owned data protected by authenticated ownership checks and RLS where stored in Supabase
- local filesystem access restricted to user-approved roots
- local command execution restricted to registered tool adapters
- no arbitrary shell from normal AI prompts
- explicit approval for destructive file operations
- audit log for remote task execution and privilege-sensitive actions
- cloud workers isolated per job or per project session
- generated code execution sandboxed

## 11. Repository strategy

Create a dedicated repository for this product after design approval.

Proposed repository:

`Sayedmah/MODX-6-Egypt`

Proposed top-level structure:

```text
apps/
  flutter_app/
crates/
  modx_core/
  modx_platform/
services/
  gateway/
  task_orchestrator/
  browser_worker/
adapters/
  godot/
  unity/
  unreal/
  comfyui/
packages/
  shared_contracts/
docs/
  architecture/
.github/
  workflows/
```

## 12. Build outputs

Target distributable outputs:

- Windows: `.msi` and/or `.exe`
- macOS: `.app` packaged in `.dmg` or signed archive
- Linux: `.AppImage` plus optional `.deb`
- Android: `.apk` for testing and `.aab` for store delivery
- iOS/iPadOS: Xcode archive / `.ipa` only after valid Apple signing credentials and provisioning are available

Unsigned development artifacts may be produced where platform tooling permits. Store-ready builds require platform signing credentials that must not be committed to GitHub.

## 13. CI/CD

GitHub Actions matrix builds should be used where feasible:

- Linux runner: Linux app + tests
- Windows runner: Windows app + tests
- macOS runner: macOS app + iOS compile/archive steps where signing configuration permits
- Android build in Linux/macOS runner

Artifacts are published from workflow runs for test builds.

Secrets for signing and cloud services must use GitHub Actions secrets or external secret management, never repository files.

## 14. Initial implementation phases

### Phase A — Cross-platform shell

- Flutter app boots on all target platforms
- Rust bridge works
- login/session shell
- capability profile screen
- lightweight dashboard with Game / Video / Education / Browser sections

### Phase B — Execution Fabric

- task contract
- local vs paired vs cloud router
- device registration and pairing
- task status/log streaming

### Phase C — Godot first

- Godot detection
- project import
- file context
- create/repair/build/test workflow
- permissioned apply/undo

### Phase D — Video

- ComfyUI adapter
- starter workflows for Wan/LTX/Hunyuan
- queue/status/result handling

### Phase E — Education

- document ingestion
- tutor
- quizzes/flashcards/study plan

### Phase F — Browser Agent

- isolated browser worker
- research and approved interaction flow

### Phase G — Unity and Unreal

- engine detection
- project adapters
- build/test workflows

## 15. Acceptance criteria for the first downloadable milestone

The first milestone is complete when:

1. One shared Flutter codebase builds for Windows, macOS, Linux, Android, and iOS target projects.
2. Rust core is reachable from the Flutter app on supported build targets.
3. User can sign in and see the same four studios on each platform.
4. Capability detection reports what can run locally and what must route remotely.
5. A test task can be dispatched through the Execution Fabric and returns status/results.
6. Windows/Linux/macOS can execute a safe local adapter task.
7. Android/iOS can dispatch the same task to a paired/cloud executor.
8. Build artifacts are produced by CI for platforms that do not require unavailable signing credentials.
9. The base app does not bundle heavy AI model weights or game engines.

## 16. Out of scope for milestone 1

- production billing
- full Unity automation
- full Unreal automation
- store publication
- production-scale GPU fleet
- unrestricted remote desktop control
- embedding multi-gigabyte model weights in the app

These remain later phases after the lightweight cross-platform foundation is stable.
