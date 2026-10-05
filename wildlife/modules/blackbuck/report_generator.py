"""
modules/blackbuck/report_generator.py
══════════════════════════════════════════════════════════════════
Automatically generates a professional DOCX census report at the
end of each video processing run.

Called by BlackbuckWorker.run() just before self.finished.emit().

Usage (internal – called by worker)
-------------------------------------
    from .report_generator import generate_report

    result = tracker.stats()
    result["frames"] = frame_num
    report_path = generate_report(cfg, result, video_meta)
    result["report_path"] = report_path
    self.finished.emit(result)

Public API
----------
    generate_report(cfg, result, video_meta) -> str
        cfg        : dict   – full config from BlackbuckSettingsPanel.build_config()
        result     : dict   – tracker.stats() + "frames" + optional "zone_stats"
        video_meta : dict   – {"fps": float, "width": int, "height": int,
                                "total_frames": int, "output_video": str|None}
        Returns the absolute path to the written .docx file.
══════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import datetime
import os
from pathlib import Path
from typing import Dict, Optional

from docx import Document
from docx.shared import Pt, RGBColor, Inches, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement


# ── Colour palette ────────────────────────────────────────────────────────────
_GREEN_DARK  = RGBColor(0x0E, 0x3B, 0x0E)
_GREEN_MED   = RGBColor(0x2D, 0x6A, 0x2D)
_BLUE_DARK   = RGBColor(0x1F, 0x4E, 0x79)
_BLUE_MED    = RGBColor(0x2E, 0x75, 0xB6)
_WHITE       = RGBColor(0xFF, 0xFF, 0xFF)
_GREY        = RGBColor(0x55, 0x55, 0x55)
_RED         = RGBColor(0xC0, 0x00, 0x00)
_AMBER       = RGBColor(0x7F, 0x60, 0x00)

# Hex fills for table cells
_FILL_HEADER   = "1F4E79"
_FILL_SUBHEAD  = "2E75B6"
_FILL_ROW_A    = "EAF4FB"
_FILL_ROW_B    = "FFFFFF"
_FILL_TOTAL    = "D6EAF8"
_FILL_ZONE     = "E8F5E9"
_FILL_ZONE_ALT = "C8E6C9"
_FILL_TITLE_BG = "0E3B0E"
_FILL_WARN     = "FFF3CD"


# ══════════════════════════════════════════════════════════════════════════════
#  Low-level XML helpers
# ══════════════════════════════════════════════════════════════════════════════

def _set_cell_bg(cell, hex_color: str):
    """Set table cell background shading via raw XML."""
    tc   = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd  = OxmlElement("w:shd")
    shd.set(qn("w:val"),   "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"),  hex_color.upper())
    tcPr.append(shd)


def _set_cell_borders(cell, color: str = "AAAAAA", sz: int = 4):
    tc   = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement("w:tcBorders")
    for side in ("top", "left", "bottom", "right"):
        bd = OxmlElement(f"w:{side}")
        bd.set(qn("w:val"),   "single")
        bd.set(qn("w:sz"),    str(sz))
        bd.set(qn("w:space"), "0")
        bd.set(qn("w:color"), color.upper())
        tcBorders.append(bd)
    tcPr.append(tcBorders)


def _set_col_width(table, col_idx: int, width_cm: float):
    """Force column width via XML (python-docx doesn't expose this cleanly)."""
    twips = int(width_cm * 567)   # 1 cm = 567 twips (EMU/20)
    for row in table.rows:
        cell = row.cells[col_idx]
        tc   = cell._tc
        tcPr = tc.get_or_add_tcPr()
        tcW  = OxmlElement("w:tcW")
        tcW.set(qn("w:w"),    str(twips))
        tcW.set(qn("w:type"), "dxa")
        tcPr.append(tcW)


def _cell_text(cell, text: str, bold=False, color: RGBColor = None,
               size_pt: float = 10, align=WD_ALIGN_PARAGRAPH.LEFT,
               italic=False):
    """Write formatted text into a table cell (clears existing paragraphs)."""
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    para = cell.paragraphs[0]
    para.alignment = align
    para.paragraph_format.space_before = Pt(2)
    para.paragraph_format.space_after  = Pt(2)
    run  = para.add_run(str(text))
    run.bold   = bold
    run.italic = italic
    run.font.size = Pt(size_pt)
    run.font.name = "Arial"
    if color:
        run.font.color.rgb = color


def _header_row(table, labels: list, fills=None, text_size=9.5):
    """Fill the first row of *table* as a styled header."""
    row = table.rows[0]
    for idx, label in enumerate(labels):
        cell = row.cells[idx]
        fill = (fills[idx] if fills else None) or _FILL_HEADER
        _set_cell_bg(cell, fill)
        _set_cell_borders(cell, color="1F4E79", sz=6)
        _cell_text(cell, label, bold=True, color=_WHITE,
                   size_pt=text_size, align=WD_ALIGN_PARAGRAPH.CENTER)


def _add_section_heading(doc, text: str, level: int = 1):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(14 if level == 1 else 8)
    p.paragraph_format.space_after  = Pt(4)
    run = p.add_run(text)
    run.bold      = True
    run.font.name = "Arial"
    run.font.size = Pt(13 if level == 1 else 11)
    run.font.color.rgb = _GREEN_DARK if level == 1 else _BLUE_DARK
    if level == 1:
        # bottom border via paragraph XML
        pPr  = p._p.get_or_add_pPr()
        pBdr = OxmlElement("w:pBdr")
        bot  = OxmlElement("w:bottom")
        bot.set(qn("w:val"),   "single")
        bot.set(qn("w:sz"),    "6")
        bot.set(qn("w:space"), "1")
        bot.set(qn("w:color"), "2D6A2D")
        pBdr.append(bot)
        pPr.append(pBdr)
    return p


def _add_body(doc, text: str, color: RGBColor = None):
    p   = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after  = Pt(4)
    run = p.add_run(text)
    run.font.name = "Arial"
    run.font.size = Pt(10)
    if color:
        run.font.color.rgb = color
    return p


def _add_kv(doc, key: str, value: str, value_bold=False):
    p    = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(1)
    p.paragraph_format.space_after  = Pt(1)
    k    = p.add_run(f"{key}:  ")
    k.bold      = True
    k.font.name = "Arial"
    k.font.size = Pt(10)
    k.font.color.rgb = _BLUE_DARK
    v    = p.add_run(value)
    v.bold      = value_bold
    v.font.name = "Arial"
    v.font.size = Pt(10)
    return p


# ══════════════════════════════════════════════════════════════════════════════
#  Page-level header / footer helpers
# ══════════════════════════════════════════════════════════════════════════════

def _set_page_header(section, title: str):
    header = section.header
    header.is_linked_to_previous = False
    p = header.paragraphs[0] if header.paragraphs else header.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_after = Pt(0)
    run = p.add_run(title)
    run.font.name = "Arial"
    run.font.size = Pt(8.5)
    run.font.color.rgb = _GREEN_MED
    # underline rule
    pPr  = p._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bot  = OxmlElement("w:bottom")
    bot.set(qn("w:val"),   "single")
    bot.set(qn("w:sz"),    "4")
    bot.set(qn("w:space"), "1")
    bot.set(qn("w:color"), "2D6A2D")
    pBdr.append(bot)
    pPr.append(pBdr)


def _set_page_footer(section, video_name: str):
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(f"Blackbuck Census Report  |  {video_name}  |  Page ")
    run.font.name = "Arial"
    run.font.size = Pt(8)
    run.font.color.rgb = _GREY
    # Add auto page number field
    fldChar1 = OxmlElement("w:fldChar")
    fldChar1.set(qn("w:fldCharType"), "begin")
    instrText = OxmlElement("w:instrText")
    instrText.text = " PAGE "
    fldChar2 = OxmlElement("w:fldChar")
    fldChar2.set(qn("w:fldCharType"), "end")
    r = OxmlElement("w:r")
    rPr = OxmlElement("w:rPr")
    rFonts = OxmlElement("w:rFonts")
    rFonts.set(qn("w:ascii"), "Arial")
    rPr.append(rFonts)
    r.append(rPr)
    r.append(fldChar1)
    r.append(instrText)
    r.append(fldChar2)
    p._p.append(r)


# ══════════════════════════════════════════════════════════════════════════════
#  Summary stats box (coloured 2×3 card table)
# ══════════════════════════════════════════════════════════════════════════════

def _add_stats_box(doc, result: dict):
    unique    = result.get("unique",    0)
    active    = result.get("active",    0)
    total     = result.get("total",     0)
    graveyard = result.get("graveyard", 0)
    frames    = result.get("frames",    0)

    cards = [
        ("UNIQUE ANIMALS", str(unique),    "1F4E79", "D6EAF8"),
        ("TOTAL IDs CREATED", str(total),  "2E7D32", "E8F5E9"),
        ("ACTIVE AT END",  str(active),    "6A1A6A", "F3E5F5"),
        ("GRAVEYARD ReIDs", str(graveyard),"7F4000", "FFF3E0"),
        ("FRAMES PROCESSED", f"{frames:,}","0D4741", "E0F2F1"),
        ("CONFIRMED TRACKS", str(unique),  "0A3D6B", "E3F2FD"),
    ]

    tbl = doc.add_table(rows=2, cols=3)
    tbl.style = "Table Grid"
    tbl.alignment = WD_ALIGN_PARAGRAPH.CENTER

    for r_idx in range(2):
        for c_idx in range(3):
            card_idx = r_idx * 3 + c_idx
            label, value, txt_hex, bg_hex = cards[card_idx]
            cell = tbl.cell(r_idx, c_idx)
            _set_cell_bg(cell, bg_hex)
            _set_cell_borders(cell, color=txt_hex, sz=8)
            cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

            para_lbl = cell.paragraphs[0]
            para_lbl.alignment = WD_ALIGN_PARAGRAPH.CENTER
            para_lbl.paragraph_format.space_before = Pt(6)
            para_lbl.paragraph_format.space_after  = Pt(0)
            r1 = para_lbl.add_run(label)
            r1.font.name = "Arial"
            r1.font.size = Pt(7.5)
            r1.bold = True
            r1.font.color.rgb = RGBColor.from_string(txt_hex)

            para_val = cell.add_paragraph()
            para_val.alignment = WD_ALIGN_PARAGRAPH.CENTER
            para_val.paragraph_format.space_before = Pt(0)
            para_val.paragraph_format.space_after  = Pt(6)
            r2 = para_val.add_run(value)
            r2.font.name  = "Arial"
            r2.font.size  = Pt(22)
            r2.bold       = True
            r2.font.color.rgb = RGBColor.from_string(txt_hex)

    # Set equal column widths (~4.7 cm each for A4)
    for c in range(3):
        _set_col_width(tbl, c, 4.7)

    doc.add_paragraph()   # spacer


# ══════════════════════════════════════════════════════════════════════════════
#  Zone stats table
# ══════════════════════════════════════════════════════════════════════════════

def _add_zone_table(doc, zone_stats: dict):
    if not zone_stats:
        _add_body(doc, "No zones were defined for this session.", color=_GREY)
        return

    tbl = doc.add_table(rows=len(zone_stats) + 1, cols=3)
    tbl.style = "Table Grid"

    _header_row(tbl, ["Zone Name", "Unique Animals Counted", "% of Total"])

    total_animals = sum(zone_stats.values()) or 1
    fills = [_FILL_ZONE, _FILL_ZONE_ALT]

    for i, (name, count) in enumerate(zone_stats.items()):
        row  = tbl.rows[i + 1]
        fill = fills[i % 2]
        pct  = f"{count / total_animals * 100:.1f} %"

        _set_cell_bg(row.cells[0], fill)
        _set_cell_bg(row.cells[1], fill)
        _set_cell_bg(row.cells[2], fill)
        for cell in row.cells:
            _set_cell_borders(cell, color="2E7D32", sz=4)

        _cell_text(row.cells[0], name,  bold=True,  size_pt=10)
        _cell_text(row.cells[1], str(count), bold=True, size_pt=10,
                   align=WD_ALIGN_PARAGRAPH.CENTER,
                   color=RGBColor(0x1F, 0x4E, 0x79))
        _cell_text(row.cells[2], pct, size_pt=10,
                   align=WD_ALIGN_PARAGRAPH.CENTER)

    _set_col_width(tbl, 0, 5.5)
    _set_col_width(tbl, 1, 4.5)
    _set_col_width(tbl, 2, 4.0)
    doc.add_paragraph()


# ══════════════════════════════════════════════════════════════════════════════
#  Config reference table
# ══════════════════════════════════════════════════════════════════════════════

def _add_config_table(doc, cfg: dict):
    tiling = cfg.get("tiling", {})
    rows_data = [
        # (Parameter, Value, Category)
        ("Model",              Path(cfg.get("model_path","")).name, "Inference"),
        ("Confidence threshold", f"{cfg.get('confidence', 0.25):.2f}", "Detection"),
        ("IOU threshold",      f"{cfg.get('iou', 0.45):.2f}",          "Detection"),
        ("Min bounding-box area", f"{cfg.get('min_area', 400)} px²",   "Detection"),
        ("Aspect ratio range", f"{cfg.get('min_aspect',0.3):.1f} – {cfg.get('max_aspect',3.0):.1f}", "Detection"),
        ("Edge buffer",        f"{cfg.get('edge_buf', 10)} px",         "Detection"),
        ("Track buffer (max age)", str(cfg.get("track_buffer", 50)),    "Tracking"),
        ("Min hits (confirm)", str(cfg.get("min_hits", 3)),             "Tracking"),
        ("Match threshold",    f"{cfg.get('match_thresh', 0.7):.2f}",   "Tracking"),
        ("Tiling enabled",     "Yes" if tiling.get("enabled") else "No", "Tiling"),
        ("Tile grid",          f"{tiling.get('grid_rows',2)} × {tiling.get('grid_cols',3)}", "Tiling"),
        ("Tile overlap",       f"{tiling.get('overlap',0.25):.0%}",      "Tiling"),
        ("Tile size",          f"{tiling.get('tile_size',640)} px",      "Tiling"),
        ("NMS IOU (tiles)",    f"{tiling.get('nms_iou',0.5):.2f}",       "Tiling"),
    ]

    tbl = doc.add_table(rows=len(rows_data) + 1, cols=3)
    tbl.style = "Table Grid"
    _header_row(tbl, ["Parameter", "Value", "Category"])

    cat_colors = {
        "Inference": "EAF4FB", "Detection": "FFF8E1",
        "Tracking":  "E8F5E9", "Tiling":    "F3E5F5",
    }

    for i, (param, val, cat) in enumerate(rows_data):
        row  = tbl.rows[i + 1]
        fill = cat_colors.get(cat, "FFFFFF")
        for cell in row.cells:
            _set_cell_bg(cell, fill)
            _set_cell_borders(cell, color="AAAAAA", sz=4)
        _cell_text(row.cells[0], param, bold=True, size_pt=9.5)
        _cell_text(row.cells[1], val,   size_pt=9.5,
                   align=WD_ALIGN_PARAGRAPH.CENTER)
        _cell_text(row.cells[2], cat,   size_pt=9, italic=True, color=_GREY)

    _set_col_width(tbl, 0, 5.5)
    _set_col_width(tbl, 1, 3.5)
    _set_col_width(tbl, 2, 2.8)
    doc.add_paragraph()


# ══════════════════════════════════════════════════════════════════════════════
#  Title block
# ══════════════════════════════════════════════════════════════════════════════

def _add_title_block(doc, video_name: str, timestamp: str,
                     output_video: Optional[str]):
    # Dark green title banner
    tbl = doc.add_table(rows=1, cols=1)
    tbl.style = "Table Grid"
    cell = tbl.cell(0, 0)
    _set_cell_bg(cell, _FILL_TITLE_BG)
    _set_cell_borders(cell, color=_FILL_TITLE_BG, sz=0)
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER

    p1 = cell.paragraphs[0]
    p1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p1.paragraph_format.space_before = Pt(10)
    p1.paragraph_format.space_after  = Pt(2)
    r1 = p1.add_run("BLACKBUCK CENSUS")
    r1.font.name  = "Arial"
    r1.font.size  = Pt(26)
    r1.bold       = True
    r1.font.color.rgb = _WHITE

    p2 = cell.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p2.paragraph_format.space_before = Pt(0)
    p2.paragraph_format.space_after  = Pt(2)
    r2 = p2.add_run("Video Processing Report")
    r2.font.name  = "Arial"
    r2.font.size  = Pt(14)
    r2.italic     = True
    r2.font.color.rgb = RGBColor(0xA8, 0xD8, 0xA8)

    p3 = cell.add_paragraph()
    p3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p3.paragraph_format.space_before = Pt(4)
    p3.paragraph_format.space_after  = Pt(10)
    r3 = p3.add_run(f"Generated: {timestamp}")
    r3.font.name  = "Arial"
    r3.font.size  = Pt(9)
    r3.font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)

    _set_col_width(tbl, 0, 14.0)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # Meta info line
    _add_kv(doc, "Source video", video_name)
    if output_video:
        _add_kv(doc, "Output video", Path(output_video).name)
    _add_kv(doc, "Report generated", timestamp)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)


# ══════════════════════════════════════════════════════════════════════════════
#  Video metadata table
# ══════════════════════════════════════════════════════════════════════════════

def _add_video_meta_table(doc, cfg: dict, video_meta: dict):
    fps     = video_meta.get("fps",           0)
    W       = video_meta.get("width",         0)
    H       = video_meta.get("height",        0)
    total_f = video_meta.get("total_frames",  0)
    dur_s   = total_f / fps if fps > 0 else 0
    dur_str = f"{int(dur_s // 60)}m {int(dur_s % 60)}s"

    rows_data = [
        ("File name",   Path(cfg.get("video_path","")).name),
        ("Resolution",  f"{W} × {H} px"),
        ("Frame rate",  f"{fps:.2f} fps"),
        ("Total frames", f"{total_f:,}"),
        ("Duration",    dur_str),
    ]

    tbl = doc.add_table(rows=len(rows_data) + 1, cols=2)
    tbl.style = "Table Grid"
    _header_row(tbl, ["Property", "Value"], fills=[_FILL_SUBHEAD, _FILL_SUBHEAD])

    for i, (prop, val) in enumerate(rows_data):
        row  = tbl.rows[i + 1]
        fill = _FILL_ROW_A if i % 2 == 0 else _FILL_ROW_B
        for cell in row.cells:
            _set_cell_bg(cell, fill)
            _set_cell_borders(cell, color="AAAAAA", sz=4)
        _cell_text(row.cells[0], prop, bold=True,  size_pt=10)
        _cell_text(row.cells[1], val,  bold=False, size_pt=10)

    _set_col_width(tbl, 0, 5.5)
    _set_col_width(tbl, 1, 7.5)
    doc.add_paragraph()


# ══════════════════════════════════════════════════════════════════════════════
#  Main entry point
# ══════════════════════════════════════════════════════════════════════════════

def generate_report(cfg: dict, result: dict, video_meta: dict) -> str:
    """
    Build and save the post-processing DOCX report.

    Parameters
    ----------
    cfg        : full config dict (from BlackbuckSettingsPanel.build_config)
    result     : tracker.stats() enriched with "frames" and "zone_stats"
    video_meta : {"fps": float, "width": int, "height": int,
                  "total_frames": int, "output_video": str|None}

    Returns
    -------
    str  – absolute path to the written .docx file
    """
    timestamp    = datetime.datetime.now().strftime("%Y-%m-%d  %H:%M:%S")
    video_path   = cfg.get("video_path", "unknown_video")
    video_stem   = Path(video_path).stem
    video_name   = Path(video_path).name
    output_dir   = cfg.get("output_dir", str(Path(video_path).parent))
    output_video = video_meta.get("output_video")

    # Ensure output dir exists
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    report_path = str(Path(output_dir) / f"report_{video_stem}.docx")

    # ── Build document ───────────────────────────────────────────────────────
    doc = Document()

    # Page margins (A4, 2 cm all round)
    section = doc.sections[0]
    section.page_width   = Cm(21.0)
    section.page_height  = Cm(29.7)
    section.left_margin  = Cm(2.0)
    section.right_margin = Cm(2.0)
    section.top_margin   = Cm(2.0)
    section.bottom_margin = Cm(2.0)

    _set_page_header(section,
        f"Blackbuck Census  |  {video_name}  |  {timestamp}")
    _set_page_footer(section, video_name)

    # Default font
    doc.styles["Normal"].font.name = "Arial"
    doc.styles["Normal"].font.size = Pt(10)

    # ── 1.  Title ─────────────────────────────────────────────────────────────
    _add_title_block(doc, video_name, timestamp, output_video)

    # ── 2.  Summary stats cards ───────────────────────────────────────────────
    _add_section_heading(doc, "1.  Detection & Tracking Summary")
    _add_stats_box(doc, result)

    # ── 3.  Video metadata ────────────────────────────────────────────────────
    _add_section_heading(doc, "2.  Video Metadata")
    _add_video_meta_table(doc, cfg, video_meta)

    # ── Footer line ───────────────────────────────────────────────────────────
    doc.add_paragraph()
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(20)
    run = p.add_run("— End of Report —")
    run.italic         = True
    run.font.name      = "Arial"
    run.font.size      = Pt(9)
    run.font.color.rgb = _GREY

    # ── Save ─────────────────────────────────────────────────────────────────
    doc.save(report_path)
    return report_path