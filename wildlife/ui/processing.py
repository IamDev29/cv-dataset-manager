"""
ui/processing.py  —  Forest-themed ProcessingPage
"""
from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

import cv2
import numpy as np
from PyQt5.QtCore    import Qt, pyqtSignal
from PyQt5.QtGui     import QColor, QFont, QImage, QPixmap
from PyQt5.QtWidgets import (
    QCheckBox, QFileDialog, QFrame, QGraphicsDropShadowEffect,
    QGroupBox, QHBoxLayout, QLabel, QMessageBox,
    QProgressBar, QPushButton, QScrollArea,
    QSizePolicy, QStackedWidget, QVBoxLayout, QWidget,
)

from core import VideoCanvas, open_boxel
from modules.blackbuck import BlackbuckWorker, BlackbuckSettingsPanel
from modules.turtle    import TurtleWorker,    TurtleSettingsPanel
from .forest_theme     import CLR


# ── Stat card ─────────────────────────────────────────────────────────────────
class StatCard(QWidget):
    """Forest-styled stat display card."""

    def __init__(self, label: str, accent: str, parent=None):
        super().__init__(parent)
        self._accent = accent
        self.setFixedHeight(72)
        self.setMinimumWidth(110)
        self.setStyleSheet(
            f"background:{CLR['bg_card']}; border:1px solid {CLR['border']};"
            f"border-radius:8px;")

        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(0)
        shadow.setColor(QColor(accent))
        shadow.setOffset(0, 0)
        self.setGraphicsEffect(shadow)
        self._shadow = shadow

        lv = QVBoxLayout(self)
        lv.setContentsMargins(12, 8, 12, 8)
        lv.setSpacing(2)

        self._val = QLabel("—")
        self._val.setAlignment(Qt.AlignCenter)
        self._val.setFont(QFont("Segoe UI", 22, QFont.Bold))
        self._val.setStyleSheet(
            f"color:{accent}; background:transparent; border:none;")
        lv.addWidget(self._val)

        self._lbl = QLabel(label.upper())
        self._lbl.setAlignment(Qt.AlignCenter)
        self._lbl.setStyleSheet(
            f"color:{CLR['text_dim']}; font-size:9px; letter-spacing:1px;"
            f"background:transparent; border:none;")
        lv.addWidget(self._lbl)

    def set_value(self, v):
        self._val.setText(str(v))
        self._shadow.setBlurRadius(18)

    def enterEvent(self, e):
        self._shadow.setBlurRadius(22)
        super().enterEvent(e)

    def leaveEvent(self, e):
        self._shadow.setBlurRadius(0)
        super().leaveEvent(e)


# ── Section label helper ──────────────────────────────────────────────────────
def _section(text: str) -> QLabel:
    l = QLabel(text)
    l.setStyleSheet(
        f"color:{CLR['gold']}; font-size:9px; font-weight:bold;"
        f"letter-spacing:2px; background:transparent; padding:2px 0;")
    return l


# ── ProcessingPage ────────────────────────────────────────────────────────────
class ProcessingPage(QWidget):
    back_requested = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self._module: Optional[str] = None
        self._worker                = None
        self._vid_w      = 1920
        self._vid_h      = 1080
        self._video_path = ""
        self._output_dir = ""
        self._build()

    def _build(self):
        root = QHBoxLayout(self)
        root.setContentsMargins(8, 8, 8, 8)
        root.setSpacing(8)

        # ── Left sidebar ──────────────────────────────────────────
        left = QWidget()
        left.setFixedWidth(300)
        left.setStyleSheet(
            f"background:{CLR['bg_panel']}; border-radius:10px;")
        lv = QVBoxLayout(left)
        lv.setContentsMargins(12, 12, 12, 12)
        lv.setSpacing(8)

        # Back + module label
        top_row = QHBoxLayout()
        self.btn_back = QPushButton("← Home")
        self.btn_back.setObjectName("btnBack")
        self.btn_back.setCursor(Qt.PointingHandCursor)
        self.btn_back.clicked.connect(self._on_back)
        self.module_lbl = QLabel()
        self.module_lbl.setStyleSheet(
            f"color:{CLR['gold']}; font-size:13px; font-weight:bold;"
            f"letter-spacing:2px; background:transparent;")
        top_row.addWidget(self.btn_back)
        top_row.addWidget(self.module_lbl)
        top_row.addStretch()
        lv.addLayout(top_row)

        # Thin divider
        div = QFrame()
        div.setFrameShape(QFrame.HLine)
        div.setStyleSheet(f"border:1px solid {CLR['border']};")
        lv.addWidget(div)

        # Files section
        lv.addWidget(_section("FILES"))

        btn_video = QPushButton("  Load Video")
        btn_video.setCursor(Qt.PointingHandCursor)
        btn_video.clicked.connect(self._load_video)
        self.lbl_video = QLabel("No video loaded")
        self.lbl_video.setStyleSheet(
            f"color:{CLR['text_dim']}; font-size:10px; background:transparent;")
        self.lbl_video.setWordWrap(True)

        btn_out = QPushButton("  Output Folder")
        btn_out.setCursor(Qt.PointingHandCursor)
        btn_out.clicked.connect(self._select_outdir)
        self.lbl_out = QLabel("No output folder selected")
        self.lbl_out.setStyleSheet(
            f"color:{CLR['text_dim']}; font-size:10px; background:transparent;")
        self.lbl_out.setWordWrap(True)

        self.chk_save = QCheckBox("Save annotated output video")
        self.chk_save.setChecked(True)

        self.lbl_model_info = QLabel()
        self.lbl_model_info.setStyleSheet(
            f"color:{CLR['text_dim']}; font-size:9px; font-style:italic;"
            f"background:transparent;")
        self.lbl_model_info.setWordWrap(True)

        btn_boxel_train = QPushButton("⚡ Train / Fine-tune in Boxel")
        btn_boxel_train.setCursor(Qt.PointingHandCursor)
        btn_boxel_train.setToolTip("Open Boxel AI Studio in your browser to annotate images, train YOLO models, and activate weights")
        btn_boxel_train.setStyleSheet(f"""
            QPushButton {{
                background: rgba(61, 169, 252, 0.12);
                border: 1px solid #3da9fc;
                border-radius: 6px;
                color: #3da9fc;
                font-size: 11px;
                font-weight: bold;
                padding: 6px 10px;
                margin-top: 4px;
            }}
            QPushButton:hover {{
                background: #3da9fc;
                color: #050e07;
            }}
        """)
        btn_boxel_train.clicked.connect(lambda: open_boxel())

        for w in [btn_video, self.lbl_video,
                  btn_out, self.lbl_out,
                  self.chk_save, self.lbl_model_info, btn_boxel_train]:
            lv.addWidget(w)

        div2 = QFrame()
        div2.setFrameShape(QFrame.HLine)
        div2.setStyleSheet(f"border:1px solid {CLR['border']};")
        lv.addWidget(div2)
        lv.addWidget(_section("SETTINGS"))

        # Settings panels (scrollable)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarAlwaysOff)
        scroll.setStyleSheet("background:transparent; border:none;")

        self._settings_stack = QStackedWidget()
        self._settings_stack.setStyleSheet("background:transparent;")
        self._bb_settings = BlackbuckSettingsPanel()
        self._tu_settings = TurtleSettingsPanel()
        self._settings_stack.addWidget(self._bb_settings)
        self._settings_stack.addWidget(self._tu_settings)
        scroll.setWidget(self._settings_stack)
        lv.addWidget(scroll, 1)

        div3 = QFrame()
        div3.setFrameShape(QFrame.HLine)
        div3.setStyleSheet(f"border:1px solid {CLR['border']};")
        lv.addWidget(div3)

        # Start / Stop
        btn_row = QHBoxLayout()
        btn_row.setSpacing(6)
        self.btn_start = QPushButton("▶  START")
        self.btn_start.setObjectName("btnStart")
        self.btn_start.setCursor(Qt.PointingHandCursor)
        self.btn_start.clicked.connect(self._start)
        self.btn_start.setEnabled(False)
        self.btn_stop = QPushButton("■  STOP")
        self.btn_stop.setObjectName("btnStop")
        self.btn_stop.setCursor(Qt.PointingHandCursor)
        self.btn_stop.clicked.connect(self._stop)
        self.btn_stop.setEnabled(False)
        btn_row.addWidget(self.btn_start)
        btn_row.addWidget(self.btn_stop)
        lv.addLayout(btn_row)

        root.addWidget(left)

        # ── Right panel ───────────────────────────────────────────
        right = QWidget()
        right.setStyleSheet("background:transparent;")
        rv = QVBoxLayout(right)
        rv.setContentsMargins(0, 0, 0, 0)
        rv.setSpacing(6)

        # Stat cards row
        self._stats_row = QHBoxLayout()
        self._stats_row.setSpacing(6)
        self.cards: Dict[str, StatCard] = {}
        rv.addLayout(self._stats_row)

        # Video canvas
        self.canvas = VideoCanvas()
        self.canvas.setMinimumSize(760, 440)
        self.canvas.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.canvas.setStyleSheet(
            f"background:#000; border:1px solid {CLR['border']};"
            f"border-radius:8px;")
        rv.addWidget(self.canvas, 1)

        # Progress
        pr = QHBoxLayout()
        pr.setSpacing(8)
        self.progress_bar = QProgressBar()
        self.progress_bar.setValue(0)
        self.lbl_frame = QLabel("0 / 0")
        self.lbl_frame.setFixedWidth(80)
        self.lbl_frame.setStyleSheet(
            f"color:{CLR['text_sec']}; font-size:10px;"
            f"font-family:monospace; background:transparent;")
        pr.addWidget(self.progress_bar)
        pr.addWidget(self.lbl_frame)
        rv.addLayout(pr)

        root.addWidget(right, 1)

    # ── Module switching ──────────────────────────────────────────
    def switch_module(self, module: str):
        self._module = module
        icon = "🦌" if module == "BLACKBUCK" else "🐢"
        self.module_lbl.setText(f"{icon}  {module}")

        if module == "BLACKBUCK":
            self._settings_stack.setCurrentIndex(0)
            model_p = self._bb_settings.model_path()
        else:
            self._settings_stack.setCurrentIndex(1)
            model_p = self._tu_settings.model_path()
            if self._video_path:
                self._tu_settings.apply_auto_tune(self._vid_w, self._vid_h)

        self.lbl_model_info.setText(f"Model: {Path(model_p).name}")

        # Rebuild stat cards
        for c in self.cards.values():
            c.setParent(None)
        self.cards.clear()
        while self._stats_row.count():
            self._stats_row.takeAt(0)

        if module == "BLACKBUCK":
            specs = [
                ("Unique Count", CLR["green_hi"]),
                ("Active",       CLR["gold"]),
                ("Rejected",     CLR["warn"]),
                ("Raw Count",    CLR["text_sec"]),
            ]
            keys = ["unique", "active", "rejected", "unique_raw"]
        else:
            specs = [
                ("In Zone",  CLR["green_hi"]),
                ("Net",      CLR["gold"]),
                ("Entered",  "#d2a8ff"),
                ("Exited",   CLR["warn"]),
                ("Unique",   CLR["text_sec"]),
            ]
            keys = ["in_zone", "net", "entered", "exited", "unique"]

        for (label, accent), key in zip(specs, keys):
            c = StatCard(label, accent)
            self.cards[key] = c
            self._stats_row.addWidget(c)

        self._check_ready()

    # ── File handlers ─────────────────────────────────────────────
    def _load_video(self):
        p, _ = QFileDialog.getOpenFileName(
            self, "Select Video", "",
            "Video Files (*.mp4 *.avi *.mov *.MP4 *.AVI *.MOV)")
        if not p:
            return
        self._video_path = p
        self.lbl_video.setText(Path(p).name)

        cap = cv2.VideoCapture(p)
        self._vid_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        self._vid_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        ret, frame  = cap.read()
        cap.release()

        if ret:
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            qi  = QImage(rgb.data, frame.shape[1], frame.shape[0],
                         3 * frame.shape[1], QImage.Format_RGB888)
            show_zone = (self._module == "TURTLE")
            l1, l2    = self._tu_settings.get_line_fracs()
            self.canvas.set_frame(QPixmap.fromImage(qi), show_zone, l1, l2)

        if self._module == "TURTLE":
            self._tu_settings.apply_auto_tune(self._vid_w, self._vid_h)
        self._check_ready()

    def _select_outdir(self):
        p = QFileDialog.getExistingDirectory(self, "Select Output Folder")
        if p:
            self._output_dir = p
            self.lbl_out.setText(p)
            self._check_ready()

    def _check_ready(self):
        self.btn_start.setEnabled(
            bool(self._video_path and self._output_dir and self._module))

    # ── Start / Stop ──────────────────────────────────────────────
    def _start(self):
        if self._module == "BLACKBUCK":
            cfg    = self._bb_settings.build_config(
                self._video_path, self._output_dir, self.chk_save.isChecked())
            worker = BlackbuckWorker(cfg)
        else:
            cfg    = self._tu_settings.build_config(
                self._video_path, self._output_dir, self.chk_save.isChecked())
            worker = TurtleWorker(cfg)

        self._worker = worker
        worker.frame_ready.connect(self._on_frame)
        worker.progress.connect(self._on_progress)
        worker.finished.connect(self._on_finished)
        worker.error.connect(self._on_error)
        worker.start()

        self.btn_start.setEnabled(False)
        self.btn_stop.setEnabled(True)
        self.progress_bar.setValue(0)

    def _stop(self):
        if self._worker:
            self._worker.stop()
        self.btn_stop.setEnabled(False)

    def _on_back(self):
        if self._worker and self._worker.isRunning():
            reply = QMessageBox.question(
                self, "Stop?", "Stop processing and go back?",
                QMessageBox.Yes | QMessageBox.No)
            if reply != QMessageBox.Yes:
                return
            self._worker.stop()
            self._worker.wait(3000)
        self.back_requested.emit()

    # ── Worker slots ──────────────────────────────────────────────
    def _on_frame(self, frame_bgr: np.ndarray, stats: dict):
        h, w = frame_bgr.shape[:2]
        rgb  = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        qi   = QImage(rgb.data, w, h, 3 * w, QImage.Format_RGB888)
        self.canvas.set_frame(QPixmap.fromImage(qi))
        for key, card in self.cards.items():
            if key in stats:
                card.set_value(stats[key])

    def _on_progress(self, cur: int, total: int):
        self.progress_bar.setValue(int(cur / max(total, 1) * 100))
        self.lbl_frame.setText(f"{cur} / {total}")

    def _on_finished(self, final: dict):
        self.btn_start.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.progress_bar.setValue(100)
        lines = "\n".join(
            f"  {k.capitalize():<18}: {v}" for k, v in final.items())
        QMessageBox.information(
            self, "Processing Complete",
            f"Processing finished!\n\n{lines}\n\nOutput saved to:\n{self._output_dir}")

    def _on_error(self, err: str):
        self.btn_start.setEnabled(True)
        self.btn_stop.setEnabled(False)
        QMessageBox.critical(
            self, "Processing Error",
            f"An error occurred:\n\n{err[:800]}")