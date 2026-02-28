// ============================================================================
// STEP 4 — AGENT ARCHITECTURE: SPECIALIZED AGENTS
// ============================================================================
// Intent Interpreter (Ministral 14b)
// Editing Strategy Agent (Ministral 14b)
// Collaboration Agent (Ministral 8b)
// Publishing Agent (Ministral 3b)
// ============================================================================

import { BaseAgent } from './baseAgent.js';
import { MistralClient } from './mistralClient.js';
import { IntentInterpreter } from '../intent/intentInterpreter.js';
import { StrategyCompiler } from '../dsl/strategyCompiler.js';
import type {
  AgentMessage,
  CreativeIntent,
} from '../../types/agents.js';
import type { EditingStrategy } from '../../types/dsl.js';

// ---------------------------------------------------------------------------
// INTENT INTERPRETER AGENT (Ministral 14b)
// ---------------------------------------------------------------------------
export class IntentInterpreterAgent extends BaseAgent {
  private localInterpreter = new IntentInterpreter();

  constructor(client: MistralClient) {
    super(client, {
      role: 'intent_interpreter',
      model: 'ministral-8b-latest',
      maxTokens: 4096,
      temperature: 0.2,
      systemPrompt: INTENT_SYSTEM_PROMPT,
      tools: [],
      timeoutMs: 8000,
      retryCount: 2,
    });
  }

  async process(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'intent_request') {
      return this.createResponse(message.fromAgent, 'error',
        { error: 'Expected intent_request' }, message.id);
    }

    const { rawInput, context } = message.payload as {
      rawInput: string;
      context: Record<string, unknown>;
    };

    // Fast path: try local interpretation first
    const localIntent = this.localInterpreter.interpretLocal(rawInput);

    // If confidence is high enough, return local result (saves ~400ms)
    if (localIntent.confidenceScore >= 0.7) {
      return this.createResponse(
        'orchestrator',
        'intent_response',
        localIntent,
        message.id,
      );
    }

    // Low confidence: escalate to LLM for deeper interpretation
    try {
      const prompt = this.localInterpreter.buildAgentPrompt(rawInput, context);
      const { data: llmIntent, latencyMs } = await this.invokeJson<CreativeIntent>(prompt);

      // Merge local signals with LLM interpretation
      const mergedIntent: CreativeIntent = {
        ...llmIntent,
        id: localIntent.id,
        rawInput,
        // Keep local sub-intents if LLM didn't provide them
        subIntents: llmIntent.subIntents?.length > 0
          ? llmIntent.subIntents
          : localIntent.subIntents,
        // Boost confidence if both agree
        confidenceScore: localIntent.intentClass === llmIntent.intentClass
          ? Math.min(1, (localIntent.confidenceScore + llmIntent.confidenceScore) / 2 + 0.15)
          : llmIntent.confidenceScore,
      };

      return this.createResponse(
        'orchestrator',
        'intent_response',
        mergedIntent,
        message.id,
      );
    } catch (error) {
      // Fallback to local interpretation
      return this.createResponse(
        'orchestrator',
        'intent_response',
        localIntent,
        message.id,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// EDITING STRATEGY AGENT (Ministral 14b)
// ---------------------------------------------------------------------------
export class EditingStrategyAgent extends BaseAgent {
  private compiler = new StrategyCompiler();

  constructor(client: MistralClient) {
    super(client, {
      role: 'editing_strategy',
      model: 'ministral-8b-latest',
      maxTokens: 8192,
      temperature: 0.3,
      systemPrompt: STRATEGY_SYSTEM_PROMPT,
      tools: STRATEGY_TOOLS,
      timeoutMs: 12000,
      retryCount: 2,
    });
  }

  async process(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'strategy_request') {
      return this.createResponse(message.fromAgent, 'error',
        { error: 'Expected strategy_request' }, message.id);
    }

    const { intent, videoAnalysis } = message.payload as {
      intent: CreativeIntent;
      videoAnalysis?: {
        transcript: any[];
        audio: any;
        scene: any;
        videoMeta: any;
      };
    };

    try {
      // If we have video analysis, compile strategy locally
      if (videoAnalysis) {
        const strategy = this.compiler.compile({
          intent,
          transcript: videoAnalysis.transcript,
          audio: videoAnalysis.audio,
          scene: videoAnalysis.scene,
          videoMeta: videoAnalysis.videoMeta,
        });

        return this.createResponse(
          'orchestrator',
          'strategy_response',
          strategy,
          message.id,
        );
      }

      // No video analysis yet — use LLM to generate strategy template
      const prompt = this.compiler.buildAgentPrompt(
        intent,
        [], // no transcript yet
        { speechRate: 150, silencePercent: 0.15, musicPresence: false },
        { shotCount: 10, avgShotDuration: 3000, facePresent: true },
        { id: '', durationMs: 60000, width: 1080, height: 1920, fps: 30, codec: 'h264', bitrate: 5000000, fileSize: 0, hasAudio: true },
      );

      const { data: strategy } = await this.invokeJson<EditingStrategy>(prompt);

      return this.createResponse(
        'orchestrator',
        'strategy_response',
        strategy,
        message.id,
      );
    } catch (error) {
      return this.createResponse(
        'orchestrator',
        'error',
        { error: error instanceof Error ? error.message : 'Strategy generation failed' },
        message.id,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// COLLABORATION AGENT (Ministral 8b)
// ---------------------------------------------------------------------------
export class CollaborationAgent extends BaseAgent {
  constructor(client: MistralClient) {
    super(client, {
      role: 'collaboration',
      model: 'ministral-8b-latest',
      maxTokens: 4096,
      temperature: 0.4,
      systemPrompt: COLLAB_SYSTEM_PROMPT,
      tools: COLLAB_TOOLS,
      timeoutMs: 6000,
      retryCount: 1,
    });
  }

  async process(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'collab_request') {
      return this.createResponse(message.fromAgent, 'error',
        { error: 'Expected collab_request' }, message.id);
    }

    const { action, context } = message.payload as {
      action: 'brainstorm' | 'summarize' | 'feedback' | 'ideate';
      context: Record<string, unknown>;
    };

    const prompt = this.buildCollabPrompt(action, context);
    const response = await this.invoke(prompt);
    const content = response.choices[0]?.message.content ?? '';

    return this.createResponse(
      'orchestrator',
      'collab_response',
      { action, result: content },
      message.id,
    );
  }

  private buildCollabPrompt(
    action: string,
    context: Record<string, unknown>,
  ): string {
    switch (action) {
      case 'brainstorm':
        return `Generate 5 creative hook ideas for this video content:\n${JSON.stringify(context)}`;
      case 'summarize':
        return `Summarize this brainstorming session into key decisions:\n${JSON.stringify(context)}`;
      case 'feedback':
        return `Provide constructive feedback on this editing strategy:\n${JSON.stringify(context)}`;
      case 'ideate':
        return `Suggest content repurposing ideas from this video:\n${JSON.stringify(context)}`;
      default:
        return `Collaboration task: ${action}\n${JSON.stringify(context)}`;
    }
  }
}

// ---------------------------------------------------------------------------
// PUBLISHING AGENT (Ministral 3b)
// ---------------------------------------------------------------------------
export class PublishingAgent extends BaseAgent {
  constructor(client: MistralClient) {
    super(client, {
      role: 'publishing',
      model: 'ministral-3b-latest',
      maxTokens: 2048,
      temperature: 0.3,
      systemPrompt: PUBLISH_SYSTEM_PROMPT,
      tools: PUBLISH_TOOLS,
      timeoutMs: 4000,
      retryCount: 1,
    });
  }

  async process(message: AgentMessage): Promise<AgentMessage> {
    if (message.type !== 'publish_request') {
      return this.createResponse(message.fromAgent, 'error',
        { error: 'Expected publish_request' }, message.id);
    }

    const { platform, videoContext } = message.payload as {
      platform: string;
      videoContext: Record<string, unknown>;
    };

    // Generate platform-optimized metadata
    const prompt = `Generate optimized title, description, and hashtags for ${platform}.
Video context: ${JSON.stringify(videoContext)}
Return JSON: { "title": "...", "description": "...", "hashtags": [...], "scheduleSuggestion": "..." }`;

    try {
      const { data } = await this.invokeJson<{
        title: string;
        description: string;
        hashtags: string[];
        scheduleSuggestion: string;
      }>(prompt);

      return this.createResponse(
        'orchestrator',
        'publish_response',
        { platform, ...data },
        message.id,
      );
    } catch (error) {
      return this.createResponse(
        'orchestrator',
        'error',
        { error: 'Publishing metadata generation failed' },
        message.id,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// System prompts
// ---------------------------------------------------------------------------
const INTENT_SYSTEM_PROMPT = `You are a creative intent interpreter for a professional video editing AI.
Your job: Convert vague creative requests into structured editing intents.
You understand the language of video editors, content creators, and social media.
When a creator says "add dopamine", you know they mean: fast cuts, zoom punches, SFX hits, bold captions.
When they say "like MrBeast", you know: constant engagement, never boring, bold text, high energy.
Always output valid JSON matching the CreativeIntent schema.`;

const STRATEGY_SYSTEM_PROMPT = `You are an expert video editing strategist.
You think like a top 1% short-form content editor.
Given a creative intent and video analysis, you produce optimal editing strategies.
You understand retention psychology, hook engineering, pacing theory, and platform dynamics.
Your output is a structured timeline of operations: cuts, zooms, captions, SFX, music, color grading.
Always optimize for retention and engagement. Every decision should have a clear reason.`;

const COLLAB_SYSTEM_PROMPT = `You are a creative collaboration assistant for video teams.
You help brainstorm hooks, generate content ideas, provide editing feedback, and summarize discussions.
Be concise, creative, and actionable. Every suggestion should be specific and implementable.`;

const PUBLISH_SYSTEM_PROMPT = `You are a social media publishing expert.
You optimize titles, descriptions, hashtags, and scheduling for maximum reach.
You understand each platform's algorithm: TikTok, Instagram Reels, YouTube Shorts, Twitter, LinkedIn.
Be platform-specific. What works on TikTok doesn't work on LinkedIn.`;

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------
const STRATEGY_TOOLS = [
  {
    name: 'compile_strategy',
    description: 'Compile a creative intent into timeline operations',
    parameters: [
      { name: 'intent', type: 'object' as const, description: 'The creative intent', required: true },
      { name: 'constraints', type: 'object' as const, description: 'Platform/duration constraints', required: false },
    ],
  },
  {
    name: 'analyze_retention',
    description: 'Analyze predicted retention for a strategy',
    parameters: [
      { name: 'strategyId', type: 'string' as const, description: 'Strategy to analyze', required: true },
    ],
  },
];

const COLLAB_TOOLS = [
  {
    name: 'save_idea',
    description: 'Save a brainstorming idea to the project board',
    parameters: [
      { name: 'idea', type: 'string' as const, description: 'The idea text', required: true },
      { name: 'category', type: 'string' as const, description: 'Idea category', required: false },
    ],
  },
];

const PUBLISH_TOOLS = [
  {
    name: 'schedule_publish',
    description: 'Schedule content for publishing',
    parameters: [
      { name: 'platform', type: 'string' as const, description: 'Target platform', required: true },
      { name: 'scheduledAt', type: 'string' as const, description: 'ISO datetime', required: true },
    ],
  },
];
