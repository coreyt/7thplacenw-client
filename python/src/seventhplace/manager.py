# SPDX-License-Identifier: Apache-2.0
"""ConfigManager — orchestrates the layered configuration load pipeline."""

from __future__ import annotations

from pathlib import Path
from typing import Any, TypeVar

import pydantic

from seventhplace.errors import ValidationError
from seventhplace.merge import deep_merge
from seventhplace.providers.cli import CLIProvider
from seventhplace.providers.defaults import DefaultProvider
from seventhplace.providers.env import EnvProvider
from seventhplace.providers.file import FileProvider

T = TypeVar("T", bound=pydantic.BaseModel)


class ConfigManager:
    """Orchestrates the layered configuration load pipeline.

    Load flow:
        1. Extract defaults from schema (model_dump)
        2. Deep merge file overrides (one or more files, in order)
        3. Deep merge env overrides
        4. Deep merge CLI overrides
        5. Filter unknown keys (strict rejects, lenient strips)
        6. Construct final schema object (validates + freezes)
    """

    def load(
        self,
        schema: type[T],
        *,
        files: list[tuple[str | Path, bool]] | None = None,
        env_prefix: str | None = None,
        cli_overrides: dict[str, str] | None = None,
        strict: bool = False,
        base_dir: Path | None = None,
    ) -> T:
        """Load configuration from all layers and return a frozen, validated model.

        Args:
            schema:        The Pydantic model class (e.g., AppConfig).
            files:         List of (file_path, required) tuples.
                           Files are merged in order (later files win).
            env_prefix:    Bare prefix for env var scanning (e.g., "SEVENTHPLACE").
                           If None, env vars are not scanned.
            cli_overrides: Dict of dotted-key CLI overrides.
            strict:        If True, reject unknown keys with ValidationError.
                           If False, strip unknown keys silently.
            base_dir:      Base directory for file path traversal checks.

        Returns:
            A frozen, validated instance of the schema model.

        Raises:
            ValidationError: Type or constraint validation failed, or
                             unknown keys found in strict mode.
            ConfigFileNotFoundError: A required file is missing.
            PathTraversalError: A file path escapes the base directory.
            ParseError: A file contains invalid YAML/JSON.
        """
        # Step 1: Defaults
        merged = DefaultProvider().load(schema)

        # Step 2: File overrides
        if files:
            file_provider = FileProvider()
            for file_path, required in files:
                file_data = file_provider.load(
                    file_path, required=required, base_dir=base_dir
                )
                merged = deep_merge(merged, file_data)

        # Step 3: Env overrides
        if env_prefix is not None:
            env_data = EnvProvider().load(env_prefix)
            merged = deep_merge(merged, env_data)

        # Step 4: CLI overrides
        if cli_overrides:
            cli_data = CLIProvider().load(cli_overrides)
            merged = deep_merge(merged, cli_data)

        # Step 5: Handle unknown keys
        if strict:
            unknown = _find_unknown_keys(merged, schema)
            if unknown:
                raise ValidationError(
                    f"Unknown configuration keys: {', '.join(unknown)}",
                    field_path=unknown[0],
                )
        else:
            merged = _strip_unknown_keys(merged, schema)

        # Step 6: Construct and validate
        try:
            return schema(**merged)
        except pydantic.ValidationError as exc:
            raise ValidationError(
                _format_pydantic_error(exc)
            ) from exc


def _find_unknown_keys(
    data: dict[str, Any],
    schema: type[pydantic.BaseModel],
    prefix: str = "",
) -> list[str]:
    """Recursively find keys in data that are not fields of the schema."""
    unknown: list[str] = []
    schema_fields = schema.model_fields

    for key in data:
        field_path = key if not prefix else f"{prefix}.{key}"
        if key not in schema_fields:
            unknown.append(field_path)
        elif isinstance(data[key], dict):
            field_info = schema_fields[key]
            field_type = field_info.annotation
            if (
                field_type is not None
                and isinstance(field_type, type)
                and issubclass(field_type, pydantic.BaseModel)
            ):
                unknown.extend(
                    _find_unknown_keys(data[key], field_type, field_path)
                )

    return unknown


def _strip_unknown_keys(
    data: dict[str, Any],
    schema: type[pydantic.BaseModel],
) -> dict[str, Any]:
    """Recursively remove keys from data that are not fields of the schema."""
    schema_fields = schema.model_fields
    result: dict[str, Any] = {}

    for key, value in data.items():
        if key not in schema_fields:
            continue
        if isinstance(value, dict):
            field_info = schema_fields[key]
            field_type = field_info.annotation
            if (
                field_type is not None
                and isinstance(field_type, type)
                and issubclass(field_type, pydantic.BaseModel)
            ):
                result[key] = _strip_unknown_keys(value, field_type)
            else:
                result[key] = value
        else:
            result[key] = value

    return result


def _format_pydantic_error(exc: pydantic.ValidationError) -> str:
    """Format a Pydantic ValidationError into a user-friendly message.

    Includes field path and expected type. Never includes the raw value.
    """
    parts: list[str] = []
    for error in exc.errors():
        loc = ".".join(str(segment) for segment in error["loc"])
        msg = error["msg"]
        err_type = error["type"]
        parts.append(f"{loc}: {msg} (type={err_type})")
    return "; ".join(parts)
