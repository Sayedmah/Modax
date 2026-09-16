# MODY Studios Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backend foundation for MODY Game, Study, and Video Studios with shared job orchestration and safe worker boundaries.

**Architecture:** Keep provider credentials and orchestration server-side. Each studio exposes a small service module consumed by `server.mjs`; expensive execution is delegated to isolated workers. Worker success is never inferred from AI text.

**Tech Stack:** Node.js ESM, built-in HTTP/fetch, existing MODY provider gateway, Godot worker contract.

**Spec:** `docs/superpowers/specs/2026-09-16-mody-game-studio-design.md` plus the approved expansion in chat to Study Studio and Video Studio.

## Global Constraints
- Never expose provider or worker secrets to the browser.
- Never execute generated shell commands in the public API process.
- Only worker-verified artifacts may be marked playable/exported.
- Keep endpoints JSON and compatible with the existing `server.mjs` gateway.

---

### Task 1: Shared Studio Jobs
**Files:** Create `backend/studio-jobs.mjs`; Test `tests/studio-jobs.test.mjs`.
- [ ] Write tests for IDs, state transitions, invalid transitions, and public serialization.
- [ ] Implement in-memory job registry interface suitable for later persistent storage.
- [ ] Verify tests.

### Task 2: Study Studio Service
**Files:** Create `backend/study-studio.mjs`; Test `tests/study-studio.test.mjs`.
- [ ] Test curriculum context validation and explain/quiz/flashcard prompt contracts.
- [ ] Implement structured AI operations without copyrighted curriculum scraping.
- [ ] Verify tests.

### Task 3: Video Studio Service
**Files:** Create `backend/video-studio.mjs`; Test `tests/video-studio.test.mjs`.
- [ ] Test project validation, storyboard generation, render-job creation, and safe asset references.
- [ ] Implement script/storyboard AI service plus isolated render-worker job contract.
- [ ] Verify tests.

### Task 4: Godot Build Status and Repair Loop
**Files:** Modify `backend/godot-api.mjs`, `backend/godot-worker.mjs`; Test existing Godot tests plus new orchestration tests.
- [ ] Add worker build result/status contract.
- [ ] Add bounded repair-loop state metadata.
- [ ] Keep Play false until HTTPS artifact is worker verified.
- [ ] Verify tests.

### Task 5: Server Routes
**Files:** Modify `backend/server.mjs`; Test `tests/server-studios-contract.test.mjs`.
- [ ] Add Study endpoints.
- [ ] Add Video endpoints.
- [ ] Add shared job/status endpoint and Godot status endpoint.
- [ ] Route AI calls through existing provider gateway.
- [ ] Route heavy work through configured worker URLs.
- [ ] Verify tests.

### Task 6: CI Verification
**Files:** Create/modify `.github/workflows/backend-tests.yml`.
- [ ] Run `node --test tests/*.test.mjs` on branch/PR.
- [ ] Inspect workflow results and fix failures before completion claims.
