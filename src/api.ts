import {
  Project,
  ProjectClass,
  ProjectImage,
  BoundingBox,
  ImageSplit,
  ProjectModel,
  AutoSplitRequest,
  AugmentRequest,
  Settings,
  BatchImageItem,
  SetMappingResponse,
  TrainingJob,
  StartTrainingRequest,
} from './types';

const API_BASE = ((import.meta as any)?.env?.VITE_API_BASE ?? '').replace(/\/$/, '');

class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `Request failed with status ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      } else if (errJson?.message) {
        errorDetail = errJson.message;
      }
    } catch {
      // Body is not JSON, use default errorDetail
    }
    throw new ApiError(errorDetail, res.status);
  }

  // If 204 No Content
  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

export const api = {
  // ── Projects ─────────────────────────────────────────────────────────────
  async listProjects(): Promise<Project[]> {
    const res = await fetch(`${API_BASE}/api/projects`);
    return handleResponse<Project[]>(res);
  },

  async createProject(name: string): Promise<Project> {
    const res = await fetch(`${API_BASE}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    return handleResponse<Project>(res);
  },

  async deleteProject(projectId: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    });
    return handleResponse<{ ok: boolean }>(res);
  },

  async addClass(projectId: string, name: string, color: string): Promise<ProjectClass> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/classes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });
    return handleResponse<ProjectClass>(res);
  },

  async deleteClass(projectId: string, classId: string): Promise<{ ok: boolean }> {
    const res = await fetch(
      `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/classes/${encodeURIComponent(classId)}`,
      {
        method: 'DELETE',
      }
    );
    return handleResponse<{ ok: boolean }>(res);
  },

  // ── Images & Annotations ──────────────────────────────────────────────────
  async listImages(projectId: string): Promise<ProjectImage[]> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/images`);
    return handleResponse<ProjectImage[]>(res);
  },

  async uploadImage(projectId: string, file: File): Promise<ProjectImage> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/images`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<ProjectImage>(res);
  },

  async uploadImagesBatch(projectId: string, items: BatchImageItem[]): Promise<ProjectImage[]> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/images/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
    return handleResponse<ProjectImage[]>(res);
  },

  async deleteImage(imageId: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${API_BASE}/api/images/${encodeURIComponent(imageId)}`, {
      method: 'DELETE',
    });
    return handleResponse<{ ok: boolean }>(res);
  },

  async saveAnnotations(imageId: string, annotations: BoundingBox[]): Promise<ProjectImage> {
    const res = await fetch(`${API_BASE}/api/images/${encodeURIComponent(imageId)}/annotations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations }),
    });
    return handleResponse<ProjectImage>(res);
  },

  async updateImageSplit(imageId: string, split: ImageSplit): Promise<ProjectImage> {
    const res = await fetch(`${API_BASE}/api/images/${encodeURIComponent(imageId)}/split`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ split }),
    });
    return handleResponse<ProjectImage>(res);
  },

  // ── Settings ─────────────────────────────────────────────────────────────
  async getSettings(): Promise<Settings> {
    const res = await fetch(`${API_BASE}/api/settings`);
    return handleResponse<Settings>(res);
  },

  async saveSettings(settings: Partial<Settings>): Promise<Settings> {
    const res = await fetch(`${API_BASE}/api/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return handleResponse<Settings>(res);
  },

  // ── Pipeline (Split, Augment, Export) ────────────────────────────────────
  async autoSplit(projectId: string, req: AutoSplitRequest): Promise<ProjectImage[]> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return handleResponse<ProjectImage[]>(res);
  },

  async runAugmentation(projectId: string, req: AugmentRequest): Promise<ProjectImage[]> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/augment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return handleResponse<ProjectImage[]>(res);
  },

  async clearAugmented(projectId: string): Promise<{ deleted_count: number }> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/augmented`, {
      method: 'DELETE',
    });
    return handleResponse<{ deleted_count: number }>(res);
  },

  async exportDatasetBlob(projectId: string): Promise<Blob> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/export`);
    if (!res.ok) {
      let errorDetail = `Export failed with status ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.detail) {
          errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch {
        // Body is not JSON
      }
      throw new ApiError(errorDetail, res.status);
    }
    return res.blob();
  },

  // ── AI Models & Inference ────────────────────────────────────────────────
  async uploadModel(projectId: string, file: File): Promise<ProjectModel> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/model`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse<ProjectModel>(res);
  },

  async getModel(projectId: string): Promise<ProjectModel> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/model`);
    return handleResponse<ProjectModel>(res);
  },

  async deleteModel(projectId: string): Promise<{ ok: boolean }> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/model`, {
      method: 'DELETE',
    });
    return handleResponse<{ ok: boolean }>(res);
  },

  async setModelClasses(projectId: string, classNames: string[]): Promise<ProjectModel> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/model/classes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classNames }),
    });
    return handleResponse<ProjectModel>(res);
  },

  async setModelMapping(projectId: string, mapping: Record<string, string>): Promise<SetMappingResponse> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/model/mapping`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapping }),
    });
    return handleResponse<SetMappingResponse>(res);
  },

  async runInference(
    projectId: string,
    imageIds: string[],
    confidenceThreshold?: number
  ): Promise<ProjectImage[]> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageIds,
        confidenceThreshold: confidenceThreshold ?? 0.5,
      }),
    });
    return handleResponse<ProjectImage[]>(res);
  },

  async runInferenceUnannotated(
    projectId: string,
    confidenceThreshold?: number
  ): Promise<ProjectImage[]> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/infer/unannotated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageIds: [],
        confidenceThreshold: confidenceThreshold ?? 0.5,
      }),
    });
    return handleResponse<ProjectImage[]>(res);
  },

  async acceptSuggestions(imageId: string, boxIds?: string[]): Promise<ProjectImage> {
    const res = await fetch(`${API_BASE}/api/images/${encodeURIComponent(imageId)}/suggestions/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxIds: boxIds ?? [] }),
    });
    return handleResponse<ProjectImage>(res);
  },

  async rejectSuggestions(imageId: string, boxIds?: string[]): Promise<ProjectImage> {
    const res = await fetch(`${API_BASE}/api/images/${encodeURIComponent(imageId)}/suggestions/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxIds: boxIds ?? [] }),
    });
    return handleResponse<ProjectImage>(res);
  },

  // ── Model Training ────────────────────────────────────────────────────────
  async startTraining(projectId: string, req: StartTrainingRequest): Promise<TrainingJob> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/train`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return handleResponse<TrainingJob>(res);
  },

  async listTrainingJobs(projectId: string): Promise<TrainingJob[]> {
    const res = await fetch(`${API_BASE}/api/projects/${encodeURIComponent(projectId)}/train/jobs`);
    return handleResponse<TrainingJob[]>(res);
  },

  async getTrainingJob(projectId: string, jobId: string): Promise<TrainingJob> {
    const res = await fetch(
      `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/train/jobs/${encodeURIComponent(jobId)}`
    );
    return handleResponse<TrainingJob>(res);
  },

  async cancelTrainingJob(projectId: string, jobId: string): Promise<TrainingJob> {
    const res = await fetch(
      `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/train/jobs/${encodeURIComponent(jobId)}/cancel`,
      {
        method: 'POST',
      }
    );
    return handleResponse<TrainingJob>(res);
  },

  getTrainingDownloadUrl(projectId: string, jobId: string, format: 'pt' | 'onnx'): string {
    return `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/train/jobs/${encodeURIComponent(jobId)}/download?format=${format}`;
  },

  async downloadTrainingOutput(projectId: string, jobId: string, format: 'pt' | 'onnx'): Promise<Blob> {
    const res = await fetch(this.getTrainingDownloadUrl(projectId, jobId, format));
    if (!res.ok) {
      let errorDetail = `Download failed with status ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.detail) {
          errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
        }
      } catch {}
      throw new ApiError(errorDetail, res.status);
    }
    return res.blob();
  },

  // ── Species Modules & Active Models ───────────────────────────────────────
  async listSpeciesModules(): Promise<SpeciesModule[]> {
    const res = await fetch(`${API_BASE}/api/species-modules`);
    return handleResponse<SpeciesModule[]>(res);
  },

  async createSpeciesModule(req: CreateSpeciesModuleRequest): Promise<SpeciesModule> {
    const res = await fetch(`${API_BASE}/api/species-modules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return handleResponse<SpeciesModule>(res);
  },

  async deleteSpeciesModule(slug: string): Promise<{ ok: boolean; message?: string }> {
    const res = await fetch(`${API_BASE}/api/species-modules/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    });
    return handleResponse<{ ok: boolean; message?: string }>(res);
  },

  async getSpeciesModelsStatus(): Promise<SpeciesModelStatus[]> {
    const res = await fetch(`${API_BASE}/api/species-models`);
    return handleResponse<SpeciesModelStatus[]>(res);
  },

  async activateTrainingJob(projectId: string, jobId: string, speciesSlug: string): Promise<TrainingJob> {
    const res = await fetch(
      `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/train/jobs/${encodeURIComponent(jobId)}/activate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ species_slug: speciesSlug }),
      }
    );
    return handleResponse<TrainingJob>(res);
  },

  async deactivateTrainingJob(projectId: string, jobId: string): Promise<TrainingJob> {
    const res = await fetch(
      `${API_BASE}/api/projects/${encodeURIComponent(projectId)}/train/jobs/${encodeURIComponent(jobId)}/deactivate`,
      {
        method: 'POST',
      }
    );
    return handleResponse<TrainingJob>(res);
  },
};

export { ApiError };

