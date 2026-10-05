"""
modules/turtle/ui.py
════════════════════════════════════════════════════════════════
Settings panel for the Olive Ridley Turtle module.

NO UI IS SHOWN TO THE USER.
All values are read silently from config/turtle_config.json.
Auto-tuned values (tile size, box filters) are computed from
video resolution when a video is loaded.
════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

import json
from pathlib import Path

from PyQt5.QtWidgets import QWidget

_CFG_PATH = Path(__file__).resolve().parents[2] / "config" / "turtle_config.json"

_FALLBACK = {
    "counting_zone":   {"line1_frac": 0.33, "line2_frac": 0.66},
    "tiled_detection": {"conf": 0.15, "iou": 0.45, "tile_w": 960,
                        "tile_h": 540, "overlap": 0.30,
                        "dedup_dist": 40, "max_age": 40},
}


def _load_cfg() -> dict:
    try:
        return json.loads(_CFG_PATH.read_text())
    except Exception:
        return _FALLBACK.copy()


def _auto_tile(vid_w: int, vid_h: int):
    def nearest32(v):
        return max(32, (v // 32) * 32)
    return nearest32(min(vid_w // 2, 1280)), nearest32(min(vid_h // 2, 1280))


def _auto_box_filters(vid_w: int, vid_h: int):
    short    = min(vid_w, vid_h)
    min_side = max(4,  int(short * 0.005))
    max_w    = max(60, int(vid_w * 0.35))
    max_h    = max(60, int(vid_h * 0.35))
    return {"min_w": min_side, "min_h": min_side,
            "max_w": max_w,    "max_h": max_h,
            "min_aspect": 0.15, "max_aspect": 6.0}


class TurtleSettingsPanel(QWidget):
    """Invisible settings container — no widgets shown to the user."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._cfg    = _load_cfg()
        zone         = self._cfg.get("counting_zone",   _FALLBACK["counting_zone"])
        det          = self._cfg.get("tiled_detection", _FALLBACK["tiled_detection"])
        # All values stored as private attributes — never rendered
        self._line1      = zone["line1_frac"]
        self._line2      = zone["line2_frac"]
        self._conf       = det["conf"]
        self._iou        = det["iou"]
        self._overlap    = det["overlap"]
        self._dedup      = det["dedup_dist"]
        self._max_age    = det["max_age"]
        self._tile_w     = det.get("tile_w", 960)
        self._tile_h     = det.get("tile_h", 540)
        self._box_cfg    = _auto_box_filters(1920, 1080)  # updated on video load
        # Keep widget invisible / zero-size
        self.hide()
        self.setFixedSize(0, 0)

    def apply_auto_tune(self, vid_w: int, vid_h: int):
        """Called by ProcessingPage after a video is selected."""
        self._tile_w, self._tile_h = _auto_tile(vid_w, vid_h)
        self._box_cfg              = _auto_box_filters(vid_w, vid_h)

    def get_line_fracs(self):
        return self._line1, self._line2

    def model_path(self) -> str:
        rel = self._cfg.get("model_path", "models/best_Turtle_2nd Feb.pt")
        return str(Path(__file__).resolve().parents[2] / rel)

    def build_config(self, video_path: str, output_dir: str,
                     save_video: bool) -> dict:
        b = self._box_cfg
        return {
            "model_path": self.model_path(),
            "video_path": video_path,
            "output_dir": output_dir,
            "save_video": save_video,
            "conf":       self._conf,
            "iou":        self._iou,
            "overlap":    self._overlap,
            "dedup":      self._dedup,
            "max_age":    self._max_age,
            "tile_w":     self._tile_w,
            "tile_h":     self._tile_h,
            "min_w":      b["min_w"],
            "min_h":      b["min_h"],
            "max_w":      b["max_w"],
            "max_h":      b["max_h"],
            "min_aspect": b["min_aspect"],
            "max_aspect": b["max_aspect"],
            "line1_frac": self._line1,
            "line2_frac": self._line2,
        }