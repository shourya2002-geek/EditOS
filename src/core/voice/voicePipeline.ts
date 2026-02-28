// ============================================================================
// STEP 5 — VOICE PIPELINE: REAL-TIME VOICE ARCHITECTURE
// ============================================================================
// Handles:
//   - Streaming audio via WebSocket
//   - Partial transcription handling
//   - Intent prediction before sentence completion
//   - Interrupt handling
//   - Confirmation gating for destructive actions
//   - Realtime preview feedback
//   - Voice-based undo
// ============================================================================

import { EventEmitter } from 'events';
import type { AgentMessage } from '../../types/agents.js';
import { appConfig } from '../../config/index.js';

// ---------------------------------------------------------------------------
// Voice pipeline types
// ---------------------------------------------------------------------------
export interface VoiceSession {
  id: string;
  creatorId: string;
  state: VoiceState;
  audioBuffer: Float32Array[];
  partialTranscript: string;
  fullTranscripts: string[];
  pendingConfirmation?: ConfirmationRequest;
  lastActivityMs: number;
}

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'waiting_confirmation';

export interface ConfirmationRequest {
  id: string;
  question: string;
  options: string[];
  strategyId?: string;
  timeoutMs: number;
  createdAt: number;
}

export interface VoiceEvent {
  type: VoiceEventType;
  sessionId: string;
  timestamp: number;
  data: unknown;
}

export type VoiceEventType =
  | 'audio_chunk'           // raw audio data
  | 'transcript_partial'    // partial (streaming) transcription
  | 'transcript_final'      // final transcription
  | 'intent_predicted'      // early intent prediction (before sentence ends)
  | 'command_detected'      // full command detected
  | 'confirmation_request'  // system asks for confirmation
  | 'confirmation_response' // user confirms/denies
  | 'interrupt'             // user interrupted system
  | 'feedback'              // system speaks back
  | 'error';

// ---------------------------------------------------------------------------
// Voice pipeline event bus
// ---------------------------------------------------------------------------
export type VoiceEventHandler = (event: VoiceEvent) => void | Promise<void>;

// ---------------------------------------------------------------------------
// WebSocket message protocol
// ---------------------------------------------------------------------------
export interface VoiceWSMessage {
  type: 'audio' | 'control' | 'transcript' | 'feedback' | 'status';
  payload: unknown;
  sessionId: string;
  timestamp: number;
}

export interface AudioChunkPayload {
  data: ArrayBuffer;
  sampleRate: number;
  channels: number;
  isFinal: boolean;
}

export interface TranscriptPayload {
  text: string;
  isFinal: boolean;
  confidence: number;
  words?: { word: string; startMs: number; endMs: number }[];
}

export interface FeedbackPayload {
  text: string;
  audioData?: ArrayBuffer;
  priority: 'low' | 'normal' | 'high';
}

// ---------------------------------------------------------------------------
// Voice pipeline engine
// ---------------------------------------------------------------------------
export class VoicePipeline {
  private sessions = new Map<string, VoiceSession>();
  private emitter = new EventEmitter();
  private config = appConfig.voice;

  // Latency budget tracking
  private latencyBudgets = {
    audioIngest: 50,        // max 50ms to receive + buffer audio
    transcription: 200,     // max 200ms for partial transcription
    intentPrediction: 150,  // max 150ms for early intent prediction
    commandProcess: 400,    // max 400ms to process full command
    feedbackGenerate: 200,  // max 200ms to generate response
    // Total voice loop: ~1000ms target
  };

  /**
   * Create a new voice session.
   */
  createSession(sessionId: string, creatorId: string): VoiceSession {
    const session: VoiceSession = {
      id: sessionId,
      creatorId,
      state: 'idle',
      audioBuffer: [],
      partialTranscript: '',
      fullTranscripts: [],
      lastActivityMs: Date.now(),
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Process an incoming audio chunk from WebSocket.
   */
  async processAudioChunk(
    sessionId: string,
    chunk: AudioChunkPayload,
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`No voice session: ${sessionId}`);

    session.lastActivityMs = Date.now();

    // If system is speaking and user starts talking → interrupt
    if (session.state === 'speaking') {
      this.handleInterrupt(session);
      return;
    }

    session.state = 'listening';

    // Buffer the audio chunk
    const floatData = new Float32Array(chunk.data);
    session.audioBuffer.push(floatData);

    // Emit for transcription pipeline
    this.emit({
      type: 'audio_chunk',
      sessionId,
      timestamp: Date.now(),
      data: chunk,
    });

    // If chunk is marked final (end of utterance),
    // trigger final transcription processing
    if (chunk.isFinal) {
      session.state = 'processing';
      this.emit({
        type: 'command_detected',
        sessionId,
        timestamp: Date.now(),
        data: { transcript: session.partialTranscript },
      });
    }
  }

  /**
   * Handle partial transcription (streaming from Voxtral).
   * Enables early intent prediction before the speaker finishes.
   */
  handlePartialTranscript(
    sessionId: string,
    transcript: TranscriptPayload,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.partialTranscript = transcript.text;

    this.emit({
      type: 'transcript_partial',
      sessionId,
      timestamp: Date.now(),
      data: transcript,
    });

    // Early intent prediction — start processing before sentence completes
    // Only if we have enough words for meaningful prediction
    const wordCount = transcript.text.trim().split(/\s+/).length;
    if (wordCount >= 3) {
      this.emit({
        type: 'intent_predicted',
        sessionId,
        timestamp: Date.now(),
        data: { partialText: transcript.text, confidence: transcript.confidence },
      });
    }
  }

  /**
   * Handle final transcription.
   */
  handleFinalTranscript(
    sessionId: string,
    transcript: TranscriptPayload,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.fullTranscripts.push(transcript.text);
    session.partialTranscript = '';
    session.audioBuffer = []; // Clear buffer

    this.emit({
      type: 'transcript_final',
      sessionId,
      timestamp: Date.now(),
      data: transcript,
    });

    // Check for special voice commands
    const command = transcript.text.toLowerCase().trim();

    if (this.isUndoCommand(command)) {
      this.emit({
        type: 'command_detected',
        sessionId,
        timestamp: Date.now(),
        data: { type: 'undo', transcript: transcript.text },
      });
      return;
    }

    if (session.state === 'waiting_confirmation') {
      this.handleConfirmationResponse(session, command);
      return;
    }

    // Regular command
    this.emit({
      type: 'command_detected',
      sessionId,
      timestamp: Date.now(),
      data: { type: 'command', transcript: transcript.text },
    });
  }

  /**
   * Request confirmation from the user (destructive action gating).
   */
  requestConfirmation(
    sessionId: string,
    request: ConfirmationRequest,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = 'waiting_confirmation';
    session.pendingConfirmation = request;

    this.emit({
      type: 'confirmation_request',
      sessionId,
      timestamp: Date.now(),
      data: request,
    });

    // Auto-timeout confirmation
    setTimeout(() => {
      if (session.pendingConfirmation?.id === request.id) {
        session.state = 'idle';
        session.pendingConfirmation = undefined;
        this.emit({
          type: 'feedback',
          sessionId,
          timestamp: Date.now(),
          data: { text: 'Confirmation timed out. No changes made.', priority: 'normal' },
        });
      }
    }, request.timeoutMs);
  }

  /**
   * Send feedback to the user (TTS response).
   */
  sendFeedback(
    sessionId: string,
    feedback: FeedbackPayload,
  ): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.state = 'speaking';

    this.emit({
      type: 'feedback',
      sessionId,
      timestamp: Date.now(),
      data: feedback,
    });
  }

  /**
   * Subscribe to voice events.
   */
  on(eventType: VoiceEventType, handler: VoiceEventHandler): void {
    this.emitter.on(eventType, handler);
  }

  /**
   * Get session.
   */
  getSession(sessionId: string): VoiceSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get latency budgets.
   */
  getLatencyBudgets(): typeof this.latencyBudgets {
    return { ...this.latencyBudgets };
  }

  /**
   * Destroy session and clean up.
   */
  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  // --- Private helpers ---

  private handleInterrupt(session: VoiceSession): void {
    session.state = 'listening';
    this.emit({
      type: 'interrupt',
      sessionId: session.id,
      timestamp: Date.now(),
      data: { reason: 'user_spoke_during_feedback' },
    });
  }

  private handleConfirmationResponse(session: VoiceSession, response: string): void {
    const isConfirmed = /^(yes|yeah|yep|sure|okay|ok|do it|go ahead|confirm|proceed)/i.test(response);
    const isDenied = /^(no|nah|nope|cancel|stop|don't|never mind)/i.test(response);

    session.state = 'idle';
    const confirmation = session.pendingConfirmation;
    session.pendingConfirmation = undefined;

    this.emit({
      type: 'confirmation_response',
      sessionId: session.id,
      timestamp: Date.now(),
      data: {
        confirmed: isConfirmed,
        denied: isDenied,
        ambiguous: !isConfirmed && !isDenied,
        response,
        confirmationId: confirmation?.id,
        strategyId: confirmation?.strategyId,
      },
    });
  }

  private isUndoCommand(text: string): boolean {
    return /^(undo|go back|revert|undo that|take that back)/i.test(text);
  }

  private emit(event: VoiceEvent): void {
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event); // wildcard listener
  }
}
