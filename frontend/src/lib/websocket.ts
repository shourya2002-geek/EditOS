// ============================================================================
// WebSocket hooks for real-time features
// ============================================================================

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type WSStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

// ---------------------------------------------------------------------------
// Generic WebSocket hook — stable refs, no stale closures
// ---------------------------------------------------------------------------
export function useWebSocket(path: string) {
  const [status, setStatus] = useState<WSStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout>();
  const messageHandlersRef = useRef<Array<(data: any) => void>>([]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//localhost:3000${path}`;

    setStatus('connecting');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setStatus('connected');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
        messageHandlersRef.current.forEach((h) => h(data));
      } catch {
        setLastMessage(event.data);
        messageHandlersRef.current.forEach((h) => h(event.data));
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
    };

    ws.onerror = () => {
      setStatus('error');
    };

    wsRef.current = ws;
  }, [path]);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimer.current);
    wsRef.current?.close();
    wsRef.current = null;
    setStatus('disconnected');
  }, []);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
    }
  }, []);

  const onMessage = useCallback((handler: (data: any) => void) => {
    messageHandlersRef.current.push(handler);
    return () => {
      messageHandlersRef.current = messageHandlersRef.current.filter((h) => h !== handler);
    };
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return { status, lastMessage, connect, disconnect, send, onMessage };
}

// ---------------------------------------------------------------------------
// Voice-specific hook — uses browser SpeechRecognition API for live STT
// ---------------------------------------------------------------------------

// TypeScript declarations for the Web Speech API
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export function useVoiceWebSocket() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [commands, setCommands] = useState<Array<{ text: string; timestamp: number }>>([]);
  const recognitionRef = useRef<any>(null);
  const restartingRef = useRef(false);

  const startListening = useCallback(async () => {
    // Grab the SpeechRecognition constructor (Chrome / Edge / Safari)
    const SpeechRecognition =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      console.error('SpeechRecognition API not available in this browser');
      alert('Voice commands require Chrome, Edge, or Safari. Please use a supported browser.');
      return;
    }

    // Request mic permission early (helps surface permission prompt)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // We don't need the stream ourselves — SpeechRecognition handles it.
      // Stop immediately so we don't hold the mic open twice.
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      console.error('Microphone permission denied');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;       // keep listening until stopped
    recognition.interimResults = true;   // emit partial transcripts
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript.trim();

        if (result.isFinal) {
          // Final transcript → add as a command which triggers sendToAI
          if (text) {
            setCommands((prev) => [...prev, { text, timestamp: Date.now() }]);
            setTranscript('');
          }
        } else {
          interim += text + ' ';
        }
      }
      if (interim) {
        setTranscript(interim.trim());
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('[voice] SpeechRecognition error:', event.error);
      // 'no-speech' and 'aborted' are non-fatal; restart silently
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      // For network / not-allowed errors, stop
      setIsListening(false);
    };

    // Continuous mode can stop on its own after silence. Auto-restart.
    recognition.onend = () => {
      if (restartingRef.current) return; // avoid re-entrant restart
      // If we still want to be listening, restart
      if (recognitionRef.current === recognition) {
        try {
          restartingRef.current = true;
          recognition.start();
          setTimeout(() => { restartingRef.current = false; }, 200);
        } catch {
          // already running or disposed
          restartingRef.current = false;
        }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null; // signal onend not to restart
    if (recognition) {
      try { recognition.stop(); } catch { /* already stopped */ }
    }
    setIsListening(false);
    setTranscript('');
  }, []);

  return {
    isListening,
    transcript,
    commands,
    startListening,
    stopListening,
    wsStatus: isListening ? ('connected' as const) : ('disconnected' as const),
  };
}

// ---------------------------------------------------------------------------
// Render progress WebSocket hook
// ---------------------------------------------------------------------------
export function useRenderProgress() {
  const [jobs, setJobs] = useState<Map<string, { progress: number; status: string }>>(new Map());

  const ws = useWebSocket('/ws/render');
  const wsRef = useRef(ws);
  wsRef.current = ws;

  useEffect(() => {
    const unsubscribe = wsRef.current.onMessage((data: any) => {
      if (data.type === 'render_progress' || data.type === 'progress') {
        setJobs((prev) => {
          const next = new Map(prev);
          next.set(data.jobId, { progress: data.progress, status: data.status });
          return next;
        });
      }
      if (data.type === 'render_completed') {
        setJobs((prev) => {
          const next = new Map(prev);
          next.set(data.jobId, { progress: 100, status: 'completed' });
          return next;
        });
      }
      if (data.type === 'render_failed') {
        setJobs((prev) => {
          const next = new Map(prev);
          next.set(data.jobId, { progress: 0, status: 'failed' });
          return next;
        });
      }
    });
    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { jobs, connect: ws.connect, disconnect: ws.disconnect, send: ws.send, status: ws.status };
}

// ---------------------------------------------------------------------------
// Custom Whisper voice hook — records mic audio and sends to self-hosted ASR
// ---------------------------------------------------------------------------
export function useCustomWhisperVoice() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [commands, setCommands] = useState<Array<{ text: string; timestamp: number }>>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingLoopRef = useRef<boolean>(false);

  const recordChunk = useCallback(async (): Promise<Blob | null> => {
    const stream = streamRef.current;
    if (!stream) return null;

    return new Promise((resolve) => {
      const chunks: Blob[] = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        resolve(chunks.length > 0 ? new Blob(chunks, { type: 'audio/webm' }) : null);
      };

      recorder.start();

      // Record for 4 seconds then stop
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, 4000);
    });
  }, []);

  const transcribeBlob = useCallback(async (blob: Blob): Promise<string | null> => {
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');

      const res = await fetch('/api/v1/asr/transcribe', {
        method: 'POST',
        headers: { 'x-creator-id': 'dev-creator' },
        body: formData,
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.text?.trim() || null;
    } catch {
      return null;
    }
  }, []);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setIsListening(true);
      recordingLoopRef.current = true;

      // Continuous recording loop
      const loop = async () => {
        while (recordingLoopRef.current) {
          const blob = await recordChunk();
          if (!blob || !recordingLoopRef.current) break;

          setTranscript('Processing...');
          const text = await transcribeBlob(blob);

          if (text && recordingLoopRef.current) {
            const hallucinations = ['thank you', 'see you', 'bye', 'subscribe', 'next time'];
            const isHallucination = hallucinations.some(h => text.toLowerCase().includes(h)) && text.split(' ').length < 8;

            if (!isHallucination) {
              setCommands((prev) => [...prev, { text, timestamp: Date.now() }]);
            }
          }
          setTranscript('');
        }
      };
      loop();
    } catch {
      console.error('Microphone permission denied');
    }
  }, [recordChunk, transcribeBlob]);

  const stopListening = useCallback(() => {
    recordingLoopRef.current = false;
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setIsListening(false);
    setTranscript('');
  }, []);

  return {
    isListening,
    transcript,
    commands,
    startListening,
    stopListening,
    wsStatus: isListening ? ('connected' as const) : ('disconnected' as const),
  };
}
