import React, { useState } from 'react';
import { Project, ProjectImage, ImageSplit } from '../../types';
import { Card, Button, Badge, Input, Select } from '../ui';
import CornerBrackets from '../CornerBrackets';
import {
  FileImage,
  Tag,
  Trash2,
  Sliders,
  Filter,
  Search,
  Plus,
  ArrowRight,
  Layers,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';

export interface GalleryViewProps {
  project: Project;
  images: ProjectImage[];
  filteredImages: ProjectImage[];
  splitFilter: 'all' | 'train' | 'val' | 'test' | 'unassigned';
  setSplitFilter: (split: 'all' | 'train' | 'val' | 'test' | 'unassigned') => void;
  annotationFilter: 'all' | 'annotated' | 'not-annotated';
  setAnnotationFilter: (filter: 'all' | 'annotated' | 'not-annotated') => void;
  onSelectImageToAnnotate: (imageId: string) => void;
  onDeleteImage: (imageId: string) => void;
  onManualSplitChange: (imageId: string, split: ImageSplit) => void;
  onNavigateToImport: () => void;
}

export default function GalleryView({
  project,
  images,
  filteredImages,
  splitFilter,
  setSplitFilter,
  annotationFilter,
  setAnnotationFilter,
  onSelectImageToAnnotate,
  onDeleteImage,
  onManualSplitChange,
  onNavigateToImport,
}: GalleryViewProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Further filter by client search if typed
  const displayedImages = filteredImages.filter(img =>
    img.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalCount = images.length;
  const annotatedCount = images.filter(img => img.annotations && img.annotations.length > 0).length;

  return (
    <div className="space-y-6 animate-fadeIn" id="gallery-view">
      {/* 1. Header Bar with Metrics & Quick Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-[#2A2F38]">
        <div>
          <div className="flex items-center space-x-2.5">
            <h2 className="font-sans font-bold text-xl text-[#E6E9EF] tracking-tight">
              Dataset Image Gallery
            </h2>
            <Badge variant="primary" size="sm">
              <FileImage size={11} />
              {totalCount} Total Images
            </Badge>
          </div>
          <p className="font-sans text-xs text-[#8B93A1] mt-0.5">
            Browse staged images, inspect annotation statuses, and click any thumbnail to launch the bounding box studio.
          </p>
        </div>

        <div className="flex items-center space-x-2.5 self-start md:self-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={onNavigateToImport}
            leftIcon={<Plus size={14} />}
          >
            Import More Media
          </Button>
        </div>
      </div>

      {/* 2. Full-Width Filter & Search Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#1B1F26] border border-[#2A2F38] p-3.5 rounded-xl shadow-elevation-low">
        {/* Search input */}
        <div className="relative flex-grow max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B93A1]" size={15} />
          <input
            type="text"
            placeholder="Search images by filename..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-1.5 border border-[#2A2F38] rounded-lg text-xs bg-[#101317] text-[#E6E9EF] placeholder-[#5A6270] focus:bg-[#14171C] focus:outline-none focus:ring-2 focus:ring-[#3DA9FC] focus:border-transparent transition-all"
          />
        </div>

        {/* Filters Group */}
        <div className="flex items-center space-x-3 flex-wrap gap-y-2">
          {/* Split Filter Pills */}
          <div className="flex items-center space-x-1 bg-[#101317] p-1 rounded-lg border border-[#2A2F38]">
            <span className="px-2 text-[10px] font-mono text-[#8B93A1] uppercase tracking-wider hidden sm:inline-block">
              Split:
            </span>
            {(['all', 'train', 'val', 'test', 'unassigned'] as const).map((splitKey) => {
              const count =
                splitKey === 'all'
                  ? images.length
                  : splitKey === 'unassigned'
                  ? images.filter(img => !img.split || img.split === 'unassigned').length
                  : images.filter(img => img.split === splitKey).length;

              const isSelected = splitFilter === splitKey;

              return (
                <button
                  key={splitKey}
                  type="button"
                  onClick={() => setSplitFilter(splitKey)}
                  className={`px-2.5 py-1 rounded text-xs font-mono capitalize transition-all cursor-pointer flex items-center space-x-1 ${
                    isSelected
                      ? 'bg-[#3DA9FC] text-[#14171C] font-bold shadow-xs'
                      : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                  }`}
                >
                  <span>{splitKey}</span>
                  <span className={`text-[10px] font-mono-numbers opacity-80 ${isSelected ? 'text-[#14171C]' : 'text-[#5A6270]'}`}>
                    ({count})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center space-x-1 bg-[#101317] p-1 rounded-lg border border-[#2A2F38]">
            <span className="px-2 text-[10px] font-mono text-[#8B93A1] uppercase tracking-wider hidden sm:inline-block">
              Status:
            </span>
            {(
              [
                { key: 'all', label: 'All', count: images.length },
                { key: 'annotated', label: 'Labeled', count: annotatedCount },
                { key: 'not-annotated', label: 'Unlabeled', count: totalCount - annotatedCount },
              ] as const
            ).map((stat) => {
              const isSelected = annotationFilter === stat.key;
              return (
                <button
                  key={stat.key}
                  type="button"
                  onClick={() => setAnnotationFilter(stat.key)}
                  className={`px-2.5 py-1 rounded text-xs font-mono transition-all cursor-pointer flex items-center space-x-1 ${
                    isSelected
                      ? 'bg-[#2A2F38] text-[#E6E9EF] font-semibold border border-[#3DA9FC]/40'
                      : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                  }`}
                >
                  <span>{stat.label}</span>
                  <span className="text-[10px] text-[#5A6270] font-mono-numbers">
                    ({stat.count})
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Full-Width Image Grid with Strict Thumbnail Hierarchy */}
      {displayedImages.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {displayedImages.map((image) => {
            const hasBoxes = image.annotations && image.annotations.length > 0;
            const boxesCount = image.annotations ? image.annotations.length : 0;
            const hasSuggestions = (image.aiSuggestions && image.aiSuggestions.length > 0) || image.hasSuggestions;
            const suggestionsCount = image.aiSuggestions ? image.aiSuggestions.length : 0;
            const isAugmented = image.isAugmented;

            // Strict Status Indicator:
            // 1. Fully Annotated -> Emerald accent border at bottom
            // 2. Pending AI Suggestions -> Amber accent border at bottom
            // 3. Unannotated -> Neutral subtle border
            const statusBorderClass = hasBoxes
              ? 'border-b-2 border-b-[#00E5A3]'
              : hasSuggestions
              ? 'border-b-2 border-b-[#FFB020]'
              : 'border-b-2 border-b-[#2A2F38]';

            return (
              <Card
                key={image.id}
                elevation="low"
                interactive
                onClick={() => onSelectImageToAnnotate(image.id)}
                id={`gallery-image-${image.id}`}
                className={`group h-full flex flex-col justify-between overflow-hidden cursor-pointer transition-all duration-150 ${statusBorderClass}`}
              >
                {/* Visual Thumbnail Area */}
                <div className="aspect-video w-full bg-[#101317] overflow-hidden relative flex items-center justify-center">
                  <img
                    src={image.dataUrl}
                    alt={image.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />

                  {/* 1. STRICT HIERARCHY: Top-Left Fixed Split Label */}
                  <div className="absolute top-1.5 left-1.5 pointer-events-none">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider shadow-xs ${
                        image.split === 'train'
                          ? 'bg-[#3DA9FC] text-[#14171C]'
                          : image.split === 'val'
                          ? 'bg-[#FFB020] text-[#14171C]'
                          : image.split === 'test'
                          ? 'bg-slate-300 text-slate-900'
                          : 'bg-[#14171C]/90 text-[#8B93A1] border border-[#2A2F38]'
                      }`}
                    >
                      {image.split || 'none'}
                    </span>
                  </div>

                  {/* 2. STRICT HIERARCHY: Top-Right Single Modifier Badge (Augmented or AI) */}
                  {isAugmented ? (
                    <div className="absolute top-1.5 right-1.5 pointer-events-none">
                      <span className="px-1.5 py-0.5 rounded bg-[#D846FF]/90 text-[#14171C] text-[8px] font-mono font-bold uppercase shadow-xs">
                        AUG
                      </span>
                    </div>
                  ) : hasSuggestions ? (
                    <div className="absolute top-1.5 right-1.5 pointer-events-none">
                      <span className="px-1.5 py-0.5 rounded bg-[#FFB020] text-[#14171C] text-[8px] font-mono font-bold uppercase shadow-xs flex items-center gap-0.5">
                        <Sparkles size={8} /> {suggestionsCount > 0 ? `${suggestionsCount} AI` : 'AI'}
                      </span>
                    </div>
                  ) : null}

                  {/* Hover Hint Overlay */}
                  <div className="absolute inset-0 bg-[#14171C]/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                    <span className="text-[11px] font-semibold text-[#E6E9EF] bg-[#1B1F26] px-2.5 py-1 rounded-md border border-[#3DA9FC]/40 shadow-elevation-mid flex items-center gap-1">
                      Annotate &rarr;
                    </span>
                  </div>
                </div>

                {/* Card Footer Info & Controls */}
                <div className="p-2.5 space-y-2 bg-[#1B1F26]/90 flex-grow flex flex-col justify-between">
                  <p className="text-xs font-semibold text-[#E6E9EF] truncate" title={image.name}>
                    {image.name}
                  </p>

                  <div className="flex items-center justify-between font-mono text-[10px] text-[#8B93A1]">
                    {/* Bounding box counter with semantic dot */}
                    <span className="flex items-center space-x-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          hasBoxes ? 'bg-[#00E5A3]' : 'bg-[#5A6270]'
                        }`}
                      />
                      <span className="font-mono-numbers">
                        {boxesCount} {boxesCount === 1 ? 'box' : 'boxes'}
                      </span>
                    </span>

                    {/* Inline Quick Actions */}
                    <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                      {/* Split Selector Dropdown */}
                      <select
                        value={image.split || 'unassigned'}
                        onChange={(e) => onManualSplitChange(image.id, e.target.value as ImageSplit)}
                        className="bg-[#14171C] border border-[#2A2F38] text-[#8B93A1] rounded text-[9px] px-1.5 py-0.5 focus:outline-none focus:border-[#3DA9FC] cursor-pointer"
                        title="Change Dataset Split"
                      >
                        <option value="train">Train</option>
                        <option value="val">Val</option>
                        <option value="test">Test</option>
                        <option value="unassigned">None</option>
                      </select>

                      {/* Delete image */}
                      <button
                        type="button"
                        onClick={() => onDeleteImage(image.id)}
                        className="p-1 text-[#8B93A1] hover:text-[#FF4D4D] hover:bg-red-950/30 rounded transition-colors cursor-pointer"
                        title="Delete Image"
                        aria-label="Delete Image"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        /* Empty / No Matches State */
        <div className="text-center py-16 bg-[#1B1F26] border border-dashed border-[#2A2F38] rounded-xl space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#14171C] border border-[#2A2F38] flex items-center justify-center mx-auto text-[#8B93A1]">
            <FileImage size={20} />
          </div>
          <div>
            <h3 className="font-sans font-semibold text-base text-[#E6E9EF]">
              {searchTerm || splitFilter !== 'all' || annotationFilter !== 'all'
                ? 'No matching images found'
                : 'No images staged in this workspace'}
            </h3>
            <p className="text-xs text-[#8B93A1] max-w-sm mx-auto mt-1">
              {searchTerm || splitFilter !== 'all' || annotationFilter !== 'all'
                ? 'Try adjusting your split filter, status filter, or search term.'
                : 'Import image batches or extract video frames to begin labeling your dataset.'}
            </p>
          </div>
          {!searchTerm && splitFilter === 'all' && annotationFilter === 'all' && (
            <Button
              variant="primary"
              size="sm"
              onClick={onNavigateToImport}
              leftIcon={<Plus size={14} />}
            >
              Import Images / Video
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
