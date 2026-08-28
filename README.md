# boxel. — Offline CV Studio (Python Edition)

A powerful computer vision dataset manager, bounding box annotator, augmentation engine, and YOLO dataset compiler built with **FastAPI**, **SQLite**, and **Vanilla JavaScript**.

---

## Features

- **Project Management**: Create and manage multiple computer vision annotation projects.
- **Object Class Definition**: Multi-class management with custom palette colors.
- **Interactive Annotation Studio**: Real-time bounding box annotator with hotkeys (1-9 for classes, D/A for next/prev, DEL/Backspace for deleting boxes, click-and-drag drawing and 8-handle resizing).
- **Data Import**:
  - Drag & drop or file selector for single/batch images.
  - Video frame extraction (by time interval or fps).
- **Dataset Partitioning (Splits)**: Auto-split dataset into Train / Validation / Test sets using Fisher-Yates randomization.
- **Data Augmentation**: Server-side image augmentation using Pillow/NumPy (Horizontal Flip, Random Rotation, Brightness, Exposure, Grain/Noise) with automated bounding-box geometric transforms.
- **Production-Ready YOLO Export**: Packages assigned splits, bounding boxes, `classes.txt`, and `dataset.yaml` into a downloadable `.zip` archive.
- **Persistent Storage**: SQLite database for projects, images, annotations, and pipeline configuration.

---

## Getting Started

### Prerequisites

- Python 3.9+
- pip

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the Application

```bash
python main.py
```

Or using uvicorn directly:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Open in Browser

Visit [http://localhost:8000](http://localhost:8000) in your web browser.

---

## Project Structure

```
cv-dataset-manager/
├── main.py                   # FastAPI application entrypoint & SPA static mounting
├── requirements.txt          # Python dependencies
├── test_backend.py           # Automated backend test suite
├── app/
│   ├── database.py           # SQLAlchemy SQLite database setup (boxel.db)
│   ├── models.py             # ORM models (Project, ProjectClass, ProjectImage, Setting)
│   ├── schemas.py            # Pydantic schemas
│   ├── routers/
│   │   ├── projects.py       # Project CRUD & class management
│   │   ├── images.py         # Image upload, deletion, annotations & split updates
│   │   └── pipeline.py       # Auto-split, augmentation, YOLO export, settings
│   ├── services/
│   │   ├── augmentation.py   # Pillow & NumPy image + box transformation engine
│   │   └── export_service.py # YOLO ZIP archive builder
│   └── static/
│       ├── index.html        # Single-page application shell
│       ├── css/
│       │   └── style.css     # Boxel dark precision instrument design system
│       └── js/
│           ├── api.js        # Frontend API client
│           ├── app.js        # Main UI application logic
│           └── annotator.js  # Canvas bounding box annotation studio
```

---

## Running Tests

Run the test suite to verify all backend endpoints and pipeline operations:

```bash
python test_backend.py
```
