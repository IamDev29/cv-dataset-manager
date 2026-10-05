#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════╗
║   WILDLIFE COUNTER — Admin Key Generator  (GUI)             ║
║   © KIIT Deemed to be University — Exclusive Ownership      ║
║   School of Computer Engineering · Bhubaneswar, Odisha      ║
╚══════════════════════════════════════════════════════════════╝

FIX (v1.1):  _local_machine_id() now uses Windows MachineGuid
             (registry) instead of uuid.getnode() (MAC address)
             so generated keys stay valid permanently.

Usage:
    python Keygen.py

Requires: PyQt5
    pip install PyQt5
"""

from __future__ import annotations

import hmac
import hashlib
import base64
import platform
import sys

from PyQt5.QtCore    import Qt, QTimer, QTime, QDate, pyqtSignal
from PyQt5.QtGui     import (
    QColor, QFont, QLinearGradient,
    QPainter, QPen, QRadialGradient, QPalette,
)
from PyQt5.QtWidgets import (
    QApplication, QComboBox, QFrame,
    QHBoxLayout, QLabel, QLineEdit,
    QPushButton, QScrollArea, QSizePolicy,
    QTextEdit, QVBoxLayout, QWidget,
)

# ─────────────────────────────────────────────────────────────────
# Crypto core  (must stay identical to core/activation.py)
# ─────────────────────────────────────────────────────────────────
_SECRET = bytes([
    0x57, 0x4c, 0x43, 0x5f, 0x4b, 0x45, 0x59, 0x5f,
    0x4f, 0x44, 0x49, 0x53, 0x48, 0x41, 0x5f, 0x32,
    0x30, 0x32, 0x34, 0x5f, 0x57, 0x49, 0x4c, 0x44,
    0x4c, 0x49, 0x46, 0x45, 0x5f, 0x43, 0x4f, 0x55,
])

MODULE_CODES = {"BLACKBUCK": "BBK001", "TURTLE": "ORT002"}


def _get_windows_machine_guid() -> str:
    """
    Read stable MachineGuid from Windows registry.
    Returns empty string on non-Windows or if registry read fails.
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


def _local_machine_id() -> str:
    """
    Stable machine fingerprint — matches core/activation.py logic exactly.
    Uses Windows MachineGuid (registry) on Windows,
    falls back to platform info on Linux/macOS.
    """
    win_guid = _get_windows_machine_guid()
    if win_guid:
        raw = (win_guid + "|" + platform.machine()).encode("utf-8")
    else:
        parts = [
            platform.node(),
            platform.machine(),
            platform.processor(),
        ]
        raw = "|".join(parts).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()[:20].upper()


def generate_key(module: str, machine_id: str) -> str:
    module     = module.strip().upper()
    machine_id = machine_id.strip().upper()
    if module not in MODULE_CODES:
        raise ValueError(f"Unknown module: '{module}'")
    msg    = f"{MODULE_CODES[module]}:{machine_id}".encode("utf-8")
    digest = hmac.new(_SECRET, msg, hashlib.sha256).digest()
    b32    = base64.b32encode(digest[:15]).decode().rstrip("=")[:25]
    return "-".join(b32[i:i + 5] for i in range(0, 25, 5))


# ─────────────────────────────────────────────────────────────────
# Colour palette
# ─────────────────────────────────────────────────────────────────
_C = {
    "bg_deep"    : "#050e07",
    "bg_card"    : "#0b1a0d",
    "bg_input"   : "#0d1f0f",
    "border_dim" : "#1a3a20",
    "border_mid" : "#1e4a2a",
    "gold_hi"    : "#f0e090",
    "gold_mid"   : "#c8b86a",
    "gold_dim"   : "#a89050",
    "blue_hi"    : "#a8c8ff",
    "blue_mid"   : "#7aaeff",
    "blue_dim"   : "#5a88cc",
    "blue_deep"  : "#0d1a2e",
    "green_hi"   : "#5dc87a",
    "green_mid"  : "#3a9e52",
    "green_mute" : "#82b482",
    "red_hi"     : "#e06060",
    "text_pri"   : "#d4e8d0",
    "text_sec"   : "#96c896",
    "text_dim"   : "#4a6a4a",
}

# ─────────────────────────────────────────────────────────────────
# Expanding size policy helper
# ─────────────────────────────────────────────────────────────────
_EXP = QSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)


def _expanding(widget: QWidget) -> QWidget:
    pol = QSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
    widget.setSizePolicy(pol)
    return widget


# ─────────────────────────────────────────────────────────────────
# Label helper
# ─────────────────────────────────────────────────────────────────
def _lbl(text: str, size: int, weight: int, color: str,
         spacing: int = 0, italic: bool = False,
         align: Qt.AlignmentFlag = Qt.AlignLeft) -> QLabel:
    l = QLabel(text)
    l.setAlignment(align)
    f = QFont("Segoe UI", size, weight)
    f.setItalic(italic)
    l.setFont(f)
    sp = f"letter-spacing:{spacing}px;" if spacing else ""
    l.setStyleSheet(f"color:{color};{sp}background:transparent;")
    l.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
    return l


# ─────────────────────────────────────────────────────────────────
# Gold gradient bar
# ─────────────────────────────────────────────────────────────────
class _GoldBar(QWidget):
    def __init__(self, height: int = 2, parent=None):
        super().__init__(parent)
        self.setFixedHeight(height)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)

    def paintEvent(self, _):
        p = QPainter(self)
        g = QLinearGradient(0, 0, self.width(), 0)
        for pos, col in [
            (0.00, "#050e07"), (0.10, "#1e4a2a"),
            (0.35, "#c8b86a"), (0.50, "#f0e090"),
            (0.65, "#c8b86a"), (0.90, "#1e4a2a"),
            (1.00, "#050e07"),
        ]:
            g.setColorAt(pos, QColor(col))
        p.fillRect(self.rect(), g)


# ─────────────────────────────────────────────────────────────────
# Background widget (grid + radial glow)
# ─────────────────────────────────────────────────────────────────
class _BgWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WA_TransparentForMouseEvents)

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        w, h = self.width(), self.height()
        p.fillRect(self.rect(), QColor(_C["bg_deep"]))

        rg = QRadialGradient(w // 2, int(h * 0.5), int(h * 0.9))
        rg.setColorAt(0.0, QColor(10, 35, 14, 110))
        rg.setColorAt(1.0, QColor(5, 14, 7, 0))
        p.fillRect(self.rect(), rg)

        pen = QPen(QColor(30, 74, 42, 13))
        pen.setWidthF(0.5)
        p.setPen(pen)
        step = 60
        for x in range(0, w + step, step):
            p.drawLine(x, 0, x, h)
        for y in range(0, h + step, step):
            p.drawLine(0, y, w, y)


# ─────────────────────────────────────────────────────────────────
# Card panel
# ─────────────────────────────────────────────────────────────────
class _Card(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setStyleSheet(
            f"background:{_C['bg_card']};border-radius:0px;"
        )
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Minimum)


# ─────────────────────────────────────────────────────────────────
# Styled input — full width
# ─────────────────────────────────────────────────────────────────
class _Input(QLineEdit):
    def __init__(self, placeholder: str = "", parent=None):
        super().__init__(parent)
        self.setPlaceholderText(placeholder)
        self.setFont(QFont("Courier New", 13))
        self.setMinimumHeight(50)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        self.setStyleSheet(f"""
            QLineEdit {{
                background: {_C['bg_input']};
                color: {_C['text_pri']};
                border: 1px solid {_C['border_mid']};
                border-radius: 3px;
                padding: 8px 14px;
                letter-spacing: 2px;
                min-height: 50px;
            }}
            QLineEdit:focus {{
                border: 1px solid {_C['gold_mid']};
                color: {_C['gold_hi']};
            }}
            QLineEdit:hover {{
                border: 1px solid {_C['gold_dim']};
            }}
            QLineEdit::placeholder {{
                color: {_C['text_dim']};
            }}
        """)


# ─────────────────────────────────────────────────────────────────
# Combo box
# ─────────────────────────────────────────────────────────────────
class _Combo(QComboBox):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFont(QFont("Segoe UI", 13, QFont.Bold))
        self.setMinimumHeight(50)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        self.setStyleSheet(f"""
            QComboBox {{
                background: {_C['bg_input']};
                color: {_C['gold_hi']};
                border: 1px solid {_C['border_mid']};
                border-radius: 3px;
                padding: 8px 14px;
                letter-spacing: 2px;
            }}
            QComboBox:hover {{
                border: 1px solid {_C['gold_mid']};
            }}
            QComboBox::drop-down {{
                border: none;
                width: 30px;
            }}
            QComboBox QAbstractItemView {{
                background: {_C['bg_card']};
                color: {_C['gold_hi']};
                selection-background-color: {_C['border_mid']};
            }}
        """)


# ─────────────────────────────────────────────────────────────────
# Key display widget
# ─────────────────────────────────────────────────────────────────
class _KeyDisplay(QLabel):
    def __init__(self, parent=None):
        super().__init__("—", parent)
        self.setAlignment(Qt.AlignCenter)
        self.setFont(QFont("Courier New", 22, QFont.Bold))
        self.setMinimumHeight(70)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        self.setStyleSheet(f"""
            color: {_C['gold_hi']};
            background: {_C['bg_input']};
            border: 1px solid {_C['border_mid']};
            border-radius: 4px;
            padding: 10px;
            letter-spacing: 6px;
        """)
        self._key = ""

    def set_key(self, key: str):
        self._key = key
        self.setText(key)

    def get_key(self) -> str:
        return self._key


# ─────────────────────────────────────────────────────────────────
# History log
# ─────────────────────────────────────────────────────────────────
class _HistoryLog(QTextEdit):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setReadOnly(True)
        self.setFont(QFont("Courier New", 10))
        self.setMinimumHeight(120)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        self.setStyleSheet(f"""
            QTextEdit {{
                background: {_C['bg_input']};
                color: {_C['text_sec']};
                border: 1px solid {_C['border_dim']};
                border-radius: 3px;
                padding: 8px;
            }}
        """)

    def add_entry(self, module: str, mid: str, key: str):
        ts = QTime.currentTime().toString("HH:mm:ss")
        self.append(
            f"[{ts}]  {module:<12}  MID: {mid}  →  {key}"
        )


# ─────────────────────────────────────────────────────────────────
# Main window
# ─────────────────────────────────────────────────────────────────
class KeyGenWindow(QWidget):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Wildlife Counter — Admin Key Generator  v1.1")
        self.setMinimumSize(820, 700)
        self.resize(960, 800)

        self._this_mid = _local_machine_id()

        # background
        self._bg = _BgWidget(self)
        self._bg.lower()

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # ── HEADER ───────────────────────────────────────────────
        root.addWidget(_GoldBar(2))
        hdr = QWidget()
        hdr.setFixedHeight(90)
        hdr.setStyleSheet("background:rgba(5,14,7,0.85);")
        hv = QVBoxLayout(hdr)
        hv.setContentsMargins(36, 10, 36, 10)
        hv.setSpacing(4)

        title_row = QHBoxLayout()
        title_row.setSpacing(16)
        title_lbl = _lbl(
            "WILDLIFE COUNTER", 22, QFont.Bold, _C["gold_hi"], spacing=6,
        )
        title_row.addWidget(title_lbl, 1)

        # live clock
        self._clock_lbl = _lbl(
            QTime.currentTime().toString("HH:mm:ss"), 14,
            QFont.Normal, _C["text_dim"], align=Qt.AlignRight,
        )
        title_row.addWidget(self._clock_lbl)
        hv.addLayout(title_row)

        sub_row = QHBoxLayout()
        sub_row.setSpacing(16)
        sub_row.addWidget(
            _lbl("Admin Key Generator", 12, QFont.Normal,
                 _C["green_mute"], italic=True), 1,
        )
        sub_row.addWidget(
            _lbl(f"This Machine ID:  {self._this_mid}", 10,
                 QFont.Normal, _C["blue_dim"], align=Qt.AlignRight),
        )
        hv.addLayout(sub_row)
        root.addWidget(hdr)
        root.addWidget(_GoldBar(1))

        # ── SCROLLABLE BODY ───────────────────────────────────────
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setFrameShape(QFrame.NoFrame)
        scroll.setStyleSheet("background:transparent;border:none;")

        body_container = QWidget()
        body_container.setStyleSheet("background:transparent;")
        bv = QVBoxLayout(body_container)
        bv.setContentsMargins(28, 24, 28, 24)
        bv.setSpacing(16)

        # ── KEY GENERATION CARD ───────────────────────────────────
        form_card = _Card()
        fv = QVBoxLayout(form_card)
        fv.setContentsMargins(28, 24, 28, 24)
        fv.setSpacing(8)

        fv.addWidget(_lbl(
            "GENERATE ACTIVATION KEY", 13, QFont.Bold,
            _C["gold_mid"], spacing=4,
        ))
        fv.addWidget(_GoldBar(1))
        fv.addSpacing(10)

        # ── MODULE SELECTOR ──
        fv.addWidget(_lbl(
            "SELECT MODULE", 10, QFont.Bold, _C["text_dim"], spacing=3,
        ))
        fv.addSpacing(6)

        self._module_combo = _Combo()
        for m in MODULE_CODES:
            self._module_combo.addItem(m)
        fv.addWidget(self._module_combo)

        fv.addSpacing(22)

        # ── MACHINE ID ──
        mid_lbl = _lbl(
            "CUSTOMER MACHINE ID", 10, QFont.Bold, _C["text_dim"], spacing=3,
        )
        fv.addWidget(mid_lbl)
        fv.addSpacing(6)

        mid_input_row = QHBoxLayout()
        mid_input_row.setSpacing(10)
        mid_input_row.setContentsMargins(0, 0, 0, 0)

        self._mid_input = _Input("Paste or type customer Machine ID here …")
        mid_input_row.addWidget(self._mid_input, 1)

        use_mine_btn = QPushButton("Use Mine")
        use_mine_btn.setFont(QFont("Segoe UI", 11, QFont.Bold))
        use_mine_btn.setFixedSize(110, 46)
        use_mine_btn.setCursor(Qt.PointingHandCursor)
        use_mine_btn.setToolTip("Fill with this machine's ID")
        use_mine_btn.setStyleSheet(self._btn_style(_C["border_mid"]))
        use_mine_btn.clicked.connect(
            lambda: self._mid_input.setText(self._this_mid)
        )
        mid_input_row.addWidget(use_mine_btn)
        fv.addLayout(mid_input_row)

        fv.addSpacing(24)

        # ── GENERATE BUTTON ──
        self._gen_btn = QPushButton("  ⚡   Generate Key")
        self._gen_btn.setFont(QFont("Segoe UI", 15, QFont.Bold))
        self._gen_btn.setMinimumHeight(58)
        self._gen_btn.setCursor(Qt.PointingHandCursor)
        self._gen_btn.setStyleSheet(self._gen_btn_style())
        self._gen_btn.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        self._gen_btn.clicked.connect(self._on_generate)
        fv.addWidget(self._gen_btn)

        bv.addWidget(form_card)

        # ── ACTIVATION KEY OUTPUT CARD ────────────────────────────
        out_card = _Card()
        ov = QVBoxLayout(out_card)
        ov.setContentsMargins(28, 20, 28, 20)
        ov.setSpacing(12)

        out_hdr = QHBoxLayout()
        out_hdr.setSpacing(12)
        out_hdr.addWidget(_lbl(
            "ACTIVATION KEY", 13, QFont.Bold, _C["gold_mid"], spacing=4,
        ))
        out_hdr.addStretch()

        self._copy_btn = self._mk_btn("  Copy Key  ", _C["gold_dim"], height=36)
        self._copy_btn.setSizePolicy(QSizePolicy.Preferred, QSizePolicy.Fixed)
        self._copy_btn.clicked.connect(self._on_copy_key)
        self._copy_btn.setEnabled(False)
        out_hdr.addWidget(self._copy_btn)

        ov.addLayout(out_hdr)
        ov.addWidget(_GoldBar(1))

        self._key_display = _KeyDisplay()
        ov.addWidget(self._key_display)

        meta_row = QHBoxLayout()
        meta_row.setSpacing(24)
        self._mod_meta = _lbl(
            "Module  :  —", 10, QFont.Normal, _C["text_dim"], spacing=1,
        )
        self._mid_meta = _lbl(
            "Machine ID  :  —", 10, QFont.Normal, _C["text_dim"], spacing=1,
        )
        meta_row.addWidget(self._mod_meta, 1)
        meta_row.addWidget(self._mid_meta, 2)
        ov.addLayout(meta_row)

        bv.addWidget(out_card)

        # ── GENERATION HISTORY CARD ───────────────────────────────
        hist_card = _Card()
        hcv = QVBoxLayout(hist_card)
        hcv.setContentsMargins(28, 18, 28, 18)
        hcv.setSpacing(10)

        h_hdr = QHBoxLayout()
        h_hdr.setSpacing(12)
        h_hdr.addWidget(_lbl(
            "GENERATION HISTORY", 11, QFont.Bold, _C["text_dim"], spacing=3,
        ))
        h_hdr.addStretch()

        clr_btn = self._mk_btn("Clear", _C["border_dim"], height=30)
        clr_btn.setSizePolicy(QSizePolicy.Preferred, QSizePolicy.Fixed)
        clr_btn.clicked.connect(lambda: self._history.clear())
        h_hdr.addWidget(clr_btn)
        hcv.addLayout(h_hdr)

        self._history = _HistoryLog()
        hcv.addWidget(self._history)
        bv.addWidget(hist_card)

        # status label
        self._status = _lbl(
            "Ready  ·  Enter a Machine ID and select a module to generate a key.",
            10, QFont.Normal, _C["text_dim"], spacing=1,
        )
        bv.addWidget(self._status)
        bv.addStretch()

        scroll.setWidget(body_container)
        root.addWidget(scroll, 1)

        # ── FOOTER ───────────────────────────────────────────────
        root.addWidget(_GoldBar(2))
        footer = QWidget()
        footer.setFixedHeight(46)
        footer.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        footer.setStyleSheet("background:rgba(5,14,7,0.82);")
        frow = QHBoxLayout(footer)
        frow.setContentsMargins(36, 0, 36, 0)
        frow.setSpacing(0)

        frow.addWidget(_lbl(
            "KIIT Deemed to be University  ·  School of Computer Engineering",
            10, QFont.Normal, _C["blue_dim"], spacing=1,
        ), 1)

        kiit_ft = QLabel("© KIIT Deemed to be University  ·  All rights reserved")
        kiit_ft.setAlignment(Qt.AlignCenter)
        kiit_ft.setFont(QFont("Segoe UI", 10, QFont.Bold))
        kiit_ft.setStyleSheet(
            f"color:{_C['blue_mid']};letter-spacing:2px;background:transparent;"
        )
        kiit_ft.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Preferred)
        frow.addWidget(kiit_ft, 2)

        frow.addWidget(_lbl(
            "Keys are machine-specific and non-transferable.",
            10, QFont.Normal, _C["text_dim"], spacing=1, align=Qt.AlignRight,
        ), 1)

        root.addWidget(footer)

        # ── Clock timer ──────────────────────────────────────────
        self._timer = QTimer(self)
        self._timer.timeout.connect(
            lambda: self._clock_lbl.setText(
                QTime.currentTime().toString("HH:mm:ss")
            )
        )
        self._timer.start(1000)

    # ─────────────────────────────────────────────────────────────
    # Style helpers
    # ─────────────────────────────────────────────────────────────
    def _btn_style(self, border: str) -> str:
        return f"""
            QPushButton {{
                background: {_C['bg_input']};
                color: {_C['text_pri']};
                border: 1px solid {border};
                border-radius: 3px;
                padding: 6px 16px;
            }}
            QPushButton:hover {{
                border: 1px solid {_C['gold_dim']};
                color: {_C['gold_hi']};
            }}
            QPushButton:pressed {{
                background: {_C['border_mid']};
            }}
        """

    def _gen_btn_style(self, success: bool = False) -> str:
        bg  = _C["green_mid"] if success else _C["border_mid"]
        clr = _C["bg_deep"]   if success else _C["gold_hi"]
        return f"""
            QPushButton {{
                background: {bg};
                color: {clr};
                border: 1px solid {_C['gold_dim']};
                border-radius: 4px;
                padding: 10px;
                letter-spacing: 3px;
            }}
            QPushButton:hover {{
                background: {_C['green_mid']};
                color: {_C['bg_deep']};
                border: 1px solid {_C['gold_mid']};
            }}
            QPushButton:pressed {{
                background: {_C['green_hi']};
            }}
        """

    def _mk_btn(self, text: str, border: str, height: int = 40) -> QPushButton:
        btn = QPushButton(text)
        btn.setFont(QFont("Segoe UI", 10))
        btn.setFixedHeight(height)
        btn.setCursor(Qt.PointingHandCursor)
        btn.setStyleSheet(self._btn_style(border))
        return btn

    # ─────────────────────────────────────────────────────────────
    # Slots
    # ─────────────────────────────────────────────────────────────
    def _on_generate(self):
        module = self._module_combo.currentText().strip().upper()
        mid    = self._mid_input.text().strip().upper()

        if not mid:
            self._set_status("⚠  Please enter a customer Machine ID.", error=True)
            self._mid_input.setFocus()
            return

        try:
            key = generate_key(module, mid)
        except ValueError as e:
            self._set_status(f"⚠  {e}", error=True)
            return

        self._key_display.set_key(key)
        self._copy_btn.setEnabled(True)
        self._mod_meta.setText(f"Module  :  {module}")
        self._mid_meta.setText(f"Machine ID  :  {mid}")
        self._set_status(
            f"✔  Key generated for {module} — Machine {mid}", error=False,
        )
        self._history.add_entry(module, mid, key)

        self._gen_btn.setStyleSheet(self._gen_btn_style(success=True))
        QTimer.singleShot(
            900, lambda: self._gen_btn.setStyleSheet(self._gen_btn_style())
        )

    def _on_copy_key(self):
        key = self._key_display.get_key()
        if key:
            self._copy_to_clipboard(key, self._copy_btn)

    def _copy_to_clipboard(self, text: str, btn: QPushButton):
        QApplication.clipboard().setText(text)
        original = btn.text()
        btn.setText("  ✔ Copied!  ")
        btn.setEnabled(False)
        QTimer.singleShot(
            1400, lambda: (btn.setText(original), btn.setEnabled(True))
        )

    def _set_status(self, text: str, error: bool = False):
        color = _C["red_hi"] if error else _C["green_mute"]
        self._status.setText(text)
        self._status.setStyleSheet(
            f"color:{color};letter-spacing:1px;background:transparent;"
        )

    def resizeEvent(self, e):
        self._bg.setGeometry(self.rect())
        super().resizeEvent(e)


# ─────────────────────────────────────────────────────────────────
# Entry point
# ─────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle("Fusion")

    pal = QPalette()
    pal.setColor(QPalette.Window,          QColor("#050e07"))
    pal.setColor(QPalette.WindowText,      QColor("#d4e8d0"))
    pal.setColor(QPalette.Base,            QColor("#0b1a0d"))
    pal.setColor(QPalette.AlternateBase,   QColor("#0d1f0f"))
    pal.setColor(QPalette.Text,            QColor("#d4e8d0"))
    pal.setColor(QPalette.Button,          QColor("#0b1a0d"))
    pal.setColor(QPalette.ButtonText,      QColor("#c8b86a"))
    pal.setColor(QPalette.Highlight,       QColor("#1e4a2a"))
    pal.setColor(QPalette.HighlightedText, QColor("#f0e090"))
    app.setPalette(pal)

    win = KeyGenWindow()
    win.show()
    sys.exit(app.exec_())