import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Trash, 
  ChevronLeft, 
  ChevronRight, 
  HelpCircle, 
  Tag, 
  Maximize2,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ProjectClass, BoundingBox, ImageSplit } from '../types';
import { ProjectImage } from '../db';

interface AnnotatorProps {
  image: ProjectImage;
  classes: ProjectClass[];
  onSave: (imageId: string, annotations: BoundingBox[]) => void;
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
  onNext,
  onPrev,
  onClose,
  onUpdateSplit,
  hasNext,
  hasPrev
}: AnnotatorProps) {
  const [annotations, setAnnotations] = useState<BoundingBox[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [hoveredBoxId, setHoveredBoxId] = useState<string | null>(null);
  const [activeClassId, setActiveClassId] = useState<string>('');
  
  // Local state for temporary drawing
  const [drawingBox, setDrawingBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; boxX: number; boxY: number; boxW: number; boxH: number } | null>(null);
  const activeActionRef = useRef<DragAction | null>(null);

  // Load annotations from image
  useEffect(() => {
    setAnnotations(image.annotations || []);
    setSelectedBoxId(null);
  }, [image]);

  // Set default active class on launch or if classes list changes
  useEffect(() => {
    if (classes.length > 0) {
      // Keep existing active class if it's still in the current classes list, otherwise pick first
      const exists = classes.some(c => c.id === activeClassId);
      if (!exists) {
        setActiveClassId(classes[0].id);
      }
    } else {
      setActiveClassId('');
    }
  }, [classes, activeClassId]);

  // Auto-save on every state change of annotations
  const saveChanges = (newAnnotations: BoundingBox[]) => {
    onSave(image.id, newAnnotations);
  };

  // Global keybind listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcut interference if typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      const key = e.key;

      // Class assignment via number keys (1 - 9)
      if (/^[1-9]$/.test(key)) {
        const index = parseInt(key, 10) - 1;
        if (index < classes.length) {
          const targetClassId = classes[index].id;
          
          if (selectedBoxId) {
            // Update class of selected box
            const updated = annotations.map(box => {
              if (box.id === selectedBoxId) {
                return { ...box, classId: targetClassId };
              }
              return box;
            });
            setAnnotations(updated);
            saveChanges(updated);
          } else {
            // Update active drawing class
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
  }, [classes, annotations, selectedBoxId, hasNext, hasPrev, onNext, onPrev, onClose]);

  // Handle pointer down on canvas/background to start drawing
  const handleBackgroundMouseDown = (e: React.MouseEvent) => {
    // Only handle left clicks
    if (e.button !== 0) return;
    if (!containerRef.current) return;
    if (classes.length === 0) return; // Cannot draw without classes

    // If clicking on some resize handle, or box body, don't start a new box
    const target = e.target as HTMLElement;
    if (target.closest('.bbox-element') || target.closest('.resize-handle')) {
      return;
    }

    // Deselect current box
    setSelectedBoxId(null);

    const rect = containerRef.current.getBoundingClientRect();
    const startX = (e.clientX - rect.left) / rect.width;
    const startY = (e.clientY - rect.top) / rect.height;

    // Start drawing
    setDrawingBox({ x: startX, y: startY, w: 0, h: 0 });
    dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, boxX: startX, boxY: startY, boxW: 0, boxH: 0 };
    activeActionRef.current = 'draw';

    // Set up window listeners
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
    
    // Set active drawing class to matching box class for continuity
    setActiveClassId(box.classId);

    dragStartRef.current = { 
      mouseX: e.clientX, 
      mouseY: e.clientY, 
      boxX: box.x, 
      boxY: box.y, 
      boxW: box.width, 
      boxH: box.height 
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

    // Delta as percentage coordinates
    const deltaX = (e.clientX - start.mouseX) / rect.width;
    const deltaY = (e.clientY - start.mouseY) / rect.height;

    if (action === 'draw') {
      const currentX = (e.clientX - rect.left) / rect.width;
      const currentY = (e.clientY - rect.top) / rect.height;

      // Clamp between 0 and 1
      const clampedX = Math.max(0, Math.min(1, currentX));
      const clampedY = Math.max(0, Math.min(1, currentY));

      const x = Math.min(start.boxX, clampedX);
      const y = Math.min(start.boxY, clampedY);
      const w = Math.abs(start.boxX - clampedX);
      const h = Math.abs(start.boxY - clampedY);

      setDrawingBox({ x, y, w, h });
    } else {
      // Modify selected annotation
      setAnnotations(prev => prev.map(box => {
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

        return {
          ...box,
          x,
          y,
          width,
          height
        };
      }));
    }
  };

  const handleWindowMouseUp = () => {
    if (activeActionRef.current === 'draw' && drawingBox) {
      // Create new box if it has noticeable size
      if (drawingBox.w > 0.005 && drawingBox.h > 0.005 && activeClassId) {
        const newBox: BoundingBox = {
          id: `box-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          classId: activeClassId,
          x: drawingBox.x,
          y: drawingBox.y,
          width: drawingBox.w,
          height: drawingBox.h
        };

        const updated = [...annotations, newBox];
        setAnnotations(updated);
        setSelectedBoxId(newBox.id); // select newly created box
        saveChanges(updated);
      }
      setDrawingBox(null);
    } else if (selectedBoxId) {
      // Finalize the update in storage
      saveChanges(annotations);
    }

    // Clean up
    dragStartRef.current = null;
    activeActionRef.current = null;
    window.removeEventListener('mousemove', handleWindowMouseMove);
    window.removeEventListener('mouseup', handleWindowMouseUp);
  };

  const handleDeleteBox = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const updated = annotations.filter(box => box.id !== id);
    setAnnotations(updated);
    if (selectedBoxId === id) {
      setSelectedBoxId(null);
    }
    saveChanges(updated);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#06080B] text-[#E6E9EF] flex flex-col md:flex-row overflow-hidden select-none">
      
      {/* Workspace Sidebar (Classes and Box list) - Made darker and more receding to keep attention on canvas */}
      <div className="w-full md:w-80 bg-[#0C0E12] border-b md:border-b-0 md:border-r border-[#181C22] flex flex-col shrink-0 order-2 md:order-1 h-1/3 md:h-full transition-colors">
        {/* Active Class Header */}
        <div className="p-4 border-b border-[#181C22] flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Tag size={14} className="text-[#3DA9FC] opacity-75" />
            <h3 className="font-mono font-bold text-[10px] text-[#8B93A1]/70 uppercase tracking-wider">
              Classes
            </h3>
          </div>
          <button
            onClick={() => setShowShortcutsHelp(!showShortcutsHelp)}
            className="p-1.5 rounded-md text-[#8B93A1]/60 hover:text-[#E6E9EF] hover:bg-[#14171C] cursor-pointer transition-colors"
            title="All Keyboard Shortcuts Help"
          >
            <HelpCircle size={14} />
          </button>
        </div>

        {/* Classes List - Styled for easy clicking and quick reading */}
        <div className="p-3 border-b border-[#181C22] max-h-[35%] overflow-y-auto pr-1.5 custom-scrollbar">
          {classes.length === 0 ? (
            <div className="text-center py-6 bg-[#06080B] rounded-lg border border-dashed border-[#181C22] p-4">
              <p className="text-xs text-[#8B93A1]/70">
                Define classes first in the sidebar to start drawing labels.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-1 gap-1.5">
              {classes.map((cls, idx) => {
                const isActive = cls.id === activeClassId;
                const isSelectedBoxClass = selectedBoxId && annotations.find(b => b.id === selectedBoxId)?.classId === cls.id;
                
                return (
                  <button
                    key={cls.id}
                    onClick={() => {
                      if (selectedBoxId) {
                        // Reassign class to selected box
                        const updated = annotations.map(box => {
                          if (box.id === selectedBoxId) {
                            return { ...box, classId: cls.id };
                          }
                          return box;
                        });
                        setAnnotations(updated);
                        saveChanges(updated);
                      }
                      setActiveClassId(cls.id);
                    }}
                    // py-2.5 for larger touch and click targets to reduce fatigue
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium cursor-pointer transition-all border ${
                      isSelectedBoxClass 
                        ? 'border-[#00E5A3] bg-[#00E5A3]/10 text-[#00E5A3]'
                        : isActive 
                        ? 'border-[#3DA9FC] bg-[#3DA9FC]/10 text-[#3DA9FC]'
                        : 'border-[#181C22] bg-[#06080B]/40 text-[#8B93A1]/80 hover:border-[#3DA9FC]/40 hover:text-[#E6E9EF]'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span 
                        className="w-3 h-3 rounded-full shrink-0 transition-transform duration-100 group-hover:scale-110"
                        style={{ backgroundColor: cls.color }}
                      />
                      <span className="truncate font-sans font-medium">{cls.name}</span>
                    </div>
                    {idx < 9 && (
                      <kbd className="font-mono text-[9px] font-bold text-[#8B93A1]/60 bg-[#06080B] border border-[#181C22] px-1.5 py-0.5 rounded shadow-xs shrink-0">
                        {idx + 1}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Annotations List for active image - Designed to recede visually but remain easily accessible */}
        <div className="flex-grow flex flex-col overflow-hidden min-h-0">
          <div className="p-4 border-b border-[#181C22] flex items-center justify-between shrink-0 bg-[#0A0C10]">
            <span className="font-mono font-bold text-[10px] text-[#8B93A1]/70 uppercase tracking-wider">
              Boxes on this Image
            </span>
            <span className="font-mono text-[10px] text-[#3DA9FC]/80 bg-[#06080B] border border-[#181C22] px-2 py-0.5 rounded">
              {annotations.length}
            </span>
          </div>

          <div className="flex-grow overflow-y-auto p-3 space-y-1.5 scrollbar-thin">
            {annotations.length === 0 ? (
              <div className="text-center py-12 text-[#8B93A1]/50 text-xs">
                <Maximize2 size={16} className="mx-auto mb-2.5 text-[#8B93A1]/30" />
                No bounding boxes drawn.
                <p className="text-[10px] text-[#8B93A1]/40 mt-1">
                  Click and drag on the image to create annotations.
                </p>
              </div>
            ) : (
              annotations.map((box, idx) => {
                const cls = classes.find(c => c.id === box.classId);
                const isSelected = box.id === selectedBoxId;
                const isHovered = box.id === hoveredBoxId;
                
                return (
                  <div
                    key={box.id}
                    onClick={() => setSelectedBoxId(box.id)}
                    onMouseEnter={() => setHoveredBoxId(box.id)}
                    onMouseLeave={() => setHoveredBoxId(null)}
                    // py-2.5 and spacious border layout to limit click errors
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-xs cursor-pointer transition-all border ${
                      isSelected 
                        ? 'border-[#3DA9FC] bg-[#3DA9FC]/10 text-[#E6E9EF] shadow-xs' 
                        : isHovered
                          ? 'border-[#8B93A1]/80 bg-[#12161B] text-white'
                          : 'border-[#181C22] bg-[#06080B]/20 text-[#8B93A1] hover:border-[#181C22]/80'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <span 
                        className="w-4 h-4 rounded border flex items-center justify-center font-mono text-[9px] text-[#8B93A1] font-bold shrink-0 bg-[#06080B]"
                        style={{ borderColor: cls?.color || '#555' }}
                      >
                        {idx + 1}
                      </span>
                      <span className="font-medium text-[#E6E9EF] truncate">
                        {cls?.name || 'Unlabeled'}
                      </span>
                    </div>

                    <button
                      onClick={(e) => handleDeleteBox(box.id, e)}
                      className="p-1.5 rounded-md hover:bg-red-500/10 text-[#8B93A1]/60 hover:text-red-400 transition-colors shrink-0 cursor-pointer"
                      title="Delete Box"
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Compact Shortcuts Legend - quiet, simple, aligned to the bottom */}
        <div className="px-4 py-3.5 border-t border-[#181C22] bg-[#0A0C10] shrink-0" id="annotator-shortcuts-legend">
          <span className="text-[9px] uppercase font-mono tracking-wider text-[#8B93A1]/50 font-bold block mb-2">
            Navigation Tips
          </span>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-mono text-[#8B93A1]/70">
            <div className="flex items-center justify-between">
              <span>Next:</span>
              <kbd className="text-[9px] px-1 bg-[#06080B] border border-[#181C22] text-[#E6E9EF] rounded font-bold">D / &rarr;</kbd>
            </div>
            <div className="flex items-center justify-between">
              <span>Prev:</span>
              <kbd className="text-[9px] px-1 bg-[#06080B] border border-[#181C22] text-[#E6E9EF] rounded font-bold">A / &larr;</kbd>
            </div>
            <div className="flex items-center justify-between col-span-2 border-t border-[#181C22]/50 pt-1.5 mt-1">
              <span>Delete box:</span>
              <kbd className="text-[9px] px-1 bg-[#06080B] border border-[#181C22] text-red-400 rounded font-bold">DEL / BS</kbd>
            </div>
          </div>
        </div>

        {/* Active image metadata */}
        <div className="p-3 border-t border-[#181C22] bg-[#06080B] text-[10px] text-[#8B93A1]/60 shrink-0 flex items-center space-x-2">
          <Info size={11} className="text-[#3DA9FC] shrink-0 opacity-70" />
          <p className="truncate font-mono">
            Index: {image.name}
          </p>
        </div>
      </div>

      {/* Main Annotation Panel - Fully focused visual element */}
      <div className="flex-grow flex flex-col overflow-hidden order-1 md:order-2 h-2/3 md:h-full">
        {/* Upper Navigation Bar - Subtly recedes */}
        <div className="h-14 bg-[#0C0E12] border-b border-[#181C22] px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-4">
            <button
              onClick={onClose}
              className="px-3.5 py-2 bg-[#06080B] hover:bg-[#14171C] border border-[#181C22] rounded-lg text-xs font-semibold text-[#E6E9EF] hover:text-white transition-colors cursor-pointer flex items-center space-x-2"
            >
              <X size={13} className="text-[#8B93A1]" />
              <span>Exit Annotator</span>
            </button>
            <div className="hidden sm:block h-4 w-px bg-[#181C22]" />
            <h2 className="hidden sm:block text-xs text-[#8B93A1] font-mono font-medium truncate max-w-xs" title={image.name}>
              {image.name}
            </h2>
          </div>

          {/* Dataset Split Selector - with larger tap sizes */}
          <div className="flex items-center space-x-2.5">
            <span className="text-[10px] uppercase font-mono tracking-wider text-[#8B93A1]/60">Split:</span>
            <select
              value={image.split || 'unassigned'}
              onChange={(e) => onUpdateSplit?.(image.id, e.target.value as ImageSplit)}
              className="bg-[#06080B] border border-[#181C22] text-[#E6E9EF] text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#3DA9FC] cursor-pointer text-center font-mono font-medium"
            >
              <option value="unassigned" className="bg-[#0C0E12]">Unassigned</option>
              <option value="train" className="bg-[#0C0E12] text-[#3DA9FC] font-medium">Train</option>
              <option value="val" className="bg-[#0C0E12] text-[#FFB020] font-medium">Validation</option>
              <option value="test" className="bg-[#0C0E12] text-[#FF4D4D] font-medium">Test</option>
            </select>
          </div>

          {/* Nav arrows & hotkey cues */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onPrev}
              disabled={!hasPrev}
              className={`p-2 rounded-lg border text-[#E6E9EF] transition-all cursor-pointer flex items-center space-x-2 ${
                hasPrev 
                  ? 'border-[#181C22] bg-[#06080B] hover:bg-[#0C0E12] hover:text-white' 
                  : 'border-[#181C22]/30 text-[#8B93A1]/30 cursor-not-allowed opacity-30'
              }`}
              title="Previous Image (A / ArrowLeft)"
            >
              <ChevronLeft size={15} />
              <kbd className="hidden sm:inline-block text-[9px] font-mono bg-[#0C0E12] border border-[#181C22] px-1.5 py-0.2 rounded text-[#8B93A1] font-bold">A</kbd>
            </button>
            <span className="font-mono text-xs text-[#8B93A1]/50 px-1">
              Nav
            </span>
            <button
              onClick={onNext}
              disabled={!hasNext}
              className={`p-2 rounded-lg border text-[#E6E9EF] transition-all cursor-pointer flex items-center space-x-2 ${
                hasNext 
                  ? 'border-[#181C22] bg-[#06080B] hover:bg-[#0C0E12] hover:text-white' 
                  : 'border-[#181C22]/30 text-[#8B93A1]/30 cursor-not-allowed opacity-30'
              }`}
              title="Next Image (D / ArrowRight)"
            >
              <kbd className="hidden sm:inline-block text-[9px] font-mono bg-[#0C0E12] border border-[#181C22] px-1.5 py-0.2 rounded text-[#8B93A1] font-bold">D</kbd>
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        {/* Viewport Canvas Drawing Stage - absolute focus */}
        <div className="flex-grow relative bg-[#040507] flex items-center justify-center p-4 md:p-8 overflow-hidden">
          
          {classes.length === 0 && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-[#FFB020]/10 border border-[#FFB020]/35 px-4 py-2.5 rounded-lg flex items-center space-x-2 shadow-lg backdrop-blur-md animate-pulse">
              <HelpCircle className="text-[#FFB020]" size={15} />
              <p className="text-xs text-[#FFB020] font-sans font-medium">
                Add an Object Class in the sidebar first to enable bounding boxes drawing!
              </p>
            </div>
          )}

          {/* Staging environment */}
          <div 
            ref={containerRef}
            onMouseDown={handleBackgroundMouseDown}
            className="relative max-h-full max-w-full shadow-[0_0_50px_rgba(0,0,0,0.85)] overflow-hidden cursor-crosshair select-none bg-[#080B10]/40 flex items-center justify-center"
            style={{ touchAction: 'none' }}
          >
            {/* The Image */}
            <img
              src={image.dataUrl}
              alt={image.name}
              draggable={false}
              className="max-h-full max-w-full object-contain pointer-events-none select-none rounded border border-[#181C22]/70"
              referrerPolicy="no-referrer"
            />

            {/* Render Existing Bounding Boxes */}
            {annotations.map((box, idx) => {
              const cls = classes.find(c => c.id === box.classId);
              const color = cls?.color || '#555';
              const isSelected = box.id === selectedBoxId;
              const isHovered = box.id === hoveredBoxId;

              // Simple inline contrast check to make text badges always perfect!
              const getContrastYIQ = (hexcolor: string) => {
                const hex = hexcolor.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                const yiq = (r * 299 + g * 587 + b * 114) / 1000;
                return yiq >= 128 ? '#0C0E12' : '#ffffff';
              };
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
                    borderColor: isSelected ? '#ffffff' : isHovered ? '#ffffff' : `${color}60`, // subtle transparent border body
                    backgroundColor: isSelected 
                      ? 'rgba(255,255,255,0.05)' 
                      : isHovered 
                        ? 'rgba(255,255,255,0.08)' 
                        : 'rgba(0,0,0,0.15)'
                  }}
                  onMouseEnter={() => setHoveredBoxId(box.id)}
                  onMouseLeave={() => setHoveredBoxId(null)}
                  onMouseDown={(e) => handleBoxMouseDown(box, 'move', e)}
                >
                  {/* DESIGN SYSTEM CORNER BRACKETS: Echos visual language natively directly inside target boxes */}
                  <div className="absolute inset-0 pointer-events-none">
                    {/* Top-Left */}
                    <div 
                      className="absolute top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-sm transition-transform duration-100" 
                      style={{ width: isSelected ? '10px' : '8px', height: isSelected ? '10px' : '8px', borderColor: isSelected ? '#ffffff' : isHovered ? '#ffffff' : color }}
                    />
                    {/* Top-Right */}
                    <div 
                      className="absolute top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-sm transition-transform duration-100" 
                      style={{ width: isSelected ? '10px' : '8px', height: isSelected ? '10px' : '8px', borderColor: isSelected ? '#ffffff' : isHovered ? '#ffffff' : color }}
                    />
                    {/* Bottom-Left */}
                    <div 
                      className="absolute bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-sm transition-transform duration-100" 
                      style={{ width: isSelected ? '10px' : '8px', height: isSelected ? '10px' : '8px', borderColor: isSelected ? '#ffffff' : isHovered ? '#ffffff' : color }}
                    />
                    {/* Bottom-Right */}
                    <div 
                      className="absolute bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-sm transition-transform duration-100" 
                      style={{ width: isSelected ? '10px' : '8px', height: isSelected ? '10px' : '8px', borderColor: isSelected ? '#ffffff' : isHovered ? '#ffffff' : color }}
                    />
                  </div>

                  {/* Class Label Tag - legible, color-contrast guaranteed */}
                  <div 
                    className="absolute -top-5 left-0 px-2 py-0.5 rounded text-[9px] font-bold shadow-md backdrop-blur-md flex items-center space-x-1 pointer-events-none select-none transition-transform duration-100"
                    style={{ backgroundColor: color, color: textColor }}
                  >
                    <span>{cls?.name || 'Unlabeled'}</span>
                    <span className="opacity-70 font-mono">#{idx + 1}</span>
                  </div>

                  {/* RESIZING HANDLES: Sized generously (32px targets!) to eliminate click fatigue */}
                  {isSelected && (
                    <>
                      {/* Corner Handles - 32px diameter outer target, crisp small inner bracket */}
                      <div 
                        className="resize-handle absolute w-8 h-8 -top-4 -left-4 flex items-center justify-center cursor-nwse-resize z-40 group/corner"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-tl', e)}
                        title="Drag to resize top-left"
                      >
                        <div className="w-3.5 h-3.5 border-t-[3px] border-l-[3px] border-white transition-all duration-100 group-hover/corner:scale-125 group-hover/corner:border-[#3DA9FC] shadow-sm" />
                      </div>
                      <div 
                        className="resize-handle absolute w-8 h-8 -top-4 -right-4 flex items-center justify-center cursor-nesw-resize z-40 group/corner"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-tr', e)}
                        title="Drag to resize top-right"
                      >
                        <div className="w-3.5 h-3.5 border-t-[3px] border-r-[3px] border-white transition-all duration-100 group-hover/corner:scale-125 group-hover/corner:border-[#3DA9FC] shadow-sm" />
                      </div>
                      <div 
                        className="resize-handle absolute w-8 h-8 -bottom-4 -left-4 flex items-center justify-center cursor-nesw-resize z-40 group/corner"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-bl', e)}
                        title="Drag to resize bottom-left"
                      >
                        <div className="w-3.5 h-3.5 border-b-[3px] border-l-[3px] border-white transition-all duration-100 group-hover/corner:scale-125 group-hover/corner:border-[#3DA9FC] shadow-sm" />
                      </div>
                      <div 
                        className="resize-handle absolute w-8 h-8 -bottom-4 -right-4 flex items-center justify-center cursor-nwse-resize z-40 group/corner"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-br', e)}
                        title="Drag to resize bottom-right"
                      >
                        <div className="w-3.5 h-3.5 border-b-[3px] border-r-[3px] border-white transition-all duration-100 group-hover/corner:scale-125 group-hover/corner:border-[#3DA9FC] shadow-sm" />
                      </div>
                      
                      {/* Edge Handles - comfortable height/width pads with visual grab cue on hover */}
                      <div 
                        className="resize-handle absolute h-5 left-4 right-4 -top-2.5 cursor-ns-resize z-35 flex items-center justify-center bg-transparent group/edge"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-t', e)}
                        title="Resize top height"
                      >
                        <div className="h-1 w-10 rounded bg-white/60 opacity-0 group-hover/edge:opacity-100 transition-opacity duration-100 shadow-sm" />
                      </div>
                      <div 
                        className="resize-handle absolute h-5 left-4 right-4 -bottom-2.5 cursor-ns-resize z-35 flex items-center justify-center bg-transparent group/edge"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-b', e)}
                        title="Resize bottom height"
                      >
                        <div className="h-1 w-10 rounded bg-white/60 opacity-0 group-hover/edge:opacity-100 transition-opacity duration-100 shadow-sm" />
                      </div>
                      <div 
                        className="resize-handle absolute w-5 top-4 bottom-4 -left-2.5 cursor-ew-resize z-35 flex items-center justify-center bg-transparent group/edge"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-l', e)}
                        title="Resize left width"
                      >
                        <div className="w-1 h-10 rounded bg-white/60 opacity-0 group-hover/edge:opacity-100 transition-opacity duration-100 shadow-sm" />
                      </div>
                      <div 
                        className="resize-handle absolute w-5 top-4 bottom-4 -right-2.5 cursor-ew-resize z-35 flex items-center justify-center bg-transparent group/edge"
                        onMouseDown={(e) => handleBoxMouseDown(box, 'resize-r', e)}
                        title="Resize right width"
                      >
                        <div className="w-1 h-10 rounded bg-white/60 opacity-0 group-hover/edge:opacity-100 transition-opacity duration-100 shadow-sm" />
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            {/* Temporary Bounding Box with Design System Corner Brackets */}
            {drawingBox && (
              <div
                className="absolute border border-dashed border-[#3DA9FC] bg-[#3DA9FC]/5 z-40"
                style={{
                  left: `${drawingBox.x * 100}%`,
                  top: `${drawingBox.y * 100}%`,
                  width: `${drawingBox.w * 100}%`,
                  height: `${drawingBox.h * 100}%`
                }}
              >
                {/* Visual Corner Brackets that dynamically form while dragging */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-0 left-0 border-t-2 border-l-2 border-[#3DA9FC]" style={{ width: '8px', height: '8px' }} />
                  <div className="absolute top-0 right-0 border-t-2 border-r-2 border-[#3DA9FC]" style={{ width: '8px', height: '8px' }} />
                  <div className="absolute bottom-0 left-0 border-b-2 border-l-2 border-[#3DA9FC]" style={{ width: '8px', height: '8px' }} />
                  <div className="absolute bottom-0 right-0 border-b-2 border-r-2 border-[#3DA9FC]" style={{ width: '8px', height: '8px' }} />
                </div>
              </div>
            )}
          </div>

          {/* QUIET SHORTCUT REFERENCE BAR: Always-available, low-contrast, non-distracting at the bottom */}
          {classes.length > 0 && (
            <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-wrap items-center justify-center gap-2 pointer-events-none select-none">
              <span className="text-[9px] font-mono uppercase tracking-wider text-[#8B93A1]/40 mr-1.5">Hotkeys:</span>
              {classes.slice(0, 9).map((cls, idx) => (
                <div 
                  key={cls.id} 
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md border text-[10px] font-mono transition-all duration-150 bg-[#0C0E12]/80 backdrop-blur-md ${
                    cls.id === activeClassId
                      ? 'border-[#3DA9FC]/40 text-[#3DA9FC] shadow-[0_0_10px_rgba(61,169,252,0.15)] scale-[1.03] font-bold bg-[#0C0E12]'
                      : 'border-[#181C22]/50 text-[#8B93A1]/50'
                  }`}
                >
                  <kbd className={`px-1 rounded text-[9px] font-mono border ${
                    cls.id === activeClassId
                      ? 'bg-[#3DA9FC]/10 border-[#3DA9FC]/30 text-[#3DA9FC]'
                      : 'bg-[#06080B]/50 border-[#181C22] text-[#8B93A1]/50'
                  }`}>
                    {idx + 1}
                  </kbd>
                  <span className="truncate max-w-[90px]">{cls.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showShortcutsHelp && (
          <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowShortcutsHelp(false)}
              className="absolute inset-0 bg-[#040507]/90 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-[#0C0E12] border border-[#181C22] rounded-xl p-5 text-[#E6E9EF] z-10 space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-[#181C22]">
                <h3 className="font-mono font-bold text-xs text-[#E6E9EF] uppercase tracking-wider">
                  Keyboard Hotkeys
                </h3>
                <button
                  onClick={() => setShowShortcutsHelp(false)}
                  className="p-1 rounded text-[#8B93A1] hover:text-[#E6E9EF]"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="space-y-2.5 text-xs text-[#8B93A1]">
                <div className="flex justify-between items-center">
                  <span>Draw Box</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 bg-[#06080B] border border-[#181C22] text-[#E6E9EF] rounded">Click + Drag</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Deselect Box / Exit</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 bg-[#06080B] border border-[#181C22] text-[#E6E9EF] rounded">ESC</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Assign Class (1st to 9th)</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 bg-[#06080B] border border-[#181C22] text-[#E6E9EF] rounded">1 - 9</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Delete Selected Box</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 bg-[#06080B] border border-[#181C22] text-[#E6E9EF] rounded">DEL / Backspace</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Next Image</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 bg-[#06080B] border border-[#181C22] text-[#E6E9EF] rounded">D / ArrowRight</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Previous Image</span>
                  <span className="font-mono text-[10px] px-2 py-0.5 bg-[#06080B] border border-[#181C22] text-[#E6E9EF] rounded">A / ArrowLeft</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
