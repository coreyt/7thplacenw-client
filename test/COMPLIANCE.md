# 7th Place NW — Compliance Test Specification

## Purpose

This document defines the **behavioral contract** that every language
implementation must satisfy. Tests are described in terms of inputs (fixtures,
env vars, CLI args) and expected outputs. Each language translates these into
its native test framework.

Shared fixture files live in `test/fixtures/`. Implementations load these
files during their compliance test suites.

---

## Fixture Schema

All compliance tests use the following schema. Each language defines this as
its native typed structure (struct, class, dataclass, interface).

```yaml
# Canonical schema with defaults
app_name: "7thplace"
env: "production"
algo:
  friction: 0.85
  max_retries: 3
  timeout_ms: 5000
  threshold: 0.65
db:
  host: "localhost"
  port: 5432
  pool_size: 10
secrets:
  api_key: ""          # sensitive field — must be redacted in repr/toString
```

---

## Test Cases

### TC-01: Defaults Only

**Given:** No config file, no env vars, no CLI args.
**When:** `load()` is called.
**Then:** Every field matches the schema defaults exactly.

```
config.app_name     == "7thplace"
config.algo.friction == 0.85
config.db.port      == 5432
```

---

### TC-02: File Override — Flat Field

**Given:** Fixture file `test/fixtures/override_flat.yaml`.
**When:** `load(file="override_flat.yaml")` is called.
**Then:** Only the specified field is overridden; all others retain defaults.

```
config.app_name == "custom-app"    # overridden
config.env      == "production"    # default preserved
```

---

### TC-03: File Override — Deep Merge

**Given:** Fixture file `test/fixtures/override_nested.yaml`.
**When:** `load(file="override_nested.yaml")` is called.
**Then:** Only the nested key is overridden; sibling keys in the same
section are preserved.

```
config.algo.friction    == 0.72    # overridden
config.algo.max_retries == 3      # default preserved
config.algo.timeout_ms  == 5000   # default preserved
```

---

### TC-04: Env Override

**Given:** Environment variable `SEVENTHPLACE__ALGO__FRICTION=0.60`.
**When:** `load()` is called.
**Then:** The env value overrides the default.

```
config.algo.friction == 0.60
```

---

### TC-05: Env Overrides File

**Given:**
- Fixture file `test/fixtures/override_nested.yaml` sets `algo.friction: 0.72`.
- Env var `SEVENTHPLACE__ALGO__FRICTION=0.60`.

**When:** `load(file="override_nested.yaml")` is called.
**Then:** Env wins over file.

```
config.algo.friction == 0.60
```

---

### TC-06: Env Nesting — Multi-Level

**Given:** `SEVENTHPLACE__DB__HOST=db.prod.internal`
**When:** `load()` is called.
**Then:**

```
config.db.host      == "db.prod.internal"   # overridden
config.db.port      == 5432                 # default preserved
config.db.pool_size == 10                   # default preserved
```

---

### TC-07: Type Coercion from Env

**Given:** `SEVENTHPLACE__DB__PORT=9999`
**When:** `load()` is called.
**Then:** The string `"9999"` is coerced to integer `9999`.

```
config.db.port == 9999   # int, not string
```

---

### TC-08: Type Coercion Failure

**Given:** `SEVENTHPLACE__DB__PORT=not_a_number`
**When:** `load()` is called.
**Then:** `load()` returns a validation error. The error message must:
- Identify the field (`db.port`)
- Identify the expected type (`int` / `integer`)
- NOT include the invalid value in a way that could leak secrets

---

### TC-09: Missing Optional File

**Given:** File path `nonexistent.yaml` (does not exist).
**When:** `load(file="nonexistent.yaml")` is called with file marked optional.
**Then:** No error. Config is populated from defaults + other layers.

---

### TC-10: Missing Required File

**Given:** File path `nonexistent.yaml` (does not exist).
**When:** `load(file="nonexistent.yaml")` is called with file marked required.
**Then:** `load()` returns a clear error indicating the file was not found.

---

### TC-11: Immutability

**Given:** A successfully loaded config object.
**When:** Consumer code attempts to mutate a field (e.g., `config.algo.friction = 0.99`).
**Then:** The mutation is rejected. The mechanism is language-specific:
- **Python:** `frozen=True` on Pydantic model / `@dataclass(frozen=True)`.
- **TypeScript:** `Readonly<T>` / `Object.freeze()`.
- **Go:** Unexported fields with getter methods, or returned by value.
- **C#:** `init`-only setters / `record` types.
- **C++:** `const` reference from accessor.

---

### TC-12: Sensitive Field Redaction

**Given:** Schema has `secrets.api_key` marked as sensitive.
Config loaded with `SEVENTHPLACE__SECRETS__API_KEY=sk-12345`.
**When:** The config object is converted to string (`repr`, `toString`,
`fmt.Stringer`, `operator<<`).
**Then:** The output contains `api_key: "***"` (or similar redaction),
never the actual value `sk-12345`.

---

### TC-13: Full Precedence Stack

**Given:**
- Schema default: `algo.friction = 0.85`
- File (`test/fixtures/override_nested.yaml`): `algo.friction = 0.72`
- Env: `SEVENTHPLACE__ALGO__FRICTION=0.60`

**When:** `load()` with all three layers active.
**Then:**

```
config.algo.friction == 0.60    # env wins
```

Remove env var, reload:

```
config.algo.friction == 0.72    # file wins
```

Remove file, reload:

```
config.algo.friction == 0.85    # default
```

---

### TC-14: Unknown Keys — Strict Mode

**Given:** Fixture file `test/fixtures/unknown_keys.yaml` contains a key
`algo.nonexistent_param: 42` not in the schema.
**When:** `load(file="unknown_keys.yaml", strict=true)` is called.
**Then:** `load()` returns a validation error naming the unknown key.

---

### TC-15: Unknown Keys — Lenient Mode

**Given:** Same fixture as TC-14.
**When:** `load(file="unknown_keys.yaml", strict=false)` is called.
**Then:** Unknown keys are silently ignored. Known keys are loaded normally.

---

### TC-16: Empty File

**Given:** Fixture file `test/fixtures/empty.yaml` exists but is empty.
**When:** `load(file="empty.yaml")` is called.
**Then:** No error. All fields retain defaults.

---

### TC-17: Path Traversal Rejection

**Given:** File path `"../../etc/passwd"`.
**When:** `load(file="../../etc/passwd")` is called.
**Then:** `load()` returns a security error. The file is NOT read.

---

### TC-18: Multiple File Merge

**Given:** Two fixture files loaded in order:
1. `test/fixtures/override_flat.yaml` (sets `app_name`)
2. `test/fixtures/override_nested.yaml` (sets `algo.friction`)

**When:** `load(files=[file1, file2])` is called.
**Then:** Both overrides are applied. Later files take precedence over
earlier files for conflicting keys.

```
config.app_name        == "custom-app"  # from file1
config.algo.friction   == 0.72          # from file2
config.algo.max_retries == 3            # default preserved
```

---

## Fixture Inventory

| File                         | Contents                                  |
|------------------------------|-------------------------------------------|
| `override_flat.yaml`         | `app_name: "custom-app"`                  |
| `override_nested.yaml`       | `algo: { friction: 0.72 }`                |
| `unknown_keys.yaml`          | `algo: { friction: 0.72, nonexistent_param: 42 }` |
| `empty.yaml`                 | (empty file)                              |
| `full_override.yaml`         | All fields specified with non-default values |
| `type_mismatch.yaml`         | `db: { port: "not_a_number" }`            |

---

## Env Var Prefix

All compliance tests use the prefix `SEVENTHPLACE__`. Implementations must
allow the prefix to be configurable, but default to `SEVENTHPLACE__`.

---

## Running Compliance

Each language implementation provides a test target that runs its compliance
suite. The root `Makefile` (or CI script) can execute all of them:

```
make test-compliance-python
make test-compliance-typescript
make test-compliance-go
make test-compliance-csharp
make test-compliance-cpp
```
