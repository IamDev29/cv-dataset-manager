"""
modules/blackbuck/zone_manager.py
══════════════════════════════════════════════════════════════════
Polygon zone drawing and per-zone animal counting.
Optional GPS calibration via homography (4+ reference points).

Usage
-----
    zm = ZoneManager()

    # Option A — define zones in code
    zm.add_zone("North",  [(100,50),  (500,50),  (500,200), (100,200)])
    zm.add_zone("South",  [(100,300), (500,300), (500,500), (100,500)])

    # Option B — interactive (from VideoDisplay)
    zm.start_zone()
    zm.add_point(x, y)   # called on each mouse click
    zm.finish_zone("North")

    # Optional GPS calibration
    zm.add_gps_ref(px=120, py=80,  lat=23.4567, lon=77.8901)
    zm.add_gps_ref(px=540, py=80,  lat=23.4568, lon=77.8925)
    zm.add_gps_ref(px=540, py=430, lat=23.4540, lon=77.8925)
    zm.add_gps_ref(px=120, py=430, lat=23.4540, lon=77.8901)

    # Each frame
    zm.update(tracked_array)          # update zone membership
    frame = zm.draw(frame, tracked)   # overlay zones + GPS labels
    print(zm.zone_stats())            # {"North": 12, "South": 8}
══════════════════════════════════════════════════════════════════
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np


# ── Zone colour palette (BGR for OpenCV) ──────────────────────────────────────
_COLORS: List[Tuple[int, int, int]] = [
    (255, 200,   0),   # cyan-yellow
    (0,   165, 255),   # orange
    (255,   0, 180),   # pink
    (0,   255, 100),   # green
    (200,   0, 255),   # purple
    (0,   220, 255),   # yellow
]


@dataclass
class Zone:
    name: str
    polygon: np.ndarray               # (N, 2) int32, pixel coords
    color: Tuple[int, int, int]       # BGR
    confirmed_ids: set = field(default_factory=set)

    def contains(self, cx: float, cy: float) -> bool:
        """True if point is inside or on the polygon boundary."""
        return cv2.pointPolygonTest(
            self.polygon.astype(np.float32),
            (float(cx), float(cy)),
            measureDist=False,
        ) >= 0


class ZoneManager:
    """
    Manages drawable polygon zones and optional GPS georeferencing.

    GPS calibration
    ---------------
    Call add_gps_ref() with at least 4 pixel ↔ lat/lon pairs.
    Once calibrated, pixel_to_gps() and draw() will annotate each
    confirmed track centroid with its estimated GPS coordinate.
    """

    def __init__(self):
        self.zones: List[Zone] = []

        # GPS calibration
        self._gps_px: List[Tuple[float, float]] = []   # pixel (x,y)
        self._gps_ll: List[Tuple[float, float]] = []   # (lat, lon)
        self._H: Optional[np.ndarray] = None            # homography matrix

        # Interactive drawing state
        self._drawing       = False
        self._current_pts: List[Tuple[int, int]] = []

    # ══════════════════════════════════════════════════════════════════════
    #  Zone management
    # ══════════════════════════════════════════════════════════════════════

    def add_zone(self, name: str,
                 pts: List[Tuple[int, int]]) -> Zone:
        color = _COLORS[len(self.zones) % len(_COLORS)]
        zone  = Zone(
            name=name,
            polygon=np.array(pts, dtype=np.int32),
            color=color,
        )
        self.zones.append(zone)
        return zone

    def remove_zone(self, name: str):
        self.zones = [z for z in self.zones if z.name != name]

    def clear_zones(self):
        self.zones.clear()

    def reset_counts(self):
        for z in self.zones:
            z.confirmed_ids.clear()

    # ══════════════════════════════════════════════════════════════════════
    #  GPS calibration
    # ══════════════════════════════════════════════════════════════════════

    def add_gps_ref(self, px: float, py: float,
                    lat: float, lon: float):
        """
        Add a pixel ↔ GPS ground-truth pair.
        The homography is (re)computed automatically once >= 4 pairs
        are available.
        """
        self._gps_px.append((px, py))
        self._gps_ll.append((lat, lon))
        self._recompute_homography()

    def clear_gps_refs(self):
        self._gps_px.clear()
        self._gps_ll.clear()
        self._H = None

    @property
    def gps_calibrated(self) -> bool:
        return self._H is not None

    def _recompute_homography(self):
        if len(self._gps_px) < 4:
            return
        src = np.array(self._gps_px, dtype=np.float32)
        dst = np.array(self._gps_ll, dtype=np.float32)
        self._H, mask = cv2.findHomography(src, dst, cv2.RANSAC, 5.0)
        if mask is not None:
            n_inliers = int(mask.sum())
            if n_inliers < 4:
                self._H = None   # not enough inliers, reject

    def pixel_to_gps(self, px: float,
                     py: float) -> Optional[Tuple[float, float]]:
        """
        Convert pixel coordinate → (lat, lon).
        Returns None if GPS calibration has not been done.
        """
        if self._H is None:
            return None
        pt     = np.array([[[px, py]]], dtype=np.float32)
        result = cv2.perspectiveTransform(pt, self._H)
        lat, lon = result[0][0]
        return float(lat), float(lon)

    # ══════════════════════════════════════════════════════════════════════
    #  Per-frame update
    # ══════════════════════════════════════════════════════════════════════

    def update(self, tracked: np.ndarray):
        """
        Check which confirmed tracks are inside each zone.

        tracked : (M, 7)  x1 y1 x2 y2 track_id avg_conf confirmed
        """
        if len(tracked) == 0 or not self.zones:
            return
        for obj in tracked:
            x1, y1, x2, y2, tid, _, confirmed = obj
            if not confirmed:
                continue
            cx = (x1 + x2) / 2.0
            cy = (y1 + y2) / 2.0
            for zone in self.zones:
                if zone.contains(cx, cy):
                    zone.confirmed_ids.add(int(tid))

    def zone_stats(self) -> Dict[str, int]:
        """Return {zone_name: unique_count} for all zones."""
        return {z.name: len(z.confirmed_ids) for z in self.zones}

    # ══════════════════════════════════════════════════════════════════════
    #  Drawing
    # ══════════════════════════════════════════════════════════════════════

    def draw(self, frame: np.ndarray,
             tracked: np.ndarray) -> np.ndarray:
        """
        Overlay zones, per-zone counts, and (if calibrated) GPS coords
        for each confirmed track.  Modifies frame in-place.
        """
        if not self.zones and self._H is None:
            return frame

        # Semi-transparent zone fills
        overlay = frame.copy()
        for zone in self.zones:
            pts = zone.polygon.reshape((-1, 1, 2))
            cv2.fillPoly(overlay, [pts], zone.color)
        cv2.addWeighted(overlay, 0.20, frame, 0.80, 0, frame)

        # Zone borders + labels
        for zone in self.zones:
            pts = zone.polygon.reshape((-1, 1, 2))
            cv2.polylines(frame, [pts], isClosed=True,
                          color=zone.color, thickness=2)

            # Label background + text
            cx = int(zone.polygon[:, 0].mean())
            cy = int(zone.polygon[:, 1].mean())
            label = f"{zone.name}: {len(zone.confirmed_ids)}"
            (tw, th), baseline = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.65, 2)
            pad = 4
            cv2.rectangle(frame,
                          (cx - tw // 2 - pad, cy - th - pad),
                          (cx + tw // 2 + pad, cy + baseline + pad),
                          (0, 0, 0), cv2.FILLED)
            cv2.putText(frame, label,
                        (cx - tw // 2, cy),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.65,
                        zone.color, 2, cv2.LINE_AA)

        # GPS annotation per confirmed track
        if self._H is not None and len(tracked):
            for obj in tracked:
                x1, y1, x2, y2, _, _, confirmed = obj
                if not confirmed:
                    continue
                cx = (x1 + x2) / 2.0
                cy = (y1 + y2) / 2.0
                gps = self.pixel_to_gps(cx, cy)
                if gps:
                    lat, lon = gps
                    txt = f"{lat:.5f}, {lon:.5f}"
                    cv2.putText(frame, txt,
                                (int(x1), int(y2) + 14),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.35,
                                (200, 220, 255), 1, cv2.LINE_AA)

        return frame

    # ══════════════════════════════════════════════════════════════════════
    #  Interactive drawing (used from VideoDisplay)
    # ══════════════════════════════════════════════════════════════════════

    def start_zone(self):
        """Begin drawing a new polygon zone."""
        self._drawing     = True
        self._current_pts = []

    def add_point(self, x: int, y: int):
        """Add a vertex while drawing."""
        if self._drawing:
            self._current_pts.append((x, y))

    def undo_point(self):
        """Remove the last added vertex."""
        if self._current_pts:
            self._current_pts.pop()

    def finish_zone(self, name: str = "") -> Optional[Zone]:
        """
        Close the polygon and create the zone.
        Returns None if fewer than 3 points were placed.
        """
        if not self._drawing or len(self._current_pts) < 3:
            self._drawing = False
            return None
        name = name or f"Zone {len(self.zones) + 1}"
        zone = self.add_zone(name, self._current_pts)
        self._drawing     = False
        self._current_pts = []
        return zone

    def cancel_zone(self):
        """Discard the in-progress polygon."""
        self._drawing     = False
        self._current_pts = []

    @property
    def is_drawing(self) -> bool:
        return self._drawing

    @property
    def current_point_count(self) -> int:
        return len(self._current_pts)

    def draw_in_progress(self, frame: np.ndarray,
                         cursor: Tuple[int, int]) -> np.ndarray:
        """
        Overlay the in-progress polygon (with cursor preview) while the
        user is clicking zone vertices.  Call this instead of draw()
        during the drawing phase.
        """
        pts = self._current_pts + [cursor]
        if len(pts) >= 2:
            for i in range(len(pts) - 1):
                cv2.line(frame, pts[i], pts[i + 1], (0, 255, 255), 2)
            # Close-preview line back to start
            cv2.line(frame, pts[-1], pts[0], (0, 255, 255), 1)
        for pt in self._current_pts:
            cv2.circle(frame, pt, 5, (0, 255, 255), -1)
        cv2.putText(frame,
                    f"Drawing zone — {len(self._current_pts)} pts  "
                    f"(right-click to finish, Esc to cancel)",
                    (10, frame.shape[0] - 12),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1,
                    cv2.LINE_AA)
        return frame