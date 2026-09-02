import React from 'react';
import { Project, ProjectImage } from '../../types';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Slider, Checkbox } from '../ui';
import CornerBrackets from '../CornerBrackets';
import {
  Sliders,
  Sparkles,
  Download,
  Trash2,
  Loader2,
  FolderArchive,
  CheckCircle2,
  Layers,
  FileCode,
  FolderTree,
  AlertCircle,
} from 'lucide-react';

export interface PipelineViewProps {
  project: Project;
  images: ProjectImage[];
  pipelineTab: 'split' | 'augment' | 'export';
  setPipelineTab: (tab: 'split' | 'augment' | 'export') => void;
  trainPercent: number;
  setTrainPercent: (val: number) => void;
  valPercent: number;
  setValPercent: (val: number) => void;
  testPercent: number;
  setTestPercent: (val: number) => void;
  includeUnannotated: boolean;
  setIncludeUnannotated: (val: boolean) => void;
  autoSplitStatus: { type: 'success' | 'error'; message: string } | null;
  onAutoSplit: () => void;
  augFlip: boolean;
  setAugFlip: (val: boolean) => void;
  augRotation: boolean;
  setAugRotation: (val: boolean) => void;
  augBrightness: boolean;
  setAugBrightness: (val: boolean) => void;
  augExposure: boolean;
  setAugExposure: (val: boolean) => void;
  augNoise: boolean;
  setAugNoise: (val: boolean) => void;
  augVariantsCount: number;
  setAugVariantsCount: (val: number) => void;
  augStatus: { type: 'success' | 'error' | 'loading'; message: string; progress?: number } | null;
  onRunAugmentation: () => void;
  onClearAugmented: () => void;
  exportStatus: { type: 'success' | 'error' | 'loading'; message: string; progress?: number } | null;
  onExportDataset: () => void;
}

export default function PipelineView({
  project,
  images,
  pipelineTab,
  setPipelineTab,
  trainPercent,
  setTrainPercent,
  valPercent,
  setValPercent,
  testPercent,
  setTestPercent,
  includeUnannotated,
  setIncludeUnannotated,
  autoSplitStatus,
  onAutoSplit,
  augFlip,
  setAugFlip,
  augRotation,
  setAugRotation,
  augBrightness,
  setAugBrightness,
  augExposure,
  setAugExposure,
  augNoise,
  setAugNoise,
  augVariantsCount,
  setAugVariantsCount,
  augStatus,
  onRunAugmentation,
  onClearAugmented,
  exportStatus,
  onExportDataset,
}: PipelineViewProps) {
  // Statistics
  const trainImages = images.filter(img => img.split === 'train');
  const valImages = images.filter(img => img.split === 'val');
  const testImages = images.filter(img => img.split === 'test');
  const unassignedImages = images.filter(img => !img.split || img.split === 'unassigned');
  const augmentedImages = images.filter(img => img.isAugmented);
  const totalCount = images.length;

  const totalPercent = trainPercent + valPercent + testPercent;
  const classes = project.classes || [];

  return (
    <div className="space-y-6 animate-fadeIn" id="pipeline-view">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#2A2F38]">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="font-sans font-bold text-xl text-[#E6E9EF] tracking-tight">
              Processing Pipeline
            </h2>
            <Badge variant="primary" size="sm">
              <Sliders size={11} />
              Dataset Engine
            </Badge>
          </div>
          <p className="font-sans text-xs text-[#8B93A1] mt-0.5">
            Partition splits, generate synthetic geometric variations, and package standardized YOLO archives.
          </p>
        </div>

        {/* Studio Tabs Navigation */}
        <div className="flex items-center space-x-1 bg-[#1B1F26] p-1 rounded-xl border border-[#2A2F38] shadow-elevation-low self-start md:self-auto">
          <button
            type="button"
            onClick={() => setPipelineTab('split')}
            className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              pipelineTab === 'split'
                ? 'bg-[#3DA9FC] text-[#14171C] shadow-xs'
                : 'text-[#8B93A1] hover:text-[#E6E9EF]'
            }`}
          >
            <Sliders size={14} />
            <span>1. Dataset Split</span>
          </button>
          <button
            type="button"
            onClick={() => setPipelineTab('augment')}
            className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              pipelineTab === 'augment'
                ? 'bg-[#3DA9FC] text-[#14171C] shadow-xs'
                : 'text-[#8B93A1] hover:text-[#E6E9EF]'
            }`}
          >
            <Sparkles size={14} />
            <span>2. Augmentation</span>
          </button>
          <button
            type="button"
            onClick={() => setPipelineTab('export')}
            className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              pipelineTab === 'export'
                ? 'bg-[#3DA9FC] text-[#14171C] shadow-xs'
                : 'text-[#8B93A1] hover:text-[#E6E9EF]'
            }`}
          >
            <Download size={14} />
            <span>3. YOLO Export</span>
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 1. DATASET SPLIT TAB                                           */}
      {/* ============================================================== */}
      {pipelineTab === 'split' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Partition Controls */}
          <Card elevation="low" className="lg:col-span-7 p-6 space-y-6">
            <CornerBrackets />

            <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
              <div>
                <CardTitle>Auto-Partition Ratios</CardTitle>
                <p className="text-xs text-[#8B93A1] mt-0.5">
                  Divide workspace images into training, validation, and test subsets.
                </p>
              </div>
              <Badge
                variant={totalPercent === 100 ? 'success' : 'destructive'}
                size="sm"
                dot
              >
                Total: {totalPercent}%
              </Badge>
            </CardHeader>

            <div className="space-y-5">
              <Slider
                label="Training Set (Train)"
                value={trainPercent}
                min={0}
                max={100}
                step={5}
                unit="%"
                onChange={(e) => setTrainPercent(parseInt(e.target.value, 10))}
              />

              <Slider
                label="Validation Set (Val)"
                value={valPercent}
                min={0}
                max={100}
                step={5}
                unit="%"
                onChange={(e) => setValPercent(parseInt(e.target.value, 10))}
              />

              <Slider
                label="Testing Set (Test)"
                value={testPercent}
                min={0}
                max={100}
                step={5}
                unit="%"
                onChange={(e) => setTestPercent(parseInt(e.target.value, 10))}
              />

              <div className="pt-2 border-t border-[#2A2F38]/60 space-y-4">
                <Checkbox
                  id="include-unannotated-checkbox"
                  label="Include unannotated images in dataset partition"
                  description="When checked, images without bounding boxes will also be distributed across splits."
                  checked={includeUnannotated}
                  onChange={(e) => setIncludeUnannotated(e.target.checked)}
                />

                <Button
                  variant="primary"
                  className="w-full"
                  disabled={totalPercent !== 100 || images.length === 0}
                  onClick={onAutoSplit}
                  leftIcon={<Sliders size={15} />}
                >
                  Auto-Partition Dataset Ratios
                </Button>

                {autoSplitStatus && (
                  <div
                    className={`p-3.5 rounded-lg border text-xs font-mono flex items-center space-x-2 ${
                      autoSplitStatus.type === 'success'
                        ? 'bg-[#00E5A3]/10 border-[#00E5A3]/30 text-[#00E5A3]'
                        : 'bg-[#FF4D4D]/10 border-[#FF4D4D]/30 text-[#FF4D4D]'
                    }`}
                  >
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{autoSplitStatus.message}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Right Column: Live Distribution Metrics */}
          <Card elevation="low" className="lg:col-span-5 p-6 space-y-6">
            <CornerBrackets />

            <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
              <CardTitle>Current Distribution</CardTitle>
              <span className="font-mono text-xs text-[#8B93A1]">
                {totalCount} Total Images
              </span>
            </CardHeader>

            {/* Split Distribution Bar */}
            <div className="space-y-2">
              <div className="w-full h-3 rounded-full bg-[#14171C] overflow-hidden flex border border-[#2A2F38] shadow-inner">
                {totalCount > 0 ? (
                  <>
                    <div
                      className="bg-[#3DA9FC] h-full transition-all duration-300"
                      style={{ width: `${(trainImages.length / totalCount) * 100}%` }}
                      title={`Train: ${trainImages.length}`}
                    />
                    <div
                      className="bg-[#FFB020] h-full transition-all duration-300"
                      style={{ width: `${(valImages.length / totalCount) * 100}%` }}
                      title={`Val: ${valImages.length}`}
                    />
                    <div
                      className="bg-slate-300 h-full transition-all duration-300"
                      style={{ width: `${(testImages.length / totalCount) * 100}%` }}
                      title={`Test: ${testImages.length}`}
                    />
                    <div
                      className="bg-[#2A2F38] h-full transition-all duration-300"
                      style={{ width: `${(unassignedImages.length / totalCount) * 100}%` }}
                      title={`Unassigned: ${unassignedImages.length}`}
                    />
                  </>
                ) : (
                  <div className="bg-[#2A2F38] w-full h-full" />
                )}
              </div>
            </div>

            {/* Detailed Split Breakdown Cards */}
            <div className="grid grid-cols-2 gap-3 font-mono text-xs">
              <div className="p-3 rounded-lg bg-[#14171C] border border-[#2A2F38] space-y-1">
                <div className="flex items-center space-x-1.5 text-[#3DA9FC]">
                  <span className="w-2 h-2 rounded-full bg-[#3DA9FC]" />
                  <span className="font-bold">Train</span>
                </div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold text-[#E6E9EF] font-mono-numbers">
                    {trainImages.length}
                  </span>
                  <span className="text-[10px] text-[#8B93A1]">
                    {totalCount > 0 ? Math.round((trainImages.length / totalCount) * 100) : 0}%
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#14171C] border border-[#2A2F38] space-y-1">
                <div className="flex items-center space-x-1.5 text-[#FFB020]">
                  <span className="w-2 h-2 rounded-full bg-[#FFB020]" />
                  <span className="font-bold">Validation</span>
                </div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold text-[#E6E9EF] font-mono-numbers">
                    {valImages.length}
                  </span>
                  <span className="text-[10px] text-[#8B93A1]">
                    {totalCount > 0 ? Math.round((valImages.length / totalCount) * 100) : 0}%
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#14171C] border border-[#2A2F38] space-y-1">
                <div className="flex items-center space-x-1.5 text-slate-300">
                  <span className="w-2 h-2 rounded-full bg-slate-300" />
                  <span className="font-bold">Test</span>
                </div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold text-[#E6E9EF] font-mono-numbers">
                    {testImages.length}
                  </span>
                  <span className="text-[10px] text-[#8B93A1]">
                    {totalCount > 0 ? Math.round((testImages.length / totalCount) * 100) : 0}%
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-[#14171C] border border-[#2A2F38] space-y-1">
                <div className="flex items-center space-x-1.5 text-[#8B93A1]">
                  <span className="w-2 h-2 rounded-full bg-[#5A6270]" />
                  <span className="font-bold">Unassigned</span>
                </div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-bold text-[#E6E9EF] font-mono-numbers">
                    {unassignedImages.length}
                  </span>
                  <span className="text-[10px] text-[#8B93A1]">
                    {totalCount > 0 ? Math.round((unassignedImages.length / totalCount) * 100) : 0}%
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. DATA AUGMENTATION TAB                                       */}
      {/* ============================================================== */}
      {pipelineTab === 'augment' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Techniques Selection */}
          <Card elevation="low" className="lg:col-span-7 p-6 space-y-6">
            <CornerBrackets />

            <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
              <div>
                <CardTitle>Augmentation Techniques</CardTitle>
                <p className="text-xs text-[#8B93A1] mt-0.5">
                  Generate synthetic training variations with geometrically transformed bounding boxes.
                </p>
              </div>
              <Badge variant="primary" size="sm">
                Target: Train Split ({trainImages.length} images)
              </Badge>
            </CardHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-[#14171C] border border-[#2A2F38]">
                  <Checkbox
                    id="aug-flip"
                    label="Horizontal Flip"
                    description="Mirrors images and flips bounding box X coordinates."
                    checked={augFlip}
                    onChange={(e) => setAugFlip(e.target.checked)}
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-[#14171C] border border-[#2A2F38]">
                  <Checkbox
                    id="aug-rotation"
                    label="Rotation Jitter"
                    description="Rotates images +/- 5-15 deg and recalculates bounding boxes."
                    checked={augRotation}
                    onChange={(e) => setAugRotation(e.target.checked)}
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-[#14171C] border border-[#2A2F38]">
                  <Checkbox
                    id="aug-brightness"
                    label="Brightness Shift"
                    description="Simulates day, dusk, and harsh spotlight lighting."
                    checked={augBrightness}
                    onChange={(e) => setAugBrightness(e.target.checked)}
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-[#14171C] border border-[#2A2F38]">
                  <Checkbox
                    id="aug-exposure"
                    label="Contrast & Exposure"
                    description="Adjusts dynamic range to simulate various sensor exposures."
                    checked={augExposure}
                    onChange={(e) => setAugExposure(e.target.checked)}
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-[#14171C] border border-[#2A2F38] sm:col-span-2">
                  <Checkbox
                    id="aug-noise"
                    label="Pixel Noise Injection"
                    description="Adds subtle Gaussian salt-and-pepper noise to improve generalization."
                    checked={augNoise}
                    onChange={(e) => setAugNoise(e.target.checked)}
                  />
                </div>
              </div>

              <Slider
                label="Synthetic Multiplier"
                value={augVariantsCount}
                min={1}
                max={4}
                step={1}
                unit="x variants"
                onChange={(e) => setAugVariantsCount(parseInt(e.target.value, 10))}
              />

              <div className="pt-2 border-t border-[#2A2F38]/60 space-y-3">
                <Button
                  variant="primary"
                  className="w-full"
                  isLoading={augStatus?.type === 'loading'}
                  disabled={trainImages.length === 0 || (!augFlip && !augRotation && !augBrightness && !augExposure && !augNoise)}
                  onClick={onRunAugmentation}
                  leftIcon={<Sparkles size={15} />}
                >
                  Generate Augmented Training Dataset
                </Button>

                {augmentedImages.length > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={onClearAugmented}
                    leftIcon={<Trash2 size={13} />}
                  >
                    Remove {augmentedImages.length} Generated Variants
                  </Button>
                )}

                {augStatus && (
                  <div
                    className={`p-3.5 rounded-lg border text-xs font-mono flex items-center space-x-2 ${
                      augStatus.type === 'success'
                        ? 'bg-[#00E5A3]/10 border-[#00E5A3]/30 text-[#00E5A3]'
                        : augStatus.type === 'error'
                        ? 'bg-[#FF4D4D]/10 border-[#FF4D4D]/30 text-[#FF4D4D]'
                        : 'bg-[#3DA9FC]/10 border-[#3DA9FC]/30 text-[#3DA9FC]'
                    }`}
                  >
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{augStatus.message}</span>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Right Column: Augmentation Summary */}
          <Card elevation="low" className="lg:col-span-5 p-6 space-y-5">
            <CornerBrackets />

            <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
              <CardTitle>Augmentation Impact</CardTitle>
            </CardHeader>

            <div className="space-y-3 text-xs font-mono">
              <div className="p-3.5 rounded-xl bg-[#14171C] border border-[#2A2F38] flex items-center justify-between">
                <span className="text-[#8B93A1]">Original Train Images:</span>
                <span className="font-bold text-[#E6E9EF] font-mono-numbers">
                  {trainImages.filter(i => !i.isAugmented).length} files
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#14171C] border border-[#2A2F38] flex items-center justify-between">
                <span className="text-[#8B93A1]">Estimated New Variants:</span>
                <span className="font-bold text-[#3DA9FC] font-mono-numbers">
                  +{trainImages.filter(i => !i.isAugmented).length * augVariantsCount} files
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-[#14171C] border border-[#2A2F38] flex items-center justify-between">
                <span className="text-[#8B93A1]">Current Staged Variants:</span>
                <span className="font-bold text-[#D846FF] font-mono-numbers">
                  {augmentedImages.length} files
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ============================================================== */}
      {/* 3. YOLO EXPORT TAB                                             */}
      {/* ============================================================== */}
      {pipelineTab === 'export' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Manifest & Packaging */}
          <Card elevation="low" className="lg:col-span-7 p-6 space-y-6">
            <CornerBrackets />

            <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
              <div>
                <CardTitle>YOLO Standard Export</CardTitle>
                <p className="text-xs text-[#8B93A1] mt-0.5">
                  Direct download of production-ready YOLOv8 / YOLO11 dataset archive.
                </p>
              </div>
              <Badge variant="success" size="sm" dot>
                YOLO Format
              </Badge>
            </CardHeader>

            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-[#14171C] border border-[#2A2F38] space-y-3 font-mono text-xs">
                <div className="flex items-center space-x-2 text-[#3DA9FC] font-semibold border-b border-[#2A2F38] pb-2">
                  <FolderTree size={15} />
                  <span>Archive Layout Manifest</span>
                </div>
                <div className="text-[11px] text-[#8B93A1] space-y-1">
                  <p>📁 train/ (images &amp; labels)</p>
                  <p>📁 val/ (images &amp; labels)</p>
                  <p>📁 test/ (images &amp; labels)</p>
                  <p>📄 dataset.yaml (classes &amp; paths configuration)</p>
                  <p>📄 classes.txt (class index mappings)</p>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  variant="primary"
                  className="w-full py-3"
                  isLoading={exportStatus?.type === 'loading'}
                  disabled={images.length === 0 || classes.length === 0}
                  onClick={onExportDataset}
                  leftIcon={<Download size={16} />}
                >
                  Download YOLO Dataset Archive (.zip)
                </Button>
              </div>

              {exportStatus && (
                <div
                  className={`p-3.5 rounded-lg border text-xs font-mono flex items-center space-x-2 ${
                    exportStatus.type === 'success'
                      ? 'bg-[#00E5A3]/10 border-[#00E5A3]/30 text-[#00E5A3]'
                      : exportStatus.type === 'error'
                      ? 'bg-[#FF4D4D]/10 border-[#FF4D4D]/30 text-[#FF4D4D]'
                      : 'bg-[#3DA9FC]/10 border-[#3DA9FC]/30 text-[#3DA9FC]'
                  }`}
                >
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{exportStatus.message}</span>
                </div>
              )}
            </div>
          </Card>

          {/* Right Column: Class Index Reference Table */}
          <Card elevation="low" className="lg:col-span-5 p-6 space-y-5">
            <CornerBrackets />

            <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
              <CardTitle>Class Mapping Reference</CardTitle>
              <Badge variant="neutral" size="sm">
                {classes.length} Labels
              </Badge>
            </CardHeader>

            <div className="space-y-2">
              {classes.length > 0 ? (
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
                  {classes.map((cls, idx) => (
                    <div
                      key={cls.id}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-[#14171C] border border-[#2A2F38] text-xs font-mono"
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className="text-[#3DA9FC] font-bold">Index {idx}</span>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cls.color }}
                        />
                        <span className="font-medium text-[#E6E9EF] truncate">{cls.name}</span>
                      </div>
                      <span className="text-[#5A6270] text-[10px]">{cls.id.slice(0, 8)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[#5A6270] italic">No classes defined in this project.</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
