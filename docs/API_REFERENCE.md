# Boxel REST API Reference

This document provides a comprehensive reference of all REST endpoints available in the Boxel backend (`main.py`, `app/routers/`).

Base URL: `http://localhost:8000` (or configured host/port).

---

## Table of Contents

1. [Projects & Classes](#1-projects--classes)
2. [Images & Annotations](#2-images--annotations)
3. [Pipeline (Splits, Augmentation, Settings, Export)](#3-pipeline-splits-augmentation-settings-export)
4. [AI Assist & Model Inference](#4-ai-assist--model-inference)
5. [In-App Model Training](#5-in-app-model-training)

---

## 1. Projects & Classes

Router prefix: `/api/projects` (Source: `app/routers/projects.py`)

### `GET /api/projects`
List all projects ordered by creation time descending.

- **Request Body**: None
- **Response** (`200 OK`): `List[ProjectOut]`
  ```json
  [
    {
      "id": "proj-35c88128a6a6",
      "name": "Wildlife Detection",
      "createdAt": 1725280000000.0,
      "imageCount": 134,
      "classes": [
        {
          "id": "cls-9f8e7d6c5b4a",
          "name": "blackbuck",
          "color": "#FF4D4D"
        }
      ]
    }
  ]
  ```

### `POST /api/projects`
Create a new project workspace.

- **Status**: `201 Created`
- **Request Body**: `application/json`
  ```json
  {
    "name": "Vehicle Tracking"
  }
  ```
- **Response**: `ProjectOut` (matching object above with initial `imageCount: 0` and empty `classes: []`)

### `DELETE /api/projects/{project_id}`
Delete a project and cascade-delete all associated images, classes, models, and training job records.

- **Request Body**: None
- **Response** (`200 OK`):
  ```json
  {
    "ok": true
  }
  ```

### `POST /api/projects/{project_id}/classes`
Add a new annotation class to a project.

- **Status**: `201 Created`
- **Request Body**: `application/json`
  ```json
  {
    "name": "pedestrian",
    "color": "#3DA9FC"
  }
  ```
- **Response**: `ProjectClassOut`
  ```json
  {
    "id": "cls-1234567890ab",
    "name": "pedestrian",
    "color": "#3DA9FC"
  }
  ```
- **Errors**: `400 Bad Request` if class name already exists in the project.

### `DELETE /api/projects/{project_id}/classes/{class_id}`
Delete an annotation class from a project.

- **Request Body**: None
- **Response** (`200 OK`):
  ```json
  {
    "ok": true
  }
  ```

---

## 2. Images & Annotations

Router prefix: `/api` (Source: `app/routers/images.py`)

### `GET /api/projects/{project_id}/images`
List all images belonging to a project ordered by creation time.

- **Request Body**: None
- **Response** (`200 OK`): `List[ProjectImageOut]`
  ```json
  [
    {
      "id": "img-a1b2c3d4e5f6",
      "projectId": "proj-35c88128a6a6",
      "name": "frame_001.jpg",
      "size": 145020,
      "type": "image/jpeg",
      "dataUrl": "data:image/jpeg;base64,...",
      "annotated": true,
      "createdAt": 1725281000000.0,
      "annotations": [
        {
          "id": "box-1",
          "classId": "cls-9f8e7d6c5b4a",
          "x": 0.25,
          "y": 0.30,
          "width": 0.40,
          "height": 0.35
        }
      ],
      "split": "train",
      "isAugmented": false,
      "originalImageId": null,
      "aiSuggestions": [],
      "hasSuggestions": false
    }
  ]
  ```

### `POST /api/projects/{project_id}/images`
Upload a single image file via standard multipart form data.

- **Status**: `201 Created`
- **Request Body**: `multipart/form-data` with field `file`
- **Response**: `ProjectImageOut`

### `POST /api/projects/{project_id}/images/batch`
Upload multiple images in a single request using Base64 data URLs (used for bulk image imports and extracted video frames).

- **Status**: `201 Created`
- **Request Body**: `application/json` (`List[BatchImageItem]`)
  ```json
  [
    {
      "name": "frame_001.jpg",
      "size": 145020,
      "type": "image/jpeg",
      "dataUrl": "data:image/jpeg;base64,...",
      "annotated": false,
      "createdAt": 1725281000000.0
    }
  ]
  ```
- **Response**: `List[ProjectImageOut]`

### `DELETE /api/images/{image_id}`
Delete a single image by ID and decrement the project image count.

- **Request Body**: None
- **Response** (`200 OK`):
  ```json
  {
    "ok": true
  }
  ```

### `PUT /api/images/{image_id}/annotations`
Save confirmed bounding box annotations for an image. Bounding box coordinates are fractional (`0.0` to `1.0`) relative to image dimensions `(x, y, width, height)` with top-left origin.

- **Request Body**: `application/json`
  ```json
  {
    "annotations": [
      {
        "id": "box_1725281234_abc",
        "classId": "cls-9f8e7d6c5b4a",
        "x": 0.152,
        "y": 0.234,
        "width": 0.310,
        "height": 0.450
      }
    ]
  }
  ```
- **Response**: `ProjectImageOut`

### `PUT /api/images/{image_id}/split`
Update the dataset split assignment for an image.

- **Request Body**: `application/json`
  ```json
  {
    "split": "train"
  }
  ```
  *(Valid split values: `"train"`, `"val"`, `"test"`, `"unassigned"`)*
- **Response**: `ProjectImageOut`

---

## 3. Pipeline (Splits, Augmentation, Settings, Export)

Router prefix: `/api` (Source: `app/routers/pipeline.py`)

### `GET /api/settings`
Retrieve dataset preparation and augmentation default settings.

- **Request Body**: None
- **Response** (`200 OK`): `SettingsOut`
  ```json
  {
    "train_percent": 70,
    "val_percent": 20,
    "test_percent": 10,
    "include_unannotated": false,
    "aug_flip": true,
    "aug_rotation": true,
    "aug_brightness": true,
    "aug_exposure": true,
    "aug_noise": false,
    "aug_variants_count": 2
  }
  ```

### `PUT /api/settings`
Update default pipeline settings.

- **Request Body**: `application/json` (partial or full dictionary of settings)
- **Response**: `SettingsOut`

### `POST /api/projects/{project_id}/split`
Perform randomized train/val/test dataset splitting using Fisher-Yates shuffle.

- **Request Body**: `application/json`
  ```json
  {
    "train_percent": 70,
    "val_percent": 20,
    "test_percent": 10,
    "include_unannotated": false
  }
  ```
- **Response**: `List[ProjectImageOut]`
- **Errors**: `400 Bad Request` if percentages do not sum to 100 or no eligible images exist.

### `POST /api/projects/{project_id}/augment`
Generate geometric and photometric augmented variations (horizontal flip, rotation ±15°, brightness, exposure, noise) for training images. Bounding box coordinates are geometrically transformed to match new image geometry.

- **Request Body**: `application/json`
  ```json
  {
    "flip": true,
    "rotation": true,
    "brightness": true,
    "exposure": true,
    "noise": false,
    "variants_count": 2
  }
  ```
- **Response**: `List[ProjectImageOut]` (list of newly generated augmented images)

### `DELETE /api/projects/{project_id}/augmented`
Remove all generated augmented images from the project.

- **Request Body**: None
- **Response** (`200 OK`):
  ```json
  {
    "deleted_count": 24
  }
  ```

### `GET /api/projects/{project_id}/export`
Export the dataset in official YOLO format packaged as a ZIP archive.

- **Request Body**: None
- **Response** (`200 OK`): `StreamingResponse` (`application/zip`)
  Archive contents:
  ```
  classes.txt
  dataset.yaml
  train/
    images/
    labels/
  val/
    images/
    labels/
  test/
    images/
    labels/
  ```

---

## 4. AI Assist & Model Inference

Router prefix: `/api` (Source: `app/routers/ai_models.py`)

### `POST /api/projects/{project_id}/model`
Upload an ONNX model weights file (`.onnx`) to use for auto-annotation. Extracts input shape and class names from model metadata.

- **Request Body**: `multipart/form-data` with field `file`
- **Response** (`200 OK`): `ProjectModelOut`
  ```json
  {
    "id": "mdl-1234567890ab",
    "projectId": "proj-35c88128a6a6",
    "filename": "yolov8n.onnx",
    "classNames": ["person", "bicycle", "car", "blackbuck"],
    "numClasses": 80,
    "classMapping": {},
    "confidenceThreshold": 0.5,
    "inputShape": [640, 640]
  }
  ```

### `GET /api/projects/{project_id}/model`
Retrieve metadata for the project's loaded ONNX model.

- **Request Body**: None
- **Response** (`200 OK`): `ProjectModelOut`
- **Errors**: `404 Not Found` if no model is loaded.

### `DELETE /api/projects/{project_id}/model`
Unload and remove the project's active model weights and mapping from disk and database.

- **Request Body**: None
- **Response** (`200 OK`):
  ```json
  {
    "ok": true
  }
  ```

### `PUT /api/projects/{project_id}/model/classes`
Manually set the model's raw category labels list if not present in ONNX metadata.

- **Request Body**: `application/json`
  ```json
  {
    "classNames": ["animal", "vehicle", "human"]
  }
  ```
- **Response**: `ProjectModelOut`

### `PUT /api/projects/{project_id}/model/mapping`
Map model output indices to project class IDs. Supports `"NEW:<class_name>"` to auto-create corresponding project classes.

- **Request Body**: `application/json`
  ```json
  {
    "mapping": {
      "0": "cls-9f8e7d6c5b4a",
      "1": "NEW:vehicle"
    }
  }
  ```
- **Response**:
  ```json
  {
    "model": { /* ProjectModelOut */ },
    "newClasses": [ /* newly created ProjectClassOut */ ],
    "allClasses": [ /* all ProjectClassOut */ ]
  }
  ```

### `POST /api/projects/{project_id}/infer`
Run server-side ONNX inference across specified image IDs and store predicted bounding boxes in `ai_suggestions`.

- **Request Body**: `application/json`
  ```json
  {
    "imageIds": ["img-a1b2c3d4e5f6"],
    "confidenceThreshold": 0.45
  }
  ```
- **Response**: `List[ProjectImageOut]`

### `POST /api/projects/{project_id}/infer/unannotated`
Run model inference on all unannotated images in the project staging area.

- **Request Body**: `application/json`
  ```json
  {
    "confidenceThreshold": 0.5
  }
  ```
- **Response**: `List[ProjectImageOut]`

### `POST /api/images/{image_id}/suggestions/accept`
Accept a subset of pending AI suggestions (or all if `boxIds` is empty), converting them into confirmed `BoundingBox` annotations and removing them from pending suggestions.

- **Request Body**: `application/json`
  ```json
  {
    "boxIds": ["sug-1", "sug-2"]
  }
  ```
- **Response**: `ProjectImageOut`

### `POST /api/images/{image_id}/suggestions/reject`
Reject and discard pending AI suggestions without altering confirmed annotations.

- **Request Body**: `application/json`
  ```json
  {
    "boxIds": ["sug-3"]
  }
  ```
- **Response**: `ProjectImageOut`

---

## 5. In-App Model Training

Router prefix: `/api/projects/{project_id}/train` (Source: `app/routers/training.py`)

### `POST /api/projects/{project_id}/train`
Start a background YOLO model training run on the project's annotated dataset.

- **Status**: `202 Accepted`
- **Request Body**: `application/json`
  ```json
  {
    "model_variant": "yolov8n",
    "epochs": 50,
    "imgsz": 640,
    "batch_size": "auto",
    "output_formats": ["pt", "onnx"]
  }
  ```
  *(Supported `model_variant`: `yolov8n`, `yolov8s`, `yolov8m`, `yolov8l`, `yolov8x`, `yolo11n`, `yolo11s`, `yolo11m`, `yolo11l`, `yolo11x`)*
- **Response**: `TrainingJobOut`
  ```json
  {
    "id": "train-a63adba118ef",
    "projectId": "proj-35c88128a6a6",
    "status": "queued",
    "modelVariant": "yolov8n",
    "epochs": 50,
    "imgsz": 640,
    "batchSize": "auto",
    "outputFormats": ["pt", "onnx"],
    "createdAt": 1725282000000.0,
    "startedAt": null,
    "completedAt": null,
    "currentEpoch": null,
    "metricsLog": [],
    "errorMessage": null,
    "hasPt": false,
    "hasOnnx": false
  }
  ```
- **Errors**:
  - `400 Bad Request`: Invalid parameters or dataset does not meet pre-flight criteria (e.g. `< 5` train images, `< 1` val image, or `0` classes).
  - `409 Conflict`: Another training job is already active across the application (global GPU/compute lock).

### `GET /api/projects/{project_id}/train/jobs`
List all training jobs for this project, ordered newest first.

- **Request Body**: None
- **Response** (`200 OK`): `List[TrainingJobOut]`

### `GET /api/projects/{project_id}/train/jobs/{job_id}`
Retrieve live status, progress, and telemetry metrics for a specific training run.

- **Request Body**: None
- **Response** (`200 OK`): `TrainingJobOut`
  ```json
  {
    "id": "train-a63adba118ef",
    "projectId": "proj-35c88128a6a6",
    "status": "running",
    "modelVariant": "yolov8n",
    "epochs": 50,
    "imgsz": 640,
    "batchSize": "auto",
    "outputFormats": ["pt", "onnx"],
    "createdAt": 1725282000000.0,
    "startedAt": 1725282005000.0,
    "completedAt": null,
    "currentEpoch": 14,
    "metricsLog": [
      {
        "epoch": 1,
        "box_loss": 0.0512,
        "cls_loss": 0.0210,
        "dfl_loss": 0.0125,
        "mAP50": 0.742,
        "mAP50_95": 0.510,
        "total_loss": 0.0847
      }
    ],
    "errorMessage": null,
    "hasPt": false,
    "hasOnnx": false
  }
  ```

### `POST /api/projects/{project_id}/train/jobs/{job_id}/cancel`
Cancel a queued or running training job cleanly.

- **Request Body**: None
- **Response** (`200 OK`): `TrainingJobOut` (with `status: "cancelled"`)

### `GET /api/projects/{project_id}/train/jobs/{job_id}/download`
Download the resulting trained model weights file.

- **Query Parameters**:
  - `format`: `"pt"` or `"onnx"` (required)
- **Response** (`200 OK`): `FileResponse` (`application/octet-stream`)
- **Errors**:
  - `400 Bad Request`: Job is not in `completed` status.
  - `404 Not Found`: Requested format file was not produced or is missing.
