# C++ Client — High-Level Design

## Language Version

C++20. Uses concepts, designated initializers, `std::string_view`,
`std::optional`, and `<filesystem>`. No exceptions in the hot path.

## Dependencies

| Library          | Purpose              | Why This One                        |
|------------------|----------------------|-------------------------------------|
| nlohmann/json    | JSON parse + merge   | Header-only, zero-config, ubiquitous |
| yaml-cpp         | YAML parsing         | De facto C++ YAML library           |

Both are header-only or easily vendored. No Boost dependency.

**Dev/build:** CMake 3.20+, Catch2 (testing), clang-tidy, clang-format.

## Project Layout

```
cpp/
├── dev/
│   └── DESIGN.md                  # (this file)
├── include/
│   └── seventhplace/
│       ├── config.hpp             # Public API — ConfigManager, Load()
│       ├── merge.hpp              # deep_merge for nlohmann::json
│       ├── providers.hpp          # Provider interface + built-ins
│       ├── schema.hpp             # Schema trait / to_json / from_json
│       ├── sensitive.hpp          # Redaction utilities
│       └── errors.hpp             # Error types (std::expected based)
├── src/
│   ├── config.cpp
│   ├── merge.cpp
│   ├── providers.cpp
│   └── sensitive.cpp
├── tests/
│   ├── compliance_test.cpp        # TC-01..TC-20
│   ├── merge_test.cpp
│   └── providers_test.cpp
├── CMakeLists.txt
└── Makefile
```

## Key Design Decisions

### The JSON Intermediate Pattern

C++ has no runtime reflection. We cannot generically walk a struct's
fields at runtime (without macros or code generation). Instead:

1. **Load phase:** All providers produce `nlohmann::json` objects.
   Merging happens in JSON space (dynamic, heap-allocated).
2. **Thaw phase:** The merged JSON is deserialized into a static struct
   via nlohmann's `from_json()`.
3. **Access phase:** The struct is stack-allocated (or `const&`). Field
   access is direct member access — zero overhead.

```
json defaults   ──┐
json file_data  ──┼──→  deep_merge  ──→  json merged  ──→  from_json()  ──→  const AppConfig
json env_data   ──┤
json cli_data   ──┘
```

The "hot path" (your algorithm's inner loop reading `config.algo.friction`)
never touches JSON. It reads a `double` from a struct. Zero indirection.

### Schema Definition

Users define their config as plain structs with nlohmann serialization:

```cpp
#include <nlohmann/json.hpp>
#include <string>

struct AlgoConfig {
    double friction    = 0.85;
    int    max_retries = 3;
    int    timeout_ms  = 5000;
    double threshold   = 0.65;
};

struct DbConfig {
    std::string host = "localhost";
    int         port = 5432;
    int         pool_size = 10;
};

struct SecretsConfig {
    std::string api_key = "";  // marked sensitive via trait
};

struct AppConfig {
    std::string   app_name = "7thplace";
    std::string   env      = "production";
    AlgoConfig    algo;
    DbConfig      db;
    SecretsConfig secrets;
};

// nlohmann macros — these generate to_json/from_json
NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE_WITH_DEFAULT(
    AlgoConfig, friction, max_retries, timeout_ms, threshold)
NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE_WITH_DEFAULT(
    DbConfig, host, port, pool_size)
NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE_WITH_DEFAULT(
    SecretsConfig, api_key)
NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE_WITH_DEFAULT(
    AppConfig, app_name, env, algo, db, secrets)
```

`NLOHMANN_DEFINE_TYPE_NON_INTRUSIVE_WITH_DEFAULT` generates `from_json`
that respects default values — missing keys in the JSON use the struct's
default member initializers.

### Deep Merge

```cpp
void deep_merge(nlohmann::json& dest, const nlohmann::json& src) {
    for (auto it = src.begin(); it != src.end(); ++it) {
        if (it.value().is_object() &&
            dest.contains(it.key()) &&
            dest[it.key()].is_object()) {
            deep_merge(dest[it.key()], it.value());
        } else {
            dest[it.key()] = it.value();
        }
    }
}
```

In-place mutation of `dest`. This is intentional — we're building up
a temporary JSON object that will be consumed once by `from_json()`,
then discarded.

### Load API

```cpp
#include <seventhplace/config.hpp>

auto result = seventhplace::load<AppConfig>(
    seventhplace::file("config.yaml", seventhplace::optional),
    seventhplace::env("SEVENTHPLACE"),
    seventhplace::strict(true)
);

if (!result) {
    std::cerr << result.error().message() << std::endl;
    return 1;
}

const AppConfig& config = result.value();
// config.algo.friction is a direct double read — zero overhead
```

Return type is `std::expected<T, SeventhPlaceError>` (C++23) or a
polyfill. No exceptions on the load path — the caller checks the result.

### Immutability

The loaded config is returned as a value type. The consumer receives it
by `const&` or by value (copy). There is no mutable global state.

```cpp
const auto config = seventhplace::load<AppConfig>(...).value();
// config.algo.friction = 0.99;  // compile error: const
```

### Env Provider

Iterates `environ` (POSIX) or uses `GetEnvironmentVariable` (Windows).
Matches prefix, splits on `__`, builds nested `nlohmann::json`. Type
coercion:

1. Try `std::stoi` / `std::stod` — if it parses cleanly, use the number.
2. Check for `"true"` / `"false"` (case-insensitive) → `bool`.
3. Otherwise, keep as string.

### Sensitive Field Redaction

A trait specialization marks types as containing sensitive fields:

```cpp
template<> struct seventhplace::sensitive_fields<SecretsConfig> {
    static constexpr auto fields = std::array{"api_key"};
};
```

The `to_string(config)` utility checks this trait and replaces values
with `"***"` in the output.

### Validation

Post-`from_json()`, a `validate()` function checks constraints. Uses
a lightweight compile-time constraint system (no heavy reflection):

```cpp
template<typename T>
concept Validatable = requires(const T& t) {
    { t.validate() } -> std::same_as<std::optional<std::string>>;
};
```

Each config struct can optionally implement `validate()` returning
`std::nullopt` (valid) or an error message.

### Strict vs Lenient

After merging the JSON, compare its keys against the known fields
(from the `NLOHMANN_DEFINE` macro). Extra keys in strict mode produce
an error. In lenient mode, `from_json` silently ignores them.

### Path Traversal Protection

`std::filesystem::canonical()` resolves the path. Check that the result
starts with the allowed base directory using
`std::filesystem::relative()`.

## Performance Notes

- **Load:** JSON parsing + merge + `from_json()`. Runs once. Milliseconds.
- **Access:** Direct struct member read. Compiles to a single `mov`
  instruction. Zero allocation, zero indirection.
- **Memory:** The JSON intermediate is freed after `from_json()`. The
  config struct lives on the stack or in static storage.
- **No RTTI required.** No `dynamic_cast`, no `typeid`.

This is the highest-performance implementation of the five languages.
The "JSON intermediate → static struct" pattern ensures the dynamic
cost is paid once, then the config is as fast as any hardcoded constant.

## Error Handling

```cpp
enum class ErrorKind {
    Validation,
    FileNotFound,
    PathTraversal,
    Parse
};

struct SeventhPlaceError {
    ErrorKind   kind;
    std::string message;   // field path + expected type, never raw values
};
```

No exceptions thrown. Errors returned via `std::expected`.

## Bridge Integration

### JSON Bridge (Default)

YAML files are parsed by `yaml-cpp` into `nlohmann::json` (via a
thin YAML→JSON converter) and fed into the merge pipeline. JSON files
are parsed directly by `nlohmann::json`.

### Protobuf Bridge (Optional)

When linked against `protobuf`, the library accepts binary bytes.
The C++ protobuf API has the most direct presence checking:

```cpp
schemapb::AppConfig msg;
msg.ParseFromString(proto_bytes);

nlohmann::json override;
if (msg.has_algo()) {
    auto& algo = msg.algo();
    if (algo.has_friction()) {
        override["algo"]["friction"] = algo.friction();
    }
}
```

The `has_*()` methods are generated by `protoc` for `optional` fields.
This directly solves the proto3 zero-value problem (see
`dev/GOLDEN_SCHEMA.md`) — only fields the sender explicitly set are
included in the override JSON.

The protobuf dependency is a CMake option:

```cmake
option(SEVENTHPLACE_ENABLE_PROTO "Enable protobuf bridge" OFF)
```

When OFF, the proto bridge code is excluded entirely. No protobuf
headers or libraries are needed.

### Schema Generation

The Golden Schema will eventually generate (deferred to v0.2):

- `generated/config.pb.h` / `config.pb.cc` — protobuf C++ stubs
- Struct definitions with `NLOHMANN_DEFINE` macros generated from
  `FieldMeta` annotations

For v0.1, the C++ structs and nlohmann macros are hand-written. The
`.proto` file is the canonical reference for keeping them in sync across
languages.

## Build & Package

Built via CMake. Can be consumed as:
- A CMake `FetchContent` / `add_subdirectory` dependency
- A system-installed library (via `cmake --install`)
- Vendored headers (header-only mode possible with some tradeoffs)

```cmake
find_package(seventhplace CONFIG REQUIRED)
target_link_libraries(myapp PRIVATE seventhplace::config)
```
