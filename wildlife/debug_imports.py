"""
Run this FIRST:  python debug_imports.py
It shows exactly which file and line is crashing.
"""
import sys, traceback

steps = [
    ("core.activation",            "from core.activation import machine_id, is_activated"),
    ("core.styles",                "from core.styles import DARK_QSS"),
    ("core.widgets",               "from core.widgets import VideoCanvas, StatCard"),
    ("core (package)",             "from core import DARK_QSS, is_activated, machine_id"),
    ("modules.blackbuck.tracker",  "from modules.blackbuck.tracker import STrack, ByteTracker"),
    ("modules.blackbuck.worker",   "from modules.blackbuck.worker import BlackbuckWorker"),
    ("modules.blackbuck.ui",       "from modules.blackbuck.ui import BlackbuckSettingsPanel"),
    ("modules.blackbuck (pkg)",    "from modules.blackbuck import BlackbuckWorker, BlackbuckSettingsPanel"),
    ("modules.turtle.worker",      "from modules.turtle.worker import TurtleWorker"),
    ("modules.turtle.ui",          "from modules.turtle.ui import TurtleSettingsPanel"),
    ("modules.turtle (pkg)",       "from modules.turtle import TurtleWorker, TurtleSettingsPanel"),
    ("ui.dialogs",                 "from ui.dialogs import ActivationDialog, KeyGenDialog"),
    ("ui.home",                    "from ui.home import HomePage"),
    ("ui.processing",              "from ui.processing import ProcessingPage"),
    ("ui (package)",               "from ui import HomePage, ProcessingPage"),
]

print("=" * 60)
print("  Wild Life Counter — Import Diagnostic")
print("=" * 60)
all_ok = True
for name, stmt in steps:
    try:
        exec(stmt)
        print(f"  OK      {name}")
    except Exception as e:
        print(f"\n  FAILED  {name}")
        print(f"  Statement: {stmt}")
        print(f"\n  Full traceback:")
        traceback.print_exc()
        print("\n" + "=" * 60)
        print("  Stopping at first failure — fix this before continuing.")
        print("=" * 60)
        all_ok = False
        break

if all_ok:
    print("\n  ALL IMPORTS OK — app.py should launch fine.")
    