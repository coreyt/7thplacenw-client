// SPDX-License-Identifier: Apache-2.0
/**
 * ConfigManager — orchestrates the layered configuration load pipeline.
 */

import { z } from "zod";
import { ValidationError } from "./errors.js";
import { deepMerge } from "./merge.js";
import { deepFreeze, getSchemaShape } from "./schema.js";
import { CLIProvider } from "./providers/cli.js";
import { DefaultProvider } from "./providers/defaults.js";
import { EnvProvider } from "./providers/env.js";
import { FileProvider } from "./providers/file.js";

export interface LoadOptions {
  /**
   * List of [filePath, required] tuples.
   * Files are merged in order (later files win).
   */
  files?: Array<[string, boolean]>;

  /** Bare prefix for env var scanning (e.g., "SEVENTHPLACE"). */
  envPrefix?: string;

  /** Dict of dotted-key CLI overrides. */
  cliOverrides?: Record<string, string>;

  /**
   * If true, reject unknown keys with ValidationError.
   * If false, strip unknown keys silently.
   */
  strict?: boolean;

  /** Base directory for file path traversal checks. */
  baseDir?: string;
}

/**
 * Orchestrates the layered configuration load pipeline.
 *
 * Load flow:
 *   1. Extract defaults from schema (parse empty object)
 *   2. Deep merge file overrides (one or more files, in order)
 *   3. Deep merge env overrides
 *   4. Deep merge CLI overrides
 *   5. Filter unknown keys (strict rejects, lenient strips)
 *   6. Validate + freeze final config object
 */
export class ConfigManager {
  load<T>(schema: z.ZodTypeAny, options: LoadOptions = {}): T {
    const {
      files,
      envPrefix,
      cliOverrides,
      strict = false,
      baseDir,
    } = options;

    // Step 1: Defaults
    const defaultProvider = new DefaultProvider();
    let merged: Record<string, unknown> = defaultProvider.load(schema);

    // Step 2: File overrides
    if (files) {
      const fileProvider = new FileProvider();
      for (const [filePath, required] of files) {
        const fileData = fileProvider.load(filePath, { required, baseDir });
        merged = deepMerge(merged, fileData);
      }
    }

    // Step 3: Env overrides
    if (envPrefix !== undefined) {
      const envProvider = new EnvProvider();
      const envData = envProvider.load(envPrefix);
      merged = deepMerge(merged, envData);
    }

    // Step 4: CLI overrides
    if (cliOverrides) {
      const cliProvider = new CLIProvider();
      const cliData = cliProvider.load(cliOverrides);
      merged = deepMerge(merged, cliData);
    }

    // Step 5: Handle unknown keys
    if (strict) {
      const unknown = findUnknownKeys(merged, schema);
      if (unknown.length > 0) {
        throw new ValidationError(
          `Unknown configuration keys: ${unknown.join(", ")}`,
          unknown[0],
        );
      }
    } else {
      merged = stripUnknownKeys(merged, schema);
    }

    // Step 6: Validate with the schema
    // We need to use the raw (pre-defaults) schema for strict parsing,
    // but since we already have defaults merged in, we just parse.
    let result: T;
    try {
      result = schema.parse(merged) as T;
    } catch (err) {
      if (err instanceof z.ZodError) {
        throw new ValidationError(formatZodError(err));
      }
      throw err;
    }

    // Deep freeze the result
    if (typeof result === "object" && result !== null) {
      deepFreeze(result as object);
    }

    return result;
  }
}

/**
 * Recursively find keys in data that are not in the schema shape.
 */
function findUnknownKeys(
  data: Record<string, unknown>,
  schema: z.ZodTypeAny,
  prefix = "",
): string[] {
  const unknown: string[] = [];
  const shape = getSchemaShape(schema);

  if (!shape) {
    return unknown;
  }

  for (const key of Object.keys(data)) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (!(key in shape)) {
      unknown.push(fieldPath);
    } else if (typeof data[key] === "object" && data[key] !== null && !Array.isArray(data[key])) {
      const fieldSchema = shape[key];
      unknown.push(
        ...findUnknownKeys(data[key] as Record<string, unknown>, fieldSchema, fieldPath),
      );
    }
  }

  return unknown;
}

/**
 * Recursively remove keys from data that are not in the schema shape.
 */
function stripUnknownKeys(
  data: Record<string, unknown>,
  schema: z.ZodTypeAny,
): Record<string, unknown> {
  const shape = getSchemaShape(schema);

  if (!shape) {
    return data;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (!(key in shape)) {
      continue;
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = stripUnknownKeys(value as Record<string, unknown>, shape[key]);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Format a ZodError into a user-friendly message.
 *
 * Includes field path and expected type. Never includes the raw value.
 */
function formatZodError(err: z.ZodError): string {
  return err.issues
    .map((issue) => {
      const loc = issue.path.join(".");
      return `${loc}: ${issue.message} (code=${issue.code})`;
    })
    .join("; ");
}
