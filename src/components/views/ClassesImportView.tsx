import React from 'react';
import { Project } from '../../types';
import { Card, CardHeader, CardTitle, Button, Badge, Slider } from '../ui';
import CornerBrackets from '../CornerBrackets';
import {
  Tag,
  Upload,
  Plus,
  Trash2,
  FileImage,
  Video,
  Loader2,
  X,
  AlertCircle,
  AlertTriangle,
  Film,
  Sparkles,
} from 'lucide-react';

export interface ClassesImportViewProps {
  project: Project;
  onAddClass: (e: React.FormEvent) => void;
  onDeleteClass: (classId: string) => void;
  newClassName: string;
  setNewClassName: (name: string) => void;
  classError: string | null;
  setClassError: (err: string | null) => void;
  onDropFiles: (e: React.DragEvent) => void;
  onDragEnterOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  dragActive: boolean;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  importProgress: { current: number; total: number } | null;
  skippedFiles: string[];
  importMode: 'images' | 'video';
  setImportMode: (mode: 'images' | 'video') => void;
  selectedVideo: File | null;
  videoUrl: string | null;
  videoMetadata: { duration: number; fps: number; totalFrames: number; width: number; height: number } | null;
  extractionMode: 'interval' | 'fps';
  setExtractionMode: (mode: 'interval' | 'fps') => void;
  extractionInterval: number;
  setExtractionInterval: (interval: number) => void;
  extractionFps: number;
  setExtractionFps: (fps: number) => void;
  isExtracting: boolean;
  extractionProgress: { current: number; total: number } | null;
  extractionStatus: { type: 'success' | 'error'; message: string } | null;
  onExtractFrames: () => void;
  onVideoDrop: (e: React.DragEvent) => void;
  onVideoDrag: (e: React.DragEvent) => void;
  videoDragActive: boolean;
  onVideoFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearVideo: () => void;
}

export default function ClassesImportView({
  project,
  onAddClass,
  onDeleteClass,
  newClassName,
  setNewClassName,
  classError,
  setClassError,
  onDropFiles,
  onDragEnterOver,
  onDragLeave,
  dragActive,
  onFileInputChange,
  importProgress,
  skippedFiles,
  importMode,
  setImportMode,
  selectedVideo,
  videoUrl,
  videoMetadata,
  extractionMode,
  setExtractionMode,
  extractionInterval,
  setExtractionInterval,
  extractionFps,
  setExtractionFps,
  isExtracting,
  extractionProgress,
  extractionStatus,
  onExtractFrames,
  onVideoDrop,
  onVideoDrag,
  videoDragActive,
  onVideoFileInput,
  onClearVideo,
}: ClassesImportViewProps) {
  const classes = project.classes || [];

  // Calculate estimated frames from video settings
  const getEstimatedFrames = () => {
    if (!videoMetadata) return 0;
    if (extractionMode === 'interval') {
      return Math.floor(videoMetadata.duration / (extractionInterval || 1));
    }
    return Math.floor(videoMetadata.duration * (extractionFps || 1));
  };

  return (
    <div className="space-y-6 animate-fadeIn" id="classes-import-view">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#2A2F38]">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="font-sans font-bold text-xl text-[#E6E9EF] tracking-tight">
              Classes & Data Ingestion
            </h2>
            <Badge variant="primary" size="sm">
              <Tag size={11} />
              Taxonomy Setup
            </Badge>
          </div>
          <p className="font-sans text-xs text-[#8B93A1] mt-0.5">
            Define annotation target classes and stage raw image or video data for this workspace.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (5 cols): Class Taxonomy Management */}
        <Card elevation="low" className="lg:col-span-5 p-5 space-y-5">
          <CornerBrackets />

          <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
            <div>
              <CardTitle>Class Labels</CardTitle>
              <p className="text-xs text-[#8B93A1] mt-0.5">
                Bounding box categories used during annotation and export.
              </p>
            </div>
            <Badge variant="neutral" size="sm">
              {classes.length} {classes.length === 1 ? 'Class' : 'Classes'}
            </Badge>
          </CardHeader>

          {/* Add Class Form */}
          <form onSubmit={onAddClass} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="New class name (e.g. vehicle, helmet)..."
                value={newClassName}
                onChange={(e) => {
                  setNewClassName(e.target.value);
                  if (classError) setClassError(null);
                }}
                className="flex-grow min-w-0 px-3 py-2 border border-[#2A2F38] rounded-lg text-xs bg-[#14171C] text-[#E6E9EF] placeholder-[#5A6270] focus:bg-[#14171C] focus:outline-none focus:ring-2 focus:ring-[#3DA9FC] focus:border-transparent transition-all"
                required
              />
              <Button
                type="submit"
                variant="primary"
                size="sm"
                leftIcon={<Plus size={14} />}
                id="add-class-btn"
              >
                Add
              </Button>
            </div>
            {classError && (
              <p className="text-[11px] text-[#FF4D4D] font-medium flex items-center gap-1">
                <AlertCircle size={12} />
                {classError}
              </p>
            )}
          </form>

          {/* Class List Table */}
          <div className="space-y-2">
            {classes.length > 0 ? (
              <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                {classes.map((cls, index) => (
                  <div
                    key={cls.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-[#14171C] border border-[#2A2F38] hover:border-[#2A2F38]/80 text-xs transition-all group"
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      {/* Monospace Class ID tag */}
                      <span className="font-mono text-[10px] text-[#5A6270] w-5 text-right shrink-0">
                        #{index}
                      </span>
                      {/* Color indicator swatch - per-class color only on swatch */}
                      <span
                        className="w-3 h-3 rounded-full shrink-0 shadow-xs border border-white/10"
                        style={{ backgroundColor: cls.color }}
                        title={`Color: ${cls.color}`}
                      />
                      <span className="font-medium text-[#E6E9EF] truncate" title={cls.name}>
                        {cls.name}
                      </span>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-[10px] text-[#5A6270] px-1.5 py-0.5 rounded bg-[#1B1F26]">
                        {cls.color}
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteClass(cls.id)}
                        className="text-[#8B93A1] hover:text-[#FF4D4D] p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer hover:bg-[#1B1F26]"
                        title={`Delete class "${cls.name}"`}
                        aria-label={`Delete ${cls.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 px-4 bg-[#14171C]/50 border border-dashed border-[#2A2F38] rounded-xl space-y-2">
                <Tag size={20} className="text-[#5A6270] mx-auto" />
                <p className="text-xs font-semibold text-[#8B93A1]">
                  No annotation classes yet
                </p>
                <p className="text-[11px] text-[#5A6270] max-w-xs mx-auto">
                  Add at least one class label to annotate objects and export YOLO format labels.
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Right Column (7 cols): Data Ingestion Studio */}
        <Card elevation="low" className="lg:col-span-7 p-5 space-y-5">
          <CornerBrackets />

          <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
            <div>
              <CardTitle>Media Ingestion</CardTitle>
              <p className="text-xs text-[#8B93A1] mt-0.5">
                Stage raw image files or extract sequential frames from video.
              </p>
            </div>

            {/* Ingestion Mode Segmented Toggle */}
            <div className="flex items-center space-x-1 bg-[#14171C] p-1 rounded-lg border border-[#2A2F38]">
              <button
                type="button"
                onClick={() => setImportMode('images')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                  importMode === 'images'
                    ? 'bg-[#3DA9FC] text-[#14171C] font-bold shadow-xs'
                    : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                }`}
              >
                <FileImage size={13} />
                <span>Images</span>
              </button>
              <button
                type="button"
                onClick={() => setImportMode('video')}
                className={`flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                  importMode === 'video'
                    ? 'bg-[#3DA9FC] text-[#14171C] font-bold shadow-xs'
                    : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                }`}
              >
                <Film size={13} />
                <span>Video Frames</span>
              </button>
            </div>
          </CardHeader>

          {/* TAB 1: BATCH IMAGE IMPORT */}
          {importMode === 'images' && (
            <div className="space-y-4">
              <div
                onDragEnter={onDragEnterOver}
                onDragLeave={onDragLeave}
                onDragOver={onDragEnterOver}
                onDrop={onDropFiles}
                className={`border-2 border-dashed rounded-xl p-8 text-center transition-all relative overflow-hidden flex flex-col items-center justify-center min-h-[220px] ${
                  dragActive
                    ? 'border-[#3DA9FC] bg-[#3DA9FC]/10 scale-[0.99]'
                    : 'border-[#2A2F38] hover:border-[#3DA9FC]/50 bg-[#14171C]/50'
                }`}
              >
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={onFileInputChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                  id="image-file-input"
                />

                <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
                  <div className="w-12 h-12 rounded-xl bg-[#14171C] border border-[#2A2F38] flex items-center justify-center text-[#3DA9FC] shadow-elevation-low">
                    <Upload size={20} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#E6E9EF]">
                      Drag and drop image files here, or <span className="text-[#3DA9FC] underline underline-offset-2">browse files</span>
                    </p>
                    <p className="text-xs text-[#8B93A1] mt-1">
                      Supports JPG, PNG, WEBP, BMP &middot; Multi-file batch upload enabled
                    </p>
                  </div>
                </div>

                {/* Import progress overlay */}
                {importProgress && (
                  <div className="absolute inset-0 bg-[#14171C]/95 backdrop-blur-xs flex flex-col items-center justify-center p-6 z-20 space-y-3">
                    <Loader2 className="w-6 h-6 animate-spin text-[#3DA9FC]" />
                    <div className="w-full max-w-xs space-y-1.5 text-center">
                      <p className="text-xs font-mono text-[#E6E9EF]">
                        Uploading image {importProgress.current} of {importProgress.total}...
                      </p>
                      <div className="w-full bg-[#1B1F26] h-1.5 rounded-full overflow-hidden border border-[#2A2F38]">
                        <div
                          className="bg-[#3DA9FC] h-full transition-all duration-150"
                          style={{
                            width: `${(importProgress.current / (importProgress.total || 1)) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {skippedFiles.length > 0 && (
                <div className="p-3 rounded-lg bg-[#FF4D4D]/10 border border-[#FF4D4D]/25 text-xs text-[#FF4D4D] flex items-start space-x-2">
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Skipped non-image files: </span>
                    <span>{skippedFiles.join(', ')}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: VIDEO FRAME EXTRACTION */}
          {importMode === 'video' && (
            <div className="space-y-4">
              {!selectedVideo ? (
                <div
                  onDragEnter={onVideoDrag}
                  onDragLeave={onVideoDrag}
                  onDragOver={onVideoDrag}
                  onDrop={onVideoDrop}
                  className={`border-2 border-dashed rounded-xl p-8 text-center transition-all relative overflow-hidden flex flex-col items-center justify-center min-h-[220px] ${
                    videoDragActive
                      ? 'border-[#3DA9FC] bg-[#3DA9FC]/10 scale-[0.99]'
                      : 'border-[#2A2F38] hover:border-[#3DA9FC]/50 bg-[#14171C]/50'
                  }`}
                >
                  <input
                    type="file"
                    accept="video/*"
                    onChange={onVideoFileInput}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                    id="video-file-input"
                  />

                  <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
                    <div className="w-12 h-12 rounded-xl bg-[#14171C] border border-[#2A2F38] flex items-center justify-center text-[#3DA9FC] shadow-elevation-low">
                      <Video size={20} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#E6E9EF]">
                        Drop video file here, or <span className="text-[#3DA9FC] underline underline-offset-2">browse files</span>
                      </p>
                      <p className="text-xs text-[#8B93A1] mt-1">
                        MP4, WebM, MOV &middot; Extract frames at custom time intervals
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Selected Video Configuration & Studio */
                <div className="space-y-4 bg-[#14171C] border border-[#2A2F38] p-5 rounded-xl">
                  <div className="flex items-start justify-between pb-3 border-b border-[#2A2F38]">
                    <div className="min-w-0 pr-2">
                      <p className="text-sm font-semibold text-[#E6E9EF] truncate" title={selectedVideo.name}>
                        {selectedVideo.name}
                      </p>
                      {videoMetadata ? (
                        <p className="font-mono text-xs text-[#8B93A1] mt-0.5">
                          {videoMetadata.duration.toFixed(1)}s &middot; {videoMetadata.width}x{videoMetadata.height}px &middot; ~{videoMetadata.fps} FPS
                        </p>
                      ) : (
                        <p className="font-mono text-xs text-[#8B93A1] mt-0.5 flex items-center gap-1">
                          <Loader2 size={11} className="animate-spin text-[#3DA9FC]" />
                          Reading video container stream...
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={onClearVideo}
                      className="text-[#8B93A1] hover:text-[#FF4D4D] p-1 rounded transition-colors cursor-pointer"
                      title="Clear video"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  {/* Sampling Mode Settings */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono text-[#8B93A1] uppercase tracking-wider">
                        Sampling Method:
                      </span>
                      <div className="flex items-center space-x-1 bg-[#1B1F26] p-1 rounded-lg border border-[#2A2F38]">
                        <button
                          type="button"
                          onClick={() => setExtractionMode('interval')}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                            extractionMode === 'interval'
                              ? 'bg-[#3DA9FC] text-[#14171C] font-bold shadow-xs'
                              : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                          }`}
                        >
                          Interval (Sec)
                        </button>
                        <button
                          type="button"
                          onClick={() => setExtractionMode('fps')}
                          className={`px-2.5 py-1 rounded text-xs font-medium transition-all cursor-pointer ${
                            extractionMode === 'fps'
                              ? 'bg-[#3DA9FC] text-[#14171C] font-bold shadow-xs'
                              : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                          }`}
                        >
                          Rate (FPS)
                        </button>
                      </div>
                    </div>

                    {extractionMode === 'interval' ? (
                      <Slider
                        label="Extract every"
                        value={extractionInterval}
                        min={0.5}
                        max={10}
                        step={0.5}
                        unit="s"
                        onChange={(e) => setExtractionInterval(parseFloat(e.target.value))}
                      />
                    ) : (
                      <Slider
                        label="Frames per second"
                        value={extractionFps}
                        min={0.2}
                        max={5}
                        step={0.2}
                        unit="FPS"
                        onChange={(e) => setExtractionFps(parseFloat(e.target.value))}
                      />
                    )}

                    {/* Result Estimation Banner */}
                    <div className="flex items-center justify-between p-3 rounded-lg bg-[#1B1F26] border border-[#2A2F38] text-xs font-mono">
                      <span className="text-[#8B93A1]">Estimated Output:</span>
                      <span className="font-bold text-[#3DA9FC] font-mono-numbers">
                        ~{getEstimatedFrames()} sequential frames
                      </span>
                    </div>

                    {/* Frame Count Caution */}
                    {getEstimatedFrames() >= 100 && (
                      <div className="p-3 rounded-lg bg-[#FFB020]/10 border border-[#FFB020]/30 text-xs text-[#FFB020] flex items-start space-x-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span>
                          Extracting {getEstimatedFrames()} frames may take several seconds.
                        </span>
                      </div>
                    )}

                    {/* Extraction Progress & Action */}
                    <div className="pt-2">
                      <Button
                        variant="primary"
                        className="w-full"
                        disabled={!videoMetadata || isExtracting || getEstimatedFrames() === 0}
                        isLoading={isExtracting}
                        onClick={onExtractFrames}
                        leftIcon={<Film size={15} />}
                      >
                        Extract & Ingest Frames
                      </Button>
                    </div>

                    {/* Progress Bar */}
                    {isExtracting && extractionProgress && (
                      <div className="space-y-1.5 pt-2">
                        <div className="flex items-center justify-between text-xs font-mono text-[#3DA9FC]">
                          <span>Extracting video stream...</span>
                          <span className="font-mono-numbers">
                            {extractionProgress.current} / {extractionProgress.total}
                          </span>
                        </div>
                        <div className="w-full bg-[#1B1F26] h-1.5 rounded-full overflow-hidden border border-[#2A2F38]">
                          <div
                            className="bg-[#3DA9FC] h-full transition-all duration-150"
                            style={{
                              width: `${(extractionProgress.current / (extractionProgress.total || 1)) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Status Message */}
                    {extractionStatus && (
                      <div
                        className={`p-3 rounded-lg border text-xs font-mono flex items-center space-x-2 ${
                          extractionStatus.type === 'success'
                            ? 'bg-[#00E5A3]/10 border-[#00E5A3]/30 text-[#00E5A3]'
                            : 'bg-[#FF4D4D]/10 border-[#FF4D4D]/30 text-[#FF4D4D]'
                        }`}
                      >
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{extractionStatus.message}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
