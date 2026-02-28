// ============================================================================
// STEP 1 — ELITE SHORT-FORM EDITING BRAIN: HOOK ENGINEERING
// ============================================================================
// Encodes the heuristics for engineering hooks that capture in 0-3 seconds.
// A hook must create cognitive commitment before the viewer can scroll.
// ============================================================================

import type {
  TranscriptSegment,
  AudioAnalysis,
  SceneAnalysis,
  ContentClassification,
  EmotionalTone,
  TimeRange
} from '../../types/core.js';
import type { HookStrategy, HookType, OpeningStyle } from '../../types/dsl.js';

// ---------------------------------------------------------------------------
// Hook scoring — rank potential hook segments
// ---------------------------------------------------------------------------
export interface HookCandidate {
  range: TimeRange;
  score: number;               // 0-100
  type: HookType;
  reasoning: string;
  transcript: string;
  factors: HookScoreFactors;
}

export interface HookScoreFactors {
  emotionalIntensity: number;    // 0-1
  speechEnergy: number;          // 0-1
  visualDynamism: number;        // 0-1
  noveltyFactor: number;         // 0-1 (unexpected content)
  questionPresence: number;      // 0 or 1
  boldClaimPresence: number;     // 0 or 1
  numberPresence: number;        // 0 or 1 (concrete numbers hook)
  controversySignal: number;     // 0-1
  painPointSignal: number;       // 0-1
  curiosityGap: number;          // 0-1
}

// ---------------------------------------------------------------------------
// Hook detection rules — programmable
// ---------------------------------------------------------------------------
export const HOOK_RULES = {
  // Maximum duration for the hook segment
  MAX_HOOK_DURATION_MS: 3000,

  // Score weights for different hook factors
  WEIGHTS: {
    emotionalIntensity: 0.20,
    speechEnergy: 0.15,
    visualDynamism: 0.10,
    noveltyFactor: 0.10,
    questionPresence: 0.10,
    boldClaimPresence: 0.10,
    numberPresence: 0.05,
    controversySignal: 0.05,
    painPointSignal: 0.08,
    curiosityGap: 0.07,
  },

  // Pattern matchers for transcript analysis
  QUESTION_PATTERNS: [
    /^(what|why|how|when|did you|have you|do you|can you|would you)/i,
    /\?$/,
    /^(here's|here is) (the|a|what|why)/i,
  ],

  BOLD_CLAIM_PATTERNS: [
    /\b(never|always|every|nobody|everyone|guaranteed|impossible|secret|truth)\b/i,
    /\b(most people|99%|the real reason|what they don't|no one tells)\b/i,
    /\b(changed my life|game changer|mind blown|broke|insane|crazy)\b/i,
  ],

  NUMBER_PATTERNS: [
    /\$[\d,]+/,
    /\b\d+[kKmMbB]\b/,
    /\b(million|billion|thousand|hundred)\b/i,
    /\b\d+%/,
    /\b\d+ (steps|ways|tips|rules|secrets|reasons|things)\b/i,
  ],

  CONTROVERSY_PATTERNS: [
    /\b(wrong|lie|scam|fake|truth|myth|actually|stop|don't|never)\b/i,
    /\b(unpopular opinion|hot take|controversial|nobody wants to hear)\b/i,
  ],

  PAIN_POINT_PATTERNS: [
    /\b(struggling|stuck|frustrated|overwhelmed|confused|broke|failing)\b/i,
    /\b(tired of|sick of|can't figure|don't know how)\b/i,
  ],

  CURIOSITY_GAP_PATTERNS: [
    /\b(but (here's|wait)|the problem is|what happened next|you won't believe)\b/i,
    /\b(turns out|little did|the twist|and then)\b/i,
    /\.{3}$/,  // trailing ellipsis = cliffhanger
  ],

  // Minimum energy threshold for speech to be a hook
  MIN_SPEECH_ENERGY: 0.4,

  // Visual dynamism threshold
  MIN_VISUAL_DYNAMISM: 0.3,
} as const;

// ---------------------------------------------------------------------------
// Hook analyzer engine
// ---------------------------------------------------------------------------
export class HookAnalyzer {
  /**
   * Analyze transcript + AV signals to find the best hook candidates.
   * Returns ranked list — the orchestrator picks the winning hook.
   */
  analyzeHookCandidates(
    transcript: TranscriptSegment[],
    audio: AudioAnalysis,
    scene: SceneAnalysis,
    windowMs: number = HOOK_RULES.MAX_HOOK_DURATION_MS,
  ): HookCandidate[] {
    const candidates: HookCandidate[] = [];

    // Sliding window over transcript to score every possible hook window
    for (let i = 0; i < transcript.length; i++) {
      const windowStart = transcript[i].startMs;
      const windowEnd = windowStart + windowMs;

      // Collect segments within window
      const windowSegments = transcript.filter(
        s => s.startMs >= windowStart && s.endMs <= windowEnd
      );
      if (windowSegments.length === 0) continue;

      const combinedText = windowSegments.map(s => s.text).join(' ');
      const range: TimeRange = {
        startMs: windowStart,
        endMs: Math.min(windowEnd, windowSegments[windowSegments.length - 1].endMs),
      };

      const factors = this.scoreFactors(combinedText, range, audio, scene);
      const score = this.computeWeightedScore(factors);
      const type = this.classifyHookType(combinedText, factors);

      candidates.push({
        range,
        score,
        type,
        reasoning: this.generateReasoning(type, factors),
        transcript: combinedText,
        factors,
      });
    }

    // Sort descending by score, deduplicate overlapping windows
    return this.deduplicateOverlapping(
      candidates.sort((a, b) => b.score - a.score)
    ).slice(0, 10);
  }

  /**
   * Given a chosen hook, determine the opening style.
   */
  determineOpeningStyle(
    hook: HookCandidate,
    fullDurationMs: number,
    tone: EmotionalTone,
  ): OpeningStyle {
    // If hook is from middle/end of video → cold open (reorder peak to front)
    if (hook.range.startMs > fullDurationMs * 0.3) {
      return 'reorder_peak';
    }

    // If it's a question, use question hook
    if (hook.type === 'question') {
      return 'question_hook';
    }

    // High visual dynamism → visual hook
    if (hook.factors.visualDynamism > 0.7) {
      return 'visual_hook';
    }

    // Default for short-form: cold open
    return 'cold_open';
  }

  /**
   * Build the complete hook strategy from analysis.
   */
  buildHookStrategy(
    hook: HookCandidate,
    fullDurationMs: number,
    tone: EmotionalTone,
  ): HookStrategy {
    return {
      type: hook.type,
      targetDurationMs: hook.range.endMs - hook.range.startMs,
      openingStyle: this.determineOpeningStyle(hook, fullDurationMs, tone),
      textOverlay: this.suggestHookOverlay(hook),
    };
  }

  // --- Private scoring methods ---

  private scoreFactors(
    text: string,
    range: TimeRange,
    audio: AudioAnalysis,
    scene: SceneAnalysis,
  ): HookScoreFactors {
    const energyInRange = audio.energyProfile.filter(
      p => p.timestampMs >= range.startMs && p.timestampMs <= range.endMs
    );
    const avgEnergy = energyInRange.length > 0
      ? energyInRange.reduce((s, p) => s + p.energy, 0) / energyInRange.length
      : 0;

    const motionInRange = scene.motionIntensity.filter(
      p => p.timestampMs >= range.startMs && p.timestampMs <= range.endMs
    );
    const avgMotion = motionInRange.length > 0
      ? motionInRange.reduce((s, p) => s + p.intensity, 0) / motionInRange.length
      : 0;

    return {
      emotionalIntensity: this.estimateEmotionalIntensity(text, avgEnergy),
      speechEnergy: avgEnergy,
      visualDynamism: avgMotion,
      noveltyFactor: this.estimateNovelty(text),
      questionPresence: this.matchesAny(text, HOOK_RULES.QUESTION_PATTERNS) ? 1 : 0,
      boldClaimPresence: this.matchesAny(text, HOOK_RULES.BOLD_CLAIM_PATTERNS) ? 1 : 0,
      numberPresence: this.matchesAny(text, HOOK_RULES.NUMBER_PATTERNS) ? 1 : 0,
      controversySignal: this.matchesAny(text, HOOK_RULES.CONTROVERSY_PATTERNS) ? 0.8 : 0,
      painPointSignal: this.matchesAny(text, HOOK_RULES.PAIN_POINT_PATTERNS) ? 0.7 : 0,
      curiosityGap: this.matchesAny(text, HOOK_RULES.CURIOSITY_GAP_PATTERNS) ? 0.9 : 0,
    };
  }

  private computeWeightedScore(factors: HookScoreFactors): number {
    let score = 0;
    for (const [key, weight] of Object.entries(HOOK_RULES.WEIGHTS)) {
      score += (factors[key as keyof HookScoreFactors] ?? 0) * weight;
    }
    return Math.round(score * 100);
  }

  private classifyHookType(text: string, factors: HookScoreFactors): HookType {
    if (factors.questionPresence > 0) return 'question';
    if (factors.boldClaimPresence > 0) return 'bold_claim';
    if (factors.controversySignal > 0.5) return 'controversy';
    if (factors.curiosityGap > 0.5) return 'curiosity_gap';
    if (factors.painPointSignal > 0.5) return 'pain_point';
    if (factors.numberPresence > 0) return 'social_proof';
    if (factors.visualDynamism > 0.7) return 'visual_shock';
    return 'teaser';
  }

  private matchesAny(text: string, patterns: readonly RegExp[]): boolean {
    return patterns.some(p => p.test(text));
  }

  private estimateEmotionalIntensity(text: string, energy: number): number {
    // Combine linguistic signals with audio energy
    const exclamations = (text.match(/!/g) || []).length * 0.15;
    const capsRatio = (text.match(/[A-Z]/g) || []).length / Math.max(text.length, 1);
    return Math.min(1, energy * 0.6 + exclamations + capsRatio * 0.5);
  }

  private estimateNovelty(text: string): number {
    // Novelty proxy: presence of unexpected/specific language
    const specificSignals = /\b(exactly|specifically|the one thing|the real|actually)\b/i;
    return specificSignals.test(text) ? 0.6 : 0.3;
  }

  private suggestHookOverlay(hook: HookCandidate): string | undefined {
    if (hook.type === 'question') return undefined; // question itself is the hook
    if (hook.type === 'bold_claim') return '⚡ WATCH THIS';
    if (hook.type === 'controversy') return '🔥 UNPOPULAR OPINION';
    if (hook.type === 'social_proof') return '📈 THE NUMBERS DON\'T LIE';
    return undefined;
  }

  private generateReasoning(type: HookType, factors: HookScoreFactors): string {
    const parts: string[] = [];
    if (factors.emotionalIntensity > 0.6) parts.push('high emotional intensity');
    if (factors.speechEnergy > 0.5) parts.push('strong speech energy');
    if (factors.questionPresence) parts.push('opens with question');
    if (factors.boldClaimPresence) parts.push('contains bold claim');
    if (factors.curiosityGap > 0.5) parts.push('creates curiosity gap');
    if (factors.controversySignal > 0.5) parts.push('controversy signal');
    return `Hook type: ${type}. Signals: ${parts.join(', ') || 'general appeal'}`;
  }

  private deduplicateOverlapping(candidates: HookCandidate[]): HookCandidate[] {
    const result: HookCandidate[] = [];
    for (const c of candidates) {
      const overlaps = result.some(
        r => c.range.startMs < r.range.endMs && c.range.endMs > r.range.startMs
      );
      if (!overlaps) result.push(c);
    }
    return result;
  }
}
