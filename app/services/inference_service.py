"""
inference_service.py
Server-side ONNX inference for object detection.

Supports:
  - YOLOv8 output format: [1, 4+nc, 8400]  (transposed, xywh + class scores)
  - YOLOv5 output format: [1, 25200, 5+nc]  (x,y,w,h,obj_conf, class_confs)

All bounding box coordinates returned are 0-1 normalized (relative to image dims).
"""

import base64
import io
import json
import logging
from typing import List, Optional, Tuple, Dict, Any
from functools import lru_cache

import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# ─── Model Session Cache ──────────────────────────────────────────────────────

_session_cache: Dict[str, Any] = {}

def _get_session(model_path: str):
    """Load and cache an onnxruntime InferenceSession by path."""
    if model_path not in _session_cache:
        try:
            import onnxruntime as ort
            sess_options = ort.SessionOptions()
            sess_options.log_severity_level = 3  # ERROR only
            session = ort.InferenceSession(
                model_path,
                sess_options=sess_options,
                providers=['CPUExecutionProvider']
            )
            _session_cache[model_path] = session
            logger.info(f"Loaded ONNX model: {model_path}")
        except Exception as e:
            logger.error(f"Failed to load ONNX model {model_path}: {e}")
            raise RuntimeError(f"Could not load model: {e}")
    return _session_cache[model_path]

def evict_model_cache(model_path: str):
    """Remove a cached session (call when model is deleted/replaced)."""
    _session_cache.pop(model_path, None)

# ─── Metadata Extraction ──────────────────────────────────────────────────────

def extract_class_names(model_path: str) -> Optional[List[str]]:
    """
    Try to read embedded class names from ONNX model metadata.
    Ultralytics YOLO exports store them as JSON in custom_metadata_map['names'].
    Returns list of class name strings, or None if not available.
    """
    try:
        session = _get_session(model_path)
        meta = session.get_modelmeta()
        custom = meta.custom_metadata_map or {}

        # Ultralytics: {"names": "{0: 'person', 1: 'bicycle', ...}"}
        if 'names' in custom:
            raw = custom['names']
            try:
                # May be Python dict repr or JSON
                import ast
                parsed = ast.literal_eval(raw)
                if isinstance(parsed, dict):
                    max_idx = max(int(k) for k in parsed.keys())
                    return [parsed.get(i, f'class_{i}') for i in range(max_idx + 1)]
            except Exception:
                pass
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, (list, dict)):
                    if isinstance(parsed, list):
                        return parsed
                    max_idx = max(int(k) for k in parsed.keys())
                    return [parsed.get(str(i), f'class_{i}') for i in range(max_idx + 1)]
            except Exception:
                pass

        # Alternative key 'classes'
        if 'classes' in custom:
            raw = custom['classes']
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return parsed
            except Exception:
                pass

        return None
    except Exception as e:
        logger.warning(f"Could not extract class names: {e}")
        return None

def get_model_info(model_path: str) -> Tuple[List[int], int]:
    """
    Returns (input_shape [H,W], num_output_classes).
    Infers num_classes from the model output tensor shape.
    """
    session = _get_session(model_path)
    inputs = session.get_inputs()
    outputs = session.get_outputs()

    # Determine input H, W
    input_shape = inputs[0].shape  # e.g. [1, 3, 640, 640]
    if len(input_shape) >= 4:
        h = input_shape[2] if isinstance(input_shape[2], int) and input_shape[2] > 0 else 640
        w = input_shape[3] if isinstance(input_shape[3], int) and input_shape[3] > 0 else 640
    else:
        h, w = 640, 640

    # Determine number of classes from output shape
    out_shape = outputs[0].shape  # e.g. [1, 84, 8400] for YOLOv8 or [1, 25200, 85] for YOLOv5
    nc = 0
    if len(out_shape) == 3:
        # YOLOv8: [1, 4+nc, anchors] → nc = dim1 - 4
        # YOLOv5: [1, anchors, 5+nc] → nc = dim2 - 5
        d1, d2 = out_shape[1], out_shape[2]
        if isinstance(d1, int) and isinstance(d2, int):
            if d1 < d2:
                # YOLOv8-style: small first dim (e.g. 84), large second (e.g. 8400)
                nc = max(0, d1 - 4)
            else:
                # YOLOv5-style: large first dim (e.g. 25200), small second
                nc = max(0, d2 - 5)

    return [int(h), int(w)], nc

# ─── Image Preprocessing ──────────────────────────────────────────────────────

def _letterbox(img: Image.Image, target_h: int, target_w: int) -> Tuple[np.ndarray, float, int, int]:
    """
    Resize image preserving aspect ratio with grey padding.
    Returns (padded_array[H,W,3], scale, pad_x, pad_y).
    """
    orig_w, orig_h = img.size
    scale = min(target_w / orig_w, target_h / orig_h)
    new_w = int(round(orig_w * scale))
    new_h = int(round(orig_h * scale))

    img_resized = img.resize((new_w, new_h), Image.BILINEAR)

    pad_x = (target_w - new_w) // 2
    pad_y = (target_h - new_h) // 2

    canvas = Image.new('RGB', (target_w, target_h), (114, 114, 114))
    canvas.paste(img_resized, (pad_x, pad_y))

    arr = np.array(canvas, dtype=np.float32) / 255.0
    return arr, scale, pad_x, pad_y

def preprocess_image(data_url: str, input_h: int, input_w: int) -> Tuple[np.ndarray, float, int, int, int, int]:
    """
    Decode base64 data URL, letterbox to model input size.
    Returns (tensor[1,3,H,W], scale, pad_x, pad_y, orig_w, orig_h).
    """
    if ',' in data_url:
        b64 = data_url.split(',', 1)[1]
    else:
        b64 = data_url

    img_bytes = base64.b64decode(b64)
    img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    orig_w, orig_h = img.size

    arr, scale, pad_x, pad_y = _letterbox(img, input_h, input_w)

    # HWC → CHW → NCHW
    tensor = arr.transpose(2, 0, 1)[np.newaxis, ...]  # [1, 3, H, W]
    return tensor, scale, pad_x, pad_y, orig_w, orig_h

# ─── NMS ─────────────────────────────────────────────────────────────────────

def _iou(box1: np.ndarray, box2: np.ndarray) -> float:
    """IoU of two boxes in [x1, y1, x2, y2] format."""
    ix1 = max(box1[0], box2[0])
    iy1 = max(box1[1], box2[1])
    ix2 = min(box1[2], box2[2])
    iy2 = min(box1[3], box2[3])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    a1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
    a2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
    union = a1 + a2 - inter
    return inter / union if union > 0 else 0.0

def _nms(detections: List[Dict], iou_threshold: float = 0.45) -> List[Dict]:
    """Non-maximum suppression, per-class."""
    if not detections:
        return []

    # Group by class
    by_class: Dict[int, List[Dict]] = {}
    for det in detections:
        c = det['class_idx']
        by_class.setdefault(c, []).append(det)

    result = []
    for class_dets in by_class.values():
        # Sort by confidence descending
        class_dets.sort(key=lambda d: d['confidence'], reverse=True)
        kept = []
        while class_dets:
            best = class_dets.pop(0)
            kept.append(best)
            b1 = np.array([best['x1'], best['y1'], best['x2'], best['y2']])
            class_dets = [
                d for d in class_dets
                if _iou(b1, np.array([d['x1'], d['y1'], d['x2'], d['y2']])) < iou_threshold
            ]
        result.extend(kept)
    return result

# ─── Postprocessing ───────────────────────────────────────────────────────────

def _postprocess_yolov8(output: np.ndarray, conf_thresh: float, iou_thresh: float,
                         scale: float, pad_x: int, pad_y: int,
                         orig_w: int, orig_h: int, input_h: int, input_w: int) -> List[Dict]:
    """
    YOLOv8 output: [1, 4+nc, 8400] — rows are [cx, cy, w, h, cls0, cls1, ...]
    Coordinates are in input_image pixel space.
    """
    preds = output[0]  # [4+nc, 8400]
    # Transpose to [8400, 4+nc]
    preds = preds.T

    cx, cy, bw, bh = preds[:, 0], preds[:, 1], preds[:, 2], preds[:, 3]
    class_scores = preds[:, 4:]  # [8400, nc]

    class_ids = np.argmax(class_scores, axis=1)
    confidences = class_scores[np.arange(len(class_ids)), class_ids]

    mask = confidences >= conf_thresh
    if not np.any(mask):
        return []

    cx, cy, bw, bh = cx[mask], cy[mask], bw[mask], bh[mask]
    class_ids = class_ids[mask]
    confidences = confidences[mask]

    detections = []
    for i in range(len(cx)):
        # Convert from input-space pixel coords to original image pixel coords
        x1 = (cx[i] - bw[i] / 2 - pad_x) / scale
        y1 = (cy[i] - bh[i] / 2 - pad_y) / scale
        x2 = (cx[i] + bw[i] / 2 - pad_x) / scale
        y2 = (cy[i] + bh[i] / 2 - pad_y) / scale

        # Clip and normalize to 0-1
        x1 = max(0.0, min(1.0, x1 / orig_w))
        y1 = max(0.0, min(1.0, y1 / orig_h))
        x2 = max(0.0, min(1.0, x2 / orig_w))
        y2 = max(0.0, min(1.0, y2 / orig_h))

        if x2 <= x1 or y2 <= y1:
            continue

        detections.append({
            'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
            'confidence': float(confidences[i]),
            'class_idx': int(class_ids[i])
        })

    return _nms(detections, iou_thresh)

def _postprocess_yolov5(output: np.ndarray, conf_thresh: float, iou_thresh: float,
                         scale: float, pad_x: int, pad_y: int,
                         orig_w: int, orig_h: int, input_h: int, input_w: int) -> List[Dict]:
    """
    YOLOv5 output: [1, 25200, 5+nc] — rows are [cx, cy, w, h, obj_conf, cls0, ...]
    """
    preds = output[0]  # [25200, 5+nc]

    obj_conf = preds[:, 4]
    class_scores = preds[:, 5:]  # [25200, nc]
    class_ids = np.argmax(class_scores, axis=1)
    class_confs = class_scores[np.arange(len(class_ids)), class_ids]
    confidences = obj_conf * class_confs

    mask = confidences >= conf_thresh
    if not np.any(mask):
        return []

    preds = preds[mask]
    class_ids = class_ids[mask]
    confidences = confidences[mask]

    detections = []
    for i in range(len(preds)):
        cx, cy, bw, bh = preds[i, 0], preds[i, 1], preds[i, 2], preds[i, 3]
        x1 = (cx - bw / 2 - pad_x) / scale
        y1 = (cy - bh / 2 - pad_y) / scale
        x2 = (cx + bw / 2 - pad_x) / scale
        y2 = (cy + bh / 2 - pad_y) / scale

        x1 = max(0.0, min(1.0, x1 / orig_w))
        y1 = max(0.0, min(1.0, y1 / orig_h))
        x2 = max(0.0, min(1.0, x2 / orig_w))
        y2 = max(0.0, min(1.0, y2 / orig_h))

        if x2 <= x1 or y2 <= y1:
            continue

        detections.append({
            'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
            'confidence': float(confidences[i]),
            'class_idx': int(class_ids[i])
        })

    return _nms(detections, iou_thresh)

# ─── Public inference entry point ─────────────────────────────────────────────

def run_inference(
    model_path: str,
    data_url: str,
    conf_thresh: float = 0.5,
    iou_thresh: float = 0.45,
    input_shape: Optional[List[int]] = None
) -> List[Dict]:
    """
    Run ONNX model on a single image (as base64 data URL).

    Returns list of dicts: {x, y, width, height, confidence, class_idx}
    where x/y/width/height are 0-1 normalized (relative coords).
    """
    session = _get_session(model_path)

    # Determine input dims
    if input_shape and len(input_shape) >= 2:
        input_h, input_w = int(input_shape[0]), int(input_shape[1])
    else:
        ih, iw = get_model_info(model_path)[0]
        input_h, input_w = ih, iw

    tensor, scale, pad_x, pad_y, orig_w, orig_h = preprocess_image(data_url, input_h, input_w)

    # Run inference
    input_name = session.get_inputs()[0].name
    output = session.run(None, {input_name: tensor})
    raw = output[0]  # [1, ?, ?]

    # Auto-detect format from output shape
    if raw.ndim == 3:
        d1, d2 = raw.shape[1], raw.shape[2]
        if d1 < d2:
            # YOLOv8: [1, small, large] e.g. [1, 84, 8400]
            dets = _postprocess_yolov8(raw, conf_thresh, iou_thresh, scale, pad_x, pad_y, orig_w, orig_h, input_h, input_w)
        else:
            # YOLOv5: [1, large, small] e.g. [1, 25200, 85]
            dets = _postprocess_yolov5(raw, conf_thresh, iou_thresh, scale, pad_x, pad_y, orig_w, orig_h, input_h, input_w)
    else:
        logger.warning(f"Unexpected output shape {raw.shape}, cannot postprocess")
        return []

    # Convert from x1y1x2y2 to xywh (same convention as project BoundingBox)
    result = []
    for det in dets:
        result.append({
            'x': float(det['x1']),
            'y': float(det['y1']),
            'width': float(det['x2'] - det['x1']),
            'height': float(det['y2'] - det['y1']),
            'confidence': float(det['confidence']),
            'class_idx': int(det['class_idx'])
        })

    return result
