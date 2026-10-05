from pydantic import BaseModel
from typing import Optional, List, Any, Dict

# ─── Core annotation types ────────────────────────────────────────────────────

class BoundingBox(BaseModel):
    id: str
    classId: str
    x: float
    y: float
    width: float
    height: float

class AISuggestion(BaseModel):
    """A detection produced by the model — pending human review."""
    id: str
    classId: str          # mapped to a project class id
    x: float
    y: float
    width: float
    height: float
    confidence: float     # 0.0 – 1.0
    modelClassIdx: int    # original model output class index

# ─── Project / Class / Image out ─────────────────────────────────────────────

class ProjectClassBase(BaseModel):
    name: str
    color: str

class ProjectClassOut(ProjectClassBase):
    id: str
    class Config:
        from_attributes = True

class ProjectImageOut(BaseModel):
    id: str
    projectId: str
    name: str
    size: int
    type: str
    dataUrl: str
    annotated: bool
    createdAt: float
    annotations: List[BoundingBox] = []
    split: str = 'unassigned'
    isAugmented: bool = False
    originalImageId: Optional[str] = None
    # AI assist fields
    aiSuggestions: List[AISuggestion] = []
    hasSuggestions: bool = False
    class Config:
        from_attributes = True

class ProjectOut(BaseModel):
    id: str
    name: str
    createdAt: float
    imageCount: int
    classes: List[ProjectClassOut] = []
    class Config:
        from_attributes = True

# ─── Project / Class requests ─────────────────────────────────────────────────

class CreateProjectRequest(BaseModel):
    name: str

class AddClassRequest(BaseModel):
    name: str
    color: str

class SaveAnnotationsRequest(BaseModel):
    annotations: List[BoundingBox]

class UpdateSplitRequest(BaseModel):
    split: str  # 'train'|'val'|'test'|'unassigned'

# ─── Pipeline requests ────────────────────────────────────────────────────────

class AutoSplitRequest(BaseModel):
    train_percent: int
    val_percent: int
    test_percent: int
    include_unannotated: bool = False

class AugmentRequest(BaseModel):
    flip: bool = True
    rotation: bool = True
    brightness: bool = True
    exposure: bool = True
    noise: bool = False
    variants_count: int = 2

class SettingsOut(BaseModel):
    train_percent: int = 70
    val_percent: int = 20
    test_percent: int = 10
    include_unannotated: bool = False
    aug_flip: bool = True
    aug_rotation: bool = True
    aug_brightness: bool = True
    aug_exposure: bool = True
    aug_noise: bool = False
    aug_variants_count: int = 2

class BatchImageItem(BaseModel):
    name: str
    size: int
    type: str
    dataUrl: str
    annotated: bool = False
    createdAt: float

# ─── AI model schemas ─────────────────────────────────────────────────────────

class ProjectModelOut(BaseModel):
    id: str
    projectId: str
    filename: str
    classNames: Optional[List[str]] = None   # None when not yet set / not in metadata
    numClasses: int
    classMapping: Dict[str, str] = {}        # {"0": "cls-xxx", "1": "cls-yyy"}
    confidenceThreshold: float = 0.5
    inputShape: List[int] = [640, 640]

class SetModelClassesRequest(BaseModel):
    classNames: List[str]

class SetMappingRequest(BaseModel):
    # key = str(model_class_idx), value = project_class_id OR "NEW:<name>"
    mapping: Dict[str, str]

class RunInferenceRequest(BaseModel):
    imageIds: List[str]
    confidenceThreshold: float = 0.5

class AcceptSuggestionsRequest(BaseModel):
    boxIds: List[str]  # empty list means accept ALL

class RejectSuggestionsRequest(BaseModel):
    boxIds: List[str]  # empty list means reject ALL

class SpeciesModuleBase(BaseModel):
    slug: str
    displayName: str
    wildlifeConfigRelpath: str

class CreateSpeciesModuleRequest(BaseModel):
    slug: str
    display_name: Optional[str] = None
    displayName: Optional[str] = None
    wildlife_config_relpath: Optional[str] = None
    wildlifeConfigRelpath: Optional[str] = None

class SpeciesModuleOut(BaseModel):
    id: str
    slug: str
    displayName: str
    wildlifeConfigRelpath: str
    createdAt: float
    hasActiveModel: bool = False
    activeJobId: Optional[str] = None
    activeProjectId: Optional[str] = None

    class Config:
        from_attributes = True

class ActivateJobRequest(BaseModel):
    species_slug: Optional[str] = None
    speciesSlug: Optional[str] = None

class SpeciesModelStatus(BaseModel):
    speciesSlug: str
    displayName: str
    wildlifeConfigRelpath: str
    hasActiveModel: bool = False
    activeJobId: Optional[str] = None
    activeProjectId: Optional[str] = None
    activeProjectName: Optional[str] = None
    activatedAt: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None

# ─── Training schemas ─────────────────────────────────────────────────────────

class StartTrainingRequest(BaseModel):
    model_variant: str = "yolov8n"
    epochs: int = 50
    imgsz: int = 640
    batch_size: str = "auto"                    # "auto" or numeric string
    output_formats: List[str] = ["pt", "onnx"]

class TrainingJobOut(BaseModel):
    id: str
    projectId: str
    status: str                                  # queued|running|completed|failed|cancelled
    modelVariant: str
    epochs: int
    imgsz: int
    batchSize: str
    outputFormats: List[str] = []
    createdAt: float
    startedAt: Optional[float] = None
    completedAt: Optional[float] = None
    currentEpoch: Optional[int] = None
    metricsLog: List[Dict[str, Any]] = []
    errorMessage: Optional[str] = None
    hasPt: bool = False
    hasOnnx: bool = False
    isActive: bool = False
    speciesSlug: Optional[str] = None

    class Config:
        from_attributes = True

