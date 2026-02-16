# PROJECT_PLAN.md — Maturity Plan for Python + TypeScript Clients

## Objective

Raise this repository from **v0.1 functional implementation** to a level that is
mature and reliable for sustained production use in both Python and TypeScript
projects.

## Definition of “Mature Enough” (for this repo)

A release is considered mature when:

- Both Python and TypeScript clients are consistently releasable and installable.
- CI enforces quality gates (tests, lint, type checks, packaging checks).
- Versioning, changelog, and release automation are in place.
- Core security, reliability, and observability concerns are documented and tested.
- Developer onboarding and usage docs are accurate and complete.

---

## Phase 1 — Baseline Release Hygiene (High Priority)

### 1. Packaging and install ergonomics

- [ ] **Python:** Ensure tests and local usage work without manual `PYTHONPATH`.
- [ ] **Python:** Add and verify build artifacts (`sdist` + wheel) in CI.
- [ ] **TypeScript:** Confirm package exports/types are complete and stable.
- [ ] **TypeScript:** Verify package builds cleanly and can be consumed by a sample app.

### 2. CI quality gates

- [ ] Add root CI workflow(s) that run on PRs and main branch.
- [ ] **Python CI gates:**
  - [ ] `pytest`
  - [ ] `mypy --strict`
  - [ ] `ruff` lint checks
  - [ ] package build check
- [ ] **TypeScript CI gates:**
  - [ ] `npm test -- --run`
  - [ ] TypeScript type check (`tsc --noEmit`)
  - [ ] lint checks (if not present, add ESLint config)
  - [ ] package build check
- [ ] Add required status checks / branch protection policy documentation.

### 3. Versioning + release process

- [ ] Define and document SemVer policy.
- [ ] Add release checklist (pre-release verification + post-release validation).
- [ ] Add CHANGELOG.md (or equivalent) and enforce updates for user-visible changes.
- [ ] Automate publishing:
  - [ ] PyPI publish pipeline for Python package.
  - [ ] npm publish pipeline for TypeScript package.

---

## Phase 2 — Production Reliability & Security (High Priority)

### 4. Configuration behavior hardening

- [ ] Add compatibility tests for edge-case precedence conflicts (file/env/CLI collisions).
- [ ] Add regression tests for malformed env/CLI keys and mixed case handling.
- [ ] Add tests for large config payloads and performance baselines.
- [ ] Define and document backward compatibility guarantees for schema evolution.

### 5. Security posture

- [ ] Document threat model for config ingestion paths (file/env/CLI).
- [ ] Add dependency vulnerability scanning in CI.
- [ ] Add secret-handling guidance and redaction guarantees to user docs.
- [ ] Add policy for secure defaults and unsafe-input rejection behavior.

### 6. Error ergonomics

- [ ] Standardize error codes/messages between Python and TypeScript where practical.
- [ ] Ensure errors include actionable remediation hints for common failures.
- [ ] Add docs section: “Troubleshooting by error type”.

---

## Phase 3 — Developer Experience & Adoption (Medium Priority)

### 7. Documentation completeness

- [ ] Update `README.md` with language-specific quickstarts for Python and TypeScript.
- [ ] Add end-to-end examples showing defaults → file → env → CLI override flow.
- [ ] Add migration notes for introducing this manager into existing apps.
- [ ] Keep `PROGRESS.md` and `CLAUDE.md` aligned with implementation reality.

### 8. API stability and adoption confidence

- [ ] Explicitly mark public API surface for both clients.
- [ ] Add deprecation policy and timelines.
- [ ] Add compatibility matrix (supported Python/Node versions).
- [ ] Add small “starter templates” for one Python app and one TypeScript app.

### 9. Repository-level tooling

- [ ] Add a root `Makefile` / task runner with canonical commands:
  - [ ] `test-python`, `test-typescript`, `lint-python`, `lint-typescript`, `typecheck`
- [ ] Add contributor guide for local setup, testing, and release workflow.
- [ ] Add conventional commit/PR guidance and commit linting (optional, recommended).

---

## Exit Criteria Checklist (Go/No-Go)

The repo is ready for broad production recommendation when all of the following
are true:

- [ ] Python and TypeScript compliance tests pass in CI on every PR.
- [ ] Static checks (lint + type checks) pass in CI for both languages.
- [ ] Package build + publish pipelines are automated and documented.
- [ ] README quickstarts are validated by clean-room setup tests.
- [ ] Security scanning is active and failing findings are triaged.
- [ ] Release notes/changelog process is active and up to date.

---

## Suggested Execution Order

1. CI quality gates + packaging checks
2. Versioning/release automation
3. Security and error-ergonomics hardening
4. Documentation and onboarding polish
5. API stability guarantees and templates

## Notes

This plan focuses only on maturity for **Python** and **TypeScript** usage.
Cross-language parity for Go/C#/C++ can continue in parallel but should not
block hardening and release quality for the two implemented clients.
