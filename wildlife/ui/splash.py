"""
ui/splash.py  —  Forest Innovation Cell landing screen.
Shows organisation name, live clock, office details, then enters the app.
"""
from __future__ import annotations

from datetime import datetime

from PyQt5.QtCore  import Qt, QTimer, pyqtSignal
from PyQt5.QtGui   import (QColor, QFont, QLinearGradient,
                            QPainter, QPen, QPolygonF)
from PyQt5.QtCore  import QPointF
from PyQt5.QtWidgets import (
    QFrame, QHBoxLayout, QLabel,
    QPushButton, QVBoxLayout, QWidget,
)
from .forest_theme import CLR


# ── Animated canopy rays ──────────────────────────────────────────────────────
class _CanopyWidget(QWidget):
    """Draws several diagonal golden sun-rays fanning down from the top."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WA_TransparentForMouseEvents)
        self._tick = 0
        t = QTimer(self)
        t.timeout.connect(self._animate)
        t.start(60)

    def _animate(self):
        self._tick += 1
        self.update()

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        w, h = self.width(), self.height()

        # Draw 5 golden rays from top-centre fanning outward
        origins = [
            (w * 0.30, 0), (w * 0.40, 0), (w * 0.50, 0),
            (w * 0.60, 0), (w * 0.70, 0),
        ]
        ends = [
            (w * 0.05, h), (w * 0.25, h), (w * 0.50, h),
            (w * 0.75, h), (w * 0.95, h),
        ]
        widths   = [60, 80, 100, 80, 60]
        opacities = [0.04, 0.06, 0.09, 0.06, 0.04]

        import math
        pulse = 0.5 + 0.5 * math.sin(self._tick * 0.04)

        for (ox, oy), (ex, ey), rw, op in zip(origins, ends, widths, opacities):
            alpha = int((op + pulse * 0.03) * 255)
            grad = QLinearGradient(ox, oy, ex, ey)
            grad.setColorAt(0.0, QColor(200, 168, 75, alpha))
            grad.setColorAt(1.0, QColor(200, 168, 75, 0))
            poly = QPolygonF([
                QPointF(ox - rw / 2, oy),
                QPointF(ox + rw / 2, oy),
                QPointF(ex + rw * 1.5, ey),
                QPointF(ex - rw * 1.5, ey),
            ])
            p.setBrush(grad)
            p.setPen(Qt.NoPen)
            p.drawPolygon(poly)


# ── Horizontal gold rule ──────────────────────────────────────────────────────
class _GoldRule(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(2)

    def paintEvent(self, _):
        p = QPainter(self)
        g = QLinearGradient(0, 0, self.width(), 0)
        for pos, col in [
            (0.0, "#060f09"), (0.2, "#1e4a2a"),
            (0.5, "#f0cc6a"), (0.8, "#1e4a2a"), (1.0, "#060f09"),
        ]:
            g.setColorAt(pos, QColor(col))
        p.fillRect(self.rect(), g)


# ── Splash page ───────────────────────────────────────────────────────────────
class SplashPage(QWidget):
    enter_requested = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setStyleSheet(f"background:{CLR['bg_deep']};")

        # Canopy rays drawn behind everything
        self._rays = _CanopyWidget(self)
        self._rays.setAttribute(Qt.WA_TranslucentBackground)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        # ── Top emblem band ───────────────────────────────────────
        top_band = QWidget()
        top_band.setFixedHeight(90)
        top_band.setStyleSheet(
            f"background: qlineargradient(x1:0,y1:0,x2:0,y2:1,"
            f"stop:0 #122918, stop:1 {CLR['bg_deep']});")
        tb = QHBoxLayout(top_band)
        tb.setContentsMargins(30, 0, 30, 0)

        emblem = QLabel("🌲")
        emblem.setStyleSheet("font-size:44px; background:transparent;")
        tb.addWidget(emblem)
        tb.addStretch()

        dept = QLabel("GOVERNMENT OF ODISHA\nDEPARTMENT OF FOREST, ENVIRONMENT & CLIMATE CHANGE")
        dept.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        dept.setStyleSheet(
            f"color:{CLR['text_dim']}; font-size:9px; letter-spacing:1px;"
            f"line-height:1.6; background:transparent;")
        tb.addWidget(dept)
        outer.addWidget(top_band)
        outer.addWidget(_GoldRule())

        # ── Centre content ────────────────────────────────────────
        centre = QWidget()
        centre.setStyleSheet("background:transparent;")
        cv = QVBoxLayout(centre)
        cv.setContentsMargins(60, 0, 60, 0)
        cv.setSpacing(0)
        cv.setAlignment(Qt.AlignCenter)
        cv.addStretch(2)

        # Office badge
        badge = QFrame()
        badge.setStyleSheet(
            f"background: qlineargradient(x1:0,y1:0,x2:0,y2:1,"
            f"stop:0 #0d2416, stop:1 #091508);"
            f"border:1px solid {CLR['border_hi']}; border-radius:14px;")
        bv = QVBoxLayout(badge)
        bv.setContentsMargins(40, 28, 40, 28)
        bv.setSpacing(10)

        office_lbl = QLabel("REGIONAL CHIEF CONSERVATOR OF FORESTS")
        office_lbl.setAlignment(Qt.AlignCenter)
        office_lbl.setStyleSheet(
            f"color:{CLR['gold']}; font-size:11px; font-weight:bold;"
            f"letter-spacing:3px; background:transparent;")
        bv.addWidget(office_lbl)

        circle_lbl = QLabel("BRAHMAPUR CIRCLE,  GANJAM")
        circle_lbl.setAlignment(Qt.AlignCenter)
        circle_lbl.setStyleSheet(
            f"color:{CLR['gold_hi']}; font-size:10px; letter-spacing:2px;"
            f"background:transparent;")
        bv.addWidget(circle_lbl)

        bv.addWidget(_GoldRule())

        # Main title
        title = QLabel("FOREST INNOVATION CELL")
        title.setAlignment(Qt.AlignCenter)
        title.setFont(QFont("Segoe UI", 30, QFont.Bold))
        title.setStyleSheet(
            f"color:{CLR['gold_hi']}; letter-spacing:8px;"
            f"background:transparent; padding:10px 0;")
        bv.addWidget(title)

        sub = QLabel("Kaya Dristi Vision  —  Wildlife Census Analysis Platform")
        sub.setAlignment(Qt.AlignCenter)
        sub.setStyleSheet(
            f"color:{CLR['green_mute']}; font-size:12px; letter-spacing:2px;"
            f"background:transparent;")
        bv.addWidget(sub)

        cv.addWidget(badge)
        cv.addSpacing(36)

        # Live clock
        self._clock = QLabel()
        self._clock.setAlignment(Qt.AlignCenter)
        self._clock.setFont(QFont("Courier New", 34, QFont.Bold))
        self._clock.setStyleSheet(
            f"color:{CLR['green_hi']}; letter-spacing:4px;"
            f"background:transparent;")
        cv.addWidget(self._clock)

        self._date_lbl = QLabel()
        self._date_lbl.setAlignment(Qt.AlignCenter)
        self._date_lbl.setStyleSheet(
            f"color:{CLR['text_sec']}; font-size:12px; letter-spacing:2px;"
            f"background:transparent;")
        cv.addWidget(self._date_lbl)
        self._tick_clock()

        clock_timer = QTimer(self)
        clock_timer.timeout.connect(self._tick_clock)
        clock_timer.start(1000)

        cv.addSpacing(40)

        # Enter button
        btn = QPushButton("  Enter System")
        btn.setObjectName("btnLaunch")
        btn.setFixedSize(220, 46)
        btn.setFont(QFont("Segoe UI", 12, QFont.Bold))
        btn.setCursor(Qt.PointingHandCursor)
        btn.clicked.connect(self.enter_requested.emit)
        cv.addWidget(btn, alignment=Qt.AlignCenter)

        cv.addStretch(3)
        outer.addWidget(centre, 1)

        outer.addWidget(_GoldRule())
        # Footer
        footer = QLabel(
            "Forest Innovation Cell  ·  Kaya Dristi Vision  ·  "
            "Regional Chief Conservator of Forests, Brahmapur Circle")
        footer.setAlignment(Qt.AlignCenter)
        footer.setFixedHeight(28)
        footer.setStyleSheet(
            f"color:{CLR['text_dim']}; font-size:9px; letter-spacing:1px;"
            f"background:#080f0a; border-top:1px solid {CLR['border']};")
        outer.addWidget(footer)

    def resizeEvent(self, e):
        self._rays.setGeometry(0, 0, self.width(), self.height())
        super().resizeEvent(e)

    def _tick_clock(self):
        now = datetime.now()
        self._clock.setText(now.strftime("%H : %M : %S"))
        self._date_lbl.setText(
            now.strftime("%A,  %d  %B  %Y").upper())