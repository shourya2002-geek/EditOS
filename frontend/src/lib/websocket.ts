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
// Voice-specific WebSocket hook
// ---------------------------------------------------------------------------
export function useVoiceWebSocket() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [commands, setCommands] = useState<Array<{ text: string; timestamp: number }>>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const ws = useWebSocket('/ws/voice');
  // Keep a stable ref to ws so effects don't re-fire on every render
  const wsRef = useRef(ws);
  wsRef.current = ws;

  // Register message handlers ONCE (empty deps)
  useEffect(() => {
    const unsubscribe = wsRef.current.onMessage((data: any) => {
      // Backend sends: { type: 'transcript', payload: { text, isFinal }, ... }
      if (data.type === 'transcript' || data.type === 'transcript_final') {
        const text = data.payload?.text ?? data.text ?? '';
        setTranscript(text);
      }
      // Backend sends: { type: 'command', payload: { type, transcript }, ... }
      if (data.type === 'command') {
        const text = data.payload?.transcript ?? data.text ?? '';
        setCommands((prev) => [...prev, { text, timestamp: Date.now() }]);
      }
      // Backend sends: { type: 'feedback', payload: {...}, ... }
      if (data.type === 'feedback') {
        const text = data.payload?.message ?? data.payload?.text ?? JSON.stringify(data.payload);
        setCommands((prev) => [...prev, { text: `[feedback] ${text}`, timestamp: Date.now() }]);
      }
      // Backend sends: { type: 'status', payload: { status: 'ready' }, ... }
      if (data.type === 'status') {
        console.log('[voice] status:', data.payload?.status);
      }
    });
    return unsubscribe;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Try audio/webm, fall back to default
      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined' && !MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = '';
      }

      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          wsRef.current.send(event.data);
        }
      };

      // Connect WebSocket first, then start recording
      wsRef.current.connect();
      mediaRecorder.start(250);
      mediaRecorderRef.current = mediaRecorder;
      setIsListening(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Stop all audio tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    wsRef.current.disconnect();
    setIsListening(false);
  }, []);

  return {
    isListening,
    transcript,
    commands,
    startListening,
    stopListening,
    wsStatus: ws.status,
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
