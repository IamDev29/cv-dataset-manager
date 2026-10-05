"""
ui/forest_theme.py
Forest-themed QSS stylesheet and colour palette for Kaya Dristi Vision.
"""

# ── Palette ───────────────────────────────────────────────────────────────────
CLR = {
    "bg_deep":    "#060f09",   # forest floor darkness
    "bg_panel":   "#0b1a10",   # deep canopy
    "bg_card":    "#0f2318",   # mid-canopy
    "bg_input":   "#091508",   # dark soil
    "border":     "#1e4a2a",   # bark outline
    "border_hi":  "#2d7a3a",   # illuminated bark
    "gold":       "#c8a84b",   # sunray gold
    "gold_hi":    "#f0cc6a",   # bright sunray
    "green_hi":   "#4caf6e",   # leaf highlight
    "green_mid":  "#2e7d52",   # mid-forest
    "green_mute": "#4a7a55",   # muted canopy
    "text_pri":   "#e2f0db",   # morning mist
    "text_sec":   "#7da882",   # shadowed leaf
    "text_dim":   "#3d6644",   # deep shadow
    "danger":     "#c0392b",
    "warn":       "#d4a017",
    "success":    "#3fb950",
}

FOREST_QSS = """
/* ── Base ─────────────────────────────────────────────────── */
QWidget {{
    background: {bg_deep};
    color: {text_pri};
    font-family: "Segoe UI", "Ubuntu", sans-serif;
    font-size: 12px;
}}

QMainWindow, QDialog {{
    background: {bg_deep};
}}

/* ── Group boxes ───────────────────────────────────────────── */
QGroupBox {{
    border: 1px solid {border};
    border-radius: 8px;
    margin-top: 14px;
    padding-top: 8px;
    color: {gold};
    font-size: 10px;
    font-weight: bold;
    letter-spacing: 2px;
}}
QGroupBox::title {{
    subcontrol-origin: margin;
    left: 12px;
    padding: 0 6px;
    background: {bg_panel};
    color: {gold};
}}

/* ── Scroll area ───────────────────────────────────────────── */
QScrollArea {{
    border: none;
    background: transparent;
}}
QScrollBar:vertical {{
    background: {bg_panel};
    width: 6px;
    border-radius: 3px;
}}
QScrollBar::handle:vertical {{
    background: {border_hi};
    border-radius: 3px;
    min-height: 20px;
}}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
    height: 0;
}}

/* ── Labels ────────────────────────────────────────────────── */
QLabel {{ background: transparent; color: {text_pri}; }}

/* ── Line edits ────────────────────────────────────────────── */
QLineEdit {{
    background: {bg_input};
    border: 1px solid {border};
    border-radius: 6px;
    padding: 6px 10px;
    color: {text_pri};
    selection-background-color: {green_mid};
}}
QLineEdit:focus {{
    border: 1px solid {gold};
}}
QLineEdit:read-only {{
    color: {gold};
    border-color: {border};
}}

/* ── Checkboxes ────────────────────────────────────────────── */
QCheckBox {{ color: {text_sec}; spacing: 6px; }}
QCheckBox::indicator {{
    width: 14px; height: 14px;
    border: 1px solid {border_hi};
    border-radius: 3px;
    background: {bg_input};
}}
QCheckBox::indicator:checked {{
    background: {green_mid};
    border-color: {green_hi};
    image: none;
}}

/* ── Progress bar ──────────────────────────────────────────── */
QProgressBar {{
    border: 1px solid {border};
    border-radius: 5px;
    background: {bg_panel};
    height: 10px;
    text-align: center;
    color: {text_sec};
    font-size: 9px;
}}
QProgressBar::chunk {{
    background: qlineargradient(
        x1:0, y1:0, x2:1, y2:0,
        stop:0 {green_mid}, stop:1 {gold});
    border-radius: 4px;
}}

/* ── Frames & separators ───────────────────────────────────── */
QFrame[frameShape="4"] {{ color: {border}; }}   /* HLine */

/* ── Generic buttons ───────────────────────────────────────── */
QPushButton {{
    background: {bg_card};
    border: 1px solid {border};
    border-radius: 6px;
    padding: 6px 14px;
    color: {text_sec};
    font-size: 11px;
}}
QPushButton:hover {{
    border-color: {green_hi};
    color: {text_pri};
    background: #142a1c;
}}
QPushButton:pressed {{ background: #0d1f14; }}
QPushButton:disabled {{ color: {text_dim}; border-color: {border}; }}

/* ── Accent buttons ─────────────────────────────────────────── */
QPushButton#btnActivate {{
    background: qlineargradient(
        x1:0, y1:0, x2:1, y2:0,
        stop:0 #1a4a28, stop:1 #2d7a3a);
    border: 1px solid {gold};
    color: {gold_hi};
    font-weight: bold;
    font-size: 12px;
    padding: 8px 18px;
    border-radius: 7px;
}}
QPushButton#btnActivate:hover {{
    background: qlineargradient(
        x1:0, y1:0, x2:1, y2:0,
        stop:0 #226035, stop:1 #3a9e4d);
    color: #fff8e0;
}}

QPushButton#btnLaunch {{
    background: qlineargradient(
        x1:0, y1:0, x2:1, y2:0,
        stop:0 #14321e, stop:1 #1e5c30);
    border: 1px solid {green_hi};
    color: {green_hi};
    font-weight: bold;
    font-size: 12px;
    padding: 8px 18px;
    border-radius: 7px;
}}
QPushButton#btnLaunch:hover {{
    background: qlineargradient(
        x1:0, y1:0, x2:1, y2:0,
        stop:0 #1a4228, stop:1 #267a3d);
    color: #d4fcd4;
}}

QPushButton#btnStart {{
    background: qlineargradient(
        x1:0, y1:0, x2:1, y2:0,
        stop:0 #1a4228, stop:1 #267a3d);
    border: 1px solid {green_hi};
    color: {green_hi};
    font-weight: bold;
    font-size: 13px;
    padding: 8px;
    border-radius: 7px;
}}
QPushButton#btnStart:disabled {{
    background: {bg_card};
    border-color: {border};
    color: {text_dim};
}}

QPushButton#btnStop {{
    background: qlineargradient(
        x1:0, y1:0, x2:1, y2:0,
        stop:0 #3d1010, stop:1 #6b1a1a);
    border: 1px solid #c0392b;
    color: #ff9494;
    font-weight: bold;
    font-size: 13px;
    padding: 8px;
    border-radius: 7px;
}}
QPushButton#btnStop:disabled {{
    background: {bg_card};
    border-color: {border};
    color: {text_dim};
}}

QPushButton#btnBack {{
    background: transparent;
    border: 1px solid {border};
    color: {text_dim};
    font-size: 11px;
    padding: 4px 10px;
    border-radius: 5px;
}}
QPushButton#btnBack:hover {{
    border-color: {green_mute};
    color: {text_sec};
}}

/* ── Message boxes ─────────────────────────────────────────── */
QMessageBox {{
    background: {bg_panel};
}}
QMessageBox QLabel {{
    color: {text_pri};
}}
""".format(**CLR)