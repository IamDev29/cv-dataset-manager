import React, { useState } from 'react';
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Badge,
  StatTile,
  IconRailItem,
  Input,
  Select,
  Checkbox,
  Slider,
} from './ui';
import BoxelLogo from './BoxelLogo';
import CornerBrackets from './CornerBrackets';
import {
  Search,
  Plus,
  Trash2,
  Download,
  Upload,
  Layers,
  Sparkles,
  Sliders,
  Database,
  Grid,
  CheckCircle,
  Clock,
  AlertTriangle,
  FileImage,
  Tag,
  ArrowRight,
  Zap,
} from 'lucide-react';

export default function StyleGuide({ onClose }: { onClose?: () => void }) {
  // Interactive test states for controls
  const [btnLoading, setBtnLoading] = useState(false);
  const [sliderVal, setSliderVal] = useState(70);
  const [check1, setCheck1] = useState(true);
  const [check2, setCheck2] = useState(false);
  const [activeRail, setActiveRail] = useState('images');
  const [inputValue, setInputValue] = useState('YOLOv8-medium.onnx');
  const [selectValue, setSelectValue] = useState('train');

  return (
    <div className="min-h-screen bg-[#14171C] ambient-bg text-[#E6E9EF] flex flex-col antialiased">
      {/* Header Bar */}
      <header className="sticky top-0 z-30 bg-[#1B1F26]/90 backdrop-blur-md border-b border-[#2A2F38] px-6 py-4 flex items-center justify-between shadow-elevation-low">
        <div className="flex items-center space-x-3">
          <BoxelLogo size="md" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-sans font-bold tracking-tight text-lg text-[#E6E9EF]">
                boxel<span className="text-[#3DA9FC] font-extrabold ml-0.5">.</span>
              </h1>
              <Badge variant="primary" size="sm">
                Design System v2.0
              </Badge>
            </div>
            <p className="font-mono text-[9px] text-[#8B93A1] tracking-widest uppercase mt-0.5">
              Precision Instrument Tokens & Component Library
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {onClose && (
            <Button variant="primary" size="sm" onClick={onClose}>
              Back to Application
            </Button>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl w-full mx-auto p-6 md:p-10 space-y-12 flex-grow">
        {/* Section 1: Philosophy & Rules */}
        <section className="space-y-4">
          <div>
            <span className="font-mono text-xs text-[#3DA9FC] tracking-wider uppercase font-semibold">
              01 &middot; Design System Core Rules
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-[#E6E9EF] mt-1 font-sans">
              Precision Visual Architecture
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card elevation="low" className="p-5 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-[#3DA9FC]/15 border border-[#3DA9FC]/30 text-[#3DA9FC] flex items-center justify-center font-mono font-bold text-xs">
                01
              </div>
              <h3 className="font-sans font-semibold text-sm text-[#E6E9EF]">
                Single Primary Accent
              </h3>
              <p className="text-xs text-[#8B93A1] leading-relaxed">
                <code className="text-[#3DA9FC] font-mono">#3DA9FC</code> is reserved exclusively for interactive actions, focus indicators, and active selection.
              </p>
            </Card>

            <Card elevation="low" className="p-5 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-[#00E5A3]/15 border border-[#00E5A3]/30 text-[#00E5A3] flex items-center justify-center font-mono font-bold text-xs">
                02
              </div>
              <h3 className="font-sans font-semibold text-sm text-[#E6E9EF]">
                Two Semantic Status Colors
              </h3>
              <p className="text-xs text-[#8B93A1] leading-relaxed">
                Emerald (<code className="text-[#00E5A3] font-mono">#00E5A3</code>) for complete/success and Amber (<code className="text-[#FFB020] font-mono">#FFB020</code>) for pending/attention only.
              </p>
            </Card>

            <Card elevation="low" className="p-5 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-[#FFB020]/15 border border-[#FFB020]/30 text-[#FFB020] flex items-center justify-center font-mono font-bold text-xs">
                03
              </div>
              <h3 className="font-sans font-semibold text-sm text-[#E6E9EF]">
                Dual Font Discipline
              </h3>
              <p className="text-xs text-[#8B93A1] leading-relaxed">
                <span className="font-sans font-semibold text-white">Inter</span> for all UI copy and headings; <span className="font-mono font-bold text-white">JetBrains Mono</span> strictly for counts, numbers, IDs, and coordinates.
              </p>
            </Card>
          </div>
        </section>

        {/* Section 2: Color Tokens */}
        <section className="space-y-4">
          <div>
            <span className="font-mono text-xs text-[#3DA9FC] tracking-wider uppercase font-semibold">
              02 &middot; Color Tokens
            </span>
            <h2 className="text-xl font-bold tracking-tight text-[#E6E9EF] mt-1 font-sans">
              Disciplined Instrument Palette
            </h2>
          </div>

          <div className="space-y-6">
            {/* Backgrounds & Surfaces */}
            <div className="space-y-2">
              <h3 className="text-xs font-mono font-semibold text-[#8B93A1] uppercase tracking-wider">
                Surface & Elevation Layers
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-[#14171C] border border-[#2A2F38] shadow-elevation-low space-y-1">
                  <span className="block font-mono text-[10px] text-[#8B93A1]">bg-base</span>
                  <span className="block font-mono text-xs font-bold text-[#E6E9EF]">#14171C</span>
                  <span className="block text-[11px] text-[#5A6270]">App Background</span>
                </div>
                <div className="p-4 rounded-xl bg-[#1B1F26] border border-[#2A2F38] shadow-elevation-mid space-y-1">
                  <span className="block font-mono text-[10px] text-[#8B93A1]">bg-elevated</span>
                  <span className="block font-mono text-xs font-bold text-[#E6E9EF]">#1B1F26</span>
                  <span className="block text-[11px] text-[#5A6270]">Elevated Panels</span>
                </div>
                <div className="p-4 rounded-xl bg-[#181C22] border border-[#2A2F38] shadow-elevation-low space-y-1">
                  <span className="block font-mono text-[10px] text-[#8B93A1]">bg-surface</span>
                  <span className="block font-mono text-xs font-bold text-[#E6E9EF]">#181C22</span>
                  <span className="block text-[11px] text-[#5A6270]">Cards & Tiles</span>
                </div>
                <div className="p-4 rounded-xl bg-[#101317] border border-[#2A2F38] space-y-1">
                  <span className="block font-mono text-[10px] text-[#8B93A1]">bg-subtle</span>
                  <span className="block font-mono text-xs font-bold text-[#E6E9EF]">#101317</span>
                  <span className="block text-[11px] text-[#5A6270]">Recessed Inputs</span>
                </div>
              </div>
            </div>

            {/* Primary & Semantics */}
            <div className="space-y-2">
              <h3 className="text-xs font-mono font-semibold text-[#8B93A1] uppercase tracking-wider">
                Action & Semantic Status
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 rounded-xl bg-[#3DA9FC]/15 border border-[#3DA9FC]/40 shadow-glow-primary space-y-1">
                  <span className="block font-mono text-[10px] text-[#3DA9FC]">Primary Signal Blue</span>
                  <span className="block font-mono text-xs font-bold text-[#3DA9FC]">#3DA9FC</span>
                  <span className="block text-[11px] text-[#E6E9EF]/70">Actions / Focus</span>
                </div>
                <div className="p-4 rounded-xl bg-[#00E5A3]/15 border border-[#00E5A3]/40 shadow-glow-success space-y-1">
                  <span className="block font-mono text-[10px] text-[#00E5A3]">Status Complete</span>
                  <span className="block font-mono text-xs font-bold text-[#00E5A3]">#00E5A3</span>
                  <span className="block text-[11px] text-[#E6E9EF]/70">Success States</span>
                </div>
                <div className="p-4 rounded-xl bg-[#FFB020]/15 border border-[#FFB020]/40 shadow-glow-warning space-y-1">
                  <span className="block font-mono text-[10px] text-[#FFB020]">Status Attention</span>
                  <span className="block font-mono text-xs font-bold text-[#FFB020]">#FFB020</span>
                  <span className="block text-[11px] text-[#E6E9EF]/70">Pending / Warning</span>
                </div>
                <div className="p-4 rounded-xl bg-[#FF4D4D]/15 border border-[#FF4D4D]/40 space-y-1">
                  <span className="block font-mono text-[10px] text-[#FF4D4D]">Status Danger</span>
                  <span className="block font-mono text-xs font-bold text-[#FF4D4D]">#FF4D4D</span>
                  <span className="block text-[11px] text-[#E6E9EF]/70">Destructive Actions</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Typography Showcase */}
        <section className="space-y-4">
          <div>
            <span className="font-mono text-xs text-[#3DA9FC] tracking-wider uppercase font-semibold">
              03 &middot; Typography Discipline
            </span>
            <h2 className="text-xl font-bold tracking-tight text-[#E6E9EF] mt-1 font-sans">
              Geometric Sans vs. Monospace Numbers
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card elevation="low" className="p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#2A2F38] pb-2">
                <span className="font-sans font-bold text-xs text-[#3DA9FC]">Inter &middot; Geometric Grotesk</span>
                <Badge variant="outline" size="sm">UI & Copy</Badge>
              </div>
              <div className="space-y-2">
                <h1 className="text-2xl font-bold tracking-tight text-[#E6E9EF]">
                  Autonomous Vehicle Object Annotator
                </h1>
                <p className="text-xs text-[#8B93A1] leading-relaxed">
                  Every label, navigation rail title, form description, and modal instructions use clean geometric sans-serif for optimal legibility at small sizes.
                </p>
                <div className="flex gap-2 pt-2">
                  <span className="text-xs font-semibold text-[#E6E9EF]">Semibold 600</span>
                  <span className="text-xs font-medium text-[#8B93A1]">Medium 500</span>
                  <span className="text-xs font-normal text-[#5A6270]">Regular 400</span>
                </div>
              </div>
            </Card>

            <Card elevation="low" className="p-5 space-y-3">
              <div className="flex items-center justify-between border-b border-[#2A2F38] pb-2">
                <span className="font-mono font-bold text-xs text-[#3DA9FC]">JetBrains Mono &middot; Tabular Numbers</span>
                <Badge variant="primary" size="sm">Data & Metrics</Badge>
              </div>
              <div className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold font-mono font-mono-numbers text-[#E6E9EF]">1,420</span>
                  <span className="text-sm font-mono text-[#00E5A3] font-bold">+99.4%</span>
                  <span className="text-xs font-mono text-[#8B93A1]">conf: 0.8750</span>
                </div>
                <p className="font-mono text-xs text-[#8B93A1] leading-relaxed">
                  IDs: proj-8f92a10c &middot; bbox: [0.124, 0.450, 0.320, 0.280] &middot; 12ms inference
                </p>
                <div className="grid grid-cols-4 gap-1 text-center font-mono text-[11px] bg-[#101317] p-2 rounded-lg border border-[#2A2F38]">
                  <div>Train: <span className="font-bold text-[#3DA9FC]">70%</span></div>
                  <div>Val: <span className="font-bold text-[#FFB020]">20%</span></div>
                  <div>Test: <span className="font-bold text-[#E6E9EF]">10%</span></div>
                  <div>Loss: <span className="font-bold text-[#00E5A3]">0.012</span></div>
                </div>
              </div>
            </Card>
          </div>
        </section>

        {/* Section 4: Reusable Base Component Library */}
        <section className="space-y-6">
          <div>
            <span className="font-mono text-xs text-[#3DA9FC] tracking-wider uppercase font-semibold">
              04 &middot; Base Component Library
            </span>
            <h2 className="text-xl font-bold tracking-tight text-[#E6E9EF] mt-1 font-sans">
              Interactive Component Variants
            </h2>
          </div>

          {/* Buttons */}
          <Card elevation="low" className="p-6 space-y-4">
            <CardHeader className="p-0 pb-3">
              <div>
                <CardTitle>Button Variants & States</CardTitle>
                <CardDescription>
                  Standardized action buttons with precision hover lift, loading spinners, and icon slots.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setBtnLoading(!btnLoading)}
              >
                Toggle Loading: {btnLoading ? 'ON' : 'OFF'}
              </Button>
            </CardHeader>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button variant="primary" isLoading={btnLoading} leftIcon={<Plus size={14} />}>
                Primary Action
              </Button>
              <Button variant="secondary" isLoading={btnLoading} leftIcon={<Download size={14} />}>
                Secondary Action
              </Button>
              <Button variant="ghost" isLoading={btnLoading} leftIcon={<Sliders size={14} />}>
                Ghost Action
              </Button>
              <Button variant="destructive" isLoading={btnLoading} leftIcon={<Trash2 size={14} />}>
                Destructive Action
              </Button>
              <Button variant="secondary" disabled leftIcon={<Upload size={14} />}>
                Disabled
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#2A2F38]/60">
              <span className="text-xs font-mono text-[#8B93A1]">Sizes:</span>
              <Button size="sm" variant="primary">Small (sm)</Button>
              <Button size="md" variant="primary">Medium (md)</Button>
              <Button size="lg" variant="primary">Large (lg)</Button>
              <Button size="icon" variant="secondary" aria-label="Settings">
                <Sliders size={15} />
              </Button>
            </div>
          </Card>

          {/* Badges */}
          <Card elevation="low" className="p-6 space-y-4">
            <div>
              <CardTitle>Badges & Status Indicators</CardTitle>
              <CardDescription>
                Compact pill indicators with optional pulsing dots and semantic status colors.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Badge variant="neutral">Neutral Status</Badge>
              <Badge variant="primary" dot>Primary Active</Badge>
              <Badge variant="success" dot pulseDot>Completed</Badge>
              <Badge variant="warning" dot pulseDot>Pending Review</Badge>
              <Badge variant="destructive" dot>Failed</Badge>
              <Badge variant="outline">Unassigned</Badge>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-[#2A2F38]/60">
              <span className="text-xs font-mono text-[#8B93A1]">Sizes:</span>
              <Badge size="sm" variant="primary" dot>Size SM</Badge>
              <Badge size="md" variant="primary" dot>Size MD</Badge>
            </div>
          </Card>

          {/* StatTiles */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-semibold text-[#8B93A1] uppercase tracking-wider">
              StatTile Metric Cards
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatTile
                label="Total Projects"
                value="12"
                unit="active"
                subtext="Synced to SQLite backend"
                icon={<Grid size={18} />}
                accent="primary"
              />
              <StatTile
                label="Total Images"
                value="2,480"
                unit="files"
                subtext="1,850 labeled (75%)"
                icon={<FileImage size={18} />}
                accent="primary"
              />
              <StatTile
                label="Dataset Split"
                value="98.2"
                unit="%"
                subtext="70% Train / 20% Val / 10% Test"
                icon={<Sliders size={18} />}
                accent="success"
              />
              <StatTile
                label="AI Model Status"
                value="READY"
                subtext="YOLOv8-m &middot; 80 classes"
                icon={<Sparkles size={18} />}
                accent="warning"
              />
            </div>
          </div>

          {/* Navigation Rail Items */}
          <Card elevation="low" className="p-6 space-y-4">
            <div>
              <CardTitle>IconRail Navigation Item</CardTitle>
              <CardDescription>
                Designed for the precision collapsible side rail (Stage 2) with active indicators and badges.
              </CardDescription>
            </div>

            <div className="max-w-xs space-y-1.5 bg-[#14171C] p-3 rounded-xl border border-[#2A2F38]">
              <IconRailItem
                icon={<FileImage size={16} />}
                label="Dataset Gallery"
                isActive={activeRail === 'images'}
                badgeCount={142}
                shortcut="1"
                onClick={() => setActiveRail('images')}
              />
              <IconRailItem
                icon={<Tag size={16} />}
                label="Labeling & Classes"
                isActive={activeRail === 'classes'}
                badgeCount={8}
                shortcut="2"
                onClick={() => setActiveRail('classes')}
              />
              <IconRailItem
                icon={<Sliders size={16} />}
                label="Split & Augment"
                isActive={activeRail === 'pipeline'}
                shortcut="3"
                onClick={() => setActiveRail('pipeline')}
              />
              <IconRailItem
                icon={<Sparkles size={16} />}
                label="AI Assisted Assist"
                isActive={activeRail === 'ai'}
                shortcut="4"
                onClick={() => setActiveRail('ai')}
              />
            </div>
          </Card>

          {/* Form Controls */}
          <Card elevation="low" className="p-6 space-y-6">
            <div>
              <CardTitle>Form Controls & Precision Inputs</CardTitle>
              <CardDescription>
                Inputs, select menus, custom checkboxes, and range sliders styled to instrument theme.
              </CardDescription>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Input
                label="Project Search"
                placeholder="Search projects..."
                leftIcon={<Search size={14} />}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                helperText="Type any keyword to filter instantly"
              />

              <Input
                label="Inference Confidence Threshold"
                placeholder="0.50"
                isMono
                defaultValue="0.65"
                helperText="Monospace input for precision floating numbers"
              />

              <Select
                label="Dataset Split Assignment"
                value={selectValue}
                onChange={(e) => setSelectValue(e.target.value)}
                options={[
                  { value: 'train', label: 'Train Split (70%)' },
                  { value: 'val', label: 'Validation Split (20%)' },
                  { value: 'test', label: 'Test Split (10%)' },
                  { value: 'unassigned', label: 'Unassigned' },
                ]}
              />

              <Input
                label="Input with Error State"
                defaultValue="invalid class name!"
                error="Class name contains forbidden symbols"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-[#2A2F38]/60">
              <div className="space-y-3">
                <span className="block font-mono text-xs font-semibold text-[#8B93A1] uppercase tracking-wider">
                  Checkboxes
                </span>
                <Checkbox
                  label="Horizontal Flip Augmentation"
                  description="Flip bounding boxes along x-axis 0.5"
                  checked={check1}
                  onChange={(e) => setCheck1(e.target.checked)}
                />
                <Checkbox
                  label="Include Unannotated Images in Split"
                  description="Allow zero-box images into test partition"
                  checked={check2}
                  onChange={(e) => setCheck2(e.target.checked)}
                />
              </div>

              <div className="space-y-4">
                <span className="block font-mono text-xs font-semibold text-[#8B93A1] uppercase tracking-wider">
                  Precision Slider
                </span>
                <Slider
                  label="Training Partition Target"
                  value={sliderVal}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  onChange={(e) => setSliderVal(Number(e.target.value))}
                />
              </div>
            </div>
          </Card>

          {/* Elevation & Glass Surface Demo */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-semibold text-[#8B93A1] uppercase tracking-wider">
              Elevation & Materials
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card elevation="low" className="p-5 space-y-2">
                <Badge variant="outline" size="sm">Elevation: Low</Badge>
                <h4 className="font-sans font-semibold text-sm text-[#E6E9EF]">Resting Surface</h4>
                <p className="text-xs text-[#8B93A1]">
                  Subtle 1px border highlight and soft dark drop shadow for standard panels.
                </p>
              </Card>

              <Card elevation="mid" interactive className="p-5 space-y-2">
                <Badge variant="primary" size="sm">Elevation: Mid (Interactive)</Badge>
                <h4 className="font-sans font-semibold text-sm text-[#E6E9EF]">Hover Lift Surface</h4>
                <p className="text-xs text-[#8B93A1]">
                  Subtle lift (<code className="font-mono text-[#3DA9FC]">-translate-y-0.5</code>) with expanded shadow on cursor hover.
                </p>
              </Card>

              <Card elevation="glass" className="p-5 space-y-2">
                <Badge variant="success" size="sm">Elevation: Glass</Badge>
                <h4 className="font-sans font-semibold text-sm text-[#E6E9EF]">Backdrop Glass Surface</h4>
                <p className="text-xs text-[#8B93A1]">
                  Translucent background with 12px backdrop blur for floating cards and modals.
                </p>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#2A2F38] bg-[#101317] py-6 px-6 text-center font-mono text-xs text-[#8B93A1]">
        <p>boxel design system &middot; stage 1 established &middot; ready for stage 2 navigation rail</p>
      </footer>
    </div>
  );
}
