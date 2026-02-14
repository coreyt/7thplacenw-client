# SPDX-License-Identifier: Apache-2.0
"""CLIProvider — converts dotted-key CLI overrides to a nested config dict."""

from __future__ import annotations

from typing import Any

import yaml


class CLIProvider:
    """Converts a dict of dotted-key overrides to a nested config dict.

    For v0.1, CLI overrides are passed as a plain dict (not parsed from
    sys.argv). Full argparse integration is deferred.
    """

    def load(self, overrides: dict[str, str] | None) -> dict[str, Any]:
        """Convert dotted-key overrides to a nested dict.

        Args:
            overrides: Dict mapping dotted keys to string values.
                       Example: {"algo.friction": "0.50"}

        Returns:
            A nested dict suitable for deep_merge.
            Example: {"algo": {"friction": 0.50}}
        """
        if not overrides:
            return {}

        result: dict[str, Any] = {}

        for dotted_key, raw_value in overrides.items():
            segments = dotted_key.split(".")
            value = self._coerce(raw_value)

            current = result
            for segment in segments[:-1]:
                if segment not in current:
                    current[segment] = {}
                current = current[segment]
            current[segments[-1]] = value

        return result

    @staticmethod
    def _coerce(raw: str) -> Any:
        """Coerce a string CLI value to a Python type via yaml.safe_load()."""
        if not isinstance(raw, str):
            return raw
        try:
            parsed = yaml.safe_load(raw)
        except yaml.YAMLError:
            return raw

        if isinstance(parsed, (int, float, bool)):
            return parsed
        if parsed is None:
            return raw
        if isinstance(parsed, str):
            return parsed
        return raw
