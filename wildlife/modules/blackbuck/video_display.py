"""
modules/blackbuck/video_display.py
══════════════════════════════════════════════════════════════════
VideoDisplay — QWidget that receives BlackbuckWorker signals,
renders annotated frames, and hosts the zone-drawing interface.

Changes vs v2
─────────────
• on_finished() now:
    1. Auto-saves a styled PDF report to the output directory.
    2. Opens ProcessingReportDialog (the rich in-app summary).
• _save_pdf_report() uses reportlab Platypus to produce a
  professional PDF:
    - Header banner with title + generation timestamp
    - Section: Video Information  (file, size, resolution, FPS, dates)
    - Section: Processing Summary (start/end/elapsed, output path)
    - Section: Detection & Tracking Results (KPI table)
    - Section: Zone Statistics    (per-zone table, or "None")
    - Footer with file path
• set_video_info() must be called before connect_worker().
• connect_worker() records processing start time automatically.

Dependencies (pip install):
    reportlab
══════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import datetime
import time
import traceback as _traceback
import uuid
from pathlib import Path
from typing import Optional

import os
import subprocess
import sys

import cv2
import numpy as np
from PyQt5.QtCore import Qt, QPoint, pyqtSlot
from PyQt5.QtGui  import QColor, QFont, QImage, QMouseEvent, QPalette, QPixmap
from PyQt5.QtWidgets import (
    QDialog, QFrame, QGridLayout, QHBoxLayout, QInputDialog,
    QLabel, QMessageBox, QPushButton, QProgressBar,
    QScrollArea, QSizePolicy, QVBoxLayout, QWidget,
)

# ── DOCX report generator (report_generator.py in the same package) ──────────
try:
    from .report_generator import generate_report as _generate_docx_report
    _DOCX_REPORT_OK = True
except ImportError:
    try:
        from report_generator import generate_report as _generate_docx_report
        _DOCX_REPORT_OK = True
    except ImportError:
        _DOCX_REPORT_OK = False

def _open_file_externally(path: str) -> None:
    """Open *path* in the OS default application (cross-platform)."""
    try:
        if sys.platform == "win32":
            os.startfile(path)                          # noqa: S606
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path])
    except Exception:
        pass

# ── reportlab ──────────────────────────────────────────────────────────────────
try:
    from reportlab.lib                   import colors
    from reportlab.lib.pagesizes         import A4
    from reportlab.lib.styles            import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units             import mm
    from reportlab.platypus              import (
        SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
        HRFlowable, KeepTogether,
    )
    _REPORTLAB_OK = True
except ImportError:
    _REPORTLAB_OK = False

# Support both package import (from .zone_manager) and direct script execution
try:
    from .zone_manager import ZoneManager
except ImportError:
    import sys
    import os
    sys.path.insert(0, os.path.dirname(__file__))
    from zone_manager import ZoneManager


# ══════════════════════════════════════════════════════════════════════════════
#  Utility helpers
# ══════════════════════════════════════════════════════════════════════════════

def _fmt_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def _fmt_duration(seconds: float) -> str:
    s = int(seconds)
    h, rem = divmod(s, 3600)
    m, sec = divmod(rem, 60)
    if h:
        return f"{h}h {m:02d}m {sec:02d}s"
    if m:
        return f"{m}m {sec:02d}s"
    return f"{sec}s"


# ══════════════════════════════════════════════════════════════════════════════
#  PDF report generator
# ══════════════════════════════════════════════════════════════════════════════

def _save_pdf_report(
    pdf_path:   str,
    result:     dict,
    video_path: Optional[str],
    output_dir: Optional[str],
    start_ts:   float,
    end_ts:     float,
) -> None:
    """
    Build and save a styled PDF report using reportlab Platypus.
    Raises ImportError if reportlab is not installed.
    """
    if not _REPORTLAB_OK:
        raise ImportError(
            "reportlab is not installed. Run:  pip install reportlab")

    # ── Colour tokens ─────────────────────────────────────────────────────────
    C_DARK      = colors.HexColor("#0d1117")
    C_HEADER_BG = colors.HexColor("#0f3321")
    C_ACCENT    = colors.HexColor("#3fb950")   # green
    C_ACCENT2   = colors.HexColor("#58a6ff")   # blue
    C_WARN      = colors.HexColor("#e3b341")   # amber
    C_CARD_BG   = colors.HexColor("#161b22")
    C_BORDER    = colors.HexColor("#30363d")
    C_FG        = colors.HexColor("#e6edf3")
    C_FG2       = colors.HexColor("#8b949e")

    # ── Document ──────────────────────────────────────────────────────────────
    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=14 * mm,
        bottomMargin=14 * mm,
        title="Blackbuck Census Report",
        author="Blackbuck Census System",
    )
    W = A4[0] - 36 * mm   # usable width

    base_styles = getSampleStyleSheet()

    # Unique suffix prevents ParagraphStyle name-collision if called > once
    _uid = uuid.uuid4().hex[:8]

    def _ps(name, parent="Normal", **kw):
        return ParagraphStyle(f"{name}_{_uid}", parent=base_styles[parent], **kw)

    sTitle     = _ps("sTitle",     fontSize=22, textColor=C_ACCENT,
                     fontName="Helvetica-Bold", alignment=1, spaceAfter=2)
    sSubtitle  = _ps("sSubtitle",  fontSize=9,  textColor=C_FG2,
                     fontName="Helvetica", alignment=1, spaceAfter=0)
    sSectionHd = _ps("sSectionHd", fontSize=11, textColor=C_ACCENT2,
                     fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=4)
    sKey       = _ps("sKey",       fontSize=9,  textColor=C_FG2,
                     fontName="Helvetica")
    sVal       = _ps("sVal",       fontSize=9,  textColor=C_FG,
                     fontName="Helvetica-Bold")
    sNote      = _ps("sNote",      fontSize=9,  textColor=C_FG2,
                     fontName="Helvetica-Oblique")
    sFooter    = _ps("sFooter",    fontSize=7,  textColor=C_FG2,
                     fontName="Helvetica", alignment=1)
    sKpiVal    = _ps("sKpiVal",    fontSize=20, textColor=C_ACCENT,
                     fontName="Helvetica-Bold", alignment=1)
    sKpiLbl    = _ps("sKpiLbl",    fontSize=7,  textColor=C_FG2,
                     fontName="Helvetica", alignment=1)

    # ── Gather metadata ───────────────────────────────────────────────────────
    elapsed  = end_ts - start_ts if (start_ts and end_ts) else 0
    end_dt   = (datetime.datetime.fromtimestamp(end_ts)
                if end_ts else datetime.datetime.now())
    start_dt = (datetime.datetime.fromtimestamp(start_ts)
                if start_ts else None)

    vpath     = Path(video_path) if video_path else None
    file_size = (vpath.stat().st_size
                 if (vpath and vpath.exists()) else None)
    ctime     = (datetime.datetime.fromtimestamp(vpath.stat().st_ctime)
                 if (vpath and vpath.exists()) else None)
    mtime     = (datetime.datetime.fromtimestamp(vpath.stat().st_mtime)
                 if (vpath and vpath.exists()) else None)

    vid_w = vid_h = vid_fps = vid_frames_total = vid_dur = None
    if vpath and vpath.exists():
        cap = cv2.VideoCapture(str(vpath))
        if cap.isOpened():
            vid_w            = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            vid_h            = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            vid_fps          = cap.get(cv2.CAP_PROP_FPS)
            vid_frames_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            vid_dur          = (vid_frames_total / vid_fps if vid_fps else None)
        cap.release()

    # ── Helper: two-column info table ─────────────────────────────────────────
    def _info_table(rows):
        data = [[Paragraph(k, sKey), Paragraph(v, sVal)] for k, v in rows]
        t = Table(data, colWidths=[52 * mm, W - 52 * mm])
        t.setStyle(TableStyle([
            ("VALIGN",         (0, 0), (-1, -1), "TOP"),
            ("ROWBACKGROUNDS", (0, 0), (-1, -1),
             [colors.HexColor("#111820"), colors.HexColor("#0d1520")]),
            ("LEFTPADDING",    (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",   (0, 0), (-1, -1), 8),
            ("TOPPADDING",     (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING",  (0, 0), (-1, -1), 5),
            ("GRID",           (0, 0), (-1, -1), 0.25,
             colors.HexColor("#21262d")),
        ]))
        return t

    # ── Helper: KPI card row ──────────────────────────────────────────────────
    def _kpi_table(items):
        # items = [(value_str, label_str, "#rrggbb"), ...]
        # Pass plain "#rrggbb" strings — c.hexval() returns "0xrrggbb" which
        # is INVALID inside reportlab <font color="..."> markup.
        col_w = W / len(items)
        data_val = [Paragraph(f'<font color="{hex_str}">{v}</font>', sKpiVal)
                    for v, _, hex_str in items]
        data_lbl = [Paragraph(lbl, sKpiLbl) for _, lbl, _ in items]
        t = Table(
            [data_val, data_lbl],
            colWidths=[col_w] * len(items),
            rowHeights=[28, 14],
        )
        t.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), C_CARD_BG),
            ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
            ("INNERGRID",     (0, 0), (-1, -1), 0.5, C_BORDER),
            ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING",    (0, 0), (-1, 0),  8),
            ("BOTTOMPADDING", (0, 1), (-1, 1),  8),
        ]))
        return t

    # ── Build story ───────────────────────────────────────────────────────────
    story = []

    # Banner
    banner = Table(
        [[Paragraph("BLACKBUCK CENSUS", sTitle),
          Paragraph("Processing Report", sSubtitle),
          Paragraph(f'Generated: {end_dt.strftime("%d %b %Y  %H:%M:%S")}',
                    sSubtitle)]],
        colWidths=[W],
    )
    banner.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_HEADER_BG),
        ("BOX",           (0, 0), (-1, -1), 1.5, C_ACCENT),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(banner)
    story.append(Spacer(1, 6 * mm))

    # Section 1 — Video Information
    story.append(KeepTogether([
        Paragraph("1.  Video Information", sSectionHd),
        HRFlowable(width=W, thickness=0.5, color=C_BORDER, spaceAfter=4),
        _info_table([
            ("File name",     vpath.name if vpath else "—"),
            ("Full path",     str(vpath) if vpath else "—"),
            ("File size",     _fmt_size(file_size) if file_size is not None else "—"),
            ("Resolution",    f"{vid_w} x {vid_h} px" if vid_w else "—"),
            ("Frame rate",    f"{vid_fps:.3f} FPS" if vid_fps else "—"),
            ("Total frames",  f"{vid_frames_total:,}" if vid_frames_total else "—"),
            ("Duration",      _fmt_duration(vid_dur) if vid_dur else "—"),
            ("File created",  ctime.strftime("%d %b %Y  %H:%M:%S") if ctime else "—"),
            ("Last modified", mtime.strftime("%d %b %Y  %H:%M:%S") if mtime else "—"),
        ]),
    ]))
    story.append(Spacer(1, 5 * mm))

    # Section 2 — Processing Summary
    story.append(KeepTogether([
        Paragraph("2.  Processing Summary", sSectionHd),
        HRFlowable(width=W, thickness=0.5, color=C_BORDER, spaceAfter=4),
        _info_table([
            ("Processing date",   end_dt.strftime("%d %b %Y")),
            ("Start time",        start_dt.strftime("%H:%M:%S") if start_dt else "—"),
            ("End time",          end_dt.strftime("%H:%M:%S")),
            ("Elapsed time",      _fmt_duration(elapsed) if elapsed else "—"),
            ("Frames processed",  f"{result.get('frames', 0):,}"),
            ("Output directory",  str(output_dir) if output_dir else "—"),
            ("Report saved to",   pdf_path),
        ]),
    ]))
    story.append(Spacer(1, 5 * mm))

    # Section 3 — Detection & Tracking
    unique = result.get("unique",    0)
    active = result.get("active",    0)
    total  = result.get("total",     0)
    grave  = result.get("graveyard", 0)

    story.append(KeepTogether([
        Paragraph("3.  Detection &amp; Tracking Results", sSectionHd),
        HRFlowable(width=W, thickness=0.5, color=C_BORDER, spaceAfter=4),
        _kpi_table([
            (str(unique), "UNIQUE ANIMALS", "#3fb950"),
            (str(active), "ACTIVE AT END",  "#58a6ff"),
            (str(total),  "TOTAL CREATED",  "#e3b341"),
            (str(grave),  "GRAVEYARD",      "#8b949e"),
        ]),
    ]))
    story.append(Spacer(1, 5 * mm))

    # Section 4 — Zone Statistics
    zone_stats = result.get("zone_stats", {})
    story.append(Paragraph("4.  Zone Statistics", sSectionHd))
    story.append(HRFlowable(width=W, thickness=0.5, color=C_BORDER, spaceAfter=4))

    if zone_stats:
        zh = _ps("zh", fontSize=9, textColor=C_ACCENT2,
                 fontName="Helvetica-Bold")
        tdata = [[Paragraph("Zone Name", zh),
                  Paragraph("Unique Animals", zh)]]
        for zname, zcount in zone_stats.items():
            tdata.append([Paragraph(zname, sVal),
                          Paragraph(str(zcount), sVal)])
        zt = Table(tdata, colWidths=[W * 0.6, W * 0.4])
        zt.setStyle(TableStyle([
            ("BACKGROUND",     (0, 0), (-1, 0),  C_CARD_BG),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1),
             [colors.HexColor("#111820"), colors.HexColor("#0d1520")]),
            ("BOX",            (0, 0), (-1, -1), 0.5, C_BORDER),
            ("INNERGRID",      (0, 0), (-1, -1), 0.25, C_BORDER),
            ("ALIGN",          (1, 0), (1, -1),  "CENTER"),
            ("VALIGN",         (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",    (0, 0), (-1, -1), 10),
            ("TOPPADDING",     (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING",  (0, 0), (-1, -1), 6),
        ]))
        story.append(zt)
    else:
        story.append(Paragraph(
            "No zones were defined for this session.", sNote))

    story.append(Spacer(1, 8 * mm))

    # Footer
    story.append(HRFlowable(width=W, thickness=0.5, color=C_BORDER))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(
        f"Blackbuck Census System  |  Report generated on "
        f"{end_dt.strftime('%d %b %Y at %H:%M:%S')}  |  {pdf_path}",
        sFooter,
    ))

    # Dark page background
    def _dark_bg(canvas_obj, doc_obj):
        canvas_obj.saveState()
        canvas_obj.setFillColor(C_DARK)
        canvas_obj.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
        canvas_obj.restoreState()

    doc.build(story, onFirstPage=_dark_bg, onLaterPages=_dark_bg)


# ══════════════════════════════════════════════════════════════════════════════
#  ProcessingReportDialog  (in-app)
# ══════════════════════════════════════════════════════════════════════════════

class ProcessingReportDialog(QDialog):
    _BG      = "#0d1117"
    _CARD    = "#161b22"
    _BORDER  = "#30363d"
    _ACCENT  = "#3fb950"
    _ACCENT2 = "#58a6ff"
    _WARN    = "#e3b341"
    _FG      = "#e6edf3"
    _FG2     = "#8b949e"

    def __init__(self,
                 result:     dict,
                 video_path: Optional[str] = None,
                 output_dir: Optional[str] = None,
                 start_ts:   float = 0.0,
                 end_ts:     float = 0.0,
                 pdf_path:   Optional[str] = None,
                 docx_path:  Optional[str] = None,
                 parent:     Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.setWindowTitle("Processing Report — Blackbuck Census")
        self.setMinimumWidth(620)
        self.setModal(True)

        pal = QPalette()
        pal.setColor(QPalette.Window,     QColor(self._BG))
        pal.setColor(QPalette.WindowText, QColor(self._FG))
        self.setPalette(pal)
        self.setAutoFillBackground(True)
        self.setStyleSheet(f"""
            QDialog   {{ background: {self._BG}; }}
            QLabel    {{ color: {self._FG}; background: transparent; }}
            QFrame[frameShape="4"], QFrame[frameShape="5"]
                      {{ color: {self._BORDER}; }}
            QPushButton {{
                background: {self._ACCENT}; color: #000;
                border: none; border-radius: 6px;
                padding: 6px 24px; font-weight: bold; font-size: 13px;
            }}
            QPushButton:hover {{ background: #56d364; }}
            QScrollArea {{ border: none; background: transparent; }}
            QScrollBar:vertical {{ background: {self._BG}; width: 8px; }}
            QScrollBar::handle:vertical
                      {{ background: {self._BORDER}; border-radius: 4px; }}
        """)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(0, 0, 0, 0)
        outer.setSpacing(0)

        # Banner
        banner = QLabel()
        banner.setAlignment(Qt.AlignCenter)
        banner.setFixedHeight(64)
        banner.setStyleSheet(f"""
            background: qlineargradient(
                x1:0,y1:0,x2:1,y2:0,
                stop:0 #0d2618,stop:0.5 #0f3321,stop:1 #0d2618);
            border-bottom: 1px solid {self._ACCENT};""")
        banner.setText(
            f'<span style="color:{self._ACCENT};font-size:20px;'
            f'font-weight:700;letter-spacing:2px;">&#10004;  PROCESSING COMPLETE</span>')
        outer.addWidget(banner)

        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        bw = QWidget()
        bw.setStyleSheet(f"background:{self._BG};")
        body = QVBoxLayout(bw)
        body.setContentsMargins(28, 20, 28, 20)
        body.setSpacing(16)
        scroll.setWidget(bw)
        outer.addWidget(scroll, stretch=1)

        elapsed  = end_ts - start_ts if (start_ts and end_ts) else 0
        end_dt   = (datetime.datetime.fromtimestamp(end_ts)
                    if end_ts else datetime.datetime.now())
        start_dt = (datetime.datetime.fromtimestamp(start_ts)
                    if start_ts else None)

        vpath     = Path(video_path) if video_path else None
        file_size = (vpath.stat().st_size
                     if (vpath and vpath.exists()) else None)
        ctime     = (datetime.datetime.fromtimestamp(vpath.stat().st_ctime)
                     if (vpath and vpath.exists()) else None)
        mtime     = (datetime.datetime.fromtimestamp(vpath.stat().st_mtime)
                     if (vpath and vpath.exists()) else None)

        vid_w = vid_h = vid_fps = vid_frames_total = vid_dur = None
        if vpath and vpath.exists():
            cap = cv2.VideoCapture(str(vpath))
            if cap.isOpened():
                vid_w            = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                vid_h            = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                vid_fps          = cap.get(cv2.CAP_PROP_FPS)
                vid_frames_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                vid_dur          = (vid_frames_total / vid_fps if vid_fps else None)
            cap.release()

        def sec(txt):
            body.addWidget(self._section_header(txt))

        def grid(rows):
            g = QGridLayout()
            g.setHorizontalSpacing(20)
            g.setVerticalSpacing(8)
            for r, (k, v) in enumerate(rows):
                g.addWidget(self._key(k), r, 0)
                g.addWidget(self._val(v), r, 1)
            body.addLayout(g)

        # Video info
        sec("📹  Video Information")
        grid([
            ("File name",      vpath.name if vpath else "—"),
            ("Full path",      str(vpath) if vpath else "—"),
            ("File size",      _fmt_size(file_size) if file_size is not None else "—"),
            ("Resolution",     f"{vid_w} x {vid_h} px" if vid_w else "—"),
            ("Frame rate",     f"{vid_fps:.3f} FPS" if vid_fps else "—"),
            ("Total frames",   f"{vid_frames_total:,}" if vid_frames_total else "—"),
            ("Duration",       _fmt_duration(vid_dur) if vid_dur else "—"),
            ("File created",   ctime.strftime("%d %b %Y  %H:%M:%S") if ctime else "—"),
            ("Last modified",  mtime.strftime("%d %b %Y  %H:%M:%S") if mtime else "—"),
        ])
        body.addWidget(self._divider())

        # Processing summary
        sec("⚙️  Processing Summary")
        grid([
            ("Processing date",   end_dt.strftime("%d %b %Y")),
            ("Start time",        start_dt.strftime("%H:%M:%S") if start_dt else "—"),
            ("End time",          end_dt.strftime("%H:%M:%S")),
            ("Elapsed time",      _fmt_duration(elapsed) if elapsed else "—"),
            ("Frames processed",  f"{result.get('frames', 0):,}"),
            ("Output directory",  str(output_dir) if output_dir else "—"),
            ("PDF report",        pdf_path if pdf_path else
             ("Not saved — install reportlab" if not _REPORTLAB_OK else "—")),
            ("DOCX report",       docx_path if docx_path else
             ("Not saved — install python-docx" if not _DOCX_REPORT_OK else "—")),
        ])
        body.addWidget(self._divider())

        # KPI cards
        sec("🦌  Detection & Tracking Results")
        kpi_row = QHBoxLayout()
        kpi_row.setSpacing(12)
        kpi_row.addWidget(self._kpi("UNIQUE\nANIMALS",  str(result.get("unique",    0)), self._ACCENT))
        kpi_row.addWidget(self._kpi("ACTIVE\nAT END",   str(result.get("active",    0)), self._ACCENT2))
        kpi_row.addWidget(self._kpi("TOTAL\nCREATED",   str(result.get("total",     0)), self._WARN))
        kpi_row.addWidget(self._kpi("GRAVEYARD",        str(result.get("graveyard", 0)), self._FG2))
        body.addLayout(kpi_row)
        body.addWidget(self._divider())

        # Zone stats
        zone_stats = result.get("zone_stats", {})
        sec("📍  Zone Statistics")
        if zone_stats:
            zg = QGridLayout()
            zg.setHorizontalSpacing(20)
            zg.setVerticalSpacing(8)
            for r, (zn, zc) in enumerate(zone_stats.items()):
                zg.addWidget(self._key(zn),                      r, 0)
                zg.addWidget(self._val(f"{zc} unique animal(s)"), r, 1)
            body.addLayout(zg)
        else:
            body.addWidget(self._note("No zones were defined for this session."))

        body.addSpacing(8)

        # ── Report action buttons ─────────────────────────────────────────────
        _btn_style_primary = f"""
            QPushButton {{
                background: {self._ACCENT}; color: #000;
                border: none; border-radius: 6px;
                padding: 6px 18px; font-weight: bold; font-size: 12px;
            }}
            QPushButton:hover {{ background: #56d364; }}
            QPushButton:disabled {{ background: {self._BORDER}; color: {self._FG2}; }}
        """
        _btn_style_secondary = f"""
            QPushButton {{
                background: {self._CARD}; color: {self._ACCENT2};
                border: 1px solid {self._ACCENT2}; border-radius: 6px;
                padding: 6px 18px; font-weight: bold; font-size: 12px;
            }}
            QPushButton:hover {{ background: #1c2a3a; }}
            QPushButton:disabled {{ color: {self._FG2}; border-color: {self._BORDER}; }}
        """
        _btn_style_folder = f"""
            QPushButton {{
                background: {self._CARD}; color: {self._WARN};
                border: 1px solid {self._WARN}; border-radius: 6px;
                padding: 6px 18px; font-weight: bold; font-size: 12px;
            }}
            QPushButton:hover {{ background: #2a2010; }}
            QPushButton:disabled {{ color: {self._FG2}; border-color: {self._BORDER}; }}
        """

        btn_pdf = QPushButton("📄  Open PDF Report")
        btn_pdf.setFixedHeight(36)
        btn_pdf.setStyleSheet(_btn_style_secondary)
        btn_pdf.setEnabled(bool(pdf_path))
        btn_pdf.setToolTip(pdf_path or "PDF not available")
        if pdf_path:
            btn_pdf.clicked.connect(lambda: _open_file_externally(pdf_path))

        btn_docx = QPushButton("📝  Open DOCX Report")
        btn_docx.setFixedHeight(36)
        btn_docx.setStyleSheet(_btn_style_secondary)
        btn_docx.setEnabled(bool(docx_path))
        btn_docx.setToolTip(docx_path or "DOCX not available")
        if docx_path:
            btn_docx.clicked.connect(lambda: _open_file_externally(docx_path))

        btn_folder = QPushButton("📂  Open Output Folder")
        btn_folder.setFixedHeight(36)
        btn_folder.setStyleSheet(_btn_style_folder)
        _out = output_dir or (str(Path(pdf_path).parent) if pdf_path else
                              str(Path(docx_path).parent) if docx_path else None)
        btn_folder.setEnabled(bool(_out))
        if _out:
            btn_folder.clicked.connect(lambda: _open_file_externally(_out))

        btn_ok = QPushButton("  Close  ")
        btn_ok.setFixedHeight(36)
        btn_ok.setStyleSheet(_btn_style_primary)
        btn_ok.clicked.connect(self.accept)

        btn_row = QHBoxLayout()
        btn_row.setSpacing(10)
        btn_row.addWidget(btn_pdf)
        btn_row.addWidget(btn_docx)
        btn_row.addWidget(btn_folder)
        btn_row.addStretch()
        btn_row.addWidget(btn_ok)
        outer.addLayout(btn_row)
        outer.setContentsMargins(16, 0, 16, 14)

    # ── Widget helpers ─────────────────────────────────────────────────────────
    def _section_header(self, text):
        l = QLabel(text)
        l.setStyleSheet(
            f"color:{self._ACCENT2};font-size:13px;font-weight:700;"
            f"padding-bottom:2px;border-bottom:1px solid {self._BORDER};")
        return l

    def _key(self, text):
        l = QLabel(text)
        l.setStyleSheet(
            f"color:{self._FG2};font-size:12px;min-width:155px;")
        l.setAlignment(Qt.AlignRight | Qt.AlignVCenter)
        return l

    def _val(self, text):
        l = QLabel(text)
        l.setStyleSheet(
            f"color:{self._FG};font-size:12px;font-weight:600;")
        l.setTextInteractionFlags(Qt.TextSelectableByMouse)
        l.setWordWrap(True)
        return l

    def _note(self, text):
        l = QLabel(text)
        l.setStyleSheet(
            f"color:{self._FG2};font-style:italic;font-size:12px;")
        return l

    def _divider(self):
        f = QFrame()
        f.setFrameShape(QFrame.HLine)
        f.setFrameShadow(QFrame.Sunken)
        f.setStyleSheet(f"color:{self._BORDER};")
        return f

    def _kpi(self, label, value, color):
        card = QFrame()
        card.setStyleSheet(
            f"background:{self._CARD};border-radius:8px;"
            f"border:1px solid {self._BORDER};")
        card.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Fixed)
        card.setFixedHeight(80)
        lay = QVBoxLayout(card)
        lay.setContentsMargins(12, 8, 12, 8)
        lay.setSpacing(2)
        num = QLabel(value)
        num.setAlignment(Qt.AlignCenter)
        num.setStyleSheet(
            f"color:{color};font-size:26px;font-weight:800;"
            "background:transparent;border:none;")
        lbl = QLabel(label)
        lbl.setAlignment(Qt.AlignCenter)
        lbl.setStyleSheet(
            f"color:{self._FG2};font-size:10px;font-weight:500;"
            "background:transparent;border:none;")
        lay.addWidget(num)
        lay.addWidget(lbl)
        return card


# ══════════════════════════════════════════════════════════════════════════════
#  VideoDisplay
# ══════════════════════════════════════════════════════════════════════════════

class VideoDisplay(QWidget):
    """
    Layout
    ──────
    ┌──────────────────────────────────────────────┐
    │  video_label  (scales to fit, mouse enabled) │
    ├──────────────────────────────────────────────┤
    │  progress_bar                                 │
    ├──────────────────────────────────────────────┤
    │  status_label  (Unique / Active / Frame)      │
    ├──────────────────────────────────────────────┤
    │  zone_stats_label  (per-zone counts)          │
    ├──────────────────────────────────────────────┤
    │  [Draw Zone]  [Undo]  [Finish]  [Cancel]     │
    │  [Add GPS Ref]  [Clear GPS]  [Clear Zones]   │
    └──────────────────────────────────────────────┘
    """

    def __init__(self, zone_manager: Optional[ZoneManager] = None,
                 parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)
        self.zone_manager = zone_manager or ZoneManager()

        self._video_path: Optional[str] = None
        self._output_dir: Optional[str] = None
        self._start_ts:   float         = 0.0

        self._last_frame: Optional[np.ndarray] = None
        self._qimg:       Optional[QImage]      = None
        self._scale_x = 1.0
        self._scale_y = 1.0

        # ── Video label ───────────────────────────────────────────────────────
        self.video_label = QLabel("Waiting for video…")
        self.video_label.setAlignment(Qt.AlignCenter)
        self.video_label.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.video_label.setMinimumSize(640, 360)
        self.video_label.setStyleSheet(
            "background:#111;color:#888;border-radius:4px;")
        self.video_label.setMouseTracking(True)
        self.video_label.mousePressEvent = self._on_label_click

        # ── Progress bar ──────────────────────────────────────────────────────
        self.progress_bar = QProgressBar()
        self.progress_bar.setRange(0, 100)
        self.progress_bar.setValue(0)
        self.progress_bar.setTextVisible(True)
        self.progress_bar.setFixedHeight(18)

        # ── Status labels ─────────────────────────────────────────────────────
        self.status_label = QLabel("Unique: —   Active: —   Frame: —")
        self.status_label.setFont(QFont("Monospace", 9))
        self.status_label.setAlignment(Qt.AlignLeft)

        self.zone_stats_label = QLabel("No zones defined.")
        self.zone_stats_label.setFont(QFont("Monospace", 9))
        self.zone_stats_label.setAlignment(Qt.AlignLeft)
        self.zone_stats_label.setStyleSheet("color:#88ccff;")

        # ── Zone buttons ──────────────────────────────────────────────────────
        self._btn_draw   = QPushButton("Draw Zone")
        self._btn_undo   = QPushButton("Undo Point")
        self._btn_finish = QPushButton("Finish Zone")
        self._btn_cancel = QPushButton("Cancel")
        self._btn_gps    = QPushButton("Add GPS Ref")
        self._btn_clrgps = QPushButton("Clear GPS Refs")
        self._btn_clrzon = QPushButton("Clear Zones")

        for btn in (self._btn_undo, self._btn_finish, self._btn_cancel):
            btn.setEnabled(False)

        self._btn_draw.clicked.connect(self._start_drawing)
        self._btn_undo.clicked.connect(self._undo_point)
        self._btn_finish.clicked.connect(self._finish_zone)
        self._btn_cancel.clicked.connect(self._cancel_zone)
        self._btn_gps.clicked.connect(self._add_gps_ref)
        self._btn_clrgps.clicked.connect(self._clear_gps)
        self._btn_clrzon.clicked.connect(self._clear_zones)

        row1 = QHBoxLayout()
        for btn in (self._btn_draw, self._btn_undo,
                    self._btn_finish, self._btn_cancel):
            row1.addWidget(btn)

        row2 = QHBoxLayout()
        for btn in (self._btn_gps, self._btn_clrgps, self._btn_clrzon):
            row2.addWidget(btn)

        lay = QVBoxLayout(self)
        lay.setContentsMargins(0, 0, 0, 4)
        lay.setSpacing(4)
        lay.addWidget(self.video_label,      stretch=1)
        lay.addWidget(self.progress_bar,     stretch=0)
        lay.addWidget(self.status_label,     stretch=0)
        lay.addWidget(self.zone_stats_label, stretch=0)
        lay.addLayout(row1)
        lay.addLayout(row2)

    # ══════════════════════════════════════════════════════════════════════════
    #  Public API
    # ══════════════════════════════════════════════════════════════════════════

    def set_video_info(self, video_path: str,
                       output_dir: Optional[str] = None) -> None:
        """
        Store source-video path and output directory before processing.
        Call this BEFORE connect_worker() / worker.start().
        """
        self._video_path = video_path
        self._output_dir = output_dir

    def connect_worker(self, worker) -> None:
        """
        Wire all BlackbuckWorker signals to this widget's slots.
        Call BEFORE worker.start().  Records processing start time.
        """
        self._start_ts = time.time()
        worker.frame_ready.connect(self.on_frame)
        worker.progress.connect(self.on_progress)
        worker.finished.connect(self.on_finished)
        worker.error.connect(self.on_error)

    # ══════════════════════════════════════════════════════════════════════════
    #  Slots
    # ══════════════════════════════════════════════════════════════════════════

    @pyqtSlot(object, object)
    def on_frame(self, frame: np.ndarray, stats: dict) -> None:
        self._last_frame = frame
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w, ch = rgb.shape
        self._qimg = QImage(rgb.data, w, h, ch * w, QImage.Format_RGB888)
        lw, lh = self.video_label.width(), self.video_label.height()
        if lw > 0 and lh > 0:
            pixmap = QPixmap.fromImage(self._qimg).scaled(
                lw, lh, Qt.KeepAspectRatio, Qt.SmoothTransformation)
            self._scale_x = w / pixmap.width()
            self._scale_y = h / pixmap.height()
        else:
            pixmap = QPixmap.fromImage(self._qimg)
            self._scale_x = self._scale_y = 1.0
        self.video_label.setPixmap(pixmap)
        self.status_label.setText(
            f"Unique: {stats.get('unique', 0):>4}   "
            f"Active: {stats.get('active', 0):>3}   "
            f"Frame:  {stats.get('frame', 0):>5} / {stats.get('total', 0)}"
        )
        zone_stats = stats.get("zone_stats", {})
        if zone_stats:
            self.zone_stats_label.setText(
                "Zones — " + "  |  ".join(
                    f"{n}: {c}" for n, c in zone_stats.items()))
        elif self.zone_manager.zones:
            self.zone_stats_label.setText(
                "Zones defined — no animals counted yet.")
        else:
            self.zone_stats_label.setText("No zones defined.")

    @pyqtSlot(int, int)
    def on_progress(self, frame_num: int, total: int) -> None:
        if total > 0:
            pct = int(frame_num / total * 100)
            self.progress_bar.setValue(pct)
            self.progress_bar.setFormat(f"{pct}%  ({frame_num} / {total})")

    @pyqtSlot(object)
    def on_finished(self, result: dict) -> None:
        """
        1. Update inline HUD labels.
        2. Auto-save PDF report to output_dir (falls back to video's folder).
        3. Open ProcessingReportDialog.
        """
        end_ts     = time.time()
        zone_stats = result.get("zone_stats", {})
        zone_txt   = ("  |  ".join(f"{n}: {c}" for n, c in zone_stats.items())
                      if zone_stats else "No zones")

        self.status_label.setText(
            f"Done   Unique: {result.get('unique', '?')}   "
            f"Frames: {result.get('frames', '?')}"
        )
        self.zone_stats_label.setText(f"Final zone counts — {zone_txt}")
        self.progress_bar.setValue(100)
        self.progress_bar.setFormat("100% — Complete")

        # ── Save PDF ──────────────────────────────────────────────────────────
        pdf_path = None
        if _REPORTLAB_OK:
            try:
                base_dir = (Path(self._output_dir)
                            if self._output_dir
                            else (Path(self._video_path).parent
                                  if self._video_path else Path.cwd()))
                base_dir.mkdir(parents=True, exist_ok=True)

                stem = (Path(self._video_path).stem
                        if self._video_path else "blackbuck")
                ts   = datetime.datetime.fromtimestamp(end_ts).strftime(
                    "%Y%m%d_%H%M%S")
                pdf_path = str(
                    base_dir / f"blackbuck_report_{stem}_{ts}.pdf")

                _save_pdf_report(
                    pdf_path   = pdf_path,
                    result     = result,
                    video_path = self._video_path,
                    output_dir = self._output_dir,
                    start_ts   = self._start_ts,
                    end_ts     = end_ts,
                )
            except Exception as exc:
                _traceback.print_exc()
                QMessageBox.warning(
                    self, "PDF save failed",
                    f"Could not save PDF report:\n\n{exc}\n\n"
                    f"(Full traceback printed to console)")
                pdf_path = None
        else:
            QMessageBox.information(
                self, "PDF not saved",
                "Install reportlab to enable PDF reports:\n"
                "    pip install reportlab")

        # ── Save DOCX ─────────────────────────────────────────────────────────
        docx_path = result.get("report_path")          # set by worker if available
        if docx_path is None and _DOCX_REPORT_OK:
            try:
                base_dir = (Path(self._output_dir)
                            if self._output_dir
                            else (Path(self._video_path).parent
                                  if self._video_path else Path.cwd()))
                base_dir.mkdir(parents=True, exist_ok=True)

                # Build a minimal cfg for the generator
                _cfg = {
                    "model_path":   "",
                    "video_path":   self._video_path or "",
                    "output_dir":   str(base_dir),
                    "save_video":   False,
                    "confidence":   0.0, "iou": 0.0,
                    "min_area":     0,   "min_aspect": 0.0,
                    "max_aspect":   0.0, "edge_buf": 0,
                    "track_buffer": 0,   "min_hits": 0,
                    "match_thresh": 0.0,
                    "tiling":       {"enabled": False},
                }
                # If the worker already embedded cfg, use it
                _cfg.update(result.get("cfg", {}))

                _video_meta = {
                    "fps": 0, "width": 0, "height": 0,
                    "total_frames": result.get("frames", 0),
                    "output_video": None,
                }
                if self._video_path and Path(self._video_path).exists():
                    _cap = cv2.VideoCapture(self._video_path)
                    if _cap.isOpened():
                        _video_meta["fps"]    = _cap.get(cv2.CAP_PROP_FPS)
                        _video_meta["width"]  = int(_cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                        _video_meta["height"] = int(_cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                        _video_meta["total_frames"] = int(_cap.get(cv2.CAP_PROP_FRAME_COUNT))
                    _cap.release()

                docx_path = _generate_docx_report(_cfg, result, _video_meta)
            except Exception as exc:
                _traceback.print_exc()
                docx_path = None

        # ── In-app report dialog ──────────────────────────────────────────────
        dlg = ProcessingReportDialog(
            result     = result,
            video_path = self._video_path,
            output_dir = self._output_dir,
            start_ts   = self._start_ts,
            end_ts     = end_ts,
            pdf_path   = pdf_path,
            docx_path  = docx_path,
            parent     = self,
        )
        dlg.exec_()

    @pyqtSlot(str)
    def on_error(self, tb: str) -> None:
        self.video_label.setText(
            f"<b style='color:red'>Worker error</b><br><pre>{tb}</pre>")
        self.status_label.setText("Worker crashed — see above.")

    # ══════════════════════════════════════════════════════════════════════════
    #  Zone drawing
    # ══════════════════════════════════════════════════════════════════════════

    def _label_to_frame(self, label_pt: QPoint):
        lw, lh = self.video_label.width(), self.video_label.height()
        if self._last_frame is None:
            return label_pt.x(), label_pt.y()
        fh, fw = self._last_frame.shape[:2]
        pw = int(fw / self._scale_x)
        ph = int(fh / self._scale_y)
        ox = (lw - pw) // 2
        oy = (lh - ph) // 2
        fx = max(0, min(int((label_pt.x() - ox) * self._scale_x), fw - 1))
        fy = max(0, min(int((label_pt.y() - oy) * self._scale_y), fh - 1))
        return fx, fy

    def _on_label_click(self, event: QMouseEvent):
        if not self.zone_manager.is_drawing:
            return
        fx, fy = self._label_to_frame(event.pos())
        if event.button() == Qt.LeftButton:
            self.zone_manager.add_point(fx, fy)
        elif event.button() == Qt.RightButton:
            self._finish_zone()

    def _start_drawing(self):
        self.zone_manager.start_zone()
        self._btn_draw.setEnabled(False)
        for btn in (self._btn_undo, self._btn_finish, self._btn_cancel):
            btn.setEnabled(True)
        self.zone_stats_label.setText(
            "Click on video to add zone vertices. "
            "Right-click or press Finish to close.")

    def _undo_point(self):
        self.zone_manager.undo_point()
        self.zone_stats_label.setText(
            f"Drawing — {self.zone_manager.current_point_count} points placed.")

    def _finish_zone(self):
        if self.zone_manager.current_point_count < 3:
            QMessageBox.warning(self, "Too few points",
                                "Place at least 3 points to create a zone.")
            return
        name, ok = QInputDialog.getText(
            self, "Zone name", "Enter a name for this zone:",
            text=f"Zone {len(self.zone_manager.zones) + 1}")
        if not ok or not name.strip():
            return
        zone = self.zone_manager.finish_zone(name.strip())
        self._drawing_done()
        if zone:
            self.zone_stats_label.setText(
                f"Zone '{zone.name}' created with {len(zone.polygon)} vertices.")

    def _cancel_zone(self):
        self.zone_manager.cancel_zone()
        self._drawing_done()
        self.zone_stats_label.setText("Zone drawing cancelled.")

    def _drawing_done(self):
        self._btn_draw.setEnabled(True)
        for btn in (self._btn_undo, self._btn_finish, self._btn_cancel):
            btn.setEnabled(False)

    def _add_gps_ref(self):
        text, ok = QInputDialog.getText(
            self, "Add GPS reference",
            "Click a recognisable point on the video first, then enter:\n"
            "  pixel_x, pixel_y, latitude, longitude\n\n"
            "Example:  320, 240, 23.45678, 77.89012")
        if not ok or not text.strip():
            return
        try:
            px, py, lat, lon = [float(v) for v in text.split(",")]
            self.zone_manager.add_gps_ref(px, py, lat, lon)
            n     = len(self.zone_manager._gps_px)
            calib = self.zone_manager.gps_calibrated
            self.zone_stats_label.setText(
                f"GPS ref added ({n} total).  "
                f"{'Calibrated OK' if calib else 'Need >= 4 refs.'}")
        except ValueError:
            QMessageBox.warning(self, "Parse error",
                                "Could not parse input. "
                                "Expected: px, py, lat, lon")

    def _clear_gps(self):
        self.zone_manager.clear_gps_refs()
        self.zone_stats_label.setText("GPS references cleared.")

    def _clear_zones(self):
        reply = QMessageBox.question(
            self, "Clear zones",
            "Remove all zones and reset counts?",
            QMessageBox.Yes | QMessageBox.No)
        if reply == QMessageBox.Yes:
            self.zone_manager.clear_zones()
            self.zone_stats_label.setText("All zones cleared.")