import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderPlus,
  Trash2,
  ChevronLeft,
  Search,
  Clock,
  FileImage,
  ArrowUpDown,
  Plus,
  X,
  Database,
  Grid,
  Layers,
  Tag,
  Download,
  AlertCircle,
  Upload,
  AlertTriangle,
  Loader2,
  Trash,
  Sparkles,
  Sliders,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Project, BoundingBox, ImageSplit, ProjectImage, BatchImageItem } from './types';
import { api } from './api';
import Annotator from './components/Annotator';
import CornerBrackets from './components/CornerBrackets';
import StyleGuide from './components/StyleGuide';
import { Button, Card, Badge, StatTile } from './components/ui';
import NavRail, { ProjectNavSection } from './components/layout/NavRail';
import TopBar from './components/layout/TopBar';
import OverviewView from './components/views/OverviewView';
import ClassesImportView from './components/views/ClassesImportView';
import GalleryView from './components/views/GalleryView';
import PipelineView from './components/views/PipelineView';
import AIAssistView from './components/views/AIAssistView';
import DashboardView from './components/views/DashboardView';

const CLASS_COLORS = [
  '#FF4D4D', // Glowing Red
  '#3DA9FC', // Signature Signal Blue
  '#00E5A3', // Electric Mint
  '#FFB020', // Cyber Amber
  '#D846FF', // Neon Orchid
  '#FF5E97', // Hot Pink
  '#00F5FF', // Laser Cyan
  '#FF7A00', // Intense Orange
  '#9DFF00', // High-Vis Lime
  '#9E66FF', // Vivid Violet
  '#10B981', // Emerald Green
  '#FF9F1C', // Tangerine
];

// Helper to parse current location hash for route persistence
const parseHashRoute = () => {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash === 'styleguide' || window.location.search.includes('styleguide')) {
    return { projectId: null, section: 'overview' as ProjectNavSection, isStyleGuide: true };
  }
  const parts = hash.split('/');
  if (parts[0] === 'project' && parts[1]) {
    const projectId = parts[1];
    const section = (['overview', 'classes', 'gallery', 'annotate', 'pipeline', 'ai'].includes(parts[2])
      ? parts[2]
      : 'overview') as ProjectNavSection;
    return { projectId, section, isStyleGuide: false };
  }
  return { projectId: null, section: 'overview' as ProjectNavSection, isStyleGuide: false };
};

export default function App() {
  // Hash route initialization
  const initialRoute = parseHashRoute();

  // Backend projects state
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState<boolean>(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Navigation and routing state
  const [activeProjectId, setActiveProjectId] = useState<string | null>(initialRoute.projectId);
  const [activeSection, setActiveSection] = useState<ProjectNavSection>(initialRoute.section);
  const [showStyleGuide, setShowStyleGuide] = useState<boolean>(initialRoute.isStyleGuide);
  const [pipelineTab, setPipelineTab] = useState<'split' | 'augment' | 'export'>('split');

  // Modal/Form states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  // Search & Filter state for dashboard
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'created-desc' | 'created-asc' | 'name-asc' | 'images-desc'>('created-desc');

  // Sync route changes to URL hash
  const navigateTo = useCallback((projectId: string | null, section: ProjectNavSection = 'overview', isGuide = false) => {
    setActiveProjectId(projectId);
    setActiveSection(section);
    setShowStyleGuide(isGuide);

    if (isGuide) {
      window.location.hash = '/styleguide';
    } else if (projectId) {
      window.location.hash = `/project/${projectId}/${section}`;
    } else {
      window.location.hash = '/dashboard';
    }
  }, []);

  // Listen to browser forward/back / hashchange
  useEffect(() => {
    const handleHashChange = () => {
      const route = parseHashRoute();
      setActiveProjectId(route.projectId);
      setActiveSection(route.section);
      setShowStyleGuide(route.isStyleGuide);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Load projects and settings from backend on mount
  const loadProjects = async () => {
    setProjectsLoading(true);
    try {
      const data = await api.listProjects();
      setProjects(data);
      setApiError(null);
    } catch (err: any) {
      console.error('Failed to load projects from backend:', err);
      setApiError(err?.message || 'Failed to connect to backend server');
    } finally {
      setProjectsLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    api.getSettings()
      .then(s => {
        if (s.train_percent !== undefined) setTrainPercent(s.train_percent);
        if (s.val_percent !== undefined) setValPercent(s.val_percent);
        if (s.test_percent !== undefined) setTestPercent(s.test_percent);
        if (s.include_unannotated !== undefined) setIncludeUnannotated(s.include_unannotated);
        if (s.aug_flip !== undefined) setAugFlip(s.aug_flip);
        if (s.aug_rotation !== undefined) setAugRotation(s.aug_rotation);
        if (s.aug_brightness !== undefined) setAugBrightness(s.aug_brightness);
        if (s.aug_exposure !== undefined) setAugExposure(s.aug_exposure);
        if (s.aug_noise !== undefined) setAugNoise(s.aug_noise);
        if (s.aug_variants_count !== undefined) setAugVariantsCount(s.aug_variants_count);
      })
      .catch(err => console.error('Failed to load settings:', err));
  }, []);

  // Handle project creation
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      const newProject = await api.createProject(newProjectName.trim());
      setProjects(prev => [newProject, ...prev]);
      setNewProjectName('');
      setIsCreateOpen(false);
      setApiError(null);
      navigateTo(newProject.id, 'overview');
    } catch (err: any) {
      console.error('Failed to create project:', err);
      setApiError(err?.message || 'Failed to create project');
    }
  };

  // Handle project deletion
  const handleDeleteProject = async (id: string) => {
    try {
      await api.deleteProject(id);
      setProjects(prev => prev.filter(p => p.id !== id));
      if (activeProjectId === id) {
        navigateTo(null);
      }
      setProjectToDelete(null);
      setApiError(null);
    } catch (err: any) {
      console.error('Failed to delete project:', err);
      setApiError(err?.message || 'Failed to delete project');
    }
  };

  // Image handling states
  const [images, setImages] = useState<ProjectImage[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);
  const [skippedFiles, setSkippedFiles] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Video Frame Extraction states
  const [importMode, setImportMode] = useState<'images' | 'video'>('images');
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<{ duration: number; fps: number; totalFrames: number; width: number; height: number } | null>(null);
  const [extractionMode, setExtractionMode] = useState<'interval' | 'fps'>('interval');
  const [extractionInterval, setExtractionInterval] = useState<number>(2.0); // seconds per frame
  const [extractionFps, setExtractionFps] = useState<number>(1); // frames per second
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractionProgress, setExtractionProgress] = useState<{ current: number; total: number } | null>(null);
  const [extractionStatus, setExtractionStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [videoDragActive, setVideoDragActive] = useState<boolean>(false);

  // Dataset split partitioning states
  const [trainPercent, setTrainPercent] = useState<number>(70);
  const [valPercent, setValPercent] = useState<number>(20);
  const [testPercent, setTestPercent] = useState<number>(10);
  const [includeUnannotated, setIncludeUnannotated] = useState<boolean>(false);
  const [splitFilter, setSplitFilter] = useState<'all' | 'train' | 'val' | 'test' | 'unassigned'>('all');
  const [annotationFilter, setAnnotationFilter] = useState<'all' | 'annotated' | 'not-annotated'>('all');
  const [autoSplitStatus, setAutoSplitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Data Augmentation states
  const [augFlip, setAugFlip] = useState<boolean>(true);
  const [augRotation, setAugRotation] = useState<boolean>(true);
  const [augBrightness, setAugBrightness] = useState<boolean>(true);
  const [augExposure, setAugExposure] = useState<boolean>(true);
  const [augNoise, setAugNoise] = useState<boolean>(false);
  const [augVariantsCount, setAugVariantsCount] = useState<number>(2);
  const [augStatus, setAugStatus] = useState<{ type: 'success' | 'error' | 'loading'; message: string; progress?: number } | null>(null);

  // Save settings to backend automatically when they change
  useEffect(() => {
    api.saveSettings({
      train_percent: trainPercent,
      val_percent: valPercent,
      test_percent: testPercent,
      include_unannotated: includeUnannotated,
      aug_flip: augFlip,
      aug_rotation: augRotation,
      aug_brightness: augBrightness,
      aug_exposure: augExposure,
      aug_noise: augNoise,
      aug_variants_count: augVariantsCount,
    }).catch(err => console.error('Failed to sync settings with backend:', err));
  }, [
    trainPercent, valPercent, testPercent, includeUnannotated,
    augFlip, augRotation, augBrightness, augExposure, augNoise, augVariantsCount
  ]);

  // Export states
  const [exportStatus, setExportStatus] = useState<{ type: 'success' | 'error' | 'loading'; message: string; progress?: number } | null>(null);

  // Auto-Split partition algorithm via backend
  const handleAutoSplit = async () => {
    if (!activeProjectId) return;
    setAutoSplitStatus(null);
    const totalPercentVal = Number(trainPercent) + Number(valPercent) + Number(testPercent);
    if (totalPercentVal !== 100) {
      setAutoSplitStatus({
        type: 'error',
        message: `Percentages must sum to 100%. Current: ${totalPercentVal}%`
      });
      return;
    }

    if (images.length === 0) {
      setAutoSplitStatus({
        type: 'error',
        message: 'No images inside the current workspace to divide.'
      });
      return;
    }

    try {
      const updatedImages = await api.autoSplit(activeProjectId, {
        train_percent: trainPercent,
        val_percent: valPercent,
        test_percent: testPercent,
        include_unannotated: includeUnannotated,
      });

      setImages(updatedImages);
      const trainCount = updatedImages.filter(img => img.split === 'train').length;
      const valCount = updatedImages.filter(img => img.split === 'val').length;
      const testCount = updatedImages.filter(img => img.split === 'test').length;

      setAutoSplitStatus({
        type: 'success',
        message: `Split ${updatedImages.length} images successfully! (${trainCount} Train, ${valCount} Val, ${testCount} Test)`
      });
    } catch (err: any) {
      console.error('Failed to run auto-split:', err);
      setAutoSplitStatus({
        type: 'error',
        message: err?.message || 'Failed to partition dataset.'
      });
    }
  };

  // Manual split assignment via backend
  const handleManualSplitChange = async (imageId: string, split: ImageSplit) => {
    try {
      const updatedImage = await api.updateImageSplit(imageId, split);
      setImages(prev => prev.map(img => img.id === imageId ? updatedImage : img));
    } catch (err: any) {
      console.error('Failed to update manual split:', err);
      setApiError(err?.message || 'Failed to update image split');
    }
  };

  // Data Augmentation via backend
  const handleRunAugmentation = async () => {
    if (!activeProjectId) return;
    setAugStatus(null);
    const trainImages = images.filter(img => img.split === 'train' && !img.isAugmented);
    if (trainImages.length === 0) {
      setAugStatus({
        type: 'error',
        message: 'No original images found in the Training split. Assign some original images to "Train" first!'
      });
      return;
    }

    if (!augFlip && !augRotation && !augBrightness && !augExposure && !augNoise) {
      setAugStatus({
        type: 'error',
        message: 'Please enable at least one augmentation technique.'
      });
      return;
    }

    setAugStatus({
      type: 'loading',
      message: 'Generating augmented variants on server...',
      progress: 50,
    });

    try {
      const generatedImages = await api.runAugmentation(activeProjectId, {
        flip: augFlip,
        rotation: augRotation,
        brightness: augBrightness,
        exposure: augExposure,
        noise: augNoise,
        variants_count: augVariantsCount,
      });

      setImages(prev => [...prev, ...generatedImages]);

      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            imageCount: (p.imageCount || 0) + generatedImages.length
          };
        }
        return p;
      }));

      setAugStatus({
        type: 'success',
        message: `Successfully generated ${generatedImages.length} augmented variants! (${augVariantsCount} per original Training image)`
      });
    } catch (err: any) {
      console.error('Failed to augment images:', err);
      setAugStatus({
        type: 'error',
        message: err?.message || 'Failed to generate augmented images on server.'
      });
    }
  };

  const handleClearAugmented = async () => {
    if (!activeProjectId) return;
    setAugStatus(null);
    
    const augmentedImages = images.filter(img => img.isAugmented);
    if (augmentedImages.length === 0) return;

    try {
      setAugStatus({
        type: 'loading',
        message: 'Removing augmented images...',
      });

      const result = await api.clearAugmented(activeProjectId);
      setImages(prev => prev.filter(img => !img.isAugmented));

      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            imageCount: Math.max(0, (p.imageCount || 0) - result.deleted_count)
          };
        }
        return p;
      }));

      setAugStatus({
        type: 'success',
        message: `Successfully cleared ${result.deleted_count} augmented images!`
      });
    } catch (err: any) {
      console.error('Failed to clear augmented images:', err);
      setAugStatus({
        type: 'error',
        message: err?.message || 'Failed to clear augmented images from server.'
      });
    }
  };

  // Handle exporting dataset
  const handleExportDataset = async () => {
    if (!activeProject || !activeProjectId) return;
    setExportStatus(null);

    const exportableImages = images.filter(img => 
      img.split === 'train' || img.split === 'val' || img.split === 'test'
    );

    if (exportableImages.length === 0) {
      setExportStatus({
        type: 'error',
        message: 'No images assigned to train, val, or test splits. Assign some images to splits first!'
      });
      return;
    }

    const projectClasses = activeProject.classes || [];
    if (projectClasses.length === 0) {
      setExportStatus({
        type: 'error',
        message: 'No classes defined in this project. You must define classes before exporting!'
      });
      return;
    }

    setExportStatus({
      type: 'loading',
      message: 'Compiling YOLO dataset archive on server...',
      progress: 50,
    });

    try {
      const zipBlob = await api.exportDatasetBlob(activeProjectId);
      const downloadName = `${activeProject.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_yolo_dataset.zip`;
      const downloadUrl = URL.createObjectURL(zipBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = downloadUrl;
      downloadLink.download = downloadName;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      URL.revokeObjectURL(downloadUrl);

      setExportStatus({
        type: 'success',
        message: 'Successfully exported dataset as YOLO archive!'
      });
    } catch (err: any) {
      console.error('Failed to export dataset:', err);
      setExportStatus({
        type: 'error',
        message: err?.message || 'An error occurred while compiling your dataset archive.'
      });
    }
  };

  // Active annotator image state
  const [annotatorImageId, setAnnotatorImageId] = useState<string | null>(null);

  const annotatorImage = images.find(img => img.id === annotatorImageId);
  const annotatorIndex = annotatorImageId ? images.findIndex(img => img.id === annotatorImageId) : -1;
  const hasNext = annotatorIndex !== -1 && annotatorIndex < images.length - 1;
  const hasPrev = annotatorIndex > 0;

  const handleSaveAnnotations = async (imageId: string, annotations: BoundingBox[]) => {
    try {
      const updatedImage = await api.saveAnnotations(imageId, annotations);
      setImages(prev => prev.map(img => img.id === imageId ? updatedImage : img));
    } catch (err: any) {
      console.error('Failed to save annotations:', err);
      setApiError(err?.message || 'Failed to save annotations to server');
    }
  };

  const handleNextImage = () => {
    if (hasNext) {
      setAnnotatorImageId(images[annotatorIndex + 1].id);
    }
  };

  const handlePrevImage = () => {
    if (hasPrev) {
      setAnnotatorImageId(images[annotatorIndex - 1].id);
    }
  };

  // Load project images on switch
  useEffect(() => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setSelectedVideo(null);
    setVideoUrl(null);
    setVideoMetadata(null);
    setExtractionStatus(null);
    setImportMode('images');

    if (activeProjectId) {
      setImagesLoading(true);
      setSkippedFiles([]);
      api.listImages(activeProjectId)
        .then(res => {
          setImages(res);
          setApiError(null);
        })
        .catch(err => {
          console.error('Failed to load project images:', err);
          setApiError(err?.message || 'Failed to load project images from server');
        })
        .finally(() => setImagesLoading(false));
    } else {
      setImages([]);
    }
  }, [activeProjectId]);

  // Clean up video URL on unmount or URL change
  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  // Image file helper functions
  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const processFiles = async (files: FileList | File[]) => {
    if (!activeProjectId) return;
    
    const fileList = Array.from(files);
    const imageFiles = fileList.filter(file => file.type.startsWith('image/'));
    const skipped = fileList.filter(file => !file.type.startsWith('image/')).map(f => f.name);

    if (skipped.length > 0) {
      setSkippedFiles(prev => {
        const combined = [...prev, ...skipped];
        return Array.from(new Set(combined));
      });
    }

    if (imageFiles.length === 0) return;

    setImportProgress({ current: 0, total: imageFiles.length });

    try {
      const batchItems: BatchImageItem[] = [];

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        const dataUrl = await fileToDataUrl(file);
        batchItems.push({
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl,
          annotated: false,
          createdAt: Date.now() + i,
        });
        setImportProgress({ current: i + 1, total: imageFiles.length });
      }

      const newUploadedImages = await api.uploadImagesBatch(activeProjectId, batchItems);

      setImages(prev => [...prev, ...newUploadedImages]);

      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            imageCount: (p.imageCount || 0) + newUploadedImages.length
          };
        }
        return p;
      }));
      setApiError(null);
    } catch (err: any) {
      console.error('Error importing images:', err);
      setApiError(err?.message || 'Failed to upload images to backend');
    } finally {
      setTimeout(() => {
        setImportProgress(null);
      }, 1500);
    }
  };

  const handleDeleteImage = async (imageId: string) => {
    try {
      await api.deleteImage(imageId);
      setImages(prev => prev.filter(img => img.id !== imageId));
      
      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            imageCount: Math.max(0, (p.imageCount || 0) - 1)
          };
        }
        return p;
      }));
      setApiError(null);
    } catch (err: any) {
      console.error('Failed to delete image:', err);
      setApiError(err?.message || 'Failed to delete image from server');
    }
  };

  // Drag and drop event handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleVideoDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setVideoDragActive(true);
    } else if (e.type === 'dragleave') {
      setVideoDragActive(false);
    }
  };

  const handleVideoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setVideoDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('video/')) {
        handleVideoSelect(file);
      } else {
        setExtractionStatus({
          type: 'error',
          message: 'Please select a valid video file.'
        });
      }
    }
  };

  const handleVideoSelect = (file: File) => {
    if (!file.type.startsWith('video/')) {
      setExtractionStatus({
        type: 'error',
        message: 'Please select a valid video file.'
      });
      return;
    }
    
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    
    setExtractionStatus(null);
    setSelectedVideo(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    
    const video = document.createElement('video');
    video.src = url;
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    
    video.onloadedmetadata = () => {
      setVideoMetadata({
        duration: video.duration,
        fps: 30,
        totalFrames: Math.round(video.duration * 30),
        width: video.videoWidth,
        height: video.videoHeight,
      });
    };

    video.onerror = () => {
      setExtractionStatus({
        type: 'error',
        message: 'Failed to load video metadata. This format might not be supported by your browser.'
      });
    };
  };

  const clearSelectedVideo = () => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    setSelectedVideo(null);
    setVideoUrl(null);
    setVideoMetadata(null);
    setExtractionStatus(null);
  };

  const getExtractionTimestamps = (): number[] => {
    if (!videoMetadata) return [];
    const duration = videoMetadata.duration;
    const timestamps: number[] = [];
    
    if (extractionMode === 'interval') {
      const step = extractionInterval;
      for (let t = 0; t < duration; t += step) {
        timestamps.push(t);
      }
    } else {
      const step = 1 / extractionFps;
      for (let t = 0; t < duration; t += step) {
        timestamps.push(t);
      }
    }
    return timestamps;
  };

  const captureFrameWithTimeout = (video: HTMLVideoElement, time: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      let timeoutId: any;
      const onSeeked = () => {
        clearTimeout(timeoutId);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 360;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            resolve(dataUrl);
          } else {
            reject(new Error('Failed to get canvas 2d context'));
          }
        } catch (err) {
          reject(err);
        } finally {
          video.removeEventListener('seeked', onSeeked);
        }
      };
      
      timeoutId = setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        reject(new Error(`Seek timeout at ${time}s`));
      }, 8000);
      
      video.addEventListener('seeked', onSeeked);
      video.currentTime = time;
    });
  };

  const handleExtractFrames = async () => {
    if (!activeProjectId || !selectedVideo || !videoUrl) return;
    
    setIsExtracting(true);
    setExtractionStatus(null);
    const timestamps = getExtractionTimestamps();
    const total = timestamps.length;
    setExtractionProgress({ current: 0, total });
    
    const video = document.createElement('video');
    video.src = videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video file for extraction'));
        setTimeout(() => reject(new Error('Video load timeout')), 10000);
      });
      
      const baseName = selectedVideo.name.replace(/\.[^/.]+$/, '');
      const batchItems: BatchImageItem[] = [];
      
      for (let i = 0; i < total; i++) {
        const timestamp = timestamps[i];
        const dataUrl = await captureFrameWithTimeout(video, timestamp);
        
        const mins = Math.floor(timestamp / 60);
        const secs = Math.floor(timestamp % 60);
        const ms = Math.round((timestamp % 1) * 1000);
        const timestampStr = `${mins}m${secs.toString().padStart(2, '0')}s_${ms.toString().padStart(3, '0')}ms`;
        
        const name = `${baseName}_frame_${(i + 1).toString().padStart(3, '0')}_${timestampStr}.jpg`;
        const base64Content = dataUrl.split(',')[1] || '';
        const size = Math.round(base64Content.length * 0.75);
        
        batchItems.push({
          name,
          size,
          type: 'image/jpeg',
          dataUrl,
          annotated: false,
          createdAt: Date.now() + i,
        });
        
        setExtractionProgress({ current: i + 1, total });
      }
      
      const newImages = await api.uploadImagesBatch(activeProjectId, batchItems);

      setImages(prev => [...prev, ...newImages]);
      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            imageCount: (p.imageCount || 0) + newImages.length
          };
        }
        return p;
      }));
      
      setExtractionStatus({
        type: 'success',
        message: `Successfully extracted and added ${newImages.length} frames.`
      });
      
      setSelectedVideo(null);
      setVideoUrl(null);
      setVideoMetadata(null);
      
    } catch (err: any) {
      console.error('Extraction error:', err);
      setExtractionStatus({
        type: 'error',
        message: `Failed to extract frames: ${err?.message || 'Unknown error'}`
      });
    } finally {
      setIsExtracting(false);
      setExtractionProgress(null);
      video.src = '';
      video.load();
    }
  };

  // Classes state & handlers
  const [newClassName, setNewClassName] = useState('');
  const [classError, setClassError] = useState<string | null>(null);

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId || !newClassName.trim()) return;

    const trimmedName = newClassName.trim();
    const currentClasses = activeProject?.classes || [];

    if (currentClasses.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      setClassError('Class name already exists');
      return;
    }

    setClassError(null);
    const color = CLASS_COLORS[currentClasses.length % CLASS_COLORS.length];

    try {
      const newClass = await api.addClass(activeProjectId, trimmedName, color);
      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            classes: [...(p.classes || []), newClass]
          };
        }
        return p;
      }));
      setNewClassName('');
    } catch (err: any) {
      console.error('Failed to add class:', err);
      setClassError(err?.message || 'Failed to add class');
    }
  };

  const handleDeleteClass = async (classId: string) => {
    if (!activeProjectId) return;
    try {
      await api.deleteClass(activeProjectId, classId);
      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            classes: (p.classes || []).filter(c => c.id !== classId)
          };
        }
        return p;
      }));
    } catch (err: any) {
      console.error('Failed to delete class:', err);
      setApiError(err?.message || 'Failed to delete class');
    }
  };

  // Find currently active project
  const activeProject = projects.find(p => p.id === activeProjectId);

  // Total metrics
  const totalProjects = projects.length;
  const totalImages = projects.reduce((acc, p) => acc + p.imageCount, 0);

  // Filter and Sort projects for Dashboard
  const filteredProjects = projects.filter(project => 
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sortBy === 'created-desc') return b.createdAt - a.createdAt;
    if (sortBy === 'created-asc') return a.createdAt - b.createdAt;
    if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
    if (sortBy === 'images-desc') return b.imageCount - a.imageCount;
    return 0;
  });

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Filtered gallery images
  const filteredGalleryImages = images.filter(img => {
    const matchesSplit = splitFilter === 'all' || 
      (splitFilter === 'unassigned' ? (!img.split || img.split === 'unassigned') : img.split === splitFilter);
      
    const hasBoxes = img.annotations && img.annotations.length > 0;
    const matchesAnnotation = annotationFilter === 'all' || 
      (annotationFilter === 'annotated' ? hasBoxes : !hasBoxes);
      
    return matchesSplit && matchesAnnotation;
  });

  // Action to launch annotator on first image
  const handleOpenAnnotatorFirstImage = () => {
    if (images.length === 0) {
      navigateTo(activeProjectId, 'classes');
      return;
    }
    const unannotated = images.find(img => !img.annotations || img.annotations.length === 0);
    setAnnotatorImageId(unannotated ? unannotated.id : images[0].id);
  };

  // If user navigates directly to Annotate section via rail
  const handleSelectSection = (section: ProjectNavSection) => {
    if (section === 'annotate') {
      handleOpenAnnotatorFirstImage();
    }
    navigateTo(activeProjectId, section);
  };

  // Style Guide View
  if (showStyleGuide) {
    return <StyleGuide onClose={() => navigateTo(activeProjectId, activeSection, false)} />;
  }

  return (
    <div className="min-h-screen bg-[#14171C] ambient-bg text-[#E6E9EF] flex antialiased overflow-x-hidden">
      {/* Left Navigation Rail (Visible when in a project workspace) */}
      {activeProjectId && activeProject && (
        <NavRail
          activeSection={activeSection}
          onSelectSection={handleSelectSection}
          onReturnToDashboard={() => navigateTo(null)}
          projectName={activeProject.name}
          imageCount={images.length}
          classCount={(activeProject.classes || []).length}
          annotatedCount={images.filter(img => img.annotations && img.annotations.length > 0).length}
        />
      )}

      {/* Main Content Area with Persistent TopBar */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <TopBar
          projectName={activeProject?.name}
          projectId={activeProject?.id}
          activeSectionTitle={activeSection}
          onOpenStyleGuide={() => navigateTo(activeProjectId, activeSection, true)}
          onNavigateHome={() => navigateTo(null)}
        />

        <main className="flex-grow max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8 flex flex-col">
          {apiError && (
            <div className="mb-6 bg-red-950/30 border border-red-900/50 rounded-xl p-4 flex items-start justify-between text-red-400">
              <div className="flex items-start space-x-3">
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold">Backend Error</p>
                  <p className="text-[11px] text-red-300/80 mt-0.5">{apiError}</p>
                </div>
              </div>
              <button
                onClick={() => setApiError(null)}
                className="text-red-400 hover:text-red-200 p-1 rounded-md hover:bg-red-900/30 cursor-pointer"
                title="Dismiss error"
              >
                <X size={14} />
              </button>
            </div>
          )}

          <AnimatePresence mode="wait">
            {!activeProjectId ? (
              <DashboardView
                projects={projects}
                projectsLoading={projectsLoading}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                sortBy={sortBy}
                setSortBy={setSortBy}
                onOpenCreateModal={() => setIsCreateOpen(true)}
                onSelectProjectToDelete={(project) => setProjectToDelete(project)}
                onSelectProject={(projectId) => navigateTo(projectId, 'overview')}
              />
            ) : (
              /* ============================================================== */
              /*                 PROJECT WORKSPACE SECTION VIEWS                */
              /* ============================================================== */
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.15 }}
                className="w-full flex-grow flex flex-col"
              >
                {/* 1. OVERVIEW VIEW */}
                {activeSection === 'overview' && activeProject && (
                  <OverviewView
                    project={activeProject}
                    images={images}
                    onNavigateSection={(sec) => navigateTo(activeProjectId, sec)}
                    onOpenAnnotatorFirstImage={handleOpenAnnotatorFirstImage}
                  />
                )}

                {/* 2. CLASSES & IMPORT VIEW */}
                {activeSection === 'classes' && activeProject && (
                  <ClassesImportView
                    project={activeProject}
                    onAddClass={handleAddClass}
                    onDeleteClass={handleDeleteClass}
                    newClassName={newClassName}
                    setNewClassName={setNewClassName}
                    classError={classError}
                    setClassError={setClassError}
                    onDropFiles={handleDrop}
                    onDragEnterOver={handleDrag}
                    onDragLeave={handleDrag}
                    dragActive={dragActive}
                    onFileInputChange={(e) => e.target.files && processFiles(e.target.files)}
                    importProgress={importProgress}
                    skippedFiles={skippedFiles}
                    importMode={importMode}
                    setImportMode={setImportMode}
                    selectedVideo={selectedVideo}
                    videoUrl={videoUrl}
                    videoMetadata={videoMetadata}
                    extractionMode={extractionMode}
                    setExtractionMode={setExtractionMode}
                    extractionInterval={extractionInterval}
                    setExtractionInterval={setExtractionInterval}
                    extractionFps={extractionFps}
                    setExtractionFps={setExtractionFps}
                    isExtracting={isExtracting}
                    extractionProgress={extractionProgress}
                    extractionStatus={extractionStatus}
                    onExtractFrames={handleExtractFrames}
                    onVideoDrop={handleVideoDrop}
                    onVideoDrag={handleVideoDrag}
                    videoDragActive={videoDragActive}
                    onVideoFileInput={(e) => e.target.files && e.target.files[0] && handleVideoSelect(e.target.files[0])}
                    onClearVideo={clearSelectedVideo}
                  />
                )}

                {/* 3. GALLERY VIEW */}
                {activeSection === 'gallery' && activeProject && (
                  <GalleryView
                    project={activeProject}
                    images={images}
                    filteredImages={filteredGalleryImages}
                    splitFilter={splitFilter}
                    setSplitFilter={setSplitFilter}
                    annotationFilter={annotationFilter}
                    setAnnotationFilter={setAnnotationFilter}
                    onSelectImageToAnnotate={(id) => setAnnotatorImageId(id)}
                    onDeleteImage={handleDeleteImage}
                    onManualSplitChange={handleManualSplitChange}
                    onNavigateToImport={() => navigateTo(activeProjectId, 'classes')}
                  />
                )}

                {/* 4. PIPELINE VIEW */}
                {activeSection === 'pipeline' && activeProject && (
                  <PipelineView
                    project={activeProject}
                    images={images}
                    pipelineTab={pipelineTab}
                    setPipelineTab={setPipelineTab}
                    trainPercent={trainPercent}
                    setTrainPercent={setTrainPercent}
                    valPercent={valPercent}
                    setValPercent={setValPercent}
                    testPercent={testPercent}
                    setTestPercent={setTestPercent}
                    includeUnannotated={includeUnannotated}
                    setIncludeUnannotated={setIncludeUnannotated}
                    autoSplitStatus={autoSplitStatus}
                    onAutoSplit={handleAutoSplit}
                    augFlip={augFlip}
                    setAugFlip={setAugFlip}
                    augRotation={augRotation}
                    setAugRotation={setAugRotation}
                    augBrightness={augBrightness}
                    setAugBrightness={setAugBrightness}
                    augExposure={augExposure}
                    setAugExposure={setAugExposure}
                    augNoise={augNoise}
                    setAugNoise={setAugNoise}
                    augVariantsCount={augVariantsCount}
                    setAugVariantsCount={setAugVariantsCount}
                    augStatus={augStatus}
                    onRunAugmentation={handleRunAugmentation}
                    onClearAugmented={handleClearAugmented}
                    exportStatus={exportStatus}
                    onExportDataset={handleExportDataset}
                  />
                )}

                {/* 5. AI ASSIST VIEW */}
                {activeSection === 'ai' && activeProject && (
                  <AIAssistView
                    project={activeProject}
                    images={images}
                    onNavigateToAnnotate={handleOpenAnnotatorFirstImage}
                    onRefreshImages={() => {
                      if (activeProjectId) {
                        api.listImages(activeProjectId).then(setImages).catch(console.error);
                      }
                    }}
                    onUpdateImages={(updatedImgs) => {
                      const map = new Map(updatedImgs.map(i => [i.id, i]));
                      setImages(prev => prev.map(img => map.get(img.id) || img));
                    }}
                    onUpdateProjectClasses={(newClasses) => {
                      if (newClasses && activeProjectId) {
                        setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, classes: newClasses } : p));
                      }
                    }}
                  />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Footer */}
        <footer className="border-t border-[#2A2F38] bg-[#101317] py-3.5 px-6 flex flex-col sm:flex-row items-center justify-between font-mono text-[10px] text-[#5A6270] gap-2">
          <div className="flex items-center gap-1.5">
            <span className="font-sans font-bold text-[#8B93A1]">boxel.</span>
            <span>&copy; 2026. Precision CV Studio Sandbox.</span>
          </div>
          <div className="flex items-center space-x-3">
            <span>Storage: SQLite Server Mode</span>
            <span>&middot;</span>
            <span>v2.0.0</span>
          </div>
        </footer>
      </div>

      {/* CREATE PROJECT MODAL */}
      <AnimatePresence>
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateOpen(false)}
              className="absolute inset-0 bg-[#040608]/85 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-md bg-[#1B1F26] border border-[#2A2F38] rounded-xl shadow-elevation-high overflow-hidden p-6 z-10 text-[#E6E9EF]"
              id="create-project-modal"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#2A2F38]">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-md bg-[#14171C] border border-[#2A2F38] text-[#3DA9FC]">
                    <FolderPlus size={16} />
                  </div>
                  <h3 className="font-sans font-semibold text-base text-[#E6E9EF]">
                    Create New Project
                  </h3>
                </div>
                <button
                  onClick={() => setIsCreateOpen(false)}
                  className="p-1 rounded-md text-[#8B93A1] hover:text-[#E6E9EF] transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateProject} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="project-name-input" className="block text-xs font-semibold text-[#8B93A1] uppercase tracking-wider font-mono mb-1.5">
                    Project Name
                  </label>
                  <input
                    id="project-name-input"
                    type="text"
                    required
                    placeholder="e.g. Traffic Light Annotations"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-[#2A2F38] rounded-lg text-sm bg-[#101317] text-[#E6E9EF] focus:bg-[#14171C] focus:outline-none focus:ring-2 focus:ring-[#3DA9FC] focus:border-transparent transition-all"
                    autoFocus
                  />
                  <p className="text-[11px] text-[#8B93A1] mt-1.5 leading-relaxed font-sans">
                    Choose a direct, clear name reflecting the class of images or annotations you will make.
                  </p>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsCreateOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    id="submit-project-btn"
                  >
                    Create Project
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE PROJECT MODAL */}
      <AnimatePresence>
        {projectToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setProjectToDelete(null)}
              className="absolute inset-0 bg-[#040608]/85 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-md bg-[#1B1F26] border border-[#2A2F38] rounded-xl shadow-elevation-high overflow-hidden p-6 z-10 text-[#E6E9EF]"
              id="delete-confirmation-modal"
            >
              <div className="flex items-start space-x-3.5">
                <div className="p-2.5 rounded-full bg-[#FF4D4D]/15 text-[#FF4D4D] border border-[#FF4D4D]/30 shrink-0">
                  <AlertCircle size={20} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-sans font-semibold text-base text-[#E6E9EF]">
                    Delete Project?
                  </h3>
                  <p className="text-xs text-[#8B93A1] leading-relaxed font-sans">
                    This action will permanently delete <span className="font-semibold text-[#E6E9EF]">"{projectToDelete.name}"</span> and remove all associated image indexes from the SQLite database.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 mt-6">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setProjectToDelete(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => handleDeleteProject(projectToDelete.id)}
                  id="confirm-delete-btn"
                >
                  Delete Permanently
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ANNOTATOR MODAL / OVERLAY */}
      <AnimatePresence>
        {annotatorImage && (
          <Annotator
            image={annotatorImage}
            classes={activeProject?.classes || []}
            onSave={handleSaveAnnotations}
            onUpdateImage={(updatedImg) => {
              setImages(prev => prev.map(img => img.id === updatedImg.id ? updatedImg : img));
            }}
            onNext={handleNextImage}
            onPrev={handlePrevImage}
            onClose={() => setAnnotatorImageId(null)}
            onUpdateSplit={handleManualSplitChange}
            hasNext={hasNext}
            hasPrev={hasPrev}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
