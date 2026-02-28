// ============================================================================
// API Client — communicates with the VIRCUT backend via Next.js rewrites
// ============================================================================

const API_BASE = '/api/v1';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE) {
    this.baseUrl = baseUrl;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-creator-id': 'dev-creator',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `API error: ${res.status}`);
    }

    return res.json();
  }

  // --- Projects ---
  async listProjects() {
    return this.request<{ projects: any[]; total: number }>('/projects');
  }

  async getProject(id: string) {
    return this.request<any>(`/projects/${id}`);
  }

  async createProject(data: { name: string; platform?: string }) {
    return this.request<any>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async uploadVideo(
    projectId: string,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<any> {
    const formData = new FormData();
    formData.append('video', file);

    // Use XMLHttpRequest for progress tracking
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${this.baseUrl}/projects/${projectId}/upload`);
      xhr.setRequestHeader('x-creator-id', 'dev-creator');

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            reject(new Error(JSON.parse(xhr.responseText).error));
          } catch {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Upload failed — network error'));
      xhr.send(formData);
    });
  }

  getVideoUrl(projectId: string): string {
    return `${this.baseUrl}/projects/${projectId}/video`;
  }

  // --- Sessions ---
  async createSession(projectId: string) {
    return this.request<any>('/sessions', {
      method: 'POST',
      body: JSON.stringify({ projectId }),
    });
  }

  async getSession(id: string) {
    return this.request<any>(`/sessions/${id}`);
  }

  async endSession(id: string) {
    return this.request<any>(`/sessions/${id}/end`, { method: 'POST' });
  }

  // --- Strategies ---
  async generateStrategy(data: {
    projectId: string;
    intent: string;
    platform?: string;
  }) {
    return this.request<any>('/strategies/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async previewStrategy(strategyId: string, timestamp?: number) {
    return this.request<any>(`/strategies/${strategyId}/preview`, {
      method: 'POST',
      body: JSON.stringify({ timestamp }),
    });
  }

  async applyStrategy(strategyId: string) {
    return this.request<any>(`/strategies/${strategyId}/apply`, {
      method: 'POST',
    });
  }

  async undoStrategy(strategyId: string) {
    return this.request<any>(`/strategies/${strategyId}/undo`, {
      method: 'POST',
    });
  }

  // --- Render ---
  async submitRender(data: {
    projectId: string;
    strategyId: string;
    priority?: string;
    platform?: string;
  }) {
    return this.request<any>('/render/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getRenderStatus(jobId: string) {
    return this.request<any>(`/render/${jobId}`);
  }

  async listRenderJobs() {
    return this.request<any>('/render/queue');
  }

  // --- Creator / Learning ---
  async getCreatorProfile(creatorId: string) {
    return this.request<any>(`/creators/${creatorId}/profile`);
  }

  async getCreatorAnalytics(creatorId: string) {
    return this.request<any>(`/creators/${creatorId}/analytics`);
  }

  // --- Experiments ---
  async listExperiments() {
    return this.request<any>('/experiments');
  }

  async createExperiment(data: { name: string; variants: any[] }) {
    return this.request<any>('/experiments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getExperimentResults(id: string) {
    return this.request<any>(`/experiments/${id}/results`);
  }

  // --- Health ---
  async health() {
    const res = await fetch('/health');
    return res.json();
  }

  // --- Metrics ---
  async getMetrics() {
    return this.request<any>('/metrics');
  }
}

export const api = new ApiClient();
