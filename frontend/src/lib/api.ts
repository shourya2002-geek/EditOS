// ============================================================================
// API Client — communicates with the EditOS backend via Next.js rewrites
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
    const headers: Record<string, string> = {
      'x-creator-id': 'dev-creator',
      ...(options.headers as Record<string, string>),
    };
    // Only set Content-Type: application/json when there is a body.
    // Fastify rejects empty body with JSON content-type (400).
    if (options.body) {
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(url, {
      ...options,
      headers,
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
    return this.request<any>(`/sessions/${id}/end`, { method: 'POST', body: JSON.stringify({}) });
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
      body: JSON.stringify({}),
    });
  }

  async undoStrategy(strategyId: string) {
    return this.request<any>(`/strategies/${strategyId}/undo`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  // --- Chat (Mistral AI) ---
  async chat(data: {
    conversationId?: string;
    message: string;
    videoDurationMs?: number;
    platform?: string;
  }): Promise<{ message: string; operations: any[]; strategyName?: string }> {
    return this.request<{ message: string; operations: any[]; strategyName?: string }>('/chat', {
      method: 'POST',
      body: JSON.stringify(data),
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

  // --- Publishing ---
  async connectAccount(platform: string, handle: string) {
    return this.request<{ status: string; platform: string; handle: string }>('/publish/connect', {
      method: 'POST',
      body: JSON.stringify({ platform, handle }),
    });
  }

  async getConnectedAccounts() {
    return this.request<{ accounts: Array<{ platform: string; handle: string; connectedAt: number }> }>('/publish/accounts');
  }

  async disconnectAccount(platform: string) {
    return this.request<{ status: string; platform: string }>(`/publish/accounts/${platform}`, {
      method: 'DELETE',
    });
  }

  async publishVideo(data: { platform: string; projectId: string; title: string; description?: string }) {
    return this.request<{ jobId: string; status: string }>('/publish', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getPublishStatus(jobId: string) {
    return this.request<{
      id: string;
      platform: string;
      status: 'queued' | 'processing' | 'published' | 'failed';
      platformUrl?: string;
      error?: string;
    }>(`/publish/${jobId}`);
  }

  // --- Demo ---
  async demoSetup() {
    return this.request<{
      status: string;
      accounts: Array<{ platform: string; handle: string }>;
      projectId: string;
    }>('/demo/setup', { method: 'POST', body: JSON.stringify({}) });
  }

  async demoTeardown() {
    return this.request<{ status: string; cleared: boolean }>('/demo/teardown', {
      method: 'POST',
      body: JSON.stringify({}),
    });
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
