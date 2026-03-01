// ============================================================================
// STEP 9 — PRODUCTION BACKEND: SERVICE LAYER
// ============================================================================
// Service classes that wire together core engines, agents, and storage.
// These are injected into the Fastify app and used by route handlers.
// ============================================================================

import { EventEmitter } from 'events';
import { IntentInterpreter, STYLE_TAXONOMY } from '../core/intent/intentInterpreter.js';
import { StrategyCompiler } from '../core/dsl/strategyCompiler.js';
import { ExecutionEngine } from '../core/dsl/executionEngine.js';
import { TimelineEngine, type Timeline } from '../core/video/timelineEngine.js';
import { RenderQueue, type RenderJob, type RenderPriority } from '../core/video/renderQueue.js';
import { WorkerPool, type RenderWorker } from '../core/video/renderWorker.js';
import type { HardwareProfile } from '../core/video/ffmpegBuilder.js';
import { StyleProfileManager, StrategyAdaptationEngine } from '../core/learning/styleProfile.js';
import { ExperimentEngine } from '../core/learning/experimentEngine.js';
import { CollaborationManager } from '../core/collaboration/collaborationEngine.js';
import { VoicePipeline } from '../core/voice/voicePipeline.js';
import { AgentRouter } from '../core/agents/agentRouter.js';
import { OrchestratorAgent } from '../core/agents/orchestratorAgent.js';
import { MistralClient } from '../core/agents/mistralClient.js';
import type { EditingStrategy } from '../types/dsl.js';
import type { VideoMetadata, Platform, PlatformSpec } from '../types/core.js';
import { appConfig } from '../config/index.js';

// ---------------------------------------------------------------------------
// In-memory stores (in production, replace with Redis/Postgres)
// ---------------------------------------------------------------------------
class InMemoryStore<T extends { id?: string }> {
  private data = new Map<string, T>();

  async create(item: T & { id: string }): Promise<T> {
    this.data.set(item.id, item);
    return item;
  }

  async get(id: string): Promise<T | undefined> {
    return this.data.get(id);
  }

  async list(filter?: (item: T) => boolean): Promise<T[]> {
    const all = Array.from(this.data.values());
    return filter ? all.filter(filter) : all;
  }

  async update(id: string, partial: Partial<T>): Promise<T | undefined> {
    const existing = this.data.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...partial };
    this.data.set(id, updated);
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    return this.data.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Project Service
// ---------------------------------------------------------------------------
export class ProjectService {
  private store = new InMemoryStore<any>();

  async create(project: any): Promise<any> {
    return this.store.create(project);
  }

  async get(id: string): Promise<any> {
    return this.store.get(id);
  }

  async list(opts: { creatorId?: string; limit: number; offset: number }): Promise<{ projects: any[]; total: number }> {
    const all = await this.store.list(
      opts.creatorId ? (p: any) => p.creatorId === opts.creatorId : undefined,
    );
    return {
      projects: all.slice(opts.offset, opts.offset + opts.limit),
      total: all.length,
    };
  }

  async update(id: string, data: any): Promise<any> {
    return this.store.update(id, data);
  }
}

// ---------------------------------------------------------------------------
// Session Service
// ---------------------------------------------------------------------------
export class SessionService {
  private store = new InMemoryStore<any>();

  async create(session: any): Promise<any> {
    return this.store.create(session);
  }

  async get(id: string): Promise<any> {
    return this.store.get(id);
  }

  async end(id: string): Promise<void> {
    await this.store.update(id, { status: 'ended', endedAt: Date.now() });
  }
}

// ---------------------------------------------------------------------------
// Strategy Service
// ---------------------------------------------------------------------------
export class StrategyService {
  private store = new InMemoryStore<any>();
  private intentInterpreter = new IntentInterpreter();
  private strategyCompiler: StrategyCompiler;
  private executionEngine = new ExecutionEngine();
  private timelineEngine = new TimelineEngine();
  private adaptationEngine: StrategyAdaptationEngine;
  private emitter = new EventEmitter();

  constructor(
    private profileManager: StyleProfileManager,
  ) {
    this.strategyCompiler = new StrategyCompiler();
    this.adaptationEngine = new StrategyAdaptationEngine(profileManager);
  }

  async generateFromIntent(params: {
    projectId: string;
    creatorId: string;
    intent: string;
    platform?: string;
  }): Promise<any> {
    // Step 1: Interpret intent
    const creativeIntent = this.intentInterpreter.interpretLocal(params.intent);

    // Step 2: Compile strategy
    const strategy = this.strategyCompiler.compile({
      intent: creativeIntent,
      transcript: [],
      audio: {
        loudnessLUFS: -14,
        peakDb: -1,
        silenceRegions: [],
        energyProfile: [],
        speechRate: 150,
        musicPresence: false,
        musicSegments: [],
      },
      scene: {
        shots: [],
        faces: [],
        motionIntensity: [],
        brightnessProfile: [],
        dominantColors: [],
      },
      videoMeta: {
        id: `vid_${Date.now()}`,
        durationMs: 60000,
        width: 1080,
        height: 1920,
        fps: 30,
        codec: 'h264',
        bitrate: 5000000,
        fileSize: 10000000,
        hasAudio: true,
        audioCodec: 'aac',
        audioSampleRate: 44100,
        audioChannels: 2,
      },
      creatorProfile: this.profileManager.getProfile(params.creatorId) as any,
    });

    // Step 3: Adapt based on learned preferences
    const adapted = this.adaptationEngine.adapt(params.creatorId, strategy);

    // Step 4: Store
    const strategyRecord = {
      id: `strat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      projectId: params.projectId,
      creatorId: params.creatorId,
      intent: creativeIntent,
      strategy: adapted,
      status: 'generated',
      createdAt: Date.now(),
    };

    await this.store.create(strategyRecord);
    this.emitter.emit('strategy:generated', strategyRecord);

    return strategyRecord;
  }

  async generatePreview(strategyId: string, timestamp?: number): Promise<any> {
    const record = await this.store.get(strategyId);
    if (!record) return null;

    // Create timeline and apply strategy
    const timeline = this.timelineEngine.createTimeline(
      record.projectId ?? 'unknown',
      record.strategy.metadata?.estimatedRenderTimeMs ?? 60000,
    );

    return {
      strategyId,
      timeline: {
        duration: timeline.durationMs,
        trackCount: timeline.tracks.length,
        operationCount: record.strategy.operations.length,
      },
      previewTimestamp: timestamp ?? 0,
      status: 'preview_ready',
    };
  }

  async apply(strategyId: string): Promise<any> {
    const record = await this.store.get(strategyId);
    if (!record) return null;

    await this.store.update(strategyId, { status: 'applied' });
    this.emitter.emit('strategy:applied', record);

    return {
      strategyId,
      status: 'applied',
      operationCount: record.strategy.operations.length,
    };
  }

  async undo(strategyId: string): Promise<any> {
    const record = await this.store.get(strategyId);
    if (!record) return null;

    // Pop last operation
    if (record.strategy.operations.length > 0) {
      const undone = record.strategy.operations.pop();
      await this.store.update(strategyId, { strategy: record.strategy });
      return { strategyId, undone, remainingOperations: record.strategy.operations.length };
    }

    return { strategyId, undone: null, remainingOperations: 0 };
  }

  on(event: string, handler: (...args: any[]) => void): void {
    this.emitter.on(event, handler);
  }
}

// ---------------------------------------------------------------------------
// Render Service
// ---------------------------------------------------------------------------
export class RenderService {
  constructor(
    private queue: RenderQueue,
    private workerPool: WorkerPool,
  ) {}

  async submit(params: {
    projectId: string;
    strategyId: string;
    priority?: string;
    platform?: string;
  }): Promise<any> {
    const job: RenderJob = {
      id: `render_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      projectId: params.projectId,
      creatorId: 'system',
      timeline: {
        id: `tl_${Date.now()}`,
        projectId: params.projectId,
        version: 1,
        durationMs: 60000,
        fps: 30,
        width: 1080,
        height: 1920,
        tracks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      strategy: {
        id: `strat_${Date.now()}`,
        version: 1,
        sourceVideoId: params.projectId,
        targetPlatform: (params.platform ?? 'tiktok') as Platform,
        targetDurationMs: 60000,
        operations: [],
        style: {} as any,
        metadata: {
          generatedAt: Date.now(),
          agentModel: 'ministral-8b-latest',
          confidenceScore: 0.8,
          estimatedRenderTimeMs: 30000,
          warnings: [],
        },
      },
      sourcePath: `/storage/projects/${params.projectId}/source.mp4`,
      outputPath: `/storage/projects/${params.projectId}/output.mp4`,
      platformSpec: {
        platform: (params.platform ?? 'tiktok') as Platform,
        maxDurationMs: 60000,
        aspectRatio: '9:16' as const,
        safeZone: { top: 0.1, bottom: 0.1, left: 0.05, right: 0.05 },
        captionZone: { yStart: 0.7, yEnd: 0.95 },
        maxFileSize: 50_000_000,
        preferredCodec: 'h264',
        preferredBitrate: 5_000_000,
      },
      priority: (params.priority ?? 'draft') as RenderPriority,
      status: 'queued',
      progress: 0,
      createdAt: Date.now(),
      metadata: {
        estimatedDurationMs: 30000,
        useGpu: true,
      },
    };

    this.queue.enqueue(job);

    return {
      jobId: job.id,
      status: job.status,
      priority: job.priority,
      estimatedDurationMs: job.metadata.estimatedDurationMs,
    };
  }

  async getJob(jobId: string): Promise<any> {
    return this.queue.getJob(jobId);
  }

  async cancel(jobId: string): Promise<boolean> {
    return this.queue.cancel(jobId);
  }

  async getStats(): Promise<any> {
    return this.queue.getStats();
  }
}

// ---------------------------------------------------------------------------
// Learning Service
// ---------------------------------------------------------------------------
export class LearningService {
  constructor(
    private profileManager: StyleProfileManager,
    private experimentEngine: ExperimentEngine,
  ) {}

  getProfile(creatorId: string): any {
    return this.profileManager.getProfile(creatorId);
  }

  updateProfile(creatorId: string, updates: any): any {
    const profile = this.profileManager.getProfile(creatorId);
    // Shallow merge of updates into profile sections
    if (updates.identity) Object.assign(profile.identity, updates.identity);
    if (updates.pacing) Object.assign(profile.pacing, updates.pacing);
    if (updates.captions) Object.assign(profile.captions, updates.captions);
    if (updates.visual) Object.assign(profile.visual, updates.visual);
    if (updates.hook) Object.assign(profile.hook, updates.hook);
    profile.updatedAt = Date.now();
    profile.version++;
    return profile;
  }

  findSimilar(creatorId: string, topK: number): any {
    return this.profileManager.findSimilarCreators(creatorId, topK);
  }

  ingestAnalytics(creatorId: string, analytics: any): void {
    this.profileManager.ingestAnalytics(creatorId, analytics);
  }
}

// ---------------------------------------------------------------------------
// Collab Service
// ---------------------------------------------------------------------------
export class CollabService {
  constructor(private collab: CollaborationManager) {}

  createSession(params: { projectId: string; name: string; ownerId: string; ownerName: string }): any {
    const owner = {
      id: params.ownerId,
      name: params.ownerName,
      role: 'owner' as const,
      color: '#FF6B6B',
      isOnline: true,
      lastActive: Date.now(),
    };
    return this.collab.createSession(params.projectId, params.name, owner);
  }

  getSession(projectId: string): any {
    const session = this.collab.getSession(projectId);
    if (!session) return null;
    return {
      ...session,
      collaborators: Array.from(session.collaborators.values()),
    };
  }

  getScriptBoard(projectId: string): any[] {
    return this.collab.getScriptBoard(projectId);
  }

  getMemories(projectId: string, category?: string): any[] {
    return this.collab.getMemories(projectId, category as any);
  }
}

// ---------------------------------------------------------------------------
// Experiment Service
// ---------------------------------------------------------------------------
export class ExperimentService {
  constructor(
    private engine: ExperimentEngine,
    private profileManager: StyleProfileManager,
  ) {}

  create(params: { creatorId: string; name: string; hypothesis: string; dimension: string }): any {
    const profile = this.profileManager.getProfile(params.creatorId);
    return this.engine.createExperiment(
      params.creatorId,
      profile,
      params.name,
      params.hypothesis,
      params.dimension as any,
    );
  }

  start(experimentId: string): void {
    this.engine.startExperiment(experimentId);
  }

  getResults(experimentId: string): any {
    return this.engine.getResults(experimentId);
  }

  recordResult(experimentId: string, variantId: string, analytics: any): void {
    this.engine.recordResult(experimentId, variantId, analytics);
  }

  listAll(creatorId?: string): any[] {
    if (creatorId) {
      return this.engine.getActiveExperiments(creatorId);
    }
    // Return all experiments (no filter method exists, so return active for default creator)
    return this.engine.getActiveExperiments(creatorId ?? 'dev-creator');
  }
}

// ---------------------------------------------------------------------------
// Metrics Service (lightweight in-memory)
// ---------------------------------------------------------------------------
export class MetricsService {
  private latencies = new Map<string, number[]>();

  recordLatency(method: string, url: string, durationMs: number): void {
    const key = `${method} ${url}`;
    if (!this.latencies.has(key)) {
      this.latencies.set(key, []);
    }
    const arr = this.latencies.get(key)!;
    arr.push(durationMs);
    // Keep last 1000 per route
    if (arr.length > 1000) arr.splice(0, arr.length - 1000);
  }

  getMetrics(): Record<string, { count: number; avgMs: number; p95Ms: number; p99Ms: number }> {
    const result: Record<string, any> = {};
    for (const [key, latencies] of this.latencies) {
      const sorted = [...latencies].sort((a, b) => a - b);
      result[key] = {
        count: sorted.length,
        avgMs: sorted.reduce((s, v) => s + v, 0) / sorted.length,
        p95Ms: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        p99Ms: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
      };
    }
    return result;
  }
}
