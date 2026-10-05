import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Flame,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Layers,
  ArrowRight,
  Loader2,
  FileCode,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { Project, TrainingJob, SpeciesModule, SpeciesModelStatus } from '../types';
import { api } from '../api';
import { Button, Card, Badge } from './ui';
import CornerBrackets from './CornerBrackets';

export interface ActivateModelModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  job: TrainingJob | null;
  onActivated?: (updatedJob: TrainingJob) => void;
}

export default function ActivateModelModal({
  isOpen,
  onClose,
  project,
  job,
  onActivated,
}: ActivateModelModalProps) {
  const [speciesModules, setSpeciesModules] = useState<SpeciesModule[]>([]);
  const [speciesModelsStatus, setSpeciesModelsStatus] = useState<SpeciesModelStatus[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isActivating, setIsActivating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const classesCount = project.classes?.length || 0;
  const isMultiClass = classesCount > 1;
  const isNoClass = classesCount === 0;
  const isEligible = classesCount === 1 && job?.status === 'completed' && job?.hasPt;

  const loadModules = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [mods, statuses] = await Promise.all([
        api.listSpeciesModules(),
        api.getSpeciesModelsStatus().catch(() => []),
      ]);
      setSpeciesModules(mods);
      setSpeciesModelsStatus(statuses);
      if (mods.length > 0 && !selectedSlug) {
        setSelectedSlug(mods[0].slug);
      }
    } catch (err: any) {
      console.error('Failed to load species modules:', err);
      setError(err?.message || 'Failed to load species modules from server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadModules();
      setSuccessMsg(null);
      setError(null);
    }
  }, [isOpen, job?.id]);

  const handleActivate = async () => {
    if (!job || !selectedSlug || !isEligible) return;

    setIsActivating(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const updatedJob = await api.activateTrainingJob(project.id, job.id, selectedSlug);
      const selectedMod = speciesModules.find((m) => m.slug === selectedSlug);
      setSuccessMsg(
        `Successfully activated model for ${selectedMod?.displayName || selectedSlug}! Weights copied to shared_models/${selectedSlug}/active.pt.`
      );
      onActivated?.(updatedJob);
      setTimeout(() => {
        onClose();
      }, 1400);
    } catch (err: any) {
      console.error('Failed to activate model:', err);
      setError(err?.message || 'Failed to activate model.');
    } finally {
      setIsActivating(false);
    }
  };

  if (!isOpen || !job) return null;

  const selectedMod = speciesModules.find((m) => m.slug === selectedSlug);
  const currentActiveStatus = speciesModelsStatus.find((s) => s.speciesSlug === selectedSlug);
  const isReplacingOther = currentActiveStatus?.hasActiveModel && currentActiveStatus?.activeJobId !== job.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.7 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-[#040608]/85 backdrop-blur-xs"
      />

      {/* Modal Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.15 }}
        className="relative w-full max-w-xl bg-[#1B1F26] border border-[#2A2F38] rounded-2xl shadow-elevation-high overflow-hidden p-6 z-10 text-[#E6E9EF] max-h-[90vh] flex flex-col"
        id="activate-model-modal"
      >
        <CornerBrackets />

        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#2A2F38] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-[#00E5A3]/10 border border-[#00E5A3]/30 text-[#00E5A3]">
              <Sparkles size={18} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-sans font-bold text-base text-[#E6E9EF]">
                  Deploy Model to Wildlife App
                </h3>
                <Badge variant="success" size="sm">
                  Architecture B
                </Badge>
              </div>
              <p className="text-xs text-[#8B93A1] mt-0.5">
                Mark this model as the active production weights for wildlife census analysis.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8B93A1] hover:text-[#E6E9EF] hover:bg-[#14171C] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 pt-4 overflow-y-auto pr-1 flex-1">
          {/* Job summary pill */}
          <div className="p-3 rounded-xl bg-[#14171C] border border-[#2A2F38] flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center space-x-2">
              <span className="text-[#8B93A1]">Job:</span>
              <span className="font-bold text-[#E6E9EF]">{job.id}</span>
              <Badge variant="warning" size="sm">
                {job.modelVariant}
              </Badge>
            </div>
            <div className="text-[#8B93A1]">
              {job.epochs} epochs &middot; {job.imgsz}px
            </div>
          </div>

          {/* Alerts */}
          {error && (
            <div className="p-3.5 rounded-lg bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 text-xs text-[#FF4D4D] flex items-start space-x-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-semibold">Activation Error</p>
                <p className="text-[11px] leading-relaxed opacity-90">{error}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-lg bg-[#00E5A3]/10 border border-[#00E5A3]/30 text-xs text-[#00E5A3] flex items-center space-x-2.5">
              <CheckCircle2 size={16} className="shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* MULTI-CLASS VALIDATION WARNING */}
          {isMultiClass && (
            <div className="p-4 rounded-xl bg-[#FF4D4D]/10 border border-[#FF4D4D]/40 space-y-2.5 text-xs">
              <div className="flex items-start space-x-2.5 text-[#FF4D4D]">
                <ShieldAlert size={18} className="shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold text-sm text-[#FF4D4D]">
                    Multi-Class Model Cannot Be Activated
                  </p>
                  <p className="text-[#E6E9EF]/90 text-[11px] leading-relaxed">
                    Project <strong>"{project.name}"</strong> has <strong>{classesCount} classes</strong> defined ({project.classes?.map((c) => c.name).join(', ')}).
                  </p>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-[#101317] border border-[#FF4D4D]/20 text-[11px] text-[#8B93A1] space-y-1">
                <p className="font-semibold text-[#E6E9EF]">Why is this blocked?</p>
                <p className="leading-relaxed">
                  The wildlife desktop census application operates as a single-species detector and counts all detected bounding boxes indiscriminately regardless of class label. Activating a multi-class model would cause silent over-counting across different animal categories in census reports.
                </p>
                <p className="pt-1 text-[#FFB020] font-medium">
                  Recommendation: Train a model in a dedicated single-class project for this species.
                </p>
              </div>
            </div>
          )}

          {isNoClass && (
            <div className="p-4 rounded-xl bg-[#FFB020]/10 border border-[#FFB020]/30 text-xs text-[#FFB020] flex items-center space-x-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>Project has no classes defined.</span>
            </div>
          )}

          {/* SINGLE-CLASS SUCCESS / FORM */}
          {!isMultiClass && !isNoClass && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-[#00E5A3]/10 border border-[#00E5A3]/30 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2 text-[#00E5A3]">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span>
                    Single-Class Validated: <strong>{project.classes?.[0]?.name}</strong>
                  </span>
                </div>
                <span className="text-[10px] text-[#00E5A3] bg-[#00E5A3]/20 px-2 py-0.5 rounded font-bold">
                  ELIGIBLE
                </span>
              </div>

              {/* Dynamic Species Selector */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-[#E6E9EF]">
                  Select Target Species Module
                </label>

                {isLoading ? (
                  <div className="py-4 text-center text-xs font-mono text-[#8B93A1] flex items-center justify-center space-x-2">
                    <Loader2 size={14} className="animate-spin text-[#3DA9FC]" />
                    <span>Loading species registry...</span>
                  </div>
                ) : speciesModules.length === 0 ? (
                  <div className="p-3 rounded-lg bg-[#14171C] border border-[#2A2F38] text-xs text-[#8B93A1]">
                    No species modules found in registry.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    {speciesModules.map((mod) => {
                      const isSelected = selectedSlug === mod.slug;
                      const status = speciesModelsStatus.find((s) => s.speciesSlug === mod.slug);

                      return (
                        <div
                          key={mod.id}
                          onClick={() => setSelectedSlug(mod.slug)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'bg-[#00E5A3]/10 border-[#00E5A3] shadow-glow-mint'
                              : 'bg-[#14171C] border-[#2A2F38] hover:border-[#00E5A3]/40'
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center space-x-2">
                              <span className="font-semibold text-xs text-[#E6E9EF]">
                                {mod.displayName}
                              </span>
                              <span className="font-mono text-[10px] text-[#3DA9FC] bg-[#3DA9FC]/15 px-1.5 py-0.5 rounded font-bold">
                                {mod.slug}
                              </span>
                            </div>
                            <p className="text-[10px] font-mono text-[#8B93A1]">
                              Destination: <code>shared_models/{mod.slug}/active.pt</code>
                            </p>
                          </div>

                          <div className="shrink-0 flex items-center space-x-2">
                            {status?.hasActiveModel && (
                              <Badge variant="outline" size="sm">
                                Has Active Model
                              </Badge>
                            )}
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                                isSelected
                                  ? 'border-[#00E5A3] bg-[#00E5A3]'
                                  : 'border-[#5A6270] bg-transparent'
                              }`}
                            >
                              {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#14171C]" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Replacement Notice */}
              {isReplacingOther && selectedMod && (
                <div className="p-3 rounded-lg bg-[#FFB020]/10 border border-[#FFB020]/30 text-xs text-[#FFB020] flex items-start space-x-2">
                  <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    <strong>Notice:</strong> This action will replace the active model currently deployed for <strong>{selectedMod.displayName}</strong> (Job: {currentActiveStatus?.activeJobId}) with this new model.
                  </p>
                </div>
              )}

              {/* Deployment Details Box */}
              {selectedMod && (
                <div className="p-3.5 rounded-xl bg-[#101317] border border-[#2A2F38] space-y-2 text-xs font-mono">
                  <p className="font-semibold text-[#8B93A1] uppercase text-[10px] tracking-wider">
                    Deployment Specification
                  </p>
                  <div className="space-y-1 text-[11px] text-[#8B93A1]">
                    <div className="flex justify-between">
                      <span>Weights Drop:</span>
                      <span className="text-[#00E5A3] font-bold">shared_models/{selectedMod.slug}/active.pt</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sidecar Metadata:</span>
                      <span className="text-[#3DA9FC]">shared_models/{selectedMod.slug}/active.json</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Wildlife Config:</span>
                      <span className="text-[#E6E9EF]">{selectedMod.wildlifeConfigRelpath}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="pt-4 border-t border-[#2A2F38] flex items-center justify-end space-x-2.5 shrink-0">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={isActivating}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleActivate}
            disabled={!isEligible || !selectedSlug || isActivating}
            isLoading={isActivating}
            leftIcon={<Sparkles size={14} className="text-[#00E5A3]" />}
          >
            Deploy as Active Model
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
