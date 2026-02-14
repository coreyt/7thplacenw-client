# 7th Place NW — Architecture

## Overview

7thplace is a cross-platform Layered Configuration Manager. This repo
(`7thplacenw-client`) provides idiomatic client libraries for five languages:
Python, TypeScript, Go, C#, and C++.

Two sibling repositories complete the ecosystem:

- **control-plane** — orchestration, schema registry, remote config serving
- **managed-services** — hosted infrastructure (feature flags, audit, etc.)

The client libraries are intentionally standalone. They must function without
the control plane or managed services; those integrations are additive.

---

## v0.1 Scope

The architecture describes the full vision. v0.1 delivers the **local
configuration core** — enough to replace magic numbers with typed,
layered, immutable config in all five languages.

### In Scope (v0.1)

| Feature                  | Detail                                         |
|--------------------------|-------------------------------------------------|
| DefaultProvider          | Schema struct defaults as the base layer        |
| FileProvider             | YAML/JSON files via the JSON bridge             |
| EnvProvider              | `PREFIX__SECTION__KEY` mapping with type coercion |
| CLIProvider              | Language-native argument parsing                |
| Deep merge               | Partial overrides preserve sibling keys         |
| Validation               | Type checking + constraint enforcement at load  |
| Immutability             | Frozen config objects post-load                 |
| Sensitive field redaction| Secrets masked in repr/toString/print           |
| Security                 | Path traversal protection, no eval, no leaks    |
| Compliance suite         | All TC-01 through TC-20 passing in all languages|
| Hand-written schemas     | Per-language typed config classes written by hand|

### Deferred (v0.2+)

| Feature                  | Rationale                                       |
|--------------------------|-------------------------------------------------|
| Protobuf bridge          | Requires proto stubs + codegen pipeline          |
| RemoteProvider           | Depends on control-plane (separate repo)        |
| Code generation pipeline | Build hand-written implementations first, then automate |
| JSON Schema generation   | Nice-to-have; editors work fine with typed schemas |
| Buf / protoc tooling     | Decision deferred until codegen is in scope      |
| Schema repo extraction   | Only needed when control-plane consumes the schema |

### Reference Implementation Order

Python is the reference implementation. It will be completed first and
used to validate the compliance suite. The remaining languages follow
in this order: TypeScript, Go, C#, C++. Each language must pass the
full compliance suite before the next one begins.

**Rationale:** Python + Pydantic provides the fastest iteration cycle.
Pydantic handles validation, immutability, and sensitive field redaction
natively, letting us focus on the merge pipeline and provider logic.
Once the compliance suite is proven against Python, other languages
implement against a known-good behavioral spec.

---

## Core Problem

Magic numbers and buried constants make code fragile, untestable, and opaque.
Configuration should be:

1. **Named** — `config.algo.friction`, never a bare `0.85`.
2. **Typed** — a `float` field rejects `"five"` at load time, not mid-run.
3. **Layered** — sensible defaults, overrideable by file, env, or CLI.
4. **Immutable** — once loaded, the config object does not change.
5. **Auditable** — you can inspect exactly which layer set each value.

---

## Three-Tier Architecture

The system is organized into three tiers that separate **human intent**
from **transport mechanism** from **runtime execution**:

```
┌─────────────────────────────────────────────────────────┐
│                    GOLDEN SCHEMA                        │
│              (source of truth — .proto)                  │
│                                                         │
│   Types + Field Numbers + Defaults + Constraints        │
│   + Sensitivity Annotations + Documentation             │
└────────────────┬────────────────────┬───────────────────┘
                 │                    │
          ┌──────┴──────┐     ┌──────┴──────┐
          │ JSON Bridge │     │Proto Bridge │
          │ Human-facing│     │Machine-facing│
          └──────┬──────┘     └──────┬──────┘
                 │                    │
          ┌──────┴────────────────────┴──────┐
          │       CLIENT CONSUMPTION          │
          │   Typed, frozen, zero-cost        │
          └───────────────────────────────────┘
```

**Tier 1: Golden Schema** — An annotated proto3 file that defines types,
field numbers, default values, constraints, and sensitivity markers.
The single source of truth from which all other artifacts are generated.
See [GOLDEN_SCHEMA.md](GOLDEN_SCHEMA.md).

**Tier 2: The Bridge** — A multi-format transport layer supporting JSON
(for human authoring, web dashboards, CI/CD) and Protobuf (for
control-plane transport, cross-service sync, audit snapshots).
See [BRIDGE.md](BRIDGE.md).

**Tier 3: Client Consumption** — Language-native typed objects with
zero-cost field access. The client never knows or cares which bridge
delivered the data. See per-language `dev/DESIGN.md` files.

### Key Insight: The Bridge Is Not Just Serialization

The bridge is the **translation layer between how config is authored
and how config is consumed**. It is NOT merely a serialization format
choice. The JSON bridge serves the authoring side (humans writing YAML
files, dashboards pushing JSON over REST, CI templates injecting
values). The protobuf bridge serves the transport side (control-plane
distributing config to thousands of clients, simulation rigs receiving
binary-efficient payloads, audit systems logging compact snapshots).
Both bridges produce the same intermediate representation. Both converge
into the same merge-validate-freeze pipeline. Both produce identical
typed config objects. The client code is bridge-agnostic.

### Key Insight: Proto3's Zero-Value Problem

Proto3 eliminated explicit default values — every field defaults to its
zero-value (`0`, `0.0`, `""`, `false`). This is fundamentally at odds
with a configuration system whose entire purpose is meaningful defaults
like `friction: 0.85`. In proto3, an unset `friction` field would
silently become `0.0`, and there is no way to distinguish "the user
explicitly set 0.0" from "the user didn't set this field."

This breaks merge semantics: if a higher layer sends a proto message
with `friction` unset, the merge layer cannot tell whether to keep the
lower layer's value or override it with zero.

**Solution:** We use proto3's `optional` keyword (available since 3.15)
on every config field. This generates `has_*()` presence accessors. The
bridge checks presence before including a field in the override dict.
Additionally, our custom `FieldMeta` options carry the real default
values (e.g., `default_value: "0.85"`) that proto3 cannot express
natively. The codegen pipeline reads these annotations to bake defaults
into the generated typed config classes.

---

## Foundational Concepts

### The Waterfall (Precedence Order)

Each layer overrides the one below it. Lower layers provide safety nets;
higher layers provide flexibility.

```
Lowest priority                          Highest priority
    |                                        |
    v                                        v
 Defaults  →  Config File  →  Env Vars  →  CLI Args
```

1. **Defaults** — Hardcoded in the schema struct/class. These are the
   "algorithm-level" constants that would otherwise be magic numbers.
   Generated from the Golden Schema's `FieldMeta.default_value`.
2. **Config File** — YAML, TOML, or JSON (via the JSON Bridge).
   For structured, versioned settings.
3. **Environment Variables** — Flat key-value. Best for secrets and CI/CD.
   Uses the double-underscore (`__`) convention to represent nesting:
   `MYAPP__ALGO__FRICTION` maps to `algo.friction`.
4. **CLI Arguments** — The "final word" for a specific execution.

When a control-plane is involved, a **Remote** layer sits between File
and Env (delivered via the Protobuf Bridge):

```
Defaults → File (JSON Bridge) → Remote (Proto Bridge) → Env → CLI
```

### Schema-First Design

Every implementation defines configuration as a **typed structure** (struct,
class, dataclass, interface) with default values baked in. This structure IS
the documentation of available knobs. Raw dictionaries and untyped maps are
never exposed to consumer code.

The Golden Schema (annotated proto3) is the master definition from which
these per-language typed structures are generated. The generation pipeline
ensures all five languages have structurally equivalent schemas with
identical defaults and constraints.

### Deep Merge

When a higher-precedence layer provides a partial override of a nested
section, it must overlay only the specified keys — not replace the entire
subtree. Example:

```yaml
# Defaults define:           # File overrides only friction:
algo:                         algo:
  friction: 0.85                friction: 0.72
  max_retries: 3
  timeout_ms: 5000

# Result:
algo:
  friction: 0.72       # overridden
  max_retries: 3       # preserved
  timeout_ms: 5000     # preserved
```

### Immutability

After `load()` returns, the config object is frozen. No field may be mutated.
This eliminates an entire class of concurrency bugs and makes the config safe
to share across threads/goroutines/tasks without synchronization.

**Load-Once, Read-Many:** The client must be restarted or explicitly
reloaded to pick up changes. This is a feature — an experiment runs with
a consistent snapshot of configuration. No mid-run value drift that
corrupts results. No concurrency hazards from config mutation.

---

## API Contract

Every language implementation must expose this **behavioral** surface.
The exact syntax varies by language idiom (see Language Idiom Strategy
below), but the concepts are constant.

### Types

| Concept          | Purpose                                              |
|------------------|------------------------------------------------------|
| **Schema**       | Typed struct/class with default values               |
| **ConfigManager**| Entry point: orchestrates loading and merging        |
| **Provider**     | A source of config data (file, env, CLI, remote)     |
| **LoadResult**   | The frozen, validated config object                  |

### Operations

The load operation combines providers in waterfall order, validates,
and freezes. The API shape is idiomatic per language:

| Language   | Load API Style                                  |
|------------|--------------------------------------------------|
| Python     | `ConfigManager().add_provider(...).load()`       |
| TypeScript | `ConfigManager().addProvider(...).load()`        |
| Go         | `seventhplace.Load[T](...functional options)`    |
| C#         | `ConfigManager.Load<T>(options => { ... })`      |
| C++        | `seventhplace::load<T>(...functional options)`   |

All five converge on the same pipeline: **register sources → merge →
validate → freeze → return typed object**. The behavioral contract
(test/COMPLIANCE.md) is the authoritative specification, not the API
shape.

Providers are pluggable. The built-in providers are:

| Provider        | Reads From               | Bridge Used     | Nesting Strategy         |
|-----------------|--------------------------|-----------------|--------------------------|
| DefaultProvider | Schema struct defaults    | None            | Native struct fields     |
| FileProvider    | YAML / TOML / JSON file  | JSON Bridge     | Native nesting           |
| EnvProvider     | `os.environ` / `getenv`  | None            | `PREFIX__SECTION__KEY`   |
| CLIProvider     | Argument parser          | None            | Language-native flags    |
| RemoteProvider  | Control-plane            | Proto Bridge    | Protobuf deserialization |

### Validation

Validation runs once, at load time. It checks:

1. **Type correctness** — every field matches its declared type.
2. **Constraints** — range, format, enum membership (from FieldMeta).
3. **Required fields** — fields without defaults must be provided by some layer.

If validation fails, `load()` returns a clear, structured error — never a
partially-constructed config object.

---

## Security Constraints

These are non-negotiable across all implementations:

| Constraint                        | Rationale                              |
|-----------------------------------|----------------------------------------|
| No `eval()` or dynamic execution  | Prevents injection via config values   |
| Sensitive field redaction          | `__repr__` / `toString` masks secrets  |
| File permission checks (optional) | Warn on world-readable secret files    |
| No secret values in error messages | Validation errors show key, not value  |
| Path traversal protection          | FileProvider rejects `../../etc/passwd`|

---

## Performance Model

Configuration loads once at startup. The hot path (reading values) must be
zero-cost or near-zero-cost:

| Phase     | Acceptable Cost | Strategy                              |
|-----------|-----------------|---------------------------------------|
| **Load**  | Milliseconds    | Parse files, merge dicts, validate    |
| **Access**| Zero-cost       | Direct struct field access, no lookup |

This means the load phase can use dynamic containers (dicts, JSON objects,
maps) for merging, but the final output must be a **static, typed structure**.
In C++ this means stack-allocated structs. In Go, plain structs. In C#,
POCOs. The "JSON intermediate → static struct" pattern applies universally.

The bridge introduces no additional runtime cost: deserialization happens
during the load phase, and the resulting dict/map is immediately consumed
by the merge pipeline. No bridge artifacts persist after `load()` returns.

---

## Language Idiom Strategy

Each implementation respects the native idioms of its language. We do NOT
force a single API shape across all five languages. Instead, we maintain a
shared **behavioral contract** (see `test/COMPLIANCE.md`) while allowing
idiomatic divergence in API surface.

| Language   | Schema Tool              | Merge Strategy                  | Key Idiom                    |
|------------|--------------------------|----------------------------------|------------------------------|
| Python     | Pydantic / dataclasses   | Recursive dict update            | `model_dump()` → merge → validate |
| TypeScript | Interface + zod          | Recursive object spread          | Schema-as-type-guard         |
| Go         | Struct + tags            | Reflect-based or manual merge    | Functional options / Viper   |
| C#         | POCO + DataAnnotations   | Native `ConfigurationBuilder`    | `IOptions<T>` binding        |
| C++        | Struct + nlohmann/json   | Recursive JSON merge → thaw      | JSON intermediate → stack struct |

---

## Repository Layout

```
7thplacenw-client/
├── dev/                        # Repo-level architecture & design docs
│   ├── ARCHITECTURE.md         # (this file)
│   ├── GOLDEN_SCHEMA.md        # Three-tier design + trade-offs
│   ├── BRIDGE.md               # JSON + Protobuf bridge specs
│   └── PORTABILITY.md          # Cross-language implementation matrix
├── schema/
│   └── proto/seventhplace/     # Golden Schema proto definitions
│       ├── options.proto        # Custom FieldMeta options
│       └── config.proto         # The master configuration schema
├── test/                       # Cross-language compliance specs
│   ├── COMPLIANCE.md           # Behavioral contract all impls must pass
│   └── fixtures/               # Shared test data (YAML, JSON, env files)
├── python/
│   ├── dev/                    # Python-specific design docs
│   ├── src/seventhplace/       # Source
│   └── tests/                  # Tests
├── typescript/
│   ├── dev/
│   ├── src/
│   └── tests/
├── go/
│   ├── dev/
│   └── ...                     # Go-idiomatic layout (no src/)
├── csharp/
│   ├── dev/
│   ├── src/
│   └── tests/
└── cpp/
    ├── dev/
    ├── include/seventhplace/   # Public headers
    ├── src/                    # Implementation
    └── tests/
```

Each language directory is self-contained: it has its own build system,
dependency manifest, and test runner. The `schema/` directory holds the
Golden Schema proto files that generate artifacts for all languages.
The `test/` directory holds the shared compliance specification and
fixture data that all implementations must satisfy.

---

## Versioning

All five libraries share a single version number. A release of `v1.2.0` means
all five languages implement the `v1.2.0` compliance spec. If a language
implementation lags, it is not released until it catches up.

The Golden Schema uses protobuf field numbers for wire-compatible evolution.
Adding a new field (with a new field number) is a non-breaking change.
Removing a field is a breaking change and requires a major version bump.
