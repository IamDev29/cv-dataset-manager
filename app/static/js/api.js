// api.js - All API calls to FastAPI backend
// Uses fetch() with proper error handling
// Returns parsed JSON or throws Error with message from server

const API_BASE = '';

async function fetchApi(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      let errorMessage = `HTTP Error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.detail) {
          errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
        }
      } catch (e) {
        // Ignore json parse errors for error responses
      }
      throw new Error(errorMessage);
    }
    
    // For 204 No Content or empty responses
    if (response.status === 204 || response.headers.get('content-length') === '0') {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error);
    throw error;
  }
}

const API = {
  // Projects
  async getProjects() {
    return fetchApi('/api/projects');
  },
  
  async createProject(name) {
    return fetchApi('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
  },
  
  async deleteProject(id) {
    return fetchApi(`/api/projects/${id}`, {
      method: 'DELETE'
    });
  },
  
  // Classes
  async addClass(projectId, name, color) {
    return fetchApi(`/api/projects/${projectId}/classes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color })
    });
  },
  
  async deleteClass(projectId, classId) {
    return fetchApi(`/api/projects/${projectId}/classes/${classId}`, {
      method: 'DELETE'
    });
  },
  
  // Images
  async getImages(projectId) {
    return fetchApi(`/api/projects/${projectId}/images`);
  },
  
  async uploadImage(projectId, file) {
    const formData = new FormData();
    formData.append('file', file);
    return fetchApi(`/api/projects/${projectId}/images`, {
      method: 'POST',
      body: formData
    });
  },
  
  async uploadBatch(projectId, items) {
    return fetchApi(`/api/projects/${projectId}/images/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items)
    });
  },
  
  async deleteImage(imageId) {
    return fetchApi(`/api/images/${imageId}`, {
      method: 'DELETE'
    });
  },
  
  async saveAnnotations(imageId, annotations) {
    const payload = Array.isArray(annotations) ? { annotations } : annotations;
    return fetchApi(`/api/images/${imageId}/annotations`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  },
  
  async updateSplit(imageId, split) {
    return fetchApi(`/api/images/${imageId}/split`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ split })
    });
  },
  
  // Pipeline
  async autoSplit(projectId, trainPercent, valPercent, testPercent, includeUnannotated) {
    return fetchApi(`/api/projects/${projectId}/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        train_percent: trainPercent,
        val_percent: valPercent,
        test_percent: testPercent,
        include_unannotated: includeUnannotated
      })
    });
  },
  
  async runAugmentation(projectId, opts) {
    return fetchApi(`/api/projects/${projectId}/augment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts)
    });
  },
  
  async clearAugmented(projectId) {
    return fetchApi(`/api/projects/${projectId}/augmented`, {
      method: 'DELETE'
    });
  },
  
  async exportYolo(projectId) {
    const url = `${API_BASE}/api/projects/${projectId}/export`;
    const response = await fetch(url);
    
    if (!response.ok) {
      let errorMessage = `HTTP Error: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData && errorData.detail) {
          errorMessage = typeof errorData.detail === 'string' ? errorData.detail : JSON.stringify(errorData.detail);
        }
      } catch (e) {
        // Ignore json parse errors for error responses
      }
      throw new Error(errorMessage);
    }
    
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    
    // Try to get filename from content-disposition header if available
    let filename = `project_${projectId}_yolo.zip`;
    const disposition = response.headers.get('content-disposition');
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
      const matches = filenameRegex.exec(disposition);
      if (matches != null && matches[1]) {
        filename = matches[1].replace(/['"]/g, '');
      }
    }
    
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
    
    return { success: true, message: 'Export downloaded successfully' };
  },
  
  // Settings
  async getSettings() {
    return fetchApi('/api/settings');
  },
  
  async saveSettings(settings) {
    return fetchApi('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
  },

  // ── AI Model Management ────────────────────────────────────────────────────

  async uploadModel(projectId, file) {
    const formData = new FormData();
    formData.append('file', file);
    return fetchApi(`/api/projects/${projectId}/model`, {
      method: 'POST',
      body: formData
    });
  },

  async getModel(projectId) {
    return fetchApi(`/api/projects/${projectId}/model`);
  },

  async deleteModel(projectId) {
    return fetchApi(`/api/projects/${projectId}/model`, { method: 'DELETE' });
  },

  async setModelClasses(projectId, classNames) {
    return fetchApi(`/api/projects/${projectId}/model/classes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classNames })
    });
  },

  async setClassMapping(projectId, mapping) {
    return fetchApi(`/api/projects/${projectId}/model/mapping`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapping })
    });
  },

  // ── Inference ──────────────────────────────────────────────────────────────

  async runInference(projectId, imageIds, confidenceThreshold) {
    return fetchApi(`/api/projects/${projectId}/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageIds, confidenceThreshold })
    });
  },

  async runInferenceUnannotated(projectId, confidenceThreshold) {
    return fetchApi(`/api/projects/${projectId}/infer/unannotated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageIds: [], confidenceThreshold })
    });
  },

  // ── Suggestion Review ──────────────────────────────────────────────────────

  async acceptSuggestions(imageId, boxIds) {
    // boxIds: string[] — empty array means accept ALL
    return fetchApi(`/api/images/${imageId}/suggestions/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxIds: boxIds || [] })
    });
  },

  async rejectSuggestions(imageId, boxIds) {
    // boxIds: string[] — empty array means reject ALL
    return fetchApi(`/api/images/${imageId}/suggestions/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ boxIds: boxIds || [] })
    });
  }
};

window.API = API;
