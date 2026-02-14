# SPDX-License-Identifier: Apache-2.0
"""seventhplace — Cross-platform Layered Configuration Manager."""

from seventhplace.errors import (
    ConfigFileNotFoundError,
    ParseError,
    PathTraversalError,
    SeventhPlaceError,
    ValidationError,
)
from seventhplace.manager import ConfigManager
from seventhplace.merge import deep_merge
from seventhplace.providers import (
    CLIProvider,
    DefaultProvider,
    EnvProvider,
    FileProvider,
)
from seventhplace.schema import AlgoConfig, AppConfig, DbConfig, SecretsConfig

__all__ = [
    "ConfigManager",
    "deep_merge",
    "AppConfig",
    "AlgoConfig",
    "DbConfig",
    "SecretsConfig",
    "CLIProvider",
    "DefaultProvider",
    "EnvProvider",
    "FileProvider",
    "SeventhPlaceError",
    "ValidationError",
    "ConfigFileNotFoundError",
    "PathTraversalError",
    "ParseError",
]
