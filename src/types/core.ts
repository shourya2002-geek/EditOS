// ============================================================================
// VIRCUT ENGINE — CORE TYPE DEFINITIONS
// ============================================================================

// ---------------------------------------------------------------------------
// Temporal primitives
// ---------------------------------------------------------------------------
export interface TimeRange {
  startMs: number;
  endMs: number;
}

export interface Timestamp {
  ms: number;
  frame?: number;
  timecode?: string; // HH:MM:SS:FF
}

// ---------------------------------------------------------------------------
// Platform definitions
// ---------------------------------------------------------------------------
export type Platform = 'tiktok' | 'reels' | 'shorts' | 'twitter' | 'linkedin' | 'generic';

export interface PlatformSpec {
  platform: Platform;
  maxDurationMs: number;
  aspectRatio: AspectRatio;
  safeZone: { top: number; bottom: number; left: number; right: number };
  captionZone: { yStart: number; yEnd: number };
  maxFileSize: number; // bytes
  preferredCodec: string;
  preferredBitrate: number;
}

export type AspectRatio = '9:16' | '16:9' | '1:1' | '4:5';

// ---------------------------------------------------------------------------
// Content analysis types
// ---------------------------------------------------------------------------
export interface TranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
  confidence: number;
  speaker?: string;
  words?: WordTiming[];
}

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
  confidence: number;
}

export interface ShotBoundary {
  timestampMs: number;
  type: 'cut' | 'dissolve' | 'fade' | 'wipe';
  confidence: number;
}

export interface SilenceRegion {
  startMs: number;
  endMs: number;
  avgDb: number;
}

export interface FaceDetection {
  timestampMs: number;
  faces: FaceBoundingBox[];
}

export interface FaceBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  speakerId?: string;
}

export interface AudioAnalysis {
  loudnessLUFS: number;
  peakDb: number;
  silenceRegions: SilenceRegion[];
  energyProfile: EnergyPoint[];
  speechRate: number; // words per minute
  musicPresence: boolean;
  musicSegments: TimeRange[];
}

export interface EnergyPoint {
  timestampMs: number;
  energy: number; // 0-1
  isSpeech: boolean;
}

export interface SceneAnalysis {
  shots: ShotBoundary[];
  faces: FaceDetection[];
  motionIntensity: MotionPoint[];
  brightnessProfile: BrightnessPoint[];
  dominantColors: ColorSegment[];
}

export interface MotionPoint {
  timestampMs: number;
  intensity: number; // 0-1
}

export interface BrightnessPoint {
  timestampMs: number;
  avgLuma: number; // 0-255
}

export interface ColorSegment {
  range: TimeRange;
  dominantHex: string;
  palette: string[];
}

// ---------------------------------------------------------------------------
// Emotional + content classification
// ---------------------------------------------------------------------------
export type EmotionalTone =
  | 'high_energy'
  | 'dramatic'
  | 'comedic'
  | 'inspirational'
  | 'educational'
  | 'confrontational'
  | 'vulnerable'
  | 'suspenseful'
  | 'casual'
  | 'authoritative';

export type ContentVertical =
  | 'business'
  | 'fitness'
  | 'comedy'
  | 'education'
  | 'lifestyle'
  | 'tech'
  | 'motivation'
  | 'storytelling'
  | 'news'
  | 'gaming'
  | 'beauty'
  | 'food'
  | 'travel'
  | 'entertainment'
  | 'cooking'
  | 'music';

export interface ContentClassification {
  vertical: ContentVertical;
  tones: EmotionalTone[];
  hookStrength: number; // 0-100
  retentionPrediction: number; // 0-100
  viralityScore: number; // 0-100
  pacingScore: number; // 0-100
}

// ---------------------------------------------------------------------------
// Video metadata
// ---------------------------------------------------------------------------
export interface VideoMetadata {
  id: string;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  bitrate: number;
  fileSize: number;
  hasAudio: boolean;
  audioCodec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
}

// ---------------------------------------------------------------------------
// Session + Creator types
// ---------------------------------------------------------------------------
export interface Session {
  id: string;
  creatorId: string;
  projectId: string;
  startedAt: number;
  lastActiveAt: number;
  state: SessionState;
  history: SessionEvent[];
}

export type SessionState = 'active' | 'paused' | 'rendering' | 'completed';

export interface SessionEvent {
  id: string;
  type: string;
  timestamp: number;
  payload: unknown;
}

export interface Creator {
  id: string;
  name: string;
  styleProfileId?: string;
  platforms: Platform[];
  tier: 'free' | 'pro' | 'enterprise';
  createdAt: number;
}
