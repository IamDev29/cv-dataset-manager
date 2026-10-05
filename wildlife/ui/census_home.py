"""
ui/census_home.py  —  Census sub-home showing Blackbuck + Turtle cards.
"""
from __future__ import annotations

from PyQt5.QtCore    import Qt, pyqtSignal
from PyQt5.QtGui     import QColor, QFont, QLinearGradient, QPainter
from PyQt5.QtWidgets import (
    QDialog, QFrame, QGraphicsDropShadowEffect,
    QHBoxLayout, QLabel, QPushButton, QVBoxLayout, QWidget,
)

from core import is_activated, machine_id, open_boxel
from .dialogs      import ActivationDialog
from .forest_theme import CLR


class _RayBar(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(4)

    def paintEvent(self, _):
        p = QPainter(self)
        g = QLinearGradient(0, 0, self.width(), 0)
        for pos, col in [
            (0.0, "#060f09"), (0.3, "#1e4a2a"),
            (0.5, "#c8a84b"), (0.7, "#1e4a2a"), (1.0, "#060f09"),
        ]:
            g.setColorAt(pos, QColor(col))
        p.fillRect(self.rect(), g)


class ModuleCard(QFrame):
    launch_requested   = pyqtSignal(str)
    activate_requested = pyqtSignal(str)

    def __init__(self, module: str, icon: str,
                 description: str, accent: str, parent=None):
        super().__init__(parent)
        self.module  = module
        self._accent = accent
        self.setFixedSize(290, 340)
        self.setStyleSheet(f"""
            ModuleCard {{
                background:{CLR['bg_card']};
                border:1px solid {CLR['border']};
                border-radius:14px;
            }}
            ModuleCard:hover {{ border:1px solid {accent}; }}
        """)
        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(0)
        shadow.setColor(QColor(accent))
        shadow.setOffset(0, 0)
        self.setGraphicsEffect(shadow)
        self._sh = shadow

        lv = QVBoxLayout(self)
        lv.setContentsMargins(20, 18, 20, 18)
        lv.setSpacing(9)

        stripe = QFrame()
        stripe.setFixedHeight(3)
        stripe.setStyleSheet(
            f"background:qlineargradient(x1:0,y1:0,x2:1,y2:0,"
            f"stop:0 {CLR['bg_card']},stop:0.5 {accent},stop:1 {CLR['bg_card']});"
            f"border-radius:2px;")
        lv.addWidget(stripe)

        icon_lbl = QLabel(icon)
        icon_lbl.setAlignment(Qt.AlignCenter)
        icon_lbl.setStyleSheet("font-size:50px;background:transparent;")
        lv.addWidget(icon_lbl)

        name_lbl = QLabel(module)
        name_lbl.setAlignment(Qt.AlignCenter)
        name_lbl.setStyleSheet(
            f"color:{accent};font-size:17px;font-weight:bold;"
            f"letter-spacing:3px;background:transparent;")
        lv.addWidget(name_lbl)

        desc = QLabel(description)
        desc.setAlignment(Qt.AlignCenter)
        desc.setWordWrap(True)
        desc.setStyleSheet(
            f"color:{CLR['text_sec']};font-size:11px;background:transparent;")
        lv.addWidget(desc)

        div = QFrame()
        div.setFrameShape(QFrame.HLine)
        div.setStyleSheet(f"border:1px solid {CLR['border']};")
        lv.addWidget(div)

        self._status = QLabel()
        self._status.setAlignment(Qt.AlignCenter)
        self._status.setStyleSheet("background:transparent;")
        lv.addWidget(self._status)

        self._btn = QPushButton()
        self._btn.clicked.connect(self._on_btn)
        self._btn.setCursor(Qt.PointingHandCursor)
        lv.addWidget(self._btn)
        self.refresh()

    def refresh(self):
        if is_activated(self.module):
            self._status.setText("✦  Activated  —  ready to use")
            self._status.setStyleSheet(
                f"color:{CLR['green_hi']};font-size:11px;"
                f"font-weight:bold;background:transparent;")
            self._btn.setText("  Launch Module")
            self._btn.setObjectName("btnLaunch")
        else:
            self._status.setText("⊘  Not activated on this machine")
            self._status.setStyleSheet(
                f"color:{CLR['danger']};font-size:11px;"
                f"font-weight:bold;background:transparent;")
            self._btn.setText("  Activate Module")
            self._btn.setObjectName("btnActivate")
        self._btn.setStyle(self._btn.style())

    def enterEvent(self, e):
        self._sh.setBlurRadius(26)
        super().enterEvent(e)

    def leaveEvent(self, e):
        self._sh.setBlurRadius(0)
        super().leaveEvent(e)

    def _on_btn(self):
        if is_activated(self.module):
            self.launch_requested.emit(self.module)
        else:
            self.activate_requested.emit(self.module)


class CensusHomePage(QWidget):
    """Sub-home: user chooses Blackbuck or Turtle."""
    module_launched = pyqtSignal(str)   # "BLACKBUCK" | "TURTLE"
    back_requested  = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        lv = QVBoxLayout(self)
        lv.setContentsMargins(0, 0, 0, 0)
        lv.setSpacing(0)

        # Header
        header = QWidget()
        header.setFixedHeight(90)
        header.setStyleSheet(
            f"background:qlineargradient(x1:0,y1:0,x2:0,y2:1,"
            f"stop:0 #0a1f0d,stop:1 {CLR['bg_deep']});")
        hv = QVBoxLayout(header)
        hv.setContentsMargins(16, 10, 16, 8)
        hv.setSpacing(3)

        top_row = QHBoxLayout()
        btn_back = QPushButton("← Home")
        btn_back.setObjectName("btnBack")
        btn_back.setCursor(Qt.PointingHandCursor)
        btn_back.clicked.connect(self.back_requested.emit)
        top_row.addWidget(btn_back)
        top_row.addStretch()

        btn_boxel = QPushButton("⚡ Train in Boxel")
        btn_boxel.setCursor(Qt.PointingHandCursor)
        btn_boxel.setToolTip("Open Boxel AI Studio to annotate data and train YOLO models")
        btn_boxel.setStyleSheet(f"""
            QPushButton {{
                background: rgba(61, 169, 252, 0.15);
                border: 1px solid #3da9fc;
                border-radius: 6px;
                color: #3da9fc;
                font-size: 11px;
                font-weight: bold;
                padding: 4px 12px;
            }}
            QPushButton:hover {{
                background: #3da9fc;
                color: #050e07;
            }}
        """)
        btn_boxel.clicked.connect(lambda: open_boxel())
        top_row.addWidget(btn_boxel)

        hv.addLayout(top_row)

        title = QLabel("CENSUS MODULE")
        title.setAlignment(Qt.AlignCenter)
        title.setFont(QFont("Segoe UI", 18, QFont.Bold))
        title.setStyleSheet(
            f"color:{CLR['gold_hi']};letter-spacing:5px;background:transparent;")
        hv.addWidget(title)
        lv.addWidget(header)
        lv.addWidget(_RayBar())

        # Body
        body = QWidget()
        body.setStyleSheet(f"background:{CLR['bg_deep']};")
        bv = QVBoxLayout(body)
        bv.setContentsMargins(40, 32, 40, 20)
        bv.setSpacing(0)

        prompt = QLabel("Select species module for census analysis")
        prompt.setAlignment(Qt.AlignCenter)
        prompt.setStyleSheet(
            f"color:{CLR['text_sec']};font-size:12px;"
            f"letter-spacing:1px;margin-bottom:28px;")
        bv.addWidget(prompt)

        row = QHBoxLayout()
        row.setSpacing(44)
        row.setAlignment(Qt.AlignCenter)

        self.bb_card = ModuleCard(
            "BLACKBUCK", "🦌",
            "Blackbuck census counting via\nByteTrack + Kalman anti-flicker",
            CLR["gold"],
        )
        self.tu_card = ModuleCard(
            "TURTLE", "🐢",
            "Olive Ridley turtle counting via\ntiled inference + dual-zone line",
            CLR["green_hi"],
        )

        for card in [self.bb_card, self.tu_card]:
            card.launch_requested.connect(self.module_launched.emit)
            card.activate_requested.connect(self._handle_activate)
            row.addWidget(card)

        bv.addLayout(row)
        bv.addStretch()
        lv.addWidget(body, 1)

    def _handle_activate(self, module: str):
        dlg = ActivationDialog(module, self)
        if dlg.exec_() == QDialog.Accepted:
            self.bb_card.refresh()
            self.tu_card.refresh()

    def refresh_cards(self):
        self.bb_card.refresh()
        self.tu_card.refresh()