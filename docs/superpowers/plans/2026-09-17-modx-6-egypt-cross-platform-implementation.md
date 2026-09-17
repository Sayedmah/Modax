# MODX 6 Egypt Cross-Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lightweight cross-platform MODX 6 Egypt application with the same user-facing Game, Video, Education, and Browser capabilities on Windows, macOS, Linux, Android, and iOS, using a unified execution fabric that routes work to Local, Paired Device, or Cloud executors.

**Architecture:** A Flutter client provides one UI across all supported devices. A Rust shared core, exposed through `flutter_rust_bridge`, handles capability discovery, task contracts, routing, local adapters, pairing, and secure task transport. Heavy runtimes such as Godot, Unity, Unreal, ComfyUI, Wan, LTX, and Hunyuan remain external to the base app and are discovered or invoked on demand.

**Tech Stack:** Flutter, Dart, Rust, flutter_rust_bridge, Supabase Auth, HTTPS/WebSocket task APIs, GitHub Actions, Godot CLI adapters, ComfyUI API adapters.

**Spec:** `docs/superpowers/specs/2026-09-17-modx-6-egypt-cross-platform-design.md`

## Global Constraints

- Product name: `MODX 6 Egypt`.
- Target platforms: Windows, macOS, Linux, Android, iOS/iPadOS.
- Same visible capabilities on every platform; execution location may differ.
- Base app must not bundle Godot, Unity, Unreal, ComfyUI model weights, Wan, LTX, or Hunyuan weights.
- Provider secrets, Supabase secret/service-role keys, and signing secrets must never ship in the client.
- Local filesystem access is limited to user-approved roots.
- AI prompts cannot execute unrestricted arbitrary shell commands.
- Destructive file operations require explicit approval.
- Godot is first-class in V1; Unity and Unreal follow after the Godot workflow is stable.
- Repositories `Sayedmah/MODX` and `Sayedmah/MODX-6-Egypt` must be private before application source is added.

---

### Task 1: Bootstrap the private repositories and shared project layout

**Files:**
- Create in `Sayedmah/MODX-6-Egypt`: `README.md`
- Create: `apps/flutter_app/pubspec.yaml`
- Create: `apps/flutter_app/lib/main.dart`
- Create: `crates/modx_core/Cargo.toml`
- Create: `crates/modx_core/src/lib.rs`
- Create: `packages/shared_contracts/task.schema.json`
- Create: `.gitignore`

**Interfaces:**
- Produces Flutter application package `modx_6_egypt`.
- Produces Rust crate `modx_core`.
- Produces shared `TaskRequest` schema consumed by later routing tasks.

- [ ] **Step 1: Verify both target repositories are private before writing source**

Check repository metadata for `Sayedmah/MODX` and `Sayedmah/MODX-6-Egypt` and confirm `visibility=private`.

Expected: both repositories exist and are private. Stop if either condition is false.

- [ ] **Step 2: Write a failing contract test for repository layout**

Create `tools/verify_layout.mjs`:

```js
import fs from 'node:fs';
import assert from 'node:assert/strict';

for (const path of [
  'apps/flutter_app/pubspec.yaml',
  'apps/flutter_app/lib/main.dart',
  'crates/modx_core/Cargo.toml',
  'crates/modx_core/src/lib.rs',
  'packages/shared_contracts/task.schema.json'
]) assert.equal(fs.existsSync(path), true, `missing ${path}`);
```

- [ ] **Step 3: Run the test and verify it fails**

Run:

```bash
node tools/verify_layout.mjs
```

Expected: FAIL because the project files do not exist yet.

- [ ] **Step 4: Create the minimal Flutter/Rust workspace**

`apps/flutter_app/pubspec.yaml`:

```yaml
name: modx_6_egypt
description: MODX 6 Egypt cross-platform AI studio
publish_to: none
version: 0.1.0+1
environment:
  sdk: '>=3.5.0 <4.0.0'
dependencies:
  flutter:
    sdk: flutter
  flutter_rust_bridge: ^2.0.0
  http: ^1.2.0
  web_socket_channel: ^3.0.0
dev_dependencies:
  flutter_test:
    sdk: flutter
flutter:
  uses-material-design: true
```

`crates/modx_core/Cargo.toml`:

```toml
[package]
name = "modx_core"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "staticlib", "rlib"]

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "1", features = ["v4", "serde"] }
```

`crates/modx_core/src/lib.rs`:

```rust
pub fn app_name() -> &'static str { "MODX 6 Egypt" }
```

- [ ] **Step 5: Create the task schema**

`packages/shared_contracts/task.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "TaskRequest",
  "type": "object",
  "required": ["id", "kind", "projectId", "requestedByDeviceId", "payload"],
  "properties": {
    "id": {"type":"string"},
    "kind": {"enum":["game","video","education","browser","system_test"]},
    "projectId": {"type":"string"},
    "requestedByDeviceId": {"type":"string"},
    "payload": {"type":"object"},
    "preferredTarget": {"enum":["auto","local","paired","cloud"]}
  }
}
```

- [ ] **Step 6: Re-run the layout test**

Run:

```bash
node tools/verify_layout.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: bootstrap MODX 6 Egypt cross-platform workspace"
```

---

### Task 2: Implement the Rust capability profile and Flutter bridge

**Files:**
- Create: `crates/modx_core/src/capabilities.rs`
- Modify: `crates/modx_core/src/lib.rs`
- Create: `crates/modx_core/tests/capabilities.rs`
- Create: `apps/flutter_app/lib/core/capability_profile.dart`

**Interfaces:**
- Produces Rust `CapabilityProfile`.
- Produces `detect_capabilities() -> CapabilityProfile`.
- Flutter consumes serialized profile JSON through generated bridge bindings.

- [ ] **Step 1: Write the failing Rust test**

```rust
use modx_core::capabilities::detect_capabilities;

#[test]
fn capability_profile_has_platform_and_execution_flags() {
    let p = detect_capabilities();
    assert!(!p.platform.is_empty());
    assert!(p.supports_remote_dispatch);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cargo test --manifest-path crates/modx_core/Cargo.toml
```

Expected: FAIL because `capabilities` does not exist.

- [ ] **Step 3: Implement the capability profile**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CapabilityProfile {
    pub platform: String,
    pub architecture: String,
    pub supports_local_processes: bool,
    pub supports_remote_dispatch: bool,
    pub supports_local_files: bool,
}

pub fn detect_capabilities() -> CapabilityProfile {
    CapabilityProfile {
        platform: std::env::consts::OS.to_string(),
        architecture: std::env::consts::ARCH.to_string(),
        supports_local_processes: matches!(std::env::consts::OS, "windows" | "macos" | "linux"),
        supports_remote_dispatch: true,
        supports_local_files: true,
    }
}
```

- [ ] **Step 4: Run Rust tests**

Run:

```bash
cargo test --manifest-path crates/modx_core/Cargo.toml
```

Expected: PASS.

- [ ] **Step 5: Add the Flutter model and generated bridge invocation**

Create a Dart model with fields matching Rust exactly:

```dart
class CapabilityProfile {
  final String platform;
  final String architecture;
  final bool supportsLocalProcesses;
  final bool supportsRemoteDispatch;
  final bool supportsLocalFiles;

  const CapabilityProfile({
    required this.platform,
    required this.architecture,
    required this.supportsLocalProcesses,
    required this.supportsRemoteDispatch,
    required this.supportsLocalFiles,
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add crates/modx_core apps/flutter_app/lib/core
git commit -m "feat: add cross-platform capability detection"
```

---

### Task 3: Build the lightweight dashboard shared by all devices

**Files:**
- Create: `apps/flutter_app/lib/app/modx_app.dart`
- Create: `apps/flutter_app/lib/features/home/home_screen.dart`
- Create: `apps/flutter_app/lib/features/home/studio_card.dart`
- Modify: `apps/flutter_app/lib/main.dart`
- Test: `apps/flutter_app/test/home_screen_test.dart`

**Interfaces:**
- Produces navigation targets: `game`, `video`, `education`, `browser`.
- Consumes `CapabilityProfile` from Task 2.

- [ ] **Step 1: Write the failing widget test**

```dart
testWidgets('shows the four MODX studios', (tester) async {
  await tester.pumpWidget(const ModxApp());
  expect(find.text('Game Studio'), findsOneWidget);
  expect(find.text('Video Studio'), findsOneWidget);
  expect(find.text('Education Studio'), findsOneWidget);
  expect(find.text('Browser Agent'), findsOneWidget);
});
```

- [ ] **Step 2: Run the widget test and verify failure**

Run:

```bash
cd apps/flutter_app && flutter test test/home_screen_test.dart
```

Expected: FAIL because `ModxApp` and dashboard do not exist.

- [ ] **Step 3: Implement a lazy, lightweight dashboard**

Use Material 3 and four cards. Do not initialize Godot, ComfyUI, browser workers, or remote transports until the relevant card is opened.

- [ ] **Step 4: Re-run the widget test**

Run:

```bash
cd apps/flutter_app && flutter test test/home_screen_test.dart
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/flutter_app/lib apps/flutter_app/test
git commit -m "feat: add lightweight MODX studio dashboard"
```

---

### Task 4: Implement the Execution Fabric router

**Files:**
- Create: `crates/modx_core/src/tasks.rs`
- Create: `crates/modx_core/src/router.rs`
- Create: `crates/modx_core/tests/router.rs`
- Modify: `crates/modx_core/src/lib.rs`

**Interfaces:**
- Consumes `CapabilityProfile`.
- Produces `ExecutionTarget::{Local, Paired, Cloud}`.
- Produces `route_task(task: &TaskRequest, capabilities: &CapabilityProfile, paired_available: bool, cloud_available: bool) -> Result<ExecutionTarget, RouteError>`.

- [ ] **Step 1: Write failing routing tests**

```rust
#[test]
fn desktop_prefers_local_when_supported() { /* assert Local */ }

#[test]
fn mobile_uses_paired_when_local_processes_are_unavailable() { /* assert Paired */ }

#[test]
fn falls_back_to_cloud_when_no_paired_device_exists() { /* assert Cloud */ }
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cargo test --manifest-path crates/modx_core/Cargo.toml router
```

Expected: FAIL because router types do not exist.

- [ ] **Step 3: Implement deterministic routing**

Rules:

```text
preferredTarget=local -> Local only if capability supports it, otherwise error
preferredTarget=paired -> Paired only if trusted paired executor is available
preferredTarget=cloud -> Cloud only if cloud executor is available
preferredTarget=auto -> Local, else Paired, else Cloud, else error
```

- [ ] **Step 4: Run router tests**

Run:

```bash
cargo test --manifest-path crates/modx_core/Cargo.toml router
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add crates/modx_core
git commit -m "feat: add unified MODX execution router"
```

---

### Task 5: Add device registration and secure pairing contracts

**Files:**
- Create: `services/gateway/package.json`
- Create: `services/gateway/src/server.mjs`
- Create: `services/gateway/src/device-registry.mjs`
- Create: `services/gateway/test/device-registry.test.mjs`
- Create: `packages/shared_contracts/device.schema.json`

**Interfaces:**
- Produces `POST /v1/modx/devices/register`.
- Produces `POST /v1/modx/devices/pair/start`.
- Produces `POST /v1/modx/devices/pair/confirm`.
- Produces server-generated device IDs and pairing challenges.

- [ ] **Step 1: Write a failing device registry test**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerDevice } from '../src/device-registry.mjs';

test('device registration binds device to authenticated user', async () => {
  const result = await registerDevice({ userId:'u1', platform:'windows', publicKey:'pk1' });
  assert.equal(result.userId, 'u1');
  assert.equal(result.trusted, false);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
cd services/gateway && node --test test/device-registry.test.mjs
```

Expected: FAIL because the registry module does not exist.

- [ ] **Step 3: Implement registry with no client-supplied owner override**

The server derives `userId` from verified auth context and ignores any `userId` supplied in request JSON.

- [ ] **Step 4: Add pairing challenge expiry and confirmation**

Pairing challenge lifetime: 10 minutes. Confirmed trust is stored per device and can be revoked.

- [ ] **Step 5: Run tests**

Run:

```bash
cd services/gateway && node --test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/gateway packages/shared_contracts/device.schema.json
git commit -m "feat: add MODX device registration and pairing"
```

---

### Task 6: Add the first safe local executor and remote task status flow

**Files:**
- Create: `crates/modx_core/src/executor.rs`
- Create: `crates/modx_core/src/adapters/system_test.rs`
- Create: `crates/modx_core/tests/executor.rs`
- Create: `apps/flutter_app/lib/features/tasks/task_status_screen.dart`

**Interfaces:**
- Produces `execute_registered_task(TaskRequest)`.
- Initial allowed adapter: `system_test` only.
- Does not accept arbitrary command strings.

- [ ] **Step 1: Write a failing executor test**

```rust
#[test]
fn rejects_unknown_adapter() { /* expect error */ }

#[test]
fn system_test_returns_platform_summary() { /* expect success */ }
```

- [ ] **Step 2: Run and verify failure**

```bash
cargo test --manifest-path crates/modx_core/Cargo.toml executor
```

- [ ] **Step 3: Implement an allowlisted adapter registry**

Only adapter IDs registered in code can run. `system_test` returns platform and app-version information and never executes shell input.

- [ ] **Step 4: Add Flutter task status UI**

Show states `queued`, `running`, `waiting_for_approval`, `succeeded`, `failed`, with streamed log lines.

- [ ] **Step 5: Run Rust and Flutter tests**

```bash
cargo test --manifest-path crates/modx_core/Cargo.toml
cd apps/flutter_app && flutter test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add crates/modx_core apps/flutter_app/lib/features/tasks
git commit -m "feat: add safe MODX task execution flow"
```

---

### Task 7: Add the first Godot adapter

**Files:**
- Create: `adapters/godot/README.md`
- Create: `crates/modx_core/src/adapters/godot.rs`
- Create: `crates/modx_core/tests/godot_adapter.rs`
- Create: `apps/flutter_app/lib/features/game/game_studio_screen.dart`

**Interfaces:**
- Produces `detect_godot()`.
- Produces operations `inspect_project`, `validate_project`, `run_headless_test`.
- All file operations restricted to approved project root.

- [ ] **Step 1: Write failing Godot detection tests**

Use an injected executable locator so tests do not require Godot installed on CI.

- [ ] **Step 2: Run tests and verify failure**

```bash
cargo test --manifest-path crates/modx_core/Cargo.toml godot
```

- [ ] **Step 3: Implement Godot executable discovery on desktop platforms**

Search only known install paths and PATH. Do not download Godot automatically in milestone 1.

- [ ] **Step 4: Implement project-root validation**

Require `project.godot` inside the approved root before any Godot operation.

- [ ] **Step 5: Implement headless validation command through fixed arguments**

Arguments are built by the adapter; prompt text cannot inject shell syntax.

- [ ] **Step 6: Add Game Studio UI**

Expose project selection, engine detection, inspect, validate, and test actions. On mobile, the same actions create tasks routed to Paired or Cloud execution.

- [ ] **Step 7: Run tests**

```bash
cargo test --manifest-path crates/modx_core/Cargo.toml
cd apps/flutter_app && flutter test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add adapters/godot crates/modx_core apps/flutter_app/lib/features/game
git commit -m "feat: add first-class Godot project adapter"
```

---

### Task 8: Add ComfyUI Video Studio adapter contracts

**Files:**
- Create: `adapters/comfyui/README.md`
- Create: `services/gateway/src/comfyui-adapter.mjs`
- Create: `services/gateway/test/comfyui-adapter.test.mjs`
- Create: `apps/flutter_app/lib/features/video/video_studio_screen.dart`

**Interfaces:**
- Produces operations `queueWorkflow`, `getJobStatus`, `cancelJob`.
- Initial workflow families: `wan22`, `ltx`, `hunyuan15`.

- [ ] **Step 1: Write failing adapter tests with mocked ComfyUI HTTP responses**

Verify workflow family validation, job ID parsing, and timeout behavior.

- [ ] **Step 2: Run tests and verify failure**

```bash
cd services/gateway && node --test test/comfyui-adapter.test.mjs
```

- [ ] **Step 3: Implement the adapter using configured ComfyUI endpoint only**

No model weights or ComfyUI binaries are bundled in the app.

- [ ] **Step 4: Add simplified Video Studio UI**

Fields: prompt, optional source image/video, task type, quality mode, model mode `Auto/Wan/LTX/Hunyuan`.

- [ ] **Step 5: Run tests**

```bash
cd services/gateway && node --test
cd ../../apps/flutter_app && flutter test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add adapters/comfyui services/gateway apps/flutter_app/lib/features/video
git commit -m "feat: add ComfyUI-backed MODX Video Studio"
```

---

### Task 9: Add Education Studio foundation

**Files:**
- Create: `services/gateway/src/education-service.mjs`
- Create: `services/gateway/test/education-service.test.mjs`
- Create: `apps/flutter_app/lib/features/education/education_studio_screen.dart`

**Interfaces:**
- Produces actions `createCourse`, `ingestDocument`, `askTutor`, `generateQuiz`, `generateFlashcards`.
- Uploaded content stays user-scoped.

- [ ] **Step 1: Write failing tests for user ownership and grounded-answer contract**

Ensure one user cannot query another user's course ID.

- [ ] **Step 2: Run tests and verify failure**

```bash
cd services/gateway && node --test test/education-service.test.mjs
```

- [ ] **Step 3: Implement user-scoped course and document metadata contracts**

Document content processing may be asynchronous, but API status is explicit.

- [ ] **Step 4: Add the Education Studio UI**

Provide course picker, upload control, tutor chat, quiz, flashcards, and study-plan entry points.

- [ ] **Step 5: Run tests**

```bash
cd services/gateway && node --test
cd ../../apps/flutter_app && flutter test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/gateway apps/flutter_app/lib/features/education
git commit -m "feat: add MODX Education Studio foundation"
```

---

### Task 10: Add Browser Agent sandbox contracts

**Files:**
- Create: `services/browser_worker/package.json`
- Create: `services/browser_worker/src/worker.mjs`
- Create: `services/browser_worker/test/worker.test.mjs`
- Create: `apps/flutter_app/lib/features/browser/browser_agent_screen.dart`

**Interfaces:**
- Produces browser actions `navigate`, `search`, `extract`, `click`, `type`.
- Sensitive actions require `approval_required=true` status before execution.

- [ ] **Step 1: Write failing approval-boundary tests**

A form submission or credential-field interaction must return `waiting_for_approval` unless an approval token accompanies the task.

- [ ] **Step 2: Run tests and verify failure**

```bash
cd services/browser_worker && node --test
```

- [ ] **Step 3: Implement isolated browser action validation**

Do not expose arbitrary shell or raw filesystem operations through the browser worker.

- [ ] **Step 4: Add Browser Agent UI**

Show current URL, action log, approval requests, and extracted results.

- [ ] **Step 5: Run tests**

```bash
cd services/browser_worker && node --test
cd ../../apps/flutter_app && flutter test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add services/browser_worker apps/flutter_app/lib/features/browser
git commit -m "feat: add permissioned MODX Browser Agent"
```

---

### Task 11: Add CI matrix and distributable artifacts

**Files:**
- Create: `.github/workflows/test.yml`
- Create: `.github/workflows/build-windows.yml`
- Create: `.github/workflows/build-linux.yml`
- Create: `.github/workflows/build-macos-ios.yml`
- Create: `.github/workflows/build-android.yml`

**Interfaces:**
- Produces Windows installer artifact.
- Produces Linux AppImage/deb artifact where packaging support is available.
- Produces macOS app archive.
- Produces Android APK/AAB test artifacts.
- Produces iOS unsigned build or signed archive only when Apple signing credentials are configured.

- [ ] **Step 1: Add test workflow**

Run Rust tests, Node service tests, Flutter analyze, and Flutter tests on every pull request.

- [ ] **Step 2: Add per-platform build workflows**

Each workflow uses the native runner required by Flutter desktop/mobile packaging.

- [ ] **Step 3: Keep signing secrets outside repository source**

Windows/macOS/iOS signing configuration must come from GitHub Actions secrets. Workflows must still produce unsigned development builds when signing secrets are absent where platform tooling permits.

- [ ] **Step 4: Trigger workflows and verify artifacts**

Expected: Windows, Linux, macOS, and Android build jobs complete; iOS compile/archive reaches the maximum stage allowed without Apple credentials.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows
git commit -m "ci: build MODX 6 Egypt across desktop and mobile"
```

---

### Task 12: Milestone verification and release notes

**Files:**
- Modify: `README.md`
- Create: `docs/architecture/execution-fabric.md`
- Create: `docs/release/milestone-1.md`

**Interfaces:**
- Documents artifact locations, platform limitations, pairing behavior, and local/cloud routing.

- [ ] **Step 1: Run all tests**

```bash
cargo test --manifest-path crates/modx_core/Cargo.toml
cd services/gateway && node --test
cd ../browser_worker && node --test
cd ../../apps/flutter_app && flutter analyze && flutter test
```

Expected: zero failures and zero analyzer errors.

- [ ] **Step 2: Verify lightweight packaging boundary**

Confirm generated application packages do not contain Godot, Unity, Unreal, ComfyUI model weights, Wan weights, LTX weights, or Hunyuan weights.

- [ ] **Step 3: Verify platform UX parity**

On every target platform, confirm the four studios exist and unsupported local actions are routed rather than hidden.

- [ ] **Step 4: Verify security boundaries**

Search application-delivered source/artifacts for `service_role`, `sb_secret_`, provider API secret values, and signing private keys.

Expected: none are present.

- [ ] **Step 5: Publish milestone notes**

Document which artifacts are downloadable and state clearly when an iOS `.ipa` is unavailable because Apple signing credentials/provisioning have not been supplied.

- [ ] **Step 6: Commit**

```bash
git add README.md docs
git commit -m "docs: verify MODX 6 Egypt milestone one"
```
