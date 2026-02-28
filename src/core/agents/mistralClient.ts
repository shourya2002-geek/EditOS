// ============================================================================
// STEP 4 — AGENT ARCHITECTURE: MISTRAL API CLIENT
// ============================================================================
// Production-grade Mistral API wrapper with:
//   - Model routing
//   - Streaming support
//   - Tool calling
//   - Retry logic
//   - Token tracking
//   - Latency monitoring
// ============================================================================

import { appConfig } from '../../config/index.js';
import type { AgentRole } from '../../types/agents.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface MistralMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
}

export interface MistralToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface MistralCompletionRequest {
  model: string;
  messages: MistralMessage[];
  temperature?: number;
  maxTokens?: number;
  tools?: MistralToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'any';
  responseFormat?: { type: 'json_object' | 'text' };
  stream?: boolean;
}

export interface MistralCompletionResponse {
  id: string;
  choices: MistralChoice[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  latencyMs: number;
}

export interface MistralChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string | null;
    toolCalls?: MistralToolCall[];
  };
  finishReason: 'stop' | 'tool_calls' | 'length';
}

export interface MistralToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface StreamChunk {
  id: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
      toolCalls?: Partial<MistralToolCall>[];
    };
    finishReason: string | null;
  }[];
}

// ---------------------------------------------------------------------------
// Mistral API client
// ---------------------------------------------------------------------------
export class MistralClient {
  private apiKey: string;
  private baseUrl: string;
  private tokenUsage: Map<string, { prompt: number; completion: number }> = new Map();

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey ?? appConfig.mistral.apiKey;
    this.baseUrl = baseUrl ?? appConfig.mistral.baseUrl;

    if (!this.apiKey) {
      throw new Error('MISTRAL_API_KEY is required');
    }
  }

  /**
   * Get the model ID for a given agent role.
   */
  getModelForRole(role: AgentRole): string {
    const modelMap: Record<AgentRole, string> = {
      orchestrator: appConfig.mistral.models.orchestrator,
      intent_interpreter: appConfig.mistral.models.intent,
      editing_strategy: appConfig.mistral.models.strategy,
      collaboration: appConfig.mistral.models.collaboration,
      publishing: appConfig.mistral.models.publishing,
      voice: appConfig.mistral.models.voiceRealtime,
    };
    return modelMap[role];
  }

  /**
   * Get the timeout for a given agent role.
   */
  getTimeoutForRole(role: AgentRole): number {
    const timeoutMap: Record<string, number> = {
      orchestrator: appConfig.mistral.timeouts.orchestrator,
      intent_interpreter: appConfig.mistral.timeouts.intent,
      editing_strategy: appConfig.mistral.timeouts.strategy,
      collaboration: appConfig.mistral.timeouts.collaboration,
      publishing: appConfig.mistral.timeouts.publishing,
      voice: 5000,
    };
    return timeoutMap[role] ?? 10000;
  }

  /**
   * Standard (non-streaming) chat completion.
   */
  async chatCompletion(request: MistralCompletionRequest): Promise<MistralCompletionResponse> {
    const startTime = Date.now();

    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      })),
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 4096,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = request.toolChoice ?? 'auto';
    }
    if (request.responseFormat) {
      body.response_format = request.responseFormat;
    }

    const response = await this.fetchWithRetry(
      `${this.baseUrl}/v1/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
      3,
    );

    const data: any = await response.json();
    const latencyMs = Date.now() - startTime;

    // Track token usage
    this.trackUsage(request.model, data.usage);

    return {
      id: data.id,
      choices: data.choices.map((c: any) => ({
        index: c.index,
        message: {
          role: 'assistant',
          content: c.message.content,
          toolCalls: c.message.tool_calls?.map((tc: any) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        },
        finishReason: c.finish_reason,
      })),
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      model: data.model,
      latencyMs,
    };
  }

  /**
   * Streaming chat completion — yields chunks.
   */
  async *chatCompletionStream(
    request: MistralCompletionRequest,
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
    };

    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = request.toolChoice ?? 'auto';
    }

    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Mistral streaming error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (trimmed.startsWith('data: ')) {
          try {
            const chunk = JSON.parse(trimmed.slice(6));
            yield {
              id: chunk.id,
              choices: chunk.choices.map((c: any) => ({
                index: c.index,
                delta: {
                  role: c.delta?.role,
                  content: c.delta?.content,
                  toolCalls: c.delta?.tool_calls,
                },
                finishReason: c.finish_reason,
              })),
            };
          } catch {
            // Skip malformed chunks
          }
        }
      }
    }
  }

  /**
   * JSON-mode completion — ensures valid JSON output.
   */
  async jsonCompletion<T = unknown>(
    request: Omit<MistralCompletionRequest, 'responseFormat' | 'stream'>,
  ): Promise<{ data: T; usage: MistralCompletionResponse['usage']; latencyMs: number }> {
    const response = await this.chatCompletion({
      ...request,
      responseFormat: { type: 'json_object' },
    });

    const content = response.choices[0]?.message.content;
    if (!content) throw new Error('Empty response from Mistral');

    try {
      const data = JSON.parse(content) as T;
      return { data, usage: response.usage, latencyMs: response.latencyMs };
    } catch {
      throw new Error(`Failed to parse JSON response: ${content.substring(0, 200)}`);
    }
  }

  /**
   * Get cumulative token usage by model.
   */
  getTokenUsage(): Map<string, { prompt: number; completion: number }> {
    return new Map(this.tokenUsage);
  }

  // --- Private helpers ---

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    maxRetries: number,
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, init);

        if (response.ok) return response;

        // Rate limit — exponential backoff
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') ?? '1');
          await this.sleep(retryAfter * 1000 * Math.pow(2, attempt));
          continue;
        }

        // Server error — retry
        if (response.status >= 500) {
          await this.sleep(1000 * Math.pow(2, attempt));
          continue;
        }

        // Client error — don't retry
        const errorBody = await response.text();
        throw new Error(`Mistral API error ${response.status}: ${errorBody}`);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < maxRetries) {
          await this.sleep(1000 * Math.pow(2, attempt));
        }
      }
    }

    throw lastError ?? new Error('Max retries exceeded');
  }

  private trackUsage(model: string, usage?: { prompt_tokens: number; completion_tokens: number }): void {
    if (!usage) return;
    const existing = this.tokenUsage.get(model) ?? { prompt: 0, completion: 0 };
    this.tokenUsage.set(model, {
      prompt: existing.prompt + usage.prompt_tokens,
      completion: existing.completion + usage.completion_tokens,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
