"""
modules/blackbuck/worker.py  —  Blackbuck Census QThread worker  (v7 — no enhancer)

Detection pipeline
───────────────────
  DetectionEnhancer completely removed.
  Inference runs directly through _run_tiled() or _run_full() each frame.
  Simpler, faster, easier to debug.

Model loading
─────────────
  Auto-selects best model:  .engine  →  .pt  (fallback)
  Engine rules:
    • model.to(device) skipped  — device baked at export
    • half=True        skipped  — FP16 baked at export
    • imgsz read back from engine, overrides tile_size in cfg

Performance
────────────
  • cudnn.benchmark + deterministic tuned
  • Async VideoWriter   — mp4v encode in background thread
  • Frame prefetch      — decoder runs ahead of GPU
  • Frame-skip          — infer_every N frames, show all
  • Warmup run          — pre-compiles CUDA kernels
  • Adaptive imgsz      — auto by VRAM for .pt models
  • Batched tile crops  — all tiles in ONE model() call
  • Batched tensor pull — single .cpu() pull per result
"""
from __future__ import annotations

import os
import queue
import threading
import traceback
from pathlib import Path
from typing import List, Optional, Tuple

import time
import cv2
import numpy as np
import torch
from ultralytics import YOLO
from PyQt5.QtCore import QThread, pyqtSignal

from .tracker import ByteTracker, STrack
from .zone_manager import ZoneManager
from .report_generator import generate_report
from core.path_helper import resource_path

torch.backends.cudnn.benchmark     = True
torch.backends.cudnn.deterministic = False


# ══════════════════════════════════════════════════════════════════════════════
#  Device / model helpers
# ══════════════════════════════════════════════════════════════════════════════

def _resolve(path: str) -> str:
    return path if (path and os.path.isabs(path)) else resource_path(path)


def _gpu_memory_gb(device_idx: int = 0) -> float:
    try:
        return torch.cuda.get_device_properties(device_idx).total_memory / 1e9
    except Exception:
        return 0.0


def _pick_best_cuda_device() -> str:
    """Return cuda:N for the discrete NVIDIA GPU with most VRAM, else cpu."""
    if not torch.cuda.is_available():
        return "cpu"
    preferred = ("geforce", "nvidia", "rtx", "gtx", "quadro",
                 "tesla", "a100", "a10", "t4", "v100")
    best_idx, best_mem = 0, -1.0
    for i in range(torch.cuda.device_count()):
        name = torch.cuda.get_device_name(i).lower()
        mem  = _gpu_memory_gb(i)
        if any(k in name for k in preferred) and mem > best_mem:
            best_mem, best_idx = mem, i
    return f"cuda:{best_idx}"


def _resolve_model_path(cfg_path: str) -> str:
    """
    Auto-select best model file.
    Priority:  .engine  >  .pt

    config says            disk has               loads
    ─────────────────────  ────────────────────   ─────────────
    models/Blackbuck.pt    Blackbuck.engine  ✓    .engine  ✅
    models/Blackbuck.pt    Blackbuck.engine  ✗    .pt      ✅
    models/Blackbuck.engine Blackbuck.engine ✓    .engine  ✅
    models/Blackbuck.engine Blackbuck.engine ✗    .pt      ✅ fallback
    """
    resolved = _resolve(cfg_path)
    if os.path.isfile(resolved):
        print(f"[Blackbuck] Model (config) : {resolved}")
        return resolved
    stem = str(Path(resolved).with_suffix(""))
    for candidate in [stem + ".engine", stem + ".pt"]:
        if os.path.isfile(candidate):
            print(f"[Blackbuck] Model (auto)   : {candidate}")
            return candidate
    print(f"[Blackbuck] WARNING — model not found near '{resolved}'")
    return resolved


def _is_engine(path: str) -> bool:
    return path.strip().lower().endswith(".engine")


def _get_engine_imgsz(model) -> int:
    """Read imgsz baked into a TensorRT engine. Falls back to 640."""
    try:
        ov = getattr(model, "overrides", {})
        if "imgsz" in ov:
            v = ov["imgsz"]
            return v[0] if isinstance(v, (list, tuple)) else int(v)
        inner = getattr(model, "model", None)
        if inner is not None:
            args = getattr(inner, "args", {})
            if "imgsz" in args:
                v = args["imgsz"]
                return v[0] if isinstance(v, (list, tuple)) else int(v)
    except Exception:
        pass
    return 640


# ══════════════════════════════════════════════════════════════════════════════
#  Async VideoWriter
# ══════════════════════════════════════════════════════════════════════════════

class _AsyncVideoWriter:
    """
    mp4v encoding runs in a background thread.
    Main loop calls .write() and returns instantly — no blocking on disk.
    """
    def __init__(self, path: str, fourcc, fps: float, size: Tuple[int, int]):
        self._writer = cv2.VideoWriter(path, fourcc, fps, size)
        self._q      = queue.Queue(maxsize=16)
        self._stop   = False
        self._thread = threading.Thread(target=self._worker, daemon=True)
        self._thread.start()

    def _worker(self):
        while not self._stop or not self._q.empty():
            try:
                frame = self._q.get(timeout=0.5)
                self._writer.write(frame)
            except queue.Empty:
                continue

    def write(self, frame: np.ndarray):
        try:
            self._q.put_nowait(frame.copy())
        except queue.Full:
            pass  # drop frame rather than block main loop

    def release(self):
        self._stop = True
        self._thread.join(timeout=10)
        self._writer.release()


# ══════════════════════════════════════════════════════════════════════════════
#  Frame prefetch thread
# ══════════════════════════════════════════════════════════════════════════════

class _FramePrefetcher:
    def __init__(self, cap: cv2.VideoCapture, maxsize: int = 16):
        self._cap    = cap
        self._q      = queue.Queue(maxsize=maxsize)
        self._stop   = False
        self._thread = threading.Thread(target=self._reader, daemon=True)
        self._thread.start()

    def _reader(self):
        while not self._stop:
            ret, frame = self._cap.read()
            self._q.put((ret, frame))
            if not ret:
                break

    def get(self) -> Tuple[bool, Optional[np.ndarray]]:
        return self._q.get()

    def stop(self):
        self._stop = True


# ══════════════════════════════════════════════════════════════════════════════
#  NMS
# ══════════════════════════════════════════════════════════════════════════════

def _nms(boxes: np.ndarray, scores: np.ndarray, iou_thresh: float) -> np.ndarray:
    if len(boxes) == 0:
        return np.array([], dtype=int)
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas  = (x2 - x1) * (y2 - y1)
    order  = scores.argsort()[::-1]
    keep   = []
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


# ══════════════════════════════════════════════════════════════════════════════
#  Inference helpers
# ══════════════════════════════════════════════════════════════════════════════

def _make_tiles(H: int, W: int,
                grid_rows: int, grid_cols: int,
                overlap: float) -> List[Tuple[int, int, int, int]]:
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


def _run_tiled(model, frame: np.ndarray, cfg: dict,
               H: int, W: int, imgsz: int) -> List:
    """
    Split frame into grid tiles, run ONE batched engine/model call,
    translate boxes back to full-frame coordinates, apply NMS + filters.
    device= is NOT passed — model already on correct device from load time.
    """
    tc          = cfg.get("tiling", {})
    tiles       = _make_tiles(H, W,
                              tc.get("grid_rows", 2),
                              tc.get("grid_cols", 2),
                              tc.get("overlap",   0.25))
    conf_thresh = cfg["confidence"]
    iou_thresh  = cfg["iou"]
    nms_iou     = tc.get("nms_iou",   0.40)
    tile_size   = tc.get("tile_size", imgsz)
    eb          = cfg.get("edge_buf", 6)
    min_area    = cfg.get("min_area",   100)
    min_asp     = cfg.get("min_aspect", 0.30)
    max_asp     = cfg.get("max_aspect", 4.0)

    # ── Build crop batch ──────────────────────────────────────────────────────
    crops, valid_tiles = [], []
    for (tx1, ty1, tx2, ty2) in tiles:
        crop = frame[ty1:ty2, tx1:tx2]
        if crop.size == 0:
            continue
        crops.append(crop)
        valid_tiles.append((tx1, ty1))

    if not crops:
        return []

    # ── ONE batched model call ────────────────────────────────────────────────
    all_results = model(crops, conf=conf_thresh, iou=iou_thresh,
                        imgsz=tile_size, verbose=False)

    all_boxes, all_scores = [], []
    for res, (tx1, ty1) in zip(all_results, valid_tiles):
        if res.boxes is None or len(res.boxes) == 0:
            continue
        xyxy  = res.boxes.xyxy.cpu().numpy()   # single batched pull
        confs = res.boxes.conf.cpu().numpy()
        xyxy[:, 0] += tx1;  xyxy[:, 2] += tx1
        xyxy[:, 1] += ty1;  xyxy[:, 3] += ty1
        all_boxes.append(xyxy)
        all_scores.append(confs)

    if not all_boxes:
        return []

    boxes_arr  = np.concatenate(all_boxes,  axis=0).astype(np.float32)
    scores_arr = np.concatenate(all_scores, axis=0).astype(np.float32)

    # Cross-tile NMS
    keep      = _nms(boxes_arr, scores_arr, nms_iou)
    boxes_arr  = boxes_arr[keep]
    scores_arr = scores_arr[keep]

    # ── Geometric filters ─────────────────────────────────────────────────────
    dets = []
    for i in range(len(boxes_arr)):
        x1, y1, x2, y2 = boxes_arr[i]
        conf = float(scores_arr[i])
        bw, bh = x2 - x1, y2 - y1
        if bw * bh < min_area:
            continue
        aspect = bh / (bw + 1e-6)
        if not (min_asp < aspect < max_asp):
            continue
        if x1 < eb or y1 < eb or x2 > W - eb or y2 > H - eb:
            continue
        dets.append([x1, y1, x2, y2, conf])
    return dets


def _run_full(model, frame: np.ndarray, cfg: dict,
              H: int, W: int, imgsz: int) -> List:
    """
    Run inference on the full frame (no tiling).
    Used when tiling is disabled in config.
    device= is NOT passed — model already on correct device.
    """
    conf_thresh = cfg["confidence"]
    iou_thresh  = cfg["iou"]
    eb          = cfg.get("edge_buf", 6)
    min_area    = cfg.get("min_area",   100)
    min_asp     = cfg.get("min_aspect", 0.30)
    max_asp     = cfg.get("max_aspect", 4.0)

    results = model([frame], conf=conf_thresh, iou=iou_thresh,
                    imgsz=imgsz, verbose=False)
    dets = []
    for res in results:
        if res.boxes is None or len(res.boxes) == 0:
            continue
        xyxy  = res.boxes.xyxy.cpu().numpy().astype(np.float32)
        confs = res.boxes.conf.cpu().numpy().astype(np.float32)
        for i in range(len(xyxy)):
            x1, y1, x2, y2 = xyxy[i]
            conf = float(confs[i])
            bw, bh = x2 - x1, y2 - y1
            if bw * bh < min_area:
                continue
            aspect = bh / (bw + 1e-6)
            if not (min_asp < aspect < max_asp):
                continue
            if x1 < eb or y1 < eb or x2 > W - eb or y2 > H - eb:
                continue
            dets.append([x1, y1, x2, y2, conf])
    return dets


# ══════════════════════════════════════════════════════════════════════════════
#  Worker
# ══════════════════════════════════════════════════════════════════════════════

class BlackbuckWorker(QThread):

    frame_ready = pyqtSignal(object, object)
    progress    = pyqtSignal(int, int)
    finished    = pyqtSignal(object)
    error       = pyqtSignal(str)

    def __init__(self, cfg: dict,
                 zone_manager: Optional[ZoneManager] = None,
                 parent=None):
        super().__init__(parent)
        self.cfg          = cfg
        self.zone_manager = zone_manager
        self._stop        = False

    def stop(self):
        self._stop = True

    def run(self):
        cfg        = self.cfg
        prefetcher = None
        writer     = None
        try:
            # ── 1. Pick best CUDA device ──────────────────────────────────────
            device     = _pick_best_cuda_device()
            device_idx = int(device.split(":")[-1]) if device != "cpu" else 0
            mem_gb     = _gpu_memory_gb(device_idx) if device != "cpu" else 0.0

            if device != "cpu":
                print(f"[Blackbuck] Device [{device_idx}]: "
                      f"{torch.cuda.get_device_name(device_idx)}  "
                      f"VRAM={mem_gb:.1f} GB")
                for i in range(torch.cuda.device_count()):
                    print(f"           GPU {i}: {torch.cuda.get_device_name(i)} "
                          f"{_gpu_memory_gb(i):.1f} GB")
            else:
                print("[Blackbuck] No CUDA — running on CPU")

            # ── 2. Load model (.engine first → .pt fallback) ──────────────────
            model_path  = _resolve_model_path(cfg["model_path"])
            engine_mode = _is_engine(model_path)
            model       = YOLO(model_path)

            print(f"[Blackbuck] Mode : {'TensorRT ENGINE' if engine_mode else 'PyTorch PT'}")

            if engine_mode:
                # TensorRT — device & FP16 baked at export
                imgsz    = _get_engine_imgsz(model)
                use_fp16 = False
                print(f"[Blackbuck] Engine imgsz={imgsz} "
                      f"(device & FP16 fixed at export)")
                if "tiling" in cfg:
                    cfg["tiling"]["tile_size"] = imgsz
            else:
                # PyTorch .pt
                model.to(device)
                if device != "cpu":
                    if   mem_gb >= 12:  imgsz = cfg.get("imgsz", 1280)
                    elif mem_gb >= 8:   imgsz = cfg.get("imgsz", 960)
                    elif mem_gb >= 3.9: imgsz = cfg.get("imgsz", 640)
                    else:               imgsz = cfg.get("imgsz", 480)
                else:
                    imgsz = cfg.get("imgsz", 640)
                use_fp16 = device != "cpu" and cfg.get("use_fp16", True)
                print(f"[Blackbuck] PT model  imgsz={imgsz}  FP16={use_fp16}")

            if device != "cpu":
                alloc_mb = torch.cuda.memory_allocated(device_idx) / 1e6
                print(f"[Blackbuck] VRAM after load : {alloc_mb:.0f} MB")

            # ── 3. Warmup ─────────────────────────────────────────────────────
            dummy = [np.full((imgsz, imgsz, 3), 114, dtype=np.uint8)]
            try:
                model.predict(source=dummy, imgsz=imgsz,
                              half=use_fp16, verbose=False)
                if device != "cpu":
                    alloc_mb = torch.cuda.memory_allocated(device_idx) / 1e6
                    print(f"[Blackbuck] Warmup done  VRAM : {alloc_mb:.0f} MB")
            except Exception as e:
                print(f"[Blackbuck] Warmup skipped ({e})")

            # ── 4. Tracker ────────────────────────────────────────────────────
            STrack._count = 0
            tracker = ByteTracker(
                max_age       = cfg["track_buffer"],
                min_hits      = cfg["min_hits"],
                iou_threshold = cfg["match_thresh"],
                hi_thresh     = cfg["confidence"],
            )

            use_tiling  = cfg.get("tiling", {}).get("enabled", True)
            infer_every = cfg.get("infer_every", 1)

            cap   = cv2.VideoCapture(cfg["video_path"])
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            fps   = cap.get(cv2.CAP_PROP_FPS)
            W     = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            H     = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

            # ── 5. Prefetch thread ────────────────────────────────────────────
            prefetcher = _FramePrefetcher(cap, maxsize=16)

            # ── 6. Async VideoWriter ──────────────────────────────────────────
            output_video_path = None
            if cfg.get("save_video") and cfg.get("output_dir"):
                output_video_path = str(
                    Path(cfg["output_dir"]) /
                    ("blackbuck_" + Path(cfg["video_path"]).stem + ".mp4"))
                writer = _AsyncVideoWriter(
                    output_video_path,
                    cv2.VideoWriter_fourcc(*"mp4v"), fps, (W, H))
                print(f"[Blackbuck] Async writer → {output_video_path}")

            frame_num  = 0
            fp_label   = ("ENGINE" if engine_mode
                          else ("FP16" if use_fp16 else "FP32"))
            dev_lbl    = (f"GPU {fp_label} [{device_idx}]"
                          if device != "cpu" else "CPU")
            model_name = Path(model_path).name
            mode_lbl   = ("TILED %dx%d" % (
                              cfg.get("tiling", {}).get("grid_rows", 2),
                              cfg.get("tiling", {}).get("grid_cols", 2))
                          if use_tiling else f"FULL {imgsz}")
            fps_time   = time.perf_counter()
            live_fps   = 0.0
            last_dets  = []

            while not self._stop:
                # ── 7. Get prefetched frame ───────────────────────────────────
                ret, frame = prefetcher.get()
                if not ret:
                    break
                frame_num += 1

                now      = time.perf_counter()
                live_fps = 1.0 / (now - fps_time) if (now - fps_time) > 0 else 0.0
                fps_time = now

                # ── 8. Inference (direct — no enhancer) ──────────────────────
                if frame_num % infer_every == 0 or frame_num == 1:
                    if use_tiling:
                        last_dets = _run_tiled(model, frame, cfg, H, W, imgsz)
                    else:
                        last_dets = _run_full(model, frame, cfg, H, W, imgsz)

                # ── 9. Track ──────────────────────────────────────────────────
                tracked = tracker.update(
                    np.array(last_dets) if last_dets else np.empty((0, 5)))
                st = tracker.stats()

                zone_stats = {}
                if self.zone_manager is not None and len(tracked):
                    self.zone_manager.update(tracked)
                    zone_stats = self.zone_manager.zone_stats()

                # ── 10. Draw detections + tracks ──────────────────────────────
                out = frame.copy()

                if self.zone_manager is not None:
                    out = self.zone_manager.draw(out, tracked)

                for obj in tracked:
                    x1, y1b, x2, y2b, tid, cf, confirmed = obj
                    x1, y1b, x2, y2b, tid = map(int, [x1, y1b, x2, y2b, tid])
                    color = (0, 255, 0) if confirmed else (255, 165, 0)
                    cv2.rectangle(out, (x1, y1b), (x2, y2b), color, 2)
                    cv2.putText(out, f"#{tid} {cf:.2f}",
                                (x1, y1b - 7),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1,
                                cv2.LINE_AA)
                    cv2.circle(out,
                               ((x1+x2)//2, (y1b+y2b)//2),
                               4, (255, 255, 0), -1)

                # ── 11. HUD ───────────────────────────────────────────────────
                HX1, HY1, HX2, HY2 = 10, 10, 460, 230
                cv2.rectangle(out, (HX1, HY1), (HX2, HY2), (0, 0, 0), -1)
                cv2.rectangle(out, (HX1, HY1), (HX2, HY2), (60, 60, 60), 1)

                def _h(txt, y, col, sc=0.75, th=2):
                    cv2.putText(out, txt, (HX1+10, y),
                                cv2.FONT_HERSHEY_SIMPLEX, sc, col, th,
                                cv2.LINE_AA)

                _h(f"UNIQUE : {st['unique']}",              42,  (0, 255, 0))
                _h(f"ACTIVE : {st['active']}  [{mode_lbl}]", 72, (180,220,255), sc=0.62)
                _h(f"FPS    : {live_fps:.1f}",              100,  (0, 220, 255))
                _h(f"FRAME  : {frame_num} / {total}",       126,  (200,200,200), sc=0.58)
                _h(f"DEVICE : {dev_lbl}",                   150,  (200,200,0),   sc=0.58)
                _h(f"VRAM   : {mem_gb:.1f} GB",             172,  (180,180,0),   sc=0.52)
                _h(f"MODEL  : {model_name}",                194,  (160,200,160), sc=0.46)
                _h(f"SKIP   : every {infer_every} frame(s)", 214, (150,150,200), sc=0.43)

                # ── 12. Write + emit ──────────────────────────────────────────
                if writer:
                    writer.write(out)

                self.frame_ready.emit(out, {
                    "unique":     st["unique"],
                    "active":     st["active"],
                    "frame":      frame_num,
                    "total":      total,
                    "zone_stats": zone_stats,
                })
                self.progress.emit(frame_num, total)

            # ── Cleanup ───────────────────────────────────────────────────────
            if prefetcher:
                prefetcher.stop()
            cap.release()
            if writer:
                writer.release()
            if device != "cpu":
                torch.cuda.empty_cache()

            result = tracker.stats()
            result["frames"] = frame_num
            if self.zone_manager is not None:
                result["zone_stats"] = self.zone_manager.zone_stats()

            video_meta = {
                "fps": fps, "width": W, "height": H,
                "total_frames": total,
                "output_video": output_video_path,
            }
            try:
                report_path = generate_report(cfg, result, video_meta)
                result["report_path"] = report_path
            except Exception as exc:
                result["report_path"]  = None
                result["report_error"] = str(exc)

            self.finished.emit(result)

        except Exception:
            if prefetcher:
                prefetcher.stop()
            if writer:
                try:
                    writer.release()
                except Exception:
                    pass
            self.error.emit(traceback.format_exc())
