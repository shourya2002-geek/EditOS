// ============================================================================
// WebSocket hooks for real-time features
// ============================================================================

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

type WSStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketOptions {
  onMessage?: (data: any) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: Event) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
}

export function useWebSocket(path: string, options: UseWebSocketOptions = {}) {
  const [status, setStatus] = useState<WSStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<any>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Connect directly to backend on port 3000 for WebSocket
    const wsUrl = `${protocol}//localhost:3000${path}`;

    setStatus('connecting');
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setStatus('connected');
      options.onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
        options.onMessage?.(data);
      } catch {
        setLastMessage(event.data);
        options.onMessage?.(event.data);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      options.onClose?.();
      if (options.autoReconnect !== false) {
        reconnectTimer.current = setTimeout(connect, options.reconnectInterval ?? 3000);
      }
    };

    ws.onerror = (event) => {
      setStatus('error');
      options.onError?.(event);
    };

    wsRef.current = ws;
  }, [path, options]);

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

  useEffect(() => {
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  return { status, lastMessage, connect, disconnect, send };
}

// Voice-specific WebSocket hook
export function useVoiceWebSocket() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [commands, setCommands] = useState<Array<{ text: string; timestamp: number }>>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const ws = useWebSocket('/ws/voice', {
    onMessage: (data) => {
      if (data.type === 'transcript') {
        setTranscript(data.text);
      } else if (data.type === 'command') {
        setCommands((prev) => [...prev, { text: data.text, timestamp: Date.now() }]);
      }
    },
    autoReconnect: false,
  });

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          ws.send(event.data);
        }
      };

      mediaRecorder.start(250); // Send chunks every 250ms
      mediaRecorderRef.current = mediaRecorder;
      ws.connect();
      setIsListening(true);
    } catch (err) {
      console.error('Microphone access denied:', err);
    }
  }, [ws]);

  const stopListening = useCallback(() => {
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    ws.disconnect();
    setIsListening(false);
  }, [ws]);

  return {
    isListening,
    transcript,
    commands,
    startListening,
    stopListening,
    wsStatus: ws.status,
  };
}

// Render progress WebSocket hook
export function useRenderProgress() {
  const [jobs, setJobs] = useState<Map<string, { progress: number; status: string }>>(new Map());

  const ws = useWebSocket('/ws/render', {
    onMessage: (data) => {
      if (data.type === 'progress') {
        setJobs((prev) => {
          const next = new Map(prev);
          next.set(data.jobId, { progress: data.progress, status: data.status });
          return next;
        });
      }
    },
  });

  return { jobs, connect: ws.connect, disconnect: ws.disconnect, status: ws.status };
}
