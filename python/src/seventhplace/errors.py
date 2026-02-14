# SPDX-License-Identifier: Apache-2.0
"""Exception hierarchy for the seventhplace configuration library."""

from __future__ import annotations


class SeventhPlaceError(Exception):
    """Base exception for all seventhplace errors."""


class ValidationError(SeventhPlaceError):
    """Schema validation failed.

    Includes the field path and expected type.
    NEVER includes the raw invalid value (to avoid leaking secrets).
    """

    def __init__(
        self,
        message: str,
        field_path: str = "",
        expected_type: str = "",
    ) -> None:
        self.field_path = field_path
        self.expected_type = expected_type
        super().__init__(message)


class ConfigFileNotFoundError(SeventhPlaceError):
    """A required configuration file was not found.

    Named ConfigFileNotFoundError (not FileNotFoundError) to avoid
    shadowing the Python builtin.
    """


class PathTraversalError(SeventhPlaceError):
    """File path escapes the allowed base directory.

    This is a security error. The file is NOT read.
    """


class ParseError(SeventhPlaceError):
    """YAML or JSON syntax error during file parsing."""
