// ============================================================================
// STEP 6 — VIDEO EXECUTION LAYER: RENDER WORKER
// ============================================================================
// Worker process that picks up render jobs, executes FFmpeg pipelines,
// reports progress, handles errors / retries.
// In production this runs as a separate process via BullMQ; here we
// implement the in-process worker loop plus the BullMQ-compatible shim.
// ============================================================================

import { EventEmitter } from 'events';
import { RenderQueue, type RenderJob, type RenderProgress } from './renderQueue.js';
import { FFmpegCommandBuilder, type HardwareProfile, type FFmpegCommand } from './ffmpegBuilder.js';
import { TimelineEngine, type Timeline } from './timelineEngine.js';
import type { EditingStrategy } from '../../types/dsl.js';
import type { VideoMetadata } from '../../types/core.js';

// ---------------------------------------------------------------------------
// Worker configuration
// ---------------------------------------------------------------------------
export interface WorkerConfig {
  id: string;
  hwProfile: HardwareProfile;
  maxJobs: number;
  tempDir: string;
  outputDir: string;
}

// ---------------------------------------------------------------------------
// Render worker
// ---------------------------------------------------------------------------
export class RenderWorker {
  private emitter = new EventEmitter();
  private activeJobs = new Map<string, AbortController>();
  private running = false;
  private ffmpegBuilder: FFmpegCommandBuilder;

  constructor(
    private config: WorkerConfig,
    private queue: RenderQueue,
  ) {
    this.ffmpegBuilder = new FFmpegCommandBuilder(config.hwProfile);
  }

  /**
   * Start listening for jobs from the queue.
   */
  start(): void {
    this.running = true;

    this.queue.on('job:started', (job: RenderJob) => {
      if (this.activeJobs.size < this.config.maxJobs) {
        this.executeJob(job).catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          this.queue.failJob(job.id, message);
        });
      }
    });

    this.emitter.emit('worker:started', { workerId: this.config.id });
  }

  /**
   * Gracefully stop the worker (drain current jobs, refuse new ones).
   */
  async stop(): Promise<void> {
    this.running = false;

    // Signal all active jobs to cancel
    for (const [jobId, controller] of this.activeJobs) {
      controller.abort();
    }

    // Wait for all active jobs to finish (max 30s)
    const deadline = Date.now() + 30_000;
    while (this.activeJobs.size > 0 && Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 200));
    }

    this.emitter.emit('worker:stopped', { workerId: this.config.id });
  }

  /**
   * Execute a single render job through the FFmpeg pipeline.
   */
  private async executeJob(job: RenderJob): Promise<void> {
    const controller = new AbortController();
    this.activeJobs.set(job.id, controller);

    try {
      // Phase 1: Determine render commands
      const isPreview = job.priority === 'preview';
      const commands = isPreview
        ? [this.ffmpegBuilder.buildPreviewCommand(
            job.timeline,
            job.sourcePath,
            `${this.config.tempDir}/${job.id}_preview.mp4`,
            job.platformSpec,
          )]
        : this.ffmpegBuilder.buildRenderCommands(
            job.timeline,
            job.sourcePath,
            `${this.config.outputDir}/${job.id}_final.mp4`,
            job.platformSpec,
          );

      const totalPasses = commands.length;

      // Phase 2: Execute each render pass sequentially
      for (let i = 0; i < commands.length; i++) {
        if (controller.signal.aborted || job.status === 'cancelled') {
          return;
        }

        const pass = commands[i];
        const phaseProgress = ((i) / totalPasses) * 100;

        // Report pass start
        this.queue.reportProgress(job.id, {
          jobId: job.id,
          progress: phaseProgress,
          currentPhase: `Pass ${i + 1}/${totalPasses}`,
          elapsedMs: Date.now() - (job.startedAt ?? Date.now()),
          estimatedRemainingMs: this.estimateRemaining(job, phaseProgress),
        });

        // Simulate FFmpeg execution (in production, shell out to ffmpeg)
        await this.executeFfmpegPass(job.id, pass, controller.signal, (passProgress: number) => {
          const overallProgress = ((i + passProgress / 100) / totalPasses) * 100;
          this.queue.reportProgress(job.id, {
            jobId: job.id,
            progress: Math.round(overallProgress),
            currentPhase: `Pass ${i + 1}/${totalPasses}`,
            elapsedMs: Date.now() - (job.startedAt ?? Date.now()),
            estimatedRemainingMs: this.estimateRemaining(job, overallProgress),
          });
        });
      }

      // Phase 3: Complete
      const outputPath = isPreview
        ? `${this.config.tempDir}/${job.id}_preview.mp4`
        : `${this.config.outputDir}/${job.id}_final.mp4`;

      this.queue.completeJob(job.id, outputPath);

    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const message = err instanceof Error ? err.message : String(err);
      this.queue.failJob(job.id, message);
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Execute a single FFmpeg pass.
   * In production, this spawns a child process; here we simulate.
   */
  private async executeFfmpegPass(
    jobId: string,
    command: FFmpegCommand,
    signal: AbortSignal,
    onProgress: (percent: number) => void,
  ): Promise<void> {
    // Construct command and log it
    const cmdString = JSON.stringify(command);
    this.emitter.emit('ffmpeg:command', { jobId, command: cmdString });

    // --- PRODUCTION IMPLEMENTATION ---
    // In production, replace this with actual process spawn:
    //
    // const proc = spawn('ffmpeg', command, { signal });
    // return new Promise((resolve, reject) => {
    //   proc.stderr.on('data', (chunk) => {
    //     const text = chunk.toString();
    //     const progress = parseFfmpegProgress(text, totalDuration);
    //     if (progress !== null) onProgress(progress);
    //   });
    //   proc.on('close', (code) => {
    //     if (code === 0) resolve();
    //     else reject(new Error(`ffmpeg exited with code ${code}`));
    //   });
    //   proc.on('error', reject);
    // });

    // Simulated execution for development/testing
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      if (signal.aborted) return;
      await new Promise(r => setTimeout(r, 100));
      onProgress((i / steps) * 100);
    }
  }

  /**
   * Estimate remaining time based on progress and elapsed.
   */
  private estimateRemaining(job: RenderJob, progress: number): number {
    if (progress <= 0) return job.metadata.estimatedDurationMs;
    const elapsed = Date.now() - (job.startedAt ?? Date.now());
    const rate = progress / elapsed;
    return Math.round((100 - progress) / rate);
  }

  /**
   * Subscribe to worker events.
   */
  on(
    event: 'worker:started' | 'worker:stopped' | 'ffmpeg:command',
    handler: (...args: any[]) => void,
  ): void {
    this.emitter.on(event, handler);
  }
}

// ---------------------------------------------------------------------------
// Worker pool manager
// ---------------------------------------------------------------------------
export class WorkerPool {
  private workers = new Map<string, RenderWorker>();

  constructor(
    private queue: RenderQueue,
    private defaultHwProfile: HardwareProfile,
  ) {}

  /**
   * Spawn a set of workers.
   */
  spawn(count: number, tempDir: string, outputDir: string): void {
    for (let i = 0; i < count; i++) {
      const id = `worker-${i}`;
      if (!this.workers.has(id)) {
        const worker = new RenderWorker(
          {
            id,
            hwProfile: this.defaultHwProfile,
            maxJobs: 1,
            tempDir,
            outputDir,
          },
          this.queue,
        );
        worker.start();
        this.workers.set(id, worker);
      }
    }
  }

  /**
   * Gracefully stop all workers.
   */
  async shutdown(): Promise<void> {
    await Promise.all(
      Array.from(this.workers.values()).map(w => w.stop()),
    );
    this.workers.clear();
  }

  /**
   * Get number of active workers.
   */
  get size(): number {
    return this.workers.size;
  }
}

// ---------------------------------------------------------------------------
// FFmpeg progress parser (utility)
// ---------------------------------------------------------------------------
export function parseFfmpegProgress(stderrLine: string, totalDurationSec: number): number | null {
  // FFmpeg outputs lines like: frame=  120 fps=30 time=00:00:04.00 bitrate=...
  const timeMatch = stderrLine.match(/time=(\d+):(\d+):(\d+\.\d+)/);
  if (!timeMatch) return null;

  const hours = parseInt(timeMatch[1], 10);
  const minutes = parseInt(timeMatch[2], 10);
  const seconds = parseFloat(timeMatch[3]);
  const currentSec = hours * 3600 + minutes * 60 + seconds;

  return Math.min((currentSec / totalDurationSec) * 100, 100);
}
