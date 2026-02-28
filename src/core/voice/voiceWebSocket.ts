// ============================================================================
// STEP 5 — VOICE PIPELINE: WEBSOCKET HANDLER
// ============================================================================
// WebSocket server-side handler for voice connections.
// Manages the audio streaming protocol.
// ============================================================================

import type { WebSocket } from 'ws';
import { VoicePipeline, type VoiceWSMessage, type AudioChunkPayload, type TranscriptPayload } from './voicePipeline.js';

// ---------------------------------------------------------------------------
// WebSocket voice handler
// ---------------------------------------------------------------------------
export class VoiceWebSocketHandler {
  private pipeline: VoicePipeline;
  private connections = new Map<string, WebSocket>();

  constructor(pipeline: VoicePipeline) {
    this.pipeline = pipeline;

    // Wire up pipeline events to WebSocket responses
    this.pipeline.on('feedback', async (event) => {
      const ws = this.connections.get(event.sessionId);
      if (ws && ws.readyState === 1) { // OPEN
        ws.send(JSON.stringify({
          type: 'feedback',
          payload: event.data,
          sessionId: event.sessionId,
          timestamp: event.timestamp,
        }));
      }
    });

    this.pipeline.on('confirmation_request', async (event) => {
      const ws = this.connections.get(event.sessionId);
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'confirmation',
          payload: event.data,
          sessionId: event.sessionId,
          timestamp: event.timestamp,
        }));
      }
    });

    this.pipeline.on('transcript_partial', async (event) => {
      const ws = this.connections.get(event.sessionId);
      if (ws && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'transcript',
          payload: event.data,
          sessionId: event.sessionId,
          timestamp: event.timestamp,
        }));
      }
    });
  }

  /**
   * Handle a new WebSocket connection.
   */
  handleConnection(ws: WebSocket, sessionId: string, creatorId: string): void {
    this.connections.set(sessionId, ws);
    this.pipeline.createSession(sessionId, creatorId);

    // Send ready signal
    ws.send(JSON.stringify({
      type: 'status',
      payload: { status: 'ready', sessionId },
      sessionId,
      timestamp: Date.now(),
    }));

    // Handle incoming messages
    ws.on('message', async (data: Buffer | string) => {
      try {
        // Binary data = audio chunk
        if (data instanceof Buffer) {
          await this.handleAudioData(sessionId, data);
          return;
        }

        // Text data = JSON control message
        const message: VoiceWSMessage = JSON.parse(data.toString());
        await this.handleControlMessage(sessionId, message);
      } catch (error) {
        ws.send(JSON.stringify({
          type: 'status',
          payload: {
            status: 'error',
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          sessionId,
          timestamp: Date.now(),
        }));
      }
    });

    // Handle disconnection
    ws.on('close', () => {
      this.connections.delete(sessionId);
      this.pipeline.destroySession(sessionId);
    });

    ws.on('error', () => {
      this.connections.delete(sessionId);
      this.pipeline.destroySession(sessionId);
    });
  }

  /**
   * Get count of active voice connections.
   */
  getActiveConnectionCount(): number {
    return this.connections.size;
  }

  // --- Private handlers ---

  private async handleAudioData(sessionId: string, data: Buffer): Promise<void> {
    const chunk: AudioChunkPayload = {
      data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength).buffer as ArrayBuffer,
      sampleRate: 16000,
      channels: 1,
      isFinal: false,
    };
    await this.pipeline.processAudioChunk(sessionId, chunk);
  }

  private async handleControlMessage(
    sessionId: string,
    message: VoiceWSMessage,
  ): Promise<void> {
    switch (message.type) {
      case 'control': {
        const payload = message.payload as { action: string };
        if (payload.action === 'end_utterance') {
          const chunk: AudioChunkPayload = {
            data: new ArrayBuffer(0),
            sampleRate: 16000,
            channels: 1,
            isFinal: true,
          };
          await this.pipeline.processAudioChunk(sessionId, chunk);
        }
        break;
      }

      case 'transcript': {
        const payload = message.payload as TranscriptPayload;
        if (payload.isFinal) {
          this.pipeline.handleFinalTranscript(sessionId, payload);
        } else {
          this.pipeline.handlePartialTranscript(sessionId, payload);
        }
        break;
      }
    }
  }
}
