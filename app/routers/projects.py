from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import uuid, time
from app.database import get_db
from app import models
from app.schemas import CreateProjectRequest, ProjectOut, AddClassRequest, ProjectClassOut
import json

router = APIRouter(prefix='/api/projects', tags=['projects'])

def project_to_out(p: models.Project) -> dict:
    return {
        'id': p.id,
        'name': p.name,
        'createdAt': p.created_at,
        'imageCount': p.image_count,
        'classes': [{'id': c.id, 'name': c.name, 'color': c.color} for c in p.classes]
    }

@router.get('', response_model=list)
def list_projects(db: Session = Depends(get_db)):
    projects = db.query(models.Project).order_by(models.Project.created_at.desc()).all()
    return [project_to_out(p) for p in projects]

@router.post('', status_code=201)
def create_project(req: CreateProjectRequest, db: Session = Depends(get_db)):
    project = models.Project(
        id=f'proj-{uuid.uuid4().hex[:12]}',
        name=req.name.strip(),
        created_at=time.time() * 1000,
        image_count=0
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project_to_out(project)

@router.delete('/{project_id}')
def delete_project(project_id: str, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail='Project not found')
    db.delete(project)
    db.commit()
    return {'ok': True}

@router.post('/{project_id}/classes', status_code=201)
def add_class(project_id: str, req: AddClassRequest, db: Session = Depends(get_db)):
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail='Project not found')
    # Check duplicate
    existing = [c.name.lower() for c in project.classes]
    if req.name.strip().lower() in existing:
        raise HTTPException(status_code=400, detail='Class name already exists')
    cls = models.ProjectClass(
        id=f'cls-{uuid.uuid4().hex[:12]}',
        project_id=project_id,
        name=req.name.strip(),
        color=req.color
    )
    db.add(cls)
    db.commit()
    db.refresh(cls)
    return {'id': cls.id, 'name': cls.name, 'color': cls.color}

@router.delete('/{project_id}/classes/{class_id}')
def delete_class(project_id: str, class_id: str, db: Session = Depends(get_db)):
    cls = db.query(models.ProjectClass).filter(
        models.ProjectClass.id == class_id,
        models.ProjectClass.project_id == project_id
    ).first()
    if not cls:
        raise HTTPException(status_code=404, detail='Class not found')
    db.delete(cls)
    db.commit()
    return {'ok': True}
