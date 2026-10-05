"""
core/boxel_launcher.py
══════════════════════════════════════════════════════════════════
Utility to seamlessly launch or redirect to the Boxel Model Training
Studio from the KayaDristhi Wildlife App.
══════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import os
import sys
import time
import subprocess
import urllib.request
import webbrowser
from pathlib import Path


def is_boxel_running(url: str = "http://127.0.0.1:8000/api/projects", timeout: float = 1.0) -> bool:
    """Check if the Boxel FastAPI backend is currently running."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "KayaDristhi-App"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status in (200, 404)
    except Exception:
        return False


def get_repo_root() -> Path:
    """Get the repository root path."""
    wildlife_dir = Path(__file__).resolve().parents[1]
    return wildlife_dir.parent


def launch_boxel_server() -> bool:
    """Start the Boxel server process in the background if not already running."""
    if is_boxel_running():
        return True

    repo_root = get_repo_root()
    main_py = repo_root / "main.py"

    if not main_py.exists():
        print(f"[Boxel Launcher] main.py not found at {main_py}")
        return False

    creationflags = 0
    if sys.platform == "win32":
        creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0) | getattr(subprocess, "DETACHED_PROCESS", 0)

    try:
        subprocess.Popen(
            [sys.executable, str(main_py)],
            cwd=str(repo_root),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=creationflags,
        )
        # Give server a moment to bind port
        for _ in range(10):
            time.sleep(0.3)
            if is_boxel_running():
                return True
        return True
    except Exception as e:
        print(f"[Boxel Launcher] Failed to start server: {e}")
        return False


def open_boxel(path: str = "") -> None:
    """
    Ensure Boxel is running and open it in the default web browser.
    Optional subpath: e.g. '#/dashboard' or '#/styleguide'.
    """
    launch_boxel_server()
    url = f"http://localhost:8000/{path}".rstrip("/")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"[Boxel Launcher] Failed to open browser: {e}")
