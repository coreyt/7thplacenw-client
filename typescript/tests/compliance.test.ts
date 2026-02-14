// SPDX-License-Identifier: Apache-2.0
/**
 * Compliance test suite — TC-01 through TC-20.
 *
 * Maps directly to test/COMPLIANCE.md. Each test case uses the shared
 * fixtures in test/fixtures/ and validates exact behavioral requirements.
 */

import * as path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ConfigManager,
  AppConfigSchema,
  FileNotFoundError,
  PathTraversalError,
  ValidationError,
  configToString,
} from "../src/index.js";
import type { AppConfig } from "../src/index.js";

const fixturesDir = path.resolve(__dirname, "../../test/fixtures");

/** Remove all SEVENTHPLACE__* env vars. */
function clearSeventhplaceEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("SEVENTHPLACE__")) {
      delete process.env[key];
    }
  }
}

describe("Compliance Tests", () => {
  let manager: ConfigManager;

  beforeEach(() => {
    manager = new ConfigManager();
    clearSeventhplaceEnv();
  });

  afterEach(() => {
    clearSeventhplaceEnv();
  });

  // ── TC-01: Defaults Only ──────────────────────────────────────

  it("TC-01: Defaults Only", () => {
    const config = manager.load<AppConfig>(AppConfigSchema);

    expect(config.app_name).toBe("7thplace");
    expect(config.env).toBe("production");
    expect(config.algo.friction).toBe(0.85);
    expect(config.algo.max_retries).toBe(3);
    expect(config.algo.timeout_ms).toBe(5000);
    expect(config.algo.threshold).toBe(0.65);
    expect(config.db.host).toBe("localhost");
    expect(config.db.port).toBe(5432);
    expect(config.db.pool_size).toBe(10);
    expect(config.secrets.api_key).toBe("");
  });

  // ── TC-02: File Override — Flat Field ─────────────────────────

  it("TC-02: File Override — Flat Field", () => {
    const config = manager.load<AppConfig>(AppConfigSchema, {
      files: [[path.join(fixturesDir, "override_flat.yaml"), true]],
      baseDir: fixturesDir,
    });

    expect(config.app_name).toBe("custom-app"); // overridden
    expect(config.env).toBe("production"); // default preserved
  });

  // ── TC-03: File Override — Deep Merge ─────────────────────────

  it("TC-03: File Override — Deep Merge", () => {
    const config = manager.load<AppConfig>(AppConfigSchema, {
      files: [[path.join(fixturesDir, "override_nested.yaml"), true]],
      baseDir: fixturesDir,
    });

    expect(config.algo.friction).toBe(0.72); // overridden
    expect(config.algo.max_retries).toBe(3); // default preserved
    expect(config.algo.timeout_ms).toBe(5000); // default preserved
  });

  // ── TC-04: Env Override ───────────────────────────────────────

  it("TC-04: Env Override", () => {
    process.env["SEVENTHPLACE__ALGO__FRICTION"] = "0.60";

    const config = manager.load<AppConfig>(AppConfigSchema, {
      envPrefix: "SEVENTHPLACE",
    });

    expect(config.algo.friction).toBeCloseTo(0.6);
  });

  // ── TC-05: Env Overrides File ─────────────────────────────────

  it("TC-05: Env Overrides File", () => {
    process.env["SEVENTHPLACE__ALGO__FRICTION"] = "0.60";

    const config = manager.load<AppConfig>(AppConfigSchema, {
      files: [[path.join(fixturesDir, "override_nested.yaml"), true]],
      envPrefix: "SEVENTHPLACE",
      baseDir: fixturesDir,
    });

    expect(config.algo.friction).toBeCloseTo(0.6);
  });

  // ── TC-06: Env Nesting — Multi-Level ──────────────────────────

  it("TC-06: Env Nesting — Multi-Level", () => {
    process.env["SEVENTHPLACE__DB__HOST"] = "db.prod.internal";

    const config = manager.load<AppConfig>(AppConfigSchema, {
      envPrefix: "SEVENTHPLACE",
    });

    expect(config.db.host).toBe("db.prod.internal"); // overridden
    expect(config.db.port).toBe(5432); // default preserved
    expect(config.db.pool_size).toBe(10); // default preserved
  });

  // ── TC-07: Type Coercion from Env ─────────────────────────────

  it("TC-07: Type Coercion from Env", () => {
    process.env["SEVENTHPLACE__DB__PORT"] = "9999";

    const config = manager.load<AppConfig>(AppConfigSchema, {
      envPrefix: "SEVENTHPLACE",
    });

    expect(config.db.port).toBe(9999);
    expect(typeof config.db.port).toBe("number");
  });

  // ── TC-08: Type Coercion Failure ──────────────────────────────

  it("TC-08: Type Coercion Failure", () => {
    process.env["SEVENTHPLACE__DB__PORT"] = "not_a_number";

    expect(() => {
      manager.load<AppConfig>(AppConfigSchema, {
        envPrefix: "SEVENTHPLACE",
      });
    }).toThrow(ValidationError);

    try {
      manager.load<AppConfig>(AppConfigSchema, {
        envPrefix: "SEVENTHPLACE",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const msg = (err as ValidationError).message.toLowerCase();
      // Must identify the field
      expect(msg).toContain("port");
    }
  });

  // ── TC-09: Missing Optional File ──────────────────────────────

  it("TC-09: Missing Optional File", () => {
    const config = manager.load<AppConfig>(AppConfigSchema, {
      files: [[path.join(fixturesDir, "nonexistent.yaml"), false]],
      baseDir: fixturesDir,
    });

    expect(config.app_name).toBe("7thplace");
    expect(config.algo.friction).toBe(0.85);
  });

  // ── TC-10: Missing Required File ──────────────────────────────

  it("TC-10: Missing Required File", () => {
    expect(() => {
      manager.load<AppConfig>(AppConfigSchema, {
        files: [[path.join(fixturesDir, "nonexistent.yaml"), true]],
        baseDir: fixturesDir,
      });
    }).toThrow(FileNotFoundError);
  });

  // ── TC-11: Immutability ───────────────────────────────────────

  it("TC-11: Immutability", () => {
    const config = manager.load<AppConfig>(AppConfigSchema);

    // Mutation attempt on frozen object should throw
    expect(() => {
      (config.algo as Record<string, unknown>).friction = 0.99;
    }).toThrow();
  });

  // ── TC-12: Sensitive Field Redaction ──────────────────────────

  it("TC-12: Sensitive Field Redaction", () => {
    process.env["SEVENTHPLACE__SECRETS__API_KEY"] = "sk-12345";

    const config = manager.load<AppConfig>(AppConfigSchema, {
      envPrefix: "SEVENTHPLACE",
    });

    // The actual value is accessible programmatically
    expect(config.secrets.api_key).toBe("sk-12345");

    // But toString/configToString must NOT contain the raw secret
    const repr = configToString(config as unknown as Record<string, unknown>);
    expect(repr).not.toContain("sk-12345");
    expect(repr).toContain("***");
  });

  // ── TC-13: Full Precedence Stack ──────────────────────────────

  it("TC-13: Full Precedence Stack", () => {
    // All three layers: default=0.85, file=0.72, env=0.60
    process.env["SEVENTHPLACE__ALGO__FRICTION"] = "0.60";

    let config = manager.load<AppConfig>(AppConfigSchema, {
      files: [[path.join(fixturesDir, "override_nested.yaml"), true]],
      envPrefix: "SEVENTHPLACE",
      baseDir: fixturesDir,
    });
    expect(config.algo.friction).toBeCloseTo(0.6); // env wins

    // Remove env, reload -> file wins
    delete process.env["SEVENTHPLACE__ALGO__FRICTION"];
    config = manager.load<AppConfig>(AppConfigSchema, {
      files: [[path.join(fixturesDir, "override_nested.yaml"), true]],
      envPrefix: "SEVENTHPLACE",
      baseDir: fixturesDir,
    });
    expect(config.algo.friction).toBeCloseTo(0.72); // file wins

    // Remove file, reload -> default wins
    config = manager.load<AppConfig>(AppConfigSchema, {
      envPrefix: "SEVENTHPLACE",
    });
    expect(config.algo.friction).toBeCloseTo(0.85); // default
  });

  // ── TC-14: Unknown Keys — Strict Mode ─────────────────────────

  it("TC-14: Unknown Keys — Strict Mode", () => {
    expect(() => {
      manager.load<AppConfig>(AppConfigSchema, {
        files: [[path.join(fixturesDir, "unknown_keys.yaml"), true]],
        strict: true,
        baseDir: fixturesDir,
      });
    }).toThrow(ValidationError);

    try {
      manager.load<AppConfig>(AppConfigSchema, {
        files: [[path.join(fixturesDir, "unknown_keys.yaml"), true]],
        strict: true,
        baseDir: fixturesDir,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).message).toContain("nonexistent_param");
    }
  });

  // ── TC-15: Unknown Keys — Lenient Mode ────────────────────────

  it("TC-15: Unknown Keys — Lenient Mode", () => {
    const config = manager.load<AppConfig>(AppConfigSchema, {
      files: [[path.join(fixturesDir, "unknown_keys.yaml"), true]],
      strict: false,
      baseDir: fixturesDir,
    });

    // Known key from the file is applied
    expect(config.algo.friction).toBe(0.72);
    // Unknown key is silently ignored
    expect((config.algo as Record<string, unknown>)["nonexistent_param"]).toBeUndefined();
  });

  // ── TC-16: Empty File ─────────────────────────────────────────

  it("TC-16: Empty File", () => {
    const config = manager.load<AppConfig>(AppConfigSchema, {
      files: [[path.join(fixturesDir, "empty.yaml"), true]],
      baseDir: fixturesDir,
    });

    expect(config.app_name).toBe("7thplace");
    expect(config.algo.friction).toBe(0.85);
    expect(config.db.port).toBe(5432);
  });

  // ── TC-17: Path Traversal Rejection ───────────────────────────

  it("TC-17: Path Traversal Rejection", () => {
    expect(() => {
      manager.load<AppConfig>(AppConfigSchema, {
        files: [["../../etc/passwd", true]],
        baseDir: fixturesDir,
      });
    }).toThrow(PathTraversalError);
  });

  // ── TC-18: Multiple File Merge ────────────────────────────────

  it("TC-18: Multiple File Merge", () => {
    const config = manager.load<AppConfig>(AppConfigSchema, {
      files: [
        [path.join(fixturesDir, "override_flat.yaml"), true],
        [path.join(fixturesDir, "override_nested.yaml"), true],
      ],
      baseDir: fixturesDir,
    });

    expect(config.app_name).toBe("custom-app"); // from file 1
    expect(config.algo.friction).toBe(0.72); // from file 2
    expect(config.algo.max_retries).toBe(3); // default preserved
  });

  // ── TC-19: CLI Overrides Env ──────────────────────────────────

  it("TC-19: CLI Overrides Env", () => {
    process.env["SEVENTHPLACE__ALGO__FRICTION"] = "0.60";

    // With CLI override -> CLI wins
    let config = manager.load<AppConfig>(AppConfigSchema, {
      envPrefix: "SEVENTHPLACE",
      cliOverrides: { "algo.friction": "0.50" },
    });
    expect(config.algo.friction).toBeCloseTo(0.5); // CLI wins

    // Without CLI override -> env wins
    config = manager.load<AppConfig>(AppConfigSchema, {
      envPrefix: "SEVENTHPLACE",
    });
    expect(config.algo.friction).toBeCloseTo(0.6); // env wins
  });

  // ── TC-20: Enum Validation ────────────────────────────────────

  it("TC-20: Enum Validation", () => {
    expect(() => {
      manager.load<AppConfig>(AppConfigSchema, {
        files: [[path.join(fixturesDir, "invalid_enum.yaml"), true]],
        baseDir: fixturesDir,
      });
    }).toThrow(ValidationError);

    try {
      manager.load<AppConfig>(AppConfigSchema, {
        files: [[path.join(fixturesDir, "invalid_enum.yaml"), true]],
        baseDir: fixturesDir,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const msg = (err as ValidationError).message.toLowerCase();
      // Must identify the field
      expect(msg).toContain("env");
      // Must list valid values
      expect(
        msg.includes("production") || msg.includes("staging") || msg.includes("dev"),
      ).toBe(true);
    }
  });
});
