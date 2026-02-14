# SPDX-License-Identifier: Apache-2.0
"""Compliance test suite — TC-01 through TC-20.

Maps directly to test/COMPLIANCE.md. Each test case uses the shared
fixtures in test/fixtures/ and validates exact behavioral requirements.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest

from seventhplace import (
    AppConfig,
    ConfigFileNotFoundError,
    ConfigManager,
    PathTraversalError,
    ValidationError,
)


@pytest.fixture
def manager() -> ConfigManager:
    return ConfigManager()


# ── TC-01: Defaults Only ──────────────────────────────────────────


def test_tc01_defaults_only(manager: ConfigManager) -> None:
    """No config file, no env vars, no CLI args -> all schema defaults."""
    config = manager.load(AppConfig)

    assert config.app_name == "7thplace"
    assert config.env == "production"
    assert config.algo.friction == 0.85
    assert config.algo.max_retries == 3
    assert config.algo.timeout_ms == 5000
    assert config.algo.threshold == 0.65
    assert config.db.host == "localhost"
    assert config.db.port == 5432
    assert config.db.pool_size == 10
    assert config.secrets.api_key.get_secret_value() == ""


# ── TC-02: File Override — Flat Field ─────────────────────────────


def test_tc02_file_override_flat(
    manager: ConfigManager, fixtures_dir: Path
) -> None:
    """override_flat.yaml overrides app_name only."""
    config = manager.load(
        AppConfig,
        files=[(fixtures_dir / "override_flat.yaml", True)],
        base_dir=fixtures_dir,
    )

    assert config.app_name == "custom-app"  # overridden
    assert config.env == "production"  # default preserved


# ── TC-03: File Override — Deep Merge ─────────────────────────────


def test_tc03_file_override_deep_merge(
    manager: ConfigManager, fixtures_dir: Path
) -> None:
    """override_nested.yaml overrides algo.friction, siblings preserved."""
    config = manager.load(
        AppConfig,
        files=[(fixtures_dir / "override_nested.yaml", True)],
        base_dir=fixtures_dir,
    )

    assert config.algo.friction == 0.72  # overridden
    assert config.algo.max_retries == 3  # default preserved
    assert config.algo.timeout_ms == 5000  # default preserved


# ── TC-04: Env Override ───────────────────────────────────────────


def test_tc04_env_override(manager: ConfigManager) -> None:
    """SEVENTHPLACE__ALGO__FRICTION=0.60 overrides default."""
    os.environ["SEVENTHPLACE__ALGO__FRICTION"] = "0.60"

    config = manager.load(AppConfig, env_prefix="SEVENTHPLACE")

    assert config.algo.friction == pytest.approx(0.60)


# ── TC-05: Env Overrides File ────────────────────────────────────


def test_tc05_env_overrides_file(
    manager: ConfigManager, fixtures_dir: Path
) -> None:
    """Env var wins over file for the same field."""
    os.environ["SEVENTHPLACE__ALGO__FRICTION"] = "0.60"

    config = manager.load(
        AppConfig,
        files=[(fixtures_dir / "override_nested.yaml", True)],
        env_prefix="SEVENTHPLACE",
        base_dir=fixtures_dir,
    )

    assert config.algo.friction == pytest.approx(0.60)


# ── TC-06: Env Nesting — Multi-Level ─────────────────────────────


def test_tc06_env_nesting_multi_level(manager: ConfigManager) -> None:
    """SEVENTHPLACE__DB__HOST overrides db.host, siblings preserved."""
    os.environ["SEVENTHPLACE__DB__HOST"] = "db.prod.internal"

    config = manager.load(AppConfig, env_prefix="SEVENTHPLACE")

    assert config.db.host == "db.prod.internal"  # overridden
    assert config.db.port == 5432  # default preserved
    assert config.db.pool_size == 10  # default preserved


# ── TC-07: Type Coercion from Env ─────────────────────────────────


def test_tc07_type_coercion_env(manager: ConfigManager) -> None:
    """String "9999" is coerced to int 9999."""
    os.environ["SEVENTHPLACE__DB__PORT"] = "9999"

    config = manager.load(AppConfig, env_prefix="SEVENTHPLACE")

    assert config.db.port == 9999
    assert isinstance(config.db.port, int)


# ── TC-08: Type Coercion Failure ──────────────────────────────────


def test_tc08_type_coercion_failure(manager: ConfigManager) -> None:
    """SEVENTHPLACE__DB__PORT=not_a_number raises ValidationError."""
    os.environ["SEVENTHPLACE__DB__PORT"] = "not_a_number"

    with pytest.raises(ValidationError) as exc_info:
        manager.load(AppConfig, env_prefix="SEVENTHPLACE")

    error_msg = str(exc_info.value)
    # Must identify the field
    assert "port" in error_msg.lower()


# ── TC-09: Missing Optional File ─────────────────────────────────


def test_tc09_missing_optional_file(
    manager: ConfigManager, fixtures_dir: Path
) -> None:
    """Optional missing file -> no error, defaults preserved."""
    config = manager.load(
        AppConfig,
        files=[(fixtures_dir / "nonexistent.yaml", False)],
        base_dir=fixtures_dir,
    )

    assert config.app_name == "7thplace"
    assert config.algo.friction == 0.85


# ── TC-10: Missing Required File ─────────────────────────────────


def test_tc10_missing_required_file(
    manager: ConfigManager, fixtures_dir: Path
) -> None:
    """Required missing file -> ConfigFileNotFoundError."""
    with pytest.raises(ConfigFileNotFoundError):
        manager.load(
            AppConfig,
            files=[(fixtures_dir / "nonexistent.yaml", True)],
            base_dir=fixtures_dir,
        )


# ── TC-11: Immutability ──────────────────────────────────────────


def test_tc11_immutability(manager: ConfigManager) -> None:
    """Mutation attempt on frozen model raises an error."""
    config = manager.load(AppConfig)

    with pytest.raises(Exception):  # Pydantic raises for frozen models
        config.algo.friction = 0.99  # type: ignore[misc]


# ── TC-12: Sensitive Field Redaction ──────────────────────────────


def test_tc12_sensitive_field_redaction(manager: ConfigManager) -> None:
    """SecretStr field is redacted in repr output."""
    os.environ["SEVENTHPLACE__SECRETS__API_KEY"] = "sk-12345"

    config = manager.load(AppConfig, env_prefix="SEVENTHPLACE")

    # The actual value is accessible programmatically
    assert config.secrets.api_key.get_secret_value() == "sk-12345"

    # But repr must NOT contain the raw secret
    config_repr = repr(config)
    assert "sk-12345" not in config_repr

    secrets_repr = repr(config.secrets)
    assert "sk-12345" not in secrets_repr


# ── TC-13: Full Precedence Stack ─────────────────────────────────


def test_tc13_full_precedence_stack(
    manager: ConfigManager, fixtures_dir: Path
) -> None:
    """Defaults < File < Env — test layered precedence."""
    # All three layers active: default=0.85, file=0.72, env=0.60
    os.environ["SEVENTHPLACE__ALGO__FRICTION"] = "0.60"

    config = manager.load(
        AppConfig,
        files=[(fixtures_dir / "override_nested.yaml", True)],
        env_prefix="SEVENTHPLACE",
        base_dir=fixtures_dir,
    )
    assert config.algo.friction == pytest.approx(0.60)  # env wins

    # Remove env, reload -> file wins
    del os.environ["SEVENTHPLACE__ALGO__FRICTION"]
    config = manager.load(
        AppConfig,
        files=[(fixtures_dir / "override_nested.yaml", True)],
        env_prefix="SEVENTHPLACE",
        base_dir=fixtures_dir,
    )
    assert config.algo.friction == pytest.approx(0.72)  # file wins

    # Remove file, reload -> default wins
    config = manager.load(
        AppConfig,
        env_prefix="SEVENTHPLACE",
    )
    assert config.algo.friction == pytest.approx(0.85)  # default


# ── TC-14: Unknown Keys — Strict Mode ────────────────────────────


def test_tc14_unknown_keys_strict(
    manager: ConfigManager, fixtures_dir: Path
) -> None:
    """Unknown key in strict mode -> ValidationError naming the key."""
    with pytest.raises(ValidationError) as exc_info:
        manager.load(
            AppConfig,
            files=[(fixtures_dir / "unknown_keys.yaml", True)],
            strict=True,
            base_dir=fixtures_dir,
        )

    error_msg = str(exc_info.value)
    assert "nonexistent_param" in error_msg


# ── TC-15: Unknown Keys — Lenient Mode ───────────────────────────


def test_tc15_unknown_keys_lenient(
    manager: ConfigManager, fixtures_dir: Path
) -> None:
    """Unknown keys silently ignored; known keys loaded normally."""
    config = manager.load(
        AppConfig,
        files=[(fixtures_dir / "unknown_keys.yaml", True)],
        strict=False,
        base_dir=fixtures_dir,
    )

    # Known key from the file is applied
    assert config.algo.friction == 0.72
    # Unknown key is silently ignored
    assert not hasattr(config.algo, "nonexistent_param")


# ── TC-16: Empty File ────────────────────────────────────────────


def test_tc16_empty_file(
    manager: ConfigManager, fixtures_dir: Path
) -> None:
    """Empty file -> no error, all defaults preserved."""
    config = manager.load(
        AppConfig,
        files=[(fixtures_dir / "empty.yaml", True)],
        base_dir=fixtures_dir,
    )

    assert config.app_name == "7thplace"
    assert config.algo.friction == 0.85
    assert config.db.port == 5432


# ── TC-17: Path Traversal Rejection ──────────────────────────────


def test_tc17_path_traversal_rejection(
    manager: ConfigManager, fixtures_dir: Path
) -> None:
    """../../etc/passwd is rejected with PathTraversalError."""
    with pytest.raises(PathTraversalError):
        manager.load(
            AppConfig,
            files=[("../../etc/passwd", True)],
            base_dir=fixtures_dir,
        )


# ── TC-18: Multiple File Merge ───────────────────────────────────


def test_tc18_multiple_file_merge(
    manager: ConfigManager, fixtures_dir: Path
) -> None:
    """Two files: override_flat (app_name) + override_nested (algo.friction)."""
    config = manager.load(
        AppConfig,
        files=[
            (fixtures_dir / "override_flat.yaml", True),
            (fixtures_dir / "override_nested.yaml", True),
        ],
        base_dir=fixtures_dir,
    )

    assert config.app_name == "custom-app"  # from file 1
    assert config.algo.friction == 0.72  # from file 2
    assert config.algo.max_retries == 3  # default preserved


# ── TC-19: CLI Overrides Env ─────────────────────────────────────


def test_tc19_cli_overrides_env(manager: ConfigManager) -> None:
    """CLI (highest priority) overrides env."""
    os.environ["SEVENTHPLACE__ALGO__FRICTION"] = "0.60"

    # With CLI override -> CLI wins
    config = manager.load(
        AppConfig,
        env_prefix="SEVENTHPLACE",
        cli_overrides={"algo.friction": "0.50"},
    )
    assert config.algo.friction == pytest.approx(0.50)  # CLI wins

    # Without CLI override -> env wins
    config = manager.load(
        AppConfig,
        env_prefix="SEVENTHPLACE",
    )
    assert config.algo.friction == pytest.approx(0.60)  # env wins


# ── TC-20: Enum Validation ───────────────────────────────────────


def test_tc20_enum_validation(
    manager: ConfigManager, fixtures_dir: Path
) -> None:
    """invalid_enum.yaml (env: "INVALID_VALUE") -> ValidationError."""
    with pytest.raises(ValidationError) as exc_info:
        manager.load(
            AppConfig,
            files=[(fixtures_dir / "invalid_enum.yaml", True)],
            base_dir=fixtures_dir,
        )

    error_msg = str(exc_info.value)
    # Must identify the field
    assert "env" in error_msg.lower()
    # Must list valid values
    assert "production" in error_msg.lower() or "staging" in error_msg.lower()
