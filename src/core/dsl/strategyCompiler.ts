// ============================================================================
// STEP 3 — EDITING STRATEGY DSL: STRATEGY COMPILER
// ============================================================================
// Compiles a CreativeIntent + video analysis into a full EditingStrategy
// with executable TimelineOperations.
// This is the bridge between "what the creator wants" and "what FFmpeg does."
// ============================================================================

import type {
  CreativeIntent,
  CreatorStyleProfile,
} from '../../types/agents.js';
import type {
  EditingStrategy,
  StyleProfile,
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
  StrategyMetadata,
} from '../../types/dsl.js';
import type {
  TranscriptSegment,
  AudioAnalysis,
  SceneAnalysis,
  VideoMetadata,
  Platform,
} from '../../types/core.js';

import { HookAnalyzer } from '../brain/hookEngine.js';
import { PacingEngine } from '../brain/pacingEngine.js';
import { CaptionEngine } from '../brain/captionEngine.js';
import { VisualEngine } from '../brain/visualEngine.js';
import { STYLE_TAXONOMY, type StyleTaxonomyEntry } from '../intent/intentInterpreter.js';

// ---------------------------------------------------------------------------
// Strategy compiler — the core DSL compiler
// ---------------------------------------------------------------------------
export class StrategyCompiler {
  private hookAnalyzer = new HookAnalyzer();
  private pacingEngine = new PacingEngine();
  private captionEngine = new CaptionEngine();
  private visualEngine = new VisualEngine();

  /**
   * Compile a complete editing strategy from intent + video analysis.
   * This is the main entry point.
   */
  compile(input: StrategyCompilerInput): EditingStrategy {
    const { intent, transcript, audio, scene, videoMeta, creatorProfile } = input;
    const platform = intent.targetPlatform ?? 'tiktok';
    const platformSpec = this.visualEngine.getPlatformSpec(platform);

    // 1. Resolve style profile from intent + creator profile
    const style = this.resolveStyleProfile(intent, creatorProfile);

    // 2. Generate all timeline operations
    const operations: TimelineOperation[] = [];
    let priority = 0;

    // --- Hook restructuring (highest priority) ---
    const hookOps = this.compileHookOperations(
      transcript, audio, scene, videoMeta, style, priority
    );
    operations.push(...hookOps.operations);
    priority = hookOps.nextPriority;

    // --- Silence trimming ---
    operations.push(this.compileSilenceTrimming(audio, style, priority++));

    // --- Speed ramps ---
    const speedOp = this.compileSpeedRamps(transcript, audio, style, priority++);
    if (speedOp) operations.push(speedOp);

    // --- Captions ---
    operations.push(this.compileCaptions(transcript, style, platform, priority++));

    // --- Zooms ---
    operations.push(this.compileZooms(audio, scene, videoMeta, style, priority++));

    // --- SFX ---
    operations.push(this.compileSfx(audio, scene, style, priority++));

    // --- B-Roll ---
    const brollOp = this.compileBRoll(audio, scene, videoMeta, style, priority++);
    if (brollOp) operations.push(brollOp);

    // --- Music layer ---
    operations.push(this.compileMusic(style, priority++));

    // --- Color grading ---
    operations.push(this.compileColorGrade(intent, style, priority++));

    // --- Aspect ratio ---
    operations.push(this.compileAspectRatio(platform, priority++));

    // --- Loudness normalization ---
    operations.push(this.compileLoudness(style, priority++));

    // 3. Build strategy metadata
    const metadata: StrategyMetadata = {
      generatedAt: Date.now(),
      agentModel: 'strategy_compiler_v1',
      confidenceScore: intent.confidenceScore,
      estimatedRenderTimeMs: this.estimateRenderTime(videoMeta, operations),
      warnings: this.generateWarnings(intent, operations, platformSpec),
    };

    return {
      id: `strategy_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      version: 1,
      sourceVideoId: videoMeta.id,
      targetPlatform: platform,
      targetDurationMs: Math.min(videoMeta.durationMs, platformSpec.maxDurationMs),
      style,
      operations,
      metadata,
    };
  }

  /**
   * Build the system prompt for the Ministral 14b Editing Strategy Agent.
   * Called when we need the LLM to handle complex/creative strategy decisions.
   */
  buildAgentPrompt(
    intent: CreativeIntent,
    transcript: TranscriptSegment[],
    audioSummary: { speechRate: number; silencePercent: number; musicPresence: boolean },
    sceneSummary: { shotCount: number; avgShotDuration: number; facePresent: boolean },
    videoMeta: VideoMetadata,
  ): string {
    return `You are an expert video editing strategist. You think like a top 1% short-form editor.

## Creator Intent
${JSON.stringify(intent, null, 2)}

## Video Analysis Summary
- Duration: ${videoMeta.durationMs}ms (${(videoMeta.durationMs / 1000).toFixed(1)}s)
- Resolution: ${videoMeta.width}x${videoMeta.height}
- Speech rate: ${audioSummary.speechRate} wpm
- Silence: ${(audioSummary.silencePercent * 100).toFixed(0)}%
- Music detected: ${audioSummary.musicPresence}
- Shot count: ${sceneSummary.shotCount}
- Avg shot duration: ${sceneSummary.avgShotDuration}ms
- Face detected: ${sceneSummary.facePresent}

## Transcript (first 2000 chars)
${transcript.map(s => s.text).join(' ').substring(0, 2000)}

## Your Task
Generate a complete EditingStrategy JSON with all timeline operations.

Focus on:
1. HOOK: Best hook segment + strategy
2. PACING: Cut timing, speed ramps, pattern interrupts
3. RETENTION: Anti-drop-off measures
4. CAPTIONS: Style, emphasis, animation
5. AUDIO: Music, SFX, loudness
6. VISUAL: Zooms, transitions, color

Return valid JSON matching the EditingStrategy schema.`;
  }

  // ---------------------------------------------------------------------------
  // Private compilation methods
  // ---------------------------------------------------------------------------

  private resolveStyleProfile(
    intent: CreativeIntent,
    creatorProfile?: CreatorStyleProfile,
  ): StyleProfile {
    // Start from style reference if available
    let baseStyle: StyleTaxonomyEntry | undefined;
    if (intent.styleReference?.creatorName) {
      baseStyle = STYLE_TAXONOMY[intent.styleReference.creatorName.toLowerCase()];
    }
    if (!baseStyle && intent.targetTone) {
      baseStyle = STYLE_TAXONOMY[intent.targetTone] ?? STYLE_TAXONOMY['viral'];
    }
    if (!baseStyle) {
      baseStyle = STYLE_TAXONOMY['viral']; // default to viral optimization
    }

    const tone = intent.targetTone ?? baseStyle.tone;

    return {
      pacing: this.pacingEngine.determinePacing(
        tone,
        60000, // placeholder duration, will be refined
        { loudnessLUFS: -14, peakDb: -1, silenceRegions: [], energyProfile: [], speechRate: 150, musicPresence: false, musicSegments: [] },
      ),
      captions: this.captionEngine.generateCaptionStyle(
        tone,
        intent.targetPlatform ?? 'tiktok',
        baseStyle.captionPreset,
      ),
      visualStyle: {
        colorGrade: this.visualEngine.selectColorGrade(tone).lut,
        zoomIntensity: baseStyle.zoomIntensity,
        faceTrackingZoom: true,
        motionGraphics: false,
        bRollEnabled: true,
        transitionStyle: this.visualEngine.selectTransitionStyle(tone, true),
        letterboxing: false,
        vignetteIntensity: tone === 'dramatic' || tone === 'suspenseful' ? 0.3 : 0,
      },
      audioStyle: {
        backgroundMusicEnabled: true,
        musicMood: tone === 'dramatic' ? 'epic' : tone === 'high_energy' ? 'upbeat' : 'ambient',
        musicVolume: 0.15,
        sfxEnabled: true,
        sfxIntensity: baseStyle.sfxIntensity,
        loudnessTarget: -14,
        bassBoost: tone === 'dramatic' ? 0.3 : 0,
        voiceEnhancement: true,
      },
      hookStrategy: {
        type: 'curiosity_gap',
        targetDurationMs: 3000,
        openingStyle: 'cold_open',
      },
      retentionStrategy: this.pacingEngine.buildRetentionStrategy(60000),
    };
  }

  private compileHookOperations(
    transcript: TranscriptSegment[],
    audio: AudioAnalysis,
    scene: SceneAnalysis,
    videoMeta: VideoMetadata,
    style: StyleProfile,
    startPriority: number,
  ): { operations: TimelineOperation[]; nextPriority: number } {
    const ops: TimelineOperation[] = [];
    let priority = startPriority;

    const hooks = this.hookAnalyzer.analyzeHookCandidates(transcript, audio, scene);
    if (hooks.length > 0) {
      const bestHook = hooks[0];

      // If best hook is not at the start, create a reorder operation
      if (bestHook.range.startMs > 3000) {
        const reorderOp: ReorderOperation = {
          id: `op_reorder_hook_${priority}`,
          type: 'reorder',
          priority: priority++,
          segmentOrder: [
            bestHook.range,  // hook first
            { startMs: 0, endMs: bestHook.range.startMs }, // then start
            { startMs: bestHook.range.endMs, endMs: videoMeta.durationMs }, // then rest
          ],
        };
        ops.push(reorderOp);
      }

      // Update hook strategy with analysis results
      style.hookStrategy = this.hookAnalyzer.buildHookStrategy(
        bestHook,
        videoMeta.durationMs,
        style.pacing.energyCurve === 'dramatic_arc' ? 'dramatic' : 'high_energy',
      );
    }

    return { operations: ops, nextPriority: priority };
  }

  private compileSilenceTrimming(
    audio: AudioAnalysis,
    style: StyleProfile,
    priority: number,
  ): TrimSilenceOperation {
    return {
      id: `op_silence_${priority}`,
      type: 'trim_silence',
      priority,
      thresholdDb: -35,
      minSilenceMs: 300,
      padMs: 80,
      maxTrimMs: 3000,
    };
  }

  private compileSpeedRamps(
    transcript: TranscriptSegment[],
    audio: AudioAnalysis,
    style: StyleProfile,
    priority: number,
  ): SpeedRampOperation | null {
    const segments = this.pacingEngine.generateSpeedRamps(
      transcript, audio, style.pacing.speedRampIntensity,
    );
    if (segments.length === 0) return null;

    return {
      id: `op_speed_${priority}`,
      type: 'speed_ramp',
      priority,
      segments,
    };
  }

  private compileCaptions(
    transcript: TranscriptSegment[],
    style: StyleProfile,
    platform: Platform,
    priority: number,
  ): CaptionOperation {
    const segments = this.captionEngine.generateCaptionSegments(transcript, style.captions);
    return {
      id: `op_caption_${priority}`,
      type: 'caption',
      priority,
      style: style.captions,
      segments,
    };
  }

  private compileZooms(
    audio: AudioAnalysis,
    scene: SceneAnalysis,
    videoMeta: VideoMetadata,
    style: StyleProfile,
    priority: number,
  ): ZoomOperation {
    const keyframes = this.visualEngine.generateZoomKeyframes(
      audio, scene.faces, videoMeta.durationMs, style.visualStyle.zoomIntensity,
    );
    return {
      id: `op_zoom_${priority}`,
      type: 'zoom',
      priority,
      keyframes,
    };
  }

  private compileSfx(
    audio: AudioAnalysis,
    scene: SceneAnalysis,
    style: StyleProfile,
    priority: number,
  ): SfxTriggerOperation {
    const triggers = this.visualEngine.generateSfxTriggers(
      audio, scene, style.audioStyle.sfxIntensity,
    );
    return {
      id: `op_sfx_${priority}`,
      type: 'sfx_trigger',
      priority,
      triggers,
    };
  }

  private compileBRoll(
    audio: AudioAnalysis,
    scene: SceneAnalysis,
    videoMeta: VideoMetadata,
    style: StyleProfile,
    priority: number,
  ): BRollInsertOperation | null {
    if (!style.visualStyle.bRollEnabled) return null;

    const insertions = this.visualEngine.determineBRollPoints(
      audio, scene, videoMeta.durationMs,
    );
    if (insertions.length === 0) return null;

    return {
      id: `op_broll_${priority}`,
      type: 'broll_insert',
      priority,
      insertions,
    };
  }

  private compileMusic(style: StyleProfile, priority: number): MusicLayerOperation {
    return {
      id: `op_music_${priority}`,
      type: 'music_layer',
      priority,
      mood: style.audioStyle.musicMood,
      tempo: 'match_content',
      volume: style.audioStyle.musicVolume,
      fadeInMs: 500,
      fadeOutMs: 1500,
      duckUnderSpeech: true,
      duckLevel: 0.1,
    };
  }

  private compileColorGrade(
    intent: CreativeIntent,
    style: StyleProfile,
    priority: number,
  ): ColorGradeOperation {
    const tone = intent.targetTone ?? 'high_energy';
    const grade = this.visualEngine.selectColorGrade(tone);
    return {
      id: `op_color_${priority}`,
      type: 'color_grade',
      priority,
      lutPreset: grade.lut,
      intensity: grade.intensity,
    };
  }

  private compileAspectRatio(platform: Platform, priority: number): AspectRatioOperation {
    const spec = this.visualEngine.getPlatformSpec(platform);
    return {
      id: `op_aspect_${priority}`,
      type: 'aspect_ratio',
      priority,
      target: spec.aspectRatio,
      strategy: 'crop_face', // face-aware cropping by default
    };
  }

  private compileLoudness(style: StyleProfile, priority: number): LoudnessOperation {
    return {
      id: `op_loudness_${priority}`,
      type: 'loudness',
      priority,
      targetLUFS: style.audioStyle.loudnessTarget,
      limiterCeiling: -1,
      compressorRatio: 3,
    };
  }

  private estimateRenderTime(
    videoMeta: VideoMetadata,
    operations: TimelineOperation[],
  ): number {
    // Rough estimate: 2x realtime for basic, +20% per complex operation
    const baseMs = videoMeta.durationMs * 2;
    const complexOps = operations.filter(
      o => ['face_track_zoom', 'broll_insert', 'motion_graphic'].includes(o.type)
    ).length;
    return Math.round(baseMs * (1 + complexOps * 0.2));
  }

  private generateWarnings(
    intent: CreativeIntent,
    operations: TimelineOperation[],
    platformSpec: { maxDurationMs: number; maxFileSize: number },
  ): string[] {
    const warnings: string[] = [];
    if (intent.confidenceScore < 0.5) {
      warnings.push('Low confidence in intent interpretation — review strategy before executing');
    }
    if (intent.ambiguityFlags.some(f => f.requiresConfirmation)) {
      warnings.push('Ambiguous intent detected — confirmation recommended');
    }
    return warnings;
  }
}

// ---------------------------------------------------------------------------
// Compiler input type
// ---------------------------------------------------------------------------
export interface StrategyCompilerInput {
  intent: CreativeIntent;
  transcript: TranscriptSegment[];
  audio: AudioAnalysis;
  scene: SceneAnalysis;
  videoMeta: VideoMetadata;
  creatorProfile?: CreatorStyleProfile;
}
