// ============================================================================
// VIRCUT ENGINE — EDITING DSL TYPE DEFINITIONS
// ============================================================================

import type { TimeRange, AspectRatio, Platform, EmotionalTone } from './core.js';

// ---------------------------------------------------------------------------
// Top-level editing strategy (output of Strategy Agent)
// ---------------------------------------------------------------------------
export interface EditingStrategy {
  id: string;
  version: number;
  sourceVideoId: string;
  targetPlatform: Platform;
  targetDurationMs: number;
  style: StyleProfile;
  operations: TimelineOperation[];
  metadata: StrategyMetadata;
}

export interface StrategyMetadata {
  generatedAt: number;
  agentModel: string;
  confidenceScore: number;
  estimatedRenderTimeMs: number;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Style profile — the "creative DNA" of an edit
// ---------------------------------------------------------------------------
export interface StyleProfile {
  pacing: PacingProfile;
  captions: CaptionStyle;
  visualStyle: VisualStyle;
  audioStyle: AudioStyle;
  hookStrategy: HookStrategy;
  retentionStrategy: RetentionStrategy;
}

export interface PacingProfile {
  avgCutIntervalMs: number;       // target ms between cuts
  minCutIntervalMs: number;
  maxCutIntervalMs: number;
  patternInterruptFreqMs: number; // how often to break pattern
  speedRampIntensity: number;     // 0-1, how aggressive speed ramps are
  energyCurve: EnergyCurveType;
}

export type EnergyCurveType =
  | 'constant_high'      // MrBeast style
  | 'escalating'         // building tension
  | 'wave'               // peaks and valleys
  | 'front_loaded'       // hook then sustain
  | 'dramatic_arc';      // tension → climax → resolve

export interface CaptionStyle {
  enabled: boolean;
  position: 'top' | 'center' | 'bottom';
  maxWordsPerLine: number;
  fontFamily: string;
  fontWeight: number;           // 400-900
  fontSize: number;             // relative to frame height %
  primaryColor: string;         // hex
  accentColor: string;          // hex for emphasis words
  backgroundColor?: string;     // hex, optional pill bg
  backgroundOpacity: number;    // 0-1
  animation: CaptionAnimation;
  emphasisStrategy: EmphasisStrategy;
  wordByWord: boolean;          // karaoke-style
}

export type CaptionAnimation =
  | 'none'
  | 'fade_in'
  | 'pop'
  | 'typewriter'
  | 'bounce'
  | 'slide_up'
  | 'scale_in';

export type EmphasisStrategy =
  | 'none'
  | 'bold_keywords'
  | 'color_keywords'
  | 'size_keywords'
  | 'all_caps_keywords'
  | 'shake_keywords';

export interface VisualStyle {
  colorGrade: string;           // LUT preset name
  zoomIntensity: number;        // 0-1
  faceTrackingZoom: boolean;
  motionGraphics: boolean;
  bRollEnabled: boolean;
  transitionStyle: TransitionStyle;
  letterboxing: boolean;
  vignetteIntensity: number;    // 0-1
}

export type TransitionStyle =
  | 'hard_cut'
  | 'j_cut'
  | 'l_cut'
  | 'zoom_transition'
  | 'whip_pan'
  | 'glitch'
  | 'flash';

export interface AudioStyle {
  backgroundMusicEnabled: boolean;
  musicMood: string;
  musicVolume: number;          // 0-1
  sfxEnabled: boolean;
  sfxIntensity: number;         // 0-1, how many SFX triggers
  loudnessTarget: number;       // LUFS
  bassBoost: number;            // 0-1
  voiceEnhancement: boolean;
}

export interface HookStrategy {
  type: HookType;
  targetDurationMs: number;     // how long the hook should be
  openingStyle: OpeningStyle;
  textOverlay?: string;
}

export type HookType =
  | 'question'
  | 'bold_claim'
  | 'controversy'
  | 'teaser'
  | 'visual_shock'
  | 'social_proof'
  | 'pain_point'
  | 'curiosity_gap';

export type OpeningStyle =
  | 'cold_open'              // dive right into peak moment
  | 'context_first'          // brief setup then hook
  | 'visual_hook'            // start with most visual moment
  | 'question_hook'          // open with question
  | 'reorder_peak';          // move climax to front

export interface RetentionStrategy {
  targetRetentionCurve: number[];  // normalized 0-1 at 10% intervals
  patternInterrupts: PatternInterruptRule[];
  antiDropOff: AntiDropOffRule[];
}

export interface PatternInterruptRule {
  triggerType: 'time_based' | 'energy_drop' | 'silence' | 'monotone';
  triggerThreshold: number;
  action: PatternInterruptAction;
}

export type PatternInterruptAction =
  | 'zoom_punch'
  | 'angle_switch'
  | 'broll_insert'
  | 'sfx_hit'
  | 'text_overlay'
  | 'speed_ramp'
  | 'color_flash'
  | 'music_swell';

export interface AntiDropOffRule {
  timestampPercent: number;     // where in the video (0-100%)
  strategy: 'tease_payoff' | 'energy_boost' | 'visual_change' | 'new_info';
}

// ---------------------------------------------------------------------------
// Timeline operations — the DSL "instructions"
// ---------------------------------------------------------------------------
export type TimelineOperation =
  | CutOperation
  | TrimSilenceOperation
  | SpeedRampOperation
  | ZoomOperation
  | FaceTrackZoomOperation
  | CaptionOperation
  | TextOverlayOperation
  | TransitionOperation
  | BRollInsertOperation
  | MusicLayerOperation
  | SfxTriggerOperation
  | ColorGradeOperation
  | AspectRatioOperation
  | ReorderOperation
  | LoudnessOperation
  | MotionGraphicOperation;

interface BaseOperation {
  id: string;
  priority: number;           // execution order
  condition?: OperationCondition;
}

export interface OperationCondition {
  type: 'platform' | 'duration' | 'tone';
  value: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt';
}

export interface CutOperation extends BaseOperation {
  type: 'cut';
  ranges: TimeRange[];         // segments to KEEP
  crossfadeMs?: number;
}

export interface TrimSilenceOperation extends BaseOperation {
  type: 'trim_silence';
  thresholdDb: number;
  minSilenceMs: number;
  padMs: number;               // breathing room to keep
  maxTrimMs: number;           // don't trim more than this per gap
}

export interface SpeedRampOperation extends BaseOperation {
  type: 'speed_ramp';
  segments: SpeedSegment[];
}

export interface SpeedSegment {
  range: TimeRange;
  speed: number;               // 1.0 = normal, 2.0 = 2x, 0.5 = half
  easing: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out';
}

export interface ZoomOperation extends BaseOperation {
  type: 'zoom';
  keyframes: ZoomKeyframe[];
}

export interface ZoomKeyframe {
  timestampMs: number;
  scale: number;               // 1.0 = normal, 1.3 = 30% zoom
  centerX: number;             // 0-1
  centerY: number;             // 0-1
  easing: string;
}

export interface FaceTrackZoomOperation extends BaseOperation {
  type: 'face_track_zoom';
  range: TimeRange;
  targetScale: number;
  smoothing: number;           // 0-1, how smooth tracking is
  speakerId?: string;
}

export interface CaptionOperation extends BaseOperation {
  type: 'caption';
  style: CaptionStyle;
  segments: CaptionSegment[];
}

export interface CaptionSegment {
  text: string;
  startMs: number;
  endMs: number;
  emphasisWords: string[];
  animation?: CaptionAnimation;
}

export interface TextOverlayOperation extends BaseOperation {
  type: 'text_overlay';
  overlays: TextOverlay[];
}

export interface TextOverlay {
  text: string;
  startMs: number;
  endMs: number;
  position: { x: number; y: number };
  fontSize: number;
  fontWeight: number;
  color: string;
  animation: string;
}

export interface TransitionOperation extends BaseOperation {
  type: 'transition';
  transitions: TransitionEvent[];
}

export interface TransitionEvent {
  timestampMs: number;
  style: TransitionStyle;
  durationMs: number;
}

export interface BRollInsertOperation extends BaseOperation {
  type: 'broll_insert';
  insertions: BRollInsertion[];
}

export interface BRollInsertion {
  range: TimeRange;             // where to insert
  assetQuery: string;           // search query for b-roll
  assetId?: string;             // resolved asset
  opacity: number;
  blendMode: string;
}

export interface MusicLayerOperation extends BaseOperation {
  type: 'music_layer';
  mood: string;
  tempo: 'slow' | 'medium' | 'fast' | 'match_content';
  volume: number;
  fadeInMs: number;
  fadeOutMs: number;
  duckUnderSpeech: boolean;
  duckLevel: number;           // volume during speech
}

export interface SfxTriggerOperation extends BaseOperation {
  type: 'sfx_trigger';
  triggers: SfxEvent[];
}

export interface SfxEvent {
  timestampMs: number;
  sfxType: 'whoosh' | 'impact' | 'riser' | 'ding' | 'glitch' | 'pop' | 'boom' | 'swoosh';
  volume: number;
}

export interface ColorGradeOperation extends BaseOperation {
  type: 'color_grade';
  lutPreset: string;
  intensity: number;           // 0-1
  range?: TimeRange;           // optional, whole video if omitted
}

export interface AspectRatioOperation extends BaseOperation {
  type: 'aspect_ratio';
  target: AspectRatio;
  strategy: 'crop_center' | 'crop_face' | 'letterbox' | 'blur_fill';
}

export interface ReorderOperation extends BaseOperation {
  type: 'reorder';
  segmentOrder: TimeRange[];   // new order of source segments
}

export interface LoudnessOperation extends BaseOperation {
  type: 'loudness';
  targetLUFS: number;
  limiterCeiling: number;
  compressorRatio: number;
}

export interface MotionGraphicOperation extends BaseOperation {
  type: 'motion_graphic';
  graphics: MotionGraphicEvent[];
}

export interface MotionGraphicEvent {
  templateId: string;
  startMs: number;
  endMs: number;
  params: Record<string, unknown>;
}
