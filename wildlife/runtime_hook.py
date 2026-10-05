# runtime_hook.py
import os
import sys
import traceback
import platform

# ── Step 1: Add DLL folders to PATH + add_dll_directory ──────────────────────
def _add_dll_folders(*rel_paths):
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    for rel in rel_paths:
        folder = os.path.join(base, rel)
        if os.path.isdir(folder):
            os.environ['PATH'] = folder + os.pathsep + os.environ.get('PATH', '')
            sys.path.insert(0, folder)
            if sys.platform == 'win32' and hasattr(os, 'add_dll_directory'):
                try:
                    os.add_dll_directory(folder)
                except Exception:
                    pass

_add_dll_folders('.', 'torch/lib', 'torch/bin')

# ── Step 2: Boss's fix — explicitly pre-load c10.dll BEFORE torch imports ────
if platform.system() == "Windows":
    import ctypes
    _base = getattr(sys, '_MEIPASS', '')

    # In frozen EXE: c10.dll is at _MEIPASS/torch/lib/c10.dll
    # In source: use find_spec to locate it
    _c10_candidates = [
        os.path.join(_base, 'torch', 'lib', 'c10.dll'),   # frozen EXE path
        os.path.join(_base, 'c10.dll'),                    # bundle root fallback
    ]

    # Also try find_spec for source mode
    try:
        from importlib.util import find_spec
        spec = find_spec("torch")
        if spec and spec.origin:
            _c10_candidates.append(
                os.path.join(os.path.dirname(spec.origin), 'lib', 'c10.dll')
            )
    except Exception:
        pass

    for _dll_path in _c10_candidates:
        _dll_path = os.path.normpath(_dll_path)
        if os.path.exists(_dll_path):
            try:
                ctypes.CDLL(_dll_path)
                print(f"[runtime_hook] Pre-loaded: {_dll_path}")
                break
            except Exception as e:
                print(f"[runtime_hook] Failed to pre-load {_dll_path}: {e}")

# ── Crash logger ──────────────────────────────────────────────────────────────
_LOG = os.path.join(os.path.expanduser('~'), 'Desktop', 'KayaDristhi_crash.log')

def _hook(exc_type, exc_value, exc_tb):
    msg = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
    try:
        with open(_LOG, 'w') as f:
            f.write(msg)
    except Exception:
        pass
    try:
        import ctypes as _c
        _c.windll.user32.MessageBoxW(
            0, f"KayaDristhi crashed:\n\n{msg[-800:]}", "KayaDristhi Error", 0x10)
    except Exception:
        pass

sys.excepthook = _hook