# Golden Schema — Contract-First Configuration Design

## The Three Tiers

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
          │             │     │             │
          │ .json-schema│     │ .proto wire │
          │ Human-read  │     │ Binary-fast │
          │ Web/Dashboard│    │ gRPC/embed  │
          └──────┬──────┘     └──────┬──────┘
                 │                    │
          ┌──────┴────────────────────┴──────┐
          │       CLIENT CONSUMPTION          │
          │                                   │
          │   Typed, frozen, zero-cost        │
          │   struct/class/record/model       │
          │                                   │
          │   config.algo.friction → 0.85     │
          └───────────────────────────────────┘
```

This architecture separates **human intent** (Golden Schema) from
**transport mechanism** (The Bridge) from **runtime execution** (Client
Consumption). Each tier has different constraints, different users, and
different failure modes.

---

## Tier 1: Client-Side Consumption (The "Hot Path")

### The Rule

The client **never searches** for a configuration value at runtime. It
consumes a **typed object** with direct field access.

### By Language

| Language   | Access Pattern                     | Missing-Key Behavior        |
|------------|------------------------------------|-----------------------------|
| C++        | `config.algo.friction`             | Won't compile               |
| C#         | `config.Algo.Friction`             | Won't compile               |
| Go         | `config.Algo.Friction`             | Won't compile               |
| Python     | `config.algo.friction`             | Crashes at load time         |
| TypeScript | `config.algo.friction`             | Type error at compile time   |

Every language gets the same guarantee: if the field doesn't exist or
has the wrong type, you find out **before your experiment runs**, not
three hours into it.

### Client Consumption Flow

```
Bridge output (JSON bytes or Protobuf bytes)
  ↓
Client library deserializes into intermediate (dict/map/json)
  ↓
Waterfall merge: defaults → file → env → CLI → remote
  ↓
Validate against schema constraints
  ↓
Freeze into typed object
  ↓
Application code reads fields directly (zero-cost)
```

### Critical Property: Load-Once, Read-Many

The client **must be restarted or explicitly reloaded** to pick up
config changes. This is a feature:

- An experiment runs with a **consistent snapshot** of configuration.
- No mid-run value drift that corrupts results.
- No concurrency hazards from config mutation.
- Reproducibility: the config that started the run IS the config for
  the entire run.

If hot-reload is needed (dashboards, long-running services), it is an
explicit, opt-in operation that produces a **new** frozen config object.
The old one remains valid for any code still referencing it.

### Client-Side Limitations

| Limitation                          | Mitigation                          |
|-------------------------------------|-------------------------------------|
| Must restart to pick up changes     | Explicit reload API (opt-in)        |
| Schema changes require recompile    | Field numbers preserve wire compat  |
| Cannot express dynamic/computed config | Use the constants registry pattern |
| Large configs impact startup time   | Lazy section loading (future)       |

---

## Tier 2: The Bridge (The Multi-Format Transport Layer)

The bridge translates between **how configuration is authored** and
**how configuration is consumed**. It supports two serialization formats,
each optimized for different use cases.

### JSON Bridge

**Best for:** Human authoring, web dashboards, REST APIs, debugging,
manual edits, CI/CD pipelines.

```
Human writes YAML/JSON                  Dashboard sends JSON
        ↓                                       ↓
   Read by FileProvider                   Received via HTTP
        ↓                                       ↓
   Parsed to intermediate dict      Parsed to intermediate dict
        ↓                                       ↓
   ──────────── same from here ──────────────────
        ↓
   Merge → Validate → Freeze → Typed Object
```

**Validation glue:** JSON Schema (generated from the Golden Schema).
The JSON Schema file can be used by editors (VS Code, IntelliJ) to
provide autocomplete and inline validation for config files.

| Strength                  | Limitation                              |
|---------------------------|-----------------------------------------|
| Human-readable            | Verbose — keys repeated as strings      |
| Universal tooling support | No native comments (YAML wraps this)    |
| Web-native (REST, fetch)  | Parsing is CPU-intensive vs binary      |
| Easy to debug             | No built-in schema evolution story      |
| YAML superset for files   | Renaming a key breaks old files         |

### Protobuf Bridge

**Best for:** Control-plane ↔ client transport, cross-service config
distribution, embedded systems, high-speed simulation rigs, audit
logging of config snapshots.

```
Control-plane serializes config as protobuf binary
        ↓
   Sent over gRPC / binary HTTP / file
        ↓
   Client deserializes via generated code
        ↓
   Merge → Validate → Freeze → Typed Object
```

**Validation glue:** The `.proto` file IS the contract. `protoc`
generates type-safe serialization/deserialization code for every
target language. Field numbers provide version-safe evolution.

| Strength                    | Limitation                             |
|-----------------------------|----------------------------------------|
| Binary — small, fast        | Not human-readable without decoder     |
| Field numbers → safe evolution | Requires `protoc` compilation step  |
| Cross-language code generation | Tooling overhead for small teams    |
| Built-in backwards compat   | Harder to manually inspect/debug       |
| Streaming support (gRPC)    | Overkill for single-file local config  |

### Bridge Selection Guide

| Use Case                          | Recommended Bridge |
|-----------------------------------|--------------------|
| Local config file on disk         | JSON (via YAML)    |
| Environment variables             | N/A (native)       |
| CLI arguments                     | N/A (native)       |
| Web dashboard → client            | JSON               |
| Control-plane → client            | Protobuf           |
| Cross-service config sync         | Protobuf           |
| Audit log / config snapshot       | Protobuf           |
| CI/CD pipeline injection          | JSON               |
| Human debugging / inspection      | JSON               |
| Embedded / resource-constrained   | Protobuf           |

### Bridge Limitations (Both Formats)

| Limitation                              | Impact                          |
|-----------------------------------------|---------------------------------|
| Neither format expresses defaults       | Defaults live in the Golden Schema |
| Neither format expresses constraints    | Constraints live in the Golden Schema |
| Both require a deserialization step     | Adds ~1ms to load time          |
| Schema changes need regeneration        | CI pipeline must include codegen |

The bridge is **transport**, not **truth**. It carries values. The
Golden Schema carries meaning.

---

## Tier 3: The Golden Schema (The Source of Truth)

### The Problem with Proto3 as a Config Schema

Proto3 is an excellent wire format and type system. But it has specific
gaps when used as a **configuration schema**:

| Gap                        | Detail                                    |
|----------------------------|-------------------------------------------|
| No default values          | All fields default to zero-value (`0`, `0.0`, `""`) |
| No range constraints       | Cannot express `friction ∈ [0.0, 1.0]`    |
| No sensitivity markers     | Cannot mark `api_key` as secret           |
| No "required" (in proto3)  | All fields are implicitly optional        |
| Zero vs. unset ambiguity   | Cannot distinguish "user set 0" from "user didn't set" |

The zero-value problem is critical. Our system's core purpose is
meaningful defaults like `friction: 0.85`. Proto3 would make `friction`
default to `0.0` and we couldn't tell if the user intended that.

### The Solution: Annotated Proto3 with Custom Options

Proto3 supports **custom options** — extensions to the `FieldOptions`
message that allow arbitrary metadata on fields. We define config-specific
options that carry defaults, constraints, and sensitivity annotations.

```protobuf
// file: seventhplace/options.proto
syntax = "proto3";
import "google/protobuf/descriptor.proto";
package seventhplace;

// Custom field options for configuration metadata
extend google.protobuf.FieldOptions {
  FieldMeta config = 50000;  // field number in extension range
}

message FieldMeta {
  string default_value = 1;   // serialized default (e.g., "0.85")
  bool   sensitive     = 2;   // redact in logs/repr
  bool   required      = 3;   // must be provided by some layer
  string min           = 4;   // minimum value (inclusive)
  string max           = 5;   // maximum value (inclusive)
  string description   = 6;   // human-readable docs
  string pattern       = 7;   // regex constraint for strings
}
```

### The Golden Schema

```protobuf
// file: seventhplace/config.proto
syntax = "proto3";
import "seventhplace/options.proto";
package seventhplace;

message AppConfig {
  string app_name = 1 [(config) = {
    default_value: "7thplace",
    description:   "Application identifier"
  }];

  Environment env = 2 [(config) = {
    default_value: "PRODUCTION",
    description:   "Deployment environment"
  }];

  AlgoConfig    algo    = 3;
  DbConfig      db      = 4;
  SecretsConfig secrets = 5;
}

enum Environment {
  DEV        = 0;
  STAGING    = 1;
  PRODUCTION = 2;
}

message AlgoConfig {
  float friction = 1 [(config) = {
    default_value: "0.85",
    min:           "0.0",
    max:           "1.0",
    description:   "Energy loss coefficient per iteration"
  }];

  int32 max_retries = 2 [(config) = {
    default_value: "3",
    min:           "0",
    description:   "Maximum retry attempts before failure"
  }];

  int32 timeout_ms = 3 [(config) = {
    default_value: "5000",
    min:           "1",
    description:   "Operation timeout in milliseconds"
  }];

  float threshold = 4 [(config) = {
    default_value: "0.65",
    min:           "0.0",
    max:           "1.0",
    description:   "Convergence threshold"
  }];
}

message DbConfig {
  string host = 1 [(config) = {
    default_value: "localhost",
    description:   "Database hostname"
  }];

  int32 port = 2 [(config) = {
    default_value: "5432",
    min:           "1",
    max:           "65535",
    description:   "Database port"
  }];

  int32 pool_size = 3 [(config) = {
    default_value: "10",
    min:           "1",
    description:   "Connection pool size"
  }];
}

message SecretsConfig {
  string api_key = 1 [(config) = {
    default_value: "",
    sensitive:     true,
    description:   "API authentication key"
  }];
}
```

### What the Golden Schema Generates

From this single `.proto` file, the build pipeline produces:

```
seventhplace/config.proto
  │
  ├──→ protoc --python_out     → Python protobuf stubs
  ├──→ protoc --ts_out         → TypeScript protobuf stubs
  ├──→ protoc --go_out         → Go protobuf stubs
  ├──→ protoc --csharp_out     → C# protobuf stubs
  ├──→ protoc --cpp_out        → C++ protobuf stubs
  │
  ├──→ custom generator        → JSON Schema (from FieldMeta)
  ├──→ custom generator        → Per-language typed config classes
  │                               (Pydantic model, zod schema, Go struct,
  │                                C# record, C++ struct + nlohmann macros)
  ├──→ custom generator        → Default values YAML file
  └──→ custom generator        → Documentation
```

The **custom generators** read the `FieldMeta` annotations and produce
the language-specific config classes WITH defaults, constraints, and
sensitivity annotations baked in. The protobuf stubs handle the wire
format; the config classes handle the application-level semantics.

### Two Paths, Same Object

At runtime, a client library can receive config from either bridge:

```
Path A (JSON):   YAML file → parse → dict → merge → validate → typed object
Path B (Proto):  Protobuf bytes → deserialize → dict → merge → validate → typed object
```

Both paths converge at the merge step. The typed object at the end is
identical regardless of which bridge was used. The client code is
bridge-agnostic:

```python
# Client code doesn't know or care which bridge was used
print(config.algo.friction)  # 0.85
```

---

## Trade-off Analysis

### JSON Bridge vs. Protobuf Bridge

| Dimension            | JSON Bridge                         | Protobuf Bridge                       |
|----------------------|-------------------------------------|---------------------------------------|
| **User Friendliness**| High. Notepad-editable.             | Low. Requires dev tooling.            |
| **Validation**       | External (JSON Schema file).        | Native (wire format IS the schema).   |
| **Payload Size**     | Large (string keys, text values).   | Small (varint tags, binary values).   |
| **Schema Evolution** | Brittle. Key rename breaks clients. | Robust. Field numbers are stable.     |
| **Performance**      | String parsing overhead.            | Fast binary decode, near-zero-copy.   |
| **Debugging**        | `cat config.json` just works.       | Need `protoc --decode` or equivalent. |
| **Tooling Ecosystem**| Universal. Every language, every OS. | Excellent but requires `protoc`.      |
| **Comments**         | Not in JSON (YAML workaround).      | In `.proto` file, lost on wire.       |
| **Streaming**        | Possible (JSON Lines, SSE).         | Native (gRPC streaming).             |

### Golden Schema Format Options

We considered three candidates for the Golden Schema format:

| Candidate           | Strengths                                | Weaknesses                           | Verdict    |
|---------------------|------------------------------------------|--------------------------------------|------------|
| **Annotated Proto3**| Field numbers, codegen, cross-lang stubs | Custom options add complexity        | **Chosen** |
| **JSON Schema**     | Wide tooling, editor support             | No field numbers, no codegen         | Too weak   |
| **Custom YAML DSL** | Maximum flexibility, human-friendly      | Must build all tooling from scratch  | Too costly |

**Why annotated proto3 wins:**

1. **Field numbers are free.** Protobuf gives us stable evolution
   semantics without any custom tooling. Renaming `friction` to
   `coefficient_of_friction` doesn't break old wire data.
2. **`protoc` codegen is free.** Five-language stub generation is a
   solved problem. We only write custom generators for the config-class
   layer on top.
3. **The proto file is readable.** Even with custom options, a proto
   file is far more readable than JSON Schema and far more structured
   than a custom DSL.
4. **The ecosystem is battle-tested.** Google, Envoy, gRPC, Buf — the
   protobuf tooling ecosystem is mature.

**The cost:** Custom options require a `protoc` plugin or post-processor
to extract `FieldMeta` and generate the per-language config classes.
This is a one-time tooling investment.

### When to Use Which Bridge

| Persona / System          | Bridge   | Rationale                            |
|---------------------------|----------|--------------------------------------|
| Engineer editing a YAML file | JSON  | Human-readable, version-controlled   |
| Web dashboard pushing config | JSON  | REST-native, browser-compatible      |
| Control-plane serving config | Proto | Binary-efficient, version-safe       |
| Algorithm simulation rig  | Proto    | Strict contracts, reproducibility    |
| CI/CD pipeline            | JSON     | Easy to template/inject              |
| Cross-service config sync | Proto    | Field numbers prevent evolution bugs |
| Audit log / snapshot      | Proto    | Compact, timestampable, immutable    |
| Local development         | JSON     | Edit → reload → iterate fast         |

---

## Open Questions

1. **Buf vs. raw protoc?** The Buf CLI (`buf.build`) offers linting,
   breaking-change detection, and a schema registry. Worth evaluating
   for the codegen pipeline.

2. **Should the Golden Schema live in this repo or a shared schema repo?**
   If the control-plane and managed-services repos also consume it, a
   shared `7thplacenw-schema` repo avoids duplication.

3. **Custom protoc plugin or standalone generator?** The custom options
   need extraction tooling. A `protoc` plugin integrates into the
   existing pipeline; a standalone generator (reading the proto
   descriptor set) is easier to debug.

4. **Proto2 vs. Proto3?** Proto2 has native `default` and `required`
   keywords, which map more naturally to configuration. The tradeoff
   is that proto2 is considered legacy. Custom options on proto3 are
   the modern equivalent.
