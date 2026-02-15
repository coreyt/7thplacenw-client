# PROGRESS.md — Project Status

## Current Phase

**v0.1: Partial implementation (Python + TypeScript implemented, Go/C#/C++ pending)**

The repository is no longer in pre-implementation state. Python and
TypeScript contain working implementations with passing compliance tests.
Go, C#, and C++ currently contain project scaffolding/design docs but no
runtime implementation code.

---

## Current-Status Matrix (True State)

| Language | Implemented | Test Status | Blockers / Notes |
|----------|-------------|-------------|------------------|
| Python | ✅ Yes — package code present under `python/src/seventhplace/` (manager, providers, schema, errors, merge) | ✅ `PYTHONPATH=src pytest -q` → 20/20 passing | Needs packaging/test runner ergonomics to avoid requiring manual `PYTHONPATH` during local runs. |
| TypeScript | ✅ Yes — package code present under `typescript/src/` (manager, providers, schema, errors, merge) | ✅ `npm test -- --run` → 20/20 passing | No functional blocker observed; only npm env warning in this environment (`http-proxy`). |
| Go | ❌ No — only `go.mod`, `go.sum`, and design doc present | ⚠️ `go test ./...` reports no packages | No Go source packages or tests created yet. |
| C# | ❌ No — solution + `.csproj` scaffolding present, no library/test source files | ⚠️ Not runnable here (`dotnet` CLI unavailable in environment) | Implementation not started; environment also missing `dotnet` toolchain. |
| C++ | ❌ No — `CMakeLists.txt` + empty `include/src/tests` directories (`.gitkeep`) | ⚠️ CMake configure failed in this environment during dependency fetch | Implementation files referenced by CMake are missing; additionally, FetchContent GitHub downloads are blocked in this environment. |

---

## Completed

### Milestone: Architecture & Design (Done)

- [x] Core architecture document (`dev/ARCHITECTURE.md`)
- [x] Three-tier design: Golden Schema, Bridge, Client Consumption
- [x] v0.1 scope defined (in-scope vs deferred features)
- [x] Golden Schema proto files (`schema/proto/seventhplace/`)
  - [x] `options.proto` — FieldMeta custom options (defaults, constraints, sensitivity)
  - [x] `config.proto` — AppConfig with AlgoConfig, DbConfig, SecretsConfig
- [x] Bridge specification (`dev/BRIDGE.md`)
  - [x] JSON bridge (YAML/JSON file handling)
  - [x] Protobuf bridge design (deferred to v0.2)
  - [x] Environment variable convention (bare prefix, `__` nesting, type coercion)
- [x] Cross-language portability matrix (`dev/PORTABILITY.md`)
- [x] Compliance test specification (`test/COMPLIANCE.md`)
  - [x] 20 test cases (TC-01 through TC-20)
  - [x] Full waterfall coverage including CLI override (TC-19)
  - [x] Enum validation (TC-20)
- [x] Test fixtures (`test/fixtures/`)
  - [x] override_flat.yaml, override_nested.yaml, unknown_keys.yaml
  - [x] empty.yaml, full_override.yaml, type_mismatch.yaml, invalid_enum.yaml
- [x] Per-language high-level designs (5x `<lang>/dev/DESIGN.md`)
- [x] User needs and requirements documented (`dev/USER_NEEDS.md`, `dev/REQUIREMENTS.md`)
- [x] Agent onboarding file (`CLAUDE.md`)

### Milestone: Implementations Completed

- [x] Python v0.1 implementation
  - [x] Package modules under `python/src/seventhplace/`
  - [x] Compliance test suite (`python/tests/test_compliance.py`) passing (TC-01..TC-20)
- [x] TypeScript v0.1 implementation
  - [x] Package modules under `typescript/src/`
  - [x] Compliance test suite (`typescript/tests/compliance.test.ts`) passing (TC-01..TC-20)

---

## In Progress

- [ ] Go implementation
- [ ] C# implementation
- [ ] C++ implementation

---

## Next Up (v0.1 Remaining Work)

### Go
- [ ] Create runtime package(s) and exported config API
- [ ] Implement providers: defaults, file, env, CLI
- [ ] Implement merge + schema validation
- [ ] Add and pass compliance suite (TC-01..TC-20)

### C#
- [ ] Implement library source under `csharp/src/SeventhPlace.Config/`
- [ ] Implement providers + manager + typed config models
- [ ] Add and pass compliance suite in `csharp/tests/`

### C++
- [ ] Create implementation files referenced by `cpp/CMakeLists.txt`
- [ ] Implement providers + manager + typed config structs
- [ ] Add and pass compliance/unit tests under `cpp/tests/`

### Cross-Language
- [ ] Root Makefile with `test-compliance-*` targets
- [ ] CI pipeline (run all compliance suites)
- [ ] Keep status documents (`PROGRESS.md`, `CLAUDE.md`) aligned with reality

---

## Future Work (v0.2+)

These items remain deferred by design.

### Protobuf Bridge (v0.2)

- [ ] Generate protobuf stubs for all 5 languages from `config.proto`
- [ ] Implement `proto_to_dict()` / `ProtoToMap()` with presence checking
- [ ] Add protobuf bridge as optional dependency per language
- [ ] Add compliance tests for proto round-trip and presence semantics

### RemoteProvider (v0.2)

- [ ] Define RemoteProvider API in each language HLD
- [ ] Implement polling / streaming config fetch
- [ ] Handle connection failures gracefully (fall back to lower layers)
- [ ] Add compliance tests for remote override precedence

### Code Generation Pipeline (v0.2)

- [ ] Decide: Buf vs raw protoc
- [ ] Build standalone generator from descriptor set + FieldMeta
- [ ] Generate per-language typed config classes
- [ ] Generate JSON Schema, default values file, and docs

### Schema Repository Extraction (v0.2+)

- [ ] Extract `schema/proto/` to shared schema repo when other repos depend on it

---

## Known Issues

- `CLAUDE.md` currently still describes the project as pre-implementation and should be updated.
- No CI pipeline configured yet.
- No root Makefile with cross-language test targets.
