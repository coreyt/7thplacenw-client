# PROGRESS.md — Project Status

## Current Phase

**v0.1: Local Configuration Core — Pre-implementation**

Design is complete. No implementation code exists yet. Next step:
Python reference implementation.

---

## Completed

### Milestone: Architecture & Design (Done)

- [x] Core architecture document (`dev/ARCHITECTURE.md`)
- [x] Three-tier design: Golden Schema, Bridge, Client Consumption
- [x] v0.1 scope defined (in-scope vs deferred features)
- [x] Reference implementation order: Python first, then TS/Go/C#/C++
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
- [x] All open design questions resolved (see `dev/GOLDEN_SCHEMA.md`)
- [x] Cross-document consistency audit and fixes
- [x] User needs and requirements documented (`dev/USER_NEEDS.md`, `dev/REQUIREMENTS.md`)
- [x] Agent onboarding file (`CLAUDE.md`)

### Key Design Decisions Made

| Decision | Resolution |
|----------|-----------|
| v0.1 scope | Local config core only (4 providers, JSON bridge) |
| Schema strategy | Hand-written per language; proto is the spec |
| Reference language | Python (Pydantic carries validation/immutability) |
| Env prefix API | Bare prefix (`"SEVENTHPLACE"`), library appends `__` |
| Proto version | Proto3 with `optional` keyword for presence |
| Schema location | This repo (extract when control-plane needs it) |
| Codegen tooling | Deferred to v0.2; standalone generator preferred |

---

## In Progress

Nothing currently in progress. Ready to begin v0.1 implementation.

---

## Next Up (v0.1 Implementation)

### Python Reference Implementation
- [ ] `src/seventhplace/merge.py` — `deep_merge()` utility
- [ ] `src/seventhplace/errors.py` — Exception hierarchy
- [ ] `src/seventhplace/schema.py` — Base schema utilities
- [ ] `src/seventhplace/providers/defaults.py` — DefaultProvider
- [ ] `src/seventhplace/providers/file.py` — FileProvider (YAML/JSON + path guard)
- [ ] `src/seventhplace/providers/env.py` — EnvProvider (prefix mapping + coercion)
- [ ] `src/seventhplace/providers/cli.py` — CLIProvider (argparse)
- [ ] `src/seventhplace/manager.py` — ConfigManager (orchestrates load pipeline)
- [ ] `tests/test_compliance.py` — TC-01 through TC-20
- [ ] `tests/test_merge.py` — deep_merge unit tests
- [ ] `tests/test_providers.py` — Per-provider unit tests
- [ ] `pyproject.toml` — Dependencies, build config
- [ ] `Makefile` — test-compliance-python target

### Subsequent Language Implementations
- [ ] TypeScript (zod + js-yaml, vitest)
- [ ] Go (struct tags + yaml.v3, go-playground/validator)
- [ ] C# (.NET ConfigurationBuilder, xUnit)
- [ ] C++ (nlohmann/json + yaml-cpp, Catch2)

### Cross-Language
- [ ] Root Makefile with `test-compliance-*` targets
- [ ] CI pipeline (run all compliance suites)

---

## Future Work (v0.2+)

These items are designed but explicitly deferred. The architecture and
design docs describe them in detail — they are not lost, just not in
the v0.1 implementation scope.

### Protobuf Bridge (v0.2)

Enables machine-to-machine config transport (control-plane to client,
cross-service sync, audit snapshots). Design is in `dev/BRIDGE.md` §
Protobuf Bridge and `dev/GOLDEN_SCHEMA.md` § The Solution.

- [ ] Generate protobuf stubs for all 5 languages from `config.proto`
- [ ] Implement `proto_to_dict()` / `ProtoToMap()` with `has_*()` presence
      checking to solve the proto3 zero-value problem
- [ ] Add protobuf bridge as optional dependency per language
  - Python: `pip install seventhplace[protobuf]`
  - TypeScript: `@bufbuild/protobuf` peer dep
  - Go: built-in (static linking, no cost)
  - C#: `SeventhPlace.Config.Proto` NuGet package
  - C++: `SEVENTHPLACE_ENABLE_PROTO` CMake option
- [ ] Add compliance tests for proto round-trip and presence semantics

### RemoteProvider (v0.2)

Sits between File and Env in the waterfall. Fetches config from the
control-plane via the protobuf bridge. Design is in `dev/ARCHITECTURE.md`
§ The Waterfall.

- [ ] Define RemoteProvider API in each language HLD
- [ ] Implement polling / streaming config fetch
- [ ] Handle connection failures gracefully (fall back to lower layers)
- [ ] Add compliance tests for remote override precedence

### Code Generation Pipeline (v0.2)

Automates the hand-written schemas. Design is in `dev/GOLDEN_SCHEMA.md`
§ What the Golden Schema Generates.

- [ ] Decide: Buf vs raw protoc (evaluate Buf's linting + breaking-change detection)
- [ ] Build standalone generator that reads proto descriptor set + FieldMeta
- [ ] Generate per-language typed config classes:
  - Python: Pydantic `BaseModel` with `frozen=True`
  - TypeScript: zod schema with `.default()` values
  - Go: struct with `yaml`, `env`, `validate`, `default` tags
  - C#: `record` with `DataAnnotation` attributes
  - C++: struct with `NLOHMANN_DEFINE` macros
- [ ] Generate JSON Schema from FieldMeta (editor autocomplete, CI validation)
- [ ] Generate default values YAML file
- [ ] Generate documentation from `FieldMeta.description`

### Schema Repository Extraction (v0.2+)

When the control-plane and managed-services repos need to consume the
Golden Schema, extract `schema/proto/` to a shared `7thplacenw-schema`
repo. Until then, it stays here to avoid coordination overhead.

### Additional Future Considerations

- **Hot-reload API** — Explicit opt-in reload that produces a new frozen
  config object (old one remains valid for code still referencing it).
  Mentioned in `dev/GOLDEN_SCHEMA.md` § Load-Once, Read-Many.
- **TOML file support** — FileProvider currently handles YAML and JSON.
  TOML may be added later (mentioned in `dev/BRIDGE.md`).
- **Lazy section loading** — For large configs, load sections on demand
  to reduce startup time (mentioned in `dev/GOLDEN_SCHEMA.md`).
- **File permission checks** — Warn on world-readable secret files
  (mentioned in `dev/ARCHITECTURE.md` § Security Constraints as optional).

---

## Known Issues

- `README.md` documentation table still references TC-01..TC-18 (should
  be TC-01..TC-20) — fix pending
- No CI pipeline configured yet
- No root Makefile with cross-language test targets
