// ============================================================================
// Frontend types mirroring the backend API responses
// ============================================================================

export interface Project {
  id: string;
  name: string;
  creatorId: string;
  status: 'draft' | 'editing' | 'rendering' | 'published';
  platform?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  durationMs?: number;
  createdAt: number;
  updatedAt: number;
}

export interface Session {
  id: string;
  creatorId: string;
  projectId: string;
  startedAt: number;
  lastActiveAt: number;
  state: 'active' | 'paused' | 'rendering' | 'completed';
}

export interface EditingStrategy {
  id: string;
  version: number;
  sourceVideoId: string;
  targetPlatform: string;
  targetDurationMs: number;
  style: StyleProfile;
  operations: TimelineOperation[];
  metadata: StrategyMetadata;
}

export interface StyleProfile {
  pacing: {
    avgCutIntervalMs: number;
    energyCurve: string;
  };
  captions: {
    enabled: boolean;
    style: string;
  };
}

export interface TimelineOperation {
  type: string;
  priority: number;
  timeRange?: { startMs: number; endMs: number };
  params: Record<string, unknown>;
}

export interface StrategyMetadata {
  generatedAt: number;
  agentModel: string;
  confidenceScore: number;
  estimatedRenderTimeMs: number;
  warnings: string[];
}

export interface RenderJob {
  id: string;
  projectId: string;
  status: 'queued' | 'processing' | 'rendering' | 'completed' | 'failed';
  progress: number;
  priority: string;
  createdAt: number;
  metadata: {
    estimatedDurationMs: number;
    useGpu: boolean;
  };
}

export interface CreatorProfile {
  id: string;
  creatorId: string;
  preferredPacing: string;
  preferredCaptionStyle: string;
  preferredPlatforms: string[];
  preferredTones: string[];
  verticals: string[];
  avgRetention: number;
  topPerformingTraits: string[];
}

export interface Experiment {
  id: string;
  name: string;
  status: 'draft' | 'running' | 'completed';
  variants: ExperimentVariant[];
  winnerVariantId?: string;
  confidenceLevel?: number;
  createdAt: number;
}

export interface ExperimentVariant {
  id: string;
  name: string;
  config: Record<string, unknown>;
  impressions: number;
  conversions: number;
  conversionRate: number;
}

export interface HealthResponse {
  status: string;
  timestamp: number;
  uptime: number;
  version: string;
}

export interface ApiError {
  error: string;
  statusCode?: number;
}
