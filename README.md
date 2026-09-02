# boxel.

> **Local-first, single-user computer vision dataset studio and YOLO training workbench.**  
> A private, offline alternative to cloud labeling platforms — zero external accounts, zero data uploads, running 100% on your own machine.

---

<!-- TODO: add screenshot / demo GIF of Boxel dashboard and annotation studio here -->
<!-- ![Boxel Studio Demo](assets/demo.gif) -->

---

## Key Features

- **Bounding Box Annotation Studio**: Canvas labeling environment with 8-handle box resizing, pan & zoom navigation, and keyboard hotkeys (`1`–`9` for class assignment, `D`/`A` for next/previous image, `DEL` to delete).
- **Flexible Data Ingestion**:
  - Drag-and-drop batch upload for JPEG, PNG, WEBP, and BMP images.
  - Video frame extraction at fixed time intervals (seconds) or target frame rates (FPS).
- **Dataset Partitioning (Splits)**: Automated Fisher-Yates train / validation / test dataset partitioning with customizable percentage ratios and manual per-image overrides.
- **Data Augmentation Engine**: Server-side geometric and photometric dataset expansion (horizontal flip, $\pm15^\circ$ rotation, brightness, exposure, noise) with automated bounding-box coordinate transformations.
- **AI-Assisted Auto-Annotation**: Upload custom ONNX object detection models, map model categories to project labels, run local inference, and review/accept suggestions.
- **In-App YOLO Model Training**:
  - Train custom YOLOv8 and YOLO11 models (`Nano`, `Small`, `Medium`, `Large`, `X-Large`) directly on your dataset.
  - Live epoch telemetry, loss metrics, and mAP progress via background non-blocking execution.
  - Direct download of `.pt` and `.onnx` weights.
  - **1-Click AI Assist Activation**: Seamlessly load trained models into the auto-annotation studio.
- **Standard YOLO Dataset Export**: Download complete dataset archives with `classes.txt`, `dataset.yaml`, and formatted labels (`<class_idx> <x_center> <y_center> <width> <height>`).

---

## Tech Stack

### Backend
- **Framework**: [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/)
- **Database & ORM**: [SQLAlchemy 2.0](https://www.sqlalchemy.org/) + [SQLite](https://sqlite.org/)
- **Computer Vision & Image Processing**: [Pillow](https://python-pillow.org/), [OpenCV Headless](https://opencv.org/), [NumPy](https://numpy.org/)
- **Machine Learning & Inference**: [ONNX Runtime](https://onnxruntime.ai/), [Ultralytics YOLO](https://github.com/ultralytics/ultralytics), [PyTorch](https://pytorch.org/)

### Frontend
- **Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite 6](https://vitejs.dev/)
- **Styling & Icons**: [Tailwind CSS v4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/), [Motion](https://motion.dev/)

---

## Prerequisites

- **Python**: `3.10` or higher
- **Node.js**: `18.0` or higher (with `npm` or `bun`)
- **Hardware**: Any modern CPU (x86_64 / ARM64). A CUDA-capable NVIDIA GPU is optional but recommended for faster model training.

---

## Step-by-Step Setup

### 1. Clone Repository
```bash
git clone https://github.com/your-username/cv-dataset-manager.git
cd cv-dataset-manager
```

### 2. Set Up Python Virtual Environment
```bash
# Create virtual environment
python -m venv venv

# Activate on Linux / macOS:
source venv/bin/activate

# Activate on Windows (PowerShell):
.\venv\Scripts\Activate.ps1

# Activate on Windows (Command Prompt):
.\venv\Scripts\activate.bat
```

### 3. Install Backend Dependencies
```bash
pip install -r requirements.txt
```

### 4. Install Frontend Dependencies & Build Bundle
```bash
npm install
npm run build
```

### 5. Run the Application
Start the FastAPI server, which hosts both the API and the compiled React single-page app:

```bash
python main.py
```

Open your browser at **[http://localhost:8000](http://localhost:8000)**.

---

## Development Mode

For active frontend development with hot module replacement (HMR) and backend auto-reloading:

```bash
# Terminal 1 — Backend API server (Port 8000)
python main.py

# Terminal 2 — Vite Dev Server (Port 3000, proxies /api to port 8000)
npm run dev
```

Visit **[http://localhost:3000](http://localhost:3000)** for development.

---

## Typical Usage Workflow

1. **Create Project**: Click **"New Project"** from the Dashboard and give your workspace a name.
2. **Define Classes**: Open **Classes & Import** (Key `2`) and add target labels with distinct palette colors.
3. **Import Data**: Drop photos directly into the upload dropzone or upload a video to extract frames at designated intervals.
4. **Annotate**: Navigate to **Annotate Studio** (Key `4`) to draw, resize, and label bounding boxes.
5. **Partition Dataset**: Open **Pipeline** (Key `5`) and configure auto-split ratios (e.g. 70% Train, 20% Val, 10% Test).
6. **Augment (Optional)**: Enable augmentation techniques (flip, rotation, brightness, exposure) to multiply training samples.
7. **AI Assist (Optional)**: Load an existing ONNX model in **AI Assist** (Key `6`) to pre-label unannotated frames.
8. **Train Model**: Go to **Train Model** (Key `7`), select a YOLO architecture (e.g. `yolov8n`), and click **Start Training**. Monitor live epoch loss and mAP metrics.
9. **Export / Deploy**: Download the final `.pt` / `.onnx` weights or export the entire labeled dataset as a standard YOLO ZIP archive.

---

## Project Structure

```
cv-dataset-manager/
├── main.py                     # FastAPI entry point & SPA static file server
├── requirements.txt            # Python dependencies (FastAPI, Torch, Ultralytics, ONNX Runtime)
├── package.json                # Frontend package manifest & scripts
├── vite.config.ts              # Vite configuration & backend dev proxy
├── tsconfig.json               # TypeScript compiler configuration
├── index.html                  # HTML entry template
├── LICENSE                     # MIT License
├── README.md                   # Project overview & setup instructions
├── docs/
│   ├── API_REFERENCE.md        # Detailed REST API endpoint specifications
│   └── ARCHITECTURE.md         # System design, storage model & background jobs
├── app/
│   ├── database.py             # SQLite engine setup & session factory (boxel.db)
│   ├── models.py               # SQLAlchemy ORM models (Project, Image, Class, Job, Model)
│   ├── schemas.py              # Pydantic request & response validation models
│   ├── routers/
│   │   ├── projects.py         # Project workspace & class management endpoints
│   │   ├── images.py           # Image upload, annotation updates & split assignments
│   │   ├── pipeline.py         # Auto-split, augmentation transforms & YOLO export
│   │   ├── ai_models.py        # ONNX model upload, class mapping & inference
│   │   └── training.py         # YOLO training start, polling, cancel & download
│   └── services/
│       ├── augmentation.py     # Pillow + NumPy image & bounding box transformation
│       ├── export_service.py   # YOLO ZIP archive builder & disk staging
│       ├── inference_service.py# ONNX Runtime inference & .pt -> .onnx conversion
│       └── training_service.py # Background Ultralytics training orchestration
└── src/
    ├── main.tsx                # React application bootstrap
    ├── App.tsx                 # Root layout, routing state & global background jobs
    ├── types.ts                # TypeScript data interfaces & types
    ├── api.ts                  # Typed frontend REST client
    ├── index.css               # Design system tokens & Tailwind imports
    └── components/
        ├── Annotator.tsx       # Canvas bounding box drawing & 8-handle resizing
        ├── BoxelLogo.tsx       # Vector SVG logo mark
        ├── CornerBrackets.tsx  # Precision instrument UI motif
        ├── StyleGuide.tsx      # Interactive design tokens preview modal
        ├── layout/
        │   ├── NavRail.tsx     # Persistent slim icon navigation rail
        │   └── TopBar.tsx      # Breadcrumbs, system status & active training pill
        ├── ui/                 # Reusable design system components
        │   ├── Badge.tsx       # Status & category pills
        │   ├── Button.tsx      # Primary, secondary, ghost & destructive actions
        │   ├── Card.tsx        # Elevated container cards with corner brackets
        │   ├── Checkbox.tsx    # Custom styled toggles
        │   ├── IconRailItem.tsx# Nav rail icon button with keyboard badges
        │   ├── Input.tsx       # Text & numeric inputs
        │   ├── Select.tsx      # Custom dropdown selects
        │   ├── Slider.tsx      # Range slider controls
        │   └── StatTile.tsx    # Monospace telemetry & dataset metric tiles
        └── views/              # Full-page workspace views
            ├── DashboardView.tsx    # All projects list, search & creation
            ├── OverviewView.tsx     # Dataset health, statistics & launchpad
            ├── ClassesImportView.tsx# Class taxonomy & image/video frame ingestion
            ├── GalleryView.tsx      # Full-width image grid & split badges
            ├── PipelineView.tsx     # Split ratios, augmentation & YOLO export
            ├── AIAssistView.tsx     # ONNX model upload, mapping & auto-annotation
            └── TrainModelView.tsx   # YOLO training studio, live metrics & weights
```

---

## API Documentation

For the complete reference of all REST routes, schemas, and payload examples, see [docs/API_REFERENCE.md](docs/API_REFERENCE.md):

| Feature Area | Router Prefix | Description |
| :--- | :--- | :--- |
| **Projects & Classes** | `/api/projects` | Project workspace CRUD and annotation class management |
| **Images & Annotations** | `/api` | Image upload (single/batch), bounding box autosave, and split updates |
| **Pipeline & Export** | `/api` | Auto-split randomization, image augmentation, and YOLO ZIP export |
| **AI Assist & Inference** | `/api` | ONNX model registration, class mapping, and server-side inference |
| **In-App Training** | `/api/projects/{id}/train` | Background YOLO training runs, live progress polling, and weights download |

For deep-dive architectural details, background job lifecycles, and database storage strategies, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

---

## Limitations

- **Single-User, Local-Only**: Boxel is intentionally designed as a personal, local workbench. It does not include authentication, user roles, or multi-tenant database partitioning.
- **Memory Considerations**: Video frame extraction and augmentation operate directly on local compute. Processing very high-resolution 4K video feeds or thousands of frames simultaneously depends on local RAM.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
