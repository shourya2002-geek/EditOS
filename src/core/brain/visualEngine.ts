// ============================================================================
// STEP 1 — ELITE SHORT-FORM EDITING BRAIN: VISUAL HEURISTICS ENGINE
// ============================================================================
// Programmable rules for:
//   - Zoom + punch-in heuristics
//   - Silence removal thresholds
//   - B-roll insertion logic
//   - Sound design heuristics
//   - Platform-specific optimization logic
//   - Color grading presets
// ============================================================================

import type {
  TimeRange,
  Platform,
  AudioAnalysis,
  SceneAnalysis,
  FaceDetection,
  SilenceRegion,
  EmotionalTone,
  PlatformSpec,
} from '../../types/core.js';
import type {
  ZoomKeyframe,
  SfxEvent,
  BRollInsertion,
  TransitionStyle,
} from '../../types/dsl.js';

// ---------------------------------------------------------------------------
// Visual heuristic rules
// ---------------------------------------------------------------------------
export const VISUAL_RULES = {
  // Zoom/punch-in rules
  ZOOM: {
    // Trigger zoom when speaker emphasizes a key point
    EMPHASIS_SCALE: 1.25,         // 25% zoom for emphasis
    PUNCH_SCALE: 1.4,            // 40% zoom for punch-in
    SUBTLE_SCALE: 1.1,           // 10% zoom for subtle movement
    // Maximum zoom to avoid quality loss
    MAX_SCALE: 1.6,
    // Zoom duration
    EMPHASIS_DURATION_MS: 400,
    PUNCH_DURATION_MS: 200,      // fast punch = more impact
    SUBTLE_DURATION_MS: 2000,    // slow drift
    // Trigger conditions
    ENERGY_THRESHOLD_PUNCH: 0.7,  // high energy = punch
    ENERGY_THRESHOLD_EMPHASIS: 0.5,
    // Face tracking
    FACE_ZOOM_SCALE: 1.3,
    FACE_TRACKING_SMOOTHING: 0.85,
  },

  // Silence removal thresholds
  SILENCE: {
    // Silence detection thresholds
    THRESHOLD_DB: -35,               // below -35dB = silence
    MIN_SILENCE_MS: 300,             // minimum silence to detect
    // Trimming rules
    KEEP_PAD_MS: 80,                 // keep 80ms of silence for breathing
    MAX_TRIM_MS: 3000,               // don't trim gaps > 3s (probably intentional)
    // Breath removal
    BREATH_THRESHOLD_MS: 200,        // breaths shorter than 200ms
    BREATH_REDUCTION_MS: 50,         // reduce to 50ms
    // Intelligent silence — keep dramatic pauses
    DRAMATIC_PAUSE_MIN_MS: 500,
    DRAMATIC_PAUSE_MAX_MS: 1500,
    // Context: if energy spikes after silence, it was dramatic
    POST_SILENCE_ENERGY_SPIKE: 0.6,
  },

  // B-roll insertion logic
  BROLL: {
    // Trigger B-roll when:
    TRIGGERS: {
      SAME_SHOT_EXCEEDED_MS: 6000,    // same shot too long
      ENERGY_DROP_THRESHOLD: 0.25,     // energy drops significantly
      TOPIC_TRANSITION: true,          // speaker changes topic
      VISUAL_MONOTONY_MS: 5000,        // no visual change for 5s
    },
    // B-roll duration
    MIN_DURATION_MS: 1500,
    MAX_DURATION_MS: 4000,
    PREFERRED_DURATION_MS: 2500,
    // B-roll reveals context, don't overuse
    MAX_BROLL_PERCENT: 30,            // max 30% of video can be b-roll
  },

  // Sound design heuristics
  SFX: {
    // SFX triggers
    WHOOSH_ON_TRANSITION: true,
    IMPACT_ON_KEY_POINT: true,
    RISER_BEFORE_REVEAL: true,
    POP_ON_TEXT_APPEAR: true,
    // Volume levels (relative to voice)
    WHOOSH_VOLUME: 0.3,
    IMPACT_VOLUME: 0.4,
    RISER_VOLUME: 0.25,
    POP_VOLUME: 0.2,
    // Timing
    RISER_LEAD_MS: 1500,          // riser starts 1.5s before reveal
    IMPACT_OFFSET_MS: 50,         // slight delay for impact feel
  },

  // Color grading presets
  COLOR: {
    PRESETS: {
      cinematic: { lut: 'cinematic_teal_orange', intensity: 0.7 },
      drama: { lut: 'high_contrast_drama', intensity: 0.8 },
      clean: { lut: 'clean_bright', intensity: 0.5 },
      moody: { lut: 'moody_dark', intensity: 0.75 },
      warm: { lut: 'warm_golden', intensity: 0.6 },
      cool: { lut: 'cool_blue', intensity: 0.6 },
      vintage: { lut: 'vintage_film', intensity: 0.65 },
      raw: { lut: 'none', intensity: 0 },
    } as Record<string, { lut: string; intensity: number }>,
  },

  // Platform-specific specs
  PLATFORMS: {
    tiktok: {
      platform: 'tiktok' as Platform,
      maxDurationMs: 180000,          // 3 min
      aspectRatio: '9:16' as const,
      safeZone: { top: 150, bottom: 200, left: 30, right: 30 },
      captionZone: { yStart: 0.25, yEnd: 0.75 },
      maxFileSize: 287_000_000,       // 287MB
      preferredCodec: 'h264',
      preferredBitrate: 6_000_000,
    },
    reels: {
      platform: 'reels' as Platform,
      maxDurationMs: 90000,           // 90s
      aspectRatio: '9:16' as const,
      safeZone: { top: 120, bottom: 180, left: 30, right: 30 },
      captionZone: { yStart: 0.25, yEnd: 0.70 },
      maxFileSize: 250_000_000,
      preferredCodec: 'h264',
      preferredBitrate: 5_000_000,
    },
    shorts: {
      platform: 'shorts' as Platform,
      maxDurationMs: 60000,           // 60s
      aspectRatio: '9:16' as const,
      safeZone: { top: 100, bottom: 150, left: 20, right: 20 },
      captionZone: { yStart: 0.20, yEnd: 0.75 },
      maxFileSize: 200_000_000,
      preferredCodec: 'h264',
      preferredBitrate: 5_000_000,
    },
    twitter: {
      platform: 'twitter' as Platform,
      maxDurationMs: 140000,
      aspectRatio: '16:9' as const,
      safeZone: { top: 50, bottom: 50, left: 50, right: 50 },
      captionZone: { yStart: 0.65, yEnd: 0.90 },
      maxFileSize: 512_000_000,
      preferredCodec: 'h264',
      preferredBitrate: 8_000_000,
    },
    linkedin: {
      platform: 'linkedin' as Platform,
      maxDurationMs: 600000,          // 10 min
      aspectRatio: '1:1' as const,
      safeZone: { top: 50, bottom: 80, left: 50, right: 50 },
      captionZone: { yStart: 0.60, yEnd: 0.85 },
      maxFileSize: 200_000_000,
      preferredCodec: 'h264',
      preferredBitrate: 5_000_000,
    },
    generic: {
      platform: 'generic' as Platform,
      maxDurationMs: 300000,
      aspectRatio: '9:16' as const,
      safeZone: { top: 100, bottom: 150, left: 30, right: 30 },
      captionZone: { yStart: 0.25, yEnd: 0.75 },
      maxFileSize: 300_000_000,
      preferredCodec: 'h264',
      preferredBitrate: 6_000_000,
    },
  } as Record<string, PlatformSpec>,
} as const;

// ---------------------------------------------------------------------------
// Visual heuristics engine
// ---------------------------------------------------------------------------
export class VisualEngine {
  /**
   * Generate zoom keyframes for emphasis and engagement.
   */
  generateZoomKeyframes(
    audio: AudioAnalysis,
    faces: FaceDetection[],
    durationMs: number,
    intensity: number = 0.5,
  ): ZoomKeyframe[] {
    const keyframes: ZoomKeyframe[] = [];
    const rules = VISUAL_RULES.ZOOM;

    // Energy-based zooms
    for (const point of audio.energyProfile) {
      if (point.energy > rules.ENERGY_THRESHOLD_PUNCH * intensity && point.isSpeech) {
        keyframes.push({
          timestampMs: point.timestampMs,
          scale: rules.PUNCH_SCALE * intensity,
          centerX: 0.5,
          centerY: 0.4, // slightly above center (face region)
          easing: 'ease_out',
        });
      } else if (point.energy > rules.ENERGY_THRESHOLD_EMPHASIS * intensity && point.isSpeech) {
        keyframes.push({
          timestampMs: point.timestampMs,
          scale: rules.EMPHASIS_SCALE * intensity,
          centerX: 0.5,
          centerY: 0.4,
          easing: 'ease_in_out',
        });
      }
    }

    // Ensure we don't stack zooms too close together
    return this.deduplicateKeyframes(keyframes, 1000);
  }

  /**
   * Apply intelligent silence removal — preserve dramatic pauses.
   */
  analyzesilenceForTrimming(
    audio: AudioAnalysis,
  ): { toTrim: TimeRange[]; toKeep: TimeRange[] } {
    const rules = VISUAL_RULES.SILENCE;
    const toTrim: TimeRange[] = [];
    const toKeep: TimeRange[] = [];

    for (const silence of audio.silenceRegions) {
      const duration = silence.endMs - silence.startMs;

      // Skip if too short to matter
      if (duration < rules.MIN_SILENCE_MS) continue;

      // Skip if too long (probably intentional)
      if (duration > rules.MAX_TRIM_MS) {
        toKeep.push({ startMs: silence.startMs, endMs: silence.endMs });
        continue;
      }

      // Check if this is a dramatic pause
      if (this.isDramaticPause(silence, audio)) {
        // Keep dramatic pause but trim to optimal length
        toKeep.push({
          startMs: silence.startMs,
          endMs: silence.startMs + Math.min(duration, rules.DRAMATIC_PAUSE_MAX_MS),
        });
        continue;
      }

      // Trim silence but keep padding for natural feel
      toTrim.push({
        startMs: silence.startMs + rules.KEEP_PAD_MS,
        endMs: silence.endMs - rules.KEEP_PAD_MS,
      });
    }

    return { toTrim, toKeep };
  }

  /**
   * Determine B-roll insertion points.
   */
  determineBRollPoints(
    audio: AudioAnalysis,
    scene: SceneAnalysis,
    durationMs: number,
  ): BRollInsertion[] {
    const insertions: BRollInsertion[] = [];
    const rules = VISUAL_RULES.BROLL;
    let bRollTotalMs = 0;
    const maxBRollMs = durationMs * (rules.MAX_BROLL_PERCENT / 100);

    // Detect long same-shot segments
    const shots = scene.shots;
    for (let i = 0; i < shots.length - 1; i++) {
      const shotDuration = (shots[i + 1]?.timestampMs ?? durationMs) - shots[i].timestampMs;
      if (shotDuration > rules.TRIGGERS.SAME_SHOT_EXCEEDED_MS && bRollTotalMs < maxBRollMs) {
        const insertStart = shots[i].timestampMs + rules.TRIGGERS.SAME_SHOT_EXCEEDED_MS / 2;
        const insertDuration = Math.min(rules.PREFERRED_DURATION_MS, shotDuration - rules.TRIGGERS.SAME_SHOT_EXCEEDED_MS);
        insertions.push({
          range: { startMs: insertStart, endMs: insertStart + insertDuration },
          assetQuery: 'contextual', // resolved by asset pipeline
          opacity: 1.0,
          blendMode: 'normal',
        });
        bRollTotalMs += insertDuration;
      }
    }

    return insertions;
  }

  /**
   * Generate SFX trigger points based on content rhythm.
   */
  generateSfxTriggers(
    audio: AudioAnalysis,
    scene: SceneAnalysis,
    intensity: number = 0.5,
  ): SfxEvent[] {
    const triggers: SfxEvent[] = [];
    const rules = VISUAL_RULES.SFX;

    // Whoosh on shot transitions
    if (rules.WHOOSH_ON_TRANSITION) {
      for (const shot of scene.shots) {
        if (shot.type === 'cut') {
          triggers.push({
            timestampMs: shot.timestampMs,
            sfxType: 'whoosh',
            volume: rules.WHOOSH_VOLUME * intensity,
          });
        }
      }
    }

    // Impact on high-energy peaks
    if (rules.IMPACT_ON_KEY_POINT) {
      for (const point of audio.energyProfile) {
        if (point.energy > 0.8 && point.isSpeech) {
          triggers.push({
            timestampMs: point.timestampMs + rules.IMPACT_OFFSET_MS,
            sfxType: 'impact',
            volume: rules.IMPACT_VOLUME * intensity,
          });
        }
      }
    }

    return this.deduplicateSfx(triggers, 500);
  }

  /**
   * Select transition style based on content rhythm.
   */
  selectTransitionStyle(
    tone: string,
    isPlatformVertical: boolean,
  ): TransitionStyle {
    if (tone === 'high_energy') return 'whip_pan';
    if (tone === 'dramatic') return 'flash';
    if (tone === 'comedic') return 'glitch';
    if (tone === 'educational') return 'j_cut';
    return 'hard_cut';
  }

  /**
   * Get platform spec.
   */
  getPlatformSpec(platform: Platform): PlatformSpec {
    return VISUAL_RULES.PLATFORMS[platform] ?? VISUAL_RULES.PLATFORMS.generic;
  }

  /**
   * Select color grade preset based on tone.
   */
  selectColorGrade(tone: string): { lut: string; intensity: number } {
    const map: Record<string, string> = {
      dramatic: 'drama',
      cinematic: 'cinematic',
      high_energy: 'clean',
      comedic: 'warm',
      educational: 'clean',
      suspenseful: 'moody',
      vulnerable: 'warm',
      authoritative: 'cool',
    };
    const preset = map[tone] ?? 'clean';
    return VISUAL_RULES.COLOR.PRESETS[preset] ?? VISUAL_RULES.COLOR.PRESETS.clean;
  }

  // --- Private helpers ---

  private isDramaticPause(silence: SilenceRegion, audio: AudioAnalysis): boolean {
    const rules = VISUAL_RULES.SILENCE;
    const duration = silence.endMs - silence.startMs;

    // Too short or too long for dramatic pause
    if (duration < rules.DRAMATIC_PAUSE_MIN_MS || duration > rules.DRAMATIC_PAUSE_MAX_MS) {
      return false;
    }

    // Check if energy spikes after the silence
    const postSilenceEnergy = audio.energyProfile.find(
      p => p.timestampMs > silence.endMs && p.timestampMs < silence.endMs + 500
    );
    return (postSilenceEnergy?.energy ?? 0) > rules.POST_SILENCE_ENERGY_SPIKE;
  }

  private deduplicateKeyframes(keyframes: ZoomKeyframe[], minGapMs: number): ZoomKeyframe[] {
    const result: ZoomKeyframe[] = [];
    let lastTs = -Infinity;
    for (const kf of keyframes.sort((a, b) => a.timestampMs - b.timestampMs)) {
      if (kf.timestampMs - lastTs >= minGapMs) {
        result.push(kf);
        lastTs = kf.timestampMs;
      }
    }
    return result;
  }

  private deduplicateSfx(triggers: SfxEvent[], minGapMs: number): SfxEvent[] {
    const result: SfxEvent[] = [];
    let lastTs = -Infinity;
    for (const t of triggers.sort((a, b) => a.timestampMs - b.timestampMs)) {
      if (t.timestampMs - lastTs >= minGapMs) {
        result.push(t);
        lastTs = t.timestampMs;
      }
    }
    return result;
  }
}
