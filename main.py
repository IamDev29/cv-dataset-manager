from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from dotenv import load_dotenv
from app.database import engine, Base, SessionLocal
from app.routers import projects, images, pipeline, ai_models, training, species
import os

load_dotenv()

# Create all tables (including new ones from updated models)
Base.metadata.create_all(bind=engine)

# Auto-migrate SQLite schema if existing columns are missing
from sqlalchemy import text
with engine.connect() as conn:
    for stmt in [
        "ALTER TABLE images ADD COLUMN ai_suggestions TEXT DEFAULT '[]'",
        "ALTER TABLE images ADD COLUMN has_suggestions BOOLEAN DEFAULT 0",
        "ALTER TABLE training_jobs ADD COLUMN is_active BOOLEAN DEFAULT 0",
        "ALTER TABLE training_jobs ADD COLUMN species_slug VARCHAR",
    ]:
        try:
            conn.execute(text(stmt))
            conn.commit()
        except Exception:
            pass

# Ensure models storage directory exists
MODELS_DIR = Path(__file__).parent / 'models'
MODELS_DIR.mkdir(exist_ok=True)

# Ensure training runs storage directory exists
TRAINING_RUNS_DIR = Path(__file__).parent / 'training_runs'
TRAINING_RUNS_DIR.mkdir(exist_ok=True)

# Seed default species modules
db = SessionLocal()
try:
    species.seed_default_species_modules(db)
finally:
    db.close()

# Recover any training jobs interrupted by server restart / reload / crash
from app.services.training_service import recover_interrupted_jobs
recovered = recover_interrupted_jobs()
if recovered:
    print(f"[startup] Recovered {recovered} interrupted training job(s).")

app = FastAPI(title='Boxel CV Dataset Manager', version='2.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['*'],
)

app.include_router(projects.router)
app.include_router(images.router)
app.include_router(pipeline.router)
app.include_router(ai_models.router)
app.include_router(training.router)
app.include_router(species.router)


DIST_DIR = Path(__file__).parent / 'dist'

# Mount Vite production build assets (JS, CSS)
if (DIST_DIR / 'assets').exists():
    app.mount('/assets', StaticFiles(directory=str(DIST_DIR / 'assets')), name='assets')

@app.get('/', include_in_schema=False)
@app.get('/{full_path:path}', include_in_schema=False)
async def serve_spa(full_path: str = ''):
    # Don't intercept API routes
    if full_path.startswith('api/'):
        from fastapi import HTTPException
        raise HTTPException(status_code=404)
    index = DIST_DIR / 'index.html'
    if index.exists():
        return FileResponse(str(index))
    return {'error': 'Frontend not built. Run npm run build.'}

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=8000, reload=True)
