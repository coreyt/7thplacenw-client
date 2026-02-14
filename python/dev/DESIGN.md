# Python Client — High-Level Design

## Language Version

Python 3.10+ (for `match` statements, `|` union types, and `dataclasses`
improvements). Type annotations throughout; `mypy --strict` clean.

## Dependencies

| Package   | Purpose                            | Why This One              |
|-----------|------------------------------------|---------------------------|
| pydantic  | Schema definition + validation     | Industry standard, fast (Rust core in v2) |
| pyyaml    | YAML file parsing                  | Ubiquitous, C-accelerated |

No other runtime dependencies. Keep the surface tight.

**Dev dependencies:** pytest, mypy, ruff.

## Module Layout

```
python/
├── dev/
│   └── DESIGN.md              # (this file)
├── src/
│   └── seventhplace/
│       ├── __init__.py        # Public API re-exports
│       ├── manager.py         # ConfigManager — orchestrates load
│       ├── merge.py           # deep_merge() utility
│       ├── providers/
│       │   ├── __init__.py
│       │   ├── defaults.py    # DefaultProvider (from schema)
│       │   ├── file.py        # FileProvider (YAML/JSON/TOML)
│       │   ├── env.py         # EnvProvider (PREFIX__KEY mapping)
│       │   └── cli.py         # CLIProvider (argparse integration)
│       ├── schema.py          # Base schema utilities + sensitive marker
│       └── errors.py          # Typed exceptions
├── tests/
│   ├── conftest.py            # Shared fixtures, env cleanup
│   ├── test_compliance.py     # Maps to test/COMPLIANCE.md TC-01..TC-20
│   ├── test_merge.py          # Unit tests for deep_merge
│   └── test_providers.py      # Unit tests per provider
├── pyproject.toml
└── Makefile
```

## Key Design Decisions

### Schema Definition

Users define their config as a Pydantic `BaseModel` with `frozen=True`.
Default values in the model ARE the "Defaults" layer — no separate
defaults provider needed.

```python
from pydantic import BaseModel, Field, SecretStr

class AlgoConfig(BaseModel, frozen=True):
    friction: float = 0.85
    max_retries: int = 3
    timeout_ms: int = 5000
    threshold: float = 0.65

class DbConfig(BaseModel, frozen=True):
    host: str = "localhost"
    port: int = 5432
    pool_size: int = 10

class SecretsConfig(BaseModel, frozen=True):
    api_key: SecretStr = SecretStr("")

class AppConfig(BaseModel, frozen=True):
    app_name: str = "7thplace"
    env: str = "production"
    algo: AlgoConfig = Field(default_factory=AlgoConfig)
    db: DbConfig = Field(default_factory=DbConfig)
    secrets: SecretsConfig = Field(default_factory=SecretsConfig)
```

`frozen=True` gives us immutability for free. `SecretStr` gives us
redaction for free — `repr()` shows `SecretStr('**********')`.

### Load Flow

```
schema.model_dump()          → dict (defaults)
  ↓ deep_merge
FileProvider.load(path)      → dict (file overrides)
  ↓ deep_merge
EnvProvider.load(prefix)     → dict (env overrides)
  ↓ deep_merge
CLIProvider.load(args)       → dict (CLI overrides)
  ↓
Schema(**merged_dict)        → frozen, validated model
```

The merge happens entirely in dict-space. Pydantic validation runs
exactly once, at the end, on the fully-merged dict.

### Deep Merge

Recursive dict update. Non-dict values overwrite; dict values recurse.

```python
def deep_merge(base: dict, override: dict) -> dict:
    result = base.copy()
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result
```

Returns a new dict (no mutation of inputs). This is a pure function.

### Env Provider

Maps `PREFIX__SECTION__KEY` to nested dict `{"section": {"key": value}}`.
Type coercion uses `yaml.safe_load()` on the string value — this handles
ints, floats, bools, and strings without a custom parser.

Security: `yaml.safe_load` is used, never `yaml.load`. The prefix acts
as a namespace guard — only vars starting with the prefix are read.

### Path Traversal Protection

`FileProvider` resolves the file path and checks that the resolved path
does not escape a configurable base directory. Uses `pathlib.Path.resolve()`
and checks `is_relative_to()`.

### Strict vs Lenient

Pydantic v2 supports `model_config = ConfigDict(extra="forbid")` for
strict mode and `extra="ignore"` for lenient. We expose this as a
`strict: bool` parameter on `load()`.

## Performance Notes

- Pydantic v2 validation is Rust-backed — sub-millisecond for typical schemas.
- `model_dump()` is called once per load. No reflection on the access path.
- The returned model is a frozen object; field access is plain attribute
  lookup (`O(1)`).

## Error Handling

All errors raised by the library inherit from `SeventhPlaceError`:

```
SeventhPlaceError
├── ValidationError        # Schema validation failed
├── FileNotFoundError      # Required file missing
├── PathTraversalError     # Security violation
└── ParseError             # YAML/JSON/TOML syntax error
```

Validation errors include the field path and expected type but never
include the raw value (to avoid leaking secrets in logs).

## Bridge Integration

The Python client supports both bridges:

### JSON Bridge (Default)

YAML/JSON files are parsed via `yaml.safe_load()` into `dict` and fed
directly into the merge pipeline. This is the default path for local
config files and REST-delivered configuration.

### Protobuf Bridge (Optional)

When the `protobuf` extra is installed (`pip install seventhplace[protobuf]`),
the library accepts protobuf binary bytes from a control-plane or
remote source. The flow:

```python
# protoc-generated stub
from seventhplace.generated import config_pb2

# Deserialize proto → extract present fields → dict → merge pipeline
msg = config_pb2.AppConfig()
msg.ParseFromString(proto_bytes)
override = proto_to_dict(msg)  # only includes has_*() == True fields
```

`proto_to_dict()` checks `HasField()` / `ListFields()` to respect
the presence semantics required by our merge model (see
`dev/GOLDEN_SCHEMA.md` — proto3 zero-value problem).

The protobuf dependency is optional. Teams using only local YAML files
never import it.

### Schema Generation

The Golden Schema (`schema/proto/seventhplace/config.proto`) will
eventually generate (deferred to v0.2):

- `src/seventhplace/generated/config_pb2.py` — protobuf stubs
- Pydantic models generated from `FieldMeta` annotations

For v0.1, the Pydantic models are hand-written. The `.proto` file is the
canonical reference for keeping them in sync across languages.

## Packaging

Published to PyPI as `seventhplace`. Installed via:

```
pip install seventhplace
pip install seventhplace[protobuf]   # with proto bridge support
```
