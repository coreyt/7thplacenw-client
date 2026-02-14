# 7th Place NW — Portability Matrix

## Purpose

This document maps each architectural concept to its idiomatic
implementation in each language. Use it as a quick-reference when
implementing features or reviewing cross-language consistency.

---

## Schema Definition

How the typed configuration contract is expressed.

| Language   | Mechanism                          | Immutability              |
|------------|------------------------------------|---------------------------|
| Python     | Pydantic `BaseModel(frozen=True)`  | Pydantic enforced         |
| TypeScript | `zod` schema + `z.infer<T>`       | `Object.freeze()` + `Readonly<T>` |
| Go         | Struct with tags                   | Return by value           |
| C#         | `record` with `init` setters      | Language-enforced         |
| C++        | Struct + `NLOHMANN_DEFINE` macros  | `const` qualifier         |

---

## Deep Merge Strategy

How partial overrides of nested sections are handled.

| Language   | Approach                                   | Built-in?   |
|------------|--------------------------------------------|-------------|
| Python     | Recursive dict update (hand-written)       | No          |
| TypeScript | Recursive object spread (hand-written)     | No          |
| Go         | Recursive `map[string]any` merge           | No          |
| C#         | Native `ConfigurationBuilder` stacking     | **Yes**     |
| C++        | Recursive `nlohmann::json` merge           | No          |

C# is the only language where deep merge is handled entirely by the
framework. All others require a hand-written ~15-line utility function.

---

## Environment Variable Mapping

How `PREFIX__SECTION__KEY` is translated to nested config.

| Language   | Mechanism                                  | Type Coercion       |
|------------|--------------------------------------------|----------------------|
| Python     | `os.environ` + split on `__`               | `yaml.safe_load()`   |
| TypeScript | `process.env` + split on `__`              | `JSON.parse()` fallback |
| Go         | `os.LookupEnv` + split on `__`             | `strconv` functions   |
| C#         | `AddEnvironmentVariables(prefix)` (native) | Native binding        |
| C++        | `environ` / `getenv` + split on `__`       | `stoi` / `stod`       |

C# again benefits from native support — the `__` to `:` mapping is a
built-in .NET convention.

---

## Validation

How type and constraint checking is performed at load time.

| Language   | Mechanism                          | When It Runs         |
|------------|------------------------------------|----------------------|
| Python     | Pydantic model instantiation       | Final `Schema(**dict)` call |
| TypeScript | `schema.parse(obj)`                | After merge, before freeze |
| Go         | `go-playground/validator` tags     | After struct unmarshal |
| C#         | `DataAnnotations` + `Validator`    | After `Bind()`        |
| C++        | Optional `validate()` method       | After `from_json()`   |

---

## Sensitive Field Redaction

How secrets are hidden from `repr` / `toString` / `fmt.Print` / `operator<<`.

| Language   | Mechanism                              |
|------------|----------------------------------------|
| Python     | Pydantic `SecretStr` type              |
| TypeScript | Custom `sensitive()` marker + `toJSON` override |
| Go         | `sensitive:"true"` struct tag + custom `String()` |
| C#         | `[Sensitive]` attribute + `ConfigPrinter` |
| C++        | `sensitive_fields<T>` trait specialization |

---

## Error Handling

| Language   | Strategy                              |
|------------|---------------------------------------|
| Python     | Exception hierarchy (`SeventhPlaceError` base) |
| TypeScript | Exception hierarchy (`SeventhPlaceError` base) |
| Go         | Sentinel errors + `errors.Is` / `errors.As` |
| C#         | Exception hierarchy (`SeventhPlaceException` base) |
| C++        | `std::expected<T, Error>` (no exceptions) |

---

## Performance Profile

| Language   | Load Cost     | Access Cost     | Key Technique              |
|------------|---------------|-----------------|----------------------------|
| Python     | ~1ms          | Attribute lookup | Pydantic v2 (Rust core)    |
| TypeScript | ~1ms          | Property read    | Frozen plain object        |
| Go         | ~1ms          | Struct field     | Stack-allocated struct     |
| C#         | ~1ms          | Property getter  | JIT-inlined `init` props   |
| C++        | ~1ms          | `mov` instruction| Stack struct, zero indirection |

All implementations share the same performance model: dynamic work
happens once at load time, then the config is a static typed structure
with zero-cost access.

---

## Packaging

| Language   | Registry | Package Name             |
|------------|----------|--------------------------|
| Python     | PyPI     | `seventhplace`           |
| TypeScript | npm      | `@seventhplace/config`   |
| Go         | Go proxy | `github.com/7thplacenw/config` |
| C#         | NuGet    | `SeventhPlace.Config`    |
| C++        | CMake    | `seventhplace::config`   |
