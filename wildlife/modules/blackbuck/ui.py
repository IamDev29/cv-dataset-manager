"""
modules/blackbuck/ui.py
══════════════════════════════════════════════════════════════════
Settings panel for the Blackbuck Census module.

NO UI IS SHOWN TO THE USER.
All values are read silently from config/blackbuck_config.json.
══════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import json
from pathlib import Path

from PyQt5.QtWidgets import QWidget

_CFG_PATH = Path(__file__).resolve().parents[2] / "config" / "blackbuck_config.json"

_FALLBACK = {
    "detection": {
        "confidence": 0.25, "iou": 0.45,
        "min_area": 200, "min_aspect": 0.35,
        "max_aspect": 3.5, "edge_buf": 10,
    },
    "bytetrack": {
        "track_buffer": 90, "min_hits": 2, "match_thresh": 0.25,
    },
    "tiling": {
        "enabled": True, "grid_cols": 3, "grid_rows": 2,
        "overlap": 0.30, "tile_size": 640, "nms_iou": 0.40,
    },
    "enhancer": {
        "clahe_enabled":       True,
        "clahe_clip":          2.0,
        "clahe_tile":          8,
        "scales":              [1.0, 1.5, 2.5],
        "scale_conf_floor":    0.15,
        "ensemble_enabled":    True,
        "ensemble_model_path": "",
        "ensemble_lo_thresh":  0.25,
        "ensemble_hi_thresh":  0.50,
        "morph_enabled":       True,
        "morph_kernel":        5,
        "morph_area_floor":    0.5,
        "calib_enabled":       True,
        "calib_edge_margin":   80,
        "calib_boost":         0.08,
        "calib_dark_thresh":   100,
    },
}


def _load_cfg() -> dict:
    try:
        return json.loads(_CFG_PATH.read_text())
    except Exception:
        return _FALLBACK.copy()


class BlackbuckSettingsPanel(QWidget):
    """Invisible settings container — no widgets shown to the user."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cfg = _load_cfg()
        det = self._cfg.get("detection", _FALLBACK["detection"])
        bt  = self._cfg.get("bytetrack", _FALLBACK["bytetrack"])
        tl  = self._cfg.get("tiling",    _FALLBACK["tiling"])
        enh = self._cfg.get("enhancer",  _FALLBACK["enhancer"])

        # Detection
        self._confidence   = det["confidence"]
        self._iou          = det["iou"]
        self._min_area     = det["min_area"]
        self._min_aspect   = det["min_aspect"]
        self._max_aspect   = det["max_aspect"]
        self._edge_buf     = det["edge_buf"]
        # ByteTrack
        self._track_buffer = bt["track_buffer"]
        self._min_hits     = bt["min_hits"]
        self._match_thresh = bt["match_thresh"]
        # Tiling
        self._tiling_enabled = tl.get("enabled",    True)
        self._grid_cols      = tl.get("grid_cols",  3)
        self._grid_rows      = tl.get("grid_rows",  2)
        self._overlap        = tl.get("overlap",    0.30)
        self._tile_size      = tl.get("tile_size",  640)
        self._nms_iou        = tl.get("nms_iou",    0.40)
        # Enhancer (pass the whole sub-dict through)
        self._enhancer       = {**_FALLBACK["enhancer"], **enh}

        self.hide()
        self.setFixedSize(0, 0)

    def model_path(self) -> str:
        rel = self._cfg.get("model_path", "models/Blackbuck.pt")
        return str(Path(__file__).resolve().parents[2] / rel)

    def build_config(self, video_path: str, output_dir: str,
                     save_video: bool) -> dict:
        return {
            # ── paths ──────────────────────────────────────────────────────
            "model_path":   self.model_path(),
            "video_path":   video_path,
            "output_dir":   output_dir,
            "save_video":   save_video,
            # ── detection ──────────────────────────────────────────────────
            "confidence":   self._confidence,
            "iou":          self._iou,
            "min_area":     self._min_area,
            "min_aspect":   self._min_aspect,
            "max_aspect":   self._max_aspect,
            "edge_buf":     self._edge_buf,
            # ── bytetrack ──────────────────────────────────────────────────
            "track_buffer": self._track_buffer,
            "min_hits":     self._min_hits,
            "match_thresh": self._match_thresh,
            # ── tiling ─────────────────────────────────────────────────────────
            "tiling": {
                "enabled":   self._tiling_enabled,
                "grid_cols": self._grid_cols,
                "grid_rows": self._grid_rows,
                "overlap":   self._overlap,
                "tile_size": self._tile_size,
                "nms_iou":   self._nms_iou,
            },
            # ── enhancer ───────────────────────────────────────────────────────
            "enhancer":     self._enhancer,
        }