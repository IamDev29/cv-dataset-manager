import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Tag,
  Sparkles,
  Check,
  CheckCheck,
  HelpCircle,
  Maximize2,
  Info,
  Sliders,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ProjectClass, BoundingBox, ImageSplit, ProjectImage, AISuggestion } from '../types';
import { api } from '../api';
import { Card, Button, Badge } from './ui';

export interface AnnotatorProps {
  image: ProjectImage;
  classes: ProjectClass[];
  onSave: (imageId: string, annotations: BoundingBox[]) => void;
  onUpdateImage?: (updatedImage: ProjectImage) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  onUpdateSplit?: (imageId: string, split: ImageSplit) => void;
  hasNext: boolean;
  hasPrev: boolean;
}

type DragAction =
  | 'draw'
  | 'move'
  | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br'
  | 'resize-t' | 'resize-b' | 'resize-l' | 'resize-r';

export default function Annotator({
  image,
  classes,
  onSave,
  onUpdateImage,
  onNext,
  onPrev,
  onClose,
  onUpdateSplit,
  hasNext,
  hasPrev,
}: AnnotatorProps) {
  const [annotations, setAnnotations] = useState<BoundingBox[]>([]);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null);
  const [activeClassId, setActiveClassId] = useState<string>('');

  // Local state for temporary drawing
  const [drawingBox, setDrawingBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const currentImageIdRef = useRef(image.id);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; boxX: number; boxY: number; boxW: number; boxH: number } | null>(null);
  const activeActionRef = useRef<DragAction | null>(null);

  // Load annotations & suggestions when image ID changes
  useEffect(() => {
    if (currentImageIdRef.current !== image.id) {
      currentImageIdRef.current = image.id;
      setAnnotations(image.annotations || []);
      setAiSuggestions(image.aiSuggestions || []);
      setSelectedBoxId(null);
    } else {
      // If same image, update annotations if changed from external source, but don't re-add accepted suggestions
      if (image.annotations && image.annotations.length > annotations.length) {
        setAnnotations(image.annotations);
      }
    }
  }, [image.id, image.annotations, image.aiSuggestions]);

  // Initial load
  useEffect(() => {
    setAnnotations(image.annotations || []);
    setAiSuggestions(image.aiSuggestions || []);
  }, []);

  // Set default active class on launch or if classes list changes
  useEffect(() => {
    if (classes.length > 0) {
      const exists = classes.some(c => c.id === activeClassId);
      if (!exists) {
        setActiveClassId(classes[0].id);
      }
    } else {
      setActiveClassId('');
    }
  }, [classes, activeClassId]);

  // Auto-save on manual drawing or resizing
  const saveChanges = (newAnnotations: BoundingBox[]) => {
    onSave(image.id, newAnnotations);
  };

  // Accept a single AI suggestion
  const handleAcceptSuggestion = async (sug: AISuggestion, e?: React.MouseEvent) => {
    e?.stopPropagation();

    // 1. Optimistically convert to confirmed bounding box locally
    const newBox: BoundingBox = {
      id: sug.id || `box_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      classId: sug.classId,
      x: sug.x,
      y: sug.y,
      width: sug.width,
      height: sug.height,
    };
    const updatedAnnotations = [...annotations, newBox];
    const updatedSuggestions = aiSuggestions.filter(s => s.id !== sug.id);

    setAnnotations(updatedAnnotations);
    setAiSuggestions(updatedSuggestions);
    setSelectedBoxId(newBox.id);

    // 2. Persist directly via backend acceptSuggestions endpoint
    try {
      const updatedImg = await api.acceptSuggestions(image.id, [sug.id]);
      if (onUpdateImage) {
        onUpdateImage(updatedImg);
      }
    } catch (err) {
      console.warn('Backend accept suggestion sync:', err);
      // Fallback
      onSave(image.id, updatedAnnotations);
    }
  };

  // Reject a single AI suggestion
  const handleRejectSuggestion = async (sugId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updatedSuggestions = aiSuggestions.filter(s => s.id !== sugId);
    setAiSuggestions(updatedSuggestions);

    try {
      const updatedImg = await api.rejectSuggestions(image.id, [sugId]);
      if (onUpdateImage) {
        onUpdateImage(updatedImg);
      }
    } catch (err) {
      console.warn('Backend reject suggestion sync:', err);
    }
  };

  // Bulk accept all AI suggestions
  const handleAcceptAllSuggestions = async () => {
    if (aiSuggestions.length === 0) return;

    const newBoxes: BoundingBox[] = aiSuggestions.map(sug => ({
      id: sug.id || `box_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      classId: sug.classId,
      x: sug.x,
      y: sug.y,
      width: sug.width,
      height: sug.height,
    }));
    const updatedAnnotations = [...annotations, ...newBoxes];
    setAnnotations(updatedAnnotations);
    setAiSuggestions([]);

    try {
      const updatedImg = await api.acceptSuggestions(image.id, []);
      if (onUpdateImage) {
        onUpdateImage(updatedImg);
      }
    } catch (err) {
      console.warn('Backend bulk accept suggestion sync:', err);
      onSave(image.id, updatedAnnotations);
    }
  };

  // Global keybind listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      const key = e.key;

      // Shift + A: Bulk Accept all AI suggestions
      if (e.shiftKey && (key.toLowerCase() === 'a')) {
        e.preventDefault();
        handleAcceptAllSuggestions();
        return;
      }

      // Class assignment via number keys (1 - 9)
      if (/^[1-9]$/.test(key)) {
        const index = parseInt(key, 10) - 1;
        if (index < classes.length) {
          const targetClassId = classes[index].id;

          if (selectedBoxId) {
            const updated = annotations.map(box => {
              if (box.id === selectedBoxId) {
                return { ...box, classId: targetClassId };
              }
              return box;
            });
            setAnnotations(updated);
            saveChanges(updated);
          } else {
            setActiveClassId(targetClassId);
          }
        }
      }

      // Delete selected box
      if ((key === 'Delete' || key === 'Backspace') && selectedBoxId) {
        e.preventDefault();
        const updated = annotations.filter(box => box.id !== selectedBoxId);
        setAnnotations(updated);
        setSelectedBoxId(null);
        saveChanges(updated);
      }

      // Deselect or Close via Escape
      if (key === 'Escape') {
        if (selectedBoxId) {
          setSelectedBoxId(null);
        } else {
          onClose();
        }
      }

      // Navigation via Arrow keys (ArrowLeft/ArrowRight or A/D keys)
      if (key === 'ArrowRight' || key.toLowerCase() === 'd') {
        if (hasNext) onNext();
      }
      if (key === 'ArrowLeft' || key.toLowerCase() === 'a') {
        if (hasPrev) onPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [classes, annotations, selectedBoxId, aiSuggestions, hasNext, hasPrev, onNext, onPrev, onClose]);

  // Handle pointer down on canvas/background to start drawing
  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (!containerRef.current) return;
    if (classes.length === 0) return;

    const target = e.target as HTMLElement;
    if (target.closest('.bbox-element') || target.closest('.resize-handle') || target.closest('.ai-sug-element')) {
      return;
    }

    setSelectedBoxId(null);

    const rect = containerRef.current.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / rect.width;
    const startY = (e.clientY - rect.top) / rect.height;

    setDrawingBox({ x: startX, y: startY, w: 0, h: 0 });
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, boxX: startX, boxY: startY, boxW: 0, boxH: 0 };
    activeActionRef.current = 'draw';

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
  };

  // Handle pointer down on bounding box or handle
  const handleBoxMouseDown = (box: BoundingBox, action: DragAction, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button !== 0) return;
    if (!containerRef.current) return;

    setSelectedBoxId(box.id);
    setActiveClassId(box.classId);

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      boxX: box.x,
      boxY: box.y,
      boxW: box.width,
      boxH: box.height,
    };
    activeActionRef.current = action;

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
  };

  // Consolidated Mouse Move processor
  const handleWindowMouseMove = (e: MouseEvent) => {
    if (!containerRef.current || !dragStartRef.current || !activeActionRef.current) return;

    const action = activeActionRef.current;
    const start = dragStartRef.current;
    const rect = containerRef.current.getBoundingClientRect();

    const deltaX = (e.clientX - start.mouseX) / rect.width;
    const deltaY = (e.clientY - start.mouseY) / rect.height;

    if (action === 'draw') {
      const currentX = (e.clientX - rect.left) / rect.width;
      const currentY = (e.clientY - rect.top) / rect.height;

      const clampedX = Math.max(0, Math.min(1, currentX));
      const clampedY = Math.max(0, Math.min(1, currentY));

      const x = Math.min(start.boxX, clampedX);
      const y = Math.min(start.boxY, clampedY);
      const w = Math.abs(start.boxX - clampedX);
      const h = Math.abs(start.boxY - clampedY);

      setDrawingBox({ x, y, w, h });
    } else {
      setAnnotations(prev =>
        prev.map(box => {
          if (box.id !== selectedBoxId) return box;

          let { x, y, width, height } = start;

          switch (action) {
            case 'move':
              x = Math.max(0, Math.min(1 - start.boxW, start.boxX + deltaX));
              y = Math.max(0, Math.min(1 - start.boxH, start.boxY + deltaY));
              break;

            case 'resize-tl':
              x = Math.max(0, Math.min(start.boxX + start.boxW - 0.01, start.boxX + deltaX));
              y = Math.max(0, Math.min(start.boxY + start.boxH - 0.01, start.boxY + deltaY));
              width = start.boxW - (x - start.boxX);
              height = start.boxH - (y - start.boxY);
              break;

            case 'resize-tr':
              y = Math.max(0, Math.min(start.boxY + start.boxH - 0.01, start.boxY + deltaY));
              width = Math.max(0.01, Math.min(1 - start.boxX, start.boxW + deltaX));
              height = start.boxH - (y - start.boxY);
              break;

            case 'resize-bl':
              x = Math.max(0, Math.min(start.boxX + start.boxW - 0.01, start.boxX + deltaX));
              width = start.boxW - (x - start.boxX);
              height = Math.max(0.01, Math.min(1 - start.boxY, start.boxH + deltaY));
              break;

            case 'resize-br':
              width = Math.max(0.01, Math.min(1 - start.boxX, start.boxW + deltaX));
              height = Math.max(0.01, Math.min(1 - start.boxY, start.boxH + deltaY));
              break;

            case 'resize-t':
              y = Math.max(0, Math.min(start.boxY + start.boxH - 0.01, start.boxY + deltaY));
              height = start.boxH - (y - start.boxY);
              break;

            case 'resize-b':
              height = Math.max(0.01, Math.min(1 - start.boxY, start.boxH + deltaY));
              break;

            case 'resize-l':
              x = Math.max(0, Math.min(start.boxX + start.boxW - 0.01, start.boxX + deltaX));
              width = start.boxW - (x - start.boxX);
              break;

            case 'resize-r':
              width = Math.max(0.01, Math.min(1 - start.boxX, start.boxW + deltaX));
              break;
          }

          return { ...box, x, y, width, height };
        })
      );
    }
  };

  // Consolidated Mouse Up processor
  const handleWindowMouseUp = () => {
    window.removeEventListener('mousemove', handleWindowMouseMove);
    window.removeEventListener('mouseup', handleWindowMouseUp);

    if (activeActionRef.current === 'draw' && drawingBox) {
      if (drawingBox.w > 0.01 && drawingBox.h > 0.01 && activeClassId) {
        const newBox: BoundingBox = {
          id: `box_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          classId: activeClassId,
          x: drawingBox.x,
          y: drawingBox.y,
          width: drawingBox.w,
          height: drawingBox.h,
        };

        const updated = [...annotations, newBox];
        setAnnotations(updated);
        setSelectedBoxId(newBox.id);
        saveChanges(updated);
      }
      setDrawingBox(null);
    } else if (activeActionRef.current && activeActionRef.current !== 'draw') {
      saveChanges(annotations);
    }

    activeActionRef.current = null;
    dragStartRef.current = null;
  };

  const getContrastYIQ = (hexcolor: string) => {
    const hex = hexcolor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const yiq = (r * 299 + g * 587 + b * 114) / 1000;
    return yiq >= 128 ? '#0C0E12' : '#ffffff';
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 bg-[#0B0D11] text-[#E6E9EF] flex flex-col md:flex-row overflow-hidden select-none font-sans"
      id="annotator-studio"
    >
      {/* ============================================================== */}
      {/* 1. LEFT SIDEBAR (LOWER CONTRAST / RECEDING)                    */}
      {/* ============================================================== */}
      <div className="w-full md:w-80 lg:w-84 bg-[#101317] border-r border-[#1F242C] flex flex-col justify-between shrink-0 order-2 md:order-1 h-1/3 md:h-full z-20">
        {/* Top: Section Header */}
        <div className="p-3.5 border-b border-[#1F242C] flex items-center justify-between shrink-0 bg-[#0E1014]">
          <div className="flex items-center space-x-2">
            <Tag size={14} className="text-[#3DA9FC]" />
            <h3 className="font-sans font-bold text-xs text-[#E6E9EF] tracking-tight">
              Annotation Studio
            </h3>
          </div>
          <Badge variant="neutral" size="sm">
            {annotations.length} {annotations.length === 1 ? 'Box' : 'Boxes'}
          </Badge>
        </div>

        {/* Scrollable Middle: Classes & Boxes List */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-4 custom-scrollbar">
          {/* Class Palette & Selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#5A6270] font-semibold">
                Drawing Class
              </span>
              <span className="font-mono text-[9px] text-[#5A6270]">Press 1-9</span>
            </div>

            <div className="space-y-1">
              {classes.map((cls, idx) => {
                const isActive = cls.id === activeClassId;
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() => {
                      setActiveClassId(cls.id);
                      if (selectedBoxId) {
                        const updated = annotations.map(box =>
                          box.id === selectedBoxId ? { ...box, classId: cls.id } : box
                        );
                        setAnnotations(updated);
                        saveChanges(updated);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#3DA9FC]/15 text-[#3DA9FC] border border-[#3DA9FC]/40 font-semibold'
                        : 'text-[#8B93A1] hover:text-[#E6E9EF] hover:bg-[#15191F] border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/10"
                        style={{ backgroundColor: cls.color }}
                      />
                      <span className="truncate">{cls.name}</span>
                    </div>

                    <kbd className="font-mono text-[9px] px-1 py-0.2 rounded bg-[#0A0C0F] border border-[#1F242C] text-[#5A6270]">
                      {idx + 1}
                    </kbd>
                  </button>
                );
              })}
            </div>
          </div>

          {/* AI Suggestions Review Panel (if pending) */}
          {aiSuggestions.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#1F242C]">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-[#FFB020]">
                  <Sparkles size={13} />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider">
                    AI Suggestions ({aiSuggestions.length})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleAcceptAllSuggestions}
                  className="font-mono text-[9px] text-[#00E5A3] hover:underline cursor-pointer flex items-center gap-0.5"
                  title="Accept all suggestions (Shift + A)"
                >
                  <CheckCheck size={11} />
                  <span>Accept All</span>
                </button>
              </div>

              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                {aiSuggestions.map(sug => {
                  const cls = classes.find(c => c.id === sug.classId);
                  const conf = Math.round(sug.confidence * 100);

                  return (
                    <div
                      key={sug.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-[#FFB020]/5 border border-dashed border-[#FFB020]/40 text-xs"
                    >
                      <div className="flex items-center space-x-2 truncate pr-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: cls?.color || '#FFB020' }}
                        />
                        <span className="font-medium text-[#E6E9EF] truncate">
                          {cls?.name || 'Class'}
                        </span>
                        <span className="font-mono text-[10px] text-[#FFB020] font-bold">
                          {conf}%
                        </span>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleAcceptSuggestion(sug, e)}
                          className="p-1 rounded bg-[#00E5A3]/20 hover:bg-[#00E5A3]/30 text-[#00E5A3] cursor-pointer"
                          title="Accept suggestion"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleRejectSuggestion(sug.id, e)}
                          className="p-1 rounded bg-[#FF4D4D]/20 hover:bg-[#FF4D4D]/30 text-[#FF4D4D] cursor-pointer"
                          title="Reject suggestion"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Confirmed Boxes Sidebar List */}
          <div className="space-y-2 pt-2 border-t border-[#1F242C]">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#5A6270] font-semibold">
              Staged Bounding Boxes
            </span>

            {annotations.length > 0 ? (
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {annotations.map((box, idx) => {
                  const cls = classes.find(c => c.id === box.classId);
                  const isSelected = box.id === selectedBoxId;

                  return (
                    <div
                      key={box.id}
                      onClick={() => setSelectedBoxId(box.id)}
                      onMouseEnter={() => setHoveredBoxId(box.id)}
                      onMouseLeave={() => setHoveredBoxId(null)}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-[#1F242C] text-[#E6E9EF] border border-[#3DA9FC]'
                          : 'bg-[#14171C] text-[#8B93A1] hover:text-[#E6E9EF] border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span className="font-mono text-[10px] text-[#5A6270]">#{idx + 1}</span>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: cls?.color || '#555' }}
                        />
                        <span className="font-medium truncate">{cls?.name || 'Unlabeled'}</span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const updated = annotations.filter(b => b.id !== box.id);
                          setAnnotations(updated);
                          if (selectedBoxId === box.id) setSelectedBoxId(null);
                          saveChanges(updated);
                        }}
                        className="text-[#5A6270] hover:text-[#FF4D4D] p-1 rounded transition-colors cursor-pointer"
                        title="Delete box"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-[11px] text-[#5A6270] italic">
                No bounding boxes drawn yet. Click & drag on image.
              </p>
            )}
          </div>
        </div>

        {/* Bottom Persistent Hotkey Legend (Visible at all times) */}
        <div className="p-3 border-t border-[#1F242C] bg-[#0C0E12] space-y-2 shrink-0">
          <div className="flex items-center justify-between text-[10px] font-mono text-[#5A6270] uppercase tracking-wider font-semibold">
            <span>Hotkey Legend</span>
            <span>Active</span>
          </div>

          <div className="grid grid-cols-2 gap-1.5 text-[10px] font-mono text-[#8B93A1]">
            <div className="flex items-center justify-between bg-[#14171C] px-1.5 py-0.5 rounded border border-[#1F242C]">
              <span>Class 1-9:</span>
              <kbd className="text-[#3DA9FC] font-bold">1..9</kbd>
            </div>
            <div className="flex items-center justify-between bg-[#14171C] px-1.5 py-0.5 rounded border border-[#1F242C]">
              <span>Delete Box:</span>
              <kbd className="text-[#FF4D4D] font-bold">DEL</kbd>
            </div>
            <div className="flex items-center justify-between bg-[#14171C] px-1.5 py-0.5 rounded border border-[#1F242C]">
              <span>Prev Image:</span>
              <kbd className="text-[#E6E9EF] font-bold">A / &larr;</kbd>
            </div>
            <div className="flex items-center justify-between bg-[#14171C] px-1.5 py-0.5 rounded border border-[#1F242C]">
              <span>Next Image:</span>
              <kbd className="text-[#E6E9EF] font-bold">D / &rarr;</kbd>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 2. MAIN CANVAS VIEWPORT (DOMINANT VISUAL ELEMENT)              */}
      {/* ============================================================== */}
      <div className="flex-1 flex flex-col overflow-hidden order-1 md:order-2 h-2/3 md:h-full bg-[#08090C]">
        {/* Top Control Bar */}
        <div className="h-12 bg-[#0E1014] border-b border-[#1F242C] px-4 flex items-center justify-between shrink-0 z-10">
          <div className="flex items-center space-x-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              leftIcon={<X size={14} />}
              id="exit-annotator-btn"
            >
              Exit Studio
            </Button>
            <div className="h-4 w-px bg-[#1F242C] hidden sm:block" />
            <span className="font-mono text-xs text-[#8B93A1] truncate max-w-xs" title={image.name}>
              {image.name}
            </span>
          </div>

          {/* Dataset Split Selector */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-1.5 bg-[#14171C] border border-[#1F242C] px-2 py-1 rounded-lg text-xs font-mono">
              <span className="text-[#5A6270] uppercase text-[10px]">Split:</span>
              <select
                value={image.split || 'unassigned'}
                onChange={(e) => onUpdateSplit?.(image.id, e.target.value as ImageSplit)}
                className="bg-transparent text-[#E6E9EF] focus:outline-none cursor-pointer"
              >
                <option value="unassigned" className="bg-[#14171C]">Unassigned</option>
                <option value="train" className="bg-[#14171C] text-[#3DA9FC]">Train</option>
                <option value="val" className="bg-[#14171C] text-[#FFB020]">Val</option>
                <option value="test" className="bg-[#14171C] text-slate-300">Test</option>
              </select>
            </div>

            {/* Prev / Next Image Navigation Controls */}
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={onPrev}
                disabled={!hasPrev}
                className={`p-1.5 rounded-lg border text-xs flex items-center space-x-1 transition-all ${
                  hasPrev
                    ? 'border-[#1F242C] bg-[#14171C] text-[#E6E9EF] hover:border-[#3DA9FC] cursor-pointer'
                    : 'border-[#1F242C]/40 text-[#5A6270] opacity-40 cursor-not-allowed'
                }`}
                title="Previous image (Key A)"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={onNext}
                disabled={!hasNext}
                className={`p-1.5 rounded-lg border text-xs flex items-center space-x-1 transition-all ${
                  hasNext
                    ? 'border-[#1F242C] bg-[#14171C] text-[#E6E9EF] hover:border-[#3DA9FC] cursor-pointer'
                    : 'border-[#1F242C]/40 text-[#5A6270] opacity-40 cursor-not-allowed'
                }`}
                title="Next image (Key D)"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Viewport Canvas Stage */}
        <div className="flex-1 relative flex items-center justify-center p-4 md:p-8 overflow-hidden bg-[#07080A]">
          {classes.length === 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-[#FFB020]/10 border border-[#FFB020]/40 px-4 py-2 rounded-lg flex items-center space-x-2 text-xs text-[#FFB020] shadow-elevation-mid">
              <HelpCircle size={14} />
              <span>Define classes in the left sidebar to start drawing bounding boxes.</span>
            </div>
          )}

          {/* Canvas Container */}
          <div
            ref={containerRef}
            onMouseDown={handleBackgroundMouseDown}
            className="relative max-h-full max-w-full shadow-elevation-high overflow-hidden cursor-crosshair select-none flex items-center justify-center border border-[#1F242C] rounded-lg"
            style={{ touchAction: 'none' }}
          >
            <img
              src={image.dataUrl}
              alt={image.name}
              draggable={false}
              className="max-h-full max-w-full object-contain pointer-events-none select-none"
            />

            {/* Render AI Suggestions (Pending State) */}
            {aiSuggestions.map(sug => {
              const cls = classes.find(c => c.id === sug.classId);
              const color = cls?.color || '#FFB020';
              const conf = Math.round(sug.confidence * 100);

              return (
                <div
                  key={`sug-${sug.id}`}
                  className="ai-sug-element absolute border-2 border-dashed border-[#FFB020] bg-[#FFB020]/10 z-20 transition-all"
                  style={{
                    left: `${sug.x * 100}%`,
                    top: `${sug.y * 100}%`,
                    width: `${sug.width * 100}%`,
                    height: `${sug.height * 100}%`,
                  }}
                >
                  {/* AI Suggestion Header Tag */}
                  <div className="absolute -top-5 left-0 px-1.5 py-0.5 rounded bg-[#FFB020] text-[#0C0E12] text-[9px] font-bold shadow-sm flex items-center space-x-1 pointer-events-none">
                    <Sparkles size={10} />
                    <span>{cls?.name || 'AI Detection'}</span>
                    <span className="font-mono">{conf}%</span>
                  </div>

                  {/* Accept / Reject Pill on Hover */}
                  <div className="absolute bottom-1 right-1 flex items-center space-x-1 bg-[#101317]/90 p-1 rounded border border-[#2A2F38] shadow-elevation-mid">
                    <button
                      type="button"
                      onClick={(e) => handleAcceptSuggestion(sug, e)}
                      className="px-1.5 py-0.5 rounded bg-[#00E5A3] text-[#0C0E12] text-[9px] font-bold hover:opacity-90 cursor-pointer"
                      title="Accept suggestion"
                    >
                      ✓ Accept
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleRejectSuggestion(sug.id, e)}
                      className="px-1.5 py-0.5 rounded bg-[#FF4D4D]/20 text-[#FF4D4D] text-[9px] font-bold hover:bg-[#FF4D4D]/30 cursor-pointer"
                      title="Reject suggestion"
                    >
                      ✗ Reject
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Render Existing Bounding Boxes */}
            {annotations.map((box, idx) => {
              const cls = classes.find(c => c.id === box.classId);
              const color = cls?.color || '#3DA9FC';
              const isSelected = box.id === selectedBoxId;
              const isHovered = box.id === hoveredBoxId;
              const textColor = getContrastYIQ(color);

              return (
                <div
                  key={box.id}
                  className={`bbox-element absolute border transition-all duration-75 ${
                    isSelected
                      ? 'border-dashed border-white shadow-[0_0_12px_rgba(255,255,255,0.4)] z-30'
                      : isHovered
                      ? 'border-solid border-white shadow-[0_0_8px_rgba(255,255,255,0.2)] z-30'
                      : 'z-20 hover:z-25'
                  }`}
                  style={{
                    left: `${box.x * 100}%`,
                    top: `${box.y * 100}%`,
                    width: `${box.width * 100}%`,
                    height: `${box.height * 100}%`,
                    borderColor: isSelected ? '#ffffff' : isHovered ? '#ffffff' : `${color}80`,
                    backgroundColor: isSelected
                      ? 'rgba(255,255,255,0.06)'
                      : isHovered
                      ? 'rgba(255,255,255,0.08)'
                      : 'rgba(0,0,0,0.12)',
                  }}
                  onMouseEnter={() => setHoveredBoxId(box.id)}
                  onMouseLeave={() => setHoveredBoxId(null)}
                  onMouseDown={(e) => handleBoxMouseDown(box, 'move', e)}
                >
                  {/* Corner Brackets */}
                  <div className="absolute inset-0 pointer-events-none">
                    <div
                      className="absolute top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xs"
                      style={{
                        width: isSelected ? '10px' : '8px',
                        height: isSelected ? '10px' : '8px',
                        borderColor: isSelected ? '#ffffff' : isHovered ? '#ffffff' : color,
                      }}
                    />
                    <div
                      className="absolute top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xs"
                      style={{
                        width: isSelected ? '10px' : '8px',
                        height: isSelected ? '10px' : '8px',
                        borderColor: isSelected ? '#ffffff' : isHovered ? '#ffffff' : color,
                      }}
                    />
                    <div
                      className="absolute bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xs"
                      style={{
                        width: isSelected ? '10px' : '8px',
                        height: isSelected ? '10px' : '8px',
                        borderColor: isSelected ? '#ffffff' : isHovered ? '#ffffff' : color,
                      }}
                    />
                    <div
                      className="absolute bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xs"
                      style={{
                        width: isSelected ? '10px' : '8px',
                        height: isSelected ? '10px' : '8px',
                        borderColor: isSelected ? '#ffffff' : isHovered ? '#ffffff' : color,
                      }}
                    />
                  </div>

                  {/* Class Label Tag */}
                  <div
                    className="absolute -top-5 left-0 px-2 py-0.5 rounded text-[9px] font-bold shadow-md flex items-center space-x-1 pointer-events-none select-none"
                    style={{ backgroundColor: color, color: textColor }}
                  >
                    <span>{cls?.name || 'Unlabeled'}</span>
                    <span className="opacity-75 font-mono">#{idx + 1}</span>
                  </div>

                  {/* 8 Resizing Handles when selected */}
                  {isSelected && (
                    <>
                      <div
                        className="resize-handle absolute w-8 h-8 -top-4 -left-4 flex items-center justify-center cursor-nwse-resize z-40 group/corner"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-tl', e)}
                        title="Resize top-left"
                      >
                        <div className="w-3 h-3 border-t-[3px] border-l-[3px] border-white group-hover/corner:border-[#3DA9FC] transition-colors" />
                      </div>
                      <div
                        className="resize-handle absolute w-8 h-8 -top-4 -right-4 flex items-center justify-center cursor-nesw-resize z-40 group/corner"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-tr', e)}
                        title="Resize top-right"
                      >
                        <div className="w-3 h-3 border-t-[3px] border-r-[3px] border-white group-hover/corner:border-[#3DA9FC] transition-colors" />
                      </div>
                      <div
                        className="resize-handle absolute w-8 h-8 -bottom-4 -left-4 flex items-center justify-center cursor-nesw-resize z-40 group/corner"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-bl', e)}
                        title="Resize bottom-left"
                      >
                        <div className="w-3 h-3 border-b-[3px] border-l-[3px] border-white group-hover/corner:border-[#3DA9FC] transition-colors" />
                      </div>
                      <div
                        className="resize-handle absolute w-8 h-8 -bottom-4 -right-4 flex items-center justify-center cursor-nwse-resize z-40 group/corner"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-br', e)}
                        title="Resize bottom-right"
                      >
                        <div className="w-3 h-3 border-b-[3px] border-r-[3px] border-white group-hover/corner:border-[#3DA9FC] transition-colors" />
                      </div>

                      {/* Edge Middle Handles */}
                      <div
                        className="resize-handle absolute w-8 h-4 -top-2 left-1/2 -translate-x-1/2 flex items-center justify-center cursor-ns-resize z-40"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-t', e)}
                      >
                        <div className="w-4 h-1 bg-white hover:bg-[#3DA9FC] rounded-full" />
                      </div>
                      <div
                        className="resize-handle absolute w-8 h-4 -bottom-2 left-1/2 -translate-x-1/2 flex items-center justify-center cursor-ns-resize z-40"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-b', e)}
                      >
                        <div className="w-4 h-1 bg-white hover:bg-[#3DA9FC] rounded-full" />
                      </div>
                      <div
                        className="resize-handle absolute w-4 h-8 top-1/2 -translate-y-1/2 -left-2 flex items-center justify-center cursor-ew-resize z-40"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-l', e)}
                      >
                        <div className="w-1 h-4 bg-white hover:bg-[#3DA9FC] rounded-full" />
                      </div>
                      <div
                        className="resize-handle absolute w-4 h-8 top-1/2 -translate-y-1/2 -right-2 flex items-center justify-center cursor-ew-resize z-40"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-r', e)}
                      >
                        <div className="w-1 h-4 bg-white hover:bg-[#3DA9FC] rounded-full" />
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Active Drawing Preview Box */}
            {drawingBox && (
              <div
                className="absolute border border-dashed border-[#3DA9FC] bg-[#3DA9FC]/15 z-30 pointer-events-none"
                style={{
                  left: `${drawingBox.x * 100}%`,
                  top: `${drawingBox.y * 100}%`,
                  width: `${drawingBox.w * 100}%`,
                  height: `${drawingBox.h * 100}%`,
                }}
              >
                <div className="absolute -top-5 left-0 px-2 py-0.5 rounded text-[9px] font-bold bg-[#3DA9FC] text-[#0C0E12] shadow-sm flex items-center space-x-1">
                  <span>Drawing...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
