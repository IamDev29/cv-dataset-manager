"""
species.py
FastAPI router and service helpers for wildlife species modules registry
and active model management.
"""

import json
import logging
import os
import re
import shutil
import time
import uuid
from pathlib import Path
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.schemas import (
    SpeciesModuleOut,
    CreateSpeciesModuleRequest,
    SpeciesModelStatus,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=['species-modules'])

REPO_ROOT = Path(__file__).parent.parent.parent
WILDLIFE_DIR = REPO_ROOT / 'wildlife'
SHARED_MODELS_WILDLIFE = WILDLIFE_DIR / 'shared_models'
SHARED_MODELS_ROOT = REPO_ROOT / 'shared_models'


# ─── Path & Config Helpers ───────────────────────────────────────────────────

def get_wildlife_dir() -> Path:
    return WILDLIFE_DIR


def validate_and_resolve_config_path(relpath: str) -> Path:
    """Ensure relpath is a safe relative path that resolves to an existing file inside wildlife/."""
    clean_path = relpath.strip().replace('\\', '/')
    if clean_path.startswith('/') or clean_path.startswith('../') or '/../' in clean_path:
        raise HTTPException(
            status_code=400,
            detail="Invalid wildlife_config_relpath. Path traversal and absolute paths are not permitted."
        )

    target = (WILDLIFE_DIR / clean_path).resolve()
    wildlife_base = WILDLIFE_DIR.resolve()

    try:
        target.relative_to(wildlife_base)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail="The specified config path resolves outside the wildlife/ directory."
        )

    if not target.exists() or not target.is_file():
        raise HTTPException(
            status_code=400,
            detail=f"Wildlife config file '{clean_path}' does not exist inside the wildlife/ directory."
        )

    return target


def update_wildlife_config_model_path(relpath: str, slug: str) -> None:
    """
    Update the 'model_path' key in a wildlife config JSON file to point to
    'shared_models/<slug>/active.pt'.
    """
    target = validate_and_resolve_config_path(relpath)
    try:
        with open(target, 'r', encoding='utf-8') as f:
            cfg = json.load(f)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to read/parse wildlife config JSON at '{relpath}': {str(e)}"
        )

    cfg['model_path'] = f"shared_models/{slug}/active.pt"

    try:
        with open(target, 'w', encoding='utf-8') as f:
            json.dump(cfg, f, indent=2)
        logger.info(f"[species] Updated model_path in {relpath} to shared_models/{slug}/active.pt")
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to write updated wildlife config JSON at '{relpath}': {str(e)}"
        )


def seed_default_species_modules(db: Session) -> None:
    """Seed initial species modules on application startup if table is empty."""
    default_modules = [
        {
            "slug": "blackbuck",
            "display_name": "Blackbuck Census",
            "wildlife_config_relpath": "config/blackbuck_config.json",
        },
        {
            "slug": "turtle",
            "display_name": "Olive Ridley Turtle",
            "wildlife_config_relpath": "config/turtle_config.json",
        },
    ]

    for item in default_modules:
        existing = db.query(models.SpeciesModule).filter(
            models.SpeciesModule.slug == item["slug"]
        ).first()

        if not existing:
            config_file = WILDLIFE_DIR / item["wildlife_config_relpath"]
            if config_file.exists():
                mod = models.SpeciesModule(
                    id=f'spec-{uuid.uuid4().hex[:12]}',
                    slug=item["slug"],
                    display_name=item["display_name"],
                    wildlife_config_relpath=item["wildlife_config_relpath"],
                    created_at=time.time() * 1000,
                )
                db.add(mod)
                db.commit()
                # Ensure existing config's model_path points to shared location
                try:
                    update_wildlife_config_model_path(item["wildlife_config_relpath"], item["slug"])
                except Exception as e:
                    logger.warning(f"[species] Could not update model_path on seed for {item['slug']}: {e}")
                logger.info(f"[startup] Seeded species module: {item['slug']}")


def save_active_model_atomic(src_pt_path: str, species_slug: str, metadata: dict) -> None:
    """
    Atomically copy best.pt to shared_models/<species_slug>/active.pt and write
    shared_models/<species_slug>/active.json.
    Writes to both wildlife/shared_models and repo_root/shared_models for maximum compatibility.
    """
    targets = [
        SHARED_MODELS_WILDLIFE / species_slug,
        SHARED_MODELS_ROOT / species_slug,
    ]

    for target_dir in targets:
        target_dir.mkdir(parents=True, exist_ok=True)

        # 1. Atomic .pt write
        temp_pt = target_dir / f"active.pt.tmp.{uuid.uuid4().hex}"
        shutil.copyfile(src_pt_path, str(temp_pt))
        # Atomic rename/replace
        os.replace(str(temp_pt), str(target_dir / "active.pt"))

        # 2. Atomic active.json write
        temp_json = target_dir / f"active.json.tmp.{uuid.uuid4().hex}"
        with open(temp_json, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2)
        os.replace(str(temp_json), str(target_dir / "active.json"))

    logger.info(f"[species] Atomically saved active model and metadata for '{species_slug}'")


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.get('/api/species-modules', response_model=List[SpeciesModuleOut])
def list_species_modules(db: Session = Depends(get_db)):
    """List all registered wildlife species modules."""
    modules = db.query(models.SpeciesModule).order_by(models.SpeciesModule.created_at.asc()).all()

    # Find active jobs per species_slug
    active_jobs = db.query(models.TrainingJob).filter(
        models.TrainingJob.is_active == True,
        models.TrainingJob.species_slug.isnot(None),
    ).all()
    active_by_slug = {j.species_slug: j for j in active_jobs}

    result = []
    for m in modules:
        aj = active_by_slug.get(m.slug)
        result.append({
            'id': m.id,
            'slug': m.slug,
            'displayName': m.display_name,
            'wildlifeConfigRelpath': m.wildlife_config_relpath,
            'createdAt': m.created_at,
            'hasActiveModel': aj is not None,
            'activeJobId': aj.id if aj else None,
            'activeProjectId': aj.project_id if aj else None,
        })
    return result


@router.post('/api/species-modules', response_model=SpeciesModuleOut, status_code=201)
def create_species_module(
    req: CreateSpeciesModuleRequest,
    db: Session = Depends(get_db),
):
    """
    Register a new species module.
    Automatically updates the corresponding wildlife config file's 'model_path' key.
    """
    slug = (req.slug or '').strip().lower()
    display_name = (req.display_name or req.displayName or '').strip()
    relpath = (req.wildlife_config_relpath or req.wildlifeConfigRelpath or '').strip()

    if not slug:
        raise HTTPException(status_code=400, detail="Species slug is required.")
    if not re.match(r'^[a-z0-9_-]+$', slug):
        raise HTTPException(
            status_code=400,
            detail="Species slug must contain only lowercase letters, numbers, hyphens, and underscores."
        )
    if not display_name:
        raise HTTPException(status_code=400, detail="Display name is required.")
    if not relpath:
        raise HTTPException(status_code=400, detail="Wildlife config relative path is required.")

    # Check slug uniqueness
    existing = db.query(models.SpeciesModule).filter(
        models.SpeciesModule.slug == slug
    ).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Species module with slug '{slug}' already exists."
        )

    # Validate config file exists inside wildlife/
    validate_and_resolve_config_path(relpath)

    # Update config file's model_path
    update_wildlife_config_model_path(relpath, slug)

    # Create record
    mod = models.SpeciesModule(
        id=f'spec-{uuid.uuid4().hex[:12]}',
        slug=slug,
        display_name=display_name,
        wildlife_config_relpath=relpath,
        created_at=time.time() * 1000,
    )
    db.add(mod)
    db.commit()
    db.refresh(mod)

    return {
        'id': mod.id,
        'slug': mod.slug,
        'displayName': mod.display_name,
        'wildlifeConfigRelpath': mod.wildlife_config_relpath,
        'createdAt': mod.created_at,
        'hasActiveModel': False,
        'activeJobId': None,
        'activeProjectId': None,
    }


@router.delete('/api/species-modules/{slug}')
def delete_species_module(
    slug: str,
    db: Session = Depends(get_db),
):
    """
    Remove a species module from the registry.
    Blocked if any TrainingJob is currently active for this slug.
    Does NOT modify or revert the wildlife config file.
    """
    clean_slug = slug.strip().lower()
    mod = db.query(models.SpeciesModule).filter(
        models.SpeciesModule.slug == clean_slug
    ).first()
    if not mod:
        raise HTTPException(status_code=404, detail=f"Species module '{clean_slug}' not found.")

    # Check if any job is currently active for this slug
    active_job = db.query(models.TrainingJob).filter(
        models.TrainingJob.species_slug == clean_slug,
        models.TrainingJob.is_active == True,
    ).first()
    if active_job:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Cannot delete species module '{clean_slug}' because training job '{active_job.id}' "
                f"is currently active for it. Deactivate the job before deleting the module."
            )
        )

    db.delete(mod)
    db.commit()
    return {'ok': True, 'message': f"Species module '{clean_slug}' removed from registry."}


@router.get('/api/species-models', response_model=List[SpeciesModelStatus])
def get_species_models_status(db: Session = Depends(get_db)):
    """
    Return all species modules with their current active model status and sidecar metadata.
    """
    modules = db.query(models.SpeciesModule).order_by(models.SpeciesModule.created_at.asc()).all()

    active_jobs = db.query(models.TrainingJob).filter(
        models.TrainingJob.is_active == True,
        models.TrainingJob.species_slug.isnot(None),
    ).all()
    active_by_slug = {j.species_slug: j for j in active_jobs}

    results = []
    for m in modules:
        aj = active_by_slug.get(m.slug)
        meta_dict = None

        # Check for active.json sidecar on disk
        sidecar_candidates = [
            SHARED_MODELS_WILDLIFE / m.slug / 'active.json',
            SHARED_MODELS_ROOT / m.slug / 'active.json',
        ]
        for candidate in sidecar_candidates:
            if candidate.exists():
                try:
                    with open(candidate, 'r', encoding='utf-8') as f:
                        meta_dict = json.load(f)
                    break
                except Exception:
                    pass

        has_active = aj is not None or (meta_dict is not None and (SHARED_MODELS_WILDLIFE / m.slug / 'active.pt').exists())

        proj_name = None
        if aj:
            p = db.query(models.Project).filter(models.Project.id == aj.project_id).first()
            if p:
                proj_name = p.name
        elif meta_dict and 'project_name' in meta_dict:
            proj_name = meta_dict.get('project_name')

        results.append({
            'speciesSlug': m.slug,
            'displayName': m.display_name,
            'wildlifeConfigRelpath': m.wildlife_config_relpath,
            'hasActiveModel': has_active,
            'activeJobId': aj.id if aj else (meta_dict.get('job_id') if meta_dict else None),
            'activeProjectId': aj.project_id if aj else (meta_dict.get('project_id') if meta_dict else None),
            'activeProjectName': proj_name,
            'activatedAt': meta_dict.get('activated_at') if meta_dict else None,
            'metadata': meta_dict,
        })

    return results
