// SPDX-License-Identifier: Apache-2.0
/**
 * Deep merge utility for layered configuration.
 */

/**
 * Recursively merge override into base, returning a new object.
 *
 * - Object values: recurse (preserves sibling keys).
 * - Non-object values: override replaces base.
 * - Neither input is mutated.
 */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const baseVal = result[key];
    if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof baseVal === "object" &&
      baseVal !== null &&
      !Array.isArray(baseVal)
    ) {
      result[key] = deepMerge(
        baseVal as Record<string, unknown>,
        value as Record<string, unknown>,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}
