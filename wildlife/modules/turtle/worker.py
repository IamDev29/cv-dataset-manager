"""
modules/turtle/worker.py  -  Olive Ridley Turtle QThread worker.
Tiled YOLO inference + Kalman tracking + dual-line counting zone.

Performance additions
──────────────────────
• cudnn.benchmark = True       — auto-tunes CUDA kernels after warmup
• cudnn.deterministic = False  — allows faster non-deterministic paths
• Batched tile inference       — all tiles sent in one model.predict() call
• Warmup run                   — pre-compiles CUDA kernels before first frame
• Adaptive imgsz               — auto-selects based on available VRAM
• Device label in HUD          — shows GPU FP32 / CPU live on screen

Fixes applied (v2)
──────────────────
• FIX 1 (critical): device= removed from ALL model.predict() calls including
  warmup. Was triggering AutoBackend re-initialisation every single frame,
  causing 0% GPU utilisation. model.to(device) at load time is sufficient.

• FIX 2 (performance): Per-box .cpu() call inside the tile result loop
  replaced with a single batched tensor pull (res.boxes.xyxy.cpu().numpy()
  + res.boxes.conf.cpu().numpy()) outside any inner loop. This reduces
  GPU→CPU transfers from N-per-frame to 1-per-tile-result.

• FIX 3 (stability): VRAM threshold raised from >=4 to >=5 for the 960
  imgsz branch. GTX 1650 reports exactly 4.0 GB; the old threshold pushed
  it into a 960 imgsz that caused silent OOM / swap, producing very low FPS.
  Cards with 3–5 GB now use imgsz=640.
"""
from __future__ import annotations

import os
import time
import traceback
from pathlib import Path

import cv2
import numpy as np
import torch
from ultralytics import YOLO
from PyQt5.QtCore import QThread, pyqtSignal

from core.path_helper import resource_path

# ── cudnn tuning — set BEFORE any CUDA kernel is launched ────────────────────
torch.backends.cudnn.benchmark     = True
torch.backends.cudnn.deterministic = False
# ─────────────────────────────────────────────────────────────────────────────


def _resolve(path: str) -> str:
    return path if (path and os.path.isabs(path)) else resource_path(path)


def _gpu_memory_gb() -> float:
    try:
        return torch.cuda.get_device_properties(0).total_memory / 1e9
    except Exception:
        return 0.0


class TurtleWorker(QThread):

    frame_ready = pyqtSignal(object, object)
    progress    = pyqtSignal(int, int)
    finished    = pyqtSignal(object)
    error       = pyqtSignal(str)

    def __init__(self, cfg, parent=None):
        super().__init__(parent)
        self.cfg   = cfg
        self._stop = False

    def stop(self):
        self._stop = True

    # ── Static helpers ────────────────────────────────────────────

    @staticmethod
    def _nms(boxes, scores, thr):
        if not boxes:
            return []
        b     = np.array(boxes, dtype=np.float32)
        s     = np.array(scores, dtype=np.float32)
        x1, y1, x2, y2 = b[:, 0], b[:, 1], b[:, 2], b[:, 3]
        areas = (x2 - x1) * (y2 - y1)
        order = s.argsort()[::-1]
        keep  = []
        while order.size:
            i = order[0]
            keep.append(i)
            xx1   = np.maximum(x1[i], x1[order[1:]])
            yy1   = np.maximum(y1[i], y1[order[1:]])
            xx2   = np.minimum(x2[i], x2[order[1:]])
            yy2   = np.minimum(y2[i], y2[order[1:]])
            inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
            iov   = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
            order = order[np.where(iov <= thr)[0] + 1]
        return keep

    @staticmethod
    def _dedup(boxes, scores, dist):
        if not boxes:
            return []
        b     = np.array(boxes, dtype=np.float32)
        s     = np.array(scores, dtype=np.float32)
        cx    = (b[:, 0] + b[:, 2]) / 2
        cy    = (b[:, 1] + b[:, 3]) / 2
        order = s.argsort()[::-1]
        supp  = set()
        keep  = []
        for i in order:
            if i in supp:
                continue
            keep.append(int(i))
            d = np.sqrt((cx - cx[i]) ** 2 + (cy - cy[i]) ** 2)
            for j in order:
                if j != i and j not in supp and d[j] < dist:
                    supp.add(j)
        return keep

    @staticmethod
    def _iou_matrix(ba, bb):
        if not ba or not bb:
            return np.zeros((len(ba), len(bb)))
        a  = np.array(ba, dtype=np.float32)
        b  = np.array(bb, dtype=np.float32)
        aa = (a[:, 2] - a[:, 0]) * (a[:, 3] - a[:, 1])
        ab = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
        M  = np.zeros((len(a), len(b)), dtype=np.float32)
        for i, ai in enumerate(a):
            inter = (
                np.maximum(0, np.minimum(ai[2], b[:, 2]) - np.maximum(ai[0], b[:, 0])) *
                np.maximum(0, np.minimum(ai[3], b[:, 3]) - np.maximum(ai[1], b[:, 1]))
            )
            M[i] = inter / (aa[i] + ab - inter + 1e-6)
        return M

    @staticmethod
    def _greedy(M, mn=0.3):
        res, ut, ud = [], set(), set()
        flat = np.dstack(np.unravel_index(np.argsort(-M, axis=None), M.shape))[0]
        for t, d in flat:
            if M[t, d] < mn:
                break
            if t in ut or d in ud:
                continue
            res.append((t, d))
            ut.add(t)
            ud.add(d)
        return res

    @staticmethod
    def _box_valid(w, h, cfg):
        if w < cfg["min_w"] or h < cfg["min_h"]:
            return False
        if w > cfg["max_w"] or h > cfg["max_h"]:
            return False
        asp = w / (h + 1e-6)
        return cfg["min_aspect"] <= asp <= cfg["max_aspect"]

    # ── Main thread ───────────────────────────────────────────────

    def run(self):
        cfg = self.cfg
        try:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            mem_gb = _gpu_memory_gb()

            # ── Adaptive imgsz based on available VRAM ────────────────────────
            # FIX 3: Raised >=4 threshold to >=5 so that GTX 1650 (exactly 4 GB)
            # correctly falls into the 640 branch instead of 960, preventing
            # silent OOM / swap that was causing very low FPS.
            base_imgsz = max(cfg["tile_h"], cfg["tile_w"])
            if device == "cuda":
                if mem_gb >= 8:
                    imgsz = base_imgsz
                elif mem_gb >= 5:
                    imgsz = min(base_imgsz, 960)
                elif mem_gb >= 3:
                    imgsz = min(base_imgsz, 640)
                else:
                    imgsz = min(base_imgsz, 480)
            else:
                imgsz = min(base_imgsz, 640)

            if device == "cuda":
                gpu_name = torch.cuda.get_device_name(0)
                print(f"[Turtle] CUDA device: {gpu_name}  VRAM={mem_gb:.1f}GB  imgsz={imgsz}")
            else:
                print(f"[Turtle] device=CPU  imgsz={imgsz}")

            # ── Load model ────────────────────────────────────────────────────
            model_path = _resolve(cfg["model_path"])
            model      = YOLO(model_path)
            # model.to(device) is the correct way to place the model once.
            # After this, do NOT pass device= to model.predict() — doing so
            # triggers AutoBackend re-initialisation on every call (FIX 1).
            model.to(device)

            if device == "cuda":
                alloc_mb = torch.cuda.memory_allocated(0) / 1e6
                print(f"[Turtle] Model loaded → NVIDIA VRAM used: {alloc_mb:.0f} MB")

            # ── Warmup — pre-compile CUDA kernels before first real frame ─────
            # FIX 1: device= removed from this predict call. The model is
            # already on the correct device via model.to(device) above.
            dummy = [np.full((cfg["tile_h"], cfg["tile_w"], 3), 114, dtype=np.uint8)]
            try:
                model.predict(source=dummy, imgsz=imgsz, verbose=False)
                if device == "cuda":
                    alloc_mb = torch.cuda.memory_allocated(0) / 1e6
                    print(f"[Turtle] Warmup done → NVIDIA VRAM used: {alloc_mb:.0f} MB")
            except Exception as warmup_err:
                print(f"[Turtle] Warmup skipped ({warmup_err})")

            # ── Kalman box tracker (inline) ───────────────────────────────────
            kal_count = [0]

            class KBox:
                def __init__(s, bbox):
                    kal_count[0] += 1
                    s.id       = kal_count[0]
                    s.hits     = 1
                    s.no_match = 0
                    s.age      = 1
                    cx = (bbox[0] + bbox[2]) / 2
                    cy = (bbox[1] + bbox[3]) / 2
                    w  = bbox[2] - bbox[0]
                    h  = bbox[3] - bbox[1]
                    s.x = np.array([cx, cy, w, h, 0, 0, 0, 0], dtype=np.float32)
                    s.F = np.eye(8, dtype=np.float32)
                    for i in range(4):
                        s.F[i, i + 4] = 1.0
                    s.H = np.eye(4, 8, dtype=np.float32)
                    s.P = np.diag([10, 10, 10, 10, 1e4, 1e4, 1e4, 1e4]).astype(np.float32)
                    s.Q = np.diag([1, 1, 1, 1, .01, .01, .01, .01]).astype(np.float32)
                    s.R = np.diag([1, 1, 10, 10]).astype(np.float32)

                def predict(s):
                    s.x        = s.F @ s.x
                    s.P        = s.F @ s.P @ s.F.T + s.Q
                    s.age      += 1
                    s.no_match += 1

                def update(s, bbox):
                    cx = (bbox[0] + bbox[2]) / 2
                    cy = (bbox[1] + bbox[3]) / 2
                    w  = bbox[2] - bbox[0]
                    h  = bbox[3] - bbox[1]
                    z  = np.array([cx, cy, w, h], dtype=np.float32)
                    y  = z - s.H @ s.x
                    S2 = s.H @ s.P @ s.H.T + s.R
                    K  = s.P @ s.H.T @ np.linalg.inv(S2)
                    s.x        = s.x + K @ y
                    s.P        = (np.eye(8) - K @ s.H) @ s.P
                    s.hits     += 1
                    s.no_match  = 0

                def box(s):
                    cx, cy, w, h = s.x[:4]
                    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]

                def centre(s):
                    return float(s.x[0]), float(s.x[1])

            tracks      = []
            all_ids     = set()
            track_state = {}
            entered     = 0
            exited      = 0
            in_zone     = set()

            cap   = cv2.VideoCapture(cfg["video_path"])
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps_v = cap.get(cv2.CAP_PROP_FPS)
            VW    = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            VH    = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

            line1_y = int(cfg["line1_frac"] * VH)
            line2_y = int(cfg["line2_frac"] * VH)
            z_top   = min(line1_y, line2_y)
            z_bot   = max(line1_y, line2_y)

            writer = None
            if cfg.get("save_video") and cfg.get("output_dir"):
                out_p  = str(Path(cfg["output_dir"]) /
                             ("turtle_" + Path(cfg["video_path"]).stem + ".mp4"))
                writer = cv2.VideoWriter(
                    out_p, cv2.VideoWriter_fourcc(*"mp4v"), fps_v, (VW, VH))

            frame_num = 0
            _pal      = {}
            dev_lbl   = "GPU FP32" if device == "cuda" else "CPU"
            fps_time  = time.time()
            live_fps  = 0.0

            while not self._stop:
                ret, frame = cap.read()
                if not ret:
                    break
                frame_num += 1
                H2, W2    = frame.shape[:2]

                # Live FPS
                now      = time.time()
                elapsed  = now - fps_time
                live_fps = 1.0 / elapsed if elapsed > 0 else 0.0
                fps_time = now

                tw, th    = cfg["tile_w"], cfg["tile_h"]
                tw = min(tw, W2)
                th = min(th, H2)
                sx = max(1, int(tw * (1.0 - cfg["overlap"])))
                sy = max(1, int(th * (1.0 - cfg["overlap"])))

                tiles, coords = [], []
                y = 0
                while True:
                    y_clamped = min(y, H2 - th)
                    x = 0
                    while True:
                        x_clamped = min(x, W2 - tw)
                        tile = frame[y_clamped:y_clamped + th,
                                     x_clamped:x_clamped + tw].copy()
                        tiles.append(tile)
                        coords.append((x_clamped, y_clamped))
                        if x_clamped + tw >= W2:
                            break
                        x += sx
                    if y_clamped + th >= H2:
                        break
                    y += sy

                # FIX 1: device= removed from this predict call.
                # model.to(device) at load time is sufficient.
                # Passing device= here triggers AutoBackend re-init every frame.
                results = model.predict(
                    source=tiles, conf=cfg["conf"], iou=cfg["iou"],
                    imgsz=imgsz, verbose=False)

                ab, as_ = [], []
                for res, (tx, ty) in zip(results, coords):
                    if res.boxes is None or len(res.boxes) == 0:
                        continue
                    # FIX 2: Single batched tensor pull instead of per-box .cpu() calls.
                    # Previously: for box in res.boxes: box.xyxy[0].cpu().numpy()
                    # Now: pull the entire (N,4) tensor in one GPU→CPU transfer.
                    xyxy  = res.boxes.xyxy.cpu().numpy()   # shape (N, 4)
                    confs = res.boxes.conf.cpu().numpy()   # shape (N,)
                    for i in range(len(xyxy)):
                        bx1, by1, bx2, by2 = xyxy[i]
                        bw = bx2 - bx1
                        bh = by2 - by1
                        if not self._box_valid(bw, bh, cfg):
                            continue
                        fx1 = float(np.clip(bx1 + tx, 0, W2))
                        fy1 = float(np.clip(by1 + ty, 0, H2))
                        fx2 = float(np.clip(bx2 + tx, 0, W2))
                        fy2 = float(np.clip(by2 + ty, 0, H2))
                        fw  = fx2 - fx1
                        fh  = fy2 - fy1
                        if fw < 2 or fh < 2:
                            continue
                        ab.append([fx1, fy1, fx2, fy2])
                        as_.append(float(confs[i]))

                raw_dets = []
                if ab:
                    keep = self._nms(ab, as_, cfg["iou"])
                    kb   = [ab[i] for i in keep]
                    ks   = [as_[i] for i in keep]
                    dd   = self._dedup(kb, ks, cfg["dedup"])
                    for i in dd:
                        raw_dets.append({"box": kb[i], "score": ks[i]})

                for t in tracks:
                    t.predict()
                hi2 = [d for d in raw_dets if d["score"] >= 0.30]
                lo2 = [d for d in raw_dets if 0.10 <= d["score"] < 0.30]
                tb  = [t.box() for t in tracks]
                mt, md = set(), set()
                if tb and hi2:
                    M = self._iou_matrix(tb, [d["box"] for d in hi2])
                    for ti, di in self._greedy(M, 0.25):
                        tracks[ti].update(hi2[di]["box"])
                        mt.add(ti)
                        md.add(di)
                unm = [i for i in range(len(tracks)) if i not in mt]
                if unm and lo2:
                    M2 = self._iou_matrix(
                        [tracks[i].box() for i in unm],
                        [d["box"] for d in lo2])
                    for ri, di in self._greedy(M2, 0.20):
                        tracks[unm[ri]].update(lo2[di]["box"])
                        mt.add(unm[ri])
                for di, det in enumerate(hi2):
                    if di not in md:
                        t = KBox(det["box"])
                        tracks.append(t)
                        all_ids.add(t.id)
                tracks[:] = [t for t in tracks if t.no_match <= cfg["max_age"]]

                tracked = [
                    {"box": t.box(), "id": t.id, "cx_cy": t.centre()}
                    for t in tracks
                ]

                for det in tracked:
                    tid    = det["id"]
                    cx, cy = det["cx_cy"]
                    inside = (z_top <= cy <= z_bot)
                    if tid not in track_state:
                        track_state[tid] = inside
                        if inside:
                            in_zone.add(tid)
                        continue
                    was = track_state[tid]
                    if not was and inside:
                        entered += 1
                        in_zone.add(tid)
                    elif was and not inside:
                        exited += 1
                        in_zone.discard(tid)
                    track_state[tid] = inside

                out = frame.copy()
                ov  = out.copy()
                cv2.rectangle(ov, (0, z_top), (W2, z_bot), (50, 200, 80), -1)
                cv2.addWeighted(ov, 0.15, out, 0.85, 0, out)

                cv2.line(out, (0, z_top), (W2, z_top), (0, 165, 255), 3)
                cv2.putText(out, "LINE 1",
                            (12, max(z_top - 8, 20)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 165, 255), 2)
                cv2.line(out, (0, z_bot), (W2, z_bot), (50, 220, 80), 3)
                cv2.putText(out, "LINE 2",
                            (12, min(z_bot + 28, H2 - 8)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (50, 220, 80), 2)
                mid_y = (z_top + z_bot) // 2
                cv2.putText(out, "COUNTING ZONE",
                            (W2 // 2 - 140, mid_y),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9, (180, 255, 180), 2)

                for det in raw_dets:
                    rx1, ry1, rx2, ry2 = [int(v) for v in det["box"]]
                    rcx = (rx1 + rx2) // 2
                    rcy = (ry1 + ry2) // 2
                    cv2.circle(out, (rcx, rcy), 3, (0, 255, 255), -1)

                for det in tracked:
                    x1b, y1b, x2b, y2b = [int(v) for v in det["box"]]
                    x1b = max(0, min(x1b, W2 - 1))
                    y1b = max(0, min(y1b, H2 - 1))
                    x2b = max(0, min(x2b, W2 - 1))
                    y2b = max(0, min(y2b, H2 - 1))
                    tid    = det["id"]
                    cx, cy = det["cx_cy"]
                    inside = (z_top <= cy <= z_bot)
                    if tid not in _pal:
                        rng          = np.random.default_rng(tid * 137)
                        r2, g2, b22  = rng.integers(100, 255, size=3).tolist()
                        _pal[tid]    = (b22, g2, r2)
                    color     = _pal[tid]
                    thickness = 3 if inside else 2
                    cv2.rectangle(out, (x1b, y1b), (x2b, y2b), color, thickness)
                    lbl           = "#%d" % tid
                    font          = cv2.FONT_HERSHEY_SIMPLEX
                    font_scale    = 0.55
                    (lw, lh), _   = cv2.getTextSize(lbl, font, font_scale, 1)
                    label_y       = max(y1b - 4, lh + 4)
                    cv2.rectangle(out,
                                  (x1b, label_y - lh - 4),
                                  (x1b + lw + 4, label_y),
                                  color, -1)
                    cv2.putText(out, lbl, (x1b + 2, label_y - 2),
                                font, font_scale, (0, 0, 0), 1)
                    cx_i, cy_i = int(cx), int(cy)
                    dot_col    = (0, 255, 255) if inside else (180, 180, 180)
                    cv2.circle(out, (cx_i, cy_i), 5, dot_col, -1)

                # ── HUD ───────────────────────────────────────────────────────
                HUD_X1, HUD_Y1 = 8,   8
                HUD_X2, HUD_Y2 = 420, 220
                cv2.rectangle(out, (HUD_X1, HUD_Y1), (HUD_X2, HUD_Y2), (0, 0, 0), -1)
                cv2.rectangle(out, (HUD_X1, HUD_Y1), (HUD_X2, HUD_Y2), (50, 50, 50), 2)

                def hud(txt, y, col, scale=0.75, thick=2):
                    cv2.putText(out, txt, (HUD_X1 + 12, y),
                                cv2.FONT_HERSHEY_SIMPLEX, scale, col, thick)

                hud("IN ZONE : %d"    % len(in_zone),       46,  (0,   255,   0))
                hud("NET     : %d"    % (entered - exited),  82,  (80,  180, 255))
                hud("FPS     : %.1f"  % live_fps,            118, (0,   220, 255))
                hud("ENTERED : %d"    % entered,             148, (100, 255, 100), 0.65, 1)
                hud("EXITED  : %d"    % exited,              172, (100, 180, 255), 0.65, 1)
                hud("UNIQUE  : %d  |  DETS : %d" % (len(all_ids), len(raw_dets)),
                                                              194, (200, 200, 200), 0.55, 1)
                hud("FRAME %d/%d  |  %s" % (frame_num, total, dev_lbl),
                                                              214, (200, 200,   0), 0.5,  1)

                if writer:
                    writer.write(out)

                self.frame_ready.emit(out, {
                    "in_zone": len(in_zone),
                    "net":     entered - exited,
                    "entered": entered,
                    "exited":  exited,
                    "unique":  len(all_ids),
                    "frame":   frame_num,
                    "total":   total,
                })
                self.progress.emit(frame_num, total)

            cap.release()
            if writer:
                writer.release()
            if device == "cuda":
                torch.cuda.empty_cache()

            self.finished.emit({
                "in_zone": len(in_zone),
                "net":     entered - exited,
                "entered": entered,
                "exited":  exited,
                "unique":  len(all_ids),
                "frames":  frame_num,
            })

        except Exception:
            self.error.emit(traceback.format_exc())