// ============================================================================
// STEP 8 — LEARNING MOAT: CREATOR STYLE PROFILING
// ============================================================================
// The core of the learning moat — the system that accumulates knowledge about
// each creator's style and gets better with every edit session.
//
// Components:
//   - CreatorStyleProfile schema (comprehensive creator DNA)
//   - StyleProfileManager (persist, merge, evolve profiles)
//   - Embedding-based style clustering
//   - Style similarity scoring
// ============================================================================

import type { ContentVertical, Platform } from '../../types/core.js';
import type { EditingStrategy, CaptionStyle } from '../../types/dsl.js';

// ---------------------------------------------------------------------------
// Creator Style Profile — the full "editing DNA" of a creator
// ---------------------------------------------------------------------------
export interface CreatorStyleProfile {
  creatorId: string;
  version: number;
  createdAt: number;
  updatedAt: number;

  // Core identity
  identity: {
    primaryVertical: ContentVertical;
    secondaryVerticals: ContentVertical[];
    platforms: Platform[];
    toneKeywords: string[];        // e.g., ["energetic", "sarcastic", "educational"]
    brandColors?: string[];
    referenceCreators: string[];   // creators they want to be like
  };

  // Pacing preferences (learned from edits)
  pacing: {
    preferredCutIntervalMs: [number, number]; // [min, max]
    energyCurveType: 'constant_high' | 'escalating' | 'wave' | 'front_loaded' | 'dramatic_arc';
    toleratesLongSilence: boolean;
    silenceThresholdMs: number;
    preferredSpeedRampIntensity: number; // 0-1
    patternInterruptFrequency: number;   // interrupts per 60s
  };

  // Caption preferences (learned from overrides)
  captions: {
    preferredStyle: Partial<CaptionStyle>;
    maxWordsPerSegment: number;
    preferredColorPreset: string;
    useEmoji: boolean;
    emphasisKeywords: string[];     // words they always want emphasized
    avoidWords: string[];            // words they never want emphasized
  };

  // Visual preferences
  visual: {
    zoomIntensity: number;           // 0 = never zoom, 1 = zoom everything
    preferredTransition: string;
    colorGradePreset: string;
    bRollFrequency: number;          // suggestions per 60s
    sfxIntensity: number;            // 0-1
    facePadding: number;             // fraction of frame around face
  };

  // Hook preferences
  hook: {
    preferredOpeningStyle: string;   // 'question' | 'bold_claim' | 'cold_open' | etc.
    averageHookDurationMs: number;
    hookSuccessPatterns: string[];   // patterns that worked (high retention)
    hookFailPatterns: string[];       // patterns that didn't work
  };

  // Performance data (learned from analytics)
  performance: {
    avgRetentionRate: number;        // 0-1
    avgCompletionRate: number;
    bestPerformingVerticals: ContentVertical[];
    bestPerformingHookType: string;
    retentionDropoffPoints: number[]; // seconds where viewers typically leave
    optimalDurationMs: number;
  };

  // Embedding vector for clustering/similarity
  styleEmbedding?: number[];         // 64-dim normalized vector

  // Raw interaction history (for fine-tuning context)
  interactionSignals: InteractionSignal[];
}

export interface InteractionSignal {
  timestamp: number;
  type: 'override' | 'accept' | 'reject' | 'tweak' | 'undo' | 'redo';
  category: 'pacing' | 'caption' | 'visual' | 'hook' | 'audio' | 'general';
  detail: string;    // human-readable description
  before?: any;      // what the AI suggested
  after?: any;       // what the creator chose
  confidence: number; // how confident we are this was intentional (0-1)
}

// ---------------------------------------------------------------------------
// Style Profile Manager
// ---------------------------------------------------------------------------
export class StyleProfileManager {
  private profiles = new Map<string, CreatorStyleProfile>();

  /**
   * Get or create a profile for a creator.
   */
  getProfile(creatorId: string): CreatorStyleProfile {
    let profile = this.profiles.get(creatorId);
    if (!profile) {
      profile = this.createDefaultProfile(creatorId);
      this.profiles.set(creatorId, profile);
    }
    return profile;
  }

  /**
   * Update a profile with new interaction signals.
   * This is the core learning loop — every interaction teaches the system.
   */
  recordInteraction(creatorId: string, signal: InteractionSignal): void {
    const profile = this.getProfile(creatorId);

    // Add to interaction history (keep last 500)
    profile.interactionSignals.push(signal);
    if (profile.interactionSignals.length > 500) {
      profile.interactionSignals = profile.interactionSignals.slice(-500);
    }

    // Apply signal to profile based on category
    this.applySignalToProfile(profile, signal);

    profile.updatedAt = Date.now();
    profile.version++;
  }

  /**
   * Evolve a profile based on strategy acceptance/rejection.
   * Called after a full editing session completes.
   */
  evolveFromSession(
    creatorId: string,
    strategy: EditingStrategy,
    accepted: boolean,
    overrides: Array<{ operationIndex: number; before: any; after: any }>,
  ): void {
    const profile = this.getProfile(creatorId);

    if (accepted) {
      // Reinforce the strategy's parameters toward the profile
      this.reinforceFromStrategy(profile, strategy, 0.1); // 10% learning rate
    }

    // Apply overrides with higher learning rate
    for (const override of overrides) {
      this.recordInteraction(creatorId, {
        timestamp: Date.now(),
        type: 'override',
        category: this.categorizeOperation(strategy.operations[override.operationIndex]),
        detail: `Override operation ${override.operationIndex}`,
        before: override.before,
        after: override.after,
        confidence: 0.9,
      });
    }

    // Recompute style embedding
    profile.styleEmbedding = this.computeStyleEmbedding(profile);
    profile.updatedAt = Date.now();
    profile.version++;
  }

  /**
   * Ingest retention analytics to update performance section.
   */
  ingestAnalytics(
    creatorId: string,
    analytics: RetentionAnalytics,
  ): void {
    const profile = this.getProfile(creatorId);
    const perf = profile.performance;

    // Exponential moving average for retention/completion
    const alpha = 0.15; // Learning rate for analytics
    perf.avgRetentionRate = perf.avgRetentionRate * (1 - alpha) + analytics.retentionRate * alpha;
    perf.avgCompletionRate = perf.avgCompletionRate * (1 - alpha) + analytics.completionRate * alpha;

    // Update dropoff points (merge with existing)
    if (analytics.dropoffPoints.length > 0) {
      const allDropoffs = [...perf.retentionDropoffPoints, ...analytics.dropoffPoints];
      perf.retentionDropoffPoints = this.clusterPoints(allDropoffs, 2.0).slice(0, 5);
    }

    // Update optimal duration
    if (analytics.optimalDurationMs) {
      perf.optimalDurationMs = perf.optimalDurationMs * (1 - alpha) + analytics.optimalDurationMs * alpha;
    }

    // Track best-performing patterns
    if (analytics.hookType && analytics.retentionRate > 0.7) {
      perf.bestPerformingHookType = analytics.hookType;
      profile.hook.hookSuccessPatterns.push(analytics.hookType);
      if (profile.hook.hookSuccessPatterns.length > 20) {
        profile.hook.hookSuccessPatterns = profile.hook.hookSuccessPatterns.slice(-20);
      }
    }

    profile.styleEmbedding = this.computeStyleEmbedding(profile);
    profile.updatedAt = Date.now();
    profile.version++;
  }

  /**
   * Find similar creators by style embedding.
   */
  findSimilarCreators(creatorId: string, topK: number = 5): Array<{ creatorId: string; similarity: number }> {
    const profile = this.getProfile(creatorId);
    if (!profile.styleEmbedding) return [];

    const results: Array<{ creatorId: string; similarity: number }> = [];

    for (const [otherId, other] of this.profiles) {
      if (otherId === creatorId || !other.styleEmbedding) continue;
      const sim = this.cosineSimilarity(profile.styleEmbedding, other.styleEmbedding);
      results.push({ creatorId: otherId, similarity: sim });
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
  }

  /**
   * Build LLM context from a creator's profile.
   */
  buildProfileContext(creatorId: string): string {
    const p = this.getProfile(creatorId);
    const sections: string[] = [];

    sections.push(`CREATOR STYLE PROFILE (v${p.version}):`);
    sections.push(`  Vertical: ${p.identity.primaryVertical}`);
    sections.push(`  Tone: ${p.identity.toneKeywords.join(', ')}`);
    sections.push(`  Platforms: ${p.identity.platforms.join(', ')}`);
    sections.push('');
    sections.push(`PACING PREFERENCES:`);
    sections.push(`  Cut interval: ${p.pacing.preferredCutIntervalMs[0]}-${p.pacing.preferredCutIntervalMs[1]}ms`);
    sections.push(`  Energy curve: ${p.pacing.energyCurveType}`);
    sections.push(`  Speed ramp intensity: ${p.pacing.preferredSpeedRampIntensity.toFixed(2)}`);
    sections.push(`  Pattern interrupts per 60s: ${p.pacing.patternInterruptFrequency}`);
    sections.push('');
    sections.push(`VISUAL PREFERENCES:`);
    sections.push(`  Zoom intensity: ${p.visual.zoomIntensity.toFixed(2)}`);
    sections.push(`  Transition: ${p.visual.preferredTransition}`);
    sections.push(`  Color grade: ${p.visual.colorGradePreset}`);
    sections.push(`  SFX intensity: ${p.visual.sfxIntensity.toFixed(2)}`);
    sections.push('');
    sections.push(`PERFORMANCE:`);
    sections.push(`  Avg retention: ${(p.performance.avgRetentionRate * 100).toFixed(1)}%`);
    sections.push(`  Avg completion: ${(p.performance.avgCompletionRate * 100).toFixed(1)}%`);
    sections.push(`  Best hook type: ${p.performance.bestPerformingHookType}`);
    sections.push(`  Optimal duration: ${(p.performance.optimalDurationMs / 1000).toFixed(1)}s`);

    // Recent overrides (last 10) — these are the most important signals
    const overrides = p.interactionSignals
      .filter(s => s.type === 'override' || s.type === 'tweak')
      .slice(-10);
    if (overrides.length > 0) {
      sections.push('');
      sections.push(`RECENT OVERRIDES (${overrides.length}):`);
      for (const o of overrides) {
        sections.push(`  [${o.category}] ${o.detail}`);
      }
    }

    return sections.join('\n');
  }

  // --- Private ---

  private createDefaultProfile(creatorId: string): CreatorStyleProfile {
    return {
      creatorId,
      version: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      identity: {
        primaryVertical: 'entertainment',
        secondaryVerticals: [],
        platforms: ['tiktok'],
        toneKeywords: ['energetic'],
        referenceCreators: [],
      },
      pacing: {
        preferredCutIntervalMs: [800, 2500],
        energyCurveType: 'escalating',
        toleratesLongSilence: false,
        silenceThresholdMs: 500,
        preferredSpeedRampIntensity: 0.5,
        patternInterruptFrequency: 3,
      },
      captions: {
        preferredStyle: {},
        maxWordsPerSegment: 5,
        preferredColorPreset: 'aggressive',
        useEmoji: true,
        emphasisKeywords: [],
        avoidWords: [],
      },
      visual: {
        zoomIntensity: 0.6,
        preferredTransition: 'cut',
        colorGradePreset: 'vibrant',
        bRollFrequency: 2,
        sfxIntensity: 0.5,
        facePadding: 0.15,
      },
      hook: {
        preferredOpeningStyle: 'bold_claim',
        averageHookDurationMs: 3000,
        hookSuccessPatterns: [],
        hookFailPatterns: [],
      },
      performance: {
        avgRetentionRate: 0.5,
        avgCompletionRate: 0.3,
        bestPerformingVerticals: [],
        bestPerformingHookType: 'bold_claim',
        retentionDropoffPoints: [],
        optimalDurationMs: 30000,
      },
      styleEmbedding: undefined,
      interactionSignals: [],
    };
  }

  private applySignalToProfile(profile: CreatorStyleProfile, signal: InteractionSignal): void {
    if (signal.confidence < 0.3) return; // Too uncertain to learn from

    const lr = signal.confidence * 0.1; // Learning rate scaled by confidence

    switch (signal.category) {
      case 'pacing': {
        if (signal.type === 'override' && signal.after?.cutInterval) {
          const [min, max] = profile.pacing.preferredCutIntervalMs;
          const newVal = signal.after.cutInterval;
          profile.pacing.preferredCutIntervalMs = [
            min + (newVal - min) * lr,
            max + (newVal - max) * lr,
          ];
        }
        break;
      }
      case 'caption': {
        if (signal.type === 'override' && signal.after?.colorPreset) {
          profile.captions.preferredColorPreset = signal.after.colorPreset;
        }
        if (signal.after?.emphasisWord) {
          if (signal.type === 'override') {
            profile.captions.emphasisKeywords.push(signal.after.emphasisWord);
          } else if (signal.type === 'reject') {
            profile.captions.avoidWords.push(signal.after.emphasisWord);
          }
        }
        break;
      }
      case 'visual': {
        if (signal.after?.zoomIntensity !== undefined) {
          profile.visual.zoomIntensity += (signal.after.zoomIntensity - profile.visual.zoomIntensity) * lr;
        }
        if (signal.after?.sfxIntensity !== undefined) {
          profile.visual.sfxIntensity += (signal.after.sfxIntensity - profile.visual.sfxIntensity) * lr;
        }
        if (signal.after?.transition) {
          profile.visual.preferredTransition = signal.after.transition;
        }
        break;
      }
      case 'hook': {
        if (signal.after?.openingStyle) {
          profile.hook.preferredOpeningStyle = signal.after.openingStyle;
        }
        if (signal.after?.hookDuration) {
          profile.hook.averageHookDurationMs += (signal.after.hookDuration - profile.hook.averageHookDurationMs) * lr;
        }
        break;
      }
    }
  }

  private reinforceFromStrategy(profile: CreatorStyleProfile, strategy: EditingStrategy, lr: number): void {
    // Reinforce pacing from style.pacing
    const pacing = strategy.style?.pacing;
    if (pacing) {
      const cutInterval = pacing.avgCutIntervalMs;
      if (cutInterval) {
        const [min, max] = profile.pacing.preferredCutIntervalMs;
        profile.pacing.preferredCutIntervalMs = [
          min + (cutInterval * 0.8 - min) * lr,
          max + (cutInterval * 1.2 - max) * lr,
        ];
      }
      if (pacing.energyCurve) {
        // Only update if it's been consistent
        profile.pacing.energyCurveType = pacing.energyCurve;
      }
    }

    // Reinforce caption style
    if (strategy.style?.captions) {
      const caps = strategy.style.captions;
      if (caps.maxWordsPerLine) {
        profile.captions.maxWordsPerSegment += (caps.maxWordsPerLine - profile.captions.maxWordsPerSegment) * lr;
      }
    }
  }

  /**
   * Compute a 64-dimensional style embedding vector from a profile.
   * Used for creator similarity clustering.
   */
  private computeStyleEmbedding(profile: CreatorStyleProfile): number[] {
    const dims = 64;
    const vec = new Array(dims).fill(0);

    // Encode pacing (dims 0-7)
    vec[0] = profile.pacing.preferredCutIntervalMs[0] / 5000;
    vec[1] = profile.pacing.preferredCutIntervalMs[1] / 5000;
    vec[2] = { constant_high: 0.2, escalating: 0.4, wave: 0.6, front_loaded: 0.8, dramatic_arc: 1.0 }[profile.pacing.energyCurveType] ?? 0.5;
    vec[3] = profile.pacing.preferredSpeedRampIntensity;
    vec[4] = profile.pacing.patternInterruptFrequency / 10;
    vec[5] = profile.pacing.silenceThresholdMs / 2000;
    vec[6] = profile.pacing.toleratesLongSilence ? 1 : 0;
    vec[7] = 0; // reserved

    // Encode visual (dims 8-15)
    vec[8] = profile.visual.zoomIntensity;
    vec[9] = profile.visual.sfxIntensity;
    vec[10] = profile.visual.bRollFrequency / 10;
    vec[11] = profile.visual.facePadding;
    // Transition type as ordinal
    const transitions = ['cut', 'dissolve', 'wipe', 'zoom', 'glitch', 'flash', 'swipe'];
    vec[12] = transitions.indexOf(profile.visual.preferredTransition) / transitions.length;
    // Color grade as ordinal
    const grades = ['neutral', 'warm', 'cool', 'vibrant', 'desaturated', 'cinematic', 'dark_moody', 'high_contrast'];
    vec[13] = grades.indexOf(profile.visual.colorGradePreset) / grades.length;
    vec[14] = 0;
    vec[15] = 0;

    // Encode caption (dims 16-23)
    vec[16] = profile.captions.maxWordsPerSegment / 10;
    vec[17] = profile.captions.useEmoji ? 1 : 0;
    const colorPresets = ['aggressive', 'clean', 'energetic', 'minimal', 'dark'];
    vec[18] = colorPresets.indexOf(profile.captions.preferredColorPreset) / colorPresets.length;
    vec[19] = profile.captions.emphasisKeywords.length / 50; // normalized
    vec[20] = 0;
    vec[21] = 0;
    vec[22] = 0;
    vec[23] = 0;

    // Encode hook (dims 24-31)
    const hookStyles = ['question', 'bold_claim', 'cold_open', 'numbers', 'controversy', 'curiosity_gap', 'pain_point', 'social_proof'];
    vec[24] = hookStyles.indexOf(profile.hook.preferredOpeningStyle) / hookStyles.length;
    vec[25] = profile.hook.averageHookDurationMs / 10000;
    vec[26] = profile.hook.hookSuccessPatterns.length / 20;
    vec[27] = profile.hook.hookFailPatterns.length / 20;
    vec[28] = 0;
    vec[29] = 0;
    vec[30] = 0;
    vec[31] = 0;

    // Encode performance (dims 32-39)
    vec[32] = profile.performance.avgRetentionRate;
    vec[33] = profile.performance.avgCompletionRate;
    vec[34] = profile.performance.optimalDurationMs / 120000; // normalize to 2min
    vec[35] = profile.performance.retentionDropoffPoints.length / 10;
    vec[36] = 0;
    vec[37] = 0;
    vec[38] = 0;
    vec[39] = 0;

    // Encode identity/vertical (dims 40-47)
    const verticals: ContentVertical[] = ['entertainment', 'education', 'tech', 'fitness', 'cooking', 'gaming', 'music', 'beauty'];
    vec[40] = verticals.indexOf(profile.identity.primaryVertical) / verticals.length;
    vec[41] = profile.identity.secondaryVerticals.length / 5;
    vec[42] = profile.identity.platforms.length / 6;
    vec[43] = profile.identity.toneKeywords.length / 10;
    vec[44] = 0;
    vec[45] = 0;
    vec[46] = 0;
    vec[47] = 0;

    // Encode interaction patterns (dims 48-55)
    const signals = profile.interactionSignals;
    const overrideRate = signals.filter(s => s.type === 'override').length / Math.max(signals.length, 1);
    const acceptRate = signals.filter(s => s.type === 'accept').length / Math.max(signals.length, 1);
    const avgConfidence = signals.reduce((s, x) => s + x.confidence, 0) / Math.max(signals.length, 1);
    vec[48] = overrideRate;
    vec[49] = acceptRate;
    vec[50] = avgConfidence;
    vec[51] = signals.length / 500;
    vec[52] = 0;
    vec[53] = 0;
    vec[54] = 0;
    vec[55] = 0;

    // Reserved (dims 56-63)
    // ...

    // L2 normalize
    const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < dims; i++) vec[i] /= norm;
    }

    return vec;
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom > 0 ? dot / denom : 0;
  }

  /**
   * Cluster nearby points (1D) using simple distance threshold.
   * Returns cluster centroids.
   */
  private clusterPoints(points: number[], threshold: number): number[] {
    if (points.length === 0) return [];
    const sorted = [...points].sort((a, b) => a - b);
    const clusters: number[][] = [[sorted[0]]];

    for (let i = 1; i < sorted.length; i++) {
      const lastCluster = clusters[clusters.length - 1];
      const centroid = lastCluster.reduce((s, v) => s + v, 0) / lastCluster.length;
      if (Math.abs(sorted[i] - centroid) < threshold) {
        lastCluster.push(sorted[i]);
      } else {
        clusters.push([sorted[i]]);
      }
    }

    return clusters.map(c => c.reduce((s, v) => s + v, 0) / c.length);
  }

  private categorizeOperation(op: any): InteractionSignal['category'] {
    if (!op) return 'general';
    const type = op.type;
    if (['cut', 'trim_silence', 'speed_ramp', 'reorder'].includes(type)) return 'pacing';
    if (['caption', 'text_overlay'].includes(type)) return 'caption';
    if (['zoom', 'face_track_zoom', 'transition', 'b_roll_insert', 'color_grade', 'motion_graphic'].includes(type)) return 'visual';
    if (['music_layer', 'sfx_trigger', 'loudness'].includes(type)) return 'audio';
    return 'general';
  }
}

// ---------------------------------------------------------------------------
// Retention Analytics (input from platform APIs / analytics)
// ---------------------------------------------------------------------------
export interface RetentionAnalytics {
  videoId: string;
  platform: Platform;
  retentionRate: number;          // 0-1
  completionRate: number;         // 0-1
  dropoffPoints: number[];        // seconds
  hookType?: string;
  optimalDurationMs?: number;
  engagementRate?: number;
  shareRate?: number;
  commentSentiment?: number;      // -1 to 1
}

// ---------------------------------------------------------------------------
// Strategy Adaptation Engine
// ---------------------------------------------------------------------------
// Takes a base strategy and adapts it based on the creator's profile +
// recent performance analytics.
// ---------------------------------------------------------------------------
export class StrategyAdaptationEngine {
  constructor(private profileManager: StyleProfileManager) {}

  /**
   * Adapt a base editing strategy using the creator's learned preferences.
   */
  adapt(creatorId: string, baseStrategy: EditingStrategy): EditingStrategy {
    const profile = this.profileManager.getProfile(creatorId);
    const adapted = structuredClone(baseStrategy);

    // Adapt pacing via style.pacing
    if (adapted.style?.pacing) {
      adapted.style.pacing.avgCutIntervalMs = this.average(profile.pacing.preferredCutIntervalMs);
      adapted.style.pacing.energyCurve = profile.pacing.energyCurveType;
    }

    // Adapt operations based on visual preferences
    for (const op of adapted.operations) {
      switch (op.type) {
        case 'zoom':
        case 'face_track_zoom': {
          // Scale zoom by creator's intensity preference
          if ('scale' in op) {
            (op as any).scale = 1 + ((op as any).scale - 1) * profile.visual.zoomIntensity;
          }
          break;
        }
        case 'sfx_trigger': {
          // Reduce/increase SFX volume based on preference
          if ('volume' in op) {
            (op as any).volume = (op as any).volume * profile.visual.sfxIntensity;
          }
          break;
        }
        case 'transition': {
          // Use preferred transition if not specifically set
          if ((op as any).transitionType === 'cut') {
            (op as any).transitionType = profile.visual.preferredTransition;
          }
          break;
        }
        case 'color_grade': {
          // Use preferred grade if generic
          if ((op as any).preset === 'neutral') {
            (op as any).preset = profile.visual.colorGradePreset;
          }
          break;
        }
        case 'caption': {
          // Apply caption preferences
          const captionOp = op as any;
          if (profile.captions.preferredStyle.fontFamily) {
            captionOp.fontFamily = profile.captions.preferredStyle.fontFamily;
          }
          if (profile.captions.preferredStyle.fontSize) {
            captionOp.fontSize = profile.captions.preferredStyle.fontSize;
          }
          break;
        }
        case 'trim_silence': {
          // Use creator's silence threshold
          if ('minSilenceDurationMs' in op) {
            (op as any).minSilenceDurationMs = profile.pacing.silenceThresholdMs;
          }
          break;
        }
      }
    }

    // Filter out operations the creator consistently rejects
    const rejectPatterns = this.getRejectPatterns(profile);
    adapted.operations = adapted.operations.filter(op => {
      return !rejectPatterns.has(op.type);
    });

    // Apply performance-based adjustments
    this.applyPerformanceAdaptations(adapted, profile);

    return adapted;
  }

  /**
   * Get operation types that the creator frequently rejects.
   */
  private getRejectPatterns(profile: CreatorStyleProfile): Set<string> {
    const rejectCounts = new Map<string, number>();
    const totalCounts = new Map<string, number>();

    for (const signal of profile.interactionSignals) {
      const key = signal.category;
      totalCounts.set(key, (totalCounts.get(key) ?? 0) + 1);
      if (signal.type === 'reject') {
        rejectCounts.set(key, (rejectCounts.get(key) ?? 0) + 1);
      }
    }

    const rejected = new Set<string>();
    for (const [category, rejectCount] of rejectCounts) {
      const total = totalCounts.get(category) ?? 1;
      if (rejectCount / total > 0.7 && total >= 5) {
        // Creator rejects this category >70% of time with sufficient samples
        rejected.add(category);
      }
    }

    return rejected;
  }

  /**
   * Apply adaptations based on performance analytics.
   */
  private applyPerformanceAdaptations(strategy: EditingStrategy, profile: CreatorStyleProfile): void {
    const perf = profile.performance;

    // If retention is low, add more pattern interrupts
    if (perf.avgRetentionRate < 0.4) {
      // Add extra zoom/sfx operations at known dropoff points
      for (const dropoff of perf.retentionDropoffPoints) {
        const dropoffMs = dropoff * 1000;
        strategy.operations.push({
          type: 'zoom',
          timeRange: { startMs: dropoffMs - 500, endMs: dropoffMs + 1000 },
          scale: 1.3,
          easing: 'easeInOut',
          anchor: 'center',
        } as any);
      }
    }

    // If completion rate is low, the video might be too long
    if (perf.avgCompletionRate < 0.2 && perf.optimalDurationMs > 0) {
      // Suggest tighter trims
      strategy.metadata = strategy.metadata ?? {};
      (strategy.metadata as any).suggestedMaxDurationMs = perf.optimalDurationMs;
    }
  }

  private average(range: [number, number]): number {
    return (range[0] + range[1]) / 2;
  }
}
