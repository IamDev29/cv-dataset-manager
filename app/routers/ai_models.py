"""
ai_models.py — FastAPI router for AI model management, inference, and suggestion review.

Endpoints:
  POST   /api/projects/{id}/model              — upload ONNX model
  GET    /api/projects/{id}/model              — get model info
  DELETE /api/projects/{id}/model              — remove model
  PUT    /api/projects/{id}/model/classes      — manually set class names
  PUT    /api/projects/{id}/model/mapping      — save class mapping (creates new project classes)
  POST   /api/projects/{id}/infer             — run inference on specified images
  POST   /api/projects/{id}/infer/unannotated — run on all unannotated+no-suggestions images
  POST   /api/images/{id}/suggestions/accept  — accept subset or all suggestions
  POST   /api/images/{id}/suggestions/reject  — reject subset or all suggestions
"""

import os
import json
import uuid
import time
import shutil
import logging
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.schemas import (
    ProjectModelOut, SetModelClassesRequest, SetMappingRequest,
    RunInferenceRequest, AcceptSuggestionsRequest, RejectSuggestionsRequest
)
from app.routers.images import image_to_out
from app.services import inference_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=['ai-models'])

# Directory where uploaded models are stored (relative to project root)
MODELS_DIR = Path(__file__).parent.parent.parent / 'models'

# Auto-color palette (same as frontend CLASS_COLORS)
CLASS_COLORS = [
    '#FF4D4D', '#3DA9FC', '#00E5A3', '#FFB020', '#D846FF',
    '#FF5E97', '#00F5FF', '#FF7A00', '#9DFF00', '#9E66FF',
    '#10B981', '#FF9F1C', '#38BDF8', '#F472B6', '#A78BFA',
]

def _auto_color(existing_count: int) -> str:
    return CLASS_COLORS[existing_count % len(CLASS_COLORS)]

def _model_to_out(m: models.ProjectModel) -> dict:
    try:
        class_names = json.loads(m.class_names) if m.class_names else None
    except Exception:
        class_names = None
    try:
        class_mapping = json.loads(m.class_mapping) if m.class_mapping else {}
    except Exception:
        class_mapping = {}
    try:
        input_shape = json.loads(m.input_shape) if m.input_shape else [640, 640]
    except Exception:
        input_shape = [640, 640]
    return {
        'id': m.id,
        'projectId': m.project_id,
        'filename': m.filename,
        'classNames': class_names,
        'numClasses': m.num_classes,
        'classMapping': class_mapping,
        'confidenceThreshold': m.confidence_threshold,
        'inputShape': input_shape,
    }

def _require_model(project_id: str, db: Session) -> models.ProjectModel:
    m = db.query(models.ProjectModel).filter(
        models.ProjectModel.project_id == project_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail='No model uploaded for this project.')
    return m

# ─── Model management ─────────────────────────────────────────────────────────

@router.post('/api/projects/{project_id}/model')
async def upload_model(project_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail='Project not found')

    filename = file.filename or 'model.onnx'
    if not filename.lower().endswith('.onnx'):
        raise HTTPException(status_code=400, detail='Only .onnx model files are supported.')

    # Save file to disk
    model_dir = MODELS_DIR / project_id
    model_dir.mkdir(parents=True, exist_ok=True)
    file_path = model_dir / 'model.onnx'

    content = await file.read()
    with open(file_path, 'wb') as f:
        f.write(content)

    # Evict any old cached session
    inference_service.evict_model_cache(str(file_path))

    # Try to extract class names and input shape
    class_names = None
    input_shape = [640, 640]
    num_classes = 0
    try:
        class_names = inference_service.extract_class_names(str(file_path))
        shape, nc = inference_service.get_model_info(str(file_path))
        input_shape = shape
        num_classes = nc if class_names is None else len(class_names)
    except Exception as e:
        logger.warning(f"Could not read model metadata: {e}")

    # Remove old model DB row if exists
    existing = db.query(models.ProjectModel).filter(
        models.ProjectModel.project_id == project_id
    ).first()
    if existing:
        db.delete(existing)
        db.flush()

    mdl = models.ProjectModel(
        id=f'mdl-{uuid.uuid4().hex[:12]}',
        project_id=project_id,
        filename=filename,
        file_path=str(file_path),
        class_names=json.dumps(class_names) if class_names is not None else None,
        class_mapping='{}',
        num_classes=num_classes,
        input_shape=json.dumps(input_shape),
        confidence_threshold=0.5,
        created_at=time.time() * 1000,
    )
    db.add(mdl)
    db.commit()
    db.refresh(mdl)
    return _model_to_out(mdl)

@router.get('/api/projects/{project_id}/model')
def get_model(project_id: str, db: Session = Depends(get_db)):
    m = db.query(models.ProjectModel).filter(
        models.ProjectModel.project_id == project_id
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail='No model uploaded for this project.')
    return _model_to_out(m)

@router.delete('/api/projects/{project_id}/model')
def delete_model(project_id: str, db: Session = Depends(get_db)):
    m = _require_model(project_id, db)

    # Remove cached session and file
    inference_service.evict_model_cache(m.file_path)
    try:
        model_dir = Path(m.file_path).parent
        if model_dir.exists():
            shutil.rmtree(model_dir)
    except Exception as e:
        logger.warning(f"Could not remove model file: {e}")

    db.delete(m)
    db.commit()
    return {'ok': True}

# ─── Class names ──────────────────────────────────────────────────────────────

@router.put('/api/projects/{project_id}/model/classes')
def set_model_classes(project_id: str, req: SetModelClassesRequest, db: Session = Depends(get_db)):
    m = _require_model(project_id, db)
    if not req.classNames:
        raise HTTPException(status_code=400, detail='classNames must be a non-empty list.')
    m.class_names = json.dumps(req.classNames)
    m.num_classes = len(req.classNames)
    db.commit()
    db.refresh(m)
    return _model_to_out(m)

# ─── Class mapping ────────────────────────────────────────────────────────────

@router.put('/api/projects/{project_id}/model/mapping')
def set_class_mapping(project_id: str, req: SetMappingRequest, db: Session = Depends(get_db)):
    """
    mapping values can be:
      - an existing project class id  ("cls-xxxx")
      - "NEW:<class_name>"            (creates a new project class with auto-color)
    """
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail='Project not found')
    m = _require_model(project_id, db)

    resolved_mapping = {}
    new_classes_created = []

    for idx_str, value in req.mapping.items():
        if value.startswith('NEW:'):
            new_name = value[4:].strip()
            if not new_name:
                continue
            # Check if class already exists
            existing_cls = next(
                (c for c in project.classes if c.name.lower() == new_name.lower()), None
            )
            if existing_cls:
                resolved_mapping[idx_str] = existing_cls.id
            else:
                color = _auto_color(len(project.classes) + len(new_classes_created))
                new_cls = models.ProjectClass(
                    id=f'cls-{uuid.uuid4().hex[:12]}',
                    project_id=project_id,
                    name=new_name,
                    color=color,
                )
                db.add(new_cls)
                new_classes_created.append(new_cls)
                resolved_mapping[idx_str] = new_cls.id
        else:
            resolved_mapping[idx_str] = value

    m.class_mapping = json.dumps(resolved_mapping)
    db.commit()
    db.refresh(m)
    db.refresh(project)

    return {
        'model': _model_to_out(m),
        'newClasses': [{'id': c.id, 'name': c.name, 'color': c.color} for c in new_classes_created],
        'allClasses': [{'id': c.id, 'name': c.name, 'color': c.color} for c in project.classes],
    }

# ─── Inference ───────────────────────────────────────────────────────────────

def _run_inference_on_images(
    images: List[models.ProjectImage],
    model: models.ProjectModel,
    conf_thresh: float,
    db: Session
) -> List[dict]:
    """Core logic: run inference on a list of images and store ai_suggestions."""
    try:
        class_mapping = json.loads(model.class_mapping) if model.class_mapping else {}
        input_shape = json.loads(model.input_shape) if model.input_shape else [640, 640]
    except Exception:
        class_mapping = {}
        input_shape = [640, 640]

    if not os.path.exists(model.file_path):
        raise HTTPException(status_code=400, detail='Model file not found on server. Please re-upload.')

    updated = []
    for img in images:
        try:
            raw_dets = inference_service.run_inference(
                model.file_path,
                img.data_url,
                conf_thresh=conf_thresh,
                input_shape=input_shape
            )
        except Exception as e:
            logger.error(f"Inference failed on {img.name}: {e}")
            continue

        suggestions = []
        for det in raw_dets:
            class_idx_str = str(det['class_idx'])
            project_class_id = class_mapping.get(class_idx_str, '')
            if not project_class_id:
                # Unmapped class — skip (user hasn't mapped it)
                continue
            suggestions.append({
                'id': f'sug-{uuid.uuid4().hex[:10]}',
                'classId': project_class_id,
                'x': float(det['x']),
                'y': float(det['y']),
                'width': float(det['width']),
                'height': float(det['height']),
                'confidence': round(float(det['confidence']), 4),
                'modelClassIdx': int(det['class_idx']),
            })

        img.ai_suggestions = json.dumps(suggestions)
        img.has_suggestions = len(suggestions) > 0
        updated.append(img)

    db.commit()
    for img in updated:
        db.refresh(img)
    return [image_to_out(img) for img in updated]

@router.post('/api/projects/{project_id}/infer')
def run_inference(project_id: str, req: RunInferenceRequest, db: Session = Depends(get_db)):
    model = _require_model(project_id, db)

    if not req.imageIds:
        raise HTTPException(status_code=400, detail='imageIds must not be empty.')

    images = db.query(models.ProjectImage).filter(
        models.ProjectImage.id.in_(req.imageIds),
        models.ProjectImage.project_id == project_id,
    ).all()

    if not images:
        raise HTTPException(status_code=404, detail='No matching images found.')

    conf = req.confidenceThreshold
    if conf is not None:
        model.confidence_threshold = conf
        db.commit()

    return _run_inference_on_images(images, model, conf or model.confidence_threshold, db)

@router.post('/api/projects/{project_id}/infer/unannotated')
def run_inference_unannotated(
    project_id: str,
    req: RunInferenceRequest,
    db: Session = Depends(get_db)
):
    """Run inference on all images that have no confirmed annotations AND no existing suggestions."""
    model = _require_model(project_id, db)

    images = db.query(models.ProjectImage).filter(
        models.ProjectImage.project_id == project_id,
        models.ProjectImage.annotated == False,
        models.ProjectImage.has_suggestions == False,
        models.ProjectImage.is_augmented == False,
    ).all()

    if not images:
        raise HTTPException(status_code=400, detail='No eligible unannotated images without existing suggestions.')

    conf = req.confidenceThreshold if req.confidenceThreshold is not None else model.confidence_threshold
    model.confidence_threshold = conf
    db.commit()

    return _run_inference_on_images(images, model, conf, db)

# ─── Suggestion review ────────────────────────────────────────────────────────

@router.post('/api/images/{image_id}/suggestions/accept')
def accept_suggestions(image_id: str, req: AcceptSuggestionsRequest, db: Session = Depends(get_db)):
    """
    Accept a subset of AI suggestions (or all if boxIds is empty).
    Accepted suggestions become full BoundingBox annotations.
    """
    img = db.query(models.ProjectImage).filter(models.ProjectImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail='Image not found')

    try:
        suggestions = json.loads(img.ai_suggestions or '[]')
        current_annotations = json.loads(img.annotations or '[]')
    except Exception:
        suggestions = []
        current_annotations = []

    accept_all = len(req.boxIds) == 0
    accept_ids = set(req.boxIds)

    accepted = []
    remaining = []
    for sug in suggestions:
        if accept_all or sug.get('id') in accept_ids:
            # Convert to a confirmed BoundingBox (drop confidence + modelClassIdx)
            box = {
                'id': f'box-{uuid.uuid4().hex[:10]}',
                'classId': sug['classId'],
                'x': sug['x'],
                'y': sug['y'],
                'width': sug['width'],
                'height': sug['height'],
            }
            accepted.append(box)
        else:
            remaining.append(sug)

    current_annotations.extend(accepted)
    img.annotations = json.dumps(current_annotations)
    img.annotated = len(current_annotations) > 0
    img.ai_suggestions = json.dumps(remaining)
    img.has_suggestions = len(remaining) > 0

    db.commit()
    db.refresh(img)
    return image_to_out(img)

@router.post('/api/images/{image_id}/suggestions/reject')
def reject_suggestions(image_id: str, req: RejectSuggestionsRequest, db: Session = Depends(get_db)):
    """
    Reject (discard) a subset of AI suggestions (or all if boxIds is empty).
    """
    img = db.query(models.ProjectImage).filter(models.ProjectImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail='Image not found')

    try:
        suggestions = json.loads(img.ai_suggestions or '[]')
    except Exception:
        suggestions = []

    reject_all = len(req.boxIds) == 0
    reject_ids = set(req.boxIds)

    if reject_all:
        remaining = []
    else:
        remaining = [s for s in suggestions if s.get('id') not in reject_ids]

    img.ai_suggestions = json.dumps(remaining)
    img.has_suggestions = len(remaining) > 0

    db.commit()
    db.refresh(img)
    return image_to_out(img)
