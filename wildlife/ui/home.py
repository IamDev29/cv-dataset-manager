"""
ui/home.py  —  Top-level splash / module selection (AMC + Census).
Redesigned: No box borders, larger fonts, clean typographic hierarchy.
"""
from __future__ import annotations

import math

from PyQt5.QtCore    import Qt, QByteArray, QRectF, QTimer, QTime, QDate, pyqtSignal
from PyQt5.QtGui     import (
    QColor, QFont, QLinearGradient,
    QPainter, QPainterPath, QPen, QRadialGradient,
)
from PyQt5.QtSvg     import QSvgRenderer
from PyQt5.QtWidgets import (
    QFrame, QGraphicsDropShadowEffect,
    QHBoxLayout, QLabel, QPushButton,
    QVBoxLayout, QWidget,
)

from core import machine_id
from .dialogs      import ActivationDialog
from .forest_theme import CLR

# ─────────────────────────────────────────────
# Internal colour palette
# ─────────────────────────────────────────────
_C = {
    "bg_deep"    : "#050e07",
    "bg_card"    : "#0b1e0d",
    "border_dim" : "#1a3a20",
    "border_mid" : "#1e4a2a",
    "gold_hi"    : "#f0e090",
    "gold_mid"   : "#c8b86a",
    "gold_dim"   : "#a89050",
    "green_hi"   : "#5dc87a",
    "green_mute" : "#82b482",
    "text_sec"   : "#96c896",
    "text_dim"   : "#4a6a4a",
    "white"      : "#d4e8d0",
}


# ─────────────────────────────────────────────
# 3D SVG icons for module cards
# ─────────────────────────────────────────────

_SVG_CENSUS = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="cface" cx="38%" cy="28%" r="65%">
      <stop offset="0%" stop-color="#2e6b3a"/>
      <stop offset="100%" stop-color="#0b1f0e"/>
    </radialGradient>
    <radialGradient id="clens" cx="40%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#1a4d26"/>
      <stop offset="100%" stop-color="#071009"/>
    </radialGradient>
  </defs>
  <!-- drop shadow -->
  <ellipse cx="52" cy="88" rx="33" ry="5" fill="#000000" fill-opacity="0.45"/>
  <!-- coin depth / side -->
  <circle cx="50" cy="53" r="36" fill="#071409"/>
  <!-- coin face -->
  <circle cx="50" cy="47" r="36" fill="url(#cface)"/>
  <!-- outer gold ring -->
  <circle cx="50" cy="47" r="36" fill="none" stroke="#c8b86a" stroke-width="1.8" opacity="0.85"/>
  <!-- inner ring -->
  <circle cx="50" cy="47" r="31" fill="none" stroke="#c8b86a" stroke-width="0.6" opacity="0.3"/>
  <!-- gloss highlight arc -->
  <path d="M26,37 A36,36 0 0,1 50,11" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.12"/>

  <!-- BINOCULARS icon centered at (50,47) -->
  <!-- left barrel body -->
  <rect x="20" y="37" width="22" height="20" rx="6" fill="#c8b86a"/>
  <!-- right barrel body -->
  <rect x="58" y="37" width="22" height="20" rx="6" fill="#c8b86a"/>
  <!-- bridge connector -->
  <rect x="42" y="42" width="16" height="9" rx="4" fill="#a89050"/>
  <!-- barrel tops highlight -->
  <rect x="21" y="37" width="20" height="4" rx="3" fill="#f0e090" opacity="0.35"/>
  <rect x="59" y="37" width="20" height="4" rx="3" fill="#f0e090" opacity="0.35"/>
  <!-- left outer lens ring -->
  <circle cx="31" cy="47" r="8.5" fill="#0a1a0c"/>
  <circle cx="31" cy="47" r="8.5" fill="none" stroke="#c8b86a" stroke-width="1.2"/>
  <!-- left lens glass -->
  <circle cx="31" cy="47" r="5.5" fill="url(#clens)"/>
  <circle cx="29.5" cy="45.5" r="1.8" fill="#ffffff" opacity="0.45"/>
  <!-- right outer lens ring -->
  <circle cx="69" cy="47" r="8.5" fill="#0a1a0c"/>
  <circle cx="69" cy="47" r="8.5" fill="none" stroke="#c8b86a" stroke-width="1.2"/>
  <!-- right lens glass -->
  <circle cx="69" cy="47" r="5.5" fill="url(#clens)"/>
  <circle cx="67.5" cy="45.5" r="1.8" fill="#ffffff" opacity="0.45"/>
  <!-- top strap bumps -->
  <rect x="27" y="33" width="8" height="5" rx="2" fill="#b8a85a"/>
  <rect x="65" y="33" width="8" height="5" rx="2" fill="#b8a85a"/>

  <!-- label -->
  <text x="50" y="74" text-anchor="middle" font-size="7.5" font-family="sans-serif"
        font-weight="bold" fill="#c8b86a" letter-spacing="2" opacity="0.9">CENSUS</text>
</svg>
"""

_SVG_AMC = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="aface" cx="38%" cy="28%" r="65%">
      <stop offset="0%" stop-color="#1c6830"/>
      <stop offset="100%" stop-color="#061209"/>
    </radialGradient>
    <radialGradient id="alens" cx="35%" cy="32%" r="65%">
      <stop offset="0%" stop-color="#28884a"/>
      <stop offset="100%" stop-color="#0a1f0d"/>
    </radialGradient>
  </defs>
  <!-- drop shadow -->
  <ellipse cx="52" cy="88" rx="33" ry="5" fill="#000000" fill-opacity="0.45"/>
  <!-- coin depth / side -->
  <circle cx="50" cy="53" r="36" fill="#051009"/>
  <!-- coin face -->
  <circle cx="50" cy="47" r="36" fill="url(#aface)"/>
  <!-- outer green ring -->
  <circle cx="50" cy="47" r="36" fill="none" stroke="#5dc87a" stroke-width="1.8" opacity="0.85"/>
  <!-- inner ring -->
  <circle cx="50" cy="47" r="31" fill="none" stroke="#5dc87a" stroke-width="0.6" opacity="0.3"/>
  <!-- gloss highlight arc -->
  <path d="M26,37 A36,36 0 0,1 50,11" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.12"/>

  <!-- CAMERA BODY -->
  <rect x="18" y="37" width="46" height="28" rx="5" fill="#5dc87a"/>
  <!-- body top highlight -->
  <rect x="19" y="37" width="44" height="5" rx="3" fill="#80e898" opacity="0.35"/>
  <!-- viewfinder bump -->
  <rect x="29" y="31" width="16" height="7" rx="3" fill="#4ab468"/>
  <!-- viewfinder top -->
  <rect x="30" y="31" width="14" height="3" rx="2" fill="#6ad882" opacity="0.4"/>
  <!-- record indicator dot -->
  <circle cx="52" cy="42" r="4" fill="#ff4444" opacity="0.92"/>
  <circle cx="52" cy="42" r="2.2" fill="#ff8888" opacity="0.7"/>
  <!-- lens outer ring -->
  <circle cx="38" cy="51" r="12" fill="#0a1a0c"/>
  <circle cx="38" cy="51" r="12" fill="none" stroke="#5dc87a" stroke-width="1.5"/>
  <!-- lens mid ring -->
  <circle cx="38" cy="51" r="8.5" fill="#0e2210"/>
  <circle cx="38" cy="51" r="8.5" fill="none" stroke="#3da85a" stroke-width="0.8" opacity="0.6"/>
  <!-- lens glass -->
  <circle cx="38" cy="51" r="5.5" fill="url(#alens)"/>
  <!-- lens glare -->
  <circle cx="36" cy="49" r="2" fill="#ffffff" opacity="0.4"/>
  <circle cx="40.5" cy="53.5" r="0.8" fill="#ffffff" opacity="0.25"/>
  <!-- video arm -->
  <polygon points="68,40 82,51 68,62" fill="#5dc87a" opacity="0.95"/>
  <!-- arm highlight edge -->
  <line x1="68" y1="40" x2="82" y2="51" stroke="#80e898" stroke-width="1" opacity="0.3"/>
  <!-- arm shadow edge -->
  <line x1="68" y1="62" x2="82" y2="51" stroke="#2a6e3c" stroke-width="1" opacity="0.4"/>

  <!-- label -->
  <text x="50" y="76" text-anchor="middle" font-size="7.5" font-family="sans-serif"
        font-weight="bold" fill="#5dc87a" letter-spacing="3" opacity="0.9">AMC</text>
</svg>
"""

_SVG_TRAIN = """
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="bface" cx="38%" cy="28%" r="65%">
      <stop offset="0%" stop-color="#12406e"/>
      <stop offset="100%" stop-color="#051221"/>
    </radialGradient>
    <radialGradient id="bcore" cx="35%" cy="32%" r="65%">
      <stop offset="0%" stop-color="#3da9fc"/>
      <stop offset="100%" stop-color="#09355e"/>
    </radialGradient>
  </defs>
  <!-- drop shadow -->
  <ellipse cx="52" cy="88" rx="33" ry="5" fill="#000000" fill-opacity="0.45"/>
  <!-- coin depth / side -->
  <circle cx="50" cy="53" r="36" fill="#040e1a"/>
  <!-- coin face -->
  <circle cx="50" cy="47" r="36" fill="url(#bface)"/>
  <!-- outer cyan ring -->
  <circle cx="50" cy="47" r="36" fill="none" stroke="#3da9fc" stroke-width="1.8" opacity="0.85"/>
  <!-- inner ring -->
  <circle cx="50" cy="47" r="31" fill="none" stroke="#3da9fc" stroke-width="0.6" opacity="0.3"/>
  <!-- gloss highlight arc -->
  <path d="M26,37 A36,36 0 0,1 50,11" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity="0.12"/>

  <!-- NEURAL NET / MODEL TRAINING ICON centered at (50,45) -->
  <!-- connection lines -->
  <line x1="32" y1="38" x2="48" y2="45" stroke="#3da9fc" stroke-width="1.5" opacity="0.6"/>
  <line x1="32" y1="52" x2="48" y2="45" stroke="#3da9fc" stroke-width="1.5" opacity="0.6"/>
  <line x1="48" y1="45" x2="66" y2="36" stroke="#3da9fc" stroke-width="1.5" opacity="0.6"/>
  <line x1="48" y1="45" x2="66" y2="54" stroke="#3da9fc" stroke-width="1.5" opacity="0.6"/>
  <line x1="32" y1="38" x2="66" y2="54" stroke="#3da9fc" stroke-width="1.0" opacity="0.3"/>
  <line x1="32" y1="52" x2="66" y2="36" stroke="#3da9fc" stroke-width="1.0" opacity="0.3"/>

  <!-- nodes (left layer) -->
  <circle cx="32" cy="38" r="4.5" fill="#3da9fc"/>
  <circle cx="32" cy="38" r="2.2" fill="#ffffff" opacity="0.8"/>
  <circle cx="32" cy="52" r="4.5" fill="#3da9fc"/>
  <circle cx="32" cy="52" r="2.2" fill="#ffffff" opacity="0.8"/>

  <!-- node (center hidden layer) -->
  <circle cx="48" cy="45" r="5.5" fill="url(#bcore)"/>
  <circle cx="48" cy="45" r="5.5" fill="none" stroke="#70c4ff" stroke-width="1.2"/>
  <circle cx="48" cy="45" r="2.5" fill="#ffffff" opacity="0.9"/>

  <!-- nodes (right layer) -->
  <circle cx="66" cy="36" r="4.5" fill="#3da9fc"/>
  <circle cx="66" cy="36" r="2.2" fill="#ffffff" opacity="0.8"/>
  <circle cx="66" cy="54" r="4.5" fill="#3da9fc"/>
  <circle cx="66" cy="54" r="2.2" fill="#ffffff" opacity="0.8"/>

  <!-- label -->
  <text x="50" y="74" text-anchor="middle" font-size="7.5" font-family="sans-serif"
        font-weight="bold" fill="#3da9fc" letter-spacing="2.5" opacity="0.9">BOXEL</text>
</svg>
"""


class _SvgIcon(QWidget):
    """Renders an SVG string as a fixed-size widget."""
    def __init__(self, svg_str: str, size: int = 100, parent=None):
        super().__init__(parent)
        self.setFixedSize(size, size)
        self._renderer = QSvgRenderer(QByteArray(svg_str.strip().encode("utf-8")))

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        self._renderer.render(p, QRectF(self.rect()))


# ─────────────────────────────────────────────
# Thin gradient gold bar (header / footer separator)
# ─────────────────────────────────────────────
class _GoldBar(QWidget):
    def __init__(self, height: int = 2, parent=None):
        super().__init__(parent)
        self.setFixedHeight(height)

    def paintEvent(self, _):
        p = QPainter(self)
        g = QLinearGradient(0, 0, self.width(), 0)
        for pos, col in [
            (0.00, "#050e07"), (0.12, "#1e4a2a"),
            (0.35, "#c8b86a"), (0.50, "#f0e090"),
            (0.65, "#c8b86a"), (0.88, "#1e4a2a"),
            (1.00, "#050e07"),
        ]:
            g.setColorAt(pos, QColor(col))
        p.fillRect(self.rect(), g)


# ─────────────────────────────────────────────
# Animated background (rays + radial glow + grid)
# ─────────────────────────────────────────────
class _BackgroundWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAttribute(Qt.WA_TransparentForMouseEvents)

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        w, h = self.width(), self.height()

        p.fillRect(self.rect(), QColor(_C["bg_deep"]))

        rg = QRadialGradient(w // 2, int(h * 1.05), int(h * 0.95))
        rg.setColorAt(0.0, QColor(13, 46, 18, 130))
        rg.setColorAt(1.0, QColor(5, 14, 7, 0))
        p.fillRect(self.rect(), rg)

        pen = QPen(QColor(30, 74, 42, 16))
        pen.setWidthF(0.5)
        p.setPen(pen)
        step = 70
        for x in range(0, w + step, step):
            p.drawLine(x, 0, x, h)
        for y in range(0, h + step, step):
            p.drawLine(0, y, w, y)

        cx, cy = w // 2, -h // 8
        for a in range(0, 360, 18):
            r1 = math.radians(a)
            r2 = math.radians(a + 7)
            R  = max(w, h) * 2.5
            path = QPainterPath()
            path.moveTo(cx, cy)
            path.lineTo(cx + R * math.sin(r1), cy + R * math.cos(r1))
            path.lineTo(cx + R * math.sin(r2), cy + R * math.cos(r2))
            path.closeSubpath()
            grad = QLinearGradient(cx, cy,
                                   cx + R * math.sin((r1 + r2) / 2),
                                   cy + R * math.cos((r1 + r2) / 2))
            grad.setColorAt(0.0, QColor(15, 60, 20, 42))
            grad.setColorAt(0.4, QColor(15, 60, 20, 18))
            grad.setColorAt(1.0, QColor(15, 60, 20, 0))
            p.fillPath(path, grad)


# ─────────────────────────────────────────────
# Top navigation bar  (no border-bottom)
# ─────────────────────────────────────────────
class _TopBar(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(76)
        self.setStyleSheet("background:rgba(5,14,7,0.55);")

        row = QHBoxLayout(self)
        row.setContentsMargins(48, 0, 48, 0)

        left = QHBoxLayout()
        left.setSpacing(16)
        emblem = QLabel("🌲")
        emblem.setFixedSize(52, 52)
        emblem.setAlignment(Qt.AlignCenter)
        emblem.setStyleSheet(
            "font-size:28px;border-radius:26px;background:rgba(30,74,42,0.45);"
        )
        left.addWidget(emblem)

        gov = QVBoxLayout()
        gov.setSpacing(2)
        g1 = QLabel("GOVERNMENT OF ODISHA")
        g1.setFont(QFont("Segoe UI", 10))
        g1.setStyleSheet(f"color:{_C['gold_dim']};letter-spacing:3px;background:transparent;")
        g2 = QLabel("FOREST DEPARTMENT")
        g2.setFont(QFont("Segoe UI", 14, QFont.Bold))
        g2.setStyleSheet(f"color:{_C['gold_mid']};letter-spacing:2.5px;background:transparent;")
        gov.addWidget(g1)
        gov.addWidget(g2)
        left.addLayout(gov)
        row.addLayout(left)
        row.addStretch()

        right = QVBoxLayout()
        right.setSpacing(2)
        right.setAlignment(Qt.AlignRight)
        d1 = QLabel("DEPARTMENT OF FOREST, ENVIRONMENT & CLIMATE CHANGE")
        d1.setFont(QFont("Segoe UI", 10))
        d1.setAlignment(Qt.AlignRight)
        d1.setStyleSheet(f"color:{_C['text_dim']};letter-spacing:2px;background:transparent;")
        d2 = QLabel("Government of Odisha, India")
        d2.setFont(QFont("Segoe UI", 13, QFont.Bold))
        d2.setAlignment(Qt.AlignRight)
        d2.setStyleSheet(f"color:{_C['text_sec']};letter-spacing:1px;background:transparent;")
        right.addWidget(d1)
        right.addWidget(d2)
        row.addLayout(right)


# ─────────────────────────────────────────────
# Footer bar
# ─────────────────────────────────────────────
class _FooterBar(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setFixedHeight(46)
        self.setStyleSheet("background:rgba(5,14,7,0.55);")

        row = QHBoxLayout(self)
        row.setContentsMargins(48, 0, 48, 0)

        def _l(text, align=Qt.AlignLeft):
            lbl = QLabel(text)
            lbl.setAlignment(align)
            lbl.setFont(QFont("Segoe UI", 10))
            lbl.setStyleSheet(
                f"color:{_C['text_dim']};letter-spacing:1.5px;background:transparent;"
            )
            return lbl

        row.addWidget(_l("Forest Innovation Cell"))
        row.addStretch()
        row.addWidget(_l(
            "Kayadristi AI Vision  ·  Wildlife Census Analysis Platform"
            "  ·  Regional Chief Conservator of Forests, Brahmapur Circle",
            Qt.AlignCenter,
        ))
        row.addStretch()

        mid = QLabel(f"Machine ID  ·  {machine_id()}")
        mid.setFont(QFont("Courier New", 10))
        mid.setAlignment(Qt.AlignRight)
        mid.setStyleSheet(
            f"color:{_C['text_dim']};letter-spacing:1px;background:transparent;"
        )
        mid.setTextInteractionFlags(Qt.TextSelectableByMouse)
        row.addWidget(mid)


# ─────────────────────────────────────────────
# Live clock
# ─────────────────────────────────────────────
class _ClockWidget(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        lv = QVBoxLayout(self)
        lv.setContentsMargins(0, 0, 0, 0)
        lv.setSpacing(6)
        lv.setAlignment(Qt.AlignCenter)

        self._t = QLabel("00 : 00 : 00")
        self._t.setAlignment(Qt.AlignCenter)
        self._t.setFont(QFont("Segoe UI", 58, QFont.Light))
        self._t.setStyleSheet(
            f"color:{_C['gold_mid']};letter-spacing:14px;background:transparent;"
        )
        lv.addWidget(self._t)

        self._d = QLabel("LOADING …")
        self._d.setAlignment(Qt.AlignCenter)
        self._d.setFont(QFont("Segoe UI", 14))
        self._d.setStyleSheet(
            f"color:{_C['text_dim']};letter-spacing:6px;background:transparent;"
        )
        lv.addWidget(self._d)

        t = QTimer(self)
        t.timeout.connect(self._tick)
        t.start(1000)
        self._tick()

    def _tick(self):
        t = QTime.currentTime()
        self._t.setText(f"{t.hour():02d} : {t.minute():02d} : {t.second():02d}")
        d = QDate.currentDate()
        days   = ["MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY","SUNDAY"]
        months = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE",
                  "JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"]
        self._d.setText(
            f"{days[d.dayOfWeek()-1]},  "
            f"{d.day():02d}  {months[d.month()-1]}  {d.year()}"
        )


# ─────────────────────────────────────────────
# Central info block  — NO box borders, pure typography
# ─────────────────────────────────────────────
class _CentralInfo(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        lv = QVBoxLayout(self)
        lv.setContentsMargins(0, 0, 0, 0)
        lv.setSpacing(0)
        lv.setAlignment(Qt.AlignCenter)

        def _lbl(text, size, weight, color, spacing, mb=0, italic=False):
            l = QLabel(text)
            l.setAlignment(Qt.AlignCenter)
            f = QFont("Segoe UI", size, weight)
            f.setItalic(italic)
            l.setFont(f)
            extra = f"margin-bottom:{mb}px;" if mb else ""
            l.setStyleSheet(
                f"color:{color};letter-spacing:{spacing}px;"
                f"background:transparent;{extra}"
            )
            return l

        lv.addWidget(_lbl(
            "Est. Wildlife Division  ·  Brahmapur Circle",
            11, QFont.Normal, _C["gold_dim"], 5, mb=24,
        ))
        lv.addWidget(_lbl(
            "REGIONAL CHIEF CONSERVATOR OF FORESTS",
            17, QFont.Normal, _C["green_mute"], 5, mb=8,
        ))
        lv.addWidget(_lbl(
            "BRAHMAPUR CIRCLE, GANJAM",
            36, QFont.Bold, _C["white"], 5, mb=8,
        ))
        lv.addWidget(_lbl(
            "Odisha Forest Division",
            14, QFont.Normal, _C["text_dim"], 4, mb=32,
        ))

        # thin divider — no box
        div = _GoldBar(height=1)
        div.setMaximumWidth(380)
        lv.addWidget(div, alignment=Qt.AlignCenter)
        lv.addSpacing(32)

        cell = QLabel("FOREST INNOVATION CELL")
        cell.setAlignment(Qt.AlignCenter)
        cell.setFont(QFont("Segoe UI", 48, QFont.Bold))
        cell.setStyleSheet(
            f"color:{_C['gold_mid']};letter-spacing:10px;"
            f"background:transparent;margin-bottom:12px;"
        )
        lv.addWidget(cell)

        lv.addWidget(_lbl(
            "Kayadristi AI Vision  —  Wildlife Census Analysis Platform",
            19, QFont.Light, _C["green_mute"], 3, italic=True,
        ))


# ─────────────────────────────────────────────
# Splash page
# ─────────────────────────────────────────────
class SplashPage(QWidget):
    enter_clicked = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)

        self._bg = _BackgroundWidget(self)
        self._bg.lower()

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        root.addWidget(_TopBar())
        root.addWidget(_GoldBar(height=2))

        body = QWidget()
        body.setStyleSheet("background:transparent;")
        bv = QVBoxLayout(body)
        bv.setContentsMargins(80, 56, 80, 56)
        bv.setSpacing(40)
        bv.setAlignment(Qt.AlignCenter)

        bv.addWidget(_CentralInfo(), alignment=Qt.AlignCenter)
        bv.addWidget(_ClockWidget(), alignment=Qt.AlignCenter)

        # Enter button — underline only, no box
        self._btn = QPushButton("Enter System")
        self._btn.setFont(QFont("Segoe UI", 18, QFont.Bold))
        self._btn.setFixedSize(340, 60)
        self._btn.setCursor(Qt.PointingHandCursor)
        self._btn.setStyleSheet(f"""
            QPushButton {{
                background: transparent;
                border: none;
                border-bottom: 1px solid {_C['gold_mid']};
                border-radius: 0;
                color: {_C['gold_mid']};
                letter-spacing: 8px;
                padding-bottom: 4px;
            }}
            QPushButton:hover {{
                color: {_C['gold_hi']};
                border-bottom: 1px solid {_C['gold_hi']};
            }}
            QPushButton:pressed {{ color: {_C['gold_dim']}; }}
        """)
        self._btn.clicked.connect(self.enter_clicked.emit)
        bv.addWidget(self._btn, alignment=Qt.AlignCenter)

        root.addWidget(body, 1)
        root.addWidget(_GoldBar(height=2))
        root.addWidget(_FooterBar())

    def resizeEvent(self, e):
        self._bg.setGeometry(self.rect())
        super().resizeEvent(e)


# ─────────────────────────────────────────────
# Module card  (AMC / Census)
# ─────────────────────────────────────────────
class _ModuleCard(QFrame):
    clicked = pyqtSignal(str)

    def __init__(self, key: str, icon_widget: QWidget, title: str,
                 description: str, accent: str,
                 badge: str = "", parent=None):
        super().__init__(parent)
        self._key    = key
        self._accent = accent
        self.setFixedSize(310, 370)
        self.setCursor(Qt.PointingHandCursor)
        self.setStyleSheet(
            f"background:{_C['bg_card']};border:none;border-radius:4px;"
        )

        shadow = QGraphicsDropShadowEffect(self)
        shadow.setBlurRadius(0)
        shadow.setColor(QColor(accent))
        shadow.setOffset(0, 0)
        self.setGraphicsEffect(shadow)
        self._sh = shadow

        lv = QVBoxLayout(self)
        lv.setContentsMargins(26, 18, 26, 22)
        lv.setSpacing(8)

        stripe = QWidget()
        stripe.setFixedHeight(3)
        stripe.setStyleSheet(
            f"background:qlineargradient(x1:0,y1:0,x2:1,y2:0,"
            f"stop:0 {_C['bg_card']},stop:0.5 {accent},stop:1 {_C['bg_card']});"
            f"border-radius:2px;"
        )
        lv.addWidget(stripe)
        lv.addSpacing(4)

        # 3D icon widget — centred
        icon_widget.setParent(self)
        lv.addWidget(icon_widget, alignment=Qt.AlignCenter)

        name_lbl = QLabel(title)
        name_lbl.setAlignment(Qt.AlignCenter)
        name_lbl.setFont(QFont("Segoe UI", 20, QFont.Bold))
        name_lbl.setStyleSheet(
            f"color:{accent};letter-spacing:5px;background:transparent;"
        )
        lv.addWidget(name_lbl)

        if badge:
            b = QLabel(badge)
            b.setAlignment(Qt.AlignCenter)
            b.setFont(QFont("Segoe UI", 10, QFont.Bold))
            b.setStyleSheet(
                f"color:{_C['bg_deep']};background:{accent};"
                f"letter-spacing:2px;border-radius:8px;padding:3px 14px;"
            )
            lv.addWidget(b, alignment=Qt.AlignCenter)

        desc = QLabel(description)
        desc.setAlignment(Qt.AlignCenter)
        desc.setWordWrap(True)
        desc.setFont(QFont("Segoe UI", 12))
        desc.setStyleSheet(
            f"color:{_C['text_sec']};background:transparent;"
        )
        lv.addWidget(desc)
        lv.addStretch()

        div = QFrame()
        div.setFrameShape(QFrame.HLine)
        div.setStyleSheet(f"border:none;border-top:1px solid {_C['border_dim']};")
        lv.addWidget(div)

        btn = QPushButton(f"Open {title}")
        btn.setFont(QFont("Segoe UI", 13, QFont.Bold))
        btn.setFixedHeight(44)
        btn.setCursor(Qt.PointingHandCursor)
        btn.setStyleSheet(f"""
            QPushButton {{
                background:transparent;border:none;
                border-bottom:1px solid {accent};
                border-radius:0;color:{accent};letter-spacing:4px;
            }}
            QPushButton:hover {{
                color:{_C['gold_hi']};
                border-bottom:1px solid {_C['gold_hi']};
            }}
            QPushButton:pressed {{ opacity:0.7; }}
        """)
        btn.clicked.connect(lambda: self.clicked.emit(self._key))
        lv.addWidget(btn)

    def enterEvent(self, e):
        self._sh.setBlurRadius(34)
        super().enterEvent(e)

    def leaveEvent(self, e):
        self._sh.setBlurRadius(0)
        super().leaveEvent(e)

    def mousePressEvent(self, e):
        if e.button() == Qt.LeftButton:
            self.clicked.emit(self._key)
        super().mousePressEvent(e)


# ─────────────────────────────────────────────
# Home / module selection page
# ─────────────────────────────────────────────
class HomePage(QWidget):
    module_launched = pyqtSignal(str)   # "AMC" | "CENSUS"

    def __init__(self, parent=None):
        super().__init__(parent)

        self._bg = _BackgroundWidget(self)
        self._bg.lower()

        root = QVBoxLayout(self)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        header = QWidget()
        header.setFixedHeight(100)
        header.setStyleSheet("background:rgba(5,14,7,0.55);")
        hh = QVBoxLayout(header)
        hh.setContentsMargins(0, 14, 0, 10)
        hh.setSpacing(6)

        title = QLabel("KAYADRISTI AI VISION")
        title.setAlignment(Qt.AlignCenter)
        title.setFont(QFont("Segoe UI", 30, QFont.Bold))
        title.setStyleSheet(
            f"color:{_C['gold_mid']};letter-spacing:10px;background:transparent;"
        )
        hh.addWidget(title)

        org = QLabel(
            "Forest Innovation Cell  ·  "
            "Regional Chief Conservator of Forests, Brahmapur Circle"
        )
        org.setAlignment(Qt.AlignCenter)
        org.setFont(QFont("Segoe UI", 11))
        org.setStyleSheet(
            f"color:{_C['text_dim']};letter-spacing:2px;background:transparent;"
        )
        hh.addWidget(org)

        root.addWidget(header)
        root.addWidget(_GoldBar(height=2))

        body = QWidget()
        body.setStyleSheet("background:transparent;")
        bv = QVBoxLayout(body)
        bv.setContentsMargins(60, 44, 60, 20)
        bv.setSpacing(0)

        prompt = QLabel("Select a module to continue")
        prompt.setAlignment(Qt.AlignCenter)
        prompt.setFont(QFont("Segoe UI", 13))
        prompt.setStyleSheet(
            f"color:{_C['text_dim']};letter-spacing:4px;"
            f"margin-bottom:34px;background:transparent;"
        )
        bv.addWidget(prompt)

        row = QHBoxLayout()
        row.setSpacing(36)
        row.setAlignment(Qt.AlignCenter)

        self._census_card = _ModuleCard(
            "CENSUS", _SvgIcon(_SVG_CENSUS, size=110), "Census",
            "Wildlife census counting modules:\nBlackbuck & Olive Ridley Turtle",
            _C["gold_mid"], badge="2 MODULES",
        )
        self._amc_card = _ModuleCard(
            "AMC", _SvgIcon(_SVG_AMC, size=110), "AMC",
            "Animal Monitoring & Collection:\nUpload field videos to Server",
            _C["green_hi"], badge="SERVER SYNC",
        )
        self._boxel_card = _ModuleCard(
            "BOXEL", _SvgIcon(_SVG_TRAIN, size=110), "Boxel Studio",
            "Train Custom YOLO Models:\nAnnotate datasets & deploy weights",
            "#3DA9FC", badge="AI TRAINER",
        )

        for card in [self._census_card, self._amc_card, self._boxel_card]:
            card.clicked.connect(self.module_launched.emit)
            row.addWidget(card)

        bv.addLayout(row)
        bv.addStretch()

        fl = QFrame()
        fl.setFrameShape(QFrame.HLine)
        fl.setStyleSheet(f"border:none;border-top:1px solid {_C['border_dim']};")
        bv.addWidget(fl)

        mid = QLabel(f"Machine ID  ·  {machine_id()}")
        mid.setAlignment(Qt.AlignCenter)
        mid.setFont(QFont("Courier New", 11))
        mid.setStyleSheet(
            f"color:{_C['text_dim']};letter-spacing:1px;"
            f"padding:8px 0;background:transparent;"
        )
        mid.setTextInteractionFlags(Qt.TextSelectableByMouse)
        bv.addWidget(mid)

        root.addWidget(body, 1)

    def resizeEvent(self, e):
        self._bg.setGeometry(self.rect())
        super().resizeEvent(e)