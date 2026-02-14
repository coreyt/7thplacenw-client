# Requirements

Every requirement traces to one or more user needs (`dev/USER_NEEDS.md`)
and, where applicable, to compliance test cases (`test/COMPLIANCE.md`).

---

## Functional Requirements

### FR-01: Schema-First Configuration

**Traces to:** UN-01

The configuration contract is defined as a typed structure (struct,
class, dataclass, record) with default values baked in. Every field
has a name, a type, and a default. Field access is direct (attribute,
property, member) — never string-keyed lookup.

| Compliance Tests | What They Verify |
|------------------|------------------|
| TC-01 | Defaults are populated when no external input is provided |

---

### FR-02: Four-Layer Waterfall

**Traces to:** UN-02, UN-03

The system supports four provider layers loaded in fixed precedence:

```
Defaults (lowest) → File → Env → CLI (highest)
```

Each layer is optional. When active, a higher layer overrides the lower.

| Compliance Tests | What They Verify |
|------------------|------------------|
| TC-01 | Defaults alone |
| TC-02 | File overrides defaults |
| TC-04, TC-05 | Env overrides file and defaults |
| TC-13 | Full stack (defaults + file + env) |
| TC-19 | CLI overrides env (completes the waterfall) |

---

### FR-03: Deep Merge

**Traces to:** UN-04

Partial overrides of nested sections overlay only the specified keys.
Sibling keys in the same section are preserved.

| Compliance Tests | What They Verify |
|------------------|------------------|
| TC-03 | Nested override preserves siblings |
| TC-18 | Multiple files each contributing partial overrides |

---

### FR-04: Environment Variable Mapping

**Traces to:** UN-02

Environment variables prefixed with `{PREFIX}__` are mapped to config
fields. Double-underscore separates nesting levels. The prefix is
configurable; default is `SEVENTHPLACE`. String values are coerced to
the target field's type.

The API accepts a bare prefix (e.g., `"SEVENTHPLACE"`). The library
appends `__` internally. See `dev/BRIDGE.md` § Environment Variable
Convention for the full specification.

| Compliance Tests | What They Verify |
|------------------|------------------|
| TC-04 | Single env var override |
| TC-05 | Env overrides file |
| TC-06 | Multi-level nesting |
| TC-07 | Type coercion (string to int) |
| TC-08 | Type coercion failure |

---

### FR-05: CLI Argument Override

**Traces to:** UN-02, UN-03

CLI arguments are the highest-priority layer. Flag syntax is
language-idiomatic.

| Compliance Tests | What They Verify |
|------------------|------------------|
| TC-19 | CLI overrides env |

---

### FR-06: Type Validation

**Traces to:** UN-05

All fields are type-checked at load time. Type mismatches produce
structured errors with the field path and expected type. The raw
invalid value is not included in the error message.

| Compliance Tests | What They Verify |
|------------------|------------------|
| TC-08 | Type coercion failure produces clear error |

---

### FR-07: Constraint Validation

**Traces to:** UN-05

Numeric fields support min/max constraints. String fields support
pattern constraints. Enum fields validate against an allowed-values
list.

| Compliance Tests | What They Verify |
|------------------|------------------|
| TC-20 | Invalid enum value is rejected |

**Note:** The compliance suite does not yet test numeric range or
pattern constraints directly. These are validated by the schema
tooling (Pydantic `Field(ge=, le=)`, zod `.min().max()`, Go
`validate:"min=,max="`, C# `[Range()]`, C++ `validate()`). Adding
explicit range constraint tests is recommended as a follow-up.

---

### FR-08: Immutability

**Traces to:** UN-06

The config object returned by `load()` cannot be mutated. The
mechanism is language-idiomatic:

| Language | Mechanism |
|----------|-----------|
| Python | `frozen=True` on Pydantic model |
| TypeScript | `Object.freeze()` + `Readonly<T>` |
| Go | Return by value (not pointer) |
| C# | `record` with `init` setters |
| C++ | `const` qualifier |

| Compliance Tests | What They Verify |
|------------------|------------------|
| TC-11 | Mutation attempt is rejected |

---

### FR-09: Sensitive Field Redaction

**Traces to:** UN-07

Fields marked as sensitive are masked in string representations. The
redaction marker is `***` or language-equivalent. Error messages never
include raw values of any field (sensitive or otherwise).

| Compliance Tests | What They Verify |
|------------------|------------------|
| TC-12 | Sensitive field shows redacted value in string output |

---

### FR-10: Path Traversal Protection

**Traces to:** UN-08

`FileProvider` resolves file paths and rejects any that escape the
allowed base directory. Uses language-native path resolution.

| Compliance Tests | What They Verify |
|------------------|------------------|
| TC-17 | `../../etc/passwd` is rejected with security error |

---

### FR-11: File Handling Modes

**Traces to:** UN-11

Files can be marked optional or required. Missing optional files are
silently skipped. Missing required files produce a clear error. Empty
files are handled gracefully.

| Compliance Tests | What They Verify |
|------------------|------------------|
| TC-09 | Missing optional file — no error |
| TC-10 | Missing required file — clear error |
| TC-16 | Empty file — no error, defaults preserved |

---

### FR-12: Strict and Lenient Modes

**Traces to:** UN-12

Strict mode rejects unknown keys with a validation error. Lenient
mode silently ignores unknown keys. The mode is configurable per
`load()` call.

| Compliance Tests | What They Verify |
|------------------|------------------|
| TC-14 | Unknown key in strict mode — validation error |
| TC-15 | Unknown key in lenient mode — silently ignored |

---

### FR-13: Multiple File Merge

**Traces to:** UN-04

Multiple files can be loaded in order. Later files take precedence
over earlier files for conflicting keys. Non-conflicting keys from
all files are preserved.

| Compliance Tests | What They Verify |
|------------------|------------------|
| TC-18 | Two files contributing different overrides |

---

### FR-14: Cross-Language Compliance

**Traces to:** UN-10

All five implementations pass TC-01 through TC-20 with identical
expected outputs. The compliance spec (`test/COMPLIANCE.md`) is the
authoritative behavioral contract. Shared fixture files
(`test/fixtures/`) ensure identical inputs.

---

### FR-15: Idiomatic API

**Traces to:** UN-09

Each language uses its native patterns for schema definition,
validation, immutability, and error handling. The API shape varies
(see `dev/ARCHITECTURE.md` § API Contract) but the behavioral
contract is uniform.

---

## Non-Functional Requirements

### NFR-01: Zero-Cost Access

Config field access after `load()` is direct struct/object/property
access. No dictionary lookup, no reflection, no proxy objects on the
read path.

**Traces to:** UN-01 (typed access implies direct access)

---

### NFR-02: Minimal Dependencies

Each language has at most two runtime dependencies (see per-language
HLDs for the specific packages). The protobuf bridge dependency is
optional and deferred to v0.2.

---

### NFR-03: Load-Time Performance

Config loading completes in single-digit milliseconds for typical
schemas (< 50 fields). The load phase is acceptable to be dynamic
(parsing, merging, validating). Only the access phase must be
zero-cost.

---

### NFR-04: No Dynamic Code Execution

No `eval()`, `exec()`, `Function()`, or equivalent in any language.
Config values are data, never code. This prevents injection via
config values.

**Traces to:** UN-08 (security)

---

### NFR-05: No Secrets in Error Output

Validation errors, parse errors, and all other error messages include
the field path and expected type but never include the raw value. This
applies to all fields, not just those marked sensitive.

**Traces to:** UN-07

---

## Traceability Matrix

| Requirement | User Needs | Compliance Tests |
|-------------|-----------|------------------|
| FR-01 | UN-01 | TC-01 |
| FR-02 | UN-02, UN-03 | TC-01, TC-02, TC-04, TC-05, TC-13, TC-19 |
| FR-03 | UN-04 | TC-03, TC-18 |
| FR-04 | UN-02 | TC-04, TC-05, TC-06, TC-07, TC-08 |
| FR-05 | UN-02, UN-03 | TC-19 |
| FR-06 | UN-05 | TC-08 |
| FR-07 | UN-05 | TC-20 |
| FR-08 | UN-06 | TC-11 |
| FR-09 | UN-07 | TC-12 |
| FR-10 | UN-08 | TC-17 |
| FR-11 | UN-11 | TC-09, TC-10, TC-16 |
| FR-12 | UN-12 | TC-14, TC-15 |
| FR-13 | UN-04 | TC-18 |
| FR-14 | UN-10 | TC-01..TC-20 (all) |
| FR-15 | UN-09 | (verified by code review, not test case) |
| NFR-01 | UN-01 | (verified by code review) |
| NFR-02 | — | (verified by dependency manifest) |
| NFR-03 | — | (verified by benchmark) |
| NFR-04 | UN-08 | (verified by code review) |
| NFR-05 | UN-07 | TC-08, TC-12 |

---

## Future Requirements (v0.2+)

These are not in v0.1 scope but are documented here to preserve intent.
See `PROGRESS.md` § Future Work for implementation details.

### FR-16: Protobuf Bridge (v0.2)

**Traces to:** UN-02 (override config via machine transport)

The system supports receiving config as protobuf binary bytes from a
control-plane or remote source. The protobuf bridge converts proto
messages to the intermediate dict/map representation used by the merge
pipeline. Proto3 `optional` field presence is respected — only
explicitly-set fields appear in the override.

Design: `dev/BRIDGE.md` § Protobuf Bridge, `dev/GOLDEN_SCHEMA.md` §
Proto3's Zero-Value Problem.

---

### FR-17: RemoteProvider (v0.2)

**Traces to:** UN-02

A fifth provider layer sits between File and Env in the waterfall:
`Defaults → File → Remote → Env → CLI`. Fetches config from the
control-plane via the protobuf bridge.

Design: `dev/ARCHITECTURE.md` § The Waterfall.

---

### FR-18: Code Generation from Golden Schema (v0.2)

**Traces to:** UN-10 (cross-language consistency)

Per-language typed config classes are generated from the annotated
proto file, replacing the v0.1 hand-written schemas. Ensures all five
languages have structurally equivalent schemas with identical defaults
and constraints — eliminating manual sync.

Design: `dev/GOLDEN_SCHEMA.md` § What the Golden Schema Generates.

---

### FR-19: JSON Schema Generation (v0.2)

**Traces to:** UN-01 (schema is documentation)

A JSON Schema file is generated from `FieldMeta` annotations, enabling
editor autocomplete, inline validation, and CI pre-load checks for
config files.

Design: `dev/BRIDGE.md` § JSON Schema.

---

### FR-20: Numeric Range Constraint Tests (Follow-up)

**Traces to:** UN-05, FR-07

Add compliance tests that exercise numeric `min`/`max` constraints
(e.g., `algo.friction` must be in `[0.0, 1.0]`) and string `pattern`
constraints. Currently these are enforced by per-language schema
tooling but not explicitly tested in the compliance suite.
