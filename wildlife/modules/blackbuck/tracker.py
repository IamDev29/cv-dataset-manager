"""
modules/blackbuck/tracker.py
ByteTrack + Kalman + Graveyard ReID + Proximity spawn guard.

Tracking fixes for blackbuck
─────────────────────────────
FIX-TRK-1  COAST_FRAMES raised 2→4.
           Blackbucks disappear behind grass for 2-3 frames regularly.
           With COAST_FRAMES=2, tracks died every time animal went behind grass.
           4 frames = ~160ms at 25fps — enough to bridge typical occlusions.

FIX-TRK-2  MIN_SPAWN_DIST lowered 60→30.
           Herding blackbucks can be 30-40px apart at range.
           MIN_SPAWN_DIST=60 was blocking new track spawns for animals
           that legitimately appeared within 60px of an existing track.

FIX-TRK-3  Kalman R matrix tuned for faster animal movement.
           R=4.0 (measurement noise) was calibrated for slow-moving cattle.
           Blackbucks sprint at ~80km/h — reducing R to 1.5 makes Kalman
           trust new measurements more, catching up faster after occlusion.

FIX-TRK-4  REID_FRAMES raised 60→90.
           Graveyard ReID window extended from ~2.4s to ~3.6s at 25fps.
           Blackbuck that walk off-screen and return within 3.6s get
           their original track ID restored correctly.

FIX-TRK-5  REID_DIST_SCALE raised 3.0→4.0.
           Running animals can move 2-3 body lengths during occlusion.
           Scale=4.0 gives a wider ReID radius without causing wrong merges.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import List, Optional, Set, Tuple
import numpy as np
from scipy.optimize import linear_sum_assignment

COAST_FRAMES    = 4      # FIX-TRK-1: was 2
REID_FRAMES     = 90     # FIX-TRK-4: was 60
REID_DIST_SCALE = 4.0    # FIX-TRK-5: was 3.0
MIN_SPAWN_DIST  = 30     # FIX-TRK-2: was 60


class KalmanBoxFilter:
    def __init__(self, bbox):
        self.F = np.eye(8, dtype=np.float32)
        for i in range(4):
            self.F[i, i+4] = 1.0
        self.H = np.zeros((4, 8), dtype=np.float32)
        for i in range(4):
            self.H[i, i] = 1.0

        # FIX-TRK-3: R=1.5 (was 4.0) — trust measurements more for fast animals
        self.R = np.eye(4, dtype=np.float32) * 1.5

        self.Q = np.eye(8, dtype=np.float32)
        self.Q[:4, :4] *= 1.0
        self.Q[4:, 4:] *= 0.01
        self.P = np.eye(8, dtype=np.float32)
        self.P[4:, 4:] *= 100.0
        self.x = np.zeros(8, dtype=np.float32)
        self.x[:4] = bbox

    def predict(self):
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q
        return np.maximum(self.x[:4], 0).copy()

    def update(self, bbox):
        z = np.asarray(bbox, dtype=np.float32)
        y = z - self.H @ self.x
        S = self.H @ self.P @ self.H.T + self.R
        K = self.P @ self.H.T @ np.linalg.inv(S)
        self.x = self.x + K @ y
        self.P = (np.eye(8, dtype=np.float32) - K @ self.H) @ self.P
        return np.maximum(self.x[:4], 0).copy()


@dataclass
class GraveyardEntry:
    track_id:     int
    cx:           float
    cy:           float
    mean_size:    float
    died_frame:   int
    conf_history: list = field(default_factory=list)


class STrack:
    _count = 0

    def __init__(self, bbox, conf, resurrect_id=None, resurrect_conf_history=None):
        if resurrect_id is not None:
            self.id = resurrect_id
        else:
            STrack._count += 1
            self.id = STrack._count
        self.kalman       = KalmanBoxFilter(bbox)
        self.bbox         = bbox.copy()
        self.conf         = conf
        self.conf_history = (resurrect_conf_history.copy()
                             if resurrect_conf_history else [conf])
        self.hits            = 1
        self.hit_streak      = 1
        self.age             = 0
        self.time_since_update = 0

    def predict(self):
        self.age += 1
        if self.time_since_update > 0:
            self.hit_streak = 0
        self.time_since_update += 1
        self.bbox = self.kalman.predict()

    def update(self, bbox, conf):
        self.bbox = self.kalman.update(bbox)
        self.conf = conf
        self.conf_history.append(conf)
        if len(self.conf_history) > 20:
            self.conf_history.pop(0)
        self.time_since_update = 0
        self.hits       += 1
        self.hit_streak += 1

    @property
    def centroid(self):
        b = self.bbox
        return (b[0]+b[2])/2.0, (b[1]+b[3])/2.0

    @property
    def mean_size(self):
        b = self.bbox
        return ((b[2]-b[0])+(b[3]-b[1]))/2.0


class ByteTracker:
    def __init__(self, max_age=60, min_hits=2, iou_threshold=0.15, hi_thresh=0.18):
        self.max_age        = max_age
        self.min_hits       = min_hits
        self.iou_threshold  = iou_threshold
        self.hi_thresh      = hi_thresh
        self.lo_thresh      = max(0.05, hi_thresh * 0.5)
        self.trackers:      List[STrack]         = []
        self.graveyard:     List[GraveyardEntry] = []
        self.frame_count    = 0
        self.confirmed_ids: Set[int]             = set()
        self.total_created  = 0

    @staticmethod
    def _iou_batch(a, b):
        a = np.expand_dims(np.asarray(a, dtype=np.float32), 1)
        b = np.expand_dims(np.asarray(b, dtype=np.float32), 0)
        xx1 = np.maximum(a[...,0], b[...,0])
        yy1 = np.maximum(a[...,1], b[...,1])
        xx2 = np.minimum(a[...,2], b[...,2])
        yy2 = np.minimum(a[...,3], b[...,3])
        inter = np.maximum(0, xx2-xx1) * np.maximum(0, yy2-yy1)
        aa = (a[...,2]-a[...,0]) * (a[...,3]-a[...,1])
        ab = (b[...,2]-b[...,0]) * (b[...,3]-b[...,1])
        return inter / (aa + ab - inter + 1e-6)

    def _associate(self, dets, trks, thresh):
        if len(trks) == 0 or len(dets) == 0:
            return (np.empty((0,2), dtype=int),
                    np.arange(len(dets)),
                    np.arange(len(trks)))
        iou = self._iou_batch(dets, trks)
        r, c = linear_sum_assignment(-iou)
        mr, mc = set(r), set(c)
        unm_d = [i for i in range(len(dets)) if i not in mr]
        unm_t = [j for j in range(len(trks)) if j not in mc]
        matched = []
        for ri, ci in zip(r, c):
            if iou[ri, ci] < thresh:
                unm_d.append(ri)
                unm_t.append(ci)
            else:
                matched.append([ri, ci])
        return (np.array(matched, dtype=int) if matched
                else np.empty((0,2), dtype=int),
                np.array(unm_d), np.array(unm_t))

    def _graveyard_match(self, cx, cy, det_size):
        best, best_d = None, float("inf")
        for entry in self.graveyard:
            dist   = np.hypot(cx-entry.cx, cy-entry.cy)
            thresh = REID_DIST_SCALE * max(det_size, entry.mean_size)
            if dist < thresh and dist < best_d:
                best, best_d = entry, dist
        return best

    def _active_too_close(self, cx, cy):
        for t in self.trackers:
            tx, ty = t.centroid
            if np.hypot(cx-tx, cy-ty) < MIN_SPAWN_DIST:
                return True
        return False

    def _prune_graveyard(self):
        cutoff = self.frame_count - REID_FRAMES
        self.graveyard = [e for e in self.graveyard if e.died_frame >= cutoff]

    def update(self, dets):
        self.frame_count += 1
        self._prune_graveyard()
        if len(dets) == 0:
            dets = np.empty((0, 5))

        hi = dets[dets[:,4] >= self.hi_thresh] if len(dets) else np.empty((0,5))
        lo = (dets[(dets[:,4] >= self.lo_thresh) & (dets[:,4] < self.hi_thresh)]
              if len(dets) else np.empty((0,5)))

        for t in self.trackers:
            t.predict()
        trk_boxes = (np.array([t.bbox for t in self.trackers])
                     if self.trackers else np.empty((0,4)))

        # Pass 1 — high-conf vs all tracks
        m1, unm_hi, unm_t = self._associate(
            hi[:,:4] if len(hi) else np.empty((0,4)),
            trk_boxes, self.iou_threshold)
        for ri, ti in m1:
            self.trackers[ti].update(hi[ri,:4], hi[ri,4])

        # Pass 2 — low-conf vs unmatched tracks
        if len(lo) and len(unm_t):
            m2, _, _ = self._associate(
                lo[:,:4],
                np.array([self.trackers[i].bbox for i in unm_t]),
                0.5)
            for ri, ti_idx in m2:
                self.trackers[unm_t[ti_idx]].update(lo[ri,:4], lo[ri,4])

        # Spawn / ReID from unmatched high-conf detections
        for i in unm_hi:
            bbox     = hi[i,:4]
            conf     = hi[i,4]
            cx       = (bbox[0]+bbox[2])/2.0
            cy       = (bbox[1]+bbox[3])/2.0
            det_size = ((bbox[2]-bbox[0])+(bbox[3]-bbox[1]))/2.0

            if self._active_too_close(cx, cy):
                continue

            entry = self._graveyard_match(cx, cy, det_size)
            if entry is not None:
                t = STrack(bbox, conf,
                           resurrect_id=entry.track_id,
                           resurrect_conf_history=entry.conf_history)
                t.hits = self.min_hits
                t.hit_streak = self.min_hits
                self.graveyard.remove(entry)
                self.trackers.append(t)
            else:
                t = STrack(bbox, conf)
                self.trackers.append(t)
                self.total_created += 1

        # Build output + graveyard
        ret, to_del = [], []
        for i, t in enumerate(self.trackers):
            if t.hit_streak >= self.min_hits:
                self.confirmed_ids.add(t.id)
            is_confirmed  = t.id in self.confirmed_ids
            within_coast  = t.time_since_update <= COAST_FRAMES
            just_active   = t.time_since_update < 1
            early_frame   = self.frame_count <= self.min_hits
            if ((is_confirmed and within_coast) or
                    (just_active and
                     (t.hit_streak >= self.min_hits or early_frame))):
                ret.append(np.array([
                    *t.bbox, t.id,
                    float(np.mean(t.conf_history)),
                    1 if is_confirmed else 0
                ]))
            if t.time_since_update > self.max_age:
                if is_confirmed:
                    gx, gy = t.centroid
                    self.graveyard.append(GraveyardEntry(
                        track_id=t.id, cx=gx, cy=gy,
                        mean_size=t.mean_size,
                        died_frame=self.frame_count,
                        conf_history=t.conf_history.copy()))
                to_del.append(i)
        for i in reversed(to_del):
            self.trackers.pop(i)

        return np.array(ret) if ret else np.empty((0, 7))

    def stats(self):
        return {
            "unique":    len(self.confirmed_ids),
            "active":    sum(1 for t in self.trackers
                             if t.time_since_update < 1),
            "total":     self.total_created,
            "graveyard": len(self.graveyard),
        }
