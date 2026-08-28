from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pathlib import Path
from dotenv import load_dotenv
from app.database import engine, Base
from app.routers import projects, images, pipeline, ai_models
import os

load_dotenv()

# Create all tables (including new ones from updated models)
Base.metadata.create_all(bind=engine)

# Auto-migrate SQLite schema if existing columns are missing
from sqlalchemy import text
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE images ADD COLUMN ai_suggestions TEXT DEFAULT '[]'"))
        conn.commit()
    except Exception:
        pass
    try:
        conn.execute(text("ALTER TABLE images ADD COLUMN has_suggestions BOOLEAN DEFAULT 0"))
        conn.commit()
    except Exception:
        pass

# Ensure models storage directory exists
MODELS_DIR = Path(__file__).parent / 'models'
MODELS_DIR.mkdir(exist_ok=True)

app = FastAPI(title='Boxel CV Dataset Manager', version='2.0.0')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.include_router(projects.router)
app.include_router(images.router)
app.include_router(pipeline.router)
app.include_router(ai_models.router)

STATIC_DIR = Path(__file__).parent / 'app' / 'static'

# Mount static files (CSS, JS)
if STATIC_DIR.exists():
    app.mount('/static', StaticFiles(directory=str(STATIC_DIR)), name='static')

@app.get('/', include_in_schema=False)
@app.get('/{full_path:path}', include_in_schema=False)
async def serve_spa(full_path: str = ''):
    # Don't intercept API routes
    if full_path.startswith('api/'):
        from fastapi import HTTPException
        raise HTTPException(status_code=404)
    index = STATIC_DIR / 'index.html'
    if index.exists():
        return FileResponse(str(index))
    return {'error': 'Frontend not built'}

if __name__ == '__main__':
    import uvicorn
    uvicorn.run('main:app', host='0.0.0.0', port=8000, reload=True)
