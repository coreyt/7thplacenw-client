# User Needs

## Personas

| Persona | Description |
|---------|-------------|
| **App Developer** | Writes application code that consumes configuration values. Works in one of the five supported languages. Wants typed access, sensible defaults, and fast iteration. |
| **DevOps Engineer** | Deploys and operates services. Needs to override config per environment (staging, production) without modifying code. Uses env vars, CLI flags, and config files. |
| **Team Lead** | Responsible for code quality and operational safety. Wants config to be auditable, documented, and impossible to misuse. Cares about security and consistency. |
| **Multi-Language Team** | A team running services in more than one language. Needs identical config behavior across languages so that a Python service and a Go service reading the same YAML file produce the same result. |

---

## User Needs

### UN-01: Replace Magic Numbers with Named, Typed Configuration

**As an** App Developer,
**I want** to define configuration as named, typed fields with sensible
defaults
**so that** I never use bare magic numbers in code, and typos or type
errors are caught before my code runs.

**Acceptance Criteria:**
- Config fields are accessed by name: `config.algo.friction`, not
  `config["algo"]["friction"]` or a bare `0.85`.
- Type mismatches (e.g., string where int is expected) are caught at
  load time with a clear error message.
- Every field has a default value. A program that loads config with no
  file, no env vars, and no CLI args gets a fully-populated config
  object with sensible defaults.
- The config schema IS the documentation of available knobs — no
  separate doc required to discover what fields exist.

---

### UN-02: Override Configuration Without Code Changes

**As a** DevOps Engineer,
**I want** to override configuration values via config files,
environment variables, or CLI arguments
**so that** I can tune behavior per environment without modifying or
recompiling code.

**Acceptance Criteria:**
- A config file (YAML or JSON) can override any field.
- An environment variable `SEVENTHPLACE__SECTION__KEY` can override
  any field.
- A CLI argument can override any field.
- No code changes, recompilation, or redeployment are required to
  change a config value — only a restart with the new input.

---

### UN-03: Predictable Override Precedence

**As an** App Developer or DevOps Engineer,
**I want** a clear, documented precedence order
**so that** I always know which value wins when multiple layers set the
same field.

**Acceptance Criteria:**
- Precedence is: Defaults < File < Env Vars < CLI Args.
- When multiple layers set the same field, the highest-priority layer
  wins. This is deterministic and documented.
- Removing a higher layer causes the next lower layer's value to take
  effect. This is testable and predictable.

---

### UN-04: Partial Overrides Preserve Unrelated Values

**As an** App Developer,
**I want** to override one field in a nested section without losing
sibling fields
**so that** my config files stay minimal and only specify what they
change.

**Acceptance Criteria:**
- A file that sets only `algo.friction: 0.72` does not affect
  `algo.max_retries`, `algo.timeout_ms`, or `algo.threshold`.
- Multiple files can each set different fields in the same section,
  and all overrides are applied.
- Deep merge is recursive — nested sections within nested sections
  are handled correctly.

---

### UN-05: Invalid Configuration Is Rejected at Startup

**As a** Team Lead,
**I want** the system to reject invalid configuration at startup
**so that** problems are found immediately, not three hours into a
production run.

**Acceptance Criteria:**
- Type errors produce a clear error at `load()` time with the field
  path and expected type.
- Constraint violations (value out of range, invalid enum, pattern
  mismatch) produce a clear error at `load()` time.
- The program never runs with a partially-constructed or invalid
  config object.
- Invalid values from any layer (file, env, CLI) are caught — not
  just file values.

---

### UN-06: Configuration Is Immutable After Load

**As an** App Developer,
**I want** the loaded config object to be frozen
**so that** no code path can accidentally mutate shared configuration
mid-run, causing concurrency bugs or non-reproducible behavior.

**Acceptance Criteria:**
- Attempting to mutate a field on the loaded config object fails
  (compile error, runtime error, or copy semantics depending on
  language).
- The config object is safe to share across threads/goroutines/tasks
  without synchronization.
- A running experiment uses a consistent snapshot of configuration
  for its entire duration.

---

### UN-07: Secrets Are Never Leaked in Logs or Errors

**As a** Team Lead,
**I want** sensitive fields (API keys, passwords, tokens) to be
redacted in string representations and error messages
**so that** secrets never appear in logs, stack traces, or monitoring
dashboards.

**Acceptance Criteria:**
- Fields marked as sensitive show `***` (or similar redaction) in
  `repr()`, `toString()`, `fmt.Print`, `operator<<`, etc.
- Validation error messages include the field path and expected type
  but never the raw value.
- Redaction happens by default — developers don't have to remember
  to filter secrets themselves.

---

### UN-08: Config Files Cannot Be Used for Path Traversal

**As a** Team Lead,
**I want** the file provider to reject paths that escape the allowed
directory
**so that** config loading cannot be exploited to read arbitrary files
on the filesystem (e.g., `/etc/passwd`).

**Acceptance Criteria:**
- A file path like `../../etc/passwd` is rejected with a security error.
- The resolved path is checked against a configurable base directory.
- The error message identifies the security violation without revealing
  the contents of the target file.

---

### UN-09: Idiomatic API in Each Language

**As an** App Developer,
**I want** the config library to feel native to my language
**so that** it doesn't fight the ecosystem or require me to learn
foreign abstractions.

**Acceptance Criteria:**
- Python uses Pydantic models, `frozen=True`, `SecretStr`.
- TypeScript uses zod schemas, `Object.freeze()`, `Readonly<T>`.
- Go uses struct tags, functional options, return-by-value.
- C# uses `record` types, `init` setters, `DataAnnotations`.
- C++ uses structs, `nlohmann::json`, `const&`, `std::expected`.
- No language is forced into another language's patterns (e.g., Go
  is not forced into a class-based ConfigManager API).

---

### UN-10: Cross-Language Behavioral Consistency

**As a** Multi-Language Team,
**I want** all implementations to behave identically given the same
inputs
**so that** config behavior is predictable regardless of which
language a service is written in.

**Acceptance Criteria:**
- All five implementations pass the same compliance test suite
  (TC-01 through TC-20) with identical expected outputs.
- Given the same YAML file, the same env vars, and the same CLI args,
  every language produces a config object with the same field values.
- The compliance spec (`test/COMPLIANCE.md`) is the single source of
  truth for expected behavior.

---

### UN-11: Graceful Handling of Optional and Missing Files

**As a** DevOps Engineer,
**I want** to mark config files as optional or required
**so that** a missing optional file (e.g., local dev overrides) doesn't
crash the app, but a missing required file (e.g., production secrets)
does.

**Acceptance Criteria:**
- Optional files that don't exist are silently skipped — no error.
- Required files that don't exist produce a clear "file not found" error.
- Empty files are handled gracefully — all fields retain defaults.

---

### UN-12: Unknown Config Keys Are Caught or Ignored Based on Mode

**As an** App Developer,
**I want** strict mode to catch typos in config keys, and lenient mode
to ignore them
**so that** I can choose the right trade-off: safety during development
(strict) vs. forward-compatibility in production (lenient).

**Acceptance Criteria:**
- Strict mode: a config file containing `algo.nonexistent_param: 42`
  produces a validation error naming the unknown key.
- Lenient mode: the same file is accepted, and the unknown key is
  silently ignored. Known keys are loaded normally.
- The mode is configurable per `load()` call.
