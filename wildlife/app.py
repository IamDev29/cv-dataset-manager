"""
app.py
══════════════════════════════════════════════════════════════════
Kaya Dristi Vision  v1.0  —  Entry point
══════════════════════════════════════════════════════════════════
Run:
    python app.py
"""
from __future__ import annotations

import sys
import os
import platform

# ── BOSS'S FIX: Pre-load c10.dll BEFORE torch is imported ────────────────────
# This forces Windows to resolve c10.dll and all its CUDA dependencies
# explicitly, preventing WinError 1114 in the frozen EXE.
if platform.system() == "Windows":
    import ctypes
    from importlib.util import find_spec

    def _preload_torch_c10():
        candidates = []

        # Case 1: Running as frozen EXE (PyInstaller)
        if getattr(sys, 'frozen', False):
            base = sys._MEIPASS
            candidates += [
                os.path.join(base, 'torch', 'lib', 'c10.dll'),
                os.path.join(base, 'c10.dll'),   # bundle root fallback
            ]

        # Case 2: Running from source — locate via importlib
        try:
            spec = find_spec("torch")
            if spec and spec.origin:
                candidates.append(
                    os.path.join(os.path.dirname(spec.origin), 'lib', 'c10.dll')
                )
        except Exception:
            pass

        for dll_path in candidates:
            dll_path = os.path.normpath(dll_path)
            if os.path.exists(dll_path):
                try:
                    ctypes.CDLL(dll_path)
                    print(f"[c10 pre-load] OK → {dll_path}")
                    return
                except Exception as e:
                    print(f"[c10 pre-load] Failed → {dll_path} : {e}")

        print("[c10 pre-load] c10.dll not found in any candidate path — torch may fail.")

    _preload_torch_c10()
# ─────────────────────────────────────────────────────────────────────────────

# ── FIX: MUST be imported AFTER c10 pre-load, BEFORE other project modules ───
from core.path_helper import resource_path
# ─────────────────────────────────────────────────────────────────────────────

# ── GPU CHECK — warn if no CUDA GPU available, continue on CPU ────────────────
import torch
from PyQt5.QtWidgets import QApplication, QMessageBox


def _check_gpu():
    app = QApplication.instance() or QApplication(sys.argv)
    if not torch.cuda.is_available():
        print("[GPU Warning] No CUDA GPU detected. Running KayaDristhi in CPU mode.")
        msg = QMessageBox()
        msg.setIcon(QMessageBox.Warning)
        msg.setWindowTitle("GPU Notice — Kayadristi AI Vision")
        msg.setText(
            "⚠️  No NVIDIA CUDA GPU detected!\n\n"
            "Kaya Dristhi AI Vision will continue in CPU mode.\n\n"
            "Video processing and model inference will be functional,\n"
            "though slower than with hardware GPU acceleration."
        )
        msg.setDetailedText(
            "torch.cuda.is_available() returned False\n\n"
            "Running on CPU.\n"
            "For full GPU acceleration, run on a machine with an NVIDIA GPU\n"
            "and CUDA drivers: https://www.nvidia.com/drivers"
        )
        msg.setStandardButtons(QMessageBox.Ok)
        msg.exec_()
    else:
        gpu_name  = torch.cuda.get_device_name(0)
        gpu_count = torch.cuda.device_count()
        print(f"[GPU OK] Found {gpu_count} GPU(s) — using: {gpu_name}")

_check_gpu()
# ─────────────────────────────────────────────────────────────────────────────

from PyQt5.QtWidgets import (
    QMainWindow,
    QAction,
    QStackedWidget,
)
from PyQt5.QtGui import QIcon

from core       import is_activated, machine_id, open_boxel
from ui         import (
    FOREST_QSS,
    SplashPage,
    HomePage,
    CensusHomePage,
    AMCPage,
    ProcessingPage,
)
from ui.dialogs import KeyGenDialog


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Kayadristi AI Vision  v1.0")
        self.resize(1380, 860)
        self.setStyleSheet(FOREST_QSS)

        # ── resolve window icon path for .exe ────────────────────
        icon_path = resource_path("ui/assets/icon.ico")
        self.setWindowIcon(QIcon(icon_path))

        self._build_menu()

        self._stack = QStackedWidget()
        self.setCentralWidget(self._stack)

        self._splash  = SplashPage()
        self._home    = HomePage()
        self._census  = CensusHomePage()
        self._amc     = AMCPage()
        self._proc    = ProcessingPage()

        for w in [self._splash, self._home,
                  self._census, self._amc, self._proc]:
            self._stack.addWidget(w)

        # ── Navigation wiring ─────────────────────────────────────
        self._splash.enter_requested.connect(self._go_home)
        self._home.module_launched.connect(self._on_home_module)
        self._census.module_launched.connect(self._launch_species)
        self._census.back_requested.connect(self._go_home)
        self._amc.back_requested.connect(self._go_home)
        self._proc.back_requested.connect(self._go_census)

        self._stack.setCurrentWidget(self._splash)
        self.statusBar().showMessage(
            "Forest Innovation Cell  ·  Kayadristi AI Vision  v1.0")

    # ── Menu ──────────────────────────────────────────────────────
    def _build_menu(self):
        mb        = self.menuBar()

        # Tools Menu (Boxel Studio launcher)
        tools_menu = mb.addMenu("Tools")
        act_boxel  = QAction("⚡ Open Boxel AI Studio (Model Training)", self)
        act_boxel.setStatusTip("Launch or open Boxel in your browser to train custom YOLO models")
        act_boxel.triggered.connect(lambda: open_boxel())
        tools_menu.addAction(act_boxel)

        help_menu = mb.addMenu("Help")

        act_about = QAction("About / Modules", self)
        act_about.triggered.connect(self._show_about)
        help_menu.addAction(act_about)

        act_mid = QAction("Show Machine ID", self)
        act_mid.triggered.connect(lambda: QMessageBox.information(
            self, "Machine ID",
            f"Your Machine ID:\n\n{machine_id()}\n\n"
            "Share this with your vendor to obtain an activation key."))
        help_menu.addAction(act_mid)

    # ── Navigation helpers ────────────────────────────────────────
    def _go_home(self):
        self._home.module_launched.connect(self._on_home_module)
        self._stack.setCurrentWidget(self._home)
        self.statusBar().showMessage(
            "Forest Innovation Cell  ·   Kayadristi AI Vision  v1.0")

    def _on_home_module(self, key: str):
        if key == "CENSUS":
            self._census.refresh_cards()
            self._stack.setCurrentWidget(self._census)
            self.statusBar().showMessage("Census Module")
        elif key == "AMC":
            self._stack.setCurrentWidget(self._amc)
            self.statusBar().showMessage("AMC — Animal Monitoring & Collection")
        elif key == "BOXEL":
            self.statusBar().showMessage("Opening Boxel Model Training Studio...")
            open_boxel()

    def _launch_species(self, module: str):
        self._proc.switch_module(module)
        self._stack.setCurrentWidget(self._proc)
        self.statusBar().showMessage(f"Module: {module}")

    def _go_census(self):
        self._census.refresh_cards()
        self._stack.setCurrentWidget(self._census)
        self.statusBar().showMessage("Census Module")

    # ── About dialog ──────────────────────────────────────────────
    def _show_about(self):
        gpu_info = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "N/A"
        bb = "✅ Activated" if is_activated("BLACKBUCK") else "🔒 Not Activated"
        tt = "✅ Activated" if is_activated("TURTLE")    else "🔒 Not Activated"
        QMessageBox.information(
            self, "Kayadristi AI Vision  v1.0",
            "Kayadristi AI Vision  v1.0\n"
            "Forest Innovation Cell\n"
            "Regional Chief Conservator of Forests,\n"
            "Brahmapur Circle, Ganjam\n\n"
            "Modules:\n"
            f"  • Blackbuck Census      — {bb}\n"
            f"  • Olive Ridley Turtle   — {tt}\n"
            f"  • AMC (Drive Upload)    — Always available\n\n"
            f"GPU       :  {gpu_info}\n"
            f"Machine ID:  {machine_id()}"
        )

    # ── Cleanup on close ──────────────────────────────────────────
    def closeEvent(self, event):
        w = self._proc._worker
        if w and w.isRunning():
            w.stop()
            w.wait(3000)
        event.accept()


# ══════════════════════════════════════════════════════════════════
#  Entry point
# ══════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    app = QApplication.instance() or QApplication(sys.argv)
    app.setStyle("Fusion")
    win = MainWindow()
    win.show()
    sys.exit(app.exec_())