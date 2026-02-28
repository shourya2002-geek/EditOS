// ============================================================================
// STEP 6 — VIDEO EXECUTION LAYER: FFMPEG COMMAND BUILDER
// ============================================================================
// Translates timeline state into FFmpeg command chains.
// Handles:
//   - Complex filter graph construction
//   - GPU vs CPU decision logic
//   - Format-specific encoding
//   - Reusable filter presets
// ============================================================================

import type { Timeline, Track, Clip, Filter } from './timelineEngine.js';
import type { PlatformSpec } from '../../types/core.js';

// ---------------------------------------------------------------------------
// FFmpeg command types
// ---------------------------------------------------------------------------
export interface FFmpegCommand {
  inputs: FFmpegInput[];
  filterGraph: string;
  outputOptions: string[];
  outputPath: string;
}

export interface FFmpegInput {
  path: string;
  options: string[];
}

// ---------------------------------------------------------------------------
// GPU vs CPU decision
// ---------------------------------------------------------------------------
export interface HardwareProfile {
  gpuAvailable: boolean;
  gpuType?: 'nvidia' | 'amd' | 'intel' | 'apple';
  gpuVram?: number;
  cpuCores: number;
  ramGb: number;
}

export function selectEncoder(profile: HardwareProfile, codec: string): string {
  if (codec === 'h264') {
    if (profile.gpuAvailable) {
      switch (profile.gpuType) {
        case 'nvidia': return 'h264_nvenc';
        case 'amd': return 'h264_amf';
        case 'intel': return 'h264_qsv';
        case 'apple': return 'h264_videotoolbox';
      }
    }
    return 'libx264';
  }
  if (codec === 'h265' || codec === 'hevc') {
    if (profile.gpuAvailable) {
      switch (profile.gpuType) {
        case 'nvidia': return 'hevc_nvenc';
        case 'apple': return 'hevc_videotoolbox';
      }
    }
    return 'libx265';
  }
  return 'libx264'; // fallback
}

// ---------------------------------------------------------------------------
// FFmpeg command builder
// ---------------------------------------------------------------------------
export class FFmpegCommandBuilder {
  private hardware: HardwareProfile;

  constructor(hardware: HardwareProfile) {
    this.hardware = hardware;
  }

  /**
   * Build FFmpeg command(s) to render a timeline.
   */
  buildRenderCommands(
    timeline: Timeline,
    sourcePath: string,
    outputPath: string,
    platformSpec: PlatformSpec,
  ): FFmpegCommand[] {
    const commands: FFmpegCommand[] = [];

    // Phase 1: Structural edits (cuts, reorder, speed ramps)
    const structuralCmd = this.buildStructuralPass(timeline, sourcePath, platformSpec);
    commands.push(structuralCmd);

    // Phase 2: Visual effects (zoom, color grade, crop)
    // Applied as filter graph on the structural output
    const visualCmd = this.buildVisualPass(timeline, structuralCmd.outputPath, platformSpec);
    commands.push(visualCmd);

    // Phase 3: Audio processing (loudness, music, SFX)
    const audioCmd = this.buildAudioPass(timeline, visualCmd.outputPath, platformSpec);
    commands.push(audioCmd);

    // Phase 4: Final assembly + captions
    const finalCmd = this.buildFinalPass(
      timeline,
      audioCmd.outputPath,
      outputPath,
      platformSpec,
    );
    commands.push(finalCmd);

    return commands;
  }

  /**
   * Build a single-pass command for simple edits (faster for quick previews).
   */
  buildPreviewCommand(
    timeline: Timeline,
    sourcePath: string,
    outputPath: string,
    platformSpec: PlatformSpec,
  ): FFmpegCommand {
    const encoder = selectEncoder(this.hardware, platformSpec.preferredCodec);
    const filterChain: string[] = [];

    // Basic structural operations
    const videoTrack = timeline.tracks.find(t => t.type === 'video');
    if (videoTrack && videoTrack.clips.length > 0) {
      // Build concat filter for clips
      const concatInputs = videoTrack.clips.map((clip, i) => {
        return `[0:v]trim=start=${clip.sourceStart / 1000}:end=${(clip.sourceStart + clip.sourceDuration) / 1000},setpts=PTS-STARTPTS[v${i}]`;
      });
      filterChain.push(...concatInputs);

      if (videoTrack.clips.length > 1) {
        const concatLabels = videoTrack.clips.map((_, i) => `[v${i}]`).join('');
        filterChain.push(`${concatLabels}concat=n=${videoTrack.clips.length}:v=1:a=0[vout]`);
      } else {
        filterChain.push(`[v0]copy[vout]`);
      }
    }

    // Scale to target dimensions
    filterChain.push(`[vout]scale=${timeline.width}:${timeline.height}:force_original_aspect_ratio=decrease,pad=${timeline.width}:${timeline.height}:(ow-iw)/2:(oh-ih)/2[final]`);

    return {
      inputs: [{ path: sourcePath, options: [] }],
      filterGraph: filterChain.join(';\n'),
      outputOptions: [
        `-map "[final]"`,
        `-map 0:a?`,
        `-c:v ${encoder}`,
        `-b:v ${Math.round(platformSpec.preferredBitrate * 0.5)}`, // lower bitrate for preview
        `-preset ultrafast`,
        `-c:a aac`,
        `-b:a 128k`,
        `-movflags +faststart`,
        `-y`,
      ],
      outputPath,
    };
  }

  // --- Phase builders ---

  private buildStructuralPass(
    timeline: Timeline,
    sourcePath: string,
    platformSpec: PlatformSpec,
  ): FFmpegCommand {
    const tempPath = sourcePath.replace(/\.[^.]+$/, '_structural.mp4');
    const videoTrack = timeline.tracks.find(t => t.type === 'video');
    const filters: string[] = [];

    if (videoTrack && videoTrack.clips.length > 0) {
      // Build trim + concat
      videoTrack.clips.forEach((clip, i) => {
        const start = clip.sourceStart / 1000;
        const end = (clip.sourceStart + clip.sourceDuration) / 1000;
        filters.push(`[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]`);
        filters.push(`[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[a${i}]`);
      });

      if (videoTrack.clips.length > 1) {
        const vLabels = videoTrack.clips.map((_, i) => `[v${i}]`).join('');
        const aLabels = videoTrack.clips.map((_, i) => `[a${i}]`).join('');
        filters.push(`${vLabels}concat=n=${videoTrack.clips.length}:v=1:a=0[vout]`);
        filters.push(`${aLabels}concat=n=${videoTrack.clips.length}:v=0:a=1[aout]`);
      }
    }

    const encoder = selectEncoder(this.hardware, platformSpec.preferredCodec);

    return {
      inputs: [{ path: sourcePath, options: [] }],
      filterGraph: filters.join(';\n'),
      outputOptions: [
        `-c:v ${encoder}`,
        `-preset fast`,
        `-crf 18`,
        `-c:a aac`,
        `-y`,
      ],
      outputPath: tempPath,
    };
  }

  private buildVisualPass(
    timeline: Timeline,
    inputPath: string,
    platformSpec: PlatformSpec,
  ): FFmpegCommand {
    const tempPath = inputPath.replace('_structural', '_visual');
    const filters: string[] = [];

    // Scale + crop for aspect ratio
    filters.push(`scale=${timeline.width}:${timeline.height}:force_original_aspect_ratio=decrease`);
    filters.push(`pad=${timeline.width}:${timeline.height}:(ow-iw)/2:(oh-ih)/2`);

    // Apply color grading (LUT if available)
    const videoTrack = timeline.tracks.find(t => t.type === 'video');
    if (videoTrack) {
      for (const clip of videoTrack.clips) {
        const colorFilter = clip.filters.find(f => f.type === 'color_grade');
        if (colorFilter && colorFilter.params.lutPreset !== 'none') {
          // In production, map LUT preset to actual .cube file
          filters.push(`eq=brightness=0.03:contrast=1.1:saturation=1.1`);
        }
      }
    }

    const encoder = selectEncoder(this.hardware, platformSpec.preferredCodec);

    return {
      inputs: [{ path: inputPath, options: [] }],
      filterGraph: filters.join(','),
      outputOptions: [
        `-c:v ${encoder}`,
        `-preset fast`,
        `-crf 18`,
        `-c:a copy`,
        `-y`,
      ],
      outputPath: tempPath,
    };
  }

  private buildAudioPass(
    timeline: Timeline,
    inputPath: string,
    platformSpec: PlatformSpec,
  ): FFmpegCommand {
    const tempPath = inputPath.replace('_visual', '_audio');
    const filters: string[] = [];

    // Loudness normalization
    const audioTrack = timeline.tracks.find(t => t.type === 'audio');
    if (audioTrack) {
      const loudnessFilter = audioTrack.clips.flatMap(c => c.filters).find(f => f.type === 'loudness');
      if (loudnessFilter) {
        const target = loudnessFilter.params.targetLUFS ?? -14;
        filters.push(`loudnorm=I=${target}:LRA=11:TP=-1`);
      }
    }

    return {
      inputs: [{ path: inputPath, options: [] }],
      filterGraph: filters.length > 0 ? `[0:a]${filters.join(',')}[aout]` : '',
      outputOptions: [
        `-c:v copy`,
        `-c:a aac`,
        `-b:a 192k`,
        `-y`,
      ],
      outputPath: tempPath,
    };
  }

  private buildFinalPass(
    timeline: Timeline,
    inputPath: string,
    outputPath: string,
    platformSpec: PlatformSpec,
  ): FFmpegCommand {
    const encoder = selectEncoder(this.hardware, platformSpec.preferredCodec);

    return {
      inputs: [{ path: inputPath, options: [] }],
      filterGraph: '',
      outputOptions: [
        `-c:v ${encoder}`,
        `-b:v ${platformSpec.preferredBitrate}`,
        `-c:a aac`,
        `-b:a 192k`,
        `-movflags +faststart`,
        `-y`,
      ],
      outputPath,
    };
  }
}
