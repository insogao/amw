# Development Plan

## Scope

Build a Node.js MVP memory loop for browser automation without changing existing project source code.

## Phase 1: Foundation

- [x] Create isolated workbench directory.
- [x] Define trajectory data schema.
- [x] Define run logging format.
- [x] Set up Node.js CLI project skeleton.

## Phase 2: Core Engine

- [x] Implement SQLite-backed memory store.
- [x] Implement hybrid retrieval (filters + lexical + semantic-lite + reliability).
- [x] Implement trajectory executor with guard checks.

## Phase 3: Browser Integration

- [x] Implement `agent-browser` SDK adapter.
- [x] Implement `human_handoff` pause/resume step.
- [x] Validate replay-first and fallback-explore flow.

## Phase 4: Developer Experience

- [x] Add CLI: `record`, `run`, `search`, `list`.
- [x] Add example step file and usage docs.
- [x] Add minimal tests for store/retrieval.
- [x] Add `ActionRegistry` for JSON-driven extensibility.
- [x] Add `amw.config.json` support for defaults (headed/session/binary/store_dir).

## Near-Term Extensions

- Add embedding provider interface for true semantic retrieval.
- Add trajectory graph merging and per-step confidence.
- Add auto-healing selector strategy (semantic locator fallback).
- Add summarizer to convert run logs to compact experience notes.
