// SPDX-License-Identifier: Apache-2.0
/**
 * DefaultProvider — extracts schema defaults as a plain object.
 */

import { z } from "zod";
import { getSchemaShape } from "../schema.js";

/**
 * Extracts default values from a zod schema by parsing an empty object.
 *
 * The result is a plain object with all defaults filled in,
 * suitable for use as the base layer in the merge pipeline.
 */
export class DefaultProvider {
  load(schema: z.ZodTypeAny): Record<string, unknown> {
    // Parse an empty object to get all defaults.
    // For AppConfigSchema with .default({}) on sub-objects, parsing {}
    // fills in all defaults recursively.
    const result = schema.parse({});
    return result as Record<string, unknown>;
  }
}
