"""
training_service.py
Background YOLO model training orchestration.

Manages dataset staging, Ultralytics training execution, live progress
callbacks, cancellation, and output artifact collection — all running
in a daemon thread so the FastAPI event loop stays responsive.
"""

import json
import logging
import shutil
import threading
import time
import traceback
import uuid
from pathlib import Path
from typing import Dict, Optional

from app.database import SessionLocal
from app import models

logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────

ALLOWED_VARIANTS = {
    "yolov8n", "yolov8s", "yolov8m", "yolov8l", "yolov8x",
    "yolo11n", "yolo11s", "yolo11m", "yolo11l", "yolo11x",
}

TRAINING_RUNS_DIR = Path(__file__).parent.parent.parent / 'training_runs'

MIN_TRAIN_IMAGES = 5
MIN_VAL_IMAGES = 1

# ─── Global Training Lock ────────────────────────────────────────────────────
# Only one training job may run across the entire application at a time
# to prevent GPU/VRAM contention on single-GPU machines.

_global_lock = threading.Lock()
_active_job_id: Optional[str] = None
_active_thread: Optional[threading.Thread] = None
_cancel_events: Dict[str, threading.Event] = {}


class TrainingCancelled(Exception):
    """Raised inside the training callback when cancellation is requested."""
    pass


# ─── Validation ───────────────────────────────────────────────────────────────

def validate_project_for_training(db, project_id: str) -> None:
    """Check that a project has enough data to start training.

    Raises ValueError with a specific, plain-language message naming
    exactly what is missing.
    """
    project = db.query(models.Project).filter(
        models.Project.id == project_id
    ).first()

    if not project:
        raise ValueError('Project not found.')

    classes = project.classes
    if not classes or len(classes) == 0:
        raise ValueError(
            'Project has no classes defined. '
            'Add at least one annotation class before training.'
        )

    # Count annotated images per split
    train_images = db.query(models.ProjectImage).filter(
        models.ProjectImage.project_id == project_id,
        models.ProjectImage.split == 'train',
        models.ProjectImage.annotated == True,
    ).count()

    val_images = db.query(models.ProjectImage).filter(
        models.ProjectImage.project_id == project_id,
        models.ProjectImage.split == 'val',
        models.ProjectImage.annotated == True,
    ).count()

    if train_images < MIN_TRAIN_IMAGES:
        raise ValueError(
            f'Only {train_images} annotated image(s) in the training split '
            f'(minimum {MIN_TRAIN_IMAGES} required). '
            f'Annotate more images or adjust your train/val split.'
        )

    if val_images < MIN_VAL_IMAGES:
        raise ValueError(
            f'No annotated images in the validation split '
            f'(minimum {MIN_VAL_IMAGES} required). '
            f'Run auto-split or manually assign at least {MIN_VAL_IMAGES} '
            f'annotated image(s) to validation.'
        )


def is_training_active() -> bool:
    """Return True if a training job is currently running."""
    global _active_job_id, _active_thread
    if _active_job_id is None:
        return False
    if _active_thread is not None and _active_thread.is_alive():
        return True
    # Thread died unexpectedly — clear stale state
    _active_job_id = None
    _active_thread = None
    return False


def get_active_job_id() -> Optional[str]:
    """Return the currently active training job ID, or None."""
    if is_training_active():
        return _active_job_id
    return None


# ─── Background Training Execution ───────────────────────────────────────────

def _run_training_job(job_id: str) -> None:
    """Main training function — runs in a background thread."""
    global _active_job_id, _active_thread

    db = SessionLocal()
    try:
        job = db.query(models.TrainingJob).filter(
            models.TrainingJob.id == job_id
        ).first()

        if not job:
            logger.error(f'Training job {job_id} not found in database')
            return

        # Mark as running
        job.status = 'running'
        job.started_at = time.time() * 1000
        db.commit()

        project = db.query(models.Project).filter(
            models.Project.id == job.project_id
        ).first()

        if not project:
            job.status = 'failed'
            job.error_message = 'Project was deleted before training could start.'
            job.completed_at = time.time() * 1000
            db.commit()
            return

        # ── Stage dataset to disk ────────────────────────────────────────
        run_dir = TRAINING_RUNS_DIR / job_id
        dataset_dir = run_dir / 'dataset'
        output_dir = run_dir / 'output'
        output_dir.mkdir(parents=True, exist_ok=True)

        from app.services.export_service import stage_yolo_dataset_to_disk

        images = db.query(models.ProjectImage).filter(
            models.ProjectImage.project_id == job.project_id,
            models.ProjectImage.split.in_(['train', 'val', 'test']),
            models.ProjectImage.annotated == True,
        ).all()

        classes_data = [{'id': c.id, 'name': c.name} for c in project.classes]
        images_data = []
        for img in images:
            try:
                annotations = json.loads(img.annotations or '[]')
            except Exception:
                annotations = []
            images_data.append({
                'name': img.name,
                'data_url': img.data_url,
                'split': img.split,
                'annotations': annotations,
            })

        logger.info(f'[{job_id}] Staging {len(images_data)} images to {dataset_dir}')
        data_yaml_path = stage_yolo_dataset_to_disk(
            project.name, classes_data, images_data, str(dataset_dir),
        )

        # ── Check for cancellation before the heavy work ─────────────────
        cancel_event = _cancel_events.get(job_id)
        if cancel_event and cancel_event.is_set():
            raise TrainingCancelled()

        # ── Configure and run Ultralytics training ───────────────────────
        import torch
        from ultralytics import YOLO

        is_cuda = torch.cuda.is_available()
        device = '0' if is_cuda else 'cpu'
        logger.info(f'[{job_id}] Device: {device}, Variant: {job.model_variant}')

        model = YOLO(f'{job.model_variant}.pt')

        # Parse batch_size — Ultralytics requires int or float (e.g. -1 for AutoBatch on CUDA, or int like 16)
        raw_batch = str(job.batch_size or 'auto').strip().lower()
        if raw_batch in ('auto', '-1'):
            batch_val = -1 if is_cuda else 16
        else:
            try:
                parsed = int(raw_batch)
                batch_val = parsed if parsed > 0 else (-1 if is_cuda else 16)
            except ValueError:
                batch_val = -1 if is_cuda else 16

        logger.info(f'[{job_id}] Batch size configured: {batch_val} (raw: {job.batch_size})')

        # Register epoch callback for live progress & cancellation
        def on_epoch_end(trainer):
            """Called by Ultralytics at the end of each training epoch."""
            nonlocal db, job

            # Check cancellation
            evt = _cancel_events.get(job_id)
            if evt and evt.is_set():
                raise TrainingCancelled()

            # Update progress in database
            try:
                epoch = trainer.epoch + 1  # 0-indexed → 1-indexed
                job.current_epoch = epoch

                # Collect available metrics
                metrics_entry = {'epoch': epoch}
                if hasattr(trainer, 'metrics') and trainer.metrics:
                    m = trainer.metrics
                    metrics_entry.update({
                        'box_loss': round(float(m.get('train/box_loss', 0)), 5),
                        'cls_loss': round(float(m.get('train/cls_loss', 0)), 5),
                        'dfl_loss': round(float(m.get('train/dfl_loss', 0)), 5),
                        'mAP50': round(float(m.get('metrics/mAP50(B)', 0)), 5),
                        'mAP50_95': round(float(m.get('metrics/mAP50-95(B)', 0)), 5),
                    })
                if hasattr(trainer, 'loss') and trainer.loss is not None:
                    try:
                        loss_val = trainer.loss.item() if hasattr(trainer.loss, 'item') else float(trainer.loss)
                        metrics_entry['total_loss'] = round(loss_val, 5)
                    except Exception:
                        pass

                # Append to metrics log
                try:
                    current_log = json.loads(job.metrics_log or '[]')
                except Exception:
                    current_log = []
                current_log.append(metrics_entry)
                job.metrics_log = json.dumps(current_log)

                db.commit()
                logger.info(f'[{job_id}] Epoch {epoch}/{job.epochs} complete')
            except TrainingCancelled:
                raise
            except Exception as e:
                logger.warning(f'[{job_id}] Failed to update epoch progress: {e}')

        model.add_callback('on_train_epoch_end', on_epoch_end)

        # Run training
        train_dir = run_dir / 'ultralytics_run'
        model.train(
            data=data_yaml_path,
            epochs=job.epochs,
            imgsz=job.imgsz,
            batch=batch_val,
            device=device,
            project=str(train_dir),
            name='run',
            exist_ok=True,
        )

        # ── Collect outputs ──────────────────────────────────────────────
        output_formats = json.loads(job.output_formats or '["pt"]')

        # Find best.pt — Ultralytics saves it under runs/run/weights/best.pt
        best_pt_candidates = list(train_dir.rglob('best.pt'))
        if not best_pt_candidates:
            # Fall back to last.pt
            best_pt_candidates = list(train_dir.rglob('last.pt'))

        if not best_pt_candidates:
            raise RuntimeError(
                'Training completed but no weights file (best.pt or last.pt) '
                'was found in the output directory.'
            )

        best_pt_src = best_pt_candidates[0]

        # Copy .pt to output directory
        if 'pt' in output_formats:
            dest_pt = output_dir / 'best.pt'
            shutil.copy2(str(best_pt_src), str(dest_pt))
            job.output_pt_path = str(dest_pt.resolve())
            logger.info(f'[{job_id}] Saved .pt weights to {dest_pt}')

        # Generate .onnx if requested
        if 'onnx' in output_formats:
            try:
                from app.services.inference_service import convert_pt_to_onnx
                onnx_path = convert_pt_to_onnx(
                    str(best_pt_src),
                    output_dir=str(output_dir),
                    imgsz=job.imgsz,
                )
                job.output_onnx_path = onnx_path
                logger.info(f'[{job_id}] Saved .onnx weights to {onnx_path}')
            except Exception as e:
                logger.warning(f'[{job_id}] ONNX conversion failed: {e}')
                # Training still succeeded — mark .onnx as unavailable
                job.output_onnx_path = None

        # Mark completed
        job.status = 'completed'
        job.current_epoch = job.epochs
        job.completed_at = time.time() * 1000
        db.commit()

        logger.info(f'[{job_id}] Training completed successfully')

    except TrainingCancelled:
        logger.info(f'[{job_id}] Training cancelled by user')
        try:
            job.status = 'cancelled'
            job.completed_at = time.time() * 1000
            db.commit()
        except Exception:
            pass

    except Exception as e:
        error_msg = f'{type(e).__name__}: {str(e)}'
        logger.error(f'[{job_id}] Training failed: {error_msg}')
        logger.debug(traceback.format_exc())
        try:
            job.status = 'failed'
            job.error_message = error_msg
            job.completed_at = time.time() * 1000
            db.commit()
        except Exception:
            pass

    finally:
        # Clean up cancel event
        _cancel_events.pop(job_id, None)

        # Release global lock
        with _global_lock:
            global _active_job_id, _active_thread
            if _active_job_id == job_id:
                _active_job_id = None
                _active_thread = None

        # Clean up staging dataset directory (keep output/ with weights)
        try:
            dataset_cleanup = TRAINING_RUNS_DIR / job_id / 'dataset'
            if dataset_cleanup.exists():
                shutil.rmtree(str(dataset_cleanup), ignore_errors=True)
            ultralytics_cleanup = TRAINING_RUNS_DIR / job_id / 'ultralytics_run'
            if ultralytics_cleanup.exists():
                shutil.rmtree(str(ultralytics_cleanup), ignore_errors=True)
        except Exception as e:
            logger.warning(f'[{job_id}] Cleanup error: {e}')

        db.close()


def start_training_job(job_id: str) -> None:
    """Launch training in a background daemon thread.

    Acquires the global lock and sets ``_active_job_id``.  The caller
    must have already verified that no other job is active.
    """
    global _active_job_id, _active_thread

    with _global_lock:
        _active_job_id = job_id
        cancel_event = threading.Event()
        _cancel_events[job_id] = cancel_event

        thread = threading.Thread(
            target=_run_training_job,
            args=(job_id,),
            daemon=True,
            name=f'training-{job_id}',
        )
        _active_thread = thread
        thread.start()


def cancel_training_job(job_id: str) -> bool:
    """Signal a running training job to stop.

    Returns True if the cancellation signal was sent, False if no
    cancel event exists for this job (already finished or never started).
    """
    cancel_event = _cancel_events.get(job_id)
    if cancel_event:
        cancel_event.set()
        return True
    return False


def recover_interrupted_jobs() -> int:
    """Mark any queued/running training jobs as failed.

    Called on application startup to clean up jobs that were interrupted
    by a server restart, crash, or reload.  Returns the number of
    jobs recovered.
    """
    db = SessionLocal()
    try:
        stale = db.query(models.TrainingJob).filter(
            models.TrainingJob.status.in_(['queued', 'running'])
        ).all()

        for job in stale:
            job.status = 'failed'
            job.error_message = (
                'Interrupted by server restart. '
                'Start a new training job to retry.'
            )
            job.completed_at = time.time() * 1000

        if stale:
            db.commit()
            logger.info(
                f'[startup] Marked {len(stale)} interrupted training '
                f'job(s) as failed.'
            )

        return len(stale)
    finally:
        db.close()
