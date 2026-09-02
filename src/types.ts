export interface ProjectClass {
  id: string;
  name: string;
  color: string; // Hex color code for annotations and labeling highlights
}

export type ImageSplit = 'train' | 'val' | 'test' | 'unassigned';

export interface BoundingBox {
  id: string;
  classId: string;
  x: number; // fractional coordinates (0 to 1)
  y: number; // fractional coordinates (0 to 1)
  width: number; // fractional coordinates (0 to 1)
  height: number; // fractional coordinates (0 to 1)
}

export interface AISuggestion {
  id: string;
  classId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  modelClassIdx: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  imageCount: number;
  classes?: ProjectClass[];
}

export interface ProjectImage {
  id: string;
  projectId: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  annotated: boolean;
  createdAt: number;
  annotations?: BoundingBox[];
  split?: ImageSplit;
  isAugmented?: boolean;
  originalImageId?: string | null;
  aiSuggestions?: AISuggestion[];
  hasSuggestions?: boolean;
}

export interface ProjectModel {
  id: string;
  projectId: string;
  filename: string;
  classNames?: string[] | null;
  numClasses: number;
  classMapping: Record<string, string>;
  confidenceThreshold: number;
  inputShape: number[];
}

export interface AutoSplitRequest {
  train_percent: number;
  val_percent: number;
  test_percent: number;
  include_unannotated?: boolean;
}

export interface AugmentRequest {
  flip?: boolean;
  rotation?: boolean;
  brightness?: boolean;
  exposure?: boolean;
  noise?: boolean;
  variants_count?: number;
}

export interface Settings {
  train_percent: number;
  val_percent: number;
  test_percent: number;
  include_unannotated: boolean;
  aug_flip: boolean;
  aug_rotation: boolean;
  aug_brightness: boolean;
  aug_exposure: boolean;
  aug_noise: boolean;
  aug_variants_count: number;
}

export interface BatchImageItem {
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  annotated?: boolean;
  createdAt: number;
}

export interface SetMappingResponse {
  model: ProjectModel;
  newClasses: ProjectClass[];
  allClasses: ProjectClass[];
}

export interface StartTrainingRequest {
  model_variant?: string;
  epochs?: number;
  imgsz?: number;
  batch_size?: string | number;
  output_formats?: string[];
}

export interface TrainingMetricEntry {
  epoch: number;
  box_loss?: number;
  cls_loss?: number;
  dfl_loss?: number;
  mAP50?: number;
  mAP50_95?: number;
  total_loss?: number;
  [key: string]: any;
}

export interface TrainingJob {
  id: string;
  projectId: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  modelVariant: string;
  epochs: number;
  imgsz: number;
  batchSize: string;
  outputFormats: string[];
  createdAt: number;
  startedAt?: number | null;
  completedAt?: number | null;
  currentEpoch?: number | null;
  metricsLog: TrainingMetricEntry[];
  errorMessage?: string | null;
  hasPt: boolean;
  hasOnnx: boolean;
}

