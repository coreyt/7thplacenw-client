# Go Client — High-Level Design

## Language Version

Go 1.22+ (for range-over-int, improved standard library).

## Dependencies

| Module                       | Purpose               | Why This One                   |
|------------------------------|-----------------------|--------------------------------|
| `gopkg.in/yaml.v3`          | YAML parsing          | Standard Go YAML library       |
| `github.com/go-playground/validator/v10` | Struct validation | Most popular, tag-based  |

Minimal dependency footprint. Deep merge and env mapping are hand-written
(no external library) to keep the module lean.

**Dev dependencies:** `go test` (built-in), `golangci-lint`.

## Module Layout

```
go/
├── dev/
│   └── DESIGN.md              # (this file)
├── config.go                  # ConfigManager + Load()
├── merge.go                   # DeepMerge on map[string]any
├── providers.go               # All four providers
├── errors.go                  # Typed sentinel errors
├── sensitive.go               # Sensitive field redaction
├── config_test.go             # Unit tests
├── compliance_test.go         # Compliance suite (TC-01..TC-20)
├── go.mod
├── go.sum
└── Makefile
```

Go convention: no `src/` directory. Test files live alongside source.
The package name is `seventhplace`.

## Key Design Decisions

### Schema Definition

Users define their config as a plain Go struct with tags for YAML mapping,
env mapping, validation, and sensitivity:

```go
package myapp

type AlgoConfig struct {
    Friction   float64 `yaml:"friction"    env:"FRICTION"    validate:"min=0,max=1" default:"0.85"`
    MaxRetries int     `yaml:"max_retries" env:"MAX_RETRIES" validate:"min=0"       default:"3"`
    TimeoutMs  int     `yaml:"timeout_ms"  env:"TIMEOUT_MS"  validate:"min=1"       default:"5000"`
    Threshold  float64 `yaml:"threshold"   env:"THRESHOLD"   validate:"min=0,max=1" default:"0.65"`
}

type DbConfig struct {
    Host     string `yaml:"host"      env:"HOST"      default:"localhost"`
    Port     int    `yaml:"port"      env:"PORT"      validate:"min=1,max=65535" default:"5432"`
    PoolSize int    `yaml:"pool_size" env:"POOL_SIZE"  validate:"min=1"          default:"10"`
}

type SecretsConfig struct {
    APIKey string `yaml:"api_key" env:"API_KEY" sensitive:"true" default:""`
}

type AppConfig struct {
    AppName string        `yaml:"app_name" env:"APP_NAME" default:"7thplace"`
    Env     string        `yaml:"env"      env:"ENV"      default:"production"`
    Algo    AlgoConfig    `yaml:"algo"`
    Db      DbConfig      `yaml:"db"`
    Secrets SecretsConfig `yaml:"secrets"`
}
```

### Load Flow (Functional Options Pattern)

```go
cfg, err := seventhplace.Load[AppConfig](
    seventhplace.WithFile("config.yaml", seventhplace.Optional),
    seventhplace.WithEnv("SEVENTHPLACE"),
    seventhplace.WithStrict(true),
)
```

Internally:

```
PopulateDefaults(struct tags)   → map[string]any
  ↓ DeepMerge
FileProvider.Load(path)         → map[string]any
  ↓ DeepMerge
EnvProvider.Load(prefix)        → map[string]any
  ↓ DeepMerge
CLIProvider.Load(args)          → map[string]any
  ↓
yaml.Unmarshal into struct      → typed struct
  ↓
validator.Struct()              → validated
```

The merge happens in `map[string]any` space. After merging, we
marshal back to YAML bytes and unmarshal into the typed struct.
This avoids hand-written reflection for field assignment.

### Deep Merge

```go
func DeepMerge(base, override map[string]any) map[string]any {
    result := make(map[string]any, len(base))
    for k, v := range base {
        result[k] = v
    }
    for k, v := range override {
        if overrideMap, ok := v.(map[string]any); ok {
            if baseMap, ok := result[k].(map[string]any); ok {
                result[k] = DeepMerge(baseMap, overrideMap)
                continue
            }
        }
        result[k] = v
    }
    return result
}
```

### Immutability

Go does not have native immutability. Two strategies available:

1. **Return by value** — `Load()` returns `AppConfig` (not `*AppConfig`).
   Callers get a copy; mutations don't affect the canonical version.
2. **Unexported fields + getters** — heavier API but true encapsulation.

Option 1 is preferred for simplicity. Document that the returned value
should be treated as immutable; if shared across goroutines, it's safe
because it's never mutated.

### Env Provider

Maps `PREFIX__SECTION__KEY` using `os.LookupEnv`. Builds nested
`map[string]any`. Type coercion uses `strconv` functions based on
struct field types discovered via reflection at load time.

### Sensitive Field Redaction

A custom `String() string` method on config types (via generation or
explicit implementation) checks for `sensitive:"true"` tags and replaces
values with `"***"`. The `fmt.Stringer` interface ensures `fmt.Println`
never leaks secrets.

### Strict vs Lenient

- **Strict:** After merge, iterate the merged map and reject keys not
  present in the struct's YAML tags.
- **Lenient:** Unmarshal silently ignores unknown keys (default YAML
  behavior).

## Performance Notes

- No reflection on the access path. Struct field access is direct.
- `map[string]any` allocation happens once during load, then is GC'd.
- The returned struct is stack-allocatable if small enough.
- Validation uses cached struct metadata (go-playground/validator).

## Error Handling

```go
var (
    ErrValidation     = errors.New("seventhplace: validation failed")
    ErrFileNotFound   = errors.New("seventhplace: file not found")
    ErrPathTraversal  = errors.New("seventhplace: path traversal rejected")
    ErrParse          = errors.New("seventhplace: parse error")
)
```

Errors are wrapped with `fmt.Errorf("...: %w", err)` for `errors.Is()`
and `errors.As()` compatibility. Validation errors include field path
and expected type.

## Bridge Integration

### JSON Bridge (Default)

YAML/JSON files are parsed via `yaml.v3` into `map[string]any` and fed
directly into the merge pipeline.

### Protobuf Bridge (Built-in)

Go has first-class protobuf support via `google.golang.org/protobuf`.
The proto bridge is included by default (Go binaries are statically
linked; there's no cost to unused code paths at runtime).

```go
import schemapb "github.com/7thplacenw/config/schemapb"

msg := &schemapb.AppConfig{}
proto.Unmarshal(protoBytes, msg)
override := ProtoToMap(msg)  // respects HasField presence
```

`ProtoToMap()` uses `proto.HasExtension` and field descriptor
reflection to extract only explicitly-set fields. This handles the
proto3 zero-value problem (see `dev/GOLDEN_SCHEMA.md`).

### Schema Generation

The Golden Schema will eventually generate (deferred to v0.2):

- `schemapb/` package — protobuf Go stubs (via `protoc-gen-go`)
- Struct definitions with tags generated from `FieldMeta` annotations

For v0.1, the Go structs with tags are hand-written. The `.proto` file is
the canonical reference for keeping them in sync across languages.

## Packaging

Published as a Go module:

```
go get github.com/7thplacenw/config
```

Module path: `github.com/7thplacenw/config`.
