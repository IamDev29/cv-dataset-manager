"""
core/widgets.py
Shared reusable PyQt5 widgets used by both modules.
"""
from __future__ import annotations

from PyQt5.QtCore    import Qt
from PyQt5.QtGui     import QColor, QFont, QFontMetrics, QPainter, QPen, QPixmap
from PyQt5.QtWidgets import QLabel, QSizePolicy, QVBoxLayout, QWidget


class VideoCanvas(QLabel):
    """
    Resizable label that renders a video frame.
    - Fills the entire widget area (no black bars).
    - Optionally draws dual-line counting zone overlay.
    """

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setAlignment(Qt.AlignCenter)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.setMinimumSize(320, 240)
        self._pixmap    = None
        self._l1        = 0.33
        self._l2        = 0.66
        self._show_zone = False

    def set_frame(self, pix: QPixmap, show_zone: bool = False,
                  l1=None, l2=None):
        self._pixmap    = pix
        self._show_zone = show_zone
        if l1 is not None:
            self._l1 = l1
        if l2 is not None:
            self._l2 = l2
        self._redraw()

    def _redraw(self):
        if self._pixmap is None:
            return

        # Scale to fill widget while keeping aspect ratio
        scaled = self._pixmap.scaled(
            self.width(), self.height(),
            Qt.KeepAspectRatio,
            Qt.SmoothTransformation)

        if not self._show_zone:
            self.setPixmap(scaled)
            return

        # Draw zone lines on top of the scaled frame
        out = scaled.copy()
        p   = QPainter(out)
        sw  = out.width()
        sh  = out.height()
        y1  = int(self._l1 * sh)
        y2  = int(self._l2 * sh)

        # Shaded zone area
        p.fillRect(0, y1, sw, y2 - y1, QColor(80, 200, 120, 40))

        # Line 1 (orange)
        p.setPen(QPen(QColor("#ffa657"), 3))
        p.drawLine(0, y1, sw, y1)
        p.setFont(QFont("Consolas", 9, QFont.Bold))
        p.fillRect(6, max(y1 - 20, 0), 110, 18, QColor(0, 0, 0, 160))
        p.setPen(QPen(QColor("#ffa657")))
        p.drawText(10, max(y1 - 5, 14),
                   "LINE 1 (%d%%)" % int(self._l1 * 100))

        # Line 2 (green)
        p.setPen(QPen(QColor("#3fb950"), 3))
        p.drawLine(0, y2, sw, y2)
        p.fillRect(6, min(y2 + 3, sh - 20), 110, 18, QColor(0, 0, 0, 160))
        p.setPen(QPen(QColor("#3fb950")))
        p.drawText(10, min(y2 + 16, sh - 4),
                   "LINE 2 (%d%%)" % int(self._l2 * 100))

        # Centre label
        mid = (y1 + y2) // 2
        lbl = "COUNTING ZONE"
        fm  = QFontMetrics(p.font())
        lw  = fm.horizontalAdvance(lbl)
        p.fillRect(sw // 2 - lw // 2 - 4, mid - 15,
                   lw + 8, 18, QColor(0, 0, 0, 160))
        p.setPen(QPen(QColor("#58a6ff")))
        p.drawText(sw // 2 - lw // 2, mid, lbl)
        p.end()
        self.setPixmap(out)

    def resizeEvent(self, e):
        super().resizeEvent(e)
        self._redraw()


class StatCard(QWidget):
    """Single-value stat display card with coloured left border."""

    def __init__(self, label: str, color: str = "#3fb950", parent=None):
        super().__init__(parent)
        lv = QVBoxLayout(self)
        lv.setContentsMargins(12, 8, 12, 8)
        lv.setSpacing(2)

        self._val = QLabel("0")
        self._val.setAlignment(Qt.AlignCenter)
        self._val.setStyleSheet(
            "color:%s;font-size:22px;font-weight:bold;" % color)

        self._lbl = QLabel(label.upper())
        self._lbl.setAlignment(Qt.AlignCenter)
        self._lbl.setStyleSheet(
            "color:#8b949e;font-size:10px;letter-spacing:1px;")

        lv.addWidget(self._val)
        lv.addWidget(self._lbl)
        self.setStyleSheet("""
            StatCard {
                background:#161b22; border:1px solid #30363d;
                border-radius:8px; border-left:3px solid %s;
            }
        """ % color)

    def set_value(self, v):
        self._val.setText(str(v))