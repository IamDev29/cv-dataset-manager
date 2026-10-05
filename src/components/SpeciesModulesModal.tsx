import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Plus,
  Trash2,
  Layers,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Loader2,
  ExternalLink,
  Info,
  Tag,
  ShieldAlert,
} from 'lucide-react';
import { SpeciesModule, SpeciesModelStatus } from '../types';
import { api } from '../api';
import { Button, Card, Badge, Input } from './ui';
import CornerBrackets from './CornerBrackets';

export interface SpeciesModulesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onModulesChanged?: () => void;
}

export default function SpeciesModulesModal({
  isOpen,
  onClose,
  onModulesChanged,
}: SpeciesModulesModalProps) {
  const [modules, setModules] = useState<SpeciesModule[]>([]);
  const [modelsStatus, setModelsStatus] = useState<SpeciesModelStatus[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Form State
  const [slug, setSlug] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [configRelpath, setConfigRelpath] = useState<string>('config/');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [mods, statuses] = await Promise.all([
        api.listSpeciesModules(),
        api.getSpeciesModelsStatus().catch(() => []),
      ]);
      setModules(mods);
      setModelsStatus(statuses);
    } catch (err: any) {
      console.error('Failed to load species modules:', err);
      setError(err?.message || 'Failed to load species modules from server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
      setSuccessMsg(null);
      setError(null);
    }
  }, [isOpen]);

  const handleCreateModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug.trim() || !displayName.trim() || !configRelpath.trim()) {
      setError('Please fill in all fields (slug, display name, and config path).');
      return;
    }

    const cleanSlug = slug.trim().toLowerCase();
    if (!/^[a-z0-9_-]+$/.test(cleanSlug)) {
      setError('Slug must contain only lowercase letters, numbers, hyphens, and underscores.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const created = await api.createSpeciesModule({
        slug: cleanSlug,
        display_name: displayName.trim(),
        wildlife_config_relpath: configRelpath.trim(),
      });

      setSuccessMsg(
        `Successfully registered species module "${created.displayName}" (${created.slug})! Config file model_path has been configured.`
      );
      setSlug('');
      setDisplayName('');
      setConfigRelpath('config/');
      await loadData();
      onModulesChanged?.();
    } catch (err: any) {
      console.error('Failed to create species module:', err);
      setError(err?.message || 'Failed to register species module.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteModule = async (targetSlug: string) => {
    setDeletingSlug(targetSlug);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await api.deleteSpeciesModule(targetSlug);
      setSuccessMsg(res.message || `Species module "${targetSlug}" removed from registry.`);
      await loadData();
      onModulesChanged?.();
    } catch (err: any) {
      console.error('Failed to delete species module:', err);
      setError(err?.message || 'Failed to delete species module.');
    } finally {
      setDeletingSlug(null);
    }
  };

  if (!isOpen) return null;

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
        className="relative w-full max-w-3xl bg-[#1B1F26] border border-[#2A2F38] rounded-2xl shadow-elevation-high overflow-hidden p-6 z-10 text-[#E6E9EF] max-h-[90vh] flex flex-col"
        id="species-modules-modal"
      >
        <CornerBrackets />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-[#2A2F38] shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-[#14171C] border border-[#2A2F38] text-[#3DA9FC]">
              <Layers size={18} />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-sans font-bold text-base text-[#E6E9EF]">
                  Wildlife Species Modules Registry
                </h3>
                <Badge variant="primary" size="sm">
                  Dynamic Registry
                </Badge>
              </div>
              <p className="text-xs text-[#8B93A1] mt-0.5">
                Manage destination species modules for the wildlife census app. Boxel dynamically routes active models here.
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

        {/* Notification alerts */}
        <div className="pt-4 shrink-0 space-y-2">
          {error && (
            <div className="p-3 rounded-lg bg-[#FF4D4D]/10 border border-[#FF4D4D]/30 text-xs text-[#FF4D4D] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <AlertCircle size={15} className="shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => setError(null)}
                className="text-[#FF4D4D] hover:text-white cursor-pointer p-0.5"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-lg bg-[#00E5A3]/10 border border-[#00E5A3]/30 text-xs text-[#00E5A3] flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle2 size={15} className="shrink-0" />
                <span>{successMsg}</span>
              </div>
              <button
                type="button"
                onClick={() => setSuccessMsg(null)}
                className="text-[#00E5A3] hover:text-white cursor-pointer p-0.5"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        {/* Scrollable Content Body */}
        <div className="overflow-y-auto space-y-6 pt-4 pr-1 flex-1">
          {/* Registered Modules List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-sans font-semibold text-xs text-[#E6E9EF] uppercase tracking-wider font-mono">
                Registered Species ({modules.length})
              </h4>
              <span className="text-[11px] text-[#8B93A1]">
                Single source of truth for wildlife app deployment
              </span>
            </div>

            {isLoading ? (
              <div className="py-8 text-center text-xs font-mono text-[#8B93A1] flex items-center justify-center space-x-2">
                <Loader2 size={16} className="animate-spin text-[#3DA9FC]" />
                <span>Loading species modules...</span>
              </div>
            ) : modules.length === 0 ? (
              <div className="p-6 rounded-xl bg-[#14171C] border border-dashed border-[#2A2F38] text-center text-xs text-[#8B93A1]">
                No species modules registered yet. Register your first module below.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {modules.map((mod) => {
                  const statusInfo = modelsStatus.find((s) => s.speciesSlug === mod.slug);
                  const hasActive = mod.hasActiveModel || statusInfo?.hasActiveModel;

                  return (
                    <div
                      key={mod.id}
                      className="p-4 rounded-xl bg-[#14171C] border border-[#2A2F38] hover:border-[#3DA9FC]/40 transition-all space-y-2.5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center space-x-2.5">
                          <span className="font-semibold text-sm text-[#E6E9EF]">
                            {mod.displayName}
                          </span>
                          <span className="font-mono text-xs text-[#3DA9FC] bg-[#3DA9FC]/15 px-2 py-0.5 rounded font-bold">
                            {mod.slug}
                          </span>
                          {hasActive ? (
                            <Badge variant="success" size="sm">
                              <CheckCircle2 size={10} className="text-[#00E5A3]" /> Active Model Live
                            </Badge>
                          ) : (
                            <Badge variant="neutral" size="sm">
                              No Active Model
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center space-x-2 shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteModule(mod.slug)}
                            isLoading={deletingSlug === mod.slug}
                            disabled={Boolean(hasActive)}
                            title={
                              hasActive
                                ? 'Cannot delete while an active model is deployed. Deactivate the model first.'
                                : `Remove ${mod.displayName} from registry`
                            }
                            className="text-[#FF4D4D] hover:bg-[#FF4D4D]/15 text-xs"
                            leftIcon={<Trash2 size={13} />}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>

                      {/* Details row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-1 text-[#8B93A1]">
                        <div className="flex items-center space-x-1.5 truncate">
                          <FileCode size={13} className="text-[#8B93A1] shrink-0" />
                          <span className="truncate">
                            Config: <code className="text-[#E6E9EF]">{mod.wildlifeConfigRelpath}</code>
                          </span>
                        </div>
                        <div className="truncate">
                          Target: <code className="text-[#00E5A3]">shared_models/{mod.slug}/active.pt</code>
                        </div>
                      </div>

                      {/* Active Model Metadata Info if live */}
                      {statusInfo && statusInfo.metadata && (
                        <div className="p-2.5 rounded-lg bg-[#101317] border border-[#2A2F38]/60 text-[11px] font-mono text-[#8B93A1] flex flex-wrap gap-4">
                          <div>
                            Project: <span className="text-[#E6E9EF] font-semibold">{statusInfo.activeProjectName || statusInfo.metadata.project_name}</span>
                          </div>
                          <div>
                            Job: <span className="text-[#3DA9FC]">{statusInfo.activeJobId || statusInfo.metadata.job_id}</span>
                          </div>
                          <div>
                            Variant: <span className="text-[#E6E9EF]">{statusInfo.metadata.model_variant}</span>
                          </div>
                          {statusInfo.metadata.metrics?.mAP50 !== undefined && (
                            <div>
                              mAP@50: <span className="text-[#00E5A3] font-bold">{(statusInfo.metadata.metrics.mAP50 * 100).toFixed(1)}%</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add New Species Module Form */}
          <div className="p-5 rounded-xl bg-[#14171C] border border-[#2A2F38] space-y-4">
            <div className="flex items-center space-x-2">
              <Plus size={16} className="text-[#00E5A3]" />
              <h4 className="font-sans font-semibold text-sm text-[#E6E9EF]">
                Register New Species Module
              </h4>
            </div>
            <p className="text-xs text-[#8B93A1] leading-relaxed">
              Register a new species module by providing its unique slug, display name, and relative config JSON path inside <code className="text-[#E6E9EF]">wildlife/</code>. Boxel will automatically point that config file's <code className="text-[#00E5A3]">model_path</code> to the shared drop zone.
            </p>

            <form onSubmit={handleCreateModule} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Species Slug */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#8B93A1] uppercase font-mono">
                    Species Slug (Unique ID)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. elephant, leopard, sambar"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    className="w-full px-3 py-2 border border-[#2A2F38] rounded-lg text-xs font-mono bg-[#101317] text-[#E6E9EF] focus:outline-none focus:border-[#3DA9FC]"
                  />
                  <p className="text-[10px] text-[#8B93A1]">Lowercase letters, numbers, hyphens only.</p>
                </div>

                {/* Display Name */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-[#8B93A1] uppercase font-mono">
                    Display Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Asian Elephant Census"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-3 py-2 border border-[#2A2F38] rounded-lg text-xs bg-[#101317] text-[#E6E9EF] focus:outline-none focus:border-[#3DA9FC]"
                  />
                  <p className="text-[10px] text-[#8B93A1]">Human-readable label for the UI.</p>
                </div>
              </div>

              {/* Wildlife Config Relpath */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-[#8B93A1] uppercase font-mono">
                  Wildlife Config Relative Path
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. config/elephant_config.json"
                  value={configRelpath}
                  onChange={(e) => setConfigRelpath(e.target.value)}
                  className="w-full px-3 py-2 border border-[#2A2F38] rounded-lg text-xs font-mono bg-[#101317] text-[#E6E9EF] focus:outline-none focus:border-[#3DA9FC]"
                />
                <p className="text-[10px] text-[#8B93A1]">
                  Path relative to <code className="text-[#E6E9EF]">wildlife/</code>. Must point to an existing JSON file.
                </p>
              </div>

              <div className="flex items-center justify-end pt-2">
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={isSubmitting}
                  leftIcon={<Plus size={14} />}
                >
                  Register Species Module
                </Button>
              </div>
            </form>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-[#2A2F38] flex items-center justify-between text-xs text-[#8B93A1] shrink-0">
          <span className="font-mono text-[11px]">
            Architecture B: Shared Local File Convention
          </span>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
