import React from 'react';
import {
  Grid,
  BarChart3,
  Tag,
  FileImage,
  Crosshair,
  Sliders,
  Sparkles,
  ChevronLeft,
  Layers,
  Flame,
} from 'lucide-react';
import { IconRailItem } from '../ui';
import BoxelLogo from '../BoxelLogo';

export type ProjectNavSection =
  | 'overview'
  | 'classes'
  | 'gallery'
  | 'annotate'
  | 'pipeline'
  | 'ai'
  | 'train';

export interface NavRailProps {
  activeSection: ProjectNavSection;
  onSelectSection: (section: ProjectNavSection) => void;
  onReturnToDashboard: () => void;
  projectName?: string;
  imageCount?: number;
  classCount?: number;
  annotatedCount?: number;
}

export default function NavRail({
  activeSection,
  onSelectSection,
  onReturnToDashboard,
  projectName,
  imageCount = 0,
  classCount = 0,
  annotatedCount = 0,
}: NavRailProps) {
  return (
    <aside
      className="w-16 lg:w-56 shrink-0 bg-[#1B1F26] border-r border-[#2A2F38] flex flex-col justify-between select-none z-20 transition-all duration-200"
      id="app-nav-rail"
    >
      {/* Top Section: App Logo & Return to Dashboard */}
      <div className="p-3 space-y-4">
        <div className="flex items-center justify-center lg:justify-start gap-2.5 px-1 py-2 border-b border-[#2A2F38]/60">
          <BoxelLogo size="sm" />
          <span className="hidden lg:inline-block font-sans font-bold text-sm tracking-tight text-[#E6E9EF]">
            boxel<span className="text-[#3DA9FC] font-extrabold ml-0.5">.</span>
          </span>
        </div>

        {/* Dashboard link */}
        <div>
          <button
            type="button"
            onClick={onReturnToDashboard}
            className="group flex items-center justify-center lg:justify-start w-full px-2.5 py-2 rounded-lg text-xs font-medium text-[#8B93A1] hover:text-[#3DA9FC] hover:bg-[#14171C] border border-transparent hover:border-[#2A2F38] cursor-pointer transition-all duration-150"
            title="Return to Projects Dashboard"
          >
            <ChevronLeft size={16} className="shrink-0 transition-transform group-hover:-translate-x-0.5" />
            <span className="hidden lg:inline-block ml-2 truncate font-sans">
              All Projects
            </span>
          </button>
        </div>

        {/* Project Header Info (Desktop) */}
        {projectName && (
          <div className="hidden lg:block px-2 py-1.5 bg-[#14171C] rounded-lg border border-[#2A2F38]/70">
            <p className="font-mono text-[9px] text-[#8B93A1] uppercase tracking-wider">
              Active Workspace
            </p>
            <p className="font-sans font-semibold text-xs text-[#E6E9EF] truncate mt-0.5" title={projectName}>
              {projectName}
            </p>
          </div>
        )}

        {/* Navigation Items */}
        <div className="space-y-1 pt-2">
          <p className="hidden lg:block px-2 font-mono text-[9px] text-[#5A6270] uppercase tracking-wider font-semibold mb-1.5">
            Navigation
          </p>

          <IconRailItem
            icon={<BarChart3 size={17} />}
            label="Overview"
            isActive={activeSection === 'overview'}
            shortcut="1"
            onClick={() => onSelectSection('overview')}
            title="Overview & Metrics (Key 1)"
          />

          <IconRailItem
            icon={<Tag size={17} />}
            label="Classes & Import"
            isActive={activeSection === 'classes'}
            badgeCount={classCount}
            shortcut="2"
            onClick={() => onSelectSection('classes')}
            title="Classes & Import (Key 2)"
          />

          <IconRailItem
            icon={<FileImage size={17} />}
            label="Gallery"
            isActive={activeSection === 'gallery'}
            badgeCount={imageCount}
            shortcut="3"
            onClick={() => onSelectSection('gallery')}
            title="Image Gallery (Key 3)"
          />

          <IconRailItem
            icon={<Crosshair size={17} />}
            label="Annotate"
            isActive={activeSection === 'annotate'}
            badgeCount={imageCount - annotatedCount > 0 ? imageCount - annotatedCount : undefined}
            shortcut="4"
            onClick={() => onSelectSection('annotate')}
            title="Annotate Studio (Key 4)"
          />

          <IconRailItem
            icon={<Sliders size={17} />}
            label="Pipeline"
            isActive={activeSection === 'pipeline'}
            shortcut="5"
            onClick={() => onSelectSection('pipeline')}
            title="Split, Augment & Export (Key 5)"
          />

          <IconRailItem
            icon={<Sparkles size={17} />}
            label="AI Assist"
            isActive={activeSection === 'ai'}
            shortcut="6"
            onClick={() => onSelectSection('ai')}
            title="AI Model Assist (Key 6)"
          />

          <IconRailItem
            icon={<Flame size={17} />}
            label="Train Model"
            isActive={activeSection === 'train'}
            shortcut="7"
            onClick={() => onSelectSection('train')}
            title="Train YOLO Model (Key 7)"
          />
        </div>
      </div>

      {/* Bottom Summary Bar (Desktop) */}
      <div className="p-3 border-t border-[#2A2F38]/60 text-center lg:text-left">
        <div className="hidden lg:flex items-center justify-between text-[11px] font-mono text-[#8B93A1]">
          <span>Labeled:</span>
          <span className="font-bold text-[#00E5A3] font-mono-numbers">
            {annotatedCount} / {imageCount}
          </span>
        </div>
        <div className="hidden lg:block w-full bg-[#14171C] h-1.5 rounded-full overflow-hidden mt-1.5 border border-[#2A2F38]">
          <div
            className="bg-[#00E5A3] h-full transition-all duration-300"
            style={{ width: imageCount > 0 ? `${(annotatedCount / imageCount) * 100}%` : '0%' }}
          />
        </div>
      </div>
    </aside>
  );
}
