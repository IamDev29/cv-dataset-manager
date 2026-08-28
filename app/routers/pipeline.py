from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
import random, json
from app.database import get_db
from app import models
from app.schemas import AutoSplitRequest, AugmentRequest, SettingsOut
from app.services.augmentation import perform_augmentation
from app.services.export_service import build_yolo_zip
from app.routers.images import image_to_out

router = APIRouter(tags=['pipeline'])

# ── Settings ──────────────────────────────────────────────────────────────────

DEFAULT_SETTINGS = {
    'train_percent': '70',
    'val_percent': '20',
    'test_percent': '10',
    'include_unannotated': 'false',
    'aug_flip': 'true',
    'aug_rotation': 'true',
    'aug_brightness': 'true',
    'aug_exposure': 'true',
    'aug_noise': 'false',
    'aug_variants_count': '2',
}

def get_setting(db: Session, key: str, default: str) -> str:
    s = db.query(models.Setting).filter(models.Setting.key == key).first()
    return s.value if s else default

def set_setting(db: Session, key: str, value: str):
    s = db.query(models.Setting).filter(models.Setting.key == key).first()
    if s:
        s.value = value
    else:
        db.add(models.Setting(key=key, value=value))

@router.get('/api/settings')
def get_settings(db: Session = Depends(get_db)):
    result = {}
    for k, default in DEFAULT_SETTINGS.items():
        v = get_setting(db, k, default)
        if k in ('include_unannotated', 'aug_flip', 'aug_rotation', 'aug_brightness', 'aug_exposure', 'aug_noise'):
            result[k] = v == 'true'
        elif k in ('train_percent', 'val_percent', 'test_percent', 'aug_variants_count'):
            result[k] = int(v)
        else:
            result[k] = v
    return result

@router.put('/api/settings')
def save_settings(settings: dict, db: Session = Depends(get_db)):
    for k, v in settings.items():
        set_setting(db, k, str(v).lower() if isinstance(v, bool) else str(v))
    db.commit()
    return get_settings(db)

# ── Auto-Split ─────────────────────────────────────────────────────────────────

@router.post('/api/projects/{project_id}/split')
def auto_split(project_id: str, req: AutoSplitRequest, db: Session = Depends(get_db)):
    total = req.train_percent + req.val_percent + req.test_percent
    if total != 100:
        raise HTTPException(status_code=400, detail=f'Percentages must sum to 100. Current: {total}')
    
    all_images = db.query(models.ProjectImage).filter(
        models.ProjectImage.project_id == project_id
    ).order_by(models.ProjectImage.created_at.asc()).all()
    
    if not all_images:
        raise HTTPException(status_code=400, detail='No images in project')
    
    if req.include_unannotated:
        eligible = all_images
    else:
        eligible = [img for img in all_images if img.annotated]
    
    if not eligible:
        raise HTTPException(
            status_code=400,
            detail='No annotated images found. Draw bounding boxes first or enable include_unannotated.'
        )
    
    # Fisher-Yates shuffle (same algorithm as TypeScript)
    shuffled = list(eligible)
    for i in range(len(shuffled) - 1, 0, -1):
        j = random.randint(0, i)
        shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
    
    n = len(shuffled)
    train_target = round(n * req.train_percent / 100)
    val_target = round(n * req.val_percent / 100)
    
    eligible_ids = {img.id for img in shuffled}
    
    for img in all_images:
        if img.id in eligible_ids:
            idx = next(i for i, s in enumerate(shuffled) if s.id == img.id)
            if idx < train_target:
                img.split = 'train'
            elif idx < train_target + val_target:
                img.split = 'val'
            else:
                img.split = 'test'
        else:
            if not img.split or img.split == '':
                img.split = 'unassigned'
    
    db.commit()
    for img in all_images:
        db.refresh(img)
    return [image_to_out(img) for img in all_images]

# ── Augmentation ───────────────────────────────────────────────────────────────

@router.post('/api/projects/{project_id}/augment')
def run_augmentation(project_id: str, req: AugmentRequest, db: Session = Depends(get_db)):
    import uuid, time as time_module
    
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail='Project not found')
    
    if not any([req.flip, req.rotation, req.brightness, req.exposure, req.noise]):
        raise HTTPException(status_code=400, detail='Enable at least one augmentation technique.')
    
    train_images = db.query(models.ProjectImage).filter(
        models.ProjectImage.project_id == project_id,
        models.ProjectImage.split == 'train',
        models.ProjectImage.is_augmented == False
    ).all()
    
    if not train_images:
        raise HTTPException(status_code=400, detail='No original training images found.')
    
    generated = []
    for original in train_images:
        for v in range(1, req.variants_count + 1):
            try:
                aug_data_url, aug_annotations = perform_augmentation(
                    original.data_url,
                    json.loads(original.annotations or '[]'),
                    flip=req.flip,
                    rotation=req.rotation,
                    brightness=req.brightness,
                    exposure=req.exposure,
                    noise=req.noise
                )
                name_without_ext = original.name.rsplit('.', 1)[0] if '.' in original.name else original.name
                aug_img = models.ProjectImage(
                    id=f'img-aug-{uuid.uuid4().hex[:12]}',
                    project_id=project_id,
                    name=f'{name_without_ext}_aug{v}.jpg',
                    size=int(len(aug_data_url) * 0.75),
                    type='image/jpeg',
                    data_url=aug_data_url,
                    annotated=original.annotated,
                    created_at=time_module.time() * 1000 + v,
                    annotations=json.dumps(aug_annotations),
                    split='train',
                    is_augmented=True,
                    original_image_id=original.id
                )
                db.add(aug_img)
                generated.append(aug_img)
            except Exception as e:
                print(f'Failed to augment {original.name}: {e}')
    
    if not generated:
        raise HTTPException(status_code=500, detail='Failed to generate any augmented images.')
    
    project.image_count += len(generated)
    db.commit()
    for img in generated:
        db.refresh(img)
    return [image_to_out(img) for img in generated]

@router.delete('/api/projects/{project_id}/augmented')
def clear_augmented(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail='Project not found')
    
    aug_images = db.query(models.ProjectImage).filter(
        models.ProjectImage.project_id == project_id,
        models.ProjectImage.is_augmented == True
    ).all()
    count = len(aug_images)
    for img in aug_images:
        db.delete(img)
    project.image_count = max(0, project.image_count - count)
    db.commit()
    return {'deleted_count': count}

# ── YOLO Export ────────────────────────────────────────────────────────────────

@router.get('/api/projects/{project_id}/export')
def export_yolo(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail='Project not found')
    
    classes = project.classes
    if not classes:
        raise HTTPException(status_code=400, detail='No classes defined in project.')
    
    images = db.query(models.ProjectImage).filter(
        models.ProjectImage.project_id == project_id,
        models.ProjectImage.split.in_(['train', 'val', 'test'])
    ).all()
    
    if not images:
        raise HTTPException(status_code=400, detail='No images assigned to train/val/test splits.')
    
    images_data = []
    for img in images:
        try:
            annotations = json.loads(img.annotations or '[]')
        except:
            annotations = []
        images_data.append({
            'name': img.name,
            'data_url': img.data_url,
            'split': img.split,
            'annotations': annotations,
        })
    
    classes_data = [{'id': c.id, 'name': c.name} for c in classes]
    
    zip_buffer = build_yolo_zip(project.name, classes_data, images_data)
    
    safe_name = ''.join(c if c.isalnum() or c == '_' else '_' for c in project.name.lower())
    filename = f'{safe_name}_yolo_dataset.zip'
    
    return StreamingResponse(
        zip_buffer,
        media_type='application/zip',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )
