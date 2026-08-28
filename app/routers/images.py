from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
import uuid, time, base64, json
from app.database import get_db
from app import models
from app.schemas import SaveAnnotationsRequest, UpdateSplitRequest, BatchImageItem
from typing import List

router = APIRouter(tags=['images'])

MIME_TO_EXT = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
}

def image_to_out(img: models.ProjectImage) -> dict:
    try:
        annotations = json.loads(img.annotations) if img.annotations else []
    except Exception:
        annotations = []
    try:
        ai_suggestions = json.loads(img.ai_suggestions) if img.ai_suggestions else []
    except Exception:
        ai_suggestions = []
    return {
        'id': img.id,
        'projectId': img.project_id,
        'name': img.name,
        'size': img.size,
        'type': img.type,
        'dataUrl': img.data_url,
        'annotated': img.annotated,
        'createdAt': img.created_at,
        'annotations': annotations,
        'split': img.split or 'unassigned',
        'isAugmented': img.is_augmented,
        'originalImageId': img.original_image_id,
        'aiSuggestions': ai_suggestions,
        'hasSuggestions': bool(img.has_suggestions),
    }

@router.get('/api/projects/{project_id}/images')
def list_images(project_id: str, db: Session = Depends(get_db)):
    images = db.query(models.ProjectImage).filter(
        models.ProjectImage.project_id == project_id
    ).order_by(models.ProjectImage.created_at.asc()).all()
    return [image_to_out(img) for img in images]

@router.post('/api/projects/{project_id}/images', status_code=201)
async def upload_image(project_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail='Project not found')
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail='File must be an image')
    
    content = await file.read()
    b64 = base64.b64encode(content).decode('utf-8')
    data_url = f'data:{file.content_type};base64,{b64}'
    
    img = models.ProjectImage(
        id=f'img-{uuid.uuid4().hex[:12]}',
        project_id=project_id,
        name=file.filename or 'image.jpg',
        size=len(content),
        type=file.content_type,
        data_url=data_url,
        annotated=False,
        created_at=time.time() * 1000,
        annotations='[]',
        split='unassigned',
        is_augmented=False
    )
    db.add(img)
    project.image_count += 1
    db.commit()
    db.refresh(img)
    return image_to_out(img)

@router.post('/api/projects/{project_id}/images/batch', status_code=201)
def upload_batch(project_id: str, items: List[BatchImageItem], db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail='Project not found')
    result = []
    for item in items:
        img = models.ProjectImage(
            id=f'img-{uuid.uuid4().hex[:12]}',
            project_id=project_id,
            name=item.name,
            size=item.size,
            type=item.type,
            data_url=item.dataUrl,
            annotated=item.annotated,
            created_at=item.createdAt,
            annotations='[]',
            split='unassigned',
            is_augmented=False
        )
        db.add(img)
        result.append(img)
    project.image_count += len(items)
    db.commit()
    for img in result:
        db.refresh(img)
    return [image_to_out(img) for img in result]

@router.delete('/api/images/{image_id}')
def delete_image(image_id: str, db: Session = Depends(get_db)):
    img = db.query(models.ProjectImage).filter(models.ProjectImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail='Image not found')
    project = db.query(models.Project).filter(models.Project.id == img.project_id).first()
    if project:
        project.image_count = max(0, project.image_count - 1)
    db.delete(img)
    db.commit()
    return {'ok': True}

@router.put('/api/images/{image_id}/annotations')
def save_annotations(image_id: str, req: SaveAnnotationsRequest, db: Session = Depends(get_db)):
    img = db.query(models.ProjectImage).filter(models.ProjectImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail='Image not found')
    img.annotations = json.dumps([a.model_dump(by_alias=False) for a in req.annotations])
    img.annotated = len(req.annotations) > 0
    db.commit()
    db.refresh(img)
    return image_to_out(img)

@router.put('/api/images/{image_id}/split')
def update_split(image_id: str, req: UpdateSplitRequest, db: Session = Depends(get_db)):
    img = db.query(models.ProjectImage).filter(models.ProjectImage.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail='Image not found')
    img.split = req.split
    db.commit()
    db.refresh(img)
    return image_to_out(img)
