# The Bridge — Multi-Format Transport Layer

## Purpose

The bridge translates between **how configuration is authored** (YAML files,
dashboards, env vars) and **how configuration is consumed** (typed objects).
It supports two serialization formats that converge to the same typed output.

See [GOLDEN_SCHEMA.md](GOLDEN_SCHEMA.md) for the three-tier architecture
this sits within.

---

## Bridge Architecture

```
                    ┌──────────────────────┐
                    │    CONFIG SOURCES     │
                    │                       │
                    │  YAML files           │
                    │  JSON files           │
                    │  Env variables        │
                    │  CLI arguments        │
                    │  Web dashboard        │
                    │  Control-plane        │
                    └───┬──────────────┬────┘
                        │              │
                 ┌──────┴──────┐ ┌─────┴───────┐
                 │ JSON Bridge │ │Proto Bridge  │
                 │             │ │              │
                 │ Parse JSON  │ │ Deserialize  │
                 │ or YAML to  │ │ protobuf to  │
                 │ dict/map    │ │ dict/map     │
                 └──────┬──────┘ └──────┬──────┘
                        │               │
                        └───────┬───────┘
                                │
                    ┌───────────┴───────────┐
                    │   MERGE + VALIDATE    │
                    │                       │
                    │  deep_merge(layers)   │
                    │  schema.validate()    │
                    │  freeze()             │
                    └───────────┬───────────┘
                                │
                    ┌───────────┴───────────┐
                    │   TYPED CONFIG OBJECT │
                    │                       │
                    │   config.algo.friction│
                    └───────────────────────┘
```

Both bridges produce the **same intermediate representation** (a nested
dict/map/object). The merge-validate-freeze pipeline is bridge-agnostic.
Client code never knows which bridge was used.

---

## JSON Bridge

### Scope

The JSON bridge handles all human-readable configuration sources:
local YAML/JSON files, REST API responses from dashboards, and
CI/CD-injected configuration.

### File Formats

YAML is the primary authoring format (supports comments, multi-line
strings, anchors). JSON is accepted as a subset. TOML may be added
later.

```yaml
# config.yaml — authored by a human
algo:
  friction: 0.72       # tuned for low-energy simulation
  max_retries: 5
db:
  host: "db.staging.internal"
```

### JSON Schema (Validation)

The Golden Schema generates a JSON Schema file that provides:

1. **Editor support** — VS Code, IntelliJ, and other editors use JSON
   Schema for autocomplete and inline validation.
2. **Pre-load validation** — CI pipelines can validate config files
   against the schema before deployment.
3. **Documentation** — JSON Schema's `description` fields come from
   the Golden Schema's `FieldMeta.description`.

Generated JSON Schema (excerpt):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "app_name": {
      "type": "string",
      "default": "7thplace",
      "description": "Application identifier"
    },
    "algo": {
      "type": "object",
      "properties": {
        "friction": {
          "type": "number",
          "default": 0.85,
          "minimum": 0.0,
          "maximum": 1.0,
          "description": "Energy loss coefficient per iteration"
        }
      }
    }
  }
}
```

### JSON Bridge Flow

```
Input:  YAML file (or JSON, or REST response)
  ↓
Step 1: Parse to language-native dict/map/object.
        (PyYAML, js-yaml, yaml.v3, yaml-cpp, etc.)
  ↓
Step 2: Validate key names against JSON Schema (strict mode)
        or pass through (lenient mode).
  ↓
Step 3: Return dict/map for merge pipeline.
```

### JSON Bridge Limitations

| Limitation                    | Impact                                  |
|-------------------------------|-----------------------------------------|
| No comments in JSON           | Use YAML for authored files             |
| No binary compression         | Larger payloads vs. protobuf            |
| String-keyed — renaming breaks | Schema evolution requires migration     |
| No field ordering guarantee   | Merge order must be explicit            |
| Parse cost ~5-10x protobuf    | Irrelevant for config sizes (<1KB)      |

---

## Protobuf Bridge

### Scope

The protobuf bridge handles machine-to-machine configuration transport:
control-plane → client, cross-service sync, simulation rig distribution,
and audit log snapshots.

### Wire Format

Standard protobuf binary encoding. Messages are instances of the Golden
Schema's generated message types.

### Protobuf Bridge Flow

```
Input:  Protobuf binary bytes (from gRPC, file, or HTTP)
  ↓
Step 1: Deserialize using generated protobuf code.
        (protoc-generated stubs for each language.)
  ↓
Step 2: Convert protobuf message to intermediate dict/map.
        This step is necessary because protobuf's "default = zero"
        semantics differ from our config defaults. We must distinguish
        "field was set to 0" from "field was not set."
  ↓
Step 3: For each field, check the has_* presence indicator:
        - Field IS present → include in override dict
        - Field NOT present → omit (let lower layer's value win)
  ↓
Step 4: Return dict/map for merge pipeline.
```

### The Presence Problem and Solution

Proto3 uses "implicit presence" by default — a field set to its
zero-value is indistinguishable from an unset field on the wire.

For configuration, this is unacceptable. If an engineer sets
`friction: 0.0`, that MUST override the default of `0.85`.

**Solution:** Use `optional` keyword (available in proto3 since 3.15):

```protobuf
message AlgoConfig {
  optional float friction = 1 [(config) = { default_value: "0.85" }];
}
```

`optional` generates a `has_friction()` method. The bridge checks:

```
if message.has_friction():
    override["friction"] = message.friction   # could be 0.0 — intentional
else:
    pass   # field not set, do not override
```

This preserves our merge semantics exactly.

### Protobuf Bridge Limitations

| Limitation                       | Impact                                |
|----------------------------------|---------------------------------------|
| Not human-readable               | Cannot `cat` and inspect              |
| Requires `protoc` compilation    | Build pipeline dependency             |
| Optional fields add API surface  | `has_*` checks in bridge code         |
| No native streaming of partials  | Full message or nothing               |
| Debug inspection needs `protoc --decode` | Extra tooling for operators   |

---

## Bridge Interoperability

### Round-Trip Guarantee

A config value must survive round-tripping through either bridge:

```
Typed Object → JSON serialize → JSON deserialize → Typed Object  [identical]
Typed Object → Proto serialize → Proto deserialize → Typed Object [identical]
Typed Object → JSON serialize → Proto deserialize → Typed Object  [NOT guaranteed]
```

Cross-format round-tripping (JSON → Proto or Proto → JSON) is supported
via a conversion utility but is not guaranteed to be lossless for edge
cases (e.g., numeric precision, enum representation).

### Canonical Conversion

The bridge provides a `to_json()` function on protobuf messages that
uses protobuf's canonical JSON mapping (as defined in the proto3 JSON
spec). This is the official path for Proto → JSON conversion.

```
Proto binary → protobuf JSON mapping → JSON Schema-valid document
```

### Snapshot Format

For audit logging and reproducibility, the recommended snapshot format
is protobuf binary. Reasons:

1. Compact — minimal storage cost for high-frequency snapshots.
2. Timestampable — wrap in an envelope message with timestamp.
3. Decodeable — the `.proto` file is the decoder ring, forever.
4. Versioned — field numbers ensure old snapshots remain decodable
   even as the schema evolves.

---

## Per-Language Bridge Integration

Each client library integrates both bridges. The JSON bridge is always
available (it handles local files). The protobuf bridge is available
when the protobuf dependency is included.

| Language   | JSON Parse      | Proto Deserialize          | Intermediate |
|------------|-----------------|----------------------------|--------------|
| Python     | `yaml.safe_load`| `google.protobuf`          | `dict`       |
| TypeScript | `yaml.parse`    | `protobufjs` or `buf`      | `object`     |
| Go         | `yaml.v3`       | `google.golang.org/protobuf` | `map[string]any` |
| C#         | built-in JSON   | `Google.Protobuf`          | `IConfiguration` |
| C++        | `yaml-cpp`      | `protobuf` lib             | `nlohmann::json` |

The protobuf bridge is **optional** for local-only usage. A team that
only uses YAML files and env vars never needs to compile protos or
include the protobuf library. The JSON bridge is the baseline.

---

## Integration with the Waterfall

The bridge does NOT replace the waterfall. It feeds INTO it. Multiple
bridges can contribute to a single load:

```
DefaultProvider (from Golden Schema defaults)    priority: 0
  ↓
FileProvider (JSON bridge — local YAML file)     priority: 1
  ↓
RemoteProvider (Proto bridge — control-plane)     priority: 2
  ↓
EnvProvider (native — no bridge needed)           priority: 3
  ↓
CLIProvider (native — no bridge needed)           priority: 4
```

Each provider produces a partial dict. The merge pipeline combines
them. The bridge is just the mechanism by which FileProvider and
RemoteProvider parse their inputs.
