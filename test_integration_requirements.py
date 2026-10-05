"""
test_integration_requirements.py
Comprehensive automated test suite for Boxel ↔ Wildlife App Architecture B integration.
"""

import json
import os
import shutil
import time
from pathlib import Path
from fastapi.testclient import TestClient

from main import app
from app.database import SessionLocal
from app import models
from app.services.training_service import recover_interrupted_jobs

client = TestClient(app)

REPO_ROOT = Path(__file__).parent
WILDLIFE_DIR = REPO_ROOT / 'wildlife'


def run_all_tests():
    print("=" * 70)
    print("RUNNING ARCHITECTURE B INTEGRATION TEST SUITE")
    print("=" * 70)

    db = SessionLocal()
    # Clean up any leftover test jobs from previous failed runs
    for test_id in ['train-test-stuck-job', 'train-test-multi', 'train-test-single-1', 'train-test-single-2']:
        existing_j = db.query(models.TrainingJob).filter(models.TrainingJob.id == test_id).first()
        if existing_j:
            db.delete(existing_j)
    for test_p in ['proj-test-multi', 'proj-test-single']:
        existing_p = db.query(models.Project).filter(models.Project.id == test_p).first()
        if existing_p:
            db.delete(existing_p)
    db.commit()

    # ── Test 0: Orphaned Job Recovery on Startup ───────────────────────────────
    print("\n[TEST 0] Verifying orphaned job recovery...")
    dummy_job = models.TrainingJob(
        id='train-test-stuck-job',
        project_id='proj-nonexistent',
        status='running',
        model_variant='yolov8n',
        epochs=10,
        imgsz=640,
        batch_size='auto',
        output_formats='["pt"]',
        created_at=time.time() * 1000,
        started_at=time.time() * 1000,
    )
    db.add(dummy_job)
    db.commit()


    recovered_count = recover_interrupted_jobs()
    db.close()
    db = SessionLocal()
    refreshed_job = db.query(models.TrainingJob).filter(models.TrainingJob.id == 'train-test-stuck-job').first()
    assert refreshed_job.status == 'failed', f"Expected failed, got {refreshed_job.status}"
    assert refreshed_job.error_message == 'Interrupted by server restart or crash', f"Got {refreshed_job.error_message}"
    print(f"  [PASS] Stuck job correctly transitioned to 'failed' with exact message: '{refreshed_job.error_message}'")
    db.delete(refreshed_job)
    db.commit()


    # ── Test 1: SpeciesModule Seeding ──────────────────────────────────────────
    print("\n[TEST 1] Verifying seeded species modules...")
    res = client.get('/api/species-modules')
    assert res.status_code == 200, f"Failed: {res.text}"
    modules = res.json()
    slugs = [m['slug'] for m in modules]
    assert 'blackbuck' in slugs, "blackbuck not seeded"
    assert 'turtle' in slugs, "turtle not seeded"
    print(f"  [PASS] Seeded species modules: {slugs}")

    # ── Test 2: Dynamic Species Module Management (Add/Delete/Config Update) ───
    print("\n[TEST 2] Verifying dynamic species module management...")
    test_cfg_relpath = 'config/test_elephant_config.json'
    test_cfg_file = WILDLIFE_DIR / test_cfg_relpath
    test_cfg_file.parent.mkdir(parents=True, exist_ok=True)
    with open(test_cfg_file, 'w', encoding='utf-8') as f:
        json.dump({"model_path": "models/old_elephant.pt", "confidence": 0.25}, f, indent=2)

    try:
        # Create module
        create_res = client.post('/api/species-modules', json={
            "slug": "elephant",
            "display_name": "Elephant Tracking",
            "wildlife_config_relpath": test_cfg_relpath,
        })
        assert create_res.status_code == 201, f"Create failed: {create_res.text}"
        data = create_res.json()
        assert data['slug'] == 'elephant'
        assert data['displayName'] == 'Elephant Tracking'

        # Check config file was automatically updated
        with open(test_cfg_file, 'r', encoding='utf-8') as f:
            updated_cfg = json.load(f)
        assert updated_cfg['model_path'] == 'shared_models/elephant/active.pt', f"Got {updated_cfg['model_path']}"
        print(f"  [PASS] Created module 'elephant' and verified {test_cfg_relpath} model_path updated to '{updated_cfg['model_path']}'")

        # Duplicate slug rejection
        dup_res = client.post('/api/species-modules', json={
            "slug": "elephant",
            "display_name": "Elephant Duplicate",
            "wildlife_config_relpath": test_cfg_relpath,
        })
        assert dup_res.status_code == 400, "Duplicate slug should be rejected"
        print("  [PASS] Duplicate slug rejected with 400")

        # Invalid config path rejection
        bad_res = client.post('/api/species-modules', json={
            "slug": "bad_module",
            "display_name": "Bad",
            "wildlife_config_relpath": "config/does_not_exist.json",
        })
        assert bad_res.status_code == 400, "Non-existent config path should be rejected"
        print("  [PASS] Non-existent config path rejected with 400")

    finally:
        # Cleanup elephant module
        client.delete('/api/species-modules/elephant')
        if test_cfg_file.exists():
            test_cfg_file.unlink()

    # ── Test 3: Multi-class Activation Rejection ────────────────────────────────
    print("\n[TEST 3] Verifying multi-class activation rejection...")
    # Create multi-class project
    multi_proj = models.Project(
        id='proj-test-multi',
        name='Multi Class Test Project',
        created_at=time.time() * 1000,
        image_count=10,
    )
    db.add(multi_proj)
    db.commit()

    cls1 = models.ProjectClass(id='cls-test-1', project_id=multi_proj.id, name='deer', color='#FF0000')
    cls2 = models.ProjectClass(id='cls-test-2', project_id=multi_proj.id, name='tiger', color='#00FF00')
    db.add(cls1)
    db.add(cls2)

    # Dummy pt file
    test_pt_dir = REPO_ROOT / 'training_runs' / 'train-test-multi' / 'output'
    test_pt_dir.mkdir(parents=True, exist_ok=True)
    test_pt_path = test_pt_dir / 'best.pt'
    # Copy an existing real weights file or create dummy
    real_sample_pt = REPO_ROOT / 'models' / 'best.pt'
    if real_sample_pt.exists():
        shutil.copyfile(str(real_sample_pt), str(test_pt_path))
    else:
        test_pt_path.write_bytes(b'dummy_weights')

    multi_job = models.TrainingJob(
        id='train-test-multi',
        project_id=multi_proj.id,
        status='completed',
        model_variant='yolov8n',
        epochs=10,
        imgsz=640,
        batch_size='auto',
        output_formats='["pt"]',
        output_pt_path=str(test_pt_path.resolve()),
        created_at=time.time() * 1000,
        completed_at=time.time() * 1000,
    )
    db.add(multi_job)
    db.commit()

    act_multi_res = client.post(
        f'/api/projects/{multi_proj.id}/train/jobs/{multi_job.id}/activate',
        json={"species_slug": "blackbuck"}
    )
    assert act_multi_res.status_code == 400, f"Expected 400 for multi-class, got {act_multi_res.status_code}: {act_multi_res.text}"
    err_detail = act_multi_res.json()['detail']
    assert '2 classes defined' in err_detail or 'single-class' in err_detail, f"Unexpected message: {err_detail}"
    print(f"  [PASS] Multi-class project activation correctly rejected with error: '{err_detail}'")

    # ── Test 4: Single-Class Activation & Atomic Shared Files Deployment ───────
    print("\n[TEST 4] Verifying single-class activation & atomic model deployment...")
    single_proj = models.Project(
        id='proj-test-single',
        name='Single Class Blackbuck Project',
        created_at=time.time() * 1000,
        image_count=10,
    )
    db.add(single_proj)
    db.commit()

    cls_single = models.ProjectClass(id='cls-test-single', project_id=single_proj.id, name='blackbuck', color='#3DA9FC')
    db.add(cls_single)

    single_job1_dir = REPO_ROOT / 'training_runs' / 'train-test-single-1' / 'output'
    single_job1_dir.mkdir(parents=True, exist_ok=True)
    single_job1_pt = single_job1_dir / 'best.pt'
    if real_sample_pt.exists():
        shutil.copyfile(str(real_sample_pt), str(single_job1_pt))
    else:
        single_job1_pt.write_bytes(b'dummy_weights_1')

    single_job1 = models.TrainingJob(
        id='train-test-single-1',
        project_id=single_proj.id,
        status='completed',
        model_variant='yolov8n',
        epochs=25,
        imgsz=640,
        batch_size='auto',
        output_formats='["pt"]',
        output_pt_path=str(single_job1_pt.resolve()),
        metrics_log=json.dumps([{"epoch": 25, "mAP50": 0.88, "box_loss": 0.03}]),
        created_at=time.time() * 1000,
        completed_at=time.time() * 1000,
    )
    db.add(single_job1)
    db.commit()

    act_res1 = client.post(
        f'/api/projects/{single_proj.id}/train/jobs/{single_job1.id}/activate',
        json={"species_slug": "blackbuck"}
    )
    assert act_res1.status_code == 200, f"Activation failed: {act_res1.text}"
    job1_out = act_res1.json()
    assert job1_out['isActive'] is True
    assert job1_out['speciesSlug'] == 'blackbuck'

    # Verify physical file at shared_models/blackbuck/active.pt
    shared_pt_wildlife = WILDLIFE_DIR / 'shared_models' / 'blackbuck' / 'active.pt'
    shared_json_wildlife = WILDLIFE_DIR / 'shared_models' / 'blackbuck' / 'active.json'
    shared_pt_root = REPO_ROOT / 'shared_models' / 'blackbuck' / 'active.pt'
    shared_json_root = REPO_ROOT / 'shared_models' / 'blackbuck' / 'active.json'

    assert shared_pt_wildlife.exists(), "active.pt not found in wildlife/shared_models"
    assert shared_json_wildlife.exists(), "active.json not found in wildlife/shared_models"
    assert shared_pt_root.exists(), "active.pt not found in repo_root/shared_models"

    with open(shared_json_wildlife, 'r', encoding='utf-8') as f:
        meta = json.load(f)
    assert meta['job_id'] == 'train-test-single-1'
    assert meta['species_slug'] == 'blackbuck'
    assert meta['metrics']['mAP50'] == 0.88

    # Verify loadable with ultralytics YOLO if real weights were used
    if real_sample_pt.exists():
        from ultralytics import YOLO
        yolo_model = YOLO(str(shared_pt_wildlife))
        assert yolo_model is not None
        print("  [PASS] Verified active.pt is a real, independently loadable YOLO weights file via ultralytics.YOLO()")

    print(f"  [PASS] Activated job {single_job1.id} -> shared_models/blackbuck/active.pt and active.json written successfully")

    # ── Test 5: Activating Second Job Deactivates First ─────────────────────────
    print("\n[TEST 5] Verifying second job activation deactivates first...")
    single_job2_dir = REPO_ROOT / 'training_runs' / 'train-test-single-2' / 'output'
    single_job2_dir.mkdir(parents=True, exist_ok=True)
    single_job2_pt = single_job2_dir / 'best.pt'
    if real_sample_pt.exists():
        shutil.copyfile(str(real_sample_pt), str(single_job2_pt))
    else:
        single_job2_pt.write_bytes(b'dummy_weights_2')

    single_job2 = models.TrainingJob(
        id='train-test-single-2',
        project_id=single_proj.id,
        status='completed',
        model_variant='yolov8s',
        epochs=50,
        imgsz=640,
        batch_size='auto',
        output_formats='["pt"]',
        output_pt_path=str(single_job2_pt.resolve()),
        metrics_log=json.dumps([{"epoch": 50, "mAP50": 0.94, "box_loss": 0.02}]),
        created_at=time.time() * 1000 + 1000,
        completed_at=time.time() * 1000 + 2000,
    )
    db.add(single_job2)
    db.commit()


    act_res2 = client.post(
        f'/api/projects/{single_proj.id}/train/jobs/{single_job2.id}/activate',
        json={"species_slug": "blackbuck"}
    )
    assert act_res2.status_code == 200

    db.refresh(single_job1)
    db.refresh(single_job2)
    assert single_job1.is_active is False, f"Job 1 should be deactivated, but is_active={single_job1.is_active}"
    assert single_job2.is_active is True, f"Job 2 should be active, but is_active={single_job2.is_active}"

    with open(shared_json_wildlife, 'r', encoding='utf-8') as f:
        meta2 = json.load(f)
    assert meta2['job_id'] == 'train-test-single-2'
    assert meta2['metrics']['mAP50'] == 0.94
    print(f"  [PASS] Job 2 ({single_job2.id}) activated; Job 1 ({single_job1.id}) successfully deactivated")

    # ── Test 6: GET /api/species-models ────────────────────────────────────────
    print("\n[TEST 6] Verifying GET /api/species-models...")
    spec_models_res = client.get('/api/species-models')
    assert spec_models_res.status_code == 200
    models_status = spec_models_res.json()
    bb_status = next(s for s in models_status if s['speciesSlug'] == 'blackbuck')
    assert bb_status['hasActiveModel'] is True
    assert bb_status['activeJobId'] == 'train-test-single-2'
    assert bb_status['activeProjectName'] == 'Single Class Blackbuck Project'
    assert bb_status['metadata']['metrics']['mAP50'] == 0.94
    print(f"  [PASS] GET /api/species-models returned active status and metadata: {bb_status['speciesSlug']} -> {bb_status['activeJobId']}")

    # ── Test 7: Block Deletion of Active Species Module ────────────────────────
    print("\n[TEST 7] Verifying blocked deletion for active species module...")
    del_active_res = client.delete('/api/species-modules/blackbuck')
    assert del_active_res.status_code == 400, "Should block deletion of active species module"
    assert "currently active" in del_active_res.json()['detail']
    print(f"  [PASS] Blocked deletion of active module: '{del_active_res.json()['detail']}'")

    # Clean up test database rows and test folders
    print("\nCleaning up test artifacts...")
    db.delete(single_job1)
    db.delete(single_job2)
    db.delete(multi_job)
    db.delete(cls_single)
    db.delete(cls1)
    db.delete(cls2)
    db.delete(single_proj)
    db.delete(multi_proj)
    db.commit()
    db.close()

    for p in [single_job1_dir.parent, single_job2_dir.parent, test_pt_dir.parent]:
        shutil.rmtree(str(p), ignore_errors=True)

    print("\n" + "=" * 70)
    print("ALL INTEGRATION TESTS PASSED SUCCESSFULLY! [PASS]")
    print("=" * 70)



if __name__ == '__main__':
    run_all_tests()
