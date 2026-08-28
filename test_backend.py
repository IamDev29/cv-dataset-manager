import os, sys, json, base64, io
from fastapi.testclient import TestClient
from main import app
from PIL import Image

client = TestClient(app)

def create_dummy_image_data_url():
    img = Image.new('RGB', (100, 100), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
    return f'data:image/jpeg;base64,{b64}'

def test_all():
    print("Testing Boxel Python Backend...")
    
    # 1. Health / Settings
    res = client.get("/api/settings")
    assert res.status_code == 200, f"Get settings failed: {res.text}"
    settings = res.json()
    print("[OK] Get settings:", settings)

    res = client.put("/api/settings", json={"train_percent": 80, "val_percent": 15, "test_percent": 5})
    assert res.status_code == 200
    assert res.json()["train_percent"] == 80
    print("[OK] Put settings passed")

    # 2. Projects CRUD
    res = client.post("/api/projects", json={"name": "Traffic Lights Test"})
    assert res.status_code == 201, f"Create project failed: {res.text}"
    proj = res.json()
    proj_id = proj["id"]
    print(f"[OK] Created project: {proj['name']} (ID: {proj_id})")

    res = client.get("/api/projects")
    assert res.status_code == 200
    assert any(p["id"] == proj_id for p in res.json())
    print(f"[OK] Listed {len(res.json())} projects")

    # 3. Classes
    res = client.post(f"/api/projects/{proj_id}/classes", json={"name": "red_light", "color": "#FF4D4D"})
    assert res.status_code == 201
    cls_red = res.json()
    print("[OK] Added class:", cls_red)

    res = client.post(f"/api/projects/{proj_id}/classes", json={"name": "green_light", "color": "#00E5A3"})
    assert res.status_code == 201
    cls_green = res.json()
    print("[OK] Added class:", cls_green)

    # 4. Upload Images (batch & single)
    dummy_data_url = create_dummy_image_data_url()
    batch_payload = [
        {
            "name": f"img_{i}.jpg",
            "size": 1024,
            "type": "image/jpeg",
            "dataUrl": dummy_data_url,
            "annotated": False,
            "createdAt": 1700000000000 + i
        }
        for i in range(5)
    ]
    res = client.post(f"/api/projects/{proj_id}/images/batch", json=batch_payload)
    assert res.status_code == 201, f"Batch upload failed: {res.text}"
    images = res.json()
    assert len(images) == 5
    print(f"[OK] Uploaded batch of {len(images)} images")

    # 5. Annotations
    first_img_id = images[0]["id"]
    box_payload = {
        "annotations": [
            {
                "id": "box-1",
                "classId": cls_red["id"],
                "x": 0.1,
                "y": 0.2,
                "width": 0.3,
                "height": 0.4
            }
        ]
    }
    res = client.put(f"/api/images/{first_img_id}/annotations", json=box_payload)
    assert res.status_code == 200, f"Save annotations failed: {res.text}"
    annotated_img = res.json()
    assert annotated_img["annotated"] == True
    assert len(annotated_img["annotations"]) == 1
    print("[OK] Saved annotation to image")

    # Annotate second image too
    res = client.put(f"/api/images/{images[1]['id']}/annotations", json={
        "annotations": [
            {"id": "box-2", "classId": cls_green["id"], "x": 0.2, "y": 0.2, "width": 0.5, "height": 0.5}
        ]
    })
    assert res.status_code == 200

    # 6. Auto-Split
    res = client.post(f"/api/projects/{proj_id}/split", json={
        "train_percent": 80,
        "val_percent": 20,
        "test_percent": 0,
        "include_unannotated": True
    })
    assert res.status_code == 200, f"Auto-split failed: {res.text}"
    split_images = res.json()
    splits_count = {s: sum(1 for img in split_images if img["split"] == s) for s in ["train", "val", "test", "unassigned"]}
    print("[OK] Auto-split result:", splits_count)

    # 7. Augmentation
    res = client.post(f"/api/projects/{proj_id}/augment", json={
        "flip": True,
        "rotation": True,
        "brightness": True,
        "exposure": True,
        "noise": False,
        "variants_count": 2
    })
    assert res.status_code == 200, f"Augment failed: {res.text}"
    aug_images = res.json()
    print(f"[OK] Generated {len(aug_images)} augmented images")

    # 8. YOLO Export
    res = client.get(f"/api/projects/{proj_id}/export")
    assert res.status_code == 200, f"Export failed: {res.text}"
    assert res.headers["content-type"] == "application/zip"
    assert len(res.content) > 0
    print(f"[OK] Exported YOLO dataset zip ({len(res.content)} bytes)")

    # 9. Clear Augmented
    res = client.delete(f"/api/projects/{proj_id}/augmented")
    assert res.status_code == 200
    print(f"[OK] Cleared augmented images (deleted: {res.json()['deleted_count']})")

    # ── Unit tests for NMS and detection postprocessing ────────────────────────
    import numpy as np
    from app.services import inference_service

    # 1. Test NMS
    dets = [
        {'x1': 0.1, 'y1': 0.1, 'x2': 0.3, 'y2': 0.3, 'confidence': 0.9, 'class_idx': 0},
        {'x1': 0.11, 'y1': 0.11, 'x2': 0.31, 'y2': 0.31, 'confidence': 0.8, 'class_idx': 0},
        {'x1': 0.5, 'y1': 0.5, 'x2': 0.7, 'y2': 0.7, 'confidence': 0.85, 'class_idx': 1}
    ]
    kept = inference_service._nms(dets, iou_threshold=0.45)
    assert len(kept) == 2
    print("[OK] NMS suppression algorithm verified")

    # 2. Test YOLOv8 postprocessing
    fake_out8 = np.zeros((1, 6, 10), dtype=np.float32)
    fake_out8[0, 0, 0] = 320.0
    fake_out8[0, 1, 0] = 320.0
    fake_out8[0, 2, 0] = 100.0
    fake_out8[0, 3, 0] = 100.0
    fake_out8[0, 4, 0] = 0.95
    fake_out8[0, 5, 0] = 0.05
    dets8 = inference_service._postprocess_yolov8(
        fake_out8, conf_thresh=0.5, iou_thresh=0.45,
        scale=1.0, pad_x=0, pad_y=0,
        orig_w=640, orig_h=640, input_h=640, input_w=640
    )
    assert len(dets8) == 1 and dets8[0]['class_idx'] == 0
    print("[OK] YOLOv8 postprocessing algorithm verified")

    # 3. Test YOLOv5 postprocessing
    fake_out5 = np.zeros((1, 10, 7), dtype=np.float32)
    fake_out5[0, 0, 0] = 320.0
    fake_out5[0, 0, 1] = 320.0
    fake_out5[0, 0, 2] = 100.0
    fake_out5[0, 0, 3] = 100.0
    fake_out5[0, 0, 4] = 0.9
    fake_out5[0, 0, 5] = 0.1
    fake_out5[0, 0, 6] = 0.9
    dets5 = inference_service._postprocess_yolov5(
        fake_out5, conf_thresh=0.5, iou_thresh=0.45,
        scale=1.0, pad_x=0, pad_y=0,
        orig_w=640, orig_h=640, input_h=640, input_w=640
    )
    assert len(dets5) == 1 and dets5[0]['class_idx'] == 1
    print("[OK] YOLOv5 postprocessing algorithm verified")
    # ────────────────────────────────────────────────────────────────────────────

    # Upload mock ONNX model
    mock_onnx_bytes = b"ONNX_MOCK_MODEL_DATA_FOR_TESTING"
    files = {"file": ("test_model.onnx", io.BytesIO(mock_onnx_bytes), "application/octet-stream")}
    res = client.post(f"/api/projects/{proj_id}/model", files=files)
    assert res.status_code == 200, f"Upload model failed: {res.text}"
    model_data = res.json()
    assert model_data["filename"] == "test_model.onnx"
    print(f"[OK] Uploaded ONNX model: {model_data['filename']}")

    # Get model
    res = client.get(f"/api/projects/{proj_id}/model")
    assert res.status_code == 200
    assert res.json()["id"] == model_data["id"]
    print("[OK] GET model endpoint passed")

    # Manually set class names (since metadata is empty for mock)
    res = client.put(f"/api/projects/{proj_id}/model/classes", json={"classNames": ["car", "pedestrian", "truck"]})
    assert res.status_code == 200
    assert res.json()["classNames"] == ["car", "pedestrian", "truck"]
    assert res.json()["numClasses"] == 3
    print("[OK] PUT model classNames passed")

    # Save class mapping (map 0 -> cls_red, map 1 -> NEW:pedestrian, map 2 -> NEW:truck)
    mapping_payload = {
        "mapping": {
            "0": cls_red["id"],
            "1": "NEW:pedestrian",
            "2": "NEW:truck"
        }
    }
    res = client.put(f"/api/projects/{proj_id}/model/mapping", json=mapping_payload)
    assert res.status_code == 200, f"Mapping failed: {res.text}"
    mapping_res = res.json()
    assert len(mapping_res["newClasses"]) == 2  # pedestrian and truck created
    assert "0" in mapping_res["model"]["classMapping"]
    print(f"[OK] PUT class mapping passed, auto-created {len(mapping_res['newClasses'])} classes")

    # Seed AI suggestions onto an image for accept/reject testing
    test_img_id = images[2]["id"]
    ped_cls_id = next(c["id"] for c in mapping_res["allClasses"] if c["name"] == "pedestrian")
    
    # We directly verify accept suggestions
    # First inject mock suggestion into the database or mock run
    from app.database import SessionLocal
    from app import models as db_models
    db = SessionLocal()
    target_img = db.query(db_models.ProjectImage).filter(db_models.ProjectImage.id == test_img_id).first()
    mock_suggestions = [
        {"id": "sug-1", "classId": cls_red["id"], "x": 0.1, "y": 0.1, "width": 0.2, "height": 0.2, "confidence": 0.92, "modelClassIdx": 0},
        {"id": "sug-2", "classId": ped_cls_id, "x": 0.5, "y": 0.5, "width": 0.3, "height": 0.4, "confidence": 0.85, "modelClassIdx": 1}
    ]
    target_img.ai_suggestions = json.dumps(mock_suggestions)
    target_img.has_suggestions = True
    db.commit()
    db.close()

    # Verify image output shows suggestions
    res = client.get(f"/api/projects/{proj_id}/images")
    img_with_sug = next(img for img in res.json() if img["id"] == test_img_id)
    assert img_with_sug["hasSuggestions"] == True
    assert len(img_with_sug["aiSuggestions"]) == 2
    assert img_with_sug["annotated"] == False  # AI suggestions alone do not count as annotated
    print("[OK] AI suggestions reflected in image model without marking as confirmed annotated")

    # Accept single suggestion (sug-1)
    res = client.post(f"/api/images/{test_img_id}/suggestions/accept", json={"boxIds": ["sug-1"]})
    assert res.status_code == 200
    accepted_single = res.json()
    assert accepted_single["annotated"] == True
    assert len(accepted_single["annotations"]) == 1
    assert len(accepted_single["aiSuggestions"]) == 1
    assert accepted_single["hasSuggestions"] == True
    print("[OK] Accepted single AI suggestion into confirmed annotations")

    # Reject remaining suggestion (sug-2)
    res = client.post(f"/api/images/{test_img_id}/suggestions/reject", json={"boxIds": ["sug-2"]})
    assert res.status_code == 200
    rejected_res = res.json()
    assert len(rejected_res["aiSuggestions"]) == 0
    assert rejected_res["hasSuggestions"] == False
    print("[OK] Rejected remaining AI suggestion")

    # Delete model
    res = client.delete(f"/api/projects/{proj_id}/model")
    assert res.status_code == 200
    print("[OK] Deleted model successfully")
    # ────────────────────────────────────────────────────────────────────────────

    # 10. Delete project
    res = client.delete(f"/api/projects/{proj_id}")
    assert res.status_code == 200
    print("[OK] Deleted project successfully")

    # 11. Static files check
    res = client.get("/")
    assert res.status_code == 200
    assert "boxel" in res.text
    print("[OK] Root index.html served correctly")

    print("\nALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_all()
