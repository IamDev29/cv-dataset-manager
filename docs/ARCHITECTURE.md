# Boxel Architecture & System Design

This document details the architecture, storage models, background job lifecycles, and component interactions of the Boxel computer vision manager.

---

## 1. High-Level Architecture

Boxel is architected as a local-first, single-user system consisting of two primary tiers:

```
┌─────────────────────────────────────────────────────────┐
│                      Client Layer                       │
│        React 19 + TypeScript + Vite + Tailwind CSS      │
│     (Single-Page App served statically by FastAPI)      │
└────────────────────────────┬────────────────────────────┘
                             │
                      REST / JSON API
                             │
┌────────────────────────────▼────────────────────────────┐
│                      Server Layer                       │
│             FastAPI + SQLAlchemy + SQLite               │
│                                                         │
│  ┌───────────────┐ ┌───────────────┐ ┌───────────────┐  │
│  │   Pipeline    │ │   AI Assist   │ │   Training    │  │
│  │  Augment /    │ │ ONNX Runtime  │ │  Ultralytics  │  │
│  │  YOLO Export  │ │   Inference   │ │ YOLO Engine   │  │
│  └───────┬───────┘ └───────┬───────┘ └───────┬───────┘  │
└──────────┼─────────────────┼─────────────────┼──────────┘
           │                 │                 │
┌──────────▼─────────────────▼─────────────────▼──────────┐
│                      Storage Layer                      │
│                                                         │
│   SQLite Database      Local Models    Training Outputs │
│     (./boxel.db)       (./models/)    (./training_runs/)│
└─────────────────────────────────────────────────────────┘
```

---

## 2. Storage Model

### 2.1 SQLite Relational Database (`./boxel.db`)
Boxel utilizes SQLite with SQLAlchemy 2.0 ORM (`app/models.py`, `app/database.py`). SQLite's `check_same_thread=False` engine flag allows background worker threads to instantiate separate scoped sessions (`SessionLocal()`) without connection lock contention.

- **`projects`**: Project workspace metadata, creation timestamp, cached `image_count`.
- **`classes`**: Bounding box category definitions with distinct UI hex colors (`#FF4D4D`, `#3DA9FC`, etc.).
- **`images`**: Base64 data URLs (`data_url`), image format metadata, dataset split tags (`train`, `val`, `test`, `unassigned`), confirmed bounding boxes (`annotations` JSON string), and pending detections (`ai_suggestions` JSON string).
- **`settings`**: Key-value pairs for split ratios and data augmentation defaults.
- **`project_models`**: ONNX model registrations, input tensor shapes, confidence thresholds, and category mapping dictionaries (`{"0": "cls-xxx", "1": "NEW:car"}`).
- **`training_jobs`**: Job status (`queued`, `running`, `completed`, `failed`, `cancelled`), model variant, hyperparameter configs, live epoch metrics (`metrics_log` JSON string), and output artifact paths.

### 2.2 Local File System Storage
- **`models/{project_id}/model.onnx`**: Registered ONNX models uploaded for AI Assist inference.
- **`training_runs/{job_id}/`**:
  - `dataset/`: Isolated YOLO format staging folder (`data.yaml`, `train/`, `val/`, `test/`) created during training execution and cleaned up after completion.
  - `output/`: Final trained weights (`best.pt` and `best.onnx`) preserved for direct user download or AI Assist activation.

---

## 3. Data Flow & Subsystems

### 3.1 Dataset Staging & YOLO Export
The dataset staging engine (`app/services/export_service.py`) converts bounding boxes from top-left normalized coordinates (`x, y, width, height`) to standard YOLO center coordinates (`<class_idx> <x_center> <y_center> <width> <height>`):

$$\text{x\_center} = x + \frac{\text{width}}{2}, \quad \text{y\_center} = y + \frac{\text{height}}{2}$$

- **For Export**: Bundles images, text labels, `classes.txt`, and `dataset.yaml` directly into an in-memory ZIP buffer (`build_yolo_zip`) streamed to the client without temp disk writes.
- **For Training**: Stages decoded image bytes and text labels into structured disk directories (`stage_yolo_dataset_to_disk`), passing an absolute path `data.yaml` to Ultralytics.

### 3.2 AI-Assisted Auto-Annotation
- **Inference Service (`app/services/inference_service.py`)**: Uses `onnxruntime` to execute object detection on CPU or GPU without requiring PyTorch at inference time.
- **Model Decoupling**: Uploaded ONNX models store their own internal class names. Users map model outputs to project classes using the Class Mapping UI. Detections populate `ai_suggestions` without overwriting confirmed annotations until explicitly accepted.

---

## 4. In-App Model Training Execution

The training subsystem (`app/services/training_service.py`, `app/routers/training.py`) executes YOLO training runs locally with the following guarantees:

```
[ POST /api/projects/{id}/train ]
               │
               ▼
   [ Pre-flight Validation ] ─── (Checks >= 5 train, >= 1 val, >= 1 class)
               │
               ▼
     [ Global GPU Lock ] ─────── (Ensures 1 active job across all projects)
               │
               ▼
 [ Launch Daemon Thread ] ────── (FastAPI returns 202 Accepted immediately)
               │
               ▼
   [ Stage Dataset on Disk ] ─── (Decodes Base64 to ./training_runs/{id}/dataset)
               │
               ▼
   [ Ultralytics YOLO.train() ]
         │
         ├──► [ Epoch Callback ] ──► Updates DB current_epoch & metrics_log
         ├──► [ Cancel Check ]   ──► Checks threading.Event to abort early
         │
         ▼
 [ Collect Outputs & Export ] ──► Copies best.pt & generates best.onnx
               │
               ▼
      [ Cleanup Staging ] ──────► Deletes temp dataset, preserves output weights
```

### 4.1 Global Concurrency Lock
To prevent out-of-memory (OOM) errors and GPU thrashing on single-GPU or CPU systems, training is protected by a global thread lock (`_global_lock`). Only one training job can run across the entire application at a time. Attempts to start a second job return `409 Conflict` with details on the active run.

### 4.2 Non-Blocking Background Execution
Training executes inside a daemon `threading.Thread`. Because PyTorch/CUDA operations release Python's Global Interpreter Lock (GIL) during matrix computations, the FastAPI event loop remains responsive to UI polling, annotation saves, and image browsing.

### 4.3 Live Progress Callbacks
Ultralytics' `on_train_epoch_end` hook captures per-epoch loss and mAP telemetry:
- `train/box_loss`, `train/cls_loss`, `train/dfl_loss`
- `metrics/mAP50(B)`, `metrics/mAP50-95(B)`
- Progress is committed immediately to SQLite via an independent session, enabling client polling (`GET /api/projects/{id}/train/jobs/{job_id}`) every 2 seconds.

### 4.4 Startup Crash & Interruption Recovery
If the server process is restarted, reloaded via `--reload`, or terminated unexpectedly mid-training, `recover_interrupted_jobs()` runs on startup during FastAPI boot. It marks all orphaned `queued` or `running` rows as `failed` with `"Interrupted by server restart"`, ensuring projects never stay permanently locked against starting new training runs.
