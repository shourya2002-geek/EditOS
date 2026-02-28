// ============================================================================
// STEP 6 — VIDEO EXECUTION LAYER: RENDER QUEUE & WORKER SYSTEM
// ============================================================================
// Production rendering pipeline with:
//   - Priority queue (preview > draft > final)
//   - Worker pool management
//   - Progress tracking
//   - Caching layer
//   - Horizontal scaling readiness
// ============================================================================

import { EventEmitter } from 'events';
import type { Timeline } from './timelineEngine.js';
import type { EditingStrategy } from '../../types/dsl.js';
import type { PlatformSpec } from '../../types/core.js';
import { appConfig } from '../../config/index.js';

// ---------------------------------------------------------------------------
// Render job types
// ---------------------------------------------------------------------------
export type RenderPriority = 'preview' | 'draft' | 'final';
export type RenderStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface RenderJob {
  id: string;
  projectId: string;
  creatorId: string;
  timeline: Timeline;
  strategy: EditingStrategy;
  sourcePath: string;
  outputPath: string;
  platformSpec: PlatformSpec;
  priority: RenderPriority;
  status: RenderStatus;
  progress: number;           // 0-100
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  metadata: {
    estimatedDurationMs: number;
    useGpu: boolean;
    cacheKey?: string;
  };
}

export interface RenderProgress {
  jobId: string;
  progress: number;
  currentPhase: string;
  elapsedMs: number;
  estimatedRemainingMs: number;
}

// ---------------------------------------------------------------------------
// Render queue
// ---------------------------------------------------------------------------
export class RenderQueue {
  private queue: RenderJob[] = [];
  private processing = new Map<string, RenderJob>();
  private completed = new Map<string, RenderJob>();
  private emitter = new EventEmitter();
  private maxConcurrent: number;
  private cache = new Map<string, string>(); // cacheKey → outputPath

  constructor(maxConcurrent?: number) {
    this.maxConcurrent = maxConcurrent ?? appConfig.workers.renderConcurrency;
  }

  /**
   * Enqueue a render job.
   */
  enqueue(job: RenderJob): void {
    // Check cache first
    if (job.metadata.cacheKey && this.cache.has(job.metadata.cacheKey)) {
      job.status = 'completed';
      job.outputPath = this.cache.get(job.metadata.cacheKey)!;
      job.completedAt = Date.now();
      this.completed.set(job.id, job);
      this.emitter.emit('job:completed', job);
      return;
    }

    job.status = 'queued';
    this.queue.push(job);

    // Sort queue: preview > draft > final, then by creation time
    this.queue.sort((a, b) => {
      const priorityOrder = { preview: 0, draft: 1, final: 2 };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      return a.createdAt - b.createdAt;
    });

    this.emitter.emit('job:queued', job);
    this.processNext();
  }

  /**
   * Cancel a queued or processing job.
   */
  cancel(jobId: string): boolean {
    // Remove from queue
    const queueIndex = this.queue.findIndex(j => j.id === jobId);
    if (queueIndex >= 0) {
      const [job] = this.queue.splice(queueIndex, 1);
      job.status = 'cancelled';
      this.emitter.emit('job:cancelled', job);
      return true;
    }

    // Mark processing job for cancellation
    const processing = this.processing.get(jobId);
    if (processing) {
      processing.status = 'cancelled';
      this.processing.delete(jobId);
      this.emitter.emit('job:cancelled', processing);
      return true;
    }

    return false;
  }

  /**
   * Get job status.
   */
  getJob(jobId: string): RenderJob | undefined {
    return this.queue.find(j => j.id === jobId)
      ?? this.processing.get(jobId)
      ?? this.completed.get(jobId);
  }

  /**
   * Get queue statistics.
   */
  getStats(): {
    queued: number;
    processing: number;
    completed: number;
    avgRenderTimeMs: number;
  } {
    const completedJobs = Array.from(this.completed.values());
    const avgRenderTimeMs = completedJobs.length > 0
      ? completedJobs.reduce((s, j) => {
          const duration = (j.completedAt ?? 0) - (j.startedAt ?? 0);
          return s + duration;
        }, 0) / completedJobs.length
      : 0;

    return {
      queued: this.queue.length,
      processing: this.processing.size,
      completed: this.completed.size,
      avgRenderTimeMs,
    };
  }

  /**
   * Subscribe to queue events.
   */
  on(
    event: 'job:queued' | 'job:started' | 'job:progress' | 'job:completed' | 'job:failed' | 'job:cancelled',
    handler: (job: RenderJob) => void,
  ): void {
    this.emitter.on(event, handler);
  }

  /**
   * Report progress for a processing job.
   */
  reportProgress(jobId: string, progress: RenderProgress): void {
    const job = this.processing.get(jobId);
    if (job) {
      job.progress = progress.progress;
      this.emitter.emit('job:progress', job);
    }
  }

  /**
   * Complete a job.
   */
  completeJob(jobId: string, outputPath: string): void {
    const job = this.processing.get(jobId);
    if (job) {
      job.status = 'completed';
      job.outputPath = outputPath;
      job.completedAt = Date.now();
      job.progress = 100;
      this.processing.delete(jobId);
      this.completed.set(jobId, job);

      // Cache the result
      if (job.metadata.cacheKey) {
        this.cache.set(job.metadata.cacheKey, outputPath);
      }

      this.emitter.emit('job:completed', job);
      this.processNext();
    }
  }

  /**
   * Fail a job.
   */
  failJob(jobId: string, error: string): void {
    const job = this.processing.get(jobId);
    if (job) {
      job.status = 'failed';
      job.error = error;
      job.completedAt = Date.now();
      this.processing.delete(jobId);
      this.emitter.emit('job:failed', job);
      this.processNext();
    }
  }

  // --- Private ---

  private processNext(): void {
    while (this.processing.size < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift()!;
      job.status = 'processing';
      job.startedAt = Date.now();
      this.processing.set(job.id, job);
      this.emitter.emit('job:started', job);
    }
  }
}
