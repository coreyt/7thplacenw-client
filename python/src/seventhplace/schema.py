# SPDX-License-Identifier: Apache-2.0
"""Configuration schema — hand-written from schema/proto/seventhplace/config.proto."""

from __future__ import annotations

from pydantic import BaseModel, Field, SecretStr, field_validator


class AlgoConfig(BaseModel, frozen=True):
    """Algorithm-level configuration knobs."""

    friction: float = 0.85
    max_retries: int = 3
    timeout_ms: int = 5000
    threshold: float = 0.65


class DbConfig(BaseModel, frozen=True):
    """Database connection configuration."""

    host: str = "localhost"
    port: int = 5432
    pool_size: int = 10


class SecretsConfig(BaseModel, frozen=True):
    """Sensitive configuration — secrets and credentials."""

    api_key: SecretStr = SecretStr("")


class AppConfig(BaseModel, frozen=True):
    """Top-level application configuration."""

    app_name: str = "7thplace"
    env: str = "production"
    algo: AlgoConfig = Field(default_factory=AlgoConfig)
    db: DbConfig = Field(default_factory=DbConfig)
    secrets: SecretsConfig = Field(default_factory=SecretsConfig)

    @field_validator("env")
    @classmethod
    def validate_env(cls, v: str) -> str:
        allowed = ("production", "staging", "dev")
        normalized = v.lower()
        if normalized not in allowed:
            raise ValueError(
                f"Invalid value for 'env': must be one of "
                f"{', '.join(allowed)}"
            )
        return normalized
