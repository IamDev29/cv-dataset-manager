"""
core/activation.py
══════════════════════════════════════════════════════════════════
Hardware-locked, HMAC-derived, XOR-encrypted activation system.
All persistence is stored in  ~/.wildlifecounter/licenses.enc
as:  base64( xor( json, sha256(SECRET + machine_id) ) )

FIX (v1.1):  machine_id() now uses Windows MachineGuid (registry)
             instead of uuid.getnode() (MAC address).
             MAC address changes on WiFi/Ethernet/VPN switch and
             caused activations to invalidate after a few days.
             MachineGuid is written once at Windows install time
             and never changes unless Windows is reinstalled.
══════════════════════════════════════════════════════════════════
"""
from __future__ import annotations   # enables X | Y union hints on Python 3.9

import base64
import hashlib
import hmac
import json
import platform
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# ── Embedded secret (bytes obfuscated as hex literals) ───────────
_SECRET: bytes = bytes([
    0x57, 0x4c, 0x43, 0x5f, 0x4b, 0x45, 0x59, 0x5f,
    0x4f, 0x44, 0x49, 0x53, 0x48, 0x41, 0x5f, 0x32,
    0x30, 0x32, 0x34, 0x5f, 0x57, 0x49, 0x4c, 0x44,
    0x4c, 0x49, 0x46, 0x45, 0x5f, 0x43, 0x4f, 0x55,
])  # "WLC_KEY_ODISHA_2024_WILDLIFE_COU"

MODULE_CODES = {
    "BLACKBUCK": "BBK001",
    "TURTLE":    "ORT002",
}

_ACT_DIR  = Path.home() / ".wildlifecounter"
_ACT_FILE = _ACT_DIR / "licenses.enc"


# ── Machine fingerprint ──────────────────────────────────────────

def _get_windows_machine_guid() -> str:
    """
    Read the Windows MachineGuid from the registry.
    This value is set once at Windows installation and never changes
    unless Windows is reinstalled — unlike MAC address (uuid.getnode())
    which changes when switching between WiFi / Ethernet / VPN.
    Returns empty string if not on Windows or registry read fails.
    """
    if sys.platform != "win32":
        return ""
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\Cryptography",
        )
        guid, _ = winreg.QueryValueEx(key, "MachineGuid")
        winreg.CloseKey(key)
        return str(guid).strip()
    except Exception:
        return ""


def machine_id() -> str:
    """
    Deterministic, hardware-bound identifier (SHA-256, first 20 hex chars).

    Priority:
      1. Windows MachineGuid  (stable, registry-based)        ← preferred
      2. Fallback: platform node + machine + processor         ← non-Windows
    """
    win_guid = _get_windows_machine_guid()

    if win_guid:
        # Windows path — stable across network changes
        raw = (win_guid + "|" + platform.machine()).encode("utf-8")
    else:
        # Non-Windows fallback (Linux / macOS)
        parts = [
            platform.node(),
            platform.machine(),
            platform.processor(),
        ]
        raw = "|".join(parts).encode("utf-8")

    return hashlib.sha256(raw).hexdigest()[:20].upper()


# ── Cipher helpers ───────────────────────────────────────────────

def _cipher_key() -> bytes:
    """32-byte XOR key derived from (SECRET || machine_id)."""
    return hashlib.sha256(_SECRET + machine_id().encode()).digest()


def _xor_crypt(data: bytes) -> bytes:
    key = _cipher_key()
    return bytes(b ^ key[i % len(key)] for i, b in enumerate(data))


# ── Persistence ──────────────────────────────────────────────────

def _save(activations: dict) -> None:
    _ACT_DIR.mkdir(parents=True, exist_ok=True)
    raw       = json.dumps(activations, indent=2).encode("utf-8")
    encrypted = base64.b64encode(_xor_crypt(raw))
    _ACT_FILE.write_bytes(encrypted)


def _load() -> dict:
    if not _ACT_FILE.exists():
        return {}
    try:
        encrypted = base64.b64decode(_ACT_FILE.read_bytes())
        raw       = _xor_crypt(encrypted)
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {}


# ── Public API ───────────────────────────────────────────────────

def generate_activation_key(module: str, mid: Optional[str] = None) -> str:
    """
    Derive the correct 25-char (5×5) HMAC key for *module* + *mid*.
    *mid* defaults to the current machine.  Admin utility.
    """
    mid  = mid or machine_id()
    msg  = f"{MODULE_CODES[module]}:{mid}".encode("utf-8")
    dig  = hmac.new(_SECRET, msg, hashlib.sha256).digest()
    b32  = base64.b32encode(dig[:15]).decode().rstrip("=")[:25]
    return "-".join(b32[i:i+5] for i in range(0, 25, 5))


def _validate_key(module: str, key: str) -> bool:
    expected  = generate_activation_key(module)
    key_norm  = key.strip().upper().replace("-", "").replace(" ", "")
    exp_norm  = expected.upper().replace("-", "")
    return hmac.compare_digest(key_norm, exp_norm)


def is_activated(module: str) -> bool:
    rec = _load().get(module, {})
    return rec.get("active", False) and rec.get("mid") == machine_id()


def activate_module(module: str, key: str):
    """Validate *key* and persist activation.  Returns (ok, message)."""
    if not _validate_key(module, key):
        return False, "Invalid activation key. Please check and try again."
    acts = _load()
    acts[module] = {
        "active": True,
        "mid":    machine_id(),
        "date":   datetime.now().isoformat(),
        "module": module,
    }
    _save(acts)
    return True, "Module activated successfully on this machine!"


def admin_secret() -> str:
    """Return the admin password (the secret decoded)."""
    return _SECRET.decode("utf-8", errors="replace")