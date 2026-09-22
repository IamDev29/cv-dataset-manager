import React from 'react';
import { Project, ProjectImage } from '../../types';
import { StatTile, Card, CardHeader, CardTitle, CardContent, Button, Badge } from '../ui';
import {
  FileImage,
  CheckCircle,
  Tag,
  Sliders,
  Crosshair,
  Sparkles,
  ArrowRight,
  Upload,
  Layers,
  Database,
  Flame,
} from 'lucide-react';
import { ProjectNavSection } from '../layout/NavRail';

export interface OverviewViewProps {
  project: Project;
  images: ProjectImage[];
  onNavigateSection: (section: ProjectNavSection) => void;
  onOpenAnnotatorFirstImage: () => void;
}

export default function OverviewView({
  project,
  images,
  onNavigateSection,
  onOpenAnnotatorFirstImage,
}: OverviewViewProps) {
  const totalImages = images.length;
  const annotatedImages = images.filter(img => img.annotations && img.annotations.length > 0);
  const annotatedCount = annotatedImages.length;
  const unlabeledCount = totalImages - annotatedCount;
  const classes = project.classes || [];

  const splitStats = {
    train: images.filter(img => img.split === 'train').length,
    val: images.filter(img => img.split === 'val').length,
    test: images.filter(img => img.split === 'test').length,
    unassigned: images.filter(img => !img.split || img.split === 'unassigned').length,
  };

  const percentAnnotated = totalImages > 0 ? Math.round((annotatedCount / totalImages) * 100) : 0;

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* Top Metrics Banner */}
      <div>
        <h2 className="font-sans font-bold text-xl text-[#E6E9EF] tracking-tight">
          Project Overview
        </h2>
        <p className="font-sans text-xs text-[#8B93A1] mt-0.5">
          Real-time dataset health, annotation progress, and split status.
        </p>
      </div>

      {/* Stat Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatTile
          label="Total Images"
          value={totalImages}
          unit="files"
          subtext={`${unlabeledCount} unlabeled`}
          icon={<FileImage size={18} />}
          accent="primary"
        />

        <StatTile
          label="Annotation Progress"
          value={percentAnnotated}
          unit="%"
          subtext={`${annotatedCount} of ${totalImages} labeled`}
          icon={<CheckCircle size={18} />}
          accent={percentAnnotated >= 80 ? 'success' : 'primary'}
        />

        <StatTile
          label="Defined Classes"
          value={classes.length}
          unit="classes"
          subtext="Bounding box categories"
          icon={<Tag size={18} />}
          accent="primary"
        />

        <StatTile
          label="Dataset Partition"
          value={splitStats.train}
          unit="in train"
          subtext={`${splitStats.val} val / ${splitStats.test} test`}
          icon={<Sliders size={18} />}
          accent={splitStats.unassigned === 0 && totalImages > 0 ? 'success' : 'warning'}
        />
      </div>

      {/* Dataset Distribution & Class Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Split Distribution Card */}
        <Card elevation="low" className="lg:col-span-2 p-5 space-y-4">
          <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
            <div>
              <CardTitle>Dataset Split Partitioning</CardTitle>
              <p className="text-xs text-[#8B93A1] mt-0.5">
                Current train, validation, and test split allocation
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onNavigateSection('pipeline')}
              rightIcon={<ArrowRight size={13} />}
            >
              Configure Split
            </Button>
          </CardHeader>

          <div className="space-y-4">
            {/* Visual multi-segmented bar */}
            <div className="space-y-1.5">
              <div className="w-full bg-[#101317] h-3 rounded-full overflow-hidden flex border border-[#2A2F38]">
                {totalImages > 0 ? (
                  <>
                    <div
                      className="bg-[#3DA9FC] h-full transition-all duration-300"
                      style={{ width: `${(splitStats.train / totalImages) * 100}%` }}
                      title={`Train: ${splitStats.train}`}
                    />
                    <div
                      className="bg-[#FFB020] h-full transition-all duration-300"
                      style={{ width: `${(splitStats.val / totalImages) * 100}%` }}
                      title={`Validation: ${splitStats.val}`}
                    />
                    <div
                      className="bg-[#00E5A3] h-full transition-all duration-300"
                      style={{ width: `${(splitStats.test / totalImages) * 100}%` }}
                      title={`Test: ${splitStats.test}`}
                    />
                    <div
                      className="bg-[#2A2F38] h-full transition-all duration-300"
                      style={{ width: `${(splitStats.unassigned / totalImages) * 100}%` }}
                      title={`Unassigned: ${splitStats.unassigned}`}
                    />
                  </>
                ) : (
                  <div className="bg-[#2A2F38] w-full h-full" />
                )}
              </div>

              {/* Legend with numbers */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="p-2.5 rounded-lg bg-[#14171C] border border-[#2A2F38] space-y-0.5">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#3DA9FC]" />
                    <span className="font-mono text-[11px] text-[#8B93A1]">Train</span>
                  </div>
                  <p className="font-mono font-bold text-sm text-[#E6E9EF] font-mono-numbers">
                    {splitStats.train}{' '}
                    <span className="text-[10px] text-[#8B93A1] font-normal">
                      ({totalImages > 0 ? Math.round((splitStats.train / totalImages) * 100) : 0}%)
                    </span>
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-[#14171C] border border-[#2A2F38] space-y-0.5">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#FFB020]" />
                    <span className="font-mono text-[11px] text-[#8B93A1]">Validation</span>
                  </div>
                  <p className="font-mono font-bold text-sm text-[#E6E9EF] font-mono-numbers">
                    {splitStats.val}{' '}
                    <span className="text-[10px] text-[#8B93A1] font-normal">
                      ({totalImages > 0 ? Math.round((splitStats.val / totalImages) * 100) : 0}%)
                    </span>
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-[#14171C] border border-[#2A2F38] space-y-0.5">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#00E5A3]" />
                    <span className="font-mono text-[11px] text-[#8B93A1]">Test</span>
                  </div>
                  <p className="font-mono font-bold text-sm text-[#E6E9EF] font-mono-numbers">
                    {splitStats.test}{' '}
                    <span className="text-[10px] text-[#8B93A1] font-normal">
                      ({totalImages > 0 ? Math.round((splitStats.test / totalImages) * 100) : 0}%)
                    </span>
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-[#14171C] border border-[#2A2F38] space-y-0.5">
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#5A6270]" />
                    <span className="font-mono text-[11px] text-[#8B93A1]">Unassigned</span>
                  </div>
                  <p className="font-mono font-bold text-sm text-[#8B93A1] font-mono-numbers">
                    {splitStats.unassigned}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Classes Summary Card */}
        <Card elevation="low" className="p-5 space-y-4">
          <CardHeader className="p-0 pb-3 border-b border-[#2A2F38]/60">
            <div>
              <CardTitle>Classes ({classes.length})</CardTitle>
              <p className="text-xs text-[#8B93A1] mt-0.5">Defined categories</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigateSection('classes')}
              rightIcon={<ArrowRight size={13} />}
            >
              Manage
            </Button>
          </CardHeader>

          {classes.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
              {classes.map(cls => (
                <div
                  key={cls.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#14171C] border border-[#2A2F38] text-xs"
                >
                  <div className="flex items-center space-x-2 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: cls.color }}
                    />
                    <span className="font-medium text-[#E6E9EF] truncate">{cls.name}</span>
                  </div>
                  <span className="font-mono text-[10px] text-[#8B93A1]">ID: {cls.id.slice(0, 8)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-xs text-[#8B93A1] space-y-2">
              <Tag size={20} className="mx-auto text-[#5A6270]" />
              <p>No classes created yet.</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigateSection('classes')}
              >
                Add First Class
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Quick Launchpad Grid */}
      <div className="space-y-3">
        <h3 className="font-mono text-xs text-[#8B93A1] uppercase tracking-wider font-semibold">
          Quick Actions & Workflows
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card
            elevation="low"
            interactive
            onClick={() => onNavigateSection('gallery')}
            className="p-5 space-y-3"
          >
            <div className="w-9 h-9 rounded-lg bg-[#3DA9FC]/15 text-[#3DA9FC] flex items-center justify-center">
              <FileImage size={18} />
            </div>
            <div>
              <h4 className="font-sans font-semibold text-sm text-[#E6E9EF]">Browse Gallery</h4>
              <p className="text-xs text-[#8B93A1] mt-0.5">
                Inspect full-width dataset images, filter by split, and delete frames.
              </p>
            </div>
          </Card>

          <Card
            elevation="low"
            interactive
            onClick={() => onNavigateSection('classes')}
            className="p-5 space-y-3"
          >
            <div className="w-9 h-9 rounded-lg bg-[#00E5A3]/15 text-[#00E5A3] flex items-center justify-center">
              <Upload size={18} />
            </div>
            <div>
              <h4 className="font-sans font-semibold text-sm text-[#E6E9EF]">Import & Video Frames</h4>
              <p className="text-xs text-[#8B93A1] mt-0.5">
                Batch upload photos or extract video frames at fixed intervals/FPS.
              </p>
            </div>
          </Card>

          <Card
            elevation="low"
            interactive
            onClick={() => onNavigateSection('pipeline')}
            className="p-5 space-y-3"
          >
            <div className="w-9 h-9 rounded-lg bg-[#FFB020]/15 text-[#FFB020] flex items-center justify-center">
              <Sliders size={18} />
            </div>
            <div>
              <h4 className="font-sans font-semibold text-sm text-[#E6E9EF]">Augment & Export</h4>
              <p className="text-xs text-[#8B93A1] mt-0.5">
                Generate geometric variations and download YOLO zip archive.
              </p>
            </div>
          </Card>

          <Card
            elevation="low"
            interactive
            onClick={() => onNavigateSection('train')}
            className="p-5 space-y-3"
          >
            <div className="w-9 h-9 rounded-lg bg-[#FFB020]/15 text-[#FFB020] flex items-center justify-center">
              <Flame size={18} />
            </div>
            <div>
              <h4 className="font-sans font-semibold text-sm text-[#E6E9EF]">Train Custom Model</h4>
              <p className="text-xs text-[#8B93A1] mt-0.5">
                Train YOLO detection models directly from the app with live metrics.
              </p>
            </div>
          </Card>

          <Card
            elevation="low"
            interactive
            onClick={onOpenAnnotatorFirstImage}
            className="p-5 space-y-3"
          >
            <div className="w-9 h-9 rounded-lg bg-[#3DA9FC]/15 text-[#3DA9FC] flex items-center justify-center">
              <Crosshair size={18} />
            </div>
            <div>
              <h4 className="font-sans font-semibold text-sm text-[#E6E9EF]">Annotate Studio</h4>
              <p className="text-xs text-[#8B93A1] mt-0.5">
                Draw, resize, and label high-precision bounding boxes with keyboard hotkeys.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
