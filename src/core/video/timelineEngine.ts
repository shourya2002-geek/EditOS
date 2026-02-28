// ============================================================================
// STEP 6 — VIDEO EXECUTION LAYER: TIMELINE ABSTRACTION
// ============================================================================
// Immutable timeline data structure representing the edit state.
// Supports:
//   - Multi-track timeline (video, audio, captions, effects)
//   - Non-destructive editing (all edits are layers)
//   - Serializable (JSON-safe for persistence)
//   - Diffable (for undo/redo)
// ============================================================================

import type { TimeRange, AspectRatio } from '../../types/core.js';
import type { TimelineOperation, EditingStrategy } from '../../types/dsl.js';

// ---------------------------------------------------------------------------
// Timeline types
// ---------------------------------------------------------------------------
export interface Timeline {
  id: string;
  projectId: string;
  version: number;
  durationMs: number;
  fps: number;
  width: number;
  height: number;
  tracks: Track[];
  createdAt: number;
  updatedAt: number;
}

export type TrackType = 'video' | 'audio' | 'caption' | 'effect' | 'music' | 'sfx';

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  clips: Clip[];
  muted: boolean;
  locked: boolean;
  opacity: number;
  volume: number;
}

export interface Clip {
  id: string;
  trackId: string;
  type: ClipType;
  sourceId?: string;         // reference to source asset
  timelineStart: number;     // position on timeline (ms)
  timelineDuration: number;  // duration on timeline (ms)
  sourceStart: number;       // start position in source (ms)
  sourceDuration: number;    // used portion of source (ms)
  speed: number;             // playback speed
  filters: Filter[];
  transitions: ClipTransition[];
  metadata: Record<string, unknown>;
}

export type ClipType = 'video' | 'audio' | 'image' | 'caption' | 'overlay' | 'music' | 'sfx';

export interface Filter {
  id: string;
  type: FilterType;
  params: Record<string, unknown>;
  enabled: boolean;
}

export type FilterType =
  | 'zoom'
  | 'crop'
  | 'color_grade'
  | 'speed_ramp'
  | 'blur'
  | 'vignette'
  | 'brightness'
  | 'contrast'
  | 'saturation'
  | 'face_track'
  | 'loudness'
  | 'eq'
  | 'compressor';

export interface ClipTransition {
  type: 'in' | 'out';
  style: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Timeline engine — builds and manipulates timelines
// ---------------------------------------------------------------------------
export class TimelineEngine {
  /**
   * Create a new empty timeline.
   */
  createTimeline(
    projectId: string,
    durationMs: number,
    width: number = 1080,
    height: number = 1920,
    fps: number = 30,
  ): Timeline {
    return {
      id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      projectId,
      version: 1,
      durationMs,
      fps,
      width,
      height,
      tracks: [
        this.createTrack('video', 'Main Video'),
        this.createTrack('audio', 'Main Audio'),
        this.createTrack('caption', 'Captions'),
        this.createTrack('music', 'Background Music'),
        this.createTrack('sfx', 'Sound Effects'),
        this.createTrack('effect', 'Effects'),
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  /**
   * Apply an editing strategy to a timeline.
   * Returns a new timeline (immutable).
   */
  applyStrategy(timeline: Timeline, strategy: EditingStrategy): Timeline {
    let result = this.cloneTimeline(timeline);

    // Sort operations by priority and apply in order
    const sorted = [...strategy.operations].sort((a, b) => a.priority - b.priority);

    for (const op of sorted) {
      result = this.applyOperation(result, op);
    }

    result.version += 1;
    result.updatedAt = Date.now();

    return result;
  }

  /**
   * Apply a single operation to the timeline.
   */
  applyOperation(timeline: Timeline, operation: TimelineOperation): Timeline {
    const result = this.cloneTimeline(timeline);

    switch (operation.type) {
      case 'trim_silence':
        return this.applySilenceTrim(result, operation);
      case 'speed_ramp':
        return this.applySpeedRamp(result, operation);
      case 'zoom':
        return this.applyZoom(result, operation);
      case 'caption':
        return this.applyCaptions(result, operation);
      case 'sfx_trigger':
        return this.applySfx(result, operation);
      case 'music_layer':
        return this.applyMusic(result, operation);
      case 'color_grade':
        return this.applyColorGrade(result, operation);
      case 'aspect_ratio':
        return this.applyAspectRatio(result, operation);
      case 'loudness':
        return this.applyLoudness(result, operation);
      case 'reorder':
        return this.applyReorder(result, operation);
      case 'cut':
        return this.applyCut(result, operation);
      case 'broll_insert':
        return this.applyBRoll(result, operation);
      default:
        return result; // unknown operation, pass through
    }
  }

  /**
   * Compute the diff between two timelines (for undo tracking).
   */
  diff(before: Timeline, after: Timeline): TimelineDiff {
    const addedClips: Clip[] = [];
    const removedClips: Clip[] = [];
    const modifiedClips: { before: Clip; after: Clip }[] = [];

    const beforeClipMap = new Map<string, Clip>();
    for (const track of before.tracks) {
      for (const clip of track.clips) {
        beforeClipMap.set(clip.id, clip);
      }
    }

    const afterClipMap = new Map<string, Clip>();
    for (const track of after.tracks) {
      for (const clip of track.clips) {
        afterClipMap.set(clip.id, clip);
      }
    }

    // Find added and modified
    for (const [id, clip] of afterClipMap) {
      if (!beforeClipMap.has(id)) {
        addedClips.push(clip);
      } else {
        const beforeClip = beforeClipMap.get(id)!;
        if (JSON.stringify(beforeClip) !== JSON.stringify(clip)) {
          modifiedClips.push({ before: beforeClip, after: clip });
        }
      }
    }

    // Find removed
    for (const [id, clip] of beforeClipMap) {
      if (!afterClipMap.has(id)) {
        removedClips.push(clip);
      }
    }

    return { addedClips, removedClips, modifiedClips };
  }

  // ---------------------------------------------------------------------------
  // Private operation implementations
  // ---------------------------------------------------------------------------

  private applySilenceTrim(timeline: Timeline, op: any): Timeline {
    // Apply silence trimming as speed filters on the audio track
    const audioTrack = timeline.tracks.find(t => t.type === 'audio');
    if (audioTrack) {
      for (const clip of audioTrack.clips) {
        clip.filters.push({
          id: `f_silence_${Date.now()}`,
          type: 'compressor',
          params: {
            thresholdDb: op.thresholdDb,
            minSilenceMs: op.minSilenceMs,
            padMs: op.padMs,
          },
          enabled: true,
        });
      }
    }
    return timeline;
  }

  private applySpeedRamp(timeline: Timeline, op: any): Timeline {
    const videoTrack = timeline.tracks.find(t => t.type === 'video');
    if (videoTrack && op.segments) {
      for (const segment of op.segments) {
        // Add speed ramp filter
        for (const clip of videoTrack.clips) {
          if (this.overlaps(clip, segment.range)) {
            clip.filters.push({
              id: `f_speed_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              type: 'speed_ramp',
              params: {
                startMs: segment.range.startMs,
                endMs: segment.range.endMs,
                speed: segment.speed,
                easing: segment.easing,
              },
              enabled: true,
            });
          }
        }
      }
    }
    return timeline;
  }

  private applyZoom(timeline: Timeline, op: any): Timeline {
    const effectTrack = timeline.tracks.find(t => t.type === 'effect');
    if (effectTrack && op.keyframes) {
      for (const kf of op.keyframes) {
        effectTrack.clips.push({
          id: `clip_zoom_${kf.timestampMs}`,
          trackId: effectTrack.id,
          type: 'overlay',
          timelineStart: kf.timestampMs,
          timelineDuration: 500, // zoom duration
          sourceStart: 0,
          sourceDuration: 500,
          speed: 1,
          filters: [{
            id: `f_zoom_${kf.timestampMs}`,
            type: 'zoom',
            params: {
              scale: kf.scale,
              centerX: kf.centerX,
              centerY: kf.centerY,
              easing: kf.easing,
            },
            enabled: true,
          }],
          transitions: [],
          metadata: {},
        });
      }
    }
    return timeline;
  }

  private applyCaptions(timeline: Timeline, op: any): Timeline {
    const captionTrack = timeline.tracks.find(t => t.type === 'caption');
    if (captionTrack && op.segments) {
      captionTrack.clips = op.segments.map((seg: any, i: number) => ({
        id: `clip_caption_${i}`,
        trackId: captionTrack.id,
        type: 'caption' as ClipType,
        timelineStart: seg.startMs,
        timelineDuration: seg.endMs - seg.startMs,
        sourceStart: 0,
        sourceDuration: seg.endMs - seg.startMs,
        speed: 1,
        filters: [],
        transitions: [],
        metadata: {
          text: seg.text,
          emphasisWords: seg.emphasisWords,
          animation: seg.animation,
          style: op.style,
        },
      }));
    }
    return timeline;
  }

  private applySfx(timeline: Timeline, op: any): Timeline {
    const sfxTrack = timeline.tracks.find(t => t.type === 'sfx');
    if (sfxTrack && op.triggers) {
      for (const trigger of op.triggers) {
        sfxTrack.clips.push({
          id: `clip_sfx_${trigger.timestampMs}`,
          trackId: sfxTrack.id,
          type: 'sfx',
          sourceId: trigger.sfxType,
          timelineStart: trigger.timestampMs,
          timelineDuration: 500,
          sourceStart: 0,
          sourceDuration: 500,
          speed: 1,
          filters: [],
          transitions: [],
          metadata: { sfxType: trigger.sfxType, volume: trigger.volume },
        });
      }
    }
    return timeline;
  }

  private applyMusic(timeline: Timeline, op: any): Timeline {
    const musicTrack = timeline.tracks.find(t => t.type === 'music');
    if (musicTrack) {
      musicTrack.clips = [{
        id: `clip_music_bg`,
        trackId: musicTrack.id,
        type: 'music',
        sourceId: op.mood,
        timelineStart: 0,
        timelineDuration: timeline.durationMs,
        sourceStart: 0,
        sourceDuration: timeline.durationMs,
        speed: 1,
        filters: [],
        transitions: [
          { type: 'in', style: 'fade', durationMs: op.fadeInMs ?? 500 },
          { type: 'out', style: 'fade', durationMs: op.fadeOutMs ?? 1500 },
        ],
        metadata: {
          mood: op.mood,
          tempo: op.tempo,
          volume: op.volume,
          duckUnderSpeech: op.duckUnderSpeech,
          duckLevel: op.duckLevel,
        },
      }];
    }
    return timeline;
  }

  private applyColorGrade(timeline: Timeline, op: any): Timeline {
    const videoTrack = timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      for (const clip of videoTrack.clips) {
        clip.filters.push({
          id: `f_color_${Date.now()}`,
          type: 'color_grade',
          params: { lutPreset: op.lutPreset, intensity: op.intensity },
          enabled: true,
        });
      }
    }
    return timeline;
  }

  private applyAspectRatio(timeline: Timeline, op: any): Timeline {
    const aspectMap: Record<string, { w: number; h: number }> = {
      '9:16': { w: 1080, h: 1920 },
      '16:9': { w: 1920, h: 1080 },
      '1:1': { w: 1080, h: 1080 },
      '4:5': { w: 1080, h: 1350 },
    };
    const dims = aspectMap[op.target];
    if (dims) {
      timeline.width = dims.w;
      timeline.height = dims.h;
    }

    // Add crop filter to video track
    const videoTrack = timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      for (const clip of videoTrack.clips) {
        clip.filters.push({
          id: `f_crop_${Date.now()}`,
          type: 'crop',
          params: { strategy: op.strategy, targetAspect: op.target },
          enabled: true,
        });
      }
    }
    return timeline;
  }

  private applyLoudness(timeline: Timeline, op: any): Timeline {
    const audioTrack = timeline.tracks.find(t => t.type === 'audio');
    if (audioTrack) {
      for (const clip of audioTrack.clips) {
        clip.filters.push({
          id: `f_loudness_${Date.now()}`,
          type: 'loudness',
          params: {
            targetLUFS: op.targetLUFS,
            limiterCeiling: op.limiterCeiling,
            compressorRatio: op.compressorRatio,
          },
          enabled: true,
        });
      }
    }
    return timeline;
  }

  private applyReorder(timeline: Timeline, op: any): Timeline {
    // Reorder creates new clips from source segments in new order
    // This is a structural operation
    if (op.segmentOrder && op.segmentOrder.length > 0) {
      const videoTrack = timeline.tracks.find(t => t.type === 'video');
      if (videoTrack && videoTrack.clips.length > 0) {
        const sourceClip = videoTrack.clips[0];
        const newClips: Clip[] = [];
        let currentPos = 0;

        for (let i = 0; i < op.segmentOrder.length; i++) {
          const seg = op.segmentOrder[i];
          const duration = seg.endMs - seg.startMs;
          newClips.push({
            ...sourceClip,
            id: `clip_reorder_${i}`,
            timelineStart: currentPos,
            timelineDuration: duration,
            sourceStart: seg.startMs,
            sourceDuration: duration,
          });
          currentPos += duration;
        }

        videoTrack.clips = newClips;
        timeline.durationMs = currentPos;
      }
    }
    return timeline;
  }

  private applyCut(timeline: Timeline, op: any): Timeline {
    // Keep only the specified ranges
    if (op.ranges && op.ranges.length > 0) {
      const videoTrack = timeline.tracks.find(t => t.type === 'video');
      if (videoTrack && videoTrack.clips.length > 0) {
        const sourceClip = videoTrack.clips[0];
        const newClips: Clip[] = [];
        let currentPos = 0;

        for (let i = 0; i < op.ranges.length; i++) {
          const range = op.ranges[i];
          const duration = range.endMs - range.startMs;
          newClips.push({
            ...sourceClip,
            id: `clip_cut_${i}`,
            timelineStart: currentPos,
            timelineDuration: duration,
            sourceStart: range.startMs,
            sourceDuration: duration,
          });
          currentPos += duration;
        }

        videoTrack.clips = newClips;
        timeline.durationMs = currentPos;
      }
    }
    return timeline;
  }

  private applyBRoll(timeline: Timeline, op: any): Timeline {
    const effectTrack = timeline.tracks.find(t => t.type === 'effect');
    if (effectTrack && op.insertions) {
      for (const insertion of op.insertions) {
        effectTrack.clips.push({
          id: `clip_broll_${insertion.range.startMs}`,
          trackId: effectTrack.id,
          type: 'video',
          sourceId: insertion.assetId ?? insertion.assetQuery,
          timelineStart: insertion.range.startMs,
          timelineDuration: insertion.range.endMs - insertion.range.startMs,
          sourceStart: 0,
          sourceDuration: insertion.range.endMs - insertion.range.startMs,
          speed: 1,
          filters: [],
          transitions: [],
          metadata: {
            assetQuery: insertion.assetQuery,
            opacity: insertion.opacity,
            blendMode: insertion.blendMode,
          },
        });
      }
    }
    return timeline;
  }

  // --- Utility ---

  private createTrack(type: TrackType, name: string): Track {
    return {
      id: `track_${type}_${Date.now()}`,
      type,
      name,
      clips: [],
      muted: false,
      locked: false,
      opacity: 1,
      volume: 1,
    };
  }

  private cloneTimeline(timeline: Timeline): Timeline {
    return JSON.parse(JSON.stringify(timeline));
  }

  private overlaps(clip: Clip, range: TimeRange): boolean {
    const clipEnd = clip.timelineStart + clip.timelineDuration;
    return clip.timelineStart < range.endMs && clipEnd > range.startMs;
  }
}

// ---------------------------------------------------------------------------
// Timeline diff
// ---------------------------------------------------------------------------
export interface TimelineDiff {
  addedClips: Clip[];
  removedClips: Clip[];
  modifiedClips: { before: Clip; after: Clip }[];
}
