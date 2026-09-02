"""
training.py
FastAPI router for YOLO model training endpoints.
"""

import json
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.schemas import StartTrainingRequest, TrainingJobOut
from app.services.training_service import (
    ALLOWED_VARIANTS,
    validate_project_for_training,
    is_training_active,
    get_active_job_id,
    start_training_job,
    cancel_training_job,
)

router = APIRouter(tags=['training'])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _job_to_out(job: models.TrainingJob) -> dict:
    """Convert a TrainingJob ORM row to a TrainingJobOut-compatible dict."""
    try:
        output_formats = json.loads(job.output_formats or '[]')
    except Exception:
        output_formats = []
    try:
        metrics_log = json.loads(job.metrics_log or '[]')
    except Exception:
        metrics_log = []

    return {
        'id': job.id,
        'projectId': job.project_id,
        'status': job.status,
        'modelVariant': job.model_variant,
        'epochs': job.epochs,
        'imgsz': job.imgsz,
        'batchSize': job.batch_size,
        'outputFormats': output_formats,
        'createdAt': job.created_at,
        'startedAt': job.started_at,
        'completedAt': job.completed_at,
        'currentEpoch': job.current_epoch,
        'metricsLog': metrics_log,
        'errorMessage': job.error_message,
        'hasPt': bool(job.output_pt_path and Path(job.output_pt_path).exists()),
        'hasOnnx': bool(job.output_onnx_path and Path(job.output_onnx_path).exists()),
    }


# ─── POST /api/projects/{id}/train — Start Training ──────────────────────────

@router.post('/api/projects/{project_id}/train', status_code=202)
def start_training(
    project_id: str,
    req: StartTrainingRequest,
    db: Session = Depends(get_db),
):
    """Start a new YOLO training job for this project."""

    # 1. Validate project exists
    project = db.query(models.Project).filter(
        models.Project.id == project_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail='Project not found.')

    # 2. Validate model variant
    if req.model_variant not in ALLOWED_VARIANTS:
        raise HTTPException(
            status_code=400,
            detail=(
                f'Invalid model variant "{req.model_variant}". '
                f'Supported variants: {", ".join(sorted(ALLOWED_VARIANTS))}'
            ),
        )

    # 3. Validate output formats
    valid_formats = {'pt', 'onnx'}
    for fmt in req.output_formats:
        if fmt not in valid_formats:
            raise HTTPException(
                status_code=400,
                detail=(
                    f'Invalid output format "{fmt}". '
                    f'Supported formats: {", ".join(sorted(valid_formats))}'
                ),
            )
    if not req.output_formats:
        raise HTTPException(
            status_code=400,
            detail='At least one output format (pt or onnx) must be specified.',
        )

    # 4. Validate project has enough data
    try:
        validate_project_for_training(db, project_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 5. Global lock: only one training job across the entire app
    if is_training_active():
        active_id = get_active_job_id()
        # Try to find the active job's project name for a helpful message
        active_detail = f'job {active_id}'
        if active_id:
            active_job = db.query(models.TrainingJob).filter(
                models.TrainingJob.id == active_id
            ).first()
            if active_job:
                active_project = db.query(models.Project).filter(
                    models.Project.id == active_job.project_id
                ).first()
                if active_project:
                    active_detail = (
                        f'job {active_id} on project "{active_project.name}"'
                    )
        raise HTTPException(
            status_code=409,
            detail=(
                f'A training job is already running ({active_detail}). '
                f'Only one training job can run at a time across all projects. '
                f'Wait for it to complete or cancel it first.'
            ),
        )

    # 6. Per-project defense-in-depth: no queued/running job for this project
    existing = db.query(models.TrainingJob).filter(
        models.TrainingJob.project_id == project_id,
        models.TrainingJob.status.in_(['queued', 'running']),
    ).first()
    if existing:
        raise HTTPException(
            status_code=409,
            detail=(
                f'This project already has an active training job '
                f'({existing.id}, status: {existing.status}). '
                f'Wait for it to complete or cancel it first.'
            ),
        )

    # 7. Create the training job
    job = models.TrainingJob(
        id=f'train-{uuid.uuid4().hex[:12]}',
        project_id=project_id,
        status='queued',
        model_variant=req.model_variant,
        epochs=req.epochs,
        imgsz=req.imgsz,
        batch_size=req.batch_size,
        output_formats=json.dumps(req.output_formats),
        created_at=time.time() * 1000,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # 8. Launch background training
    start_training_job(job.id)

    # 9. Return immediately
    return _job_to_out(job)


# ─── GET /api/projects/{id}/train/jobs — List Jobs ───────────────────────────

@router.get('/api/projects/{project_id}/train/jobs')
def list_training_jobs(
    project_id: str,
    db: Session = Depends(get_db),
):
    """List all training jobs for this project (newest first)."""
    project = db.query(models.Project).filter(
        models.Project.id == project_id
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail='Project not found.')

    jobs = db.query(models.TrainingJob).filter(
        models.TrainingJob.project_id == project_id,
    ).order_by(models.TrainingJob.created_at.desc()).all()

    return [_job_to_out(job) for job in jobs]


# ─── GET /api/projects/{id}/train/jobs/{job_id} — Job Detail ─────────────────

@router.get('/api/projects/{project_id}/train/jobs/{job_id}')
def get_training_job(
    project_id: str,
    job_id: str,
    db: Session = Depends(get_db),
):
    """Get full detail for a single training job."""
    job = db.query(models.TrainingJob).filter(
        models.TrainingJob.id == job_id,
        models.TrainingJob.project_id == project_id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail='Training job not found.')

    return _job_to_out(job)


# ─── POST /api/projects/{id}/train/jobs/{job_id}/cancel — Cancel Job ─────────

@router.post('/api/projects/{project_id}/train/jobs/{job_id}/cancel')
def cancel_training(
    project_id: str,
    job_id: str,
    db: Session = Depends(get_db),
):
    """Cancel a queued or running training job."""
    job = db.query(models.TrainingJob).filter(
        models.TrainingJob.id == job_id,
        models.TrainingJob.project_id == project_id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail='Training job not found.')

    if job.status not in ('queued', 'running'):
        raise HTTPException(
            status_code=400,
            detail=(
                f'Cannot cancel a job with status "{job.status}". '
                f'Only queued or running jobs can be cancelled.'
            ),
        )

    # If queued (hasn't started yet), just mark it directly
    if job.status == 'queued':
        job.status = 'cancelled'
        job.completed_at = time.time() * 1000
        db.commit()
        db.refresh(job)
        return _job_to_out(job)

    # If running, signal the training thread to stop
    signalled = cancel_training_job(job_id)
    if not signalled:
        # Thread already finished or no event — force status update
        job.status = 'cancelled'
        job.completed_at = time.time() * 1000
        db.commit()
        db.refresh(job)

    # Re-read to get updated status (callback may have already set it)
    db.refresh(job)
    return _job_to_out(job)


# ─── GET /api/projects/{id}/train/jobs/{job_id}/download — Download Weights ──

@router.get('/api/projects/{project_id}/train/jobs/{job_id}/download')
def download_training_output(
    project_id: str,
    job_id: str,
    format: str = Query(..., description='Output format: "pt" or "onnx"'),
    db: Session = Depends(get_db),
):
    """Download the trained model weights file."""
    job = db.query(models.TrainingJob).filter(
        models.TrainingJob.id == job_id,
        models.TrainingJob.project_id == project_id,
    ).first()
    if not job:
        raise HTTPException(status_code=404, detail='Training job not found.')

    if job.status != 'completed':
        raise HTTPException(
            status_code=400,
            detail=(
                f'Cannot download weights from a job with status "{job.status}". '
                f'Only completed jobs have downloadable output.'
            ),
        )

    if format == 'pt':
        file_path = job.output_pt_path
        media_type = 'application/octet-stream'
        filename = f'{job.model_variant}_best.pt'
    elif format == 'onnx':
        file_path = job.output_onnx_path
        media_type = 'application/octet-stream'
        filename = f'{job.model_variant}_best.onnx'
    else:
        raise HTTPException(
            status_code=400,
            detail=f'Invalid format "{format}". Must be "pt" or "onnx".',
        )

    if not file_path or not Path(file_path).exists():
        raise HTTPException(
            status_code=404,
            detail=(
                f'The {format.upper()} output file is not available for this job. '
                f'It may not have been requested in output_formats or conversion failed.'
            ),
        )

    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=filename,
    )
