// SPDX-License-Identifier: Apache-2.0
/**
 * Configuration schema — hand-written from schema/proto/seventhplace/config.proto.
 *
 * Uses zod for validation, type inference, and default values.
 */

import { z } from "zod";

/** Set of dot-paths that are marked as sensitive (redacted in toString). */
const SENSITIVE_PATHS = new Set<string>(["secrets.api_key"]);

/** Check whether a dot-path is sensitive. */
export function isSensitive(path: string): boolean {
  return SENSITIVE_PATHS.has(path);
}

// ── Sub-schemas ──────────────────────────────────────────────────

export const AlgoConfigSchema = z.object({
  friction: z.number().min(0).max(1).default(0.85),
  max_retries: z.number().int().nonnegative().default(3),
  timeout_ms: z.number().int().positive().default(5000),
  threshold: z.number().min(0).max(1).default(0.65),
});

export const DbConfigSchema = z.object({
  host: z.string().default("localhost"),
  port: z.number().int().min(1).max(65535).default(5432),
  pool_size: z.number().int().positive().default(10),
});

export const SecretsConfigSchema = z.object({
  api_key: z.string().default(""),
});

const allowedEnvValues = ["production", "staging", "dev"] as const;

export const AppConfigSchema = z.object({
  app_name: z.string().default("7thplace"),
  env: z
    .string()
    .default("production")
    .transform((v) => v.toLowerCase())
    .pipe(
      z.enum(allowedEnvValues, {
        errorMap: () => ({
          message: `Invalid value for 'env': must be one of ${allowedEnvValues.join(", ")}`,
        }),
      }),
    ),
  algo: AlgoConfigSchema.default({}),
  db: DbConfigSchema.default({}),
  secrets: SecretsConfigSchema.default({}),
});

// ── Inferred types ───────────────────────────────────────────────

export type AlgoConfig = z.infer<typeof AlgoConfigSchema>;
export type DbConfig = z.infer<typeof DbConfigSchema>;
export type SecretsConfig = z.infer<typeof SecretsConfigSchema>;
export type AppConfig = z.infer<typeof AppConfigSchema>;

// ── Deep freeze ──────────────────────────────────────────────────

/** Recursively freeze an object and all nested objects. */
export function deepFreeze<T extends object>(obj: T): Readonly<T> {
  for (const value of Object.values(obj)) {
    if (typeof value === "object" && value !== null) {
      deepFreeze(value as object);
    }
  }
  return Object.freeze(obj);
}

// ── Redacted toString ────────────────────────────────────────────

/**
 * Create a string representation of a config object, redacting sensitive fields.
 */
export function configToString(
  obj: Record<string, unknown>,
  prefix = "",
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isSensitive(path)) {
      parts.push(`${key}: "***"`);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      parts.push(`${key}: { ${configToString(value as Record<string, unknown>, path)} }`);
    } else {
      parts.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  return parts.join(", ");
}

// ── Schema field introspection ───────────────────────────────────

/**
 * Collect all known field names from a zod schema recursively.
 * Returns a nested representation of known keys for unknown-key detection.
 */
export function getSchemaShape(
  schema: z.ZodTypeAny,
): Record<string, z.ZodTypeAny> | null {
  // Unwrap default, optional, nullable, effects (transform/refine/pipe)
  if (schema instanceof z.ZodDefault) {
    return getSchemaShape(schema._def.innerType);
  }
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return getSchemaShape(schema._def.innerType);
  }
  if (schema instanceof z.ZodEffects) {
    return getSchemaShape(schema._def.schema);
  }
  if (schema instanceof z.ZodPipeline) {
    // For pipe, the input schema contains the shape
    return getSchemaShape(schema._def.in);
  }

  if (schema instanceof z.ZodObject) {
    return schema.shape;
  }

  return null;
}
