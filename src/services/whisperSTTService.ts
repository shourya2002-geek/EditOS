// ============================================================================
// Custom Whisper STT Service — proxies audio to self-hosted Whisper API
// ============================================================================

import { appConfig } from '../config/index.js';

export interface TranscriptionResult {
  text: string;
  model: string;
  provider: 'custom-whisper' | 'browser';
}

export class WhisperSTTService {
  private url: string;
  private timeoutMs: number;

  constructor(url?: string, timeoutMs?: number) {
    this.url = url ?? appConfig.customAsr.url;
    this.timeoutMs = timeoutMs ?? appConfig.customAsr.timeoutMs;
  }

  /**
   * Check if the custom ASR server is reachable.
   */
  async healthCheck(): Promise<{ status: string; model: string; device: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.url}/health`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
      return await res.json() as { status: string; model: string; device: string };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Transcribe an audio buffer (WAV or raw PCM).
   */
  async transcribe(audioBuffer: Buffer, filename?: string): Promise<TranscriptionResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      // Build multipart form data manually using Blob
      const formData = new FormData();
      const blob = new Blob([new Uint8Array(audioBuffer)], { type: 'audio/wav' });
      formData.append('audio', blob, filename ?? 'audio.wav');

      const res = await fetch(`${this.url}/transcribe`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error((body as any).error ?? `Transcription failed: ${res.status}`);
      }

      const data = await res.json() as { text: string; model: string };
      return {
        text: data.text,
        model: data.model,
        provider: 'custom-whisper',
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
