# TypeScript Client — High-Level Design

## Language Version

TypeScript 5.x targeting ES2022+. Strict mode enabled. Ships as both
ESM and CJS (dual package).

## Dependencies

| Package | Purpose                        | Why This One                     |
|---------|--------------------------------|----------------------------------|
| zod     | Schema definition + validation | Type-safe, zero-dep, tree-shakeable |
| yaml    | YAML file parsing              | `js-yaml` — fast, well-maintained |

No other runtime dependencies.

**Dev dependencies:** vitest, tsup (bundler), typescript, eslint.

## Module Layout

```
typescript/
├── dev/
│   └── DESIGN.md              # (this file)
├── src/
│   ├── index.ts               # Public API re-exports
│   ├── manager.ts             # ConfigManager class
│   ├── merge.ts               # deepMerge() utility
│   ├── providers/
│   │   ├── index.ts
│   │   ├── defaults.ts        # DefaultProvider
│   │   ├── file.ts            # FileProvider (YAML/JSON)
│   │   ├── env.ts             # EnvProvider (process.env)
│   │   └── cli.ts             # CLIProvider (process.argv)
│   ├── schema.ts              # Schema helpers, sensitive() marker
│   └── errors.ts              # Typed error classes
├── tests/
│   ├── compliance.test.ts     # Maps to test/COMPLIANCE.md TC-01..TC-20
│   ├── merge.test.ts
│   └── providers.test.ts
├── package.json
├── tsconfig.json
└── Makefile
```

## Key Design Decisions

### Schema Definition

Users define their config using `zod`. The zod schema serves triple duty:
1. Runtime validation
2. TypeScript type inference (`z.infer<typeof schema>`)
3. Default values (via `.default()`)

```typescript
import { z } from "zod";

const AlgoConfig = z.object({
  friction: z.number().min(0).max(1).default(0.85),
  max_retries: z.number().int().nonnegative().default(3),
  timeout_ms: z.number().int().positive().default(5000),
  threshold: z.number().min(0).max(1).default(0.65),
});

const DbConfig = z.object({
  host: z.string().default("localhost"),
  port: z.number().int().min(1).max(65535).default(5432),
  pool_size: z.number().int().positive().default(10),
});

const SecretsConfig = z.object({
  api_key: z.string().default(""),
});

const AppConfig = z.object({
  app_name: z.string().default("7thplace"),
  env: z.string().default("production"),
  algo: AlgoConfig.default({}),
  db: DbConfig.default({}),
  secrets: SecretsConfig.default({}),
});

type AppConfig = z.infer<typeof AppConfig>;
```

The `z.infer` type is the TypeScript interface — no separate type
definition needed. This eliminates schema/type drift.

### Load Flow

```
extractDefaults(schema)       → plain object
  ↓ deepMerge
FileProvider.load(path)       → plain object
  ↓ deepMerge
EnvProvider.load(prefix)      → plain object
  ↓ deepMerge
CLIProvider.load(argv)        → plain object
  ↓
schema.parse(mergedObject)    → validated, typed object
  ↓
Object.freeze(deepFreeze())   → immutable
```

### Deep Merge

```typescript
function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (
      typeof value === "object" && value !== null && !Array.isArray(value) &&
      typeof result[key] === "object" && result[key] !== null
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
```

Pure function — inputs are not mutated.

### Immutability

After `schema.parse()`, the result is passed through `Object.freeze()`
recursively. TypeScript's type system enforces `Readonly<T>` at the
type level, and the runtime freeze prevents actual mutation.

```typescript
function deepFreeze<T extends object>(obj: T): Readonly<T> {
  for (const value of Object.values(obj)) {
    if (typeof value === "object" && value !== null) {
      deepFreeze(value);
    }
  }
  return Object.freeze(obj);
}
```

### Env Provider

Maps `PREFIX__SECTION__KEY` from `process.env` to nested objects.
Type coercion: attempts `JSON.parse()` first (handles numbers, booleans),
falls back to raw string.

### Sensitive Field Redaction

A `sensitive()` wrapper marks fields. The `toString()` / `toJSON()`
methods on the config result redact sensitive fields. Internally uses
a `Set<string>` of dot-paths collected at schema registration time.

### Path Traversal Protection

`FileProvider` uses `path.resolve()` and verifies the resolved path starts
with the allowed base directory. Rejects paths containing `..` segments
that escape the base.

### Strict vs Lenient

- **Strict:** `schema.strict().parse(data)` — zod rejects unknown keys.
- **Lenient:** `schema.parse(data)` — zod strips unknown keys by default.

## Performance Notes

- Zod parse is fast for typical config sizes (< 1ms).
- Post-parse access is plain property access on a frozen object.
- No Proxy objects, no getters — direct property reads.
- Tree-shakeable: unused providers don't end up in the bundle.

## Error Handling

```
SeventhPlaceError
├── ValidationError        # Zod parse failure (reformatted)
├── FileNotFoundError      # Required file missing
├── PathTraversalError     # Security rejection
└── ParseError             # YAML/JSON syntax error
```

Zod errors are reformatted to show `field.path: expected type` without
raw values.

## Bridge Integration

### JSON Bridge (Default)

YAML/JSON files are parsed via `yaml.parse()` into plain objects and
fed directly into the merge pipeline. This is the default path.

### Protobuf Bridge (Optional)

When `@bufbuild/protobuf` is available, the library accepts protobuf
binary bytes. The flow:

```typescript
import { AppConfig } from "./generated/config_pb.js";
import { fromBinary } from "@bufbuild/protobuf";

const msg = fromBinary(AppConfigSchema, protoBytes);
const override = protoToDict(msg); // respects field presence
```

`protoToDict()` checks `isFieldSet()` to handle the proto3 zero-value
problem (see `dev/GOLDEN_SCHEMA.md`).

The protobuf dependency is a peer dependency — not required for
local-only usage.

### Schema Generation

The Golden Schema will eventually generate (deferred to v0.2):

- `src/generated/config_pb.ts` — protobuf stubs (via `protoc --ts_out`
  or `buf generate` — tooling decision deferred)
- Zod schemas can optionally be generated from `FieldMeta` annotations.

For v0.1, the zod schemas are hand-written. The `.proto` file is the
canonical reference for keeping them in sync across languages.

## Packaging

Published to npm as `@seventhplace/config`. Dual ESM/CJS via `tsup`.

```
npm install @seventhplace/config
npm install @bufbuild/protobuf     # optional: proto bridge support
```
