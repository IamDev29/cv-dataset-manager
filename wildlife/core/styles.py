"""
core/styles.py
Global dark QSS stylesheet for Wild Life Counter.
"""

DARK_QSS = """
QMainWindow, QWidget, QDialog {
    background-color: #0d1117;
    color: #e6edf3;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 12px;
}
QGroupBox {
    border: 1px solid #30363d;
    border-radius: 6px;
    margin-top: 10px;
    padding-top: 8px;
    font-weight: bold;
    color: #58a6ff;
    font-size: 11px;
    letter-spacing: 1px;
}
QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 4px; }
QPushButton {
    background-color: #21262d; color: #e6edf3;
    border: 1px solid #30363d; border-radius: 5px;
    padding: 6px 14px; font-size: 11px; font-weight: bold;
}
QPushButton:hover  { background-color: #30363d; border-color: #58a6ff; color: #58a6ff; }
QPushButton:pressed { background-color: #1f6feb; }
QPushButton:disabled { background-color: #161b22; color: #484f58; border-color: #21262d; }
QPushButton#btnStart {
    background-color:#1a7f37; border-color:#2ea043; color:#fff;
    font-size:13px; padding:8px 20px;
}
QPushButton#btnStart:hover { background-color:#2ea043; }
QPushButton#btnStop  {
    background-color:#b91c1c; border-color:#ef4444; color:#fff;
    font-size:13px; padding:8px 20px;
}
QPushButton#btnStop:hover  { background-color:#ef4444; }
QPushButton#btnActivate {
    background-color:#7c3aed; border-color:#a855f7; color:#fff;
    font-size:12px; padding:7px 18px;
}
QPushButton#btnActivate:hover { background-color:#a855f7; }
QPushButton#btnLaunch {
    background-color:#1f6feb; border-color:#58a6ff; color:#fff;
    font-size:13px; padding:9px 22px;
}
QPushButton#btnLaunch:hover { background-color:#388bfd; }
QPushButton#btnBack {
    background-color:#21262d; border-color:#484f58; color:#8b949e;
}
QPushButton#btnBack:hover { border-color:#58a6ff; color:#58a6ff; }
QLabel { color: #e6edf3; }
QLineEdit, QDoubleSpinBox, QSpinBox {
    background-color: #161b22; color: #e6edf3;
    border: 1px solid #30363d; border-radius: 4px; padding: 4px 8px;
}
QLineEdit:focus, QDoubleSpinBox:focus, QSpinBox:focus { border-color: #58a6ff; }
QLineEdit:disabled, QDoubleSpinBox:disabled, QSpinBox:disabled {
    background-color: #0d1117; color: #484f58; border-color: #21262d;
}
QProgressBar {
    background-color: #161b22; border: 1px solid #30363d;
    border-radius: 4px; height: 12px; text-align: center;
    color: #e6edf3; font-size: 10px;
}
QProgressBar::chunk {
    background: qlineargradient(x1:0,y1:0,x2:1,y2:0,
                stop:0 #1f6feb, stop:1 #58a6ff);
    border-radius: 3px;
}
QStatusBar {
    background-color:#161b22; color:#8b949e;
    border-top:1px solid #30363d; font-size:11px;
}
QScrollArea { border:none; }
QCheckBox { spacing:6px; }
QCheckBox::indicator {
    width:14px; height:14px; border:1px solid #30363d;
    border-radius:3px; background:#161b22;
}
QCheckBox::indicator:checked { background:#1f6feb; border-color:#58a6ff; }
QSlider::groove:horizontal { height:6px; background:#30363d; border-radius:3px; }
QSlider::handle:horizontal {
    background:#58a6ff; width:16px; height:16px;
    margin:-5px 0; border-radius:8px; border:2px solid #1f6feb;
}
QSlider::sub-page:horizontal { background:#1f6feb; border-radius:3px; }
QSlider#line1Slider::handle:horizontal { background:#f0883e; border-color:#ffa657; }
QSlider#line1Slider::sub-page:horizontal { background:#f0883e; }
QSlider#line2Slider::handle:horizontal { background:#3fb950; border-color:#2ea043; }
QSlider#line2Slider::sub-page:horizontal { background:#3fb950; }
QMenuBar { background:#161b22; color:#e6edf3; border-bottom:1px solid #30363d; }
QMenuBar::item:selected { background:#30363d; }
QMenu { background:#161b22; color:#e6edf3; border:1px solid #30363d; }
QMenu::item:selected { background:#1f6feb; }
"""
