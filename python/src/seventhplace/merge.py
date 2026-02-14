# SPDX-License-Identifier: Apache-2.0
"""Deep merge utility for layered configuration."""

from __future__ import annotations

from typing import Any


def deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Recursively merge override into base, returning a new dict.

    - Dict values: recurse (preserves sibling keys).
    - Non-dict values: override replaces base.
    - Neither input is mutated.
    """
    result = base.copy()
    for key, value in override.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_merge(result[key], value)
        else:
            result[key] = value
    return result
