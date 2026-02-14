# 7th Place NW — Client Libraries

Cross-platform Layered Configuration Manager.

Idiomatic client libraries for Python, TypeScript, Go, C#, and C++.

## What It Does

Replaces magic numbers and buried constants with a typed, layered
configuration system. Values are loaded in precedence order:

```
Defaults  →  Config File  →  Env Vars  →  CLI Args
```

Each layer overrides the one below it. The result is a frozen, validated,
strongly-typed config object.

## Repository Layout

```
dev/                    Architecture & cross-language design docs
test/                   Compliance spec & shared test fixtures
python/                 Python client (Pydantic + PyYAML)
typescript/             TypeScript client (zod + js-yaml)
go/                     Go client (struct tags + yaml.v3)
csharp/                 C# client (.NET ConfigurationBuilder)
cpp/                    C++ client (nlohmann/json + yaml-cpp)
```

## Documentation

| Document                       | Purpose                               |
|--------------------------------|---------------------------------------|
| [dev/ARCHITECTURE.md](dev/ARCHITECTURE.md) | Core architecture & API contract |
| [dev/PORTABILITY.md](dev/PORTABILITY.md)   | Cross-language implementation matrix |
| [test/COMPLIANCE.md](test/COMPLIANCE.md)   | Behavioral test specification (TC-01..TC-18) |
| `<lang>/dev/DESIGN.md`        | Language-specific high-level design   |

## License

Apache-2.0
