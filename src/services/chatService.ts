// ============================================================================
// CHAT SERVICE — Mistral-powered conversational video editing
// ============================================================================
// Takes user messages (text or voice transcript), sends to Mistral with a
// video-editing system prompt, and returns structured responses that contain
// both a conversational reply AND concrete editing operations.
// ============================================================================

import { MistralClient } from '../core/agents/mistralClient.js';
import type { MistralMessage } from '../core/agents/mistralClient.js';
import { appConfig } from '../config/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface EditOperation {
  type: string;
  startMs?: number;
  endMs?: number;
  params?: Record<string, any>;
  description?: string;
}

export interface ChatResponse {
  message: string;
  operations: EditOperation[];
  strategyName?: string;
}

// ---------------------------------------------------------------------------
// System prompt — teaches Mistral how to be a video editor
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are VIRCUT AI — a decisive, expert video editor. You edit videos instantly when asked. You NEVER hedge, apologize, or say you can't see the video. You make confident creative decisions like a top-tier editor.

PERSONALITY:
- You are DECISIVE. When asked to edit, you DO IT immediately with concrete operations.
- You are CREATIVE. Make smart editorial choices — pick the best pacing, add dramatic effects, create compelling cuts.
- You are CONCISE. Short punchy messages. No filler like "I'll assume" or "If this isn't right".
- You NEVER say "I don't have visual/audio data" or "Since I can't see the video". Just make the edit.
- You ALWAYS produce operations. If a user asks for an edit, you MUST return operations. Never return an empty array when editing was requested.

RESPONSE FORMAT — ALWAYS respond with valid JSON, no markdown, no code blocks:
{
  "message": "Brief confirmation of what you did",
  "operations": [ { "type": "...", "startMs": 0, "endMs": 3000, "params": {}, "description": "..." } ],
  "strategyName": "short_name"
}

AVAILABLE OPERATIONS:
- "cut" — Remove a segment. Requires startMs, endMs.
- "trim_start" — Trim from the beginning. Params: none. startMs=0, endMs=trim amount in ms.
- "trim_end" — Trim from the end. Params: none. startMs=new end point, endMs=video duration.
- "zoom" — Zoom effect. Params: { "level": 1.5 }. Requires startMs, endMs.
- "speed" — Playback speed. Params: { "factor": 2.0 }. startMs=0, endMs=video duration for whole video, or specific range.
- "caption" — Add caption. Params: { "text": "...", "style": "bold|minimal|dynamic" }. Requires startMs, endMs.
- "volume" — Adjust volume. Params: { "level": 0.5 } (0=mute, 1=normal, 2=boost). Requires startMs, endMs.
- "fade_in" — Fade in. Params: { "durationMs": 1000 }. startMs=0, endMs=durationMs.
- "fade_out" — Fade out. Params: { "durationMs": 1000 }. startMs=video_end - durationMs, endMs=video_end.
- "color_grade" — Color grading. Params: { "preset": "warm|cool|vintage|cinematic|vibrant" }. startMs, endMs.
- "music" — Background music. Params: { "mood": "upbeat|chill|dramatic|energetic", "volume": 0.3 }. startMs, endMs.
- "silence_remove" — Remove silence. Params: { "thresholdDb": -30 }. startMs=0, endMs=video duration.
- "split" — Split at a point. Requires startMs only.
- "reset_all" — Clear all edits. No params, no startMs/endMs.

CRITICAL RULES:
1. ALL times in milliseconds. 1s=1000ms. 1min=60000ms.
2. NEVER use timestamps beyond the video duration. If video is 60s (60000ms), max endMs is 60000.
3. "first 3 seconds" = startMs=0, endMs=3000. "last 5 seconds" of 60s video = startMs=55000, endMs=60000.
4. Combine multiple operations freely for complex edits.
5. For non-editing questions ("how are you?"), return empty operations array.
6. ALWAYS include BOTH startMs AND endMs for every operation (except split which only needs startMs, and reset_all which needs neither).
7. When user says "cut" they mean REMOVE that segment. "trim" means remove from start or end.
8. For "reset/clear/start over", include {"type": "reset_all"} in operations.
9. For "make a 30 second video" from a 60s source: use cuts to remove 30s of content, keeping the strongest segments. Divide video into sections, cut the weakest parts.
10. For "pick the best parts" or "highlights": keep the opening hook (first 3-5s), a strong middle section, and a punchy ending. Cut filler/transitions.
11. For "make it cinematic": combine color_grade cinematic + zoom on key moments + music dramatic + fade_in + fade_out.
12. For "make it viral" / "TikTok style": speed up slow parts (1.5x), zoom on key moments (1.3x), add bold captions, cut dead space.
13. When applying effects to the whole video, always use startMs=0 and endMs=full video duration.`;

// ---------------------------------------------------------------------------
// ChatService
// ---------------------------------------------------------------------------
export class ChatService {
  private client: MistralClient;
  private conversations: Map<string, ChatMessage[]> = new Map();

  constructor(client?: MistralClient) {
    this.client = client ?? new MistralClient(appConfig.mistral.apiKey, appConfig.mistral.baseUrl);
  }

  /**
   * Send a chat message and get a response with editing operations.
   */
  async chat(
    conversationId: string,
    userMessage: string,
    context?: { videoDurationMs?: number; platform?: string },
  ): Promise<ChatResponse> {
    // Get or create conversation history
    let history = this.conversations.get(conversationId);
    if (!history) {
      history = [];
      this.conversations.set(conversationId, history);
    }

    // Add context to system prompt if available
    let systemPrompt = SYSTEM_PROMPT;
    const videoDur = context?.videoDurationMs ?? 60000;
    systemPrompt += `\n\nThe current video is ${videoDur}ms (${(videoDur / 1000).toFixed(1)} seconds) long. ALL timestamps MUST be between 0 and ${videoDur}. NEVER exceed ${videoDur}ms.`;
    if (context?.platform) {
      systemPrompt += `\nTarget platform: ${context.platform}. Optimize edits for this platform's style and audience.`;
    }

    // Add user message to history
    history.push({ role: 'user', content: userMessage });

    // Build messages for Mistral API
    const messages: MistralMessage[] = [
      { role: 'system', content: systemPrompt },
      // Include last 20 messages of history for context
      ...history.slice(-20).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    try {
      const response = await this.client.chatCompletion({
        model: appConfig.mistral.models.intent,  // ministral-8b-latest
        messages,
        temperature: 0.3,
        maxTokens: 2048,
        responseFormat: { type: 'json_object' },
      });

      const content = response.choices[0]?.message.content;
      if (!content) {
        throw new Error('Empty response from Mistral');
      }

      // Parse JSON response
      let parsed: ChatResponse;
      try {
        parsed = JSON.parse(content);
      } catch {
        // If Mistral didn't return valid JSON, treat as plain text
        parsed = {
          message: content,
          operations: [],
        };
      }

      // Ensure structure
      const result: ChatResponse = {
        message: parsed.message ?? content,
        operations: Array.isArray(parsed.operations) ? parsed.operations : [],
        strategyName: parsed.strategyName,
      };

      // Add assistant response to history
      history.push({ role: 'assistant', content: result.message });

      // Keep history bounded
      if (history.length > 50) {
        history.splice(0, history.length - 40);
      }

      return result;
    } catch (error: any) {
      // If Mistral API fails (e.g. no key), fall back to a helpful error
      const fallbackMsg = `I couldn't process that right now: ${error.message}. Please check that MISTRAL_API_KEY is set correctly.`;
      history.push({ role: 'assistant', content: fallbackMsg });
      return {
        message: fallbackMsg,
        operations: [],
      };
    }
  }

  /**
   * Clear conversation history.
   */
  clearConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
  }
}
