// SPDX-License-Identifier: Apache-2.0
/**
 * CLIProvider — converts dotted-key CLI overrides to a nested config object.
 *
 * For v0.1, CLI overrides are passed as a plain object (not parsed from
 * process.argv). Full argument parsing integration is deferred.
 */

export class CLIProvider {
  /**
   * Convert dotted-key overrides to a nested object.
   *
   * @param overrides Object mapping dotted keys to string values.
   *                  Example: {"algo.friction": "0.50"}
   * @returns A nested object suitable for deepMerge.
   *          Example: {"algo": {"friction": 0.50}}
   */
  load(overrides: Record<string, string> | undefined): Record<string, unknown> {
    if (!overrides) {
      return {};
    }

    const result: Record<string, unknown> = {};

    for (const [dottedKey, rawValue] of Object.entries(overrides)) {
      const segments = dottedKey.split(".");
      const value = coerce(rawValue);

      let current: Record<string, unknown> = result;
      for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i];
        if (!(segment in current) || typeof current[segment] !== "object" || current[segment] === null) {
          current[segment] = {};
        }
        current = current[segment] as Record<string, unknown>;
      }
      current[segments[segments.length - 1]] = value;
    }

    return result;
  }
}

/**
 * Coerce a string CLI value to a JS type via JSON.parse().
 */
function coerce(raw: string): unknown {
  if (typeof raw !== "string") {
    return raw;
  }
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "number" || typeof parsed === "boolean") {
      return parsed;
    }
    if (parsed === null) {
      return raw;
    }
    if (typeof parsed === "string") {
      return parsed;
    }
    return raw;
  } catch {
    return raw;
  }
}
