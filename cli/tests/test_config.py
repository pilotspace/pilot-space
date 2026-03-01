"""Tests for config read/write round-trip."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import pytest

from pilot_cli.config import PilotConfig


def test_config_save_and_load(tmp_path: Path) -> None:
    """Config round-trip: save then load returns same values."""
    config_dir = tmp_path / ".pilot"
    config_file = config_dir / "config.toml"

    with (
        patch("pilot_cli.config.CONFIG_FILE", config_file),
        patch("pilot_cli.config.CONFIG_DIR", config_dir),
    ):
        cfg = PilotConfig(
            api_url="https://api.example.io",
            api_key="ps_test123",
            workspace_slug="acme",
        )
        cfg.save()
        loaded = PilotConfig.load()

    assert loaded.api_url == "https://api.example.io"
    assert loaded.api_key == "ps_test123"
    assert loaded.workspace_slug == "acme"


def test_config_save_sets_restrictive_permissions(tmp_path: Path) -> None:
    """Saved config file has 0o600 permissions to protect the API key."""
    config_dir = tmp_path / ".pilot"
    config_file = config_dir / "config.toml"

    with (
        patch("pilot_cli.config.CONFIG_FILE", config_file),
        patch("pilot_cli.config.CONFIG_DIR", config_dir),
    ):
        cfg = PilotConfig(
            api_url="https://api.example.io",
            api_key="ps_secret",
            workspace_slug="acme",
        )
        cfg.save()

    # 0o600 = owner read+write only
    assert oct(config_file.stat().st_mode & 0o777) == oct(0o600)


def test_config_load_missing_raises(tmp_path: Path) -> None:
    """Load raises FileNotFoundError when config is absent."""
    missing = tmp_path / "no_config.toml"

    with patch("pilot_cli.config.CONFIG_FILE", missing):
        with pytest.raises(FileNotFoundError, match="pilot login"):
            PilotConfig.load()


def test_config_load_raises_on_missing_key(tmp_path: Path) -> None:
    """Load raises KeyError when required field is absent from config file."""
    config_dir = tmp_path / ".pilot"
    config_dir.mkdir(parents=True)
    config_file = config_dir / "config.toml"
    # Write a config that is missing workspace_slug
    config_file.write_bytes(b'api_url = "https://x.io"\napi_key = "ps_k"\n')

    with (
        patch("pilot_cli.config.CONFIG_FILE", config_file),
        patch("pilot_cli.config.CONFIG_DIR", config_dir),
    ):
        with pytest.raises(KeyError):
            PilotConfig.load()


def test_config_save_creates_parent_dir(tmp_path: Path) -> None:
    """save() creates ~/.pilot/ directory if it does not exist."""
    config_dir = tmp_path / "deeply" / "nested" / ".pilot"
    config_file = config_dir / "config.toml"

    assert not config_dir.exists()

    with (
        patch("pilot_cli.config.CONFIG_FILE", config_file),
        patch("pilot_cli.config.CONFIG_DIR", config_dir),
    ):
        cfg = PilotConfig(
            api_url="https://api.example.io",
            api_key="ps_test",
            workspace_slug="test-ws",
        )
        cfg.save()

    assert config_file.exists()


def test_default_api_url_class_var() -> None:
    """DEFAULT_API_URL class variable points to production endpoint."""
    assert PilotConfig.DEFAULT_API_URL == "https://api.pilotspace.io"
