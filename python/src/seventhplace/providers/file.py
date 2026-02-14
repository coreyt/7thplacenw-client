# SPDX-License-Identifier: Apache-2.0
"""FileProvider — loads config overrides from YAML or JSON files."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from seventhplace.errors import (
    ConfigFileNotFoundError,
    ParseError,
    PathTraversalError,
)


class FileProvider:
    """Loads configuration overrides from a YAML or JSON file."""

    def load(
        self,
        file_path: str | Path,
        *,
        required: bool = True,
        base_dir: Path | None = None,
    ) -> dict[str, Any]:
        """Load and parse a config file, returning a dict of overrides.

        Args:
            file_path: Path to the YAML/JSON file (relative to base_dir
                       or absolute).
            required:  If True, raise ConfigFileNotFoundError when the
                       file does not exist. If False, return empty dict.
            base_dir:  Base directory for path traversal checks.
                       Defaults to cwd.

        Returns:
            A dict of config overrides parsed from the file.
            Returns an empty dict for empty files or optional missing files.

        Raises:
            PathTraversalError: File path escapes the base directory.
            ConfigFileNotFoundError: Required file does not exist.
            ParseError: File contains invalid YAML/JSON syntax.
        """
        if base_dir is None:
            base_dir = Path.cwd()

        base_dir = base_dir.resolve()
        resolved = (base_dir / file_path).resolve()

        # Path traversal check
        if not resolved.is_relative_to(base_dir):
            raise PathTraversalError(
                f"Path '{file_path}' escapes the allowed base directory"
            )

        # File existence check
        if not resolved.is_file():
            if required:
                raise ConfigFileNotFoundError(
                    f"Required config file not found: {file_path}"
                )
            return {}

        # Read the file
        try:
            text = resolved.read_text(encoding="utf-8")
        except OSError as exc:
            raise ConfigFileNotFoundError(
                f"Cannot read config file: {file_path}"
            ) from exc

        # Parse YAML/JSON
        try:
            data = yaml.safe_load(text)
        except yaml.YAMLError as exc:
            raise ParseError(
                f"Failed to parse config file '{file_path}': {exc}"
            ) from exc

        # yaml.safe_load returns None for empty files
        if data is None:
            return {}

        if not isinstance(data, dict):
            raise ParseError(
                f"Config file '{file_path}' must contain a YAML mapping, "
                f"got {type(data).__name__}"
            )

        return data
