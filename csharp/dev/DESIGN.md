# C# Client — High-Level Design

## Language Version

C# 12 / .NET 8+. Uses `record` types for immutability, `init` setters,
and source generators where applicable.

## Dependencies

| Package                                    | Purpose                 | Why This One            |
|--------------------------------------------|-------------------------|-------------------------|
| `Microsoft.Extensions.Configuration`       | Layered config builder  | Native .NET, battle-tested |
| `Microsoft.Extensions.Configuration.Json`  | JSON file provider      | Native .NET             |
| `Microsoft.Extensions.Configuration.EnvironmentVariables` | Env provider | Native .NET    |
| `Microsoft.Extensions.Configuration.CommandLine` | CLI provider      | Native .NET             |
| `Microsoft.Extensions.Configuration.Yaml`  | YAML file provider      | Community standard      |
| `System.ComponentModel.DataAnnotations`    | Validation attributes   | Built-in                |

The .NET `ConfigurationBuilder` already implements the waterfall pattern
natively. We wrap it with schema enforcement, deep merge guarantees,
and our security constraints rather than reimplementing it.

**Dev dependencies:** xUnit, FluentAssertions.

## Project Layout

```
csharp/
├── dev/
│   └── DESIGN.md                  # (this file)
├── src/
│   └── SeventhPlace.Config/
│       ├── SeventhPlace.Config.csproj
│       ├── ConfigManager.cs       # Public API — wraps ConfigurationBuilder
│       ├── SchemaValidator.cs     # DataAnnotations + custom validation
│       ├── SensitiveAttribute.cs  # [Sensitive] marker for redaction
│       ├── ConfigPrinter.cs       # ToString with redaction
│       ├── PathGuard.cs           # Path traversal protection
│       └── Errors/
│           ├── SeventhPlaceException.cs
│           ├── ValidationException.cs
│           └── PathTraversalException.cs
├── tests/
│   └── SeventhPlace.Config.Tests/
│       ├── SeventhPlace.Config.Tests.csproj
│       ├── ComplianceTests.cs     # TC-01..TC-18
│       ├── ValidatorTests.cs
│       └── PathGuardTests.cs
├── SeventhPlace.Config.sln
└── Makefile
```

## Key Design Decisions

### Schema Definition

Users define configuration as C# `record` types with `init` setters and
`DataAnnotation` attributes for validation:

```csharp
public record AlgoConfig
{
    [Range(0.0, 1.0)]
    public double Friction { get; init; } = 0.85;

    [Range(0, int.MaxValue)]
    public int MaxRetries { get; init; } = 3;

    [Range(1, int.MaxValue)]
    public int TimeoutMs { get; init; } = 5000;

    [Range(0.0, 1.0)]
    public double Threshold { get; init; } = 0.65;
}

public record DbConfig
{
    public string Host { get; init; } = "localhost";

    [Range(1, 65535)]
    public int Port { get; init; } = 5432;

    [Range(1, int.MaxValue)]
    public int PoolSize { get; init; } = 10;
}

public record SecretsConfig
{
    [Sensitive]
    public string ApiKey { get; init; } = "";
}

public record AppConfig
{
    public string AppName { get; init; } = "7thplace";
    public string Env { get; init; } = "production";
    public AlgoConfig Algo { get; init; } = new();
    public DbConfig Db { get; init; } = new();
    public SecretsConfig Secrets { get; init; } = new();
}
```

`record` types are immutable by default (with `init` setters, properties
can only be set during construction). This gives us TC-11 compliance
without additional work.

### Load Flow

```csharp
var config = SeventhPlace.Config.ConfigManager.Load<AppConfig>(options =>
{
    options.AddYamlFile("config.yaml", optional: true);
    options.AddEnvironmentVariables("SEVENTHPLACE__");
    options.AddCommandLine(args);
    options.Strict = true;
});
```

Internally:

```
ConfigurationBuilder
  .AddInMemoryCollection(defaults)     // from record defaults
  .AddYamlFile(path, optional)         // file layer
  .AddEnvironmentVariables(prefix)     // env layer (__  nesting is native)
  .AddCommandLine(args)                // CLI layer
  .Build()
  ↓
configuration.Get<AppConfig>()         // bind to record
  ↓
Validator.ValidateObject()             // DataAnnotations check
  ↓
return frozen record
```

### Deep Merge

The .NET `ConfigurationBuilder` handles deep merge natively through its
provider stacking model. Each provider adds key-value pairs with `:` as
the path separator (e.g., `Algo:Friction`). The builder merges them in
registration order, last-writer-wins per key. Sibling keys are preserved
automatically.

We do NOT reimplement deep merge — the framework handles it correctly.

### Env Variable Mapping

.NET's `AddEnvironmentVariables("SEVENTHPLACE__")` already maps
`SEVENTHPLACE__ALGO__FRICTION` to `Algo:Friction` natively. The
double-underscore-to-colon mapping is a built-in .NET convention.

This is why C# is the most "batteries included" implementation.

### Sensitive Field Redaction

Custom `[Sensitive]` attribute. The `ConfigPrinter` utility walks the
object graph via reflection (at print time only, not on the hot path)
and replaces `[Sensitive]`-marked properties with `"***"`.

```csharp
[AttributeUsage(AttributeTargets.Property)]
public class SensitiveAttribute : Attribute { }
```

### Strict vs Lenient

After binding, compare the set of keys in the `IConfiguration` against
the properties of the target type. Extra keys in strict mode throw
`ValidationException`.

### Path Traversal Protection

`PathGuard.Validate(path, baseDir)` resolves the path and verifies it
does not escape `baseDir`. Uses `Path.GetFullPath()` and
`path.StartsWith(baseDir)`.

## Performance Notes

- `ConfigurationBuilder` allocates during `Build()` — this runs once.
- After `Get<T>()`, the record is a plain CLR object. Property access is
  direct, no dictionary lookups.
- `record` types are reference types in C# but are immutable and
  equality-comparable. For hot-path numeric access, the JIT inlines
  property getters.
- No reflection at access time. Reflection is used only at load and
  print time.

## Error Handling

```
SeventhPlaceException
├── ValidationException        # DataAnnotation failure
├── FileNotFoundException      # Required file missing (wraps System.IO)
├── PathTraversalException     # Security rejection
└── ParseException             # YAML/JSON syntax error
```

Validation errors include the property path and constraint description.
`[Sensitive]` values are never included in exception messages.

## Packaging

Published to NuGet as `SeventhPlace.Config`:

```
dotnet add package SeventhPlace.Config
```
