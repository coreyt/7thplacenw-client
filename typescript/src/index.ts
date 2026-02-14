// SPDX-License-Identifier: Apache-2.0
/**
 * @seventhplace/config — Cross-platform Layered Configuration Manager.
 */

export {
  SeventhPlaceError,
  ValidationError,
  FileNotFoundError,
  PathTraversalError,
  ParseError,
} from "./errors.js";

export { deepMerge } from "./merge.js";

export {
  AppConfigSchema,
  AlgoConfigSchema,
  DbConfigSchema,
  SecretsConfigSchema,
  deepFreeze,
  configToString,
  isSensitive,
} from "./schema.js";

export type {
  AppConfig,
  AlgoConfig,
  DbConfig,
  SecretsConfig,
} from "./schema.js";

export {
  CLIProvider,
  DefaultProvider,
  EnvProvider,
  FileProvider,
} from "./providers/index.js";

export { ConfigManager } from "./manager.js";
export type { LoadOptions } from "./manager.js";
