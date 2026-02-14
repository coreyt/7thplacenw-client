# CLAUDE.md — Agent Onboarding

## What This Project Is

7thplacenw-client is a cross-platform **Layered Configuration Manager**.
It provides idiomatic client libraries for Python, TypeScript, Go, C#,
and C++ that replace magic numbers with typed, layered, immutable config
objects. Values are loaded in precedence order: Defaults < File < Env < CLI.

## Current State

**Phase: Pre-implementation (design complete, code not started)**

All architecture, design, and compliance documents are finalized. The
Python `__init__.py` files are license-header stubs only — no
implementation code exists in any language yet. The next step is
implementing the Python reference implementation.

See `PROGRESS.md` for detailed status.

## Reading Order

Read these documents in this order to understand the project:

1. **This file** — You're here. Orientation and conventions.
2. **`dev/USER_NEEDS.md`** — Who uses this and why. Acceptance criteria.
3. **`dev/REQUIREMENTS.md`** — Functional requirements. Traces to user needs.
4. **`dev/ARCHITECTURE.md`** — Three-tier design, v0.1 scope, API contract.
   Start with the "v0.1 Scope" section to understand what's in/out.
5. **`test/COMPLIANCE.md`** — The behavioral spec (TC-01 through TC-20).
   This is the authoritative definition of "correct" behavior.
6. **`<lang>/dev/DESIGN.md`** — Language-specific HLD. Read the one for
   the language you're implementing.
7. **`dev/BRIDGE.md`** — Env var convention, type coercion rules.
8. **`dev/GOLDEN_SCHEMA.md`** — Proto schema design. Open questions resolved.
9. **`dev/PORTABILITY.md`** — Cross-language implementation matrix.

## Key Conventions

### Naming

- Provider names: `DefaultProvider`, `FileProvider`, `EnvProvider`,
  `CLIProvider` (singular, not plural)
- Env prefix: Bare string in API (`"SEVENTHPLACE"`), library appends `__`
- Package names vary by language (see `dev/PORTABILITY.md` § Packaging)

### File Structure

- `dev/` — Repo-level architecture and design docs
- `schema/proto/` — Golden Schema proto files (spec only, not built in v0.1)
- `test/` — Compliance spec and shared fixture YAML files
- `<lang>/dev/` — Language-specific design doc
- `<lang>/src/` — Source code (except Go, which has no `src/`)
- `<lang>/tests/` — Tests (except Go, where tests are alongside source)

### Testing

- Every implementation must pass TC-01 through TC-20 from `test/COMPLIANCE.md`
- Shared fixtures live in `test/fixtures/`
- Each language has its own test runner (pytest, vitest, go test, xunit, catch2)
- Compliance test targets: `make test-compliance-<lang>`

### Schema Sync

For v0.1, schemas are hand-written per language. The proto file
(`schema/proto/seventhplace/config.proto`) is the canonical reference.
When changing a config field, update the proto first, then update each
language's schema to match. TC-01 (Defaults Only) catches drift.

## Implementation Order

1. **Python** (reference implementation — validate compliance suite)
2. **TypeScript**
3. **Go**
4. **C#**
5. **C++**

Each language must pass the full compliance suite before the next begins.

## What NOT To Do

- **Don't build codegen tooling.** v0.1 uses hand-written schemas.
  Codegen from proto is deferred to v0.2.
- **Don't implement the protobuf bridge.** v0.1 is JSON bridge only
  (YAML/JSON files). Proto bridge is v0.2.
- **Don't implement RemoteProvider.** It depends on the control-plane
  repo which doesn't exist yet.
- **Don't add dependencies beyond what's specified** in the language HLD.
  Each language has at most 2 runtime deps.
- **Don't expose raw dicts/maps to consumers.** The public API returns
  typed, frozen objects only.
- **Don't use `eval()` or dynamic code execution** in any language.
- **Don't include secret values in error messages.**
- **Don't force a single API shape** across languages. Each language
  uses idiomatic patterns (see `dev/ARCHITECTURE.md` § API Contract).

## Important Files

| File | Purpose |
|------|---------|
| `dev/ARCHITECTURE.md` | Core architecture, v0.1 scope, API contract |
| `dev/USER_NEEDS.md` | User needs with acceptance criteria |
| `dev/REQUIREMENTS.md` | Requirements tracing to user needs and compliance tests |
| `test/COMPLIANCE.md` | Behavioral test specification (TC-01..TC-20) |
| `test/fixtures/*.yaml` | Shared test fixture files |
| `schema/proto/seventhplace/config.proto` | Golden Schema (canonical field reference) |
| `schema/proto/seventhplace/options.proto` | FieldMeta custom option definitions |
| `dev/BRIDGE.md` | Env var convention, type coercion rules |
| `dev/PORTABILITY.md` | Cross-language implementation matrix |
