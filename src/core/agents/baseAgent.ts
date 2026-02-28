// ============================================================================
// STEP 4 — AGENT ARCHITECTURE: BASE AGENT
// ============================================================================
// Abstract base class for all agents. Handles:
//   - System prompt management
//   - Tool registration
//   - Message formatting
//   - Response parsing
//   - Error handling
// ============================================================================

import { MistralClient, type MistralMessage, type MistralToolDefinition, type MistralCompletionResponse } from './mistralClient.js';
import type { AgentRole, AgentConfig, AgentTool, AgentMessage } from '../../types/agents.js';
import { appConfig } from '../../config/index.js';

// ---------------------------------------------------------------------------
// Base agent class
// ---------------------------------------------------------------------------
export abstract class BaseAgent {
  protected client: MistralClient;
  protected config: AgentConfig;
  protected conversationHistory: MistralMessage[] = [];

  constructor(client: MistralClient, config: AgentConfig) {
    this.client = client;
    this.config = config;
  }

  /**
   * Agent role identifier.
   */
  get role(): AgentRole {
    return this.config.role;
  }

  /**
   * Process an incoming agent message and return a response.
   * This is the main inter-agent interface.
   */
  abstract process(message: AgentMessage): Promise<AgentMessage>;

  /**
   * Send a prompt to the underlying model and get a response.
   */
  protected async invoke(
    userMessage: string,
    options?: {
      jsonMode?: boolean;
      tools?: MistralToolDefinition[];
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<MistralCompletionResponse> {
    const messages: MistralMessage[] = [
      { role: 'system', content: this.config.systemPrompt },
      ...this.conversationHistory,
      { role: 'user', content: userMessage },
    ];

    const model = this.client.getModelForRole(this.config.role);

    const response = await this.client.chatCompletion({
      model,
      messages,
      temperature: options?.temperature ?? this.config.temperature,
      maxTokens: options?.maxTokens ?? this.config.maxTokens,
      tools: options?.tools ?? this.buildToolDefinitions(),
      responseFormat: options?.jsonMode ? { type: 'json_object' } : undefined,
    });

    // Add to conversation history
    this.conversationHistory.push({ role: 'user', content: userMessage });
    if (response.choices[0]?.message.content) {
      this.conversationHistory.push({
        role: 'assistant',
        content: response.choices[0].message.content,
      });
    }

    return response;
  }

  /**
   * Send a prompt and parse response as JSON.
   */
  protected async invokeJson<T = unknown>(
    userMessage: string,
    options?: { temperature?: number; maxTokens?: number },
  ): Promise<{ data: T; latencyMs: number }> {
    const model = this.client.getModelForRole(this.config.role);

    const result = await this.client.jsonCompletion<T>({
      model,
      messages: [
        { role: 'system', content: this.config.systemPrompt },
        ...this.conversationHistory,
        { role: 'user', content: userMessage },
      ],
      temperature: options?.temperature ?? this.config.temperature,
      maxTokens: options?.maxTokens ?? this.config.maxTokens,
    });

    return { data: result.data, latencyMs: result.latencyMs };
  }

  /**
   * Stream a response from the model.
   */
  protected async *invokeStream(
    userMessage: string,
  ): AsyncGenerator<string, void, unknown> {
    const model = this.client.getModelForRole(this.config.role);

    const stream = this.client.chatCompletionStream({
      model,
      messages: [
        { role: 'system', content: this.config.systemPrompt },
        ...this.conversationHistory,
        { role: 'user', content: userMessage },
      ],
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta.content;
      if (content) yield content;
    }
  }

  /**
   * Reset conversation history (for new session).
   */
  resetHistory(): void {
    this.conversationHistory = [];
  }

  /**
   * Build MistralToolDefinition[] from agent tool config.
   */
  protected buildToolDefinitions(): MistralToolDefinition[] | undefined {
    if (this.config.tools.length === 0) return undefined;

    return this.config.tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            tool.parameters.map(p => [p.name, {
              type: p.type,
              description: p.description,
              ...(p.enum ? { enum: p.enum } : {}),
            }])
          ),
          required: tool.parameters.filter(p => p.required).map(p => p.name),
        },
      },
    }));
  }

  /**
   * Create a standardized agent message response.
   */
  protected createResponse(
    toAgent: AgentRole,
    type: AgentMessage['type'],
    payload: unknown,
    correlationId?: string,
  ): AgentMessage {
    return {
      id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      fromAgent: this.config.role,
      toAgent,
      sessionId: '', // set by caller
      type,
      payload,
      timestamp: Date.now(),
      correlationId,
    };
  }
}
