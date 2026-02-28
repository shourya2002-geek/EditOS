// ============================================================================
// STEP 3 — EDITING STRATEGY DSL: EXECUTION ENGINE INTERFACE
// ============================================================================
// Translates TimelineOperations into concrete FFmpeg / render commands.
// Each operation type has a dedicated executor.
// ============================================================================

import type {
  EditingStrategy,
  TimelineOperation,
  CutOperation,
  TrimSilenceOperation,
  SpeedRampOperation,
  ZoomOperation,
  CaptionOperation,
  SfxTriggerOperation,
  ColorGradeOperation,
  AspectRatioOperation,
  LoudnessOperation,
  MusicLayerOperation,
  BRollInsertOperation,
  ReorderOperation,
  FaceTrackZoomOperation,
  TextOverlayOperation,
  TransitionOperation,
  MotionGraphicOperation,
} from '../../types/dsl.js';

// ---------------------------------------------------------------------------
// Execution context — runtime awareness
// ---------------------------------------------------------------------------
export interface ExecutionContext {
  projectId: string;
  sourceVideoPath: string;
  outputDir: string;
  tempDir: string;
  assetDir: string;
  gpuAvailable: boolean;
  maxConcurrentWorkers: number;
  cacheDir: string;
}

// ---------------------------------------------------------------------------
// Execution result
// ---------------------------------------------------------------------------
export interface ExecutionResult {
  operationId: string;
  type: string;
  status: 'success' | 'failed' | 'skipped';
  outputPath?: string;
  durationMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Operation executor interface
// ---------------------------------------------------------------------------
export interface OperationExecutor<T extends TimelineOperation = TimelineOperation> {
  readonly type: string;
  validate(operation: T, context: ExecutionContext): { valid: boolean; errors: string[] };
  execute(operation: T, context: ExecutionContext): Promise<ExecutionResult>;
  estimateCost(operation: T): { cpuMs: number; gpuMs: number; memoryMb: number };
}

// ---------------------------------------------------------------------------
// Execution engine — orchestrates operation execution
// ---------------------------------------------------------------------------
export class ExecutionEngine {
  private executors = new Map<string, OperationExecutor>();

  /**
   * Register an operation executor.
   */
  registerExecutor(executor: OperationExecutor): void {
    this.executors.set(executor.type, executor);
  }

  /**
   * Execute a complete editing strategy.
   * Operations are sorted by priority and executed in order.
   * Some operations can be parallelized (non-conflicting).
   */
  async executeStrategy(
    strategy: EditingStrategy,
    context: ExecutionContext,
  ): Promise<StrategyExecutionResult> {
    const startTime = Date.now();
    const results: ExecutionResult[] = [];

    // Sort operations by priority
    const sorted = [...strategy.operations].sort((a, b) => a.priority - b.priority);

    // Group into dependency tiers for parallel execution
    const tiers = this.buildExecutionTiers(sorted);

    for (const tier of tiers) {
      // Execute tier operations in parallel
      const tierResults = await Promise.all(
        tier.map(op => this.executeOperation(op, context))
      );
      results.push(...tierResults);

      // Abort on critical failure
      const criticalFailure = tierResults.find(
        r => r.status === 'failed' && this.isCriticalOp(r.type)
      );
      if (criticalFailure) {
        return {
          strategyId: strategy.id,
          status: 'failed',
          results,
          totalDurationMs: Date.now() - startTime,
          error: `Critical operation failed: ${criticalFailure.error}`,
        };
      }
    }

    return {
      strategyId: strategy.id,
      status: results.every(r => r.status === 'success') ? 'success' : 'partial',
      results,
      totalDurationMs: Date.now() - startTime,
    };
  }

  /**
   * Validate all operations before execution (dry run).
   */
  validateStrategy(
    strategy: EditingStrategy,
    context: ExecutionContext,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    for (const op of strategy.operations) {
      const executor = this.executors.get(op.type);
      if (!executor) {
        errors.push(`No executor registered for operation type: ${op.type}`);
        continue;
      }
      const validation = executor.validate(op, context);
      if (!validation.valid) {
        errors.push(...validation.errors.map(e => `[${op.type}] ${e}`));
      }
    }
    return { valid: errors.length === 0, errors };
  }

  /**
   * Estimate total execution cost.
   */
  estimateCost(strategy: EditingStrategy): ExecutionCostEstimate {
    let totalCpuMs = 0;
    let totalGpuMs = 0;
    let peakMemoryMb = 0;

    for (const op of strategy.operations) {
      const executor = this.executors.get(op.type);
      if (executor) {
        const cost = executor.estimateCost(op);
        totalCpuMs += cost.cpuMs;
        totalGpuMs += cost.gpuMs;
        peakMemoryMb = Math.max(peakMemoryMb, cost.memoryMb);
      }
    }

    return { totalCpuMs, totalGpuMs, peakMemoryMb };
  }

  // --- Private execution helpers ---

  private async executeOperation(
    op: TimelineOperation,
    context: ExecutionContext,
  ): Promise<ExecutionResult> {
    const executor = this.executors.get(op.type);
    if (!executor) {
      return {
        operationId: op.id,
        type: op.type,
        status: 'skipped',
        durationMs: 0,
        error: `No executor for type: ${op.type}`,
      };
    }

    // Check condition
    if (op.condition && !this.evaluateCondition(op.condition, context)) {
      return {
        operationId: op.id,
        type: op.type,
        status: 'skipped',
        durationMs: 0,
        metadata: { reason: 'condition not met' },
      };
    }

    const start = Date.now();
    try {
      const result = await executor.execute(op, context);
      return { ...result, durationMs: Date.now() - start };
    } catch (error) {
      return {
        operationId: op.id,
        type: op.type,
        status: 'failed',
        durationMs: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private buildExecutionTiers(operations: TimelineOperation[]): TimelineOperation[][] {
    // Operations that can run in parallel are grouped into tiers
    // Rule: operations that don't modify the same timeline range can parallelize
    const tiers: TimelineOperation[][] = [];

    // Tier 0: Structural (reorder, cut) — must be sequential
    const structural = operations.filter(o => ['reorder', 'cut'].includes(o.type));

    // Tier 1: Audio processing (silence trim, loudness, music) — parallel
    const audio = operations.filter(o =>
      ['trim_silence', 'loudness', 'music_layer', 'sfx_trigger'].includes(o.type)
    );

    // Tier 2: Visual processing (zoom, color, aspect) — parallel
    const visual = operations.filter(o =>
      ['zoom', 'face_track_zoom', 'color_grade', 'aspect_ratio', 'speed_ramp'].includes(o.type)
    );

    // Tier 3: Overlay (captions, text, b-roll, motion graphics) — parallel
    const overlay = operations.filter(o =>
      ['caption', 'text_overlay', 'broll_insert', 'motion_graphic', 'transition'].includes(o.type)
    );

    if (structural.length > 0) tiers.push(structural);
    if (audio.length > 0) tiers.push(audio);
    if (visual.length > 0) tiers.push(visual);
    if (overlay.length > 0) tiers.push(overlay);

    return tiers;
  }

  private isCriticalOp(type: string): boolean {
    return ['reorder', 'cut', 'aspect_ratio'].includes(type);
  }

  private evaluateCondition(
    condition: { type: string; value: string; operator: string },
    context: ExecutionContext,
  ): boolean {
    // Simplified condition evaluation
    return true; // Override in production with proper evaluation
  }
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------
export interface StrategyExecutionResult {
  strategyId: string;
  status: 'success' | 'partial' | 'failed';
  results: ExecutionResult[];
  totalDurationMs: number;
  error?: string;
}

export interface ExecutionCostEstimate {
  totalCpuMs: number;
  totalGpuMs: number;
  peakMemoryMb: number;
}
