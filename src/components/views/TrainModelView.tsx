import React, { useState, useEffect, useMemo } from 'react';
import { Project, ProjectImage, TrainingJob, StartTrainingRequest } from '../../types';
import { api } from '../../api';
import { Card, CardHeader, CardTitle, Button, Badge, Input, Select, Checkbox } from '../ui';
import CornerBrackets from '../CornerBrackets';
import {
  Flame,
  Cpu,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  Sparkles,
  ArrowRight,
  RotateCcw,
  Clock,
  Activity,
  Layers,
  Sliders,
  Check,
  X,
  FileCode,
  Zap,
  Info,
  History,
  AlertTriangle,
  StopCircle,
} from 'lucide-react';

export interface TrainModelViewProps {
  project: Project;
  images: ProjectImage[];
  activeJob: TrainingJob | null;
  onActiveJobChange: (job: TrainingJob | null) => void;
  onNavigateToAnnotate: () => void;
  onNavigateToPipeline: (tab?: 'split' | 'augment' | 'export') => void;
  onNavigateToAIAssist: () => void;
  onUpdateProjectClasses?: (newClasses: Project['classes']) => void;
}

interface ModelVariantOption {
  id: string;
  name: string;
  tag: string;
  family: 'v8' | 'v11';
  params: string;
  description: string;
  recommendation?: string;
  isDefault?: boolean;
}

const MODEL_VARIANTS: ModelVariantOption[] = [
  {
    id: 'yolov8n',
    name: 'YOLOv8 Nano',
    tag: 'Fastest',
    family: 'v8',
    params: '3.2M params',
    description: 'Ultra-lightweight and fastest training speed. Ideal for simple objects, edge devices, or rapid prototyping.',
    recommendation: 'Recommended for quick tests and CPU training',
    isDefault: true,
  },
  {
    id: 'yolov8s',
    name: 'YOLOv8 Small',
    tag: 'Balanced',
    family: 'v8',
    params: '11.2M params',
    description: 'Great balance of high detection precision and fast inference. Excellent for general datasets.',
  },
  {
    id: 'yolov8m',
    name: 'YOLOv8 Medium',
    tag: 'High Accuracy',
    family: 'v8',
    params: '25.9M params',
    description: 'Higher accuracy for complex scenes with overlapping or diverse objects; takes longer to train.',
  },
  {
    id: 'yolov8l',
    name: 'YOLOv8 Large',
    tag: 'Professional',
    family: 'v8',
    params: '43.7M params',
    description: 'Professional-grade precision for dense scenes with subtle features; requires GPU compute.',
  },
  {
    id: 'yolov8x',
    name: 'YOLOv8 X-Large',
    tag: 'Max Precision',
    family: 'v8',
    params: '68.2M params',
    description: 'Maximum detection precision for rigorous benchmarks; most resource-intensive.',
  },
  {
    id: 'yolo11n',
    name: 'YOLO11 Nano',
    tag: 'Next-Gen Fast',
    family: 'v11',
    params: '2.6M params',
    description: 'Ultralytics YOLO11 architecture with improved feature extraction and lower parameter count.',
  },
  {
    id: 'yolo11s',
    name: 'YOLO11 Small',
    tag: 'Next-Gen Balanced',
    family: 'v11',
    params: '9.4M params',
    description: 'YOLO11 optimized small architecture for balanced speed and accuracy.',
  },
  {
    id: 'yolo11m',
    name: 'YOLO11 Medium',
    tag: 'Next-Gen Accuracy',
    family: 'v11',
    params: '20.1M params',
    description: 'YOLO11 medium architecture with enhanced spatial attention and multi-scale detection.',
  },
];

export default function TrainModelView({
  project,
  images,
  activeJob,
  onActiveJobChange,
  onNavigateToAnnotate,
  onNavigateToPipeline,
  onNavigateToAIAssist,
  onUpdateProjectClasses,
}: TrainModelViewProps) {
  // Form State
  const [selectedVariant, setSelectedVariant] = useState<string>('yolov8n');
  const [variantFamily, setVariantFamily] = useState<'v8' | 'v11'>('v8');
  const [epochs, setEpochs] = useState<number>(50);
  const [imgsz, setImgsz] = useState<number>(640);
  const [batchSize, setBatchSize] = useState<string>('auto');
  const [outputPt, setOutputPt] = useState<boolean>(true);
  const [outputOnnx, setOutputOnnx] = useState<boolean>(true);

  // Job Action States
  const [isStarting, setIsStarting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDeployingToAI, setIsDeployingToAI] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // History State
  const [jobsHistory, setJobsHistory] = useState<TrainingJob[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Elapsed Timer state
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Fetch jobs history
  const loadHistory = async () => {
    try {
      const history = await api.listTrainingJobs(project.id);
      setJobsHistory(history);

      // Check if there is an active job in history that wasn't tracked
      const runningJob = history.find(j => j.status === 'running' || j.status === 'queued');
      if (runningJob && (!activeJob || activeJob.id !== runningJob.id)) {
        onActiveJobChange(runningJob);
      }
    } catch (err: any) {
      console.error('Failed to load training jobs history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [project.id]);

  // Elapsed time tracker for active job
  useEffect(() => {
    let interval: any = null;
    if (activeJob && (activeJob.status === 'running' || activeJob.status === 'queued')) {
      const startTime = activeJob.startedAt || activeJob.createdAt;
      const updateTimer = () => {
        const now = Date.now();
        setElapsedSeconds(Math.max(0, Math.floor((now - startTime) / 1000)));
      };
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeJob?.id, activeJob?.status, activeJob?.startedAt, activeJob?.createdAt]);

  // Dataset Pre-flight Validation
  const validation = useMemo(() => {
    const classes = project.classes || [];
    const classesCount = classes.length;

    const annotatedTrainImages = images.filter(
      img => img.split === 'train' && (img.annotated || (img.annotations && img.annotations.length > 0))
    );
    const annotatedValImages = images.filter(
      img => img.split === 'val' && (img.annotated || (img.annotations && img.annotations.length > 0))
    );
    const totalAnnotated = images.filter(
      img => img.annotated || (img.annotations && img.annotations.length > 0)
    );

    const minTrainRequired = 5;
    const minValRequired = 1;

    let isValid = true;
    const errors: string[] = [];

    if (classesCount === 0) {
      isValid = false;
      errors.push('Project has no classes defined. Add at least one label class.');
    }
    if (annotatedTrainImages.length < minTrainRequired) {
      isValid = false;
      errors.push(
        `Insufficient training data: Found ${annotatedTrainImages.length} of ${minTrainRequired} required annotated images in the training split.`
      );
    }
    if (annotatedValImages.length < minValRequired) {
      isValid = false;
      errors.push(
        `Missing validation split: Found ${annotatedValImages.length} of ${minValRequired} required annotated images in the validation split.`
      );
    }

    return {
      isValid,
      errors,
      classesCount,
      trainCount: annotatedTrainImages.length,
      valCount: annotatedValImages.length,
      totalAnnotatedCount: totalAnnotated.length,
      minTrainRequired,
      minValRequired,
    };
  }, [project.classes, images]);

  // Handle Start Training
  const handleStartTraining = async () => {
    if (!validation.isValid) return;

    const formats: string[] = [];
    if (outputPt) formats.push('pt');
    if (outputOnnx) formats.push('onnx');

    if (formats.length === 0) {
      setActionError('Please select at least one output format (.pt or .onnx).');
      return;
    }

    setIsStarting(true);
    setActionError(null);

    const req: StartTrainingRequest = {
      model_variant: selectedVariant,
      epochs,
      imgsz,
      batch_size: batchSize,
      output_formats: formats,
    };

    try {
      const job = await api.startTraining(project.id, req);
      onActiveJobChange(job);
      setJobsHistory(prev => [job, ...prev.filter(j => j.id !== job.id)]);
    } catch (err: any) {
      console.error('Failed to start training job:', err);
      setActionError(err?.message || 'Failed to start training run.');
    } finally {
      setIsStarting(false);
    }
  };

  // Handle Cancel Training
  const handleCancelTraining = async () => {
    if (!activeJob) return;

    setIsCancelling(true);
    try {
      const updated = await api.cancelTrainingJob(project.id, activeJob.id);
      onActiveJobChange(updated);
      setJobsHistory(prev => prev.map(j => (j.id === updated.id ? updated : j)));
    } catch (err: any) {
      console.error('Failed to cancel training job:', err);
      setActionError(err?.message || 'Failed to cancel training job.');
    } finally {
      setIsCancelling(false);
    }
  };

  // Handle Deploying trained model directly into AI Assist
  const handleDeployToAIAssist = async (job: TrainingJob) => {
    if (!job.hasOnnx) {
      setActionError('ONNX weights are not available for this training run.');
      return;
    }

    setIsDeployingToAI(true);
    setActionError(null);

    try {
      // 1. Fetch ONNX blob from server
      const blob = await api.downloadTrainingOutput(project.id, job.id, 'onnx');
      const file = new File([blob], `${job.modelVariant}_best.onnx`, {
        type: 'application/octet-stream',
      });

      // 2. Upload to project's active AI model
      const uploaded = await api.uploadModel(project.id, file);

      // 3. Auto-configure category mappings for project classes
      const projectClasses = project.classes || [];
      const modelNames = uploaded.classNames || [];
      const mapping: Record<string, string> = {};

      if (modelNames.length > 0) {
        modelNames.forEach((name, idx) => {
          const match = projectClasses.find(c => c.name.toLowerCase() === name.toLowerCase());
          if (match) {
            mapping[String(idx)] = match.id;
          } else {
            mapping[String(idx)] = `NEW:${name}`;
          }
        });
      } else {
        // Map 1-to-1 with project classes by index
        projectClasses.forEach((cls, idx) => {
          mapping[String(idx)] = cls.id;
        });
      }

      if (Object.keys(mapping).length > 0) {
        const mapRes = await api.setModelMapping(project.id, mapping);
        if (mapRes.allClasses) {
          onUpdateProjectClasses?.(mapRes.allClasses);
        }
      }

      // 4. Navigate directly to AI Assist studio
      onNavigateToAIAssist();
    } catch (err: any) {
      console.error('Failed to deploy model to AI Assist:', err);
      setActionError(err?.message || 'Failed to send model to AI Assist.');
    } finally {
      setIsDeployingToAI(false);
    }
  };

  // Helper to format elapsed seconds
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Latest metrics from active job
  const latestMetric = useMemo(() => {
    if (!activeJob || !activeJob.metricsLog || activeJob.metricsLog.length === 0) {
      return null;
    }
    return activeJob.metricsLog[activeJob.metricsLog.length - 1];
  }, [activeJob?.metricsLog]);

  const activeProgress = useMemo(() => {
    if (!activeJob) return 0;
    if (activeJob.status === 'completed') return 100;
    if (activeJob.status === 'queued') return 5;
    const current = activeJob.currentEpoch ?? 0;
    const total = activeJob.epochs || 50;
    return Math.min(99, Math.round((current / total) * 100));
  }, [activeJob?.status, activeJob?.currentEpoch, activeJob?.epochs]);

  const filteredVariants = MODEL_VARIANTS.filter(v => v.family === variantFamily);

  return (
    <div className="space-y-6 animate-fadeIn" id="train-model-view">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#2A2F38]">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="font-sans font-bold text-xl text-[#E6E9EF] tracking-tight">
              Train Custom YOLO Model
            </h2>
            <Badge variant="primary" size="sm">
              <Flame size={11} className="text-[#FFB020]" />
              In-App YOLO Studio
            </Badge>
          </div>
          <p className="font-sans text-xs text-[#8B93A1] mt-0.5">
            Train computer vision models directly on your annotated dataset with zero machine learning setup.
          </p>
        </div>

        {/* Status Pill in header */}
        {activeJob && (activeJob.status === 'running' || activeJob.status === 'queued') && (
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-[#FFB020]/10 border border-[#FFB020]/30 text-xs text-[#FFB020] font-mono">
            <Loader2 size={13} className="animate-spin text-[#FFB020]" />
            <span>
              {activeJob.status === 'queued'
                ? 'Job Queued...'
                : `Training: Epoch ${activeJob.currentEpoch ?? 0}/${activeJob.epochs}`}
            </span>
          </div>
        )}
      </div>

      {actionError && (
        <div className="p-3.5 rounded-lg bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 text-xs text-[#FF4D4D] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{actionError}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-[#FF4D4D] hover:text-white cursor-pointer p-1"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ACTIVE JOB RUNNING / QUEUED BANNER */}
      {activeJob && (activeJob.status === 'running' || activeJob.status === 'queued') && (
        <Card elevation="high" className="p-6 border-l-4 border-l-[#FFB020] space-y-5 bg-[#14171C]">
          <CornerBrackets />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#FFB020] animate-ping" />
                <h3 className="font-sans font-bold text-base text-[#E6E9EF]">
                  {activeJob.status === 'queued' ? 'Training Job Queued' : 'Training Model in Progress'}
                </h3>
                <Badge variant="warning" size="sm">
                  {activeJob.modelVariant}
                </Badge>
              </div>
              <p className="text-xs text-[#8B93A1]">
                {activeJob.status === 'queued'
                  ? 'Staging dataset and initializing neural network weights...'
                  : `Optimizing weights over ${activeJob.epochs} epochs. You can navigate away anytime; training continues safely in the background.`}
              </p>
            </div>

            <div className="flex items-center space-x-3 shrink-0">
              <div className="text-right font-mono text-xs text-[#8B93A1]">
                <span>Elapsed: </span>
                <span className="font-bold text-[#E6E9EF]">{formatTimer(elapsedSeconds)}</span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelTraining}
                isLoading={isCancelling}
                leftIcon={<StopCircle size={14} />}
              >
                Cancel Training
              </Button>
            </div>
          </div>

          {/* Live Progress Bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs font-mono">
              <span className="text-[#8B93A1]">
                Epoch <span className="text-[#00E5A3] font-bold">{activeJob.currentEpoch ?? 0}</span> / {activeJob.epochs}
              </span>
              <span className="font-bold text-[#3DA9FC]">{activeProgress}%</span>
            </div>
            <div className="w-full bg-[#101317] h-2.5 rounded-full overflow-hidden border border-[#2A2F38]">
              <div
                className="bg-linear-to-r from-[#3DA9FC] via-[#00E5A3] to-[#FFB020] h-full transition-all duration-300 ease-out"
                style={{ width: `${activeProgress}%` }}
              />
            </div>
          </div>

          {/* Telemetry Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
            <div className="p-3 rounded-lg bg-[#101317] border border-[#2A2F38] space-y-1">
              <p className="text-[10px] font-mono text-[#8B93A1] uppercase">mAP@50</p>
              <p className="text-base font-mono font-bold text-[#00E5A3]">
                {latestMetric?.mAP50 !== undefined ? `${(latestMetric.mAP50 * 100).toFixed(1)}%` : '--'}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[#101317] border border-[#2A2F38] space-y-1">
              <p className="text-[10px] font-mono text-[#8B93A1] uppercase">mAP@50-95</p>
              <p className="text-base font-mono font-bold text-[#3DA9FC]">
                {latestMetric?.mAP50_95 !== undefined ? `${(latestMetric.mAP50_95 * 100).toFixed(1)}%` : '--'}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[#101317] border border-[#2A2F38] space-y-1">
              <p className="text-[10px] font-mono text-[#8B93A1] uppercase">Box Loss</p>
              <p className="text-base font-mono font-bold text-[#E6E9EF]">
                {latestMetric?.box_loss !== undefined ? latestMetric.box_loss.toFixed(4) : '--'}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[#101317] border border-[#2A2F38] space-y-1">
              <p className="text-[10px] font-mono text-[#8B93A1] uppercase">Class Loss</p>
              <p className="text-base font-mono font-bold text-[#E6E9EF]">
                {latestMetric?.cls_loss !== undefined ? latestMetric.cls_loss.toFixed(4) : '--'}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-[#101317] border border-[#2A2F38] space-y-1 col-span-2 sm:col-span-1">
              <p className="text-[10px] font-mono text-[#8B93A1] uppercase">DFL Loss</p>
              <p className="text-base font-mono font-bold text-[#E6E9EF]">
                {latestMetric?.dfl_loss !== undefined ? latestMetric.dfl_loss.toFixed(4) : '--'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* RECENTLY COMPLETED JOB SUCCESS CARD */}
      {activeJob && activeJob.status === 'completed' && (
        <Card elevation="mid" className="p-6 border-l-4 border-l-[#00E5A3] space-y-5 bg-[#14171C]">
          <CornerBrackets />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <CheckCircle2 size={20} className="text-[#00E5A3]" />
                <h3 className="font-sans font-bold text-base text-[#E6E9EF]">
                  Model Training Completed Successfully!
                </h3>
                <Badge variant="success" size="sm">
                  {activeJob.modelVariant}
                </Badge>
              </div>
              <p className="text-xs text-[#8B93A1]">
                Weights are ready for download or direct activation in AI Assist auto-annotation.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {activeJob.hasPt && (
                <a
                  href={api.getTrainingDownloadUrl(project.id, activeJob.id, 'pt')}
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B1F26] hover:bg-[#222731] border border-[#2A2F38] text-xs font-semibold text-[#E6E9EF] transition-colors"
                >
                  <Download size={13} className="text-[#3DA9FC]" />
                  Download .pt
                </a>
              )}

              {activeJob.hasOnnx && (
                <a
                  href={api.getTrainingDownloadUrl(project.id, activeJob.id, 'onnx')}
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1B1F26] hover:bg-[#222731] border border-[#2A2F38] text-xs font-semibold text-[#E6E9EF] transition-colors"
                >
                  <Download size={13} className="text-[#00E5A3]" />
                  Download .onnx
                </a>
              )}

              {activeJob.hasOnnx && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleDeployToAIAssist(activeJob)}
                  isLoading={isDeployingToAI}
                  leftIcon={<Sparkles size={13} />}
                >
                  Use in AI Assist
                </Button>
              )}
            </div>
          </div>

          {/* Final Metrics Summary */}
          {latestMetric && (
            <div className="p-3.5 rounded-lg bg-[#101317] border border-[#2A2F38] flex flex-wrap gap-6 text-xs font-mono">
              <div>
                <span className="text-[#8B93A1]">Final mAP@50: </span>
                <span className="font-bold text-[#00E5A3]">
                  {latestMetric.mAP50 !== undefined ? `${(latestMetric.mAP50 * 100).toFixed(1)}%` : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[#8B93A1]">Final mAP@50-95: </span>
                <span className="font-bold text-[#3DA9FC]">
                  {latestMetric.mAP50_95 !== undefined ? `${(latestMetric.mAP50_95 * 100).toFixed(1)}%` : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[#8B93A1]">Box Loss: </span>
                <span className="font-bold text-[#E6E9EF]">
                  {latestMetric.box_loss !== undefined ? latestMetric.box_loss.toFixed(4) : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[#8B93A1]">Total Epochs: </span>
                <span className="font-bold text-[#E6E9EF]">{activeJob.epochs}</span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* RECENTLY FAILED / CANCELLED JOB BANNER */}
      {activeJob && (activeJob.status === 'failed' || activeJob.status === 'cancelled') && (
        <div
          className={`p-4 rounded-xl border text-xs flex items-center justify-between gap-4 ${
            activeJob.status === 'failed'
              ? 'bg-[#FF4D4D]/10 border-[#FF4D4D]/30 text-[#FF4D4D]'
              : 'bg-[#1B1F26] border-[#2A2F38] text-[#8B93A1]'
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {activeJob.status === 'failed' ? (
              <AlertCircle size={18} className="shrink-0 text-[#FF4D4D]" />
            ) : (
              <Info size={18} className="shrink-0 text-[#8B93A1]" />
            )}
            <div>
              <p className="font-semibold text-[#E6E9EF]">
                {activeJob.status === 'failed' ? 'Training Run Failed' : 'Training Run Cancelled'}
              </p>
              <p className="text-[11px] opacity-80 mt-0.5">
                {activeJob.errorMessage || 'The training job stopped before completing.'}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => onActiveJobChange(null)}
            className="shrink-0"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* MAIN TWO-COLUMN LAYOUT: CONFIGURATION FORM & TRAINING INFO */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): Training Configuration Form */}
        <div className="lg:col-span-8 space-y-6">
          <Card elevation="low" className="p-6 space-y-6">
            <CornerBrackets />

            <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
              <div>
                <CardTitle>Training Configuration</CardTitle>
                <p className="text-xs text-[#8B93A1] mt-0.5">
                  Select model architecture and training parameters. Sensible defaults are pre-configured.
                </p>
              </div>

              {/* Family Tab Selector (YOLOv8 / YOLO11) */}
              <div className="flex items-center p-1 rounded-lg bg-[#14171C] border border-[#2A2F38]">
                <button
                  type="button"
                  onClick={() => {
                    setVariantFamily('v8');
                    setSelectedVariant('yolov8n');
                  }}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                    variantFamily === 'v8'
                      ? 'bg-[#3DA9FC] text-[#14171C] shadow-xs'
                      : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                  }`}
                >
                  YOLOv8
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVariantFamily('v11');
                    setSelectedVariant('yolo11n');
                  }}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all cursor-pointer ${
                    variantFamily === 'v11'
                      ? 'bg-[#3DA9FC] text-[#14171C] shadow-xs'
                      : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                  }`}
                >
                  YOLO11 (New)
                </button>
              </div>
            </CardHeader>

            {/* 1. Model Architecture Selector Cards */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-[#E6E9EF]">
                1. Select Model Architecture
              </label>

              <div className="grid grid-cols-1 gap-2.5">
                {filteredVariants.map(variant => {
                  const isSelected = selectedVariant === variant.id;
                  return (
                    <div
                      key={variant.id}
                      onClick={() => setSelectedVariant(variant.id)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-[#3DA9FC]/10 border-[#3DA9FC] shadow-glow-primary'
                          : 'bg-[#14171C] border-[#2A2F38] hover:border-[#3DA9FC]/40 hover:bg-[#1B1F26]'
                      }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-xs text-[#E6E9EF]">{variant.name}</span>
                          <span className="font-mono text-[10px] text-[#3DA9FC] bg-[#3DA9FC]/15 px-2 py-0.5 rounded-md font-semibold">
                            {variant.tag}
                          </span>
                          <span className="font-mono text-[10px] text-[#8B93A1]">{variant.params}</span>
                          {variant.isDefault && (
                            <Badge variant="outline" size="sm">
                              Default
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-[#8B93A1] leading-relaxed">{variant.description}</p>
                        {variant.recommendation && (
                          <p className="text-[10px] text-[#00E5A3] font-medium flex items-center gap-1">
                            <Sparkles size={10} /> {variant.recommendation}
                          </p>
                        )}
                      </div>

                      <div className="shrink-0 flex items-center">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected ? 'border-[#3DA9FC] bg-[#3DA9FC]' : 'border-[#5A6270] bg-transparent'
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#14171C]" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. Hyperparameters Section */}
            <div className="space-y-3 pt-2">
              <label className="block text-xs font-semibold text-[#E6E9EF]">
                2. Training Hyperparameters
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Epochs */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[#E6E9EF] font-medium">Epochs</span>
                    <span className="text-[10px] font-mono text-[#8B93A1]">Passes</span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={epochs}
                    onChange={e => setEpochs(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 border border-[#2A2F38] rounded-lg text-xs font-mono bg-[#14171C] text-[#E6E9EF] focus:outline-none focus:border-[#3DA9FC]"
                  />
                  <p className="text-[10px] text-[#8B93A1] leading-tight">
                    Full passes through dataset. (Default: 50)
                  </p>
                </div>

                {/* Image Resolution */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[#E6E9EF] font-medium">Image Size</span>
                    <span className="text-[10px] font-mono text-[#8B93A1]">Pixels</span>
                  </div>
                  <select
                    value={imgsz}
                    onChange={e => setImgsz(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border border-[#2A2F38] rounded-lg text-xs font-mono bg-[#14171C] text-[#E6E9EF] focus:outline-none focus:border-[#3DA9FC] cursor-pointer"
                  >
                    <option value={320}>320px (Ultra Fast)</option>
                    <option value={416}>416px (Fast)</option>
                    <option value={512}>512px (Balanced)</option>
                    <option value={640}>640px (Standard / Recommended)</option>
                    <option value={800}>800px (High Res)</option>
                  </select>
                  <p className="text-[10px] text-[#8B93A1] leading-tight">
                    Network input resolution. (Default: 640px)
                  </p>
                </div>

                {/* Batch Size */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-[#E6E9EF] font-medium">Batch Size</span>
                    <span className="text-[10px] font-mono text-[#8B93A1]">VRAM</span>
                  </div>
                  <select
                    value={batchSize}
                    onChange={e => setBatchSize(e.target.value)}
                    className="w-full px-3 py-2 border border-[#2A2F38] rounded-lg text-xs font-mono bg-[#14171C] text-[#E6E9EF] focus:outline-none focus:border-[#3DA9FC] cursor-pointer"
                  >
                    <option value="auto">auto (Auto-detect VRAM)</option>
                    <option value="4">4 images / step</option>
                    <option value="8">8 images / step</option>
                    <option value="16">16 images / step</option>
                    <option value="32">32 images / step</option>
                  </select>
                  <p className="text-[10px] text-[#8B93A1] leading-tight">
                    Auto balances memory and compute. (Default: auto)
                  </p>
                </div>
              </div>
            </div>

            {/* 3. Output Formats */}
            <div className="space-y-2 pt-2">
              <label className="block text-xs font-semibold text-[#E6E9EF]">
                3. Generated Output Formats
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-[#14171C] border border-[#2A2F38]">
                  <Checkbox
                    checked={outputPt}
                    onChange={e => setOutputPt(e.target.checked)}
                    label="PyTorch Weights (.pt)"
                    description="Standard PyTorch weights for continued training or deployment with Ultralytics."
                  />
                </div>

                <div className="p-3 rounded-lg bg-[#14171C] border border-[#2A2F38]">
                  <Checkbox
                    checked={outputOnnx}
                    onChange={e => setOutputOnnx(e.target.checked)}
                    label="ONNX Model (.onnx)"
                    description="Optimized open graph format for AI Assist auto-annotation and cross-platform inference."
                  />
                </div>
              </div>
            </div>

            {/* Pre-flight Data Validation Warning or Success Banner */}
            {!validation.isValid ? (
              <div className="p-4 rounded-xl bg-[#FFB020]/10 border border-[#FFB020]/30 space-y-3">
                <div className="flex items-start space-x-2.5">
                  <AlertTriangle size={18} className="shrink-0 text-[#FFB020] mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-[#FFB020]">
                      Dataset Not Ready for Training
                    </p>
                    <ul className="text-[11px] text-[#E6E9EF]/90 space-y-1 list-disc pl-4">
                      {validation.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1 border-t border-[#FFB020]/20">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={onNavigateToAnnotate}
                    leftIcon={<ArrowRight size={13} />}
                  >
                    Go to Annotate Studio
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigateToPipeline('split')}
                    leftIcon={<Sliders size={13} />}
                  >
                    Configure Auto-Split
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#00E5A3]/10 border border-[#00E5A3]/30 flex items-center justify-between text-xs">
                <div className="flex items-center space-x-2 text-[#00E5A3]">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>
                    Dataset validated: <strong>{validation.trainCount}</strong> train / <strong>{validation.valCount}</strong> val images ready across <strong>{validation.classesCount}</strong> classes.
                  </span>
                </div>
                <span className="font-mono text-[10px] text-[#00E5A3] bg-[#00E5A3]/20 px-2 py-0.5 rounded font-bold">
                  READY
                </span>
              </div>
            )}

            {/* Submit Action */}
            <div className="pt-2">
              <Button
                variant="primary"
                size="lg"
                className="w-full"
                disabled={!validation.isValid || isStarting || (activeJob && (activeJob.status === 'running' || activeJob.status === 'queued'))}
                isLoading={isStarting}
                onClick={handleStartTraining}
                leftIcon={<Flame size={16} className="text-[#FFB020]" />}
              >
                Start Model Training Run
              </Button>
            </div>
          </Card>
        </div>

        {/* Right Column (4 cols): Dataset Staging & Execution Summary */}
        <div className="lg:col-span-4 space-y-6">
          {/* Dataset Manifest Card */}
          <Card elevation="mid" glass className="p-6 space-y-4">
            <CornerBrackets />

            <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
              <CardTitle>Training Dataset Staging</CardTitle>
              <Badge variant="neutral" size="sm">
                YOLO Format
              </Badge>
            </CardHeader>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center py-1.5 border-b border-[#2A2F38]">
                <span className="text-[#8B93A1]">Annotated Classes:</span>
                <span className="font-bold text-[#E6E9EF] font-mono-numbers">
                  {validation.classesCount}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-[#2A2F38]">
                <span className="text-[#8B93A1]">Training Split (train):</span>
                <span
                  className={`font-bold font-mono-numbers ${
                    validation.trainCount >= validation.minTrainRequired ? 'text-[#00E5A3]' : 'text-[#FF4D4D]'
                  }`}
                >
                  {validation.trainCount} images (min {validation.minTrainRequired})
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-[#2A2F38]">
                <span className="text-[#8B93A1]">Validation Split (val):</span>
                <span
                  className={`font-bold font-mono-numbers ${
                    validation.valCount >= validation.minValRequired ? 'text-[#00E5A3]' : 'text-[#FF4D4D]'
                  }`}
                >
                  {validation.valCount} images (min {validation.minValRequired})
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5 border-b border-[#2A2F38]">
                <span className="text-[#8B93A1]">Total Labeled:</span>
                <span className="font-bold text-[#3DA9FC] font-mono-numbers">
                  {validation.totalAnnotatedCount} / {images.length}
                </span>
              </div>

              <div className="flex justify-between items-center py-1.5">
                <span className="text-[#8B93A1]">Execution Provider:</span>
                <span className="font-bold text-[#00E5A3]">Auto (CUDA / CPU)</span>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-[#8B93A1] bg-[#101317] p-3 rounded-lg border border-[#2A2F38] space-y-1">
              <p className="font-semibold text-[#E6E9EF] flex items-center gap-1">
                <Info size={13} className="text-[#3DA9FC]" /> Automatic Pipeline
              </p>
              <p>
                Images are automatically converted from Base64 to normalized YOLO images &amp; label text files inside an isolated training workspace.
              </p>
            </div>
          </Card>
        </div>
      </div>

      {/* TRAINING RUNS HISTORY TABLE */}
      <Card elevation="low" className="p-6 space-y-4">
        <CornerBrackets />

        <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
          <div className="flex items-center space-x-2">
            <History size={16} className="text-[#3DA9FC]" />
            <CardTitle>Training Runs History</CardTitle>
          </div>
          <Badge variant="neutral" size="sm">
            {jobsHistory.length} Runs Recorded
          </Badge>
        </CardHeader>

        {isLoadingHistory ? (
          <div className="py-8 text-center text-xs font-mono text-[#8B93A1] flex items-center justify-center space-x-2">
            <Loader2 size={16} className="animate-spin text-[#3DA9FC]" />
            <span>Loading training history...</span>
          </div>
        ) : jobsHistory.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#8B93A1] space-y-1 bg-[#14171C]/50 rounded-xl border border-dashed border-[#2A2F38]">
            <Flame size={20} className="mx-auto text-[#5A6270]" />
            <p className="font-semibold">No training runs yet</p>
            <p className="text-[11px] text-[#5A6270]">
              Start your first training job above to build a custom YOLO detection model.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-[#2A2F38] text-[11px] text-[#8B93A1]">
                  <th className="pb-2.5 font-semibold">Status</th>
                  <th className="pb-2.5 font-semibold">Model Variant</th>
                  <th className="pb-2.5 font-semibold">Config</th>
                  <th className="pb-2.5 font-semibold">Date &amp; Time</th>
                  <th className="pb-2.5 font-semibold">mAP@50</th>
                  <th className="pb-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2A2F38]/60">
                {jobsHistory.map(job => {
                  const lastMetric = job.metricsLog && job.metricsLog.length > 0
                    ? job.metricsLog[job.metricsLog.length - 1]
                    : null;
                  const dateStr = new Date(job.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr key={job.id} className="hover:bg-[#14171C] transition-colors">
                      <td className="py-3">
                        <Badge
                          variant={
                            job.status === 'completed'
                              ? 'success'
                              : job.status === 'running'
                              ? 'warning'
                              : job.status === 'failed'
                              ? 'destructive'
                              : 'neutral'
                          }
                          size="sm"
                        >
                          {job.status.toUpperCase()}
                        </Badge>
                      </td>

                      <td className="py-3 font-semibold text-[#E6E9EF]">
                        {job.modelVariant}
                      </td>

                      <td className="py-3 text-[#8B93A1]">
                        {job.epochs} eps &middot; {job.imgsz}px &middot; batch: {job.batchSize}
                      </td>

                      <td className="py-3 text-[#8B93A1]">{dateStr}</td>

                      <td className="py-3 font-bold text-[#00E5A3]">
                        {lastMetric?.mAP50 !== undefined ? `${(lastMetric.mAP50 * 100).toFixed(1)}%` : '--'}
                      </td>

                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {job.hasPt && (
                            <a
                              href={api.getTrainingDownloadUrl(project.id, job.id, 'pt')}
                              download
                              title="Download PyTorch weights (.pt)"
                              className="px-2 py-1 rounded bg-[#1B1F26] hover:bg-[#222731] border border-[#2A2F38] text-[11px] text-[#3DA9FC] font-semibold flex items-center gap-1"
                            >
                              <Download size={11} /> .pt
                            </a>
                          )}

                          {job.hasOnnx && (
                            <a
                              href={api.getTrainingDownloadUrl(project.id, job.id, 'onnx')}
                              download
                              title="Download ONNX graph (.onnx)"
                              className="px-2 py-1 rounded bg-[#1B1F26] hover:bg-[#222731] border border-[#2A2F38] text-[11px] text-[#00E5A3] font-semibold flex items-center gap-1"
                            >
                              <Download size={11} /> .onnx
                            </a>
                          )}

                          {job.hasOnnx && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleDeployToAIAssist(job)}
                              title="Use this trained model in AI Assist"
                              leftIcon={<Sparkles size={11} />}
                            >
                              Use in AI Assist
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
