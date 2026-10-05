"""
modules/blackbuck/detection_enhancer.py  (v5 — detection & tracking fixed)

Critical fixes applied
───────────────────────
FIX-DET-1  scale=1.0 now uses the TILED GRID (_make_tiles) not zoom_crops.
           zoom_crops(scale=1.0) was generating 1 full-frame crop at 1920×1080
           which gets letterboxed to 640px by Ultralytics — box coordinates stay
           correct but many animals near tile edges were being dropped by edge_buf.
           Tiled grid crops are small (640px native) — no letterbox distortion.

FIX-DET-2  conf_floor lowered to 0.10 (was 0.15).
           Blackbuck detections at range score 0.12-0.25 typically.
           The calib+NMS pipeline filters noise downstream.

FIX-DET-3  edge_buf reduced to 4 in the enhancer filter pass.
           The 10px buf was clipping valid animals at tile boundaries.
           Worker's edge_buf still applies for final output.

FIX-DET-4  min_area reduced to 80 in the enhancer raw pass.
           Distant animals can be as small as 10×10px = 100px².
           Final min_area from cfg (200) still applied after NMS.

FIX-DET-5  morph_enabled=True by default — recovers fragmented animals
           in tall grass. Kernel=7 bridges 7px gaps from occlusion.

FIX-DET-6  CLAHE enabled by default — critical for dawn/dusk shots
           and dry-season low-contrast stubble backgrounds.
"""
from __future__ import annotations

import threading
from typing import List, Optional, Tuple

import cv2
import numpy as np


_ENHANCER_DEFAULTS: dict = {
    "clahe_enabled":       True,
    "clahe_clip":          2.5,
    "clahe_tile":          8,
    "scales":              [1.0, 1.5],
    "scale_conf_floor":    0.10,
    "zoom_skip_threshold": 999999,
    "ensemble_enabled":    False,
    "ensemble_model_path": "",
    "ensemble_lo_thresh":  0.18,
    "ensemble_hi_thresh":  0.45,
    "morph_enabled":       True,
    "morph_kernel":        7,
    "morph_area_floor":    0.4,
    "calib_enabled":       True,
    "calib_edge_margin":   80,
    "calib_boost":         0.10,
    "calib_dark_thresh":   110,
}


def _nms(boxes: np.ndarray, scores: np.ndarray, iou_thresh: float) -> np.ndarray:
    if len(boxes) == 0:
        return np.array([], dtype=int)
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]
    keep  = []
    while order.size:
        i = order[0]
        keep.append(i)
        if order.size == 1:
            break
        ix1   = np.maximum(x1[i], x1[order[1:]])
        iy1   = np.maximum(y1[i], y1[order[1:]])
        ix2   = np.minimum(x2[i], x2[order[1:]])
        iy2   = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, ix2 - ix1) * np.maximum(0, iy2 - iy1)
        iou   = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
        order = order[1:][iou < iou_thresh]
    return np.array(keep, dtype=int)


def _make_tiles(H: int, W: int,
                grid_rows: int, grid_cols: int,
                overlap: float) -> List[Tuple[int, int, int, int]]:
    """Identical to worker._make_tiles — used for scale=1.0 pass."""
    tiles  = []
    step_y = H / grid_rows
    step_x = W / grid_cols
    pad_y  = int(step_y * overlap)
    pad_x  = int(step_x * overlap)
    for row in range(grid_rows):
        for col in range(grid_cols):
            x1 = max(0, int(col * step_x) - pad_x)
            y1 = max(0, int(row * step_y) - pad_y)
            x2 = min(W, int((col + 1) * step_x) + pad_x)
            y2 = min(H, int((row + 1) * step_y) + pad_y)
            tiles.append((x1, y1, x2, y2))
    return tiles


def _zoom_crops(H: int, W: int,
                scale: float) -> List[Tuple[int, int, int, int]]:
    """50%-overlap zoom crops for scale > 1.0."""
    crop_h   = int(H / scale)
    crop_w   = int(W / scale)
    stride_h = max(1, int(crop_h * 0.50))
    stride_w = max(1, int(crop_w * 0.50))
    crops = []
    y = 0
    while y < H:
        x = 0
        while x < W:
            x2 = min(W, x + crop_w)
            y2 = min(H, y + crop_h)
            x1 = max(0, x2 - crop_w)
            y1 = max(0, y2 - crop_h)
            crops.append((x1, y1, x2, y2))
            if x2 == W:
                break
            x += stride_w
        if y2 == H:
            break
        y += stride_h
    return list(dict.fromkeys(crops))


class CLAHEPreprocessor:
    def __init__(self, clip_limit: float = 2.5, tile_grid: int = 8):
        self._clahe = cv2.createCLAHE(
            clipLimit=clip_limit,
            tileGridSize=(tile_grid, tile_grid))

    def __call__(self, bgr: np.ndarray) -> np.ndarray:
        lab        = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
        l, a, b    = cv2.split(lab)
        l_enhanced = self._clahe.apply(l)
        return cv2.cvtColor(cv2.merge([l_enhanced, a, b]), cv2.COLOR_LAB2BGR)


class EnsembleRescuer:
    def __init__(self, lo_thresh: float, hi_thresh: float):
        self.lo_thresh   = lo_thresh
        self.hi_thresh   = hi_thresh
        self._model      = None
        self._model_lock = threading.Lock()

    def load(self, model_path: str) -> bool:
        if not model_path:
            return False
        try:
            from ultralytics import YOLO
            import torch
            with self._model_lock:
                self._model = YOLO(model_path)
                if not model_path.strip().lower().endswith(".engine"):
                    self._model.to("cuda" if torch.cuda.is_available() else "cpu")
            return True
        except Exception as exc:
            print(f"[EnsembleRescuer] load failed: {exc}")
            return False

    @property
    def available(self) -> bool:
        return self._model is not None

    def rescue(self, crop_bgr: np.ndarray, primary_score: float,
               tile_size: int = 640) -> float:
        if not self.available or primary_score >= self.hi_thresh:
            return primary_score
        if primary_score < self.lo_thresh:
            return 0.0
        with self._model_lock:
            results = self._model([crop_bgr], conf=self.lo_thresh * 0.8,
                                  imgsz=tile_size, verbose=False)
        secondary_score = 0.0
        ch, cw = crop_bgr.shape[:2]
        for res in results:
            if res.boxes is None or len(res.boxes) == 0:
                continue
            xyxy  = res.boxes.xyxy.cpu().numpy()
            confs = res.boxes.conf.cpu().numpy()
            for i in range(len(xyxy)):
                sc = float(confs[i])
                bx1, by1, bx2, by2 = xyxy[i]
                coverage = ((bx2-bx1)*(by2-by1)) / (cw*ch+1e-6)
                if coverage > 0.20 and sc > secondary_score:
                    secondary_score = sc
        if secondary_score < self.lo_thresh * 0.8:
            return 0.0
        return 0.40 * primary_score + 0.60 * secondary_score


class MorphologicalRecovery:
    def __init__(self, kernel_size: int = 7, area_floor_frac: float = 0.4):
        self.kernel_size     = kernel_size
        self.area_floor_frac = area_floor_frac
        self._kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))

    def recover(self, raw_boxes, raw_scores, kept_boxes,
                H, W, min_area, min_aspect, max_aspect, conf_floor) -> List:
        if len(raw_boxes) == 0:
            return []
        mask = np.zeros((H, W), dtype=np.uint8)
        for (x1, y1, x2, y2), score in zip(raw_boxes, raw_scores):
            if score < conf_floor * 0.4:
                continue
            cv2.rectangle(mask, (int(x1), int(y1)), (int(x2), int(y2)), 255, -1)
        if mask.sum() == 0:
            return []
        closed   = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, self._kernel, iterations=2)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL,
                                       cv2.CHAIN_APPROX_SIMPLE)
        kept_arr   = np.array(kept_boxes, dtype=np.float32) if kept_boxes else None
        area_floor = min_area * self.area_floor_frac
        candidates = []
        for cnt in contours:
            bx, by, bw, bh = cv2.boundingRect(cnt)
            area   = bw * bh
            aspect = bh / (bw + 1e-6)
            if area < area_floor:
                continue
            if not (min_aspect * 0.7 < aspect < max_aspect * 1.3):
                continue
            if kept_arr is not None and len(kept_arr):
                ix1 = np.maximum(kept_arr[:, 0], bx)
                iy1 = np.maximum(kept_arr[:, 1], by)
                ix2 = np.minimum(kept_arr[:, 2], bx + bw)
                iy2 = np.minimum(kept_arr[:, 3], by + bh)
                inter    = np.maximum(0, ix2-ix1) * np.maximum(0, iy2-iy1)
                if (inter / (area + 1e-6)).max() > 0.5:
                    continue
            region_scores = [
                rscore for (rx1,ry1,rx2,ry2), rscore in zip(raw_boxes, raw_scores)
                if max(rx1,bx) < min(rx2,bx+bw) and max(ry1,by) < min(ry2,by+bh)
            ]
            if not region_scores:
                continue
            synth_conf = float(np.mean(region_scores))
            if synth_conf < conf_floor * 0.4:
                continue
            candidates.append([float(bx), float(by),
                                float(bx+bw), float(by+bh), synth_conf])
        return candidates


class ConfidenceCalibrator:
    def __init__(self, edge_margin=80, boost=0.10, dark_thresh=110,
                 lo_thresh=0.10, hi_thresh=0.45):
        self.edge_margin = edge_margin
        self.boost       = boost
        self.dark_thresh = dark_thresh
        self.lo_thresh   = lo_thresh
        self.hi_thresh   = hi_thresh

    def _crop_stats(self, bgr, x1, y1, x2, y2):
        H, W  = bgr.shape[:2]
        patch = bgr[max(0,y1):min(H,y2), max(0,x1):min(W,x2)]
        if patch.size == 0:
            return 128.0, 100.0
        gray_p = cv2.cvtColor(patch, cv2.COLOR_BGR2GRAY).astype(np.float32)
        mean_l = float(gray_p.mean())
        bg = bgr[max(0,y1-20):min(H,y2+20), max(0,x1-20):min(W,x2+20)]
        bg_var = float(cv2.cvtColor(bg, cv2.COLOR_BGR2GRAY).astype(np.float32).var())
        return mean_l, bg_var

    def calibrate(self, det, bgr, H, W) -> float:
        x1, y1, x2, y2, conf = det
        if conf >= self.hi_thresh:
            return conf
        cx, cy = (x1+x2)/2.0, (y1+y2)/2.0
        mean_l, bg_var = self._crop_stats(bgr, int(x1), int(y1), int(x2), int(y2))
        adj = 0.0
        if (cx < self.edge_margin or cx > W-self.edge_margin or
                cy < self.edge_margin or cy > H-self.edge_margin):
            adj += self.boost
        if mean_l < self.dark_thresh:
            adj += self.boost * 0.75
        if bg_var < 50.0 and conf < self.lo_thresh:
            adj -= self.boost * 0.5
        return min(1.0, max(0.0, conf + adj))


class DetectionEnhancer:
    """
    Two-pass detection pipeline.

    Pass 1 — Tiled grid at scale=1.0:
      Uses _make_tiles() — same grid as worker._run_tiled.
      Each tile is ~640px native, no letterbox distortion.
      Ensures full spatial coverage of the frame.

    Pass 2 — Zoom crops at scale > 1.0 (e.g. 1.5×):
      _zoom_crops() generates 4 overlapping crops at higher zoom.
      Catches small/distant animals missed at native resolution.
      Skipped when Pass 1 detects > zoom_skip_threshold animals.

    Both passes batched into minimal engine calls.
    """

    def __init__(self, cfg: dict):
        self.cfg  = cfg
        self._ec  = {**_ENHANCER_DEFAULTS, **cfg.get("enhancer", {})}
        self._primary_model = None
        self._device        = "cuda" if __import__("torch").cuda.is_available() else "cpu"

        self._clahe = (
            CLAHEPreprocessor(self._ec["clahe_clip"], self._ec["clahe_tile"])
            if self._ec["clahe_enabled"] else None
        )
        self._ensemble = (
            EnsembleRescuer(self._ec["ensemble_lo_thresh"],
                            self._ec["ensemble_hi_thresh"])
            if self._ec["ensemble_enabled"] else None
        )
        self._morph = (
            MorphologicalRecovery(self._ec["morph_kernel"],
                                  self._ec["morph_area_floor"])
            if self._ec["morph_enabled"] else None
        )
        self._calib = (
            ConfidenceCalibrator(
                edge_margin = self._ec["calib_edge_margin"],
                boost       = self._ec["calib_boost"],
                dark_thresh = self._ec["calib_dark_thresh"],
                lo_thresh   = self._ec["scale_conf_floor"],
                hi_thresh   = self._ec["ensemble_hi_thresh"],
            )
            if self._ec["calib_enabled"] else None
        )

        tc = cfg.get("tiling", {})
        self._grid_rows  = tc.get("grid_rows", 2)
        self._grid_cols  = tc.get("grid_cols", 2)
        self._overlap    = tc.get("overlap",   0.20)
        self._tile_size  = tc.get("tile_size", 640)
        self._nms_iou    = tc.get("nms_iou",   0.40)

        self._zoom_scales = [s for s in self._ec["scales"] if s > 1.0]
        raw_skip = self._ec.get("zoom_skip_threshold", 999999)
        self._zoom_skip = int(raw_skip) if raw_skip is not None else 999999

    def set_models(self, primary_model,
                   secondary_model_path: str = "",
                   device: str = "cuda") -> None:
        self._primary_model = primary_model
        self._device        = device
        if (self._ensemble is not None and secondary_model_path
                and not self._ensemble.available):
            self._ensemble.load(secondary_model_path)

    def _infer_batch(self, crops: List, offsets: List,
                     conf_floor: float, iou_thresh: float) -> Tuple[List, List]:
        """Single batched engine call. device= NOT passed (FIX-1)."""
        if not crops:
            return [], []
        try:
            results = self._primary_model(
                crops,
                conf    = conf_floor,
                iou     = iou_thresh,
                imgsz   = self._tile_size,
                verbose = False,
            )
        except Exception as exc:
            import traceback as _tb
            print(f"[DetectionEnhancer] inference error: {exc}")
            _tb.print_exc()
            return [], []

        all_boxes:  List = []
        all_scores: List = []
        for res, (ox, oy) in zip(results, offsets):
            if res.boxes is None or len(res.boxes) == 0:
                continue
            xyxy  = res.boxes.xyxy.cpu().numpy()   # batched pull (FIX-2)
            confs = res.boxes.conf.cpu().numpy()
            for i in range(len(xyxy)):
                sc = float(confs[i])
                if sc < conf_floor:
                    continue
                lx1, ly1, lx2, ly2 = xyxy[i]
                all_boxes.append([lx1+ox, ly1+oy, lx2+ox, ly2+oy])
                all_scores.append(sc)
        return all_boxes, all_scores

    def run(self, frame: np.ndarray, H: int, W: int) -> List:
        assert self._primary_model is not None, "Call set_models() before run()"

        cfg        = self.cfg
        conf_floor = self._ec["scale_conf_floor"]   # 0.10 — wide net
        conf_main  = cfg["confidence"]               # 0.18 — final threshold
        iou_thresh = cfg["iou"]
        eb         = cfg.get("edge_buf", 10)
        min_area   = cfg.get("min_area",   200)
        min_asp    = cfg.get("min_aspect", 0.35)
        max_asp    = cfg.get("max_aspect", 3.5)

        # FIX-DET-6: CLAHE once on full frame
        enhanced = self._clahe(frame) if self._clahe else frame

        all_raw_boxes:  List = []
        all_raw_scores: List = []

        # ── PASS 1: Tiled grid (scale=1.0) ────────────────────────────────────
        # FIX-DET-1: Use _make_tiles not zoom_crops for scale=1.0.
        # Tiles are small (~640px) — no letterbox distortion, no coord shift.
        tile_coords = _make_tiles(H, W, self._grid_rows,
                                  self._grid_cols, self._overlap)
        p1_crops, p1_offsets = [], []
        for (tx1, ty1, tx2, ty2) in tile_coords:
            crop = enhanced[ty1:ty2, tx1:tx2]
            if crop.size == 0:
                continue
            p1_crops.append(crop)
            p1_offsets.append((tx1, ty1))

        boxes1, scores1 = self._infer_batch(p1_crops, p1_offsets,
                                            conf_floor, iou_thresh)
        all_raw_boxes.extend(boxes1)
        all_raw_scores.extend(scores1)

        # ── PASS 2: Zoom crops (scale > 1.0) ──────────────────────────────────
        # Skip if Pass 1 already found enough animals (dense herd)
        if self._zoom_scales and len(boxes1) <= self._zoom_skip:
            p2_crops, p2_offsets = [], []
            for scale in self._zoom_scales:
                for (cx1, cy1, cx2, cy2) in _zoom_crops(H, W, scale):
                    crop = enhanced[cy1:cy2, cx1:cx2]
                    if crop.size == 0:
                        continue
                    p2_crops.append(crop)
                    p2_offsets.append((cx1, cy1))
            boxes2, scores2 = self._infer_batch(p2_crops, p2_offsets,
                                                conf_floor, iou_thresh)
            all_raw_boxes.extend(boxes2)
            all_raw_scores.extend(scores2)

        if not all_raw_boxes:
            return []

        raw_boxes_arr  = np.array(all_raw_boxes,  dtype=np.float32)
        raw_scores_arr = np.array(all_raw_scores, dtype=np.float32)

        # Cross-tile NMS
        keep = _nms(raw_boxes_arr, raw_scores_arr, self._nms_iou)
        raw_boxes_arr  = raw_boxes_arr[keep]
        raw_scores_arr = raw_scores_arr[keep]

        # ── Ensemble rescue ────────────────────────────────────────────────────
        if self._ensemble is not None and self._ensemble.available:
            calibrated = []
            for (x1, y1, x2, y2), score in zip(raw_boxes_arr, raw_scores_arr):
                if self._ec["ensemble_lo_thresh"] <= score < self._ec["ensemble_hi_thresh"]:
                    pad_x = int((x2-x1)*0.20);  pad_y = int((y2-y1)*0.20)
                    cx1e = max(0,int(x1)-pad_x); cy1e = max(0,int(y1)-pad_y)
                    cx2e = min(W,int(x2)+pad_x); cy2e = min(H,int(y2)+pad_y)
                    score = self._ensemble.rescue(enhanced[cy1e:cy2e, cx1e:cx2e],
                                                  score, self._tile_size)
                calibrated.append(score)
            raw_scores_arr = np.array(calibrated, dtype=np.float32)

        # ── Confidence threshold + geometric filter ────────────────────────────
        # FIX-DET-3: Use eb=4 here (not cfg edge_buf=10).
        # Tile-boundary animals appear near tile edges — eb=10 was dropping them.
        inner_eb = 4
        kept_dets: List = []
        for i in range(len(raw_boxes_arr)):
            x1, y1, x2, y2 = raw_boxes_arr[i]
            conf = raw_scores_arr[i]
            if conf < conf_main:
                continue
            bw, bh = x2-x1, y2-y1
            # FIX-DET-4: use 80 as inner min_area (cfg min_area applied later)
            if bw*bh < 80:
                continue
            aspect = bh / (bw + 1e-6)
            if not (min_asp * 0.7 < aspect < max_asp * 1.3):
                continue
            if x1 < inner_eb or y1 < inner_eb or x2 > W-inner_eb or y2 > H-inner_eb:
                continue
            kept_dets.append([x1, y1, x2, y2, conf])

        # ── Morphological recovery ─────────────────────────────────────────────
        if self._morph is not None:
            for cand in self._morph.recover(
                    raw_boxes_arr, raw_scores_arr, kept_dets,
                    H, W, min_area, min_asp, max_asp, conf_main):
                x1, y1, x2, y2, conf = cand
                if (x2-x1)*(y2-y1) < 80:
                    continue
                kept_dets.append(cand)

        # ── Confidence calibration ─────────────────────────────────────────────
        if self._calib is not None:
            for det in kept_dets:
                det[4] = self._calib.calibrate(det, frame, H, W)

        # ── Final filter: apply cfg thresholds (min_area, edge_buf) ───────────
        final_dets: List = []
        for det in kept_dets:
            x1, y1, x2, y2, conf = det
            bw, bh = x2-x1, y2-y1
            if bw*bh < min_area:
                continue
            if x1 < eb or y1 < eb or x2 > W-eb or y2 > H-eb:
                continue
            final_dets.append(det)

        # Final dedup NMS
        if len(final_dets) > 1:
            kd   = np.array(final_dets, dtype=np.float32)
            keep = _nms(kd[:, :4], kd[:, 4], self._nms_iou)
            final_dets = [final_dets[i] for i in keep]

        return final_dets
