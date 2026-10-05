import sys, torch
sys.path.insert(0, '.')

from modules.blackbuck.worker import BlackbuckWorker
from modules.blackbuck.detection_enhancer import DetectionEnhancer
import inspect

print("=" * 60)
print("STEP 1: Check which worker.py is loaded")
import modules.blackbuck.worker as wmod
print("worker.py path:", wmod.__file__)

print()
print("STEP 2: Check inference line in worker.run()")
src = inspect.getsource(BlackbuckWorker.run)
for i, l in enumerate(src.split('\n')):
    if 'dets' in l and any(x in l for x in ['enhancer', '_run_tiled', '_run_full']):
        print(f"  Line {i+1}: {l.strip()}")

print()
print("STEP 3: Check detection_enhancer.py path")
import modules.blackbuck.detection_enhancer as emod
print("detection_enhancer.py path:", emod.__file__)

print()
print("STEP 4: Confirm FIX 1 is in detection_enhancer")
src2 = inspect.getsource(DetectionEnhancer.run)
if 'device=self._device' in src2:
    print("  !! BUG STILL PRESENT — device=self._device found in enhancer.run()")
else:
    print("  OK — device= not passed in enhancer.run()")

print()
print("STEP 5: Live GPU inference test")
model_path = None
import os
for root, dirs, files in os.walk('models'):
    for f in files:
        if f.endswith('.pt') and 'blackbuck' in f.lower():
            model_path = os.path.join(root, f)
            break
    if model_path:
        break

if not model_path:
    # try any .pt file
    for root, dirs, files in os.walk('models'):
        for f in files:
            if f.endswith('.pt'):
                model_path = os.path.join(root, f)
                break
        if model_path:
            break

if model_path:
    print(f"  Using model: {model_path}")
    from ultralytics import YOLO
    import numpy as np

    model = YOLO(model_path)
    model.to('cuda:0')

    before = torch.cuda.memory_allocated(0) / 1e6
    print(f"  VRAM before inference: {before:.1f} MB")

    frame = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)
    cfg = {
        'confidence': 0.25, 'iou': 0.45, 'min_area': 200,
        'min_aspect': 0.35, 'max_aspect': 3.5, 'edge_buf': 10,
        'tiling': {'tile_size': 640, 'nms_iou': 0.4},
        'enhancer': {
            'ensemble_enabled': False, 'clahe_enabled': True,
            'clahe_clip': 2.0, 'clahe_tile': 8,
            'scales': [1.0], 'scale_conf_floor': 0.15,
            'morph_enabled': False, 'calib_enabled': False,
            'ensemble_model_path': '',
        }
    }
    enh = DetectionEnhancer(cfg)
    enh.set_models(primary_model=model, secondary_model_path='', device='cuda:0')

    dets = enh.run(frame, 720, 1280)

    after = torch.cuda.memory_allocated(0) / 1e6
    print(f"  VRAM after  inference: {after:.1f} MB")
    print(f"  VRAM delta : {after - before:.1f} MB  (should be > 0)")
    print(f"  Detections : {len(dets)}")

    if after > before:
        print("  GPU IS WORKING via enhancer.run()")
    else:
        print("  !! GPU NOT USED — enhancer.run() not hitting CUDA")
else:
    print("  No .pt model found in models/ folder — skipping live test")

print()
print("STEP 6: Clear __pycache__ recommendation")
print("  Run this in PowerShell to force Python reload fresh .py files:")
print("  Get-ChildItem -Recurse -Filter '*.pyc' | Remove-Item -Force")
print("  Get-ChildItem -Recurse -Filter '__pycache__' | Remove-Item -Recurse -Force")
print("=" * 60)
