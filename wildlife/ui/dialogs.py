"""
ui/dialogs.py  —  Forest-themed ActivationDialog + KeyGenDialog
"""
from __future__ import annotations

from PyQt5.QtCore    import Qt, QTimer
from PyQt5.QtGui     import QColor, QPainter, QLinearGradient
from PyQt5.QtWidgets import (
    QDialog, QFrame, QHBoxLayout, QLabel,
    QLineEdit, QMessageBox, QPushButton, QVBoxLayout,
)

from core import (
    activate_module, admin_secret,
    generate_activation_key, machine_id,
)
from core.activation import MODULE_CODES
from .forest_theme   import CLR, FOREST_QSS


class _GlowFrame(QFrame):
    """QFrame with a painted top gradient accent."""
    def __init__(self, accent: str, parent=None):
        super().__init__(parent)
        self._accent = accent

    def paintEvent(self, e):
        super().paintEvent(e)
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        grad = QLinearGradient(0, 0, self.width(), 0)
        grad.setColorAt(0, QColor(CLR["bg_panel"]))
        grad.setColorAt(0.5, QColor(self._accent))
        grad.setColorAt(1, QColor(CLR["bg_panel"]))
        p.fillRect(0, 0, self.width(), 2, grad)


class ActivationDialog(QDialog):
    """Forest-themed module activation dialog."""

    def __init__(self, module: str, parent=None):
        super().__init__(parent)
        self.module = module
        self.setWindowTitle(f"Activate — {module}")
        self.setFixedSize(500, 390)
        self.setStyleSheet(FOREST_QSS)
        self._build()

    def _build(self):
        lv = QVBoxLayout(self)
        lv.setSpacing(14)
        lv.setContentsMargins(28, 24, 28, 24)

        # Top accent line
        accent = CLR["gold"] if self.module == "BLACKBUCK" else CLR["green_hi"]
        top = _GlowFrame(accent, self)
        top.setFixedHeight(2)
        lv.addWidget(top)

        icon = QLabel("🌿")
        icon.setAlignment(Qt.AlignCenter)
        icon.setStyleSheet("font-size:36px; background:transparent;")
        lv.addWidget(icon)

        title = QLabel(f"Activate  ·  {self.module}  Module")
        title.setAlignment(Qt.AlignCenter)
        title.setStyleSheet(
            f"color:{accent}; font-size:15px; font-weight:bold;"
            f"letter-spacing:2px; background:transparent;")
        lv.addWidget(title)

        # Machine ID panel
        mid_frame = QFrame()
        mid_frame.setStyleSheet(
            f"background:{CLR['bg_input']}; border:1px solid {CLR['border']};"
            f"border-radius:8px; padding:4px;")
        mf = QVBoxLayout(mid_frame)
        mf.setSpacing(4)
        mf.setContentsMargins(12, 10, 12, 10)

        mid_title = QLabel("Your Machine ID  —  share with vendor to obtain a key")
        mid_title.setStyleSheet(
            f"color:{CLR['text_dim']}; font-size:10px; background:transparent;")
        mf.addWidget(mid_title)

        mid_val = QLabel(machine_id())
        mid_val.setStyleSheet(
            f"color:{CLR['gold']}; font-size:14px; font-weight:bold;"
            f"font-family:monospace; letter-spacing:3px; background:transparent;")
        mid_val.setAlignment(Qt.AlignCenter)
        mid_val.setTextInteractionFlags(Qt.TextSelectableByMouse)
        mf.addWidget(mid_val)
        lv.addWidget(mid_frame)

        # Key entry
        key_lbl = QLabel("Activation Key  (format:  XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)")
        key_lbl.setStyleSheet(
            f"color:{CLR['text_dim']}; font-size:10px; background:transparent;")
        lv.addWidget(key_lbl)

        self.key_edit = QLineEdit()
        self.key_edit.setPlaceholderText("Paste your activation key here")
        self.key_edit.setMaxLength(35)
        self.key_edit.setStyleSheet(
            f"font-size:13px; letter-spacing:2px; font-family:monospace;"
            f"border:1px solid {CLR['border_hi']}; border-radius:6px;"
            f"background:{CLR['bg_input']}; color:{CLR['text_pri']};"
            f"padding:8px 12px;")
        lv.addWidget(self.key_edit)

        self.status_lbl = QLabel("")
        self.status_lbl.setAlignment(Qt.AlignCenter)
        self.status_lbl.setWordWrap(True)
        self.status_lbl.setStyleSheet("background:transparent;")
        lv.addWidget(self.status_lbl)

        # Buttons
        btn_row = QHBoxLayout()
        btn_row.setSpacing(10)
        btn_cancel = QPushButton("Cancel")
        btn_cancel.setCursor(Qt.PointingHandCursor)
        btn_cancel.clicked.connect(self.reject)
        self.btn_act = QPushButton("  Activate Now")
        self.btn_act.setObjectName("btnActivate")
        self.btn_act.setCursor(Qt.PointingHandCursor)
        self.btn_act.clicked.connect(self._try_activate)
        btn_row.addWidget(btn_cancel)
        btn_row.addWidget(self.btn_act)
        lv.addLayout(btn_row)

    def _try_activate(self):
        key = self.key_edit.text().strip()
        if not key:
            self._set_status("Please enter an activation key.", error=True)
            return
        ok, msg = activate_module(self.module, key)
        if ok:
            self._set_status(f"✦  {msg}", error=False)
            QTimer.singleShot(1500, self.accept)
        else:
            self._set_status(f"✕  {msg}", error=True)

    def _set_status(self, msg: str, error: bool = True):
        color = CLR["danger"] if error else CLR["success"]
        self.status_lbl.setStyleSheet(
            f"color:{color}; font-size:11px; font-weight:bold;"
            f"background:transparent;")
        self.status_lbl.setText(msg)


class KeyGenDialog(QDialog):
    """Admin key-generation tool — forest themed."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Key Generator  —  Admin")
        self.setFixedSize(520, 360)
        self.setStyleSheet(FOREST_QSS)

        lv = QVBoxLayout(self)
        lv.setSpacing(12)
        lv.setContentsMargins(28, 24, 28, 24)

        top = _GlowFrame(CLR["gold"], self)
        top.setFixedHeight(2)
        lv.addWidget(top)

        hdr = QLabel("Admin Key Generator")
        hdr.setAlignment(Qt.AlignCenter)
        hdr.setStyleSheet(
            f"color:{CLR['gold']}; font-size:14px; font-weight:bold;"
            f"letter-spacing:2px; background:transparent;")
        lv.addWidget(hdr)

        lv.addWidget(self._lbl("Admin Password:"))
        self.pwd = QLineEdit()
        self.pwd.setEchoMode(QLineEdit.Password)
        self.pwd.setPlaceholderText("Enter admin secret to unlock generator")
        lv.addWidget(self.pwd)

        lv.addWidget(self._lbl("Machine ID  (blank = this machine):"))
        self.mid_edit = QLineEdit()
        self.mid_edit.setPlaceholderText(machine_id())
        lv.addWidget(self.mid_edit)

        lv.addWidget(self._lbl("Module  (BLACKBUCK / TURTLE):"))
        self.module_edit = QLineEdit()
        self.module_edit.setText("BLACKBUCK")
        lv.addWidget(self.module_edit)

        btn = QPushButton("Generate Key")
        btn.setObjectName("btnActivate")
        btn.setCursor(Qt.PointingHandCursor)
        btn.clicked.connect(self._generate)
        lv.addWidget(btn)

        self.result = QLineEdit()
        self.result.setReadOnly(True)
        self.result.setAlignment(Qt.AlignCenter)
        lv.addWidget(self.result)

    def _lbl(self, text: str) -> QLabel:
        l = QLabel(text)
        l.setStyleSheet(
            f"color:{CLR['text_dim']}; font-size:10px; background:transparent;")
        return l

    def _generate(self):
        if self.pwd.text() != admin_secret():
            QMessageBox.warning(self, "Error", "Wrong admin password.")
            return
        module = self.module_edit.text().strip().upper()
        if module not in MODULE_CODES:
            QMessageBox.warning(
                self, "Error",
                f"Unknown module '{module}'. Valid: {', '.join(MODULE_CODES)}")
            return
        mid = self.mid_edit.text().strip().upper() or machine_id()
        self.result.setText(generate_activation_key(module, mid))