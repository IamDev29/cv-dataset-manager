import React, { useState, useEffect } from 'react';
import { Project, ProjectImage, ProjectModel } from '../../types';
import { api } from '../../api';
import { Card, CardHeader, CardTitle, Button, Badge, Slider } from '../ui';
import CornerBrackets from '../CornerBrackets';
import {
  Sparkles,
  Cpu,
  Upload,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Tag,
  Layers,
  ArrowRight,
  Trash2,
  FileCode,
  Sliders,
  Check,
  Zap,
  Plus,
  RefreshCw,
} from 'lucide-react';

export interface AIAssistViewProps {
  project: Project;
  images: ProjectImage[];
  onNavigateToAnnotate: () => void;
  onRefreshImages?: () => void;
  onUpdateImages?: (updatedImages: ProjectImage[]) => void;
  onUpdateProjectClasses?: (newClasses: Project['classes']) => void;
}

export default function AIAssistView({
  project,
  images,
  onNavigateToAnnotate,
  onRefreshImages,
  onUpdateImages,
  onUpdateProjectClasses,
}: AIAssistViewProps) {
  const [model, setModel] = useState<ProjectModel | null>(null);
  const [modelLoading, setModelLoading] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);
  const [isUploadingModel, setIsUploadingModel] = useState(false);

  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [classMapping, setClassMapping] = useState<Record<string, string>>({});
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [mappingFilter, setMappingFilter] = useState('');

  const [isInferenceRunning, setIsInferenceRunning] = useState(false);
  const [inferenceStatus, setInferenceStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const unannotatedImages = images.filter(img => !img.annotations || img.annotations.length === 0);
  const pendingAiImages = images.filter(img => (img.aiSuggestions && img.aiSuggestions.length > 0) || img.hasSuggestions);
  const classes = project.classes || [];

  // Model class list
  const modelClassNames: string[] = model?.classNames || [];
  const numClasses = model?.numClasses || modelClassNames.length || 0;

  // Load project model on mount
  const loadModel = async () => {
    setModelLoading(true);
    try {
      const m = await api.getModel(project.id);
      setModel(m);
      if (m && m.classMapping) {
        setClassMapping(m.classMapping);
      }
      if (m && m.confidenceThreshold) {
        setConfidenceThreshold(m.confidenceThreshold);
      }
      setModelError(null);
    } catch (err: any) {
      console.log('No model loaded or error loading model:', err);
      setModel(null);
    } finally {
      setModelLoading(false);
    }
  };

  useEffect(() => {
    loadModel();
  }, [project.id]);

  // Handle Model Upload
  const handleModelUpload = async (file: File) => {
    if (!file.name.endsWith('.onnx')) {
      setModelError('Please select a valid .onnx model weights file.');
      return;
    }

    setIsUploadingModel(true);
    setModelError(null);

    try {
      const uploaded = await api.uploadModel(project.id, file);
      setModel(uploaded);
      
      // Auto-map matching classes on upload
      const initialMapping: Record<string, string> = uploaded.classMapping || {};
      const uploadedNames = uploaded.classNames || [];
      
      if (Object.keys(initialMapping).length === 0 && uploadedNames.length > 0) {
        uploadedNames.forEach((name, idx) => {
          const match = classes.find(c => c.name.toLowerCase() === name.toLowerCase());
          if (match) {
            initialMapping[String(idx)] = match.id;
          } else {
            // Suggest creating new class for the model class
            initialMapping[String(idx)] = `NEW:${name}`;
          }
        });
        
        if (Object.keys(initialMapping).length > 0) {
          try {
            const res = await api.setModelMapping(project.id, initialMapping);
            setClassMapping(res.model.classMapping || {});
            if (res.allClasses) {
              onUpdateProjectClasses?.(res.allClasses);
            }
          } catch (e) {
            console.warn('Auto-mapping save on upload warning:', e);
            setClassMapping(initialMapping);
          }
        }
      } else {
        setClassMapping(initialMapping);
      }
    } catch (err: any) {
      console.error('Failed to upload model:', err);
      setModelError(err?.message || 'Failed to upload and validate ONNX model weights.');
    } finally {
      setIsUploadingModel(false);
    }
  };

  // Handle Model Delete
  const handleDeleteModel = async () => {
    try {
      await api.deleteModel(project.id);
      setModel(null);
      setClassMapping({});
    } catch (err: any) {
      console.error('Failed to delete model:', err);
      setModelError(err?.message || 'Failed to remove model weights.');
    }
  };

  // Handle Single Class Mapping Save
  const handleSaveMapping = async (modelClassIdx: string, targetValue: string) => {
    const updatedMapping = { ...classMapping };
    if (!targetValue) {
      delete updatedMapping[modelClassIdx];
    } else {
      updatedMapping[modelClassIdx] = targetValue;
    }
    
    setClassMapping(updatedMapping);
    setIsSavingMapping(true);

    try {
      const res = await api.setModelMapping(project.id, updatedMapping);
      setClassMapping(res.model.classMapping || {});
      if (res.allClasses) {
        onUpdateProjectClasses?.(res.allClasses);
      }
    } catch (err: any) {
      console.error('Failed to save mapping:', err);
    } finally {
      setIsSavingMapping(false);
    }
  };

  // Auto-map all model classes by matching name or creating new
  const handleAutoMapAll = async () => {
    if (!model || numClasses === 0) return;
    setIsSavingMapping(true);

    const newMapping: Record<string, string> = { ...classMapping };
    for (let i = 0; i < numClasses; i++) {
      const idxStr = String(i);
      const name = modelClassNames[i] || `class_${i}`;
      const match = classes.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (match) {
        newMapping[idxStr] = match.id;
      } else if (!newMapping[idxStr]) {
        newMapping[idxStr] = `NEW:${name}`;
      }
    }

    try {
      const res = await api.setModelMapping(project.id, newMapping);
      setClassMapping(res.model.classMapping || {});
      if (res.allClasses) {
        onUpdateProjectClasses?.(res.allClasses);
      }
      setInferenceStatus({
        type: 'success',
        message: `Successfully configured and auto-mapped ${Object.keys(newMapping).length} model classes!`,
      });
    } catch (err: any) {
      console.error('Failed to auto-map:', err);
      setInferenceStatus({
        type: 'error',
        message: `Auto-mapping failed: ${err?.message || 'Server error'}`,
      });
    } finally {
      setIsSavingMapping(false);
    }
  };

  // Handle Running Inference
  const handleRunInference = async () => {
    if (!model) {
      setInferenceStatus({
        type: 'error',
        message: 'No model loaded. Please upload an ONNX model first.',
      });
      return;
    }

    if (unannotatedImages.length === 0) {
      setInferenceStatus({
        type: 'info',
        message: 'No unannotated images found to run inference on.',
      });
      return;
    }

    // Check if at least one class is mapped
    const mappedCount = Object.keys(classMapping).filter(k => !!classMapping[k]).length;
    if (mappedCount === 0) {
      // Trigger auto-map first
      setInferenceStatus({
        type: 'info',
        message: 'Auto-mapping model classes to project taxonomy before running inference...',
      });
      await handleAutoMapAll();
    }

    setIsInferenceRunning(true);
    setInferenceStatus({
      type: 'info',
      message: `Executing AI detection on ${unannotatedImages.length} images...`,
    });

    try {
      const targetImageIds = unannotatedImages.map(img => img.id);
      const updatedImages = await api.runInference(project.id, targetImageIds, confidenceThreshold);

      // Count total suggestions found
      const totalSuggestions = updatedImages.reduce(
        (acc, img) => acc + (img.aiSuggestions?.length || 0),
        0
      );

      if (onUpdateImages) {
        onUpdateImages(updatedImages);
      }
      onRefreshImages?.();

      setInferenceStatus({
        type: 'success',
        message: `AI inference complete! Found ${totalSuggestions} suggested bounding boxes across ${updatedImages.length} images.`,
      });
    } catch (err: any) {
      console.error('Inference error:', err);
      setInferenceStatus({
        type: 'error',
        message: `Inference failed: ${err?.message || 'Server error occurred'}`,
      });
    } finally {
      setIsInferenceRunning(false);
    }
  };

  const mappedClassesCount = Object.keys(classMapping).filter(k => !!classMapping[k]).length;

  return (
    <div className="space-y-6 animate-fadeIn" id="ai-assist-view">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#2A2F38]">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="font-sans font-bold text-xl text-[#E6E9EF] tracking-tight">
              AI Assist &amp; Automated Detection
            </h2>
            <Badge variant="primary" size="sm">
              <Sparkles size={11} />
              AI Inference Studio
            </Badge>
          </div>
          <p className="font-sans text-xs text-[#8B93A1] mt-0.5">
            Accelerate dataset labeling with ONNX computer vision models and human-in-the-loop review.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Model Execution & Class Mapping */}
        <div className="lg:col-span-7 space-y-6">
          {/* Inference Control Card */}
          <Card elevation="low" className="p-6 space-y-6">
            <CornerBrackets />

            <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
              <div>
                <CardTitle>Batch Auto-Annotation</CardTitle>
                <p className="text-xs text-[#8B93A1] mt-0.5">
                  Execute object detection across unannotated dataset staging images.
                </p>
              </div>
              <Badge variant="warning" size="sm">
                <span className="font-mono-numbers">{unannotatedImages.length}</span> Unannotated
              </Badge>
            </CardHeader>

            <div className="space-y-5">
              <Slider
                label="Confidence Threshold"
                value={Math.round(confidenceThreshold * 100)}
                min={10}
                max={95}
                step={5}
                unit="%"
                onChange={(e) => setConfidenceThreshold(Number(e.target.value) / 100)}
              />

              {/* Execution Target Manifest */}
              <div className="p-4 rounded-xl bg-[#14171C] border border-[#2A2F38] space-y-2.5 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[#8B93A1]">Target Batch:</span>
                  <span className="font-bold text-[#E6E9EF] font-mono-numbers">
                    {unannotatedImages.length} unannotated files
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8B93A1]">Active Model:</span>
                  <span className="font-bold text-[#3DA9FC]">
                    {model ? model.filename : 'No model loaded'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8B93A1]">Configured Mappings:</span>
                  <span className={`font-bold ${mappedClassesCount > 0 ? 'text-[#00E5A3]' : 'text-[#FF4D4D]'}`}>
                    {mappedClassesCount} / {numClasses || 0} classes mapped
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#8B93A1]">Pending Review Queue:</span>
                  <span className="font-bold text-[#FFB020] font-mono-numbers">
                    {pendingAiImages.length} images
                  </span>
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <Button
                  variant="primary"
                  className="flex-1"
                  disabled={!model || unannotatedImages.length === 0 || isInferenceRunning}
                  isLoading={isInferenceRunning}
                  onClick={handleRunInference}
                  leftIcon={<Play size={15} />}
                >
                  Run AI Auto-Annotation
                </Button>

                <Button
                  variant="secondary"
                  onClick={onNavigateToAnnotate}
                  rightIcon={<ArrowRight size={14} />}
                >
                  Review Studio
                </Button>
              </div>

              {inferenceStatus && (
                <div
                  className={`p-3.5 rounded-lg border text-xs font-mono flex items-center space-x-2 ${
                    inferenceStatus.type === 'success'
                      ? 'bg-[#00E5A3]/10 border-[#00E5A3]/30 text-[#00E5A3]'
                      : inferenceStatus.type === 'error'
                      ? 'bg-[#FF4D4D]/10 border-[#FF4D4D]/30 text-[#FF4D4D]'
                      : 'bg-[#3DA9FC]/10 border-[#3DA9FC]/30 text-[#3DA9FC]'
                  }`}
                >
                  <Sparkles size={15} className="shrink-0" />
                  <span>{inferenceStatus.message}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Model Class Mapping Table */}
          <Card elevation="low" className="p-6 space-y-5">
            <CornerBrackets />

            <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
              <div>
                <CardTitle>Model Class Mapping</CardTitle>
                <p className="text-xs text-[#8B93A1] mt-0.5">
                  Map model detected categories to project annotation labels.
                </p>
              </div>

              <div className="flex items-center space-x-2">
                {model && numClasses > 0 && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleAutoMapAll}
                    isLoading={isSavingMapping}
                    leftIcon={<Zap size={13} />}
                  >
                    Auto-Map All
                  </Button>
                )}
                <Badge variant={mappedClassesCount > 0 ? 'success' : 'warning'} size="sm">
                  <span className="font-mono-numbers">{mappedClassesCount}</span> / {numClasses} Mapped
                </Badge>
              </div>
            </CardHeader>

            {model ? (
              <div className="space-y-3">
                {numClasses > 10 && (
                  <input
                    type="text"
                    placeholder="Filter model classes..."
                    value={mappingFilter}
                    onChange={(e) => setMappingFilter(e.target.value)}
                    className="w-full px-3 py-1.5 border border-[#2A2F38] rounded-lg text-xs bg-[#101317] text-[#E6E9EF] placeholder-[#5A6270] focus:outline-none focus:ring-1 focus:ring-[#3DA9FC]"
                  />
                )}

                <div className="space-y-2 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
                  {Array.from({ length: numClasses }).map((_, idx) => {
                    const modelClassName = modelClassNames[idx] || `class_${idx}`;
                    if (mappingFilter && !modelClassName.toLowerCase().includes(mappingFilter.toLowerCase())) {
                      return null;
                    }

                    const currentMappedId = classMapping[String(idx)] || '';
                    const isMapped = !!currentMappedId;
                    const matchedProjectClass = classes.find(c => c.id === currentMappedId);

                    return (
                      <div
                        key={`model-class-${idx}`}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-all ${
                          isMapped
                            ? 'bg-[#14171C] border-[#2A2F38]'
                            : 'bg-[#14171C]/50 border-dashed border-[#2A2F38] opacity-80'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                          <span className="font-mono text-[10px] text-[#5A6270] w-6 shrink-0 text-right">
                            #{idx}
                          </span>
                          <span className="font-semibold text-[#E6E9EF] truncate" title={modelClassName}>
                            {modelClassName}
                          </span>
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          {matchedProjectClass && (
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10"
                              style={{ backgroundColor: matchedProjectClass.color }}
                            />
                          )}

                          <select
                            value={currentMappedId}
                            onChange={(e) => handleSaveMapping(String(idx), e.target.value)}
                            className="bg-[#1B1F26] border border-[#2A2F38] text-[#E6E9EF] rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-[#3DA9FC] cursor-pointer"
                          >
                            <option value="">-- Ignored (Skip) --</option>
                            <optgroup label="Map to Existing Project Class">
                              {classes.map(cls => (
                                <option key={cls.id} value={cls.id}>
                                  {cls.name}
                                </option>
                              ))}
                            </optgroup>
                            <optgroup label="Create New Project Class">
                              <option value={`NEW:${modelClassName}`}>
                                + Create class "{modelClassName}"
                              </option>
                            </optgroup>
                          </select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-10 px-4 bg-[#14171C]/50 border border-dashed border-[#2A2F38] rounded-xl space-y-2">
                <Cpu size={20} className="text-[#5A6270] mx-auto" />
                <p className="text-xs font-semibold text-[#8B93A1]">
                  No model weights loaded
                </p>
                <p className="text-[11px] text-[#5A6270] max-w-xs mx-auto">
                  Upload an ONNX model weights file on the right to configure category mapping.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column (5 cols): ONNX Model Weights Studio */}
        <div className="lg:col-span-5 space-y-6">
          <Card elevation="mid" glass className="p-6 space-y-5">
            <CornerBrackets />

            <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
              <CardTitle>Model Weights &amp; Runtime</CardTitle>
              <Badge
                variant={model ? 'success' : 'neutral'}
                dot
                pulseDot={!!model}
                size="sm"
              >
                {model ? 'ONLINE' : 'STANDBY'}
              </Badge>
            </CardHeader>

            {model ? (
              /* Model Loaded State */
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-[#14171C] border border-[#2A2F38] space-y-3 font-mono text-xs">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-[#3DA9FC]/15 text-[#3DA9FC] flex items-center justify-center shrink-0">
                      <Cpu size={22} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm text-[#E6E9EF] truncate" title={model.filename}>
                        {model.filename}
                      </p>
                      <p className="text-[10px] text-[#8B93A1]">
                        ONNX Runtime &middot; Input: {model.inputShape?.join('x') || '1x3x640x640'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#2A2F38] space-y-1.5 text-[11px] text-[#8B93A1]">
                    <div className="flex justify-between">
                      <span>Model Categories:</span>
                      <span className="font-bold text-[#E6E9EF] font-mono-numbers">
                        {numClasses}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Execution Provider:</span>
                      <span className="font-bold text-[#00E5A3]">CPU / Server Side</span>
                    </div>
                  </div>
                </div>

                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={handleDeleteModel}
                  leftIcon={<Trash2 size={13} />}
                >
                  Unload Model Weights
                </Button>
              </div>
            ) : (
              /* Model Upload Dropzone */
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed border-[#2A2F38] hover:border-[#3DA9FC]/50 bg-[#14171C]/50 rounded-xl p-6 text-center transition-all relative overflow-hidden flex flex-col items-center justify-center min-h-[160px]"
                >
                  <input
                    type="file"
                    accept=".onnx"
                    onChange={(e) => e.target.files && e.target.files[0] && handleModelUpload(e.target.files[0])}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                    id="model-file-input"
                  />

                  <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                    <div className="w-10 h-10 rounded-lg bg-[#14171C] border border-[#2A2F38] flex items-center justify-center text-[#3DA9FC]">
                      <Upload size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[#E6E9EF]">
                        Upload custom ONNX model
                      </p>
                      <p className="text-[10px] text-[#8B93A1] mt-0.5">
                        Drop weights file (.onnx)
                      </p>
                    </div>
                  </div>

                  {isUploadingModel && (
                    <div className="absolute inset-0 bg-[#14171C]/95 backdrop-blur-xs flex items-center justify-center z-20 space-x-2 text-xs font-mono text-[#3DA9FC]">
                      <Loader2 size={16} className="animate-spin" />
                      <span>Validating ONNX graph...</span>
                    </div>
                  )}
                </div>

                {modelError && (
                  <div className="p-3 rounded-lg bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 text-xs text-[#FF4D4D] flex items-center space-x-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{modelError}</span>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
