# SPDX-License-Identifier: Apache-2.0
"""EnvProvider — maps PREFIX__SECTION__KEY env vars to nested config dicts."""

from __future__ import annotations

import os
from typing import Any

import yaml


class EnvProvider:
    """Reads environment variables with a given prefix and builds a nested dict."""

    def load(self, prefix: str) -> dict[str, Any]:
        """Scan os.environ for variables starting with PREFIX__.

        Args:
            prefix: Bare prefix string (e.g., "SEVENTHPLACE").
                    The library appends "__" internally.

        Returns:
            A nested dict of config overrides from matching env vars.
        """
        full_prefix = f"{prefix}__"
        result: dict[str, Any] = {}

        for key, raw_value in os.environ.items():
            if not key.startswith(full_prefix):
                continue

            # Strip the prefix and split into path segments
            remainder = key[len(full_prefix):]
            segments = remainder.lower().split("__")

            if not segments or not all(segments):
                continue  # skip malformed keys

            # Type coercion via yaml.safe_load
            value = self._coerce(raw_value)

            # Build nested dict from segments
            current = result
            for segment in segments[:-1]:
                if segment not in current:
                    current[segment] = {}
                current = current[segment]
            current[segments[-1]] = value

        return result

    @staticmethod
    def _coerce(raw: str) -> Any:
        """Coerce a string env var value to a Python type.

        Uses yaml.safe_load() which handles:
          - "9999"   -> int 9999
          - "0.60"   -> float 0.60
          - "true"   -> bool True
          - "hello"  -> str "hello"
        """
        try:
            parsed = yaml.safe_load(raw)
        except yaml.YAMLError:
            return raw

        # Only accept scalar types from yaml parsing
        if isinstance(parsed, (int, float, bool)):
            return parsed
        if parsed is None:
            return raw
        if isinstance(parsed, str):
            return parsed
        # Complex types (list, dict) — treat as raw string
        return raw
