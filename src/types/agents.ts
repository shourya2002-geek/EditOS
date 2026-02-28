// ============================================================================
// VIRCUT ENGINE — AGENT TYPE DEFINITIONS
// ============================================================================

import type { Platform, EmotionalTone, ContentVertical } from './core.js';
import type { EditingStrategy, StyleProfile, TimelineOperation } from './dsl.js';

// ---------------------------------------------------------------------------
// Agent identity
// ---------------------------------------------------------------------------
export type AgentRole =
  | 'orchestrator'
  | 'intent_interpreter'
  | 'editing_strategy'
  | 'collaboration'
  | 'publishing'
  | 'voice';

export interface AgentConfig {
  role: AgentRole;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  tools: AgentTool[];
  timeoutMs: number;
  retryCount: number;
}

// ---------------------------------------------------------------------------
// Inter-agent messages
// ---------------------------------------------------------------------------
export interface AgentMessage {
  id: string;
  fromAgent: AgentRole;
  toAgent: AgentRole;
  sessionId: string;
  type: AgentMessageType;
  payload: unknown;
  timestamp: number;
  correlationId?: string;      // for request-response pairing
  ttlMs?: number;
}

export type AgentMessageType =
  | 'intent_request'
  | 'intent_response'
  | 'strategy_request'
  | 'strategy_response'
  | 'collab_request'
  | 'collab_response'
  | 'publish_request'
  | 'publish_response'
  | 'voice_transcript'
  | 'voice_command'
  | 'error'
  | 'status_update';

// ---------------------------------------------------------------------------
// Creative Intent — output of Intent Interpreter
// ---------------------------------------------------------------------------
export interface CreativeIntent {
  id: string;
  rawInput: string;
  intentClass: IntentClass;
  subIntents: SubIntent[];
  targetPlatform?: Platform;
  targetTone?: EmotionalTone;
  styleReference?: StyleReference;
  confidenceScore: number;
  ambiguityFlags: AmbiguityFlag[];
  resolvedParams: Record<string, unknown>;
}

export type IntentClass =
  | 'style_change'
  | 'pacing_change'
  | 'content_restructure'
  | 'caption_change'
  | 'audio_change'
  | 'platform_optimize'
  | 'clip_extraction'
  | 'full_edit'
  | 'undo'
  | 'incremental_adjust'
  | 'export'
  | 'collaboration';

export interface SubIntent {
  category: string;
  action: string;
  intensity: number;           // 0-1
  params: Record<string, unknown>;
}

export interface StyleReference {
  creatorName?: string;
  styleEmbedding?: number[];
  matchedProfileId?: string;
  traits: string[];
}

export interface AmbiguityFlag {
  field: string;
  reason: string;
  suggestions: string[];
  requiresConfirmation: boolean;
}

// ---------------------------------------------------------------------------
// Agent tool definitions (function calling)
// ---------------------------------------------------------------------------
export interface AgentTool {
  name: string;
  description: string;
  parameters: AgentToolParameter[];
}

export interface AgentToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  enum?: string[];
}

// ---------------------------------------------------------------------------
// Orchestrator state machine
// ---------------------------------------------------------------------------
export type OrchestratorState =
  | 'idle'
  | 'listening'
  | 'interpreting_intent'
  | 'planning_strategy'
  | 'confirming'
  | 'executing'
  | 'rendering'
  | 'reviewing'
  | 'error';

export interface OrchestratorContext {
  sessionId: string;
  creatorId: string;
  projectId: string;
  currentState: OrchestratorState;
  currentIntent?: CreativeIntent;
  currentStrategy?: EditingStrategy;
  history: OrchestratorEvent[];
  undoStack: EditingStrategy[];
  creatorProfile?: CreatorStyleProfile;
}

export interface OrchestratorEvent {
  state: OrchestratorState;
  timestamp: number;
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Creator style profile (learning moat)
// ---------------------------------------------------------------------------
export interface CreatorStyleProfile {
  id: string;
  creatorId: string;
  styleEmbedding: number[];         // dense vector
  preferredPacing: string;
  preferredCaptionStyle: string;
  preferredPlatforms: Platform[];
  preferredTones: EmotionalTone[];
  verticals: ContentVertical[];
  avgRetention: number;
  topPerformingTraits: string[];
  editHistory: EditHistoryEntry[];
  lastUpdated: number;
}

export interface EditHistoryEntry {
  strategyId: string;
  timestamp: number;
  retentionScore?: number;
  platformPerformance?: PlatformPerformance;
}

export interface PlatformPerformance {
  platform: Platform;
  views: number;
  watchTimeMs: number;
  avgRetentionPercent: number;
  shares: number;
  comments: number;
}

// ---------------------------------------------------------------------------
// Publishing types
// ---------------------------------------------------------------------------
export interface PublishRequest {
  projectId: string;
  platform: Platform;
  title: string;
  description: string;
  tags: string[];
  scheduledAt?: number;
  thumbnailAssetId?: string;
}

export interface PublishResult {
  platform: Platform;
  status: 'success' | 'failed' | 'scheduled';
  url?: string;
  publishedAt?: number;
  error?: string;
}
