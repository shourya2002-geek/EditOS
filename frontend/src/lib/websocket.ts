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
// Uses a growing audio window with periodic transcription for real-time feel.
// ---------------------------------------------------------------------------
export function useCustomWhisperVoice() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [commands, setCommands] = useState<Array<{ text: string; timestamp: number }>>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeRef = useRef(false);
  // Accumulated audio chunks for the current utterance
  const chunksRef = useRef<Blob[]>([]);
  const inflightRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTextRef = useRef('');

  const HALLUCINATIONS = ['thank you', 'see you', 'bye', 'subscribe', 'next time'];

  const transcribeAccumulated = useCallback(async () => {
    if (chunksRef.current.length === 0 || inflightRef.current || !activeRef.current) return;
    inflightRef.current = true;

    // Snapshot current chunks
    const blob = new Blob([...chunksRef.current], { type: 'audio/webm' });

    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');

      const res = await fetch('/api/v1/asr/transcribe', {
        method: 'POST',
        headers: { 'x-creator-id': 'dev-creator' },
        body: formData,
      });
      if (!res.ok) return;
      const data = await res.json();
      const text = data.text?.trim() || '';

      if (!activeRef.current) return;

      const isHallucination =
        HALLUCINATIONS.some((h) => text.toLowerCase().includes(h)) && text.split(' ').length < 8;

      if (text && !isHallucination) {
        lastTextRef.current = text;
        setTranscript(text);

        // Reset finalization timer — finalize after 2s of no new text
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          if (lastTextRef.current && activeRef.current) {
            setCommands((prev) => [...prev, { text: lastTextRef.current, timestamp: Date.now() }]);
            // Reset for next utterance
            chunksRef.current = [];
            lastTextRef.current = '';
            setTranscript('');
          }
        }, 2000);
      }
    } catch {
      // ignore transcription errors
    } finally {
      inflightRef.current = false;
    }
  }, []);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      activeRef.current = true;
      chunksRef.current = [];
      lastTextRef.current = '';
      setIsListening(true);

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      // Start with timeslice — fires ondataavailable every 500ms
      recorder.start(500);

      // Transcribe the growing audio buffer every 1.5s
      intervalRef.current = setInterval(() => {
        if (activeRef.current) transcribeAccumulated();
      }, 1500);
    } catch {
      console.error('Microphone permission denied');
    }
  }, [transcribeAccumulated]);

  const stopListening = useCallback(() => {
    activeRef.current = false;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Finalize any remaining text as a command
    if (lastTextRef.current) {
      const finalText = lastTextRef.current;
      setCommands((prev) => [...prev, { text: finalText, timestamp: Date.now() }]);
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    chunksRef.current = [];
    lastTextRef.current = '';
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
