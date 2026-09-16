# MODY Game Studio Design

## Goal
Add a first-class Game Studio to MODY AI that can turn a natural-language game idea into a structured Godot project workflow, keep project conversations separate, and provide a Play Preview path for web-exportable Godot builds.

## Product experience
- Add a **New Chat** action. Each chat has an id, title, timestamps, messages, and optional Game Studio project association.
- Add **Game Studio** as a primary MODY section.
- Game Studio starts with a game brief: title, 2D/3D, genre, target platforms, and natural-language idea.
- The AI Game Director produces a structured build plan instead of pretending a game was built.
- A project workspace shows Plan, Files, Build status, Play Preview, and AI conversation.
- Play Preview is enabled only when a real Godot web build artifact exists; otherwise the UI clearly reports what is missing.

## Architecture
Keep the existing MODY provider gateway as the AI layer. Add a Game Studio service boundary to the backend with project/chat persistence interfaces and a Godot worker interface. The web client never receives provider secrets.

A real Godot worker is a trusted server/runner with Godot installed. It creates project files in an isolated workspace, validates generated files, runs Godot headless checks, and exports Web builds. The public browser only receives sanitized project metadata and published preview artifacts.

## AI roles
- Game Director: turns the user idea into requirements and milestones.
- Godot Engineer: creates/edits Godot scenes, resources, and GDScript.
- Game Designer: mechanics, progression, balance, controls.
- UI Designer: HUD/menu specifications.
- Debugger: interprets build/runtime errors and proposes patches.
- Playtester: evaluates observable gameplay/test results, never claims to have played when no test run occurred.

Agents may share explicit project artifacts and test outputs, but MODY does not request or expose private chain-of-thought.

## Chat model
Chats are user-visible sessions. `New Chat` creates a clean conversation without deleting previous history. Game Studio projects can own multiple chats so a user can create a new discussion while keeping the same game project.

Initial web-demo persistence may use browser-local storage. Production persistence belongs in the authenticated backend database and sync layer.

## Godot generation pipeline
1. User submits a game brief.
2. Game Director returns a machine-readable project plan.
3. Godot Engineer generates a proposed file manifest.
4. Worker writes only allowed project paths inside an isolated workspace.
5. Worker runs validation/headless Godot checks.
6. Failures return diagnostics to the repair loop.
7. A successful Web export produces a versioned preview artifact.
8. The user presses Play to launch that verified artifact.

No UI state may claim Build Ready or Playable without a successful worker result.

## Security
- Provider API keys remain server-side environment secrets.
- Generated game code executes only in isolated workers with resource/time limits.
- Reject path traversal and absolute paths in generated manifests.
- Do not expose arbitrary worker filesystem paths.
- Preview artifacts are immutable/versioned.
- Public deployments require authentication, quotas, per-user project isolation, and abuse controls before enabling paid AI generation.

## MVP scope
The first MVP implements New Chat, Game Studio navigation/workspace, project briefs, AI-generated structured game plans through the existing backend, and explicit build/preview states. The Godot worker interface is included, while Play becomes active only after a verified exported artifact exists.

## Testing
Test chat creation/isolation, project validation, structured plan parsing, path validation, provider failures, build-state transitions, and mobile responsive UI. Godot integration tests must run against a pinned Godot version in CI/worker infrastructure before the project is described as automatically buildable.