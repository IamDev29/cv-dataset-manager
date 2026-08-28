import React, { useState, useEffect } from 'react';
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
  Settings,
  AlertCircle,
  Upload,
  AlertTriangle,
  Loader2,
  Trash,
  Sparkles,
  Sliders
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Project, BoundingBox, ImageSplit } from './types';
import { 
  ProjectImage, 
  getImagesByProject, 
  saveImage, 
  saveImagesBatch,
  deleteImage, 
  deleteProjectImages 
} from './db';
import Annotator from './components/Annotator';
import BoxelLogo from './components/BoxelLogo';
import CornerBrackets from './components/CornerBrackets';
import JSZip from 'jszip';

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
  '#FF9F1C'  // Tangerine
];

export default function App() {
  // Lazy state initialization for projects
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('cv_dataset_projects');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.map((p: any) => ({
          ...p,
          classes: p.classes || []
        }));
      } catch (e) {
        console.error('Error loading projects from localStorage:', e);
      }
    }
    // High-quality starter datasets to make the initial experience excellent
    return [
      { 
        id: 'proj-traffic-signs', 
        name: 'Autonomous Traffic Signs', 
        createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago
        imageCount: 142,
        classes: [
          { id: 'cls-1', name: 'Speed Limit 30', color: '#ef4444' },
          { id: 'cls-2', name: 'Stop Sign', color: '#f59e0b' },
          { id: 'cls-3', name: 'Yield Sign', color: '#3b82f6' }
        ]
      },
      { 
        id: 'proj-helmet-qa', 
        name: 'Construction Site Safety QA', 
        createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000, // 2 days ago
        imageCount: 89,
        classes: [
          { id: 'cls-4', name: 'Hard Hat', color: '#10b981' },
          { id: 'cls-5', name: 'Safety Vest', color: '#f97316' },
          { id: 'cls-6', name: 'No PPE Defect', color: '#ec4899' }
        ]
      },
      { 
        id: 'proj-defect-detection', 
        name: 'Solar Panel Micro-Cracks', 
        createdAt: Date.now() - 4 * 60 * 60 * 1000, // 4 hours ago
        imageCount: 0,
        classes: [
          { id: 'cls-7', name: 'Micro-Crack', color: '#8b5cf6' },
          { id: 'cls-8', name: 'Hot Spot Defect', color: '#06b6d4' }
        ]
      }
    ];
  });

  // Navigation state: active project workspace ID
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [pipelineTab, setPipelineTab] = useState<'split' | 'augment' | 'export'>('split');

  // Modal/Form states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'created-desc' | 'created-asc' | 'name-asc' | 'images-desc'>('created-desc');

  // Sync to localStorage automatically
  useEffect(() => {
    localStorage.setItem('cv_dataset_projects', JSON.stringify(projects));
  }, [projects]);

  // Handle project creation
  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const newProject: Project = {
      id: `proj-${Date.now()}`,
      name: newProjectName.trim(),
      createdAt: Date.now(),
      imageCount: 0
    };

    setProjects(prev => [newProject, ...prev]);
    setNewProjectName('');
    setIsCreateOpen(false);
  };

  // Handle project deletion
  const handleDeleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    deleteProjectImages(id).catch(err => console.error('Failed to delete images from IndexedDB:', err));
    if (activeProjectId === id) {
      setActiveProjectId(null);
    }
    setProjectToDelete(null);
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

  // Dataset split partitioning states with lazy state loading
  const [trainPercent, setTrainPercent] = useState<number>(() => {
    const saved = localStorage.getItem('cv_settings_train_percent');
    return saved ? parseInt(saved, 10) : 70;
  });
  const [valPercent, setValPercent] = useState<number>(() => {
    const saved = localStorage.getItem('cv_settings_val_percent');
    return saved ? parseInt(saved, 10) : 20;
  });
  const [testPercent, setTestPercent] = useState<number>(() => {
    const saved = localStorage.getItem('cv_settings_test_percent');
    return saved ? parseInt(saved, 10) : 10;
  });
  const [includeUnannotated, setIncludeUnannotated] = useState<boolean>(() => {
    const saved = localStorage.getItem('cv_settings_include_unannotated');
    return saved ? saved === 'true' : false;
  });
  const [splitFilter, setSplitFilter] = useState<'all' | 'train' | 'val' | 'test' | 'unassigned'>('all');
  const [annotationFilter, setAnnotationFilter] = useState<'all' | 'annotated' | 'not-annotated'>('all');
  const [autoSplitStatus, setAutoSplitStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Data Augmentation states with lazy state loading
  const [augFlip, setAugFlip] = useState<boolean>(() => {
    const saved = localStorage.getItem('cv_settings_aug_flip');
    return saved ? saved === 'true' : true;
  });
  const [augRotation, setAugRotation] = useState<boolean>(() => {
    const saved = localStorage.getItem('cv_settings_aug_rotation');
    return saved ? saved === 'true' : true;
  });
  const [augBrightness, setAugBrightness] = useState<boolean>(() => {
    const saved = localStorage.getItem('cv_settings_aug_brightness');
    return saved ? saved === 'true' : true;
  });
  const [augExposure, setAugExposure] = useState<boolean>(() => {
    const saved = localStorage.getItem('cv_settings_aug_exposure');
    return saved ? saved === 'true' : true;
  });
  const [augNoise, setAugNoise] = useState<boolean>(() => {
    const saved = localStorage.getItem('cv_settings_aug_noise');
    return saved ? saved === 'true' : false;
  });
  const [augVariantsCount, setAugVariantsCount] = useState<number>(() => {
    const saved = localStorage.getItem('cv_settings_aug_variants_count');
    return saved ? parseInt(saved, 10) : 2;
  });
  const [augStatus, setAugStatus] = useState<{ type: 'success' | 'error' | 'loading'; message: string; progress?: number } | null>(null);

  // Save settings to localStorage automatically when they change
  useEffect(() => {
    localStorage.setItem('cv_settings_train_percent', String(trainPercent));
    localStorage.setItem('cv_settings_val_percent', String(valPercent));
    localStorage.setItem('cv_settings_test_percent', String(testPercent));
    localStorage.setItem('cv_settings_include_unannotated', String(includeUnannotated));
    localStorage.setItem('cv_settings_aug_flip', String(augFlip));
    localStorage.setItem('cv_settings_aug_rotation', String(augRotation));
    localStorage.setItem('cv_settings_aug_brightness', String(augBrightness));
    localStorage.setItem('cv_settings_aug_exposure', String(augExposure));
    localStorage.setItem('cv_settings_aug_noise', String(augNoise));
    localStorage.setItem('cv_settings_aug_variants_count', String(augVariantsCount));
  }, [
    trainPercent, valPercent, testPercent, includeUnannotated,
    augFlip, augRotation, augBrightness, augExposure, augNoise, augVariantsCount
  ]);

  // Export states
  const [exportStatus, setExportStatus] = useState<{ type: 'success' | 'error' | 'loading'; message: string; progress?: number } | null>(null);

  // Auto-Split partition algorithm
  const handleAutoSplit = async () => {
    setAutoSplitStatus(null);
    const totalPercent = Number(trainPercent) + Number(valPercent) + Number(testPercent);
    if (totalPercent !== 100) {
      setAutoSplitStatus({
        type: 'error',
        message: `Percentages must sum to 100%. Current: ${totalPercent}%`
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

    // Filter images that should be split
    const eligibleImages = images.filter(img => {
      const hasAnnotations = img.annotations && img.annotations.length > 0;
      return includeUnannotated ? true : hasAnnotations;
    });

    if (eligibleImages.length === 0) {
      setAutoSplitStatus({
        type: 'error',
        message: includeUnannotated 
          ? 'No images available to split.' 
          : 'No annotated images found. Draw bounding boxes first, or enable "Include unannotated"!'
      });
      return;
    }

    // Shuffle helper (Fisher-Yates)
    const shuffled = [...eligibleImages];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const n = shuffled.length;
    const trainTarget = Math.round((n * trainPercent) / 100);
    const valTarget = Math.round((n * valPercent) / 100);
    // Remaining is testTarget to guarantee exact count

    const updatedImages = images.map(img => {
      const idx = shuffled.findIndex(item => item.id === img.id);
      if (idx !== -1) {
        let split: ImageSplit = 'test';
        if (idx < trainTarget) {
          split = 'train';
        } else if (idx < trainTarget + valTarget) {
          split = 'val';
        }
        return { ...img, split };
      } else {
        // Keeps its current split, or set to 'unassigned' if it doesn't have one
        return { ...img, split: img.split || 'unassigned' };
      }
    });

    try {
      await saveImagesBatch(updatedImages);
      setImages(updatedImages);
      setAutoSplitStatus({
        type: 'success',
        message: `Split ${n} images successfully! (${trainTarget} Train, ${valTarget} Val, ${n - trainTarget - valTarget} Test)`
      });
    } catch (err) {
      console.error('Failed to run auto-split batch save:', err);
      setAutoSplitStatus({
        type: 'error',
        message: 'Failed to write splits back to local database.'
      });
    }
  };

  // Manual split assignment
  const handleManualSplitChange = async (imageId: string, split: ImageSplit) => {
    const imgToUpdate = images.find(img => img.id === imageId);
    if (!imgToUpdate) return;

    const updatedImage = {
      ...imgToUpdate,
      split
    };

    try {
      await saveImage(updatedImage);
      setImages(prev => prev.map(img => img.id === imageId ? updatedImage : img));
    } catch (err) {
      console.error('Failed to update manual split:', err);
    }
  };

  // Data Augmentation Core Engine
  const performSingleAugmentation = (
    originalImg: ProjectImage,
    variantIdx: number
  ): Promise<ProjectImage> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Apply flip conditionally
        const onlyFlipEnabled = augFlip && !augRotation && !augBrightness && !augExposure && !augNoise;
        const applyFlip = augFlip ? (onlyFlipEnabled ? true : Math.random() > 0.5) : false;

        // Apply rotation angle conditionally
        let angleDegrees = 0;
        if (augRotation) {
          const sign = Math.random() > 0.5 ? 1 : -1;
          angleDegrees = sign * (5 + Math.random() * 10); // 5 to 15 degrees
        }
        const angleRad = (angleDegrees * Math.PI) / 180;

        // Apply brightness Factor
        let brightnessFactor = 1.0;
        if (augBrightness) {
          brightnessFactor = Math.random() > 0.5 
            ? 0.75 + Math.random() * 0.1 // 0.75 to 0.85 (darker)
            : 1.15 + Math.random() * 0.15; // 1.15 to 1.3 (brighter)
        }

        // Apply exposure Factor
        let contrastFactor = 1.0;
        let expBrightnessFactor = 1.0;
        if (augExposure) {
          contrastFactor = Math.random() > 0.5 ? 1.25 : 0.75;
          expBrightnessFactor = Math.random() > 0.5 ? 1.2 : 0.8;
        }

        // Setup filter string
        let filterString = '';
        if (augBrightness) {
          filterString += `brightness(${brightnessFactor}) `;
        }
        if (augExposure) {
          filterString += `contrast(${contrastFactor}) brightness(${expBrightnessFactor}) `;
        }
        if (filterString.trim()) {
          ctx.filter = filterString.trim();
        }

        // Apply spatial transformations (Centered rotation + scaling)
        ctx.translate(img.width / 2, img.height / 2);
        if (applyFlip) {
          ctx.scale(-1, 1);
        }
        if (angleRad !== 0) {
          ctx.rotate(angleRad);
        }
        ctx.drawImage(img, -img.width / 2, -img.height / 2);

        // Reset transforms
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // Apply light random noise (pixel level manipulation)
        if (augNoise) {
          try {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            const noiseAmount = 8 + Math.random() * 10; // amount of noise (8 to 18)
            for (let i = 0; i < data.length; i += 4) {
              const rNoise = (Math.random() - 0.5) * noiseAmount;
              data[i] = Math.max(0, Math.min(255, data[i] + rNoise));     // R
              data[i+1] = Math.max(0, Math.min(255, data[i+1] + rNoise)); // G
              data[i+2] = Math.max(0, Math.min(255, data[i+2] + rNoise)); // B
            }
            ctx.putImageData(imgData, 0, 0);
          } catch (e) {
            console.warn('ImageData operation failed (could be CORS or other canvas restriction):', e);
          }
        }

        // Geometrically accurate box transformation
        const originalBoxes = originalImg.annotations || [];
        const transformedBoxes: BoundingBox[] = originalBoxes.map((box) => {
          let { x, y, width, height } = box;

          // 1. Flip horizontally around x = 0.5
          if (applyFlip) {
            x = 1 - x - width;
          }

          // 2. Rotate around center (0.5, 0.5)
          if (angleRad !== 0) {
            const cx = 0.5;
            const cy = 0.5;

            const rotatePoint = (px: number, py: number) => {
              const rx = cx + (px - cx) * Math.cos(angleRad) - (py - cy) * Math.sin(angleRad);
              const ry = cy + (px - cx) * Math.sin(angleRad) + (py - cy) * Math.cos(angleRad);
              return { x: rx, y: ry };
            };

            const p1 = rotatePoint(x, y);
            const p2 = rotatePoint(x + width, y);
            const p3 = rotatePoint(x, y + height);
            const p4 = rotatePoint(x + width, y + height);

            const xs = [p1.x, p2.x, p3.x, p4.x];
            const ys = [p1.y, p2.y, p3.y, p4.y];

            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);

            x = Math.max(0, Math.min(1, minX));
            y = Math.max(0, Math.min(1, minY));
            width = Math.max(0.005, Math.min(1 - x, maxX - minX));
            height = Math.max(0.005, Math.min(1 - y, maxY - minY));
          }

          return {
            ...box,
            id: `box-aug-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            x,
            y,
            width,
            height
          };
        });

        // Generate data URL
        const base64Data = canvas.toDataURL('image/jpeg', 0.85);
        const nameWithoutExt = originalImg.name.substring(0, originalImg.name.lastIndexOf('.')) || originalImg.name;
        
        const augImg: ProjectImage = {
          id: `img-aug-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          projectId: originalImg.projectId,
          name: `${nameWithoutExt}_aug${variantIdx}.jpg`,
          size: Math.round(base64Data.length * 0.75), // approximate jpeg size
          type: 'image/jpeg',
          dataUrl: base64Data,
          annotated: originalImg.annotated,
          createdAt: Date.now() + variantIdx,
          annotations: transformedBoxes,
          split: 'train',
          isAugmented: true,
          originalImageId: originalImg.id
        };

        resolve(augImg);
      };

      img.onerror = (err) => {
        reject(err);
      };

      img.src = originalImg.dataUrl;
    });
  };

  const handleRunAugmentation = async () => {
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
      message: 'Preparing to generate variants...',
      progress: 0
    });

    const generatedImages: ProjectImage[] = [];
    const totalSteps = trainImages.length;
    let currentStep = 0;

    for (const originalImg of trainImages) {
      currentStep++;
      setAugStatus({
        type: 'loading',
        message: `Augmenting image ${currentStep} of ${totalSteps}...`,
        progress: Math.round(((currentStep - 1) / totalSteps) * 100)
      });

      for (let v = 1; v <= augVariantsCount; v++) {
        try {
          const result = await performSingleAugmentation(originalImg, v);
          generatedImages.push(result);
        } catch (err) {
          console.error('Failed to augment image:', originalImg.name, err);
        }
      }
    }

    if (generatedImages.length === 0) {
      setAugStatus({
        type: 'error',
        message: 'Failed to generate any augmented images.'
      });
      return;
    }

    setAugStatus({
      type: 'loading',
      message: `Saving ${generatedImages.length} augmented images to database...`,
      progress: 95
    });

    try {
      await saveImagesBatch(generatedImages);
      
      // Update state
      setImages(prev => [...prev, ...generatedImages]);
      
      // Update parent project image count
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
    } catch (err) {
      console.error('Failed to save augmented images:', err);
      setAugStatus({
        type: 'error',
        message: 'Failed to save the augmented images to local database.'
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
        message: 'Removing augmented images...'
      });

      for (const img of augmentedImages) {
        await deleteImage(img.id);
      }

      setImages(prev => prev.filter(img => !img.isAugmented));

      // Update parent count
      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            imageCount: Math.max(0, (p.imageCount || 0) - augmentedImages.length)
          };
        }
        return p;
      }));

      setAugStatus({
        type: 'success',
        message: `Successfully cleared ${augmentedImages.length} augmented images!`
      });
    } catch (err) {
      console.error('Failed to clear augmented images:', err);
      setAugStatus({
        type: 'error',
        message: 'Failed to clear augmented images from the local database.'
      });
    }
  };

  // Handle exporting the dataset as YOLO zip file
  const handleExportDataset = async () => {
    if (!activeProject) return;
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
      message: 'Generating YOLO annotations and packaging files...',
      progress: 0
    });

    try {
      const zip = new JSZip();

      // Write classes.txt
      const classesContent = projectClasses.map(c => c.name).join('\n');
      zip.file('classes.txt', classesContent);

      // Write dataset.yaml
      let yamlContent = `# YOLO Dataset Config\npath: ./dataset\ntrain: train/images\nval: val/images\ntest: test/images\n\nnames:\n`;
      projectClasses.forEach((c, idx) => {
        yamlContent += `  ${idx}: ${c.name}\n`;
      });
      zip.file('dataset.yaml', yamlContent);

      const totalImages = exportableImages.length;
      let processedCount = 0;

      for (const img of exportableImages) {
        if (!img.dataUrl) continue;
        const base64Content = img.dataUrl.split(',')[1];
        if (!base64Content) continue;

        const splitDir = img.split;
        
        // 1. Add image to zip
        zip.file(`${splitDir}/images/${img.name}`, base64Content, { base64: true });

        // 2. Generate matching YOLO label
        const nameWithoutExt = img.name.substring(0, img.name.lastIndexOf('.')) || img.name;
        const labelLines = (img.annotations || []).map(box => {
          const classIdx = projectClasses.findIndex(c => c.id === box.classId);
          if (classIdx === -1) return '';

          // YOLO normalized bounding box format: <class_index> <x_center> <y_center> <width> <height>
          const xCenter = box.x + box.width / 2;
          const yCenter = box.y + box.height / 2;
          return `${classIdx} ${xCenter.toFixed(6)} ${yCenter.toFixed(6)} ${box.width.toFixed(6)} ${box.height.toFixed(6)}`;
        }).filter(line => line !== '');

        const labelContent = labelLines.join('\n');
        zip.file(`${splitDir}/labels/${nameWithoutExt}.txt`, labelContent);

        processedCount++;
        setExportStatus({
          type: 'loading',
          message: `Packaging image ${processedCount} of ${totalImages}...`,
          progress: Math.round((processedCount / totalImages) * 90)
        });
      }

      setExportStatus({
        type: 'loading',
        message: 'Generating ZIP archive... This might take a moment.',
        progress: 95
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
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
        message: `Successfully exported ${processedCount} images as YOLO dataset!`
      });
    } catch (err) {
      console.error('Failed to export dataset:', err);
      setExportStatus({
        type: 'error',
        message: 'An error occurred while compiling your dataset archive.'
      });
    }
  };

  // Active annotator image state
  const [annotatorImageId, setAnnotatorImageId] = useState<string | null>(null);

  const annotatorImage = images.find(img => img.id === annotatorImageId);
  const annotatorIndex = annotatorImageId ? images.findIndex(img => img.id === annotatorImageId) : -1;
  const hasNext = annotatorIndex !== -1 && annotatorIndex < images.length - 1;
  const hasPrev = annotatorIndex > 0;

  // Computed split statistics & filtered image list
  const splitStats = {
    train: images.filter(img => img.split === 'train').length,
    val: images.filter(img => img.split === 'val').length,
    test: images.filter(img => img.split === 'test').length,
    unassigned: images.filter(img => !img.split || img.split === 'unassigned').length,
    total: images.length
  };

  const annotatedCount = images.filter(img => img.annotations && img.annotations.length > 0).length;
  const unlabeledCount = images.length - annotatedCount;

  const filteredImages = images.filter(img => {
    const matchesSplit = splitFilter === 'all' || 
      (splitFilter === 'unassigned' ? (!img.split || img.split === 'unassigned') : img.split === splitFilter);
      
    const hasBoxes = img.annotations && img.annotations.length > 0;
    const matchesAnnotation = annotationFilter === 'all' || 
      (annotationFilter === 'annotated' ? hasBoxes : !hasBoxes);
      
    return matchesSplit && matchesAnnotation;
  });

  const handleSaveAnnotations = async (imageId: string, annotations: BoundingBox[]) => {
    const imgToUpdate = images.find(img => img.id === imageId);
    if (!imgToUpdate) return;

    const isAnnotated = annotations.length > 0;
    const updatedImage = {
      ...imgToUpdate,
      annotations,
      annotated: isAnnotated
    };

    try {
      await saveImage(updatedImage);
      setImages(prev => prev.map(img => img.id === imageId ? updatedImage : img));
    } catch (err) {
      console.error('Failed to save annotations:', err);
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
    // Clean up old video state
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
      setSkippedFiles([]); // Reset skipped list
      getImagesByProject(activeProjectId)
        .then(res => {
          setImages(res);
        })
        .catch(err => console.error('Failed to load project images:', err))
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
        // Keep a max log or just unique names
        const combined = [...prev, ...skipped];
        return Array.from(new Set(combined));
      });
    }

    if (imageFiles.length === 0) return;

    setImportProgress({ current: 0, total: imageFiles.length });

    const newUploadedImages: ProjectImage[] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const file = imageFiles[i];
      try {
        const dataUrl = await fileToDataUrl(file);
        const imgObj: ProjectImage = {
          id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          projectId: activeProjectId,
          name: file.name,
          size: file.size,
          type: file.type,
          dataUrl,
          annotated: false,
          createdAt: Date.now() + i, // Offset ensures order sequence
        };

        await saveImage(imgObj);
        newUploadedImages.push(imgObj);

        setImportProgress({ current: i + 1, total: imageFiles.length });
      } catch (err) {
        console.error('Error importing image:', file.name, err);
      }
    }

    // Refresh state
    setImages(prev => [...prev, ...newUploadedImages]);

    // Update parent count
    setProjects(prev => prev.map(p => {
      if (p.id === activeProjectId) {
        return {
          ...p,
          imageCount: (p.imageCount || 0) + newUploadedImages.length
        };
      }
      return p;
    }));

    // Reset progress indicator shortly after completion
    setTimeout(() => {
      setImportProgress(null);
    }, 1500);
  };

  const handleDeleteImage = async (imageId: string) => {
    try {
      await deleteImage(imageId);
      setImages(prev => prev.filter(img => img.id !== imageId));
      
      // Update parent count
      setProjects(prev => prev.map(p => {
        if (p.id === activeProjectId) {
          return {
            ...p,
            imageCount: Math.max(0, (p.imageCount || 0) - 1)
          };
        }
        return p;
      }));
    } catch (err) {
      console.error('Failed to delete image:', err);
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

  // Video drag and drop handlers
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
    
    // Revoke old URL if it exists
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
    }
    
    setExtractionStatus(null);
    setSelectedVideo(file);
    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    
    // Create temporary video element to load metadata
    const video = document.createElement('video');
    video.src = url;
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    
    video.onloadedmetadata = () => {
      setVideoMetadata({
        duration: video.duration,
        fps: 30, // Standard estimation of FPS
        totalFrames: Math.round(video.duration * 30),
        width: video.videoWidth,
        height: video.videoHeight
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
      }, 8000); // 8s timeout
      
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
      const newImages: ProjectImage[] = [];
      
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
        
        const imgObj: ProjectImage = {
          id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          projectId: activeProjectId,
          name,
          size,
          type: 'image/jpeg',
          dataUrl,
          annotated: false,
          createdAt: Date.now() + i,
        };
        
        await saveImage(imgObj);
        newImages.push(imgObj);
        
        setExtractionProgress({ current: i + 1, total });
      }
      
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
      
      // Reset selected video to drop back into initial state
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

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId || !newClassName.trim()) return;

    const trimmedName = newClassName.trim();
    const currentClasses = activeProject?.classes || [];

    // Check duplicate
    if (currentClasses.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      setClassError('Class name already exists');
      return;
    }

    setClassError(null);

    // Pick distinct color
    const color = CLASS_COLORS[currentClasses.length % CLASS_COLORS.length];

    const newClass = {
      id: `cls-${Date.now()}`,
      name: trimmedName,
      color
    };

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
  };

  const handleDeleteClass = (classId: string) => {
    if (!activeProjectId) return;
    setProjects(prev => prev.map(p => {
      if (p.id === activeProjectId) {
        return {
          ...p,
          classes: (p.classes || []).filter(c => c.id !== classId)
        };
      }
      return p;
    }));
  };

  // Find currently active project
  const activeProject = projects.find(p => p.id === activeProjectId);

  // Total metrics
  const totalProjects = projects.length;
  const totalImages = projects.reduce((acc, p) => acc + p.imageCount, 0);

  // Filter and Sort projects
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

  // Helper to format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-[#14171C] text-[#E6E9EF] flex flex-col antialiased">
      {/* Upper Navigation Rail */}
      <header className="sticky top-0 z-10 bg-[#1C2128]/95 backdrop-blur-md border-b border-[#2A2F38] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <BoxelLogo size="md" />
          <div>
            <h1 className="font-sans font-bold tracking-tight text-lg text-[#E6E9EF] flex items-center">
              boxel<span className="text-[#3DA9FC] font-extrabold ml-0.5">.</span>
            </h1>
            <p className="font-mono text-[9px] text-[#8B93A1] tracking-widest uppercase">
              Offline CV Studio
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#14171C] border border-[#2A2F38] text-[#8B93A1] font-mono text-xs">
            <span className="w-2 h-2 rounded-full bg-[#FFB020] animate-pulse"></span>
            <span>Local Sync Active</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-grow max-w-7xl w-full mx-auto p-6 md:p-8 flex flex-col">
        <AnimatePresence mode="wait">
          {!activeProjectId ? (
            /* ============================================================== */
            /*                       HOME SCREEN VIEW                         */
            /* ============================================================== */
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col space-y-8"
              id="home-view"
            >
              {/* Header Dashboard Metrics */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="group/bracket relative bg-[#1C2128] border border-[#2A2F38] p-5 rounded-xl flex items-center justify-between shadow-xl">
                  <CornerBrackets color="slate" />
                  <div>
                    <p className="font-mono text-xs text-[#8B93A1] tracking-wider uppercase">
                      Total Projects
                    </p>
                    <p className="text-3xl font-bold tracking-tight text-[#E6E9EF] mt-1 font-mono">
                      {totalProjects}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-[#14171C] border border-[#2A2F38] flex items-center justify-center text-[#3DA9FC] z-1">
                    <Grid size={18} />
                  </div>
                </div>

                <div className="group/bracket relative bg-[#1C2128] border border-[#2A2F38] p-5 rounded-xl flex items-center justify-between shadow-xl">
                  <CornerBrackets color="slate" />
                  <div>
                    <p className="font-mono text-xs text-[#8B93A1] tracking-wider uppercase">
                      Total Images
                    </p>
                    <p className="text-3xl font-bold tracking-tight text-[#E6E9EF] mt-1 font-mono">
                      {totalImages}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-[#14171C] border border-[#2A2F38] flex items-center justify-center text-[#3DA9FC] z-1">
                    <FileImage size={18} />
                  </div>
                </div>

                <div className="group/bracket relative bg-[#1C2128] border border-[#2A2F38] p-5 rounded-xl flex items-center justify-between shadow-xl">
                  <CornerBrackets color="slate" />
                  <div>
                    <p className="font-mono text-xs text-[#8B93A1] tracking-wider uppercase">
                      Storage Mode
                    </p>
                    <p className="text-sm font-semibold tracking-tight text-[#E6E9EF] mt-2.5 flex items-center gap-1.5 font-sans">
                      <span className="w-2 h-2 rounded-full bg-[#FFB020]"></span>
                      Device-Only (Indexed)
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-[#14171C] border border-[#2A2F38] flex items-center justify-center text-[#3DA9FC] z-1">
                    <Database size={18} />
                  </div>
                </div>
              </div>

              {/* Controls Panel */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#1C2128] border border-[#2A2F38] p-4 rounded-xl shadow-xl">
                {/* Search */}
                <div className="relative flex-grow max-w-md">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8B93A1]" size={16} />
                  <input
                    type="text"
                    placeholder="Filter projects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-[#2A2F38] rounded-lg text-sm bg-[#14171C] text-[#E6E9EF] focus:bg-[#14171C] focus:outline-none focus:ring-2 focus:ring-[#3DA9FC] focus:border-transparent transition-all"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8B93A1] hover:text-[#E6E9EF]"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Sorter and Action */}
                <div className="flex items-center space-x-3 self-end md:self-auto">
                  <div className="flex items-center space-x-2 border border-[#2A2F38] rounded-lg px-3 py-2 bg-[#14171C] text-xs text-[#E6E9EF]">
                    <ArrowUpDown size={14} className="text-[#8B93A1]" />
                    <select
                      value={sortBy}
                      onChange={(e: any) => setSortBy(e.target.value)}
                      className="bg-transparent focus:outline-none text-[#E6E9EF] font-medium cursor-pointer"
                    >
                      <option value="created-desc">Newest First</option>
                      <option value="created-asc">Oldest First</option>
                      <option value="name-asc">Alphabetical</option>
                      <option value="images-desc">Most Images</option>
                    </select>
                  </div>

                  <button
                    onClick={() => setIsCreateOpen(true)}
                    className="flex items-center space-x-2 bg-[#3DA9FC] hover:bg-[#3DA9FC]/90 text-[#14171C] text-xs font-semibold px-4 py-2.5 rounded-lg shadow-lg shadow-[#3DA9FC]/15 transition-all cursor-pointer"
                    id="new-project-btn"
                  >
                    <FolderPlus size={15} />
                    <span>New Project</span>
                  </button>
                </div>
              </div>

              {/* Projects Grid */}
              {sortedProjects.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sortedProjects.map((project) => (
                    <div
                      key={project.id}
                      className="group/bracket relative bg-[#1C2128] border border-[#2A2F38] rounded-xl hover:border-[#3DA9FC]/40 hover:shadow-xl transition-all duration-200 flex flex-col justify-between overflow-hidden cursor-pointer"
                      onClick={() => setActiveProjectId(project.id)}
                      id={`project-card-${project.id}`}
                    >
                      {/* Signature corners for creative tool theme */}
                      <CornerBrackets />

                      {/* Top Visual Pattern representing a folder / image stacks */}
                      <div className="h-24 bg-[#14171C]/80 border-b border-[#2A2F38]/60 p-4 flex items-end justify-between relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 group-hover:opacity-10 transition-transform duration-300">
                          <Layers size={96} />
                        </div>
                        
                        <div className="flex items-center space-x-2 bg-[#1C2128]/95 backdrop-blur-xs px-2.5 py-1 rounded-md border border-[#2A2F38] shadow-2xs">
                          <FileImage size={13} className="text-[#8B93A1]" />
                          <span className="font-mono text-xs font-semibold text-[#E6E9EF]">
                            {project.imageCount} images
                          </span>
                        </div>
                        
                        <span className="font-mono text-[9px] text-[#8B93A1] tracking-wider uppercase bg-[#14171C] px-2 py-0.5 rounded border border-[#2A2F38]">
                          ID: {project.id.slice(0, 10)}
                        </span>
                      </div>

                      {/* Content */}
                      <div className="p-5 flex-grow flex flex-col justify-between space-y-4">
                        <div>
                          <h3 className="font-sans font-semibold text-lg text-[#E6E9EF] group-hover:text-[#3DA9FC] transition-colors line-clamp-1">
                            {project.name}
                          </h3>
                          <div className="flex items-center space-x-1.5 text-[#8B93A1] mt-1.5">
                            <Clock size={12} />
                            <span className="text-xs">Created {formatDate(project.createdAt)}</span>
                          </div>
                        </div>

                        {/* Card Actions */}
                        <div className="flex items-center justify-between pt-3 border-t border-[#2A2F38]/80">
                          <span className="text-xs text-[#8B93A1] font-medium group-hover:text-[#E6E9EF] transition-colors flex items-center gap-1">
                            Open Workspace <span>&rarr;</span>
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent card navigation
                              setProjectToDelete(project);
                            }}
                            className="p-1.5 rounded-md hover:bg-red-950/30 text-[#8B93A1] hover:text-red-400 transition-colors border border-transparent hover:border-red-900/30"
                            title="Delete Project"
                            aria-label="Delete Project"
                            id={`delete-btn-${project.id}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-[#1A1D23] border border-dashed border-slate-800 rounded-xl">
                  <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500 mb-4">
                    <Grid size={20} />
                  </div>
                  <h3 className="font-sans font-semibold text-base text-slate-200">
                    No projects found
                  </h3>
                  <p className="text-sm text-slate-400 max-w-sm mx-auto mt-1">
                    {searchQuery 
                      ? "No projects match your filter query. Try another keyword."
                      : "Create your very first computer vision project to start tagging and collecting images."}
                  </p>
                  {!searchQuery && (
                    <button
                      onClick={() => setIsCreateOpen(true)}
                      className="mt-4 inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-lg shadow-lg shadow-indigo-600/15 transition-colors cursor-pointer"
                    >
                      <Plus size={14} />
                      <span>Create Project</span>
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          ) : (
            /* ============================================================== */
            /*                     PROJECT WORKSPACE VIEW                     */
            /* ============================================================== */
            <motion.div
              key="workspace"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col space-y-6"
              id="workspace-view"
            >
              {/* Back & Breadcrumb header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#2A2F38]">
                <div className="flex items-center space-x-3">
                  <button
                    onClick={() => setActiveProjectId(null)}
                    className="p-2 rounded-lg border border-[#2A2F38] bg-[#1C2128] hover:bg-[#14171C] text-[#8B93A1] hover:text-[#3DA9FC] transition-all flex items-center justify-center cursor-pointer shadow-2xs"
                    aria-label="Back to Projects"
                    id="back-to-projects-btn"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#8B93A1]">
                        Workspace
                      </span>
                      <span className="text-[#2A2F38]">/</span>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#8B93A1] font-medium">
                        {activeProject?.id.slice(0, 10)}
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-[#E6E9EF] mt-0.5">
                      {activeProject?.name}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center space-x-2 text-xs font-mono text-[#8B93A1] bg-[#1C2128] border border-[#2A2F38] px-3 py-1.5 rounded-lg self-start sm:self-auto">
                  <FileImage size={13} className="text-[#3DA9FC]" />
                  <span>{activeProject?.imageCount} Total Images</span>
                </div>
              </div>

              {/* Project Workspace Stats Dashboard */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-[#1C2128] border border-[#2A2F38] p-4 rounded-xl shadow-lg" id="workspace-stats-dashboard">
                {/* Stat 1: Total Images */}
                <div className="flex flex-col justify-between p-3.5 rounded-lg bg-[#14171C] border border-[#2A2F38]/60 shadow-xs" id="stat-total-images">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[#8B93A1] font-semibold uppercase tracking-wider">Total Images</span>
                    <FileImage size={13} className="text-[#3DA9FC]" />
                  </div>
                  <div className="mt-2 flex items-baseline space-x-1">
                    <span className="text-xl font-bold font-mono text-[#E6E9EF]">{images.length}</span>
                    <span className="text-[10px] text-[#8B93A1] font-mono">files</span>
                  </div>
                </div>

                {/* Stat 2: Labeling Completion */}
                <div className="flex flex-col justify-between p-3.5 rounded-lg bg-[#14171C] border border-[#2A2F38]/60 shadow-xs" id="stat-annotation-status">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[#8B93A1] font-semibold uppercase tracking-wider">Annotation Status</span>
                    <Tag size={13} className="text-[#FFB020]" />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-[#E6E9EF] font-mono">{annotatedCount} <span className="text-[10px] text-[#8B93A1] font-sans font-normal">labeled</span></span>
                      <span className="text-[10px] text-[#8B93A1] mt-0.5 font-mono">{unlabeledCount} <span className="text-[10px] text-[#8B93A1] font-sans font-normal">unlabeled</span></span>
                    </div>
                    <div className="text-right flex flex-col items-end">
                      <span className="font-mono text-xs font-bold text-[#FFB020]">
                        {images.length > 0 ? Math.round((annotatedCount / images.length) * 100) : 0}%
                      </span>
                      <span className="text-[9px] text-[#8B93A1] font-mono uppercase tracking-wider mt-0.5">Done</span>
                    </div>
                  </div>
                </div>

                {/* Stat 3: Dataset Splitting */}
                <div className="flex flex-col justify-between p-3.5 rounded-lg bg-[#14171C] border border-[#2A2F38]/60 shadow-xs md:col-span-2" id="stat-splits-distribution">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] text-[#8B93A1] font-semibold uppercase tracking-wider">Dataset Splits Distribution</span>
                    <Sliders size={13} className="text-[#3DA9FC]" />
                  </div>
                  <div className="mt-2 flex flex-col justify-end space-y-2 h-full">
                    {/* Mini distribution bar */}
                    <div className="w-full bg-[#1C2128] h-1.5 rounded-full overflow-hidden flex border border-[#2A2F38]">
                      {images.length > 0 ? (
                        <>
                          <div className="bg-[#3DA9FC] h-full" style={{ width: `${(splitStats.train / images.length) * 100}%` }} />
                          <div className="bg-[#FFB020] h-full" style={{ width: `${(splitStats.val / images.length) * 100}%` }} />
                          <div className="bg-[#8B93A1] h-full" style={{ width: `${(splitStats.test / images.length) * 100}%` }} />
                          <div className="bg-[#2A2F38] h-full" style={{ width: `${(splitStats.unassigned / images.length) * 100}%` }} />
                        </>
                      ) : (
                        <div className="bg-[#2A2F38] w-full h-full" />
                      )}
                    </div>
                    {/* Legend with inline stats */}
                    <div className="flex items-center justify-between font-mono text-[9px] text-[#8B93A1] gap-1.5 flex-wrap">
                      <div className="flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#3DA9FC]" />
                        <span className="text-[#8B93A1]">Train:</span>
                        <span className="font-bold text-[#E6E9EF]">{splitStats.train}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#FFB020]" />
                        <span className="text-[#8B93A1]">Val:</span>
                        <span className="font-bold text-[#E6E9EF]">{splitStats.val}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#8B93A1]" />
                        <span className="text-[#8B93A1]">Test:</span>
                        <span className="font-bold text-[#E6E9EF]">{splitStats.test}</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
                        <span className="text-slate-500">None:</span>
                        <span className="font-bold text-slate-300">{splitStats.unassigned}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Core Workspace Empty Shell */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Side info sidebar - Setup and Pipeline steps */}
                <div className="lg:col-span-1 space-y-4">
                  {/* Setup Area: Metadata, Classes & Import */}
                  <div className="bg-[#1C2128] border border-[#2A2F38] rounded-xl overflow-hidden shadow-md flex flex-col justify-between group/bracket relative" id="workspace-setup-panel">
                    <CornerBrackets color="blue" />
                    
                    <div className="p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-[#2A2F38]/60 pb-3">
                        <h3 className="font-sans font-bold text-xs text-[#E6E9EF] tracking-wider uppercase">
                          1. Workspace Setup
                        </h3>
                        <span className="font-mono text-[10px] text-[#3DA9FC] bg-[#14171C] border border-[#2A2F38]/80 px-2 py-0.5 rounded">
                          {(activeProject?.classes || []).length} Classes
                        </span>
                      </div>

                      {/* Classes list & inline form */}
                      <div className="space-y-3">
                        <form onSubmit={handleAddClass} className="space-y-2">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder="Class name (e.g. dent)..."
                              value={newClassName}
                              onChange={(e) => {
                                setNewClassName(e.target.value);
                                if (classError) setClassError(null);
                              }}
                              className="flex-grow min-w-0 px-2.5 py-1.5 border border-[#2A2F38] rounded-lg text-xs bg-[#14171C] text-[#E6E9EF] focus:bg-[#14171C] focus:outline-none focus:ring-2 focus:ring-[#3DA9FC] focus:border-transparent transition-all"
                              required
                            />
                            <button
                              type="submit"
                              className="px-3 py-1.5 bg-[#3DA9FC] hover:bg-[#3DA9FC]/90 text-[#14171C] rounded-lg text-xs font-semibold flex items-center justify-center cursor-pointer transition-colors shrink-0"
                              title="Add Class"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          {classError && (
                            <p className="text-[10px] text-red-400 mt-1">{classError}</p>
                          )}
                        </form>

                        {/* Classes list */}
                        {(activeProject?.classes || []).length > 0 ? (
                          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                            {(activeProject?.classes || []).map((cls) => (
                              <div
                                key={cls.id}
                                className="flex items-center justify-between p-2 rounded-lg bg-[#14171C]/40 border border-[#2A2F38]/50 text-xs hover:border-[#2A2F38]/80 group/class transition-all"
                              >
                                <div className="flex items-center space-x-2.5 min-w-0">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-xs"
                                    style={{ backgroundColor: cls.color }}
                                  />
                                  <span className="font-medium text-[#E6E9EF] truncate" title={cls.name}>
                                    {cls.name}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteClass(cls.id)}
                                  className="text-[#8B93A1] hover:text-red-400 p-1 rounded-md opacity-0 group-hover/class:opacity-100 transition-opacity cursor-pointer hover:bg-[#1C2128]"
                                  title={`Delete ${cls.name}`}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-3 px-2 bg-[#14171C]/20 border border-dashed border-[#2A2F38]/60 rounded-lg">
                            <Tag size={14} className="text-[#8B93A1] mx-auto mb-1.5" />
                            <p className="text-[10px] text-[#8B93A1] font-sans">
                              No classes defined yet.
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Dataset Import Section */}
                      <div className="border-t border-[#2A2F38]/60 pt-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase font-mono tracking-wider text-[#8B93A1]">
                            Data Import
                          </span>
                        </div>

                        {/* Import Sub-Tabs */}
                        <div className="flex bg-[#14171C]/60 border border-[#2A2F38]/50 rounded-lg p-1 text-xs">
                          <button
                            type="button"
                            onClick={() => {
                              setImportMode('images');
                              setExtractionStatus(null);
                            }}
                            className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer text-center ${
                              importMode === 'images'
                                ? 'bg-[#1C2128] text-[#3DA9FC] border border-[#2A2F38]/50 shadow-xs'
                                : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                            }`}
                          >
                            Images
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setImportMode('video');
                              setExtractionStatus(null);
                            }}
                            className={`flex-1 py-1 text-[10px] font-bold rounded-md transition-all cursor-pointer text-center ${
                              importMode === 'video'
                                ? 'bg-[#1C2128] text-[#3DA9FC] border border-[#2A2F38]/50 shadow-xs'
                                : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                            }`}
                          >
                            Video Frames
                          </button>
                        </div>

                        {importMode === 'images' ? (
                          /* Compact Drag & Drop Image Import */
                          <div
                            onDragEnter={handleDrag}
                            onDragOver={handleDrag}
                            onDragLeave={handleDrag}
                            onDrop={handleDrop}
                            className={`relative border border-dashed rounded-lg p-3 text-center transition-all ${
                              dragActive
                                ? 'border-[#3DA9FC] bg-[#3DA9FC]/10'
                                : 'border-[#2A2F38] bg-[#14171C]/35 hover:border-[#2A2F38]/85'
                            }`}
                          >
                            <input
                              type="file"
                              id="image-file-input-sidebar"
                              multiple
                              accept="image/*"
                              onChange={(e) => {
                                if (e.target.files && e.target.files.length > 0) {
                                  processFiles(e.target.files);
                                }
                              }}
                              className="hidden"
                            />
                            <div className="flex flex-col items-center justify-center space-y-1.5">
                              <Upload size={14} className={`text-[#8B93A1] ${dragActive ? 'animate-bounce' : ''}`} />
                              <p className="text-[10px] text-[#8B93A1] font-sans">
                                Drag files here or
                              </p>
                              <label
                                htmlFor="image-file-input-sidebar"
                                className="px-2.5 py-1 bg-[#14171C] hover:bg-[#1C2128] border border-[#2A2F38] text-[#E6E9EF] text-[10px] font-semibold rounded-md shadow-xs cursor-pointer transition-all hover:text-white"
                              >
                                Select Files
                              </label>
                            </div>
                            
                            {/* Import Progress Overlay */}
                            {importProgress && (
                              <div className="absolute inset-0 bg-[#1C2128]/95 rounded-lg flex flex-col items-center justify-center p-2 space-y-1 z-10">
                                <Loader2 className="w-4 h-4 text-[#3DA9FC] animate-spin" />
                                <p className="text-[9px] font-semibold text-[#E6E9EF]">Importing...</p>
                                <p className="text-[8px] text-[#8B93A1] font-mono">
                                  {importProgress.current}/{importProgress.total}
                                </p>
                              </div>
                            )}
                          </div>
                        ) : (
                          /* Video Frame Extractor Option */
                          <div className="space-y-3">
                            {!selectedVideo ? (
                              <div
                                onDragEnter={handleVideoDrag}
                                onDragOver={handleVideoDrag}
                                onDragLeave={handleVideoDrag}
                                onDrop={handleVideoDrop}
                                className={`relative border border-dashed rounded-lg p-4 text-center transition-all ${
                                  videoDragActive
                                    ? 'border-[#3DA9FC] bg-[#3DA9FC]/10'
                                    : 'border-[#2A2F38] bg-[#14171C]/35 hover:border-[#2A2F38]/85'
                                }`}
                              >
                                <input
                                  type="file"
                                  id="video-file-input"
                                  accept="video/*"
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files.length > 0) {
                                      handleVideoSelect(e.target.files[0]);
                                    }
                                  }}
                                  className="hidden"
                                />
                                <div className="flex flex-col items-center justify-center space-y-1.5">
                                  <Upload size={14} className={`text-[#8B93A1] ${videoDragActive ? 'animate-bounce' : ''}`} />
                                  <p className="text-[10px] text-[#8B93A1] font-sans">
                                    Drag video here or
                                  </p>
                                  <label
                                    htmlFor="video-file-input"
                                    className="px-2.5 py-1 bg-[#14171C] hover:bg-[#1C2128] border border-[#2A2F38] text-[#E6E9EF] text-[10px] font-semibold rounded-md shadow-xs cursor-pointer transition-all hover:text-white"
                                  >
                                    Select Video
                                  </label>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {/* Video Preview Container */}
                                <div className="relative aspect-video rounded-lg overflow-hidden border border-[#2A2F38] bg-black">
                                  <video
                                    src={videoUrl || undefined}
                                    controls
                                    muted
                                    className="w-full h-full object-contain"
                                  />
                                  <button
                                    type="button"
                                    onClick={clearSelectedVideo}
                                    className="absolute top-1.5 right-1.5 p-1 rounded bg-[#14171C]/80 hover:bg-red-950/80 text-[#8B93A1] hover:text-red-400 border border-[#2A2F38]/50 transition-all cursor-pointer"
                                    title="Remove Video"
                                  >
                                    <X size={10} />
                                  </button>
                                </div>

                                {/* Video Metadata Readout (established monospace data styling) */}
                                <div className="grid grid-cols-3 gap-1.5 bg-[#14171C]/50 border border-[#2A2F38]/40 rounded-lg p-2 font-mono text-[9px] text-[#8B93A1]">
                                  <div className="text-center">
                                    <span className="block uppercase text-[8px] tracking-wider text-[#8B93A1] mb-0.5">Duration</span>
                                    <span className="font-bold text-[#E6E9EF]">
                                      {videoMetadata ? `${videoMetadata.duration.toFixed(1)}s` : '--'}
                                    </span>
                                  </div>
                                  <div className="text-center border-x border-[#2A2F38]/40">
                                    <span className="block uppercase text-[8px] tracking-wider text-[#8B93A1] mb-0.5">Rate</span>
                                    <span className="font-bold text-[#E6E9EF]">
                                      {videoMetadata ? `${videoMetadata.fps}.00 fps` : '--'}
                                    </span>
                                  </div>
                                  <div className="text-center">
                                    <span className="block uppercase text-[8px] tracking-wider text-[#8B93A1] mb-0.5">Est. Frames</span>
                                    <span className="font-bold text-[#E6E9EF]">
                                      {videoMetadata ? videoMetadata.totalFrames : '--'}
                                    </span>
                                  </div>
                                </div>

                                {/* Controls */}
                                <div className="space-y-2 bg-[#14171C]/25 border border-[#2A2F38]/30 rounded-lg p-2.5">
                                  {/* Interval vs FPS Toggles */}
                                  <div className="flex bg-[#14171C] border border-[#2A2F38]/60 rounded-md p-0.5 text-[9px] font-semibold">
                                    <button
                                      type="button"
                                      onClick={() => setExtractionMode('interval')}
                                      className={`flex-1 py-1 rounded-sm transition-all cursor-pointer text-center ${
                                        extractionMode === 'interval'
                                          ? 'bg-[#1C2128] text-[#3DA9FC] shadow-xs'
                                          : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                                      }`}
                                    >
                                      Interval
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setExtractionMode('fps')}
                                      className={`flex-1 py-1 rounded-sm transition-all cursor-pointer text-center ${
                                        extractionMode === 'fps'
                                          ? 'bg-[#1C2128] text-[#3DA9FC] shadow-xs'
                                          : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                                      }`}
                                    >
                                      Frequency
                                    </button>
                                  </div>

                                  {/* Slider Rate Slider */}
                                  {extractionMode === 'interval' ? (
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-[#8B93A1] font-sans">1 frame every:</span>
                                        <span className="font-bold text-[#3DA9FC] font-mono">
                                          {extractionInterval === 0.5 ? '0.5s' : `${extractionInterval}s`}
                                        </span>
                                      </div>
                                      <input
                                        type="range"
                                        min="0.5"
                                        max="10"
                                        step="0.5"
                                        value={extractionInterval}
                                        onChange={(e) => setExtractionInterval(parseFloat(e.target.value))}
                                        className="w-full h-1 bg-[#14171C] rounded-lg appearance-none cursor-pointer accent-[#3DA9FC] focus:outline-none"
                                      />
                                      <div className="flex justify-between text-[8px] text-[#8B93A1] font-mono px-0.5">
                                        <span>0.5s</span>
                                        <span>1s</span>
                                        <span>5s</span>
                                        <span>10s</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      <div className="flex items-center justify-between text-[10px]">
                                        <span className="text-[#8B93A1] font-sans">Frequency:</span>
                                        <span className="font-bold text-[#3DA9FC] font-mono">
                                          {extractionFps} fps
                                        </span>
                                      </div>
                                      <input
                                        type="range"
                                        min="1"
                                        max="10"
                                        step="1"
                                        value={extractionFps}
                                        onChange={(e) => setExtractionFps(parseInt(e.target.value))}
                                        className="w-full h-1 bg-[#14171C] rounded-lg appearance-none cursor-pointer accent-[#3DA9FC] focus:outline-none"
                                      />
                                      <div className="flex justify-between text-[8px] text-[#8B93A1] font-mono px-0.5">
                                        <span>1 fps</span>
                                        <span>2 fps</span>
                                        <span>5 fps</span>
                                        <span>10 fps</span>
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Live Result count preview */}
                                <div className="flex justify-between items-center text-[10px] font-sans bg-[#14171C]/35 px-2.5 py-1.5 rounded-md border border-[#2A2F38]/30">
                                  <span className="text-[#8B93A1]">Resulting images:</span>
                                  <span className="font-bold text-[#3DA9FC] font-mono">
                                    +{getExtractionTimestamps().length} files
                                  </span>
                                </div>

                                {/* Large Frame Count Warning */}
                                {getExtractionTimestamps().length >= 100 && (
                                  <div className="bg-amber-950/20 border border-amber-900/30 p-2 rounded-md text-[9px] text-amber-400 leading-normal flex items-start gap-1.5 font-sans">
                                    <AlertTriangle size={12} className="shrink-0 mt-0.5 text-amber-400" />
                                    <div>
                                      <span className="font-bold">High frame count:</span> Extracting {getExtractionTimestamps().length} images may take several seconds and utilize substantial IndexedDB browser storage.
                                    </div>
                                  </div>
                                )}

                                {/* Extract CTA */}
                                <button
                                  type="button"
                                  onClick={handleExtractFrames}
                                  disabled={isExtracting || getExtractionTimestamps().length === 0}
                                  className="w-full py-2 bg-[#3DA9FC] hover:bg-[#3DA9FC]/90 text-[#14171C] text-[10px] font-bold rounded-lg shadow-sm cursor-pointer transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider"
                                >
                                  {isExtracting ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                      Extracting...
                                    </>
                                  ) : (
                                    <>
                                      <FileImage size={13} />
                                      Extract Frames
                                    </>
                                  )}
                                </button>
                              </div>
                            )}

                            {/* Extraction Progress Overlay */}
                            {extractionProgress && (
                              <div className="bg-[#14171C]/50 border border-[#2A2F38]/60 p-2.5 rounded-lg flex flex-col space-y-1.5">
                                <div className="flex items-center justify-between text-[10px]">
                                  <span className="text-[#E6E9EF] font-semibold">Processing Video...</span>
                                  <span className="font-mono text-[#8B93A1]">
                                    {extractionProgress.current} / {extractionProgress.total}
                                  </span>
                                </div>
                                <div className="w-full bg-[#1C2128] h-1 rounded-full overflow-hidden border border-[#2A2F38]/50">
                                  <div 
                                    className="bg-[#3DA9FC] h-full transition-all duration-150"
                                    style={{ width: `${(extractionProgress.current / extractionProgress.total) * 100}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Unified Status Message for Video Extraction */}
                        {extractionStatus && (
                          <div className={`p-2.5 rounded-md text-[10px] leading-relaxed flex items-start gap-1.5 border ${
                            extractionStatus.type === 'success'
                              ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400'
                              : 'bg-red-950/20 border-red-900/30 text-red-400'
                          }`}>
                            {extractionStatus.type === 'success' ? (
                              <AlertCircle size={13} className="shrink-0 mt-0.5 text-emerald-400" />
                            ) : (
                              <AlertTriangle size={13} className="shrink-0 mt-0.5 text-red-400" />
                            )}
                            <div className="font-sans">{extractionStatus.message}</div>
                          </div>
                        )}
                      </div>

                      {/* Metadata Summary (no description monospace!) */}
                      <div className="border-t border-[#2A2F38]/60 pt-4 space-y-2 text-xs font-sans">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-[#8B93A1]">Created:</span>
                          <span className="text-[#E6E9EF] font-mono">
                            {activeProject ? formatDate(activeProject.createdAt) : '-'}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-[#8B93A1]">Type:</span>
                          <span className="text-[#E6E9EF]">Object Detection</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-[#8B93A1]">Source:</span>
                          <span className="text-[#E6E9EF]">Local Browser</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Processing Pipeline: Split, Augment, Export */}
                  <div className="bg-[#1C2128] border border-[#2A2F38] rounded-xl overflow-hidden shadow-md flex flex-col justify-between group/bracket relative" id="workspace-pipeline-panel">
                    <CornerBrackets color="amber" />
                    
                    <div className="p-5 space-y-4">
                      <div className="flex items-center justify-between border-b border-[#2A2F38]/60 pb-3">
                        <h3 className="font-sans font-bold text-xs text-[#E6E9EF] tracking-wider uppercase">
                          2. Processing Pipeline
                        </h3>
                      </div>

                      {/* Horizontal Tab controller */}
                      <div className="flex bg-[#14171C] border border-[#2A2F38]/80 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={() => setPipelineTab('split')}
                          className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all cursor-pointer text-center ${
                            pipelineTab === 'split'
                              ? 'bg-[#1C2128] text-[#3DA9FC] border border-[#2A2F38]/50 shadow-xs'
                              : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                          }`}
                        >
                          Split
                        </button>
                        <button
                          type="button"
                          onClick={() => setPipelineTab('augment')}
                          className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all cursor-pointer text-center ${
                            pipelineTab === 'augment'
                              ? 'bg-[#1C2128] text-[#FFB020] border border-[#2A2F38]/50 shadow-xs'
                              : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                          }`}
                        >
                          Augment
                        </button>
                        <button
                          type="button"
                          onClick={() => setPipelineTab('export')}
                          className={`flex-1 py-1.5 text-[10px] font-bold rounded-md transition-all cursor-pointer text-center ${
                            pipelineTab === 'export'
                              ? 'bg-[#1C2128] text-indigo-400 border border-[#2A2F38]/50 shadow-xs'
                              : 'text-[#8B93A1] hover:text-[#E6E9EF]'
                          }`}
                        >
                          Export
                        </button>
                      </div>

                      {/* Pipeline Content Area */}
                      {pipelineTab === 'split' && (
                        <div className="space-y-4 animate-fade-in" id="pipeline-split-tab">
                          <div className="space-y-1">
                            <h4 className="text-[11px] font-semibold text-[#8B93A1] uppercase tracking-wider font-sans">
                              Dataset Splits Partition
                            </h4>
                            <p className="text-[10px] text-[#8B93A1] leading-relaxed font-sans">
                              Partition images into training, validation, and test splits to evaluate model metrics.
                            </p>
                          </div>

                          {/* Distribution Bar */}
                          <div className="space-y-2">
                            <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden flex border border-slate-900 shadow-inner">
                              {splitStats.total > 0 ? (
                                <>
                                  <div className="bg-[#3DA9FC] h-full transition-all duration-300" style={{ width: `${(splitStats.train / splitStats.total) * 100}%` }} />
                                  <div className="bg-[#FFB020] h-full transition-all duration-300" style={{ width: `${(splitStats.val / splitStats.total) * 100}%` }} />
                                  <div className="bg-[#8B93A1] h-full transition-all duration-300" style={{ width: `${(splitStats.test / splitStats.total) * 100}%` }} />
                                  <div className="bg-slate-700 h-full transition-all duration-300" style={{ width: `${(splitStats.unassigned / splitStats.total) * 100}%` }} />
                                </>
                              ) : (
                                <div className="bg-slate-800 w-full h-full" />
                              )}
                            </div>

                            {/* Legend counts */}
                            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                              <div className="flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#3DA9FC] shrink-0" />
                                <span className="text-[#8B93A1]">Train:</span>
                                <span className="font-bold text-[#E6E9EF]">{splitStats.train}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#FFB020] shrink-0" />
                                <span className="text-[#8B93A1]">Val:</span>
                                <span className="font-bold text-[#E6E9EF]">{splitStats.val}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-[#8B93A1] shrink-0" />
                                <span className="text-[#8B93A1]">Test:</span>
                                <span className="font-bold text-[#E6E9EF]">{splitStats.test}</span>
                              </div>
                              <div className="flex items-center space-x-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
                                <span className="text-[#8B93A1]">None:</span>
                                <span className="font-bold text-[#E6E9EF]">{splitStats.unassigned}</span>
                              </div>
                            </div>
                          </div>

                          {/* Auto-split inputs */}
                          <div className="border-t border-[#2A2F38]/60 pt-3 space-y-3">
                            <div className="grid grid-cols-3 gap-1">
                              <div className="space-y-1">
                                <label className="text-[9px] uppercase font-mono tracking-wider text-[#8B93A1] block text-center">Train%</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={trainPercent}
                                  onChange={(e) => {
                                    setTrainPercent(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)));
                                    setAutoSplitStatus(null);
                                  }}
                                  className="w-full px-1 py-1 bg-[#14171C] border border-[#2A2F38] text-[#E6E9EF] rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-[#3DA9FC] text-center font-mono font-medium"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] uppercase font-mono tracking-wider text-[#8B93A1] block text-center">Val%</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={valPercent}
                                  onChange={(e) => {
                                    setValPercent(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)));
                                    setAutoSplitStatus(null);
                                  }}
                                  className="w-full px-1 py-1 bg-[#14171C] border border-[#2A2F38] text-[#E6E9EF] rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-[#3DA9FC] text-center font-mono font-medium"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] uppercase font-mono tracking-wider text-[#8B93A1] block text-center">Test%</label>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={testPercent}
                                  onChange={(e) => {
                                    setTestPercent(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)));
                                    setAutoSplitStatus(null);
                                  }}
                                  className="w-full px-1 py-1 bg-[#14171C] border border-[#2A2F38] text-[#E6E9EF] rounded text-[10px] focus:outline-none focus:ring-1 focus:ring-[#3DA9FC] text-center font-mono font-medium"
                                />
                              </div>
                            </div>

                            <div className="flex items-center space-x-1.5">
                              <input
                                type="checkbox"
                                id="include-unannotated"
                                checked={includeUnannotated}
                                onChange={(e) => {
                                  setIncludeUnannotated(e.target.checked);
                                  setAutoSplitStatus(null);
                                }}
                                className="rounded bg-[#14171C] border-[#2A2F38] text-[#3DA9FC] focus:ring-[#3DA9FC]/30 cursor-pointer w-3 h-3"
                              />
                              <label htmlFor="include-unannotated" className="text-[10px] text-[#8B93A1] cursor-pointer select-none font-sans">
                                Include unlabeled images
                              </label>
                            </div>

                            <button
                              type="button"
                              onClick={handleAutoSplit}
                              className="w-full py-1.5 bg-[#3DA9FC] hover:bg-[#3DA9FC]/90 text-[#14171C] rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center space-x-1"
                            >
                              <span>Randomize Splits</span>
                            </button>

                            {autoSplitStatus && (
                              <div className={`text-[10px] p-2 rounded-lg border leading-normal ${
                                autoSplitStatus.type === 'success' 
                                  ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400' 
                                  : 'bg-red-950/20 border-red-900/30 text-red-400'
                              }`}>
                                {autoSplitStatus.message}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {pipelineTab === 'augment' && (
                        <div className="space-y-4 animate-fade-in" id="pipeline-augment-tab">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-[#FFB020]" />
                              <h4 className="text-[11px] font-semibold text-[#FFB020] uppercase tracking-wider font-sans">
                                Data Augmentation
                              </h4>
                            </div>
                            <p className="text-[10px] text-[#8B93A1] leading-relaxed font-sans">
                              Spatially and visually transform your Training split to help prevent model overfitting. Existing bounding boxes are perfectly mapped to matches.
                            </p>
                          </div>

                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                            {/* Flip */}
                            <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#14171C]/35 border border-[#2A2F38]/40 hover:border-[#2A2F38]/70 transition-colors">
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold text-[#E6E9EF]">Horizontal Flip</span>
                                <span className="text-[9px] text-[#8B93A1] font-sans">Mirror images horizontally</span>
                              </div>
                              <input
                                type="checkbox"
                                checked={augFlip}
                                onChange={(e) => setAugFlip(e.target.checked)}
                                className="rounded bg-[#14171C] border-[#2A2F38] text-[#3DA9FC] w-3 h-3 cursor-pointer"
                              />
                            </div>

                            {/* Rotation */}
                            <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#14171C]/35 border border-[#2A2F38]/40 hover:border-[#2A2F38]/70 transition-colors">
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold text-[#E6E9EF]">Random Rotation</span>
                                <span className="text-[9px] text-[#8B93A1] font-sans">Slight rot. (±5° to ±15°)</span>
                              </div>
                              <input
                                type="checkbox"
                                checked={augRotation}
                                onChange={(e) => setAugRotation(e.target.checked)}
                                className="rounded bg-[#14171C] border-[#2A2F38] text-[#3DA9FC] w-3 h-3 cursor-pointer"
                              />
                            </div>

                            {/* Brightness */}
                            <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#14171C]/35 border border-[#2A2F38]/40 hover:border-[#2A2F38]/70 transition-colors">
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold text-[#E6E9EF]">Brightness</span>
                                <span className="text-[9px] text-[#8B93A1] font-sans">Random darker or brighter</span>
                              </div>
                              <input
                                type="checkbox"
                                checked={augBrightness}
                                onChange={(e) => setAugBrightness(e.target.checked)}
                                className="rounded bg-[#14171C] border-[#2A2F38] text-[#3DA9FC] w-3 h-3 cursor-pointer"
                              />
                            </div>

                            {/* Exposure */}
                            <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#14171C]/35 border border-[#2A2F38]/40 hover:border-[#2A2F38]/70 transition-colors">
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold text-[#E6E9EF]">Exposure</span>
                                <span className="text-[9px] text-[#8B93A1] font-sans">Adjust contrast/brightness</span>
                              </div>
                              <input
                                type="checkbox"
                                checked={augExposure}
                                onChange={(e) => setAugExposure(e.target.checked)}
                                className="rounded bg-[#14171C] border-[#2A2F38] text-[#3DA9FC] w-3 h-3 cursor-pointer"
                              />
                            </div>

                            {/* Noise */}
                            <div className="flex items-center justify-between p-1.5 rounded-lg bg-[#14171C]/35 border border-[#2A2F38]/40 hover:border-[#2A2F38]/70 transition-colors">
                              <div className="flex flex-col min-w-0">
                                <span className="text-[10px] font-bold text-[#E6E9EF]">Digital Grain</span>
                                <span className="text-[9px] text-[#8B93A1] font-sans">Add fine digital grain grain</span>
                              </div>
                              <input
                                type="checkbox"
                                checked={augNoise}
                                onChange={(e) => setAugNoise(e.target.checked)}
                                className="rounded bg-[#14171C] border-[#2A2F38] text-[#3DA9FC] w-3 h-3 cursor-pointer"
                              />
                            </div>
                          </div>

                          {/* Multiplier */}
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px]">
                              <span className="font-mono text-[#8B93A1] uppercase tracking-wider">Multiplier:</span>
                              <span className="font-mono font-bold text-[#FFB020]">{augVariantsCount}x variants</span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="5"
                              value={augVariantsCount}
                              onChange={(e) => setAugVariantsCount(parseInt(e.target.value))}
                              className="w-full h-1 bg-[#14171C] rounded-lg appearance-none cursor-pointer accent-[#FFB020]"
                            />
                          </div>

                          {(() => {
                            const rawTrainCount = images.filter(img => img.split === 'train' && !img.isAugmented).length;
                            const generatedCount = rawTrainCount * augVariantsCount;

                            return (
               <div className="space-y-2 border-t border-[#2A2F38]/60 pt-3 text-[10px]">
                 <div className="flex justify-between font-mono text-[#8B93A1]">
                   <span>Train images:</span>
                   <span className="text-[#E6E9EF]">{rawTrainCount}</span>
                 </div>
                 <div className="flex justify-between font-mono text-[#FFB020]">
                   <span>Will generate:</span>
                   <span className="font-bold">+{generatedCount} files</span>
                 </div>

                 <button
                   type="button"
                   onClick={handleRunAugmentation}
                   disabled={rawTrainCount === 0 || augStatus?.type === 'loading'}
                   className="w-full py-1.5 bg-[#FFB020] hover:bg-[#FFB020]/90 disabled:bg-[#1C2128] disabled:text-[#8B93A1]/50 disabled:border disabled:border-[#2A2F38] disabled:cursor-not-allowed text-[#14171C] rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center space-x-1"
                 >
                   {augStatus?.type === 'loading' ? (
                     <>
                       <Loader2 className="w-3 animate-spin" />
                       <span>Generating ({augStatus.progress}%)</span>
                     </>
                   ) : (
                     <>
                       <Sparkles size={11} className="text-[#14171C]" />
                       <span>Generate Augmented</span>
                     </>
                   )}
                 </button>

                 {images.some(img => img.isAugmented) && (
                   <button
                     type="button"
                     onClick={handleClearAugmented}
                     disabled={augStatus?.type === 'loading'}
                     className="w-full py-1 bg-[#14171C] hover:bg-red-950/20 border border-[#2A2F38] hover:border-red-900/30 text-[#8B93A1] hover:text-red-400 rounded-md text-[10px] font-semibold cursor-pointer transition-all flex items-center justify-center space-x-1"
                   >
                     <Trash size={10} />
                     <span>Clear Augmented Images</span>
                   </button>
                 )}

                 {augStatus && (
                   <div className={`text-[9px] p-1.5 rounded border leading-normal ${
                     augStatus.type === 'success' 
                       ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400' 
                       : 'bg-red-950/20 border-red-900/30 text-red-400'
                   }`}>
                     {augStatus.message}
                   </div>
                 )}
               </div>
                            );
                          })()}
                        </div>
                      )}

                      {pipelineTab === 'export' && (
                        <div className="space-y-4 animate-fade-in" id="pipeline-export-tab">
                          <div className="space-y-1">
                            <div className="flex items-center space-x-1.5">
                              <Download className="w-3.5 h-3.5 text-indigo-400" />
                              <h4 className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider font-sans">
                                YOLO Export
                              </h4>
                            </div>
                            <p className="text-[10px] text-[#8B93A1] leading-relaxed font-sans">
                              Package all assigned split images and geometrically mapped bounding boxes into a production-ready YOLO archive.
                            </p>
                          </div>

                          {/* Export splits count matrix */}
                          <div className="grid grid-cols-3 gap-1 text-center font-mono text-[9px] bg-[#14171C]/50 rounded-lg p-1.5 border border-[#2A2F38]/40">
                            <div>
                              <div className="text-[#8B93A1]">Train</div>
                              <div className="text-[11px] font-bold text-[#E6E9EF] mt-0.5">{splitStats.train}</div>
                            </div>
                            <div>
                              <div className="text-[#8B93A1]">Val</div>
                              <div className="text-[11px] font-bold text-[#E6E9EF] mt-0.5">{splitStats.val}</div>
                            </div>
                            <div>
                              <div className="text-[#8B93A1]">Test</div>
                              <div className="text-[11px] font-bold text-[#E6E9EF] mt-0.5">{splitStats.test}</div>
                            </div>
                          </div>

                          {/* Unassigned warning */}
                          {splitStats.unassigned > 0 && (
                            <div className="flex items-start space-x-1.5 p-1.5 rounded-lg bg-[#FFB020]/10 border border-[#FFB020]/25 text-[9px] text-[#FFB020] leading-relaxed font-sans">
                              <AlertTriangle size={10} className="mt-0.5 shrink-0 text-[#FFB020]" />
                              <span>
                                {splitStats.unassigned} unassigned images will be excluded from the archive.
                              </span>
                            </div>
                          )}

                          {/* Class mappings list */}
                          {activeProject?.classes && activeProject.classes.length > 0 && (
                            <div className="space-y-1 border-t border-[#2A2F38]/60 pt-2.5">
                              <span className="text-[9px] uppercase font-mono tracking-wider text-[#8B93A1] block">
                                Class Indices
                              </span>
                              <div className="max-h-20 overflow-y-auto space-y-1 pr-1 custom-scrollbar text-[9px]">
                                {activeProject.classes.map((cls, idx) => (
                                  <div key={cls.id} className="flex items-center justify-between font-mono bg-[#14171C]/25 border border-[#2A2F38]/30 px-1.5 py-0.5 rounded">
                                    <span className="text-[#8B93A1] font-bold">{idx}</span>
                                    <div className="flex items-center space-x-1 min-w-0">
                                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: cls.color }} />
                                      <span className="text-[#E6E9EF] truncate max-w-[80px]">{cls.name}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={handleExportDataset}
                            disabled={
                              (splitStats.train === 0 && splitStats.val === 0 && splitStats.test === 0) ||
                              exportStatus?.type === 'loading'
                            }
                            className="w-full py-1.5 bg-[#3DA9FC] hover:bg-[#3DA9FC]/90 disabled:bg-[#1C2128] disabled:text-[#8B93A1]/50 disabled:border disabled:border-[#2A2F38] disabled:cursor-not-allowed text-[#14171C] rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center justify-center space-x-1"
                          >
                            {exportStatus?.type === 'loading' ? (
                              <>
                                <Loader2 className="w-3 animate-spin" />
                                <span>Exporting ({exportStatus.progress}%)</span>
                              </>
                            ) : (
                              <>
                                <Download size={11} className="text-[#14171C]" />
                                <span>Export YOLO Dataset</span>
                              </>
                            )}
                          </button>

                          {exportStatus && (
                            <div className={`text-[9px] p-1.5 rounded border leading-normal ${
                              exportStatus.type === 'success' 
                                ? 'bg-emerald-950/20 border-emerald-900/30 text-emerald-400' 
                                : 'bg-red-950/20 border-red-900/30 text-red-400'
                            }`}>
                              <div>{exportStatus.message}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sidebar workspace tip */}
                  <div className="bg-[#1C2128] border border-[#2A2F38] p-5 rounded-xl space-y-3 shadow-2xs group/bracket relative">
                    <CornerBrackets color="slate" />
                    <h3 className="font-sans font-semibold text-xs text-[#3DA9FC] tracking-wider uppercase">
                      Workspace Tip
                    </h3>
                    <p className="text-xs text-[#8B93A1] leading-relaxed font-sans">
                      Now that you've imported your dataset images, define the object classes you plan to annotate. Next, you will be able to select any image to draw bounding boxes.
                    </p>
                    <div className="w-full bg-[#14171C] h-1 rounded-full overflow-hidden">
                      <div className="bg-[#3DA9FC] h-full w-full"></div>
                    </div>
                  </div>
                </div>

                {/* Right side stable interactive gallery area */}
                <div className="lg:col-span-3 space-y-6">

                  {/* Skipped files alerts */}
                  {skippedFiles.length > 0 && (
                    <div className="bg-amber-950/20 border border-amber-900/35 rounded-xl p-4 flex items-start justify-between">
                      <div className="flex items-start space-x-3 text-amber-400">
                        <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold">Non-image files skipped</p>
                          <p className="text-[11px] text-amber-500/80 mt-0.5">
                            The following {skippedFiles.length} file(s) were not processed because they are not valid images:
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1 scrollbar-thin">
                            {skippedFiles.map((name, idx) => (
                              <span key={idx} className="font-mono text-[9px] bg-amber-950/40 px-2 py-0.5 rounded border border-amber-900/20 text-amber-300">
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setSkippedFiles([])}
                        className="text-amber-500 hover:text-amber-300 p-1 rounded-md hover:bg-amber-950/20 cursor-pointer transition-colors shrink-0"
                        title="Dismiss alert"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {/* Images Grid */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-sans font-semibold text-sm text-slate-300">
                        Project Images Grid
                      </h3>
                      <span className="font-mono text-xs text-slate-500 bg-slate-900/50 border border-slate-800/60 px-2 py-0.5 rounded">
                        Total: {images.length} image{images.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {images.length > 0 && (
                      /* Interactive Filters bar */
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#13161B] border border-slate-800 rounded-xl p-3 shadow-xs">
                        <div className="flex flex-wrap items-center gap-4">
                          {/* Split Filter tab selectors */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Split:</span>
                            <div className="flex bg-slate-900 border border-slate-800/80 rounded-lg p-0.5 flex-wrap">
                              {(['all', 'train', 'val', 'test', 'unassigned'] as const).map((split) => (
                                <button
                                  key={split}
                                  type="button"
                                  onClick={() => setSplitFilter(split)}
                                  className={`px-2 py-1 text-[10px] font-semibold rounded-md capitalize transition-all cursor-pointer ${
                                    splitFilter === split
                                      ? 'bg-slate-800 text-indigo-400 border border-slate-700/40 shadow-xs font-bold'
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {split === 'all' ? 'All' : split === 'unassigned' ? 'None' : split}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Annotation Filter tab selectors */}
                          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider font-mono">Status:</span>
                            <div className="flex bg-slate-900 border border-slate-800/80 rounded-lg p-0.5 flex-wrap">
                              {(['all', 'annotated', 'not-annotated'] as const).map((status) => (
                                <button
                                  key={status}
                                  type="button"
                                  onClick={() => setAnnotationFilter(status)}
                                  className={`px-2 py-1 text-[10px] font-semibold rounded-md transition-all cursor-pointer ${
                                    annotationFilter === status
                                      ? 'bg-slate-800 text-indigo-400 border border-slate-700/40 shadow-xs font-bold'
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  {status === 'all' ? 'All' : status === 'annotated' ? 'Annotated' : 'Unlabeled'}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Display filtered results vs total */}
                        <span className="text-[10px] text-slate-500 font-mono self-start sm:self-auto">
                          Filtered: {filteredImages.length} / {images.length}
                        </span>
                      </div>
                    )}

                    {imagesLoading ? (
                      <div className="flex flex-col items-center justify-center py-16 text-slate-500 space-y-2">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                        <span className="text-xs">Loading local workspace files...</span>
                      </div>
                    ) : images.length > 0 ? (
                      filteredImages.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4" id="images-grid">
                          {filteredImages.map((img) => {
                            const hasBoxes = img.annotations && img.annotations.length > 0;
                            return (
                              <div
                                key={img.id}
                                onClick={() => setAnnotatorImageId(img.id)}
                                className={`group/bracket relative bg-[#1C2128] border rounded-xl overflow-hidden aspect-video transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                                  hasBoxes 
                                    ? 'border-emerald-500/40 border-b-[4px] border-b-[#00E5A3]' 
                                    : 'border-[#2A2F38] border-b-[4px] border-b-slate-700/60'
                                }`}
                              >
                                <CornerBrackets />
                                <img
                                  src={img.dataUrl}
                                  alt={img.name}
                                  className="w-full h-full object-cover group-hover/bracket:scale-102 transition-transform duration-300"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                />
                                
                                {/* Subtle Top Left: Simple Augmented Sparkle Icon (No text badge!) */}
                                {img.isAugmented && (
                                  <div className="absolute top-2 left-2 z-1 text-[#FFB020] filter drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" title="Augmented Variant">
                                    <Sparkles size={12} className="fill-[#FFB020]/20 animate-pulse" />
                                  </div>
                                )}

                                {/* Fixed-Position Top Right Corner Label for Split Assignment (clean compact text) */}
                                <div className="absolute top-2 right-2 z-1">
                                  {img.split === 'train' && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#3DA9FC] text-[#14171C] tracking-wide uppercase shadow-sm">
                                      TRAIN
                                    </span>
                                  )}
                                  {img.split === 'val' && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#FFB020] text-[#14171C] tracking-wide uppercase shadow-sm">
                                      VAL
                                    </span>
                                  )}
                                  {img.split === 'test' && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-[#8B93A1] text-[#14171C] tracking-wide uppercase shadow-sm">
                                      TEST
                                    </span>
                                  )}
                                  {(!img.split || img.split === 'unassigned') && (
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold bg-slate-950/70 border border-[#2A2F38]/50 text-[#8B93A1] tracking-wide uppercase">
                                      UNSPLIT
                                    </span>
                                  )}
                                </div>

                                {/* Actions overlay on hover */}
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0C0E12]/95 via-transparent to-transparent opacity-0 group-hover/bracket:opacity-100 transition-opacity flex flex-col justify-end p-2 px-2.5 pb-2">
                                  <p className="text-[10px] text-slate-200 font-medium truncate font-sans" title={img.name}>
                                    {img.name}
                                  </p>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[9px] text-[#8B93A1] font-mono">
                                      {(img.size / 1024).toFixed(1)} KB
                                    </span>
                                    <div className="flex items-center space-x-1.5">
                                      {/* Manual Split selector */}
                                      <select
                                        value={img.split || 'unassigned'}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => handleManualSplitChange(img.id, e.target.value as ImageSplit)}
                                        className="bg-slate-900 border border-slate-800 text-slate-300 text-[10px] rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer font-semibold text-center"
                                        title="Manually override split assignment"
                                      >
                                        <option value="unassigned">Unassigned</option>
                                        <option value="train">Train</option>
                                        <option value="val">Val</option>
                                        <option value="test">Test</option>
                                      </select>

                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDeleteImage(img.id);
                                        }}
                                        className="p-1 rounded bg-red-950/50 text-red-400 border border-red-900/30 hover:bg-red-900/45 hover:text-red-300 transition-all cursor-pointer"
                                        title="Delete image"
                                      >
                                        <Trash size={10} />
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* Filters returned 0 results */
                        <div className="text-center py-16 bg-[#1A1D23] border border-dashed border-slate-800 rounded-xl">
                          <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500 mb-4">
                            <AlertTriangle size={20} className="text-amber-500" />
                          </div>
                          <h4 className="font-sans font-semibold text-sm text-slate-200">No matching images</h4>
                          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
                            No files match your current Split or Annotation filter combinations. Try toggling your filter options above.
                          </p>
                        </div>
                      )
                    ) : (
                      /* Completely empty project image gallery */
                      <div className="text-center py-16 bg-[#1A1D23] border border-dashed border-slate-800 rounded-xl">
                        <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500 mb-4">
                          <FileImage size={20} />
                        </div>
                        <h4 className="font-sans font-semibold text-base text-slate-200">No images inside this project yet</h4>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
                          Drag and drop some files above, or click the files selector to populate this project's annotation staging environment.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer copyright */}
      <footer className="border-t border-slate-800 bg-[#0F1217] py-4 px-6 flex flex-col sm:flex-row items-center justify-between font-mono text-[10px] text-slate-500 gap-2">
        <div className="flex items-center gap-1.5">
          <span className="font-sans font-bold text-slate-400">boxel.</span>
          <span>&copy; 2026. Browser Sandbox Environment.</span>
        </div>
        <div className="flex items-center space-x-3">
          <span>Storage Utilization: ~{(totalImages * 120).toFixed(0)} KB</span>
          <span>&middot;</span>
          <span>v1.0.0</span>
        </div>
      </footer>

      {/* ==============================================================
                              CREATE PROJECT MODAL
         ============================================================== */}
      <AnimatePresence>
        {isCreateOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreateOpen(false)}
              className="absolute inset-0 bg-[#040608]/85 backdrop-blur-xs"
            />
            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-md bg-[#1A1D23] border border-slate-800 rounded-xl shadow-2xl overflow-hidden p-6 z-10 text-slate-200"
              id="create-project-modal"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-2">
                  <div className="p-1.5 rounded-md bg-slate-900 border border-slate-800 text-indigo-400">
                    <FolderPlus size={16} />
                  </div>
                  <h3 className="font-sans font-semibold text-base text-slate-100">
                    Create New Project
                  </h3>
                </div>
                <button
                  onClick={() => setIsCreateOpen(false)}
                  className="p-1 rounded-md text-slate-500 hover:text-slate-300 hover:bg-slate-900 transition-colors cursor-pointer"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleCreateProject} className="mt-4 space-y-4">
                <div>
                  <label htmlFor="project-name-input" className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                    Project Name
                  </label>
                  <input
                    id="project-name-input"
                    type="text"
                    required
                    placeholder="e.g. Traffic Light Annotations"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-slate-800 rounded-lg text-sm bg-slate-900 text-slate-200 focus:bg-[#0A0C10] focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    autoFocus
                  />
                  <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                    Choose a direct, clear name reflecting the class of images or annotations you will make.
                  </p>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="px-4 py-2 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-850 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-indigo-600/15 transition-all cursor-pointer"
                    id="submit-project-btn"
                  >
                    Create Project
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==============================================================
                              DELETE PROJECT MODAL
         ============================================================== */}
      <AnimatePresence>
        {projectToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setProjectToDelete(null)}
              className="absolute inset-0 bg-[#040608]/85 backdrop-blur-xs"
            />
            {/* Modal Body */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-md bg-[#1A1D23] border border-slate-800 rounded-xl shadow-2xl overflow-hidden p-6 z-10 text-slate-200"
              id="delete-confirmation-modal"
            >
              <div className="flex items-start space-x-3.5">
                <div className="p-2.5 rounded-full bg-red-950/45 text-red-400 border border-red-900/35 flex-shrink-0">
                  <AlertCircle size={20} />
                </div>
                <div className="space-y-1">
                  <h3 className="font-sans font-semibold text-base text-slate-100">
                    Delete Project?
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    This action will permanently delete <span className="font-semibold text-slate-200">"{projectToDelete.name}"</span> and destroy all associated image indexes. This action cannot be undone.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-2 mt-6">
                <button
                  type="button"
                  onClick={() => setProjectToDelete(null)}
                  className="px-4 py-2 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-semibold rounded-lg bg-slate-900 hover:bg-slate-850 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteProject(projectToDelete.id)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-red-600/15 transition-colors cursor-pointer"
                  id="confirm-delete-btn"
                >
                  Delete Permanently
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ==============================================================
                              ANNOTATION VIEW
         ============================================================== */}
      <AnimatePresence>
        {annotatorImage && (
          <Annotator
            image={annotatorImage}
            classes={activeProject?.classes || []}
            onSave={handleSaveAnnotations}
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
