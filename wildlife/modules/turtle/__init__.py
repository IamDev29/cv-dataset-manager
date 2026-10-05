"""modules/turtle - Olive Ridley Turtle module."""
from __future__ import annotations

try:
    from .worker import TurtleWorker
except Exception as _e:
    import traceback
    print("\n[turtle] FAILED to import worker.py:")
    traceback.print_exc()
    raise

try:
    from .ui import TurtleSettingsPanel
except Exception as _e:
    import traceback
    print("\n[turtle] FAILED to import ui.py:")
    traceback.print_exc()
    raise

__all__ = ["TurtleWorker", "TurtleSettingsPanel"]