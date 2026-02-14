# SPDX-License-Identifier: Apache-2.0
"""Shared pytest fixtures for the seventhplace test suite."""

from __future__ import annotations

import os
from pathlib import Path

import pytest


@pytest.fixture
def fixtures_dir() -> Path:
    """Return the path to the shared test fixtures directory."""
    return Path(__file__).resolve().parent.parent.parent / "test" / "fixtures"


@pytest.fixture(autouse=True)
def clean_env():
    """Remove all SEVENTHPLACE__* env vars before and after each test."""
    _clear_seventhplace_env()
    yield
    _clear_seventhplace_env()


def _clear_seventhplace_env() -> None:
    """Remove all environment variables starting with SEVENTHPLACE__."""
    to_remove = [k for k in os.environ if k.startswith("SEVENTHPLACE__")]
    for key in to_remove:
        del os.environ[key]
