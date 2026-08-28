import base64, io, math, random
from PIL import Image, ImageEnhance, ImageFilter, ImageOps
import numpy as np
from typing import Tuple, List, Dict, Any

def data_url_to_pil(data_url: str) -> Tuple[Image.Image, str]:
    """Convert a data URL to a PIL Image."""
    header, b64data = data_url.split(',', 1)
    mime = header.split(';')[0].split(':')[1]
    img_bytes = base64.b64decode(b64data)
    img = Image.open(io.BytesIO(img_bytes)).convert('RGB')
    return img, mime

def pil_to_data_url(img: Image.Image, quality: int = 85) -> str:
    """Convert a PIL Image to a JPEG data URL."""
    buffer = io.BytesIO()
    img.save(buffer, format='JPEG', quality=quality)
    b64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    return f'data:image/jpeg;base64,{b64}'

def rotate_point(px: float, py: float, cx: float, cy: float, angle_rad: float) -> Tuple[float, float]:
    rx = cx + (px - cx) * math.cos(angle_rad) - (py - cy) * math.sin(angle_rad)
    ry = cy + (px - cx) * math.sin(angle_rad) + (py - cy) * math.cos(angle_rad)
    return rx, ry

def transform_boxes(
    boxes: List[Dict[str, Any]],
    apply_flip: bool,
    angle_rad: float
) -> List[Dict[str, Any]]:
    """Geometrically transform bounding boxes to match image augmentation.
    Matches the exact TypeScript logic in App.tsx performSingleAugmentation()."""
    transformed = []
    for box in boxes:
        x = box['x']
        y = box['y']
        w = box['width']
        h = box['height']
        
        # 1. Flip horizontally around x = 0.5
        if apply_flip:
            x = 1 - x - w
        
        # 2. Rotate around center (0.5, 0.5)
        if angle_rad != 0:
            cx, cy = 0.5, 0.5
            p1 = rotate_point(x, y, cx, cy, angle_rad)
            p2 = rotate_point(x + w, y, cx, cy, angle_rad)
            p3 = rotate_point(x, y + h, cx, cy, angle_rad)
            p4 = rotate_point(x + w, y + h, cx, cy, angle_rad)
            xs = [p1[0], p2[0], p3[0], p4[0]]
            ys = [p1[1], p2[1], p3[1], p4[1]]
            min_x, max_x = min(xs), max(xs)
            min_y, max_y = min(ys), max(ys)
            x = max(0, min(1, min_x))
            y = max(0, min(1, min_y))
            w = max(0.005, min(1 - x, max_x - min_x))
            h = max(0.005, min(1 - y, max_y - min_y))
        
        import uuid as _uuid
        transformed.append({
            **box,
            'id': f'box-aug-{_uuid.uuid4().hex[:9]}',
            'x': x,
            'y': y,
            'width': w,
            'height': h,
        })
    return transformed

def perform_augmentation(
    data_url: str,
    annotations: List[Dict[str, Any]],
    flip: bool,
    rotation: bool,
    brightness: bool,
    exposure: bool,
    noise: bool,
) -> Tuple[str, List[Dict[str, Any]]]:
    """Perform a single augmentation variant, matching the TypeScript Canvas logic exactly.
    Returns (augmented_data_url, transformed_annotations)."""
    img, _ = data_url_to_pil(data_url)
    
    # Determine flip
    only_flip = flip and not rotation and not brightness and not exposure and not noise
    apply_flip = flip and (True if only_flip else random.random() > 0.5)
    
    # Determine rotation angle
    angle_degrees = 0.0
    if rotation:
        sign = 1 if random.random() > 0.5 else -1
        angle_degrees = sign * (5 + random.random() * 10)  # 5 to 15 degrees
    angle_rad = (angle_degrees * math.pi) / 180
    
    # Apply flip
    if apply_flip:
        img = ImageOps.mirror(img)
    
    # Apply rotation (expand=False keeps same dimensions, matching Canvas behavior)
    if angle_degrees != 0:
        img = img.rotate(-angle_degrees, expand=False, fillcolor=(0, 0, 0))  # negative because PIL rotates CCW
    
    # Apply brightness
    if brightness:
        if random.random() > 0.5:
            factor = 0.75 + random.random() * 0.1  # 0.75 to 0.85 (darker)
        else:
            factor = 1.15 + random.random() * 0.15  # 1.15 to 1.3 (brighter)
        img = ImageEnhance.Brightness(img).enhance(factor)
    
    # Apply exposure (contrast + brightness)
    if exposure:
        contrast_factor = 1.25 if random.random() > 0.5 else 0.75
        exp_brightness_factor = 1.2 if random.random() > 0.5 else 0.8
        img = ImageEnhance.Contrast(img).enhance(contrast_factor)
        img = ImageEnhance.Brightness(img).enhance(exp_brightness_factor)
    
    # Apply noise
    if noise:
        arr = np.array(img, dtype=np.float32)
        noise_amount = 8 + random.random() * 10  # 8 to 18
        noise_arr = (np.random.rand(*arr.shape) - 0.5) * noise_amount
        arr = np.clip(arr + noise_arr, 0, 255).astype(np.uint8)
        img = Image.fromarray(arr)
    
    aug_data_url = pil_to_data_url(img, quality=85)
    aug_annotations = transform_boxes(annotations, apply_flip, angle_rad)
    
    return aug_data_url, aug_annotations
