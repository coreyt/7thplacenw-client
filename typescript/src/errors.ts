// SPDX-License-Identifier: Apache-2.0
/**
 * Exception hierarchy for the seventhplace configuration library.
 */

/** Base error for all seventhplace errors. */
export class SeventhPlaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SeventhPlaceError";
  }
}

/**
 * Schema validation failed.
 *
 * Includes the field path and expected type.
 * NEVER includes the raw invalid value (to avoid leaking secrets).
 */
export class ValidationError extends SeventhPlaceError {
  readonly fieldPath: string;
  readonly expectedType: string;

  constructor(message: string, fieldPath = "", expectedType = "") {
    super(message);
    this.name = "ValidationError";
    this.fieldPath = fieldPath;
    this.expectedType = expectedType;
  }
}

/**
 * A required configuration file was not found.
 */
export class FileNotFoundError extends SeventhPlaceError {
  constructor(message: string) {
    super(message);
    this.name = "FileNotFoundError";
  }
}

/**
 * File path escapes the allowed base directory.
 * This is a security error. The file is NOT read.
 */
export class PathTraversalError extends SeventhPlaceError {
  constructor(message: string) {
    super(message);
    this.name = "PathTraversalError";
  }
}

/**
 * YAML or JSON syntax error during file parsing.
 */
export class ParseError extends SeventhPlaceError {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
}
