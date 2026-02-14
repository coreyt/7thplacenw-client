// SPDX-License-Identifier: Apache-2.0
/**
 * FileProvider — loads config overrides from YAML or JSON files.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import YAML from "yaml";
import {
  FileNotFoundError,
  ParseError,
  PathTraversalError,
} from "../errors.js";

export class FileProvider {
  /**
   * Load and parse a config file, returning a dict of overrides.
   *
   * @param filePath  Path to the YAML/JSON file (relative to baseDir or absolute).
   * @param required  If true, throw FileNotFoundError when the file does not exist.
   *                  If false, return empty object.
   * @param baseDir   Base directory for path traversal checks. Defaults to cwd.
   * @returns A plain object of config overrides parsed from the file.
   */
  load(
    filePath: string,
    options: { required?: boolean; baseDir?: string } = {},
  ): Record<string, unknown> {
    const { required = true, baseDir = process.cwd() } = options;

    const resolvedBase = path.resolve(baseDir);
    const resolved = path.resolve(resolvedBase, filePath);

    // Path traversal check
    if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
      throw new PathTraversalError(
        `Path '${filePath}' escapes the allowed base directory`,
      );
    }

    // File existence check
    if (!fs.existsSync(resolved)) {
      if (required) {
        throw new FileNotFoundError(
          `Required config file not found: ${filePath}`,
        );
      }
      return {};
    }

    // Read the file
    let text: string;
    try {
      text = fs.readFileSync(resolved, "utf-8");
    } catch (err) {
      throw new FileNotFoundError(
        `Cannot read config file: ${filePath}`,
      );
    }

    // Empty file
    if (text.trim() === "") {
      return {};
    }

    // Parse YAML/JSON
    let data: unknown;
    try {
      data = YAML.parse(text);
    } catch (err) {
      throw new ParseError(
        `Failed to parse config file '${filePath}': ${err}`,
      );
    }

    // YAML.parse returns null/undefined for empty documents
    if (data == null) {
      return {};
    }

    if (typeof data !== "object" || Array.isArray(data)) {
      throw new ParseError(
        `Config file '${filePath}' must contain a YAML mapping, got ${typeof data}`,
      );
    }

    return data as Record<string, unknown>;
  }
}
