# core/path_helper.py
# REPLACE your entire core/path_helper.py with this file
# ─────────────────────────────────────────────────────────────

import sys
import os

def resource_path(relative: str) -> str:
    """
    Returns the correct absolute path to a bundled file.
    Works for both:
      python app.py          (running from source)
      KayaDristhi.exe        (running as frozen EXE)
    """
    if getattr(sys, 'frozen', False):
        # Inside the EXE — PyInstaller extracts files to sys._MEIPASS
        base = sys._MEIPASS
    else:
        # Running from source — go up one level from core/ to project root
        base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, relative)


# ── Ready-made constants for common paths ─────────────────────────────────────
CONFIG_DIR = resource_path('config')
MODEL_DIR  = resource_path('models')
DOCS_DIR   = resource_path('Docs')

BLACKBUCK_CONFIG = os.path.join(CONFIG_DIR, 'blackbuck_config.json')
TURTLE_CONFIG    = os.path.join(CONFIG_DIR, 'turtle_config.json')

BLACKBUCK_MODEL  = os.path.join(MODEL_DIR, 'Blackbuck.pt')
TURTLE_MODEL     = os.path.join(MODEL_DIR, 'best_Turtle_2nd Feb.pt')


def load_config(name: str) -> dict:
    """Load a JSON config by filename only  e.g. load_config('blackbuck_config.json')"""
    import json
    with open(os.path.join(CONFIG_DIR, name), 'r') as f:
        return json.load(f)
