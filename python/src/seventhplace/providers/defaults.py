# SPDX-License-Identifier: Apache-2.0
"""DefaultProvider — extracts schema defaults as a dict."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, SecretStr


def _reveal_secrets(data: Any) -> Any:
    """Recursively convert SecretStr instances to their plain string values."""
    if isinstance(data, dict):
        return {k: _reveal_secrets(v) for k, v in data.items()}
    if isinstance(data, SecretStr):
        return data.get_secret_value()
    if isinstance(data, list):
        return [_reveal_secrets(item) for item in data]
    return data


class DefaultProvider:
    """Extracts default values from a Pydantic schema class."""

    def load(self, schema: type[BaseModel]) -> dict[str, Any]:
        """Instantiate schema with no arguments, dump to dict.

        SecretStr values are revealed (converted to plain strings)
        because the merge pipeline works in dict-space with plain values.
        Pydantic re-wraps them into SecretStr at the final validation step.
        """
        instance = schema()
        data = instance.model_dump()
        return _reveal_secrets(data)
