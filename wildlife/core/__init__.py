"""core – shared utilities for Wild Life Counter."""
from __future__ import annotations

from .activation import (
    is_activated,
    activate_module,
    machine_id,
    generate_activation_key,
    admin_secret,
)
from .styles  import DARK_QSS
from .widgets import VideoCanvas, StatCard
from .boxel_launcher import open_boxel, is_boxel_running

__all__ = [
    "is_activated",
    "activate_module",
    "machine_id",
    "generate_activation_key",
    "admin_secret",
    "DARK_QSS",
    "VideoCanvas",
    "StatCard",
    "open_boxel",
    "is_boxel_running",
]