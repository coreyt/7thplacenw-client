// SPDX-License-Identifier: Apache-2.0
/**
 * EnvProvider — maps PREFIX__SECTION__KEY env vars to nested config objects.
 */

export class EnvProvider {
  /**
   * Scan process.env for variables starting with PREFIX__.
   *
   * @param prefix Bare prefix string (e.g., "SEVENTHPLACE").
   *               The library appends "__" internally.
   * @returns A nested object of config overrides from matching env vars.
   */
  load(prefix: string): Record<string, unknown> {
    const fullPrefix = `${prefix}__`;
    const result: Record<string, unknown> = {};

    for (const key of Object.keys(process.env)) {
      if (!key.startsWith(fullPrefix)) {
        continue;
      }
      const rawValue = process.env[key];
      if (rawValue === undefined) {
        continue;
      }

      // Strip the prefix and split into path segments
      const remainder = key.slice(fullPrefix.length);
      const segments = remainder.toLowerCase().split("__");

      if (segments.length === 0 || segments.some((s) => s === "")) {
        continue; // skip malformed keys
      }

      // Type coercion
      const value = coerce(rawValue);

      // Build nested object from segments
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
 * Coerce a string env var value to a JS type.
 *
 * Uses JSON.parse() which handles:
 *   "9999"   -> number 9999
 *   "0.60"   -> number 0.60
 *   "true"   -> boolean true
 *   "false"  -> boolean false
 *   "hello"  -> string "hello" (JSON.parse fails, falls back to raw)
 */
function coerce(raw: string): unknown {
  try {
    const parsed = JSON.parse(raw);
    // Only accept primitive types from JSON parsing
    if (
      typeof parsed === "number" ||
      typeof parsed === "boolean"
    ) {
      return parsed;
    }
    if (parsed === null) {
      return raw;
    }
    if (typeof parsed === "string") {
      return parsed;
    }
    // Complex types (array, object) — treat as raw string
    return raw;
  } catch {
    return raw;
  }
}
