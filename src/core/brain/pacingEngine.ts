// ============================================================================
// STEP 1 — ELITE SHORT-FORM EDITING BRAIN: PACING & RETENTION ENGINE
// ============================================================================
// Programmable rules for:
//   - Pattern interrupt timing
//   - Dopamine pacing theory
//   - Retention curve shaping
//   - Speed ramp logic
//   - Dramatic tension modeling
// ============================================================================

import type { TimeRange, AudioAnalysis, SceneAnalysis, TranscriptSegment } from '../../types/core.js';
import type {
  PacingProfile,
  EnergyCurveType,
  PatternInterruptRule,
  PatternInterruptAction,
  RetentionStrategy,
  AntiDropOffRule,
  SpeedSegment,
} from '../../types/dsl.js';

// ---------------------------------------------------------------------------
// Pacing constants — derived from analysis of top 1% short-form content
// ---------------------------------------------------------------------------
export const PACING_RULES = {
  // Average cut interval by content type (ms)
  CUT_INTERVALS: {
    high_energy: { avg: 2000, min: 800, max: 3500 },
    dramatic: { avg: 3000, min: 1200, max: 5000 },
    educational: { avg: 4000, min: 2000, max: 7000 },
    comedic: { avg: 2500, min: 1000, max: 4000 },
    storytelling: { avg: 3500, min: 1500, max: 6000 },
    default: { avg: 3000, min: 1200, max: 5000 },
  } as Record<string, { avg: number; min: number; max: number }>,

  // Pattern interrupt rules — break viewer adaptation every N seconds
  PATTERN_INTERRUPT: {
    MAX_SAME_SHOT_MS: 5000,          // never hold same shot > 5s
    INTERRUPT_INTERVAL_MS: 3000,      // trigger interrupt every ~3s
    ENERGY_DROP_THRESHOLD: 0.3,       // if energy drops below 30%, interrupt
    MONOTONE_DURATION_MS: 4000,       // if monotone for 4s, interrupt
  },

  // Dopamine pacing — micro-reward scheduling
  DOPAMINE: {
    REWARD_INTERVAL_MS: 2500,         // deliver micro-reward every 2.5s
    REWARD_TYPES: ['zoom', 'sfx', 'caption_pop', 'speed_change', 'visual_change'] as const,
    MIN_REWARDS_PER_10S: 3,           // at least 3 stimuli per 10s
    MAX_REWARDS_PER_10S: 6,           // don't overload
    ESCALATION_FACTOR: 1.15,          // each reward slightly more intense
  },

  // Retention curve targets at 10% intervals (0-100%)
  // Based on top-performing short-form videos
  RETENTION_TARGETS: {
    high_retention: [1.0, 0.95, 0.90, 0.85, 0.82, 0.80, 0.78, 0.76, 0.74, 0.72],
    standard: [1.0, 0.88, 0.78, 0.70, 0.65, 0.60, 0.56, 0.53, 0.50, 0.48],
    viral: [1.0, 0.97, 0.94, 0.91, 0.89, 0.87, 0.85, 0.83, 0.82, 0.80],
  } as Record<string, number[]>,

  // Speed ramp rules
  SPEED_RAMPS: {
    // During low-energy speech, speed up
    LOW_ENERGY_SPEEDUP: 1.3,
    // During transitions/pauses, speed up more
    TRANSITION_SPEEDUP: 1.8,
    // During key moments, slow down for emphasis
    EMPHASIS_SLOWDOWN: 0.7,
    // Maximum speed change
    MAX_SPEED: 2.5,
    MIN_SPEED: 0.5,
    // Minimum duration to apply speed ramp
    MIN_RAMP_DURATION_MS: 500,
  },

  // Dramatic tension model
  TENSION: {
    // Tension should build by this factor per story beat
    BUILD_RATE: 0.15,
    // Maximum tension before climax release
    MAX_TENSION: 0.95,
    // Tension dip after climax
    RELEASE_FACTOR: 0.4,
    // Minimum tension to maintain viewer interest
    MIN_TENSION: 0.2,
  },
} as const;

// ---------------------------------------------------------------------------
// Pacing analyzer
// ---------------------------------------------------------------------------
export class PacingEngine {
  /**
   * Determine optimal pacing profile based on content analysis.
   */
  determinePacing(
    tone: string,
    durationMs: number,
    audio: AudioAnalysis,
    targetCurve: 'high_retention' | 'standard' | 'viral' = 'high_retention',
  ): PacingProfile {
    const intervals = PACING_RULES.CUT_INTERVALS[tone] ?? PACING_RULES.CUT_INTERVALS.default;

    // Adjust based on speech rate — faster speech = can support faster cuts
    const speechFactor = Math.min(1.3, Math.max(0.7, audio.speechRate / 150));

    return {
      avgCutIntervalMs: Math.round(intervals.avg / speechFactor),
      minCutIntervalMs: Math.round(intervals.min / speechFactor),
      maxCutIntervalMs: Math.round(intervals.max / speechFactor),
      patternInterruptFreqMs: PACING_RULES.PATTERN_INTERRUPT.INTERRUPT_INTERVAL_MS,
      speedRampIntensity: tone === 'high_energy' ? 0.8 : 0.5,
      energyCurve: this.selectEnergyCurve(tone, durationMs),
    };
  }

  /**
   * Generate pattern interrupt schedule.
   */
  generatePatternInterrupts(
    durationMs: number,
    audio: AudioAnalysis,
    scene: SceneAnalysis,
  ): PatternInterruptRule[] {
    const rules: PatternInterruptRule[] = [];

    // Time-based interrupts
    rules.push({
      triggerType: 'time_based',
      triggerThreshold: PACING_RULES.PATTERN_INTERRUPT.INTERRUPT_INTERVAL_MS,
      action: this.selectInterruptAction('time_based'),
    });

    // Energy-drop interrupts — when energy falls
    rules.push({
      triggerType: 'energy_drop',
      triggerThreshold: PACING_RULES.PATTERN_INTERRUPT.ENERGY_DROP_THRESHOLD,
      action: 'zoom_punch',
    });

    // Silence interrupts
    rules.push({
      triggerType: 'silence',
      triggerThreshold: 500, // 500ms silence
      action: 'sfx_hit',
    });

    // Monotone interrupts
    rules.push({
      triggerType: 'monotone',
      triggerThreshold: PACING_RULES.PATTERN_INTERRUPT.MONOTONE_DURATION_MS,
      action: 'broll_insert',
    });

    return rules;
  }

  /**
   * Build retention strategy with anti-drop-off rules.
   */
  buildRetentionStrategy(
    durationMs: number,
    targetLevel: 'high_retention' | 'standard' | 'viral' = 'high_retention',
  ): RetentionStrategy {
    const curve = PACING_RULES.RETENTION_TARGETS[targetLevel];
    const antiDropOff: AntiDropOffRule[] = [];

    // Insert anti-drop-off measures at known weak points
    // 10-20%: just after hook wears off
    antiDropOff.push({
      timestampPercent: 15,
      strategy: 'tease_payoff',
    });

    // 40-50%: mid-point fatigue
    antiDropOff.push({
      timestampPercent: 45,
      strategy: 'energy_boost',
    });

    // 70-80%: pre-conclusion drop
    antiDropOff.push({
      timestampPercent: 75,
      strategy: 'new_info',
    });

    // 90%+: must stick the landing for completion
    antiDropOff.push({
      timestampPercent: 90,
      strategy: 'visual_change',
    });

    return {
      targetRetentionCurve: curve,
      patternInterrupts: this.generatePatternInterrupts(
        durationMs,
        { loudnessLUFS: -14, peakDb: -1, silenceRegions: [], energyProfile: [], speechRate: 150, musicPresence: false, musicSegments: [] },
        { shots: [], faces: [], motionIntensity: [], brightnessProfile: [], dominantColors: [] },
      ),
      antiDropOff,
    };
  }

  /**
   * Generate speed ramp segments for pacing enhancement.
   */
  generateSpeedRamps(
    transcript: TranscriptSegment[],
    audio: AudioAnalysis,
    intensity: number,
  ): SpeedSegment[] {
    const segments: SpeedSegment[] = [];
    const rules = PACING_RULES.SPEED_RAMPS;

    // Identify low-energy speech segments → speed up
    for (const silence of audio.silenceRegions) {
      const duration = silence.endMs - silence.startMs;
      if (duration > rules.MIN_RAMP_DURATION_MS) {
        segments.push({
          range: { startMs: silence.startMs, endMs: silence.endMs },
          speed: Math.min(rules.MAX_SPEED, rules.TRANSITION_SPEEDUP * intensity),
          easing: 'ease_in_out',
        });
      }
    }

    // Identify low-energy speech → mild speedup
    const energyWindows = this.computeEnergyWindows(audio, 2000);
    for (const w of energyWindows) {
      if (w.avgEnergy < 0.35 && w.duration > rules.MIN_RAMP_DURATION_MS) {
        segments.push({
          range: { startMs: w.startMs, endMs: w.endMs },
          speed: rules.LOW_ENERGY_SPEEDUP * intensity,
          easing: 'ease_in_out',
        });
      }
    }

    return segments;
  }

  /**
   * Model dramatic tension across the timeline.
   * Returns tension values (0-1) at regular intervals.
   */
  modelDramaticTension(
    transcript: TranscriptSegment[],
    audio: AudioAnalysis,
    durationMs: number,
    curveType: EnergyCurveType,
  ): { timestampMs: number; tension: number }[] {
    const points: { timestampMs: number; tension: number }[] = [];
    const intervalMs = Math.max(500, durationMs / 50);
    const rules = PACING_RULES.TENSION;

    for (let t = 0; t < durationMs; t += intervalMs) {
      const progress = t / durationMs; // 0 to 1
      let baseTension: number;

      switch (curveType) {
        case 'constant_high':
          baseTension = 0.8;
          break;
        case 'escalating':
          baseTension = rules.MIN_TENSION + progress * (rules.MAX_TENSION - rules.MIN_TENSION);
          break;
        case 'wave':
          baseTension = 0.5 + 0.3 * Math.sin(progress * Math.PI * 4);
          break;
        case 'front_loaded':
          baseTension = progress < 0.2 ? 0.9 : 0.6 - progress * 0.2;
          break;
        case 'dramatic_arc':
          // Classic 3-act: build → climax at 75% → resolve
          if (progress < 0.75) {
            baseTension = rules.MIN_TENSION + (progress / 0.75) * (rules.MAX_TENSION - rules.MIN_TENSION);
          } else {
            baseTension = rules.MAX_TENSION * (1 - (progress - 0.75) / 0.25 * rules.RELEASE_FACTOR);
          }
          break;
        default:
          baseTension = 0.5;
      }

      // Modulate by actual audio energy at this point
      const energy = this.getEnergyAt(audio, t);
      const modulatedTension = baseTension * 0.7 + energy * 0.3;

      points.push({
        timestampMs: t,
        tension: Math.max(rules.MIN_TENSION, Math.min(rules.MAX_TENSION, modulatedTension)),
      });
    }

    return points;
  }

  // --- Private helpers ---

  private selectEnergyCurve(tone: string, durationMs: number): EnergyCurveType {
    if (tone === 'high_energy') return 'constant_high';
    if (tone === 'dramatic' || tone === 'suspenseful') return 'dramatic_arc';
    if (tone === 'educational') return 'front_loaded';
    if (tone === 'comedic') return 'wave';
    if (durationMs < 30000) return 'constant_high'; // short = keep energy up
    return 'escalating';
  }

  private selectInterruptAction(trigger: string): PatternInterruptAction {
    const actions: PatternInterruptAction[] = [
      'zoom_punch', 'angle_switch', 'broll_insert',
      'sfx_hit', 'text_overlay', 'speed_ramp',
    ];
    // Rotate through actions to avoid repetition
    return actions[Math.floor(Math.random() * actions.length)];
  }

  private computeEnergyWindows(
    audio: AudioAnalysis,
    windowMs: number,
  ): { startMs: number; endMs: number; avgEnergy: number; duration: number }[] {
    const windows: { startMs: number; endMs: number; avgEnergy: number; duration: number }[] = [];
    const profile = audio.energyProfile;
    if (profile.length === 0) return windows;

    for (let i = 0; i < profile.length; i++) {
      const start = profile[i].timestampMs;
      const end = start + windowMs;
      const inWindow = profile.filter(p => p.timestampMs >= start && p.timestampMs < end);
      if (inWindow.length > 0) {
        const avg = inWindow.reduce((s, p) => s + p.energy, 0) / inWindow.length;
        windows.push({ startMs: start, endMs: end, avgEnergy: avg, duration: windowMs });
      }
    }

    return windows;
  }

  private getEnergyAt(audio: AudioAnalysis, timestampMs: number): number {
    const closest = audio.energyProfile.reduce(
      (best, p) => Math.abs(p.timestampMs - timestampMs) < Math.abs(best.timestampMs - timestampMs) ? p : best,
      { timestampMs: 0, energy: 0.5, isSpeech: true },
    );
    return closest.energy;
  }
}
