'use client';

import { useState, useRef, useEffect, useCallback, useSyncExternalStore, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useVoiceWebSocket, useCustomWhisperVoice } from '@/lib/websocket';
import { ClientEditStack } from '@/lib/editStack';
import type { EditCommit, EditOperation } from '@/lib/editStack';
import { DEMO_STEPS, typewriterEffect, playDemoAudio, stopDemoAudio, listenForSpeech } from '@/lib/demoScript';
import type { DemoStep, DemoAIResponse } from '@/lib/demoScript';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Mic, MicOff, Wand2, Undo2, Redo2, ZoomIn, ZoomOut,
  Layers, Type, Music, Image, Scissors, Sparkles,
  ChevronRight, Send, MessageSquare, Download, Eye,
  Maximize2, Settings, SplitSquareHorizontal, Upload, CheckCircle2, Loader2,
  ArrowLeft, PlayCircle, StopCircle, Timer, Share2,
} from 'lucide-react';

type EditorTab = 'strategy' | 'timeline' | 'ai-chat' | 'history';

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const isDemoUrl = searchParams.get('demo') === '1';

  // Project / Session state
  const [project, setProject] = useState<any>(null);
  const [projectLoading, setProjectLoading] = useState(true);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<EditorTab>('strategy');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration] = useState(30000);
  const [zoom, setZoom] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Strategy generation
  const [intent, setIntent] = useState('');
  const [strategy, setStrategy] = useState<any>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);

  // Applied state — tracks what's visible on the timeline & video
  const [appliedStrategy, setAppliedStrategy] = useState<any>(null);
  const [appliedEffects, setAppliedEffects] = useState<string[]>([]);

  // Edit Stack — non-destructive operation management with conflict resolution
  const editStackRef = useRef<ClientEditStack>(null!);
  if (!editStackRef.current) editStackRef.current = new ClientEditStack();
  const editStack = editStackRef.current;

  // Subscribe to stack changes — recomputes effective ops on every commit/undo/redo/toggle
  const effectiveOps = useSyncExternalStore(
    editStack.subscribe,
    editStack.computeEffective,
    () => [] as EditOperation[],
  );
  const commits = useSyncExternalStore(
    editStack.subscribe,
    editStack.getCommits,
    () => [] as readonly EditCommit[],
  );
  const canUndo = useSyncExternalStore(
    editStack.subscribe,
    editStack.getCanUndo,
    () => false,
  );
  const canRedo = useSyncExternalStore(
    editStack.subscribe,
    editStack.getCanRedo,
    () => false,
  );

  // Preview mode — shows edited duration & plays only kept segments
  const [previewMode, setPreviewMode] = useState(false);

  // Clipboard for cut
  const [cutRange, setCutRange] = useState<{ startMs: number; endMs: number } | null>(null);

  // AI Chat
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; text: string }>>([
    { role: 'assistant', text: 'Hi! I\'m your EditOS AI editor powered by Mistral. Tell me what you want to do with your video — I\'ll edit it for you. Try: "cut the first 3 seconds" or "add captions" or "make it cinematic".' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [conversationId] = useState(() => `conv_${Date.now()}`);

  // appliedOps is now derived from the edit stack's effective operations
  const appliedOps = effectiveOps;

  // Voice
  // Voice — ASR provider selection
  const [asrProvider, setAsrProvider] = useState<'browser' | 'custom-whisper'>('browser');
  const browserVoice = useVoiceWebSocket();
  const whisperVoice = useCustomWhisperVoice();
  const voice = asrProvider === 'custom-whisper' ? whisperVoice : browserVoice;

  // Fetch ASR config on mount to determine which provider to use
  useEffect(() => {
    api.getASRConfig().then((cfg) => {
      if (cfg.customAsrEnabled && cfg.customAsrStatus === 'online') {
        setAsrProvider('custom-whisper');
      }
    }).catch(() => {});
  }, []);

  // Share / Post modal
  const [showShareModal, setShowShareModal] = useState(false);
  const [postingTo, setPostingTo] = useState<string | null>(null);
  const [postStatus, setPostStatus] = useState<Record<string, 'idle' | 'posting' | 'done' | 'error'>>({});
  const [postTitle, setPostTitle] = useState('');
  const [postDescription, setPostDescription] = useState('');
  const [connectedAccounts, setConnectedAccounts] = useState<Record<string, string>>({});
  const [publishUrls, setPublishUrls] = useState<Record<string, string>>({});
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({});

  // Demo mode state
  const [demoMode, setDemoMode] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [demoStepIndex, setDemoStepIndex] = useState(-1);
  const demoAbortRef = useRef(false);
  const demoUploadDoneRef = useRef(false);
  const runDemoRef = useRef<() => Promise<void>>();
  // Demo voice simulation (no real mic needed)
  const [demoVoiceListening, setDemoVoiceListening] = useState(false);
  const [demoTranscript, setDemoTranscript] = useState('');
  const [demoSuggestion, setDemoSuggestion] = useState('');
  const [demoVoiceHint, setDemoVoiceHint] = useState('');

  // Load connected accounts when share modal opens
  useEffect(() => {
    if (showShareModal) {
      api.getConnectedAccounts().then(res => {
        const map: Record<string, string> = {};
        for (const a of res.accounts) map[a.platform] = a.handle;
        setConnectedAccounts(map);
      }).catch(() => {});
      // Default title from project name
      if (!postTitle && project?.name) setPostTitle(project.name);
    }
  }, [showShareModal]);

  // Publish to a platform via backend
  const handlePublish = async (platform: string) => {
    if (!postTitle.trim()) return;
    setPostingTo(platform);
    setPostStatus(s => ({ ...s, [platform]: 'posting' }));
    setPublishErrors(s => { const n = { ...s }; delete n[platform]; return n; });

    try {
      const { jobId } = await api.publishVideo({
        platform,
        projectId,
        title: postTitle.trim(),
        description: postDescription.trim() || undefined,
      });

      // Poll for completion
      const poll = async () => {
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 1000));
          try {
            const job = await api.getPublishStatus(jobId);
            if (job.status === 'published') {
              setPostStatus(s => ({ ...s, [platform]: 'done' }));
              if (job.platformUrl) setPublishUrls(s => ({ ...s, [platform]: job.platformUrl! }));
              setPostingTo(null);
              return;
            }
            if (job.status === 'failed') {
              setPostStatus(s => ({ ...s, [platform]: 'error' }));
              setPublishErrors(s => ({ ...s, [platform]: job.error ?? 'Publishing failed' }));
              setPostingTo(null);
              return;
            }
          } catch {}
        }
        // Timeout
        setPostStatus(s => ({ ...s, [platform]: 'error' }));
        setPublishErrors(s => ({ ...s, [platform]: 'Publish timed out' }));
        setPostingTo(null);
      };
      poll();
    } catch (err: any) {
      setPostStatus(s => ({ ...s, [platform]: 'error' }));
      setPublishErrors(s => ({ ...s, [platform]: err.message ?? 'Failed to publish' }));
      setPostingTo(null);
    }
  };

  // Video upload
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploaded, setIsUploaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);

  // Timeline drag-to-seek
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineRulerRef = useRef<HTMLDivElement>(null);
  const [isDraggingTimeline, setIsDraggingTimeline] = useState(false);

  // -----------------------------------------------------------------------
  // Load project on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!projectId) return;
    setProjectLoading(true);
    api.getProject(projectId)
      .then((proj) => {
        setProject(proj);
        // If project already has a video, set the URL
        if (proj.video?.storedPath || proj.status === 'uploaded') {
          setVideoUrl(api.getVideoUrl(projectId));
          setIsUploaded(true);
        }
      })
      .catch(async (err) => {
        // In demo mode, if project doesn't exist yet, set up demo and retry
        if (isDemoUrl) {
          try {
            await api.demoSetup();
            const proj = await api.getProject(projectId);
            setProject(proj);
            return;
          } catch {
            // Fallback: create a synthetic project in state for demo
            setProject({ id: projectId, name: 'Demo Video', platform: 'short', status: 'created' });
            return;
          }
        }
        setProjectError(err.message);
      })
      .finally(() => setProjectLoading(false));
  }, [projectId, isDemoUrl]);

  // -----------------------------------------------------------------------
  // Session management
  // -----------------------------------------------------------------------
  const startSession = useCallback(async () => {
    if (session) return; // Already have a session
    setSessionLoading(true);
    try {
      const sess = await api.createSession(projectId);
      setSession(sess);
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Editing session started (${sess.id}). You can now use voice commands, generate strategies, and edit your video.` },
      ]);
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Failed to start session: ${err.message}` },
      ]);
    } finally {
      setSessionLoading(false);
    }
  }, [projectId, session]);

  const endSession = useCallback(async () => {
    if (!session) return;
    try {
      await api.endSession(session.id);
      // Stop voice if listening
      if (voice.isListening) voice.stopListening();
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Session ended.' },
      ]);
      setSession(null);
    } catch (err: any) {
      console.error('Failed to end session:', err);
    }
  }, [session, voice]);

  // -----------------------------------------------------------------------
  // Video upload
  // -----------------------------------------------------------------------
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];
    if (!allowed.includes(file.type)) {
      setUploadError(`Unsupported file type: ${file.type}. Use MP4, MOV, WebM, AVI, or MKV.`);
      return;
    }
    setVideoFile(file);
    setUploadError(null);
    handleUpload(file);
  };

  const handleUpload = async (file: File) => {
    setUploadProgress(0);
    setUploadError(null);
    try {
      await api.uploadVideo(projectId, file, (pct) => setUploadProgress(pct));
      setIsUploaded(true);
      setUploadProgress(null);
      setVideoUrl(api.getVideoUrl(projectId));
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Video "${file.name}" uploaded successfully (${(file.size / 1024 / 1024).toFixed(1)} MB). You can now generate an editing strategy!` },
      ]);
      // Signal the demo engine that the real upload finished
      if (demoRunning) demoUploadDoneRef.current = true;
    } catch (err: any) {
      setUploadError(err.message);
      setUploadProgress(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const allowed = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];
      if (!allowed.includes(file.type)) {
        setUploadError('Unsupported file type. Use MP4, MOV, WebM, AVI, or MKV.');
        return;
      }
      setVideoFile(file);
      setUploadError(null);
      handleUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // -----------------------------------------------------------------------
  // Video controls
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = isMuted;
  }, [isMuted]);

  // -----------------------------------------------------------------------
  // Apply AI operations to actual video element
  // -----------------------------------------------------------------------
  // Helper: find last matching op (ES2017-safe)
  const findLastOp = (predicate: (op: any) => boolean) => {
    for (let i = appliedOps.length - 1; i >= 0; i--) {
      if (predicate(appliedOps[i])) return appliedOps[i];
    }
    return undefined;
  };

  // Speed changes
  useEffect(() => {
    if (!videoRef.current) return;
    const speedOp = findLastOp((op: any) => op.type === 'speed');
    videoRef.current.playbackRate = speedOp?.params?.factor ?? 1;
  }, [appliedOps]);

  // Volume changes
  useEffect(() => {
    if (!videoRef.current) return;
    const volOp = findLastOp((op: any) => op.type === 'volume');
    if (volOp) {
      videoRef.current.volume = Math.min(1, Math.max(0, volOp.params?.level ?? 1));
    }
  }, [appliedOps]);

  // Trim start — seek past the trimmed region on load/apply
  useEffect(() => {
    if (!videoRef.current) return;
    const trimOp = findLastOp((op: any) => op.type === 'trim_start');
    if (trimOp && videoRef.current.currentTime * 1000 < (trimOp._endMs ?? trimOp.endMs ?? 0)) {
      videoRef.current.currentTime = (trimOp._endMs ?? trimOp.endMs ?? 0) / 1000;
    }
  }, [appliedOps]);

  // Cut regions — skip during playback
  useEffect(() => {
    if (!videoRef.current) return;
    const cutOps = appliedOps.filter((op: any) => op.type === 'cut');
    if (cutOps.length === 0) return;
    const video = videoRef.current;
    const handleTimeUpdate = () => {
      const t = video.currentTime * 1000;
      for (const op of cutOps) {
        const start = op._startMs ?? op.startMs ?? 0;
        const end = op._endMs ?? op.endMs ?? 0;
        if (t >= start && t < end) {
          video.currentTime = end / 1000;
          break;
        }
      }
    };
    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [appliedOps]);

  // Compute active zoom level based on current time
  const activeZoomLevel = (() => {
    const t = currentTime;
    const zoomOp = findLastOp((op: any) => {
      if (op.type !== 'zoom') return false;
      const start = op._startMs ?? op.startMs ?? 0;
      const end = op._endMs ?? op.endMs ?? effectiveDuration;
      return t >= start && t <= end;
    });
    return zoomOp?.params?.level ?? 1;
  })();

  // Compute active caption based on current time
  const activeCaption = (() => {
    const t = currentTime;
    const capOp = findLastOp((op: any) => {
      if (op.type !== 'caption') return false;
      const start = op._startMs ?? op.startMs ?? 0;
      const end = op._endMs ?? op.endMs ?? effectiveDuration;
      return t >= start && t <= end;
    });
    return capOp?.params?.text ?? null;
  })();

  // Compute active color grade
  const activeColorPreset = (() => {
    const t = currentTime;
    const cgOp = findLastOp((op: any) => {
      if (op.type !== 'color_grade') return false;
      const start = op._startMs ?? op.startMs ?? 0;
      const end = op._endMs ?? op.endMs ?? effectiveDuration;
      return t >= start && t <= end;
    });
    return cgOp?.params?.preset ?? null;
  })();

  // CSS filter for color grades
  const videoFilterStyle = (() => {
    switch (activeColorPreset) {
      case 'warm': return 'sepia(0.25) saturate(1.2) brightness(1.05)';
      case 'cool': return 'saturate(0.9) hue-rotate(15deg) brightness(1.05)';
      case 'vintage': return 'sepia(0.4) contrast(1.1) brightness(0.95)';
      case 'cinematic': return 'contrast(1.15) saturate(0.85) brightness(0.9)';
      case 'vibrant': return 'saturate(1.5) contrast(1.1) brightness(1.05)';
      default: return 'none';
    }
  })();

  // -----------------------------------------------------------------------
  // AI Chat — sends messages to Mistral via /api/v1/chat
  // -----------------------------------------------------------------------
  const sendToAI = async (text: string) => {
    if (!text.trim()) return;
    setGenerating(true);
    setChatMessages(prev => [...prev, { role: 'user', text }]);
    try {
      const result = await api.chat({
        conversationId,
        message: text,
        videoDurationMs: effectiveDuration,
        platform: project?.platform ?? 'short',
      });

      // Show AI response in chat
      setChatMessages(prev => [...prev, { role: 'assistant', text: result.message }]);

      // Handle "reset_all" operation — clears entire edit stack
      // Check operations array AND strategyName as fallback (Mistral sometimes puts it there)
      const isReset = result.operations?.some((op: any) => op.type === 'reset_all') ||
        /^reset/i.test(result.strategyName ?? '');
      if (isReset) {
        editStack.clearAll();
        setAppliedStrategy(null);
        setAppliedEffects([]);
        setChatMessages(prev => [...prev, { role: 'assistant', text: '🗑️ All edits cleared. Starting fresh!' }]);
        return;
      }

      // If the AI returned operations, push them as a commit to the edit stack
      if (result.operations && result.operations.length > 0) {
        const dur = effectiveDuration || 30000;
        const newOps = result.operations
          .filter((op: any) => op.type !== 'reset_all') // filter stray reset_all
          .map((op: any) => {
            // Normalize timestamps — make sure every op has _startMs and _endMs
            let startMs = op.startMs ?? 0;
            let endMs = op.endMs ?? dur;

            // Clamp to video bounds
            startMs = Math.max(0, Math.min(startMs, dur));
            endMs = Math.max(startMs, Math.min(endMs, dur));

            // Type-specific defaults
            if (op.type === 'trim_start') {
              startMs = 0;
              endMs = op.endMs ?? op.startMs ?? 0;
            } else if (op.type === 'trim_end') {
              startMs = op.startMs ?? dur;
              endMs = dur;
            } else if (op.type === 'fade_in') {
              startMs = 0;
              endMs = op.params?.durationMs ?? op.endMs ?? 1000;
            } else if (op.type === 'fade_out') {
              const fadeDur = op.params?.durationMs ?? 1000;
              endMs = dur;
              startMs = op.startMs ?? (dur - fadeDur);
            } else if (op.type === 'silence_remove') {
              startMs = 0;
              endMs = dur;
            } else if (op.type === 'split') {
              endMs = startMs; // split is a point, not a range
            }

            return {
              ...op,
              startMs,
              endMs,
              _startMs: startMs,
              _endMs: endMs,
            };
          });

        // Push to the edit stack — conflict resolution happens automatically
        const commit = editStack.push(
          text,
          newOps,
          result.strategyName,
        );

        // Update applied effects from effective state
        setAppliedEffects(editStack.computeEffectTypes());

        // Log in chat
        const opSummary = newOps.map((o: any) => `${o.type} (${formatTime(o._startMs)}–${formatTime(o._endMs)})`).join(', ');
        setChatMessages(prev => [...prev, { role: 'assistant', text: `✅ Applied: ${opSummary}` }]);
      }
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err.message}` }]);
    } finally {
      setGenerating(false);
    }
  };

  const handleChatSend = () => {
    if (!chatInput.trim()) return;
    sendToAI(chatInput);
    setChatInput('');
  };

  const handleIntentSubmit = () => {
    if (!intent.trim()) return;
    sendToAI(intent);
    setIntent('');
  };

  // Legacy: generate strategy via rule engine (kept for Strategy tab presets)
  const generateStrategy = async (intentText: string) => {
    if (!intentText.trim()) return;
    setGenerating(true);
    try {
      const result = await api.generateStrategy({
        projectId,
        intent: intentText,
        platform: project?.platform ?? 'short',
      });
      setStrategy(result);
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err.message}` }]);
    } finally {
      setGenerating(false);
    }
  };

  // -----------------------------------------------------------------------
  // Demo engine — deterministic auto-play through pre-scripted steps
  // -----------------------------------------------------------------------

  /** Apply a pre-scripted AI response (same logic as sendToAI but no API call) */
  const applyDemoResponse = useCallback((response: DemoAIResponse) => {
    const dur = videoDuration > 0 ? videoDuration : duration;
    // Show the AI message
    setChatMessages(prev => [...prev, { role: 'assistant', text: response.message }]);

    // Apply operations to edit stack
    if (response.operations && response.operations.length > 0) {
      const newOps = response.operations.map((op: any) => {
        let startMs = op.startMs ?? 0;
        let endMs = op.endMs ?? dur;
        startMs = Math.max(0, Math.min(startMs, dur));
        endMs = Math.max(startMs, Math.min(endMs, dur));
        if (op.type === 'fade_in') {
          startMs = 0;
          endMs = op.params?.durationMs ?? op.endMs ?? 1000;
        } else if (op.type === 'fade_out') {
          const fadeDur = op.params?.durationMs ?? 1000;
          endMs = dur;
          startMs = op.startMs ?? (dur - fadeDur);
        }
        return { ...op, startMs, endMs, _startMs: startMs, _endMs: endMs };
      });

      editStack.push(
        response.strategyName ?? 'demo edit',
        newOps,
        response.strategyName,
      );
      setAppliedEffects(editStack.computeEffectTypes());
    }
  }, [videoDuration, duration, editStack]);

  /** Run the full demo sequence */
  const runDemo = useCallback(async () => {
    demoAbortRef.current = false;
    setDemoRunning(true);
    setDemoStepIndex(-1);

    // 1. Setup backend demo state (auto-connect accounts)
    try {
      await api.demoSetup();
    } catch (err) {
      console.warn('Demo setup failed:', err);
    }

    // 2. Clear existing state for clean demo
    editStack.clearAll();
    setAppliedEffects([]);
    setAppliedStrategy(null);
    setPreviewMode(false);
    setShowShareModal(false);
    setChatMessages([
      { role: 'assistant', text: 'Hi! I\'m your EditOS AI editor powered by Mistral. Tell me what you want to do with your video — I\'ll edit it for you. Try: "cut the first 3 seconds" or "add captions" or "make it cinematic".' },
    ]);
    setChatInput('');
    setPostTitle('');
    setPostDescription('');
    setPostStatus({});
    setPublishUrls({});
    setPublishErrors({});
    setConnectedAccounts({});
    setDemoVoiceListening(false);
    setDemoTranscript('');
    setDemoVoiceHint('');

    const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

    // 3. Execute each step
    for (let i = 0; i < DEMO_STEPS.length; i++) {
      if (demoAbortRef.current) break;
      const step = DEMO_STEPS[i];
      setDemoStepIndex(i);

      // Wait the step's delay
      if (step.delay > 0) {
        await wait(step.delay);
      }
      if (demoAbortRef.current) break;

      switch (step.type) {
        case 'switch-tab':
          if (step.tab) setActiveTab(step.tab);
          break;

        case 'type-chat':
          if (step.text) {
            await typewriterEffect(
              step.text,
              (partial) => setChatInput(partial),
              step.typeSpeed ?? 45,
            );
          }
          break;

        case 'send-chat':
          if (step.response) {
            const currentInput = step.text ?? '';
            // Get the text that was typed in the previous type-chat step
            const prevStep = i > 0 ? DEMO_STEPS[i - 1] : null;
            const typedText = prevStep?.type === 'type-chat' ? prevStep.text : '';
            if (typedText) {
              setChatMessages(prev => [...prev, { role: 'user', text: typedText }]);
            }
            setChatInput('');
            // Show "thinking" briefly
            setGenerating(true);
            await wait(1200);
            if (demoAbortRef.current) { setGenerating(false); break; }
            setGenerating(false);
            // Apply the pre-scripted response
            applyDemoResponse(step.response);
          }
          break;

        case 'wait':
          await wait(step.duration ?? 2000);
          break;

        case 'simulate-upload':
          // Fake upload progress bar for demo realism
          setUploadProgress(0);
          {
            const totalMs = step.duration ?? 2500;
            const ticks = 20;
            const tickMs = totalMs / ticks;
            for (let p = 1; p <= ticks; p++) {
              if (demoAbortRef.current) break;
              await wait(tickMs);
              setUploadProgress(Math.min(Math.round((p / ticks) * 100), 100));
            }
          }
          if (demoAbortRef.current) { setUploadProgress(null); break; }
          // Mark as uploaded with a placeholder video URL
          setIsUploaded(true);
          setUploadProgress(null);
          setVideoUrl('/demo-placeholder.mp4');
          setChatMessages(prev => [...prev, {
            role: 'assistant',
            text: 'Video uploaded successfully! You can now describe what you want — I\'ll edit it for you.',
          }]);
          break;

        case 'trigger-upload':
          // Programmatically click the file input to open the native file picker
          fileInputRef.current?.click();
          // Pause demo and wait until real upload completes (isUploaded becomes true)
          await new Promise<void>((resolve) => {
            const check = () => {
              if (demoAbortRef.current) { resolve(); return; }
              // Poll a ref/flag — we set demoUploadDoneRef from the upload handler
              if (demoUploadDoneRef.current) {
                demoUploadDoneRef.current = false;
                resolve();
                return;
              }
              setTimeout(check, 300);
            };
            check();
          });
          break;

        case 'start-session':
          // Programmatically start a session
          if (!session) {
            setSessionLoading(true);
            try {
              const sess = await api.createSession(projectId);
              setSession(sess);
              setChatMessages(prev => [...prev, {
                role: 'assistant',
                text: `Editing session started (${sess.id}). You can now use voice commands, generate strategies, and edit your video.`,
              }]);
            } catch (err: any) {
              setChatMessages(prev => [...prev, {
                role: 'assistant',
                text: `Session started. You can now edit your video.`,
              }]);
            } finally {
              setSessionLoading(false);
            }
          }
          break;

        case 'suggest-chat':
          // Show suggestion bubble in chat, wait briefly, then send to real AI
          if (step.text) {
            setDemoSuggestion(step.text);
            await wait(2000); // let the user see the suggestion
            if (demoAbortRef.current) { setDemoSuggestion(''); break; }
            setDemoSuggestion('');
            // Send to real Mistral AI
            await sendToAI(step.text);
          }
          break;

        case 'send-chat-ai': {
          // Get the text from the previous type-chat step, clear input, send to real AI
          const prevStep = i > 0 ? DEMO_STEPS[i - 1] : null;
          const typedText = prevStep?.type === 'type-chat' ? prevStep.text ?? '' : '';
          setChatInput('');
          if (typedText) {
            await sendToAI(typedText);
          }
          break;
        }

        case 'start-voice':
          setDemoVoiceListening(true);
          setDemoTranscript('');
          break;

        case 'voice-command': {
          // Show hint of what to say (only if showHint), listen via mic, apply deterministic response
          const deterministic = step.text ?? '';
          if (step.showHint) setDemoVoiceHint(deterministic);
          const transcript = await listenForSpeech(
            (interim) => setDemoTranscript(interim),
            () => demoAbortRef.current,
          );
          setDemoVoiceHint('');
          setDemoTranscript('');
          if (demoAbortRef.current) { break; }
          // Show the user message in chat, then apply the hardcoded response (no API call)
          if (deterministic) {
            setChatMessages(prev => [...prev, { role: 'user', text: `🎙️ ${deterministic}` }]);
            if (step.response) {
              applyDemoResponse(step.response);
            } else {
              await sendToAI(`🎙️ ${deterministic}`);
            }
          }
          break;
        }

        case 'stop-voice':
          setDemoVoiceListening(false);
          setDemoTranscript('');
          break;

        case 'play-video':
          setIsPlaying(true);
          break;

        case 'pause-video':
          setIsPlaying(false);
          break;

        case 'toggle-preview':
          setPreviewMode(prev => !prev);
          break;

        case 'open-share':
          // First load connected accounts (demo setup already connected them)
          try {
            const res = await api.getConnectedAccounts();
            const map: Record<string, string> = {};
            for (const a of res.accounts) map[a.platform] = a.handle;
            setConnectedAccounts(map);
          } catch {}
          setShowShareModal(true);
          break;

        case 'fill-title':
          if (step.value) {
            await typewriterEffect(
              step.value,
              (partial) => setPostTitle(partial),
              step.typeSpeed ?? 35,
            );
          }
          break;

        case 'fill-description':
          if (step.value) {
            await typewriterEffect(
              step.value,
              (partial) => setPostDescription(partial),
              step.typeSpeed ?? 30,
            );
          }
          break;

        case 'publish':
          if (step.platform) {
            // Trigger publish through the real backend (simulated pipeline)
            handlePublish(step.platform);
          }
          break;

        case 'close-share':
          setShowShareModal(false);
          break;
      }
    }

    setDemoRunning(false);
    setDemoStepIndex(-1);
  }, [
    editStack, applyDemoResponse, videoDuration, duration,
  ]);

  // Always keep the ref pointing to latest runDemo
  useEffect(() => {
    runDemoRef.current = runDemo;
  }, [runDemo]);

  /** Stop the demo */
  const stopDemo = useCallback(() => {
    demoAbortRef.current = true;
    setDemoRunning(false);
    setDemoStepIndex(-1);
    setGenerating(false);
    setIsPlaying(false);
    setDemoVoiceListening(false);
    setDemoTranscript('');
    setDemoVoiceHint('');
    // Cancel any in-progress demo audio
    stopDemoAudio();
  }, []);

  // Auto-start demo if URL has ?demo=1 — wait for project to finish loading first
  const demoAutoStarted = useRef(false);
  useEffect(() => {
    if (isDemoUrl && !projectLoading && !demoAutoStarted.current && !demoRunning) {
      demoAutoStarted.current = true;
      // Small delay for the UI to settle, then fire the *latest* runDemo via ref
      const timer = setTimeout(() => {
        setDemoMode(true);
        runDemoRef.current?.();
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isDemoUrl, projectLoading]);

  // -----------------------------------------------------------------------
  // Voice command → strategy
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (voice.commands.length > 0) {
      const latest = voice.commands[voice.commands.length - 1];
      if (latest && latest.text && !latest.text.startsWith('[feedback]')) {
        // Send voice command to AI chat (same as typing)
        sendToAI(latest.text);
      }
    }
  }, [voice.commands.length]);

  // -----------------------------------------------------------------------
  // Helpers (must be before handlers that use them)
  // -----------------------------------------------------------------------
  const effectiveDuration = videoDuration > 0 ? videoDuration : duration;

  // -----------------------------------------------------------------------
  // Kept segments & edited duration — derived from effective operations
  // -----------------------------------------------------------------------
  const { keptSegments, editedDurationMs, removedSegments, sourceToEditedTime } = useMemo(() => {
    const dur = effectiveDuration;
    if (dur <= 0) return { keptSegments: [] as [number, number][], editedDurationMs: 0, removedSegments: [] as [number, number][], sourceToEditedTime: (t: number) => t };

    // Collect all removed intervals from cuts & trims
    const removed: [number, number][] = [];
    for (const op of appliedOps) {
      const start = op._startMs ?? (op as any).startMs ?? 0;
      const end = op._endMs ?? (op as any).endMs ?? dur;
      if (op.type === 'cut' || op.type === 'trim_start' || op.type === 'trim_end') {
        removed.push([Math.max(0, start), Math.min(dur, end)]);
      }
    }

    // Merge overlapping removed intervals
    removed.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [s, e] of removed) {
      if (merged.length > 0 && s <= merged[merged.length - 1][1]) {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], e);
      } else {
        merged.push([s, e]);
      }
    }

    // Inverse → kept segments
    const kept: [number, number][] = [];
    let pos = 0;
    for (const [s, e] of merged) {
      if (pos < s) kept.push([pos, s]);
      pos = e;
    }
    if (pos < dur) kept.push([pos, dur]);

    // Speed factor
    const speedOp = [...appliedOps].reverse().find(op => op.type === 'speed');
    const speedFactor = (speedOp?.params as any)?.factor ?? 1;

    // Total kept duration / speed
    const rawKeptDuration = kept.reduce((sum, [s, e]) => sum + (e - s), 0);
    const editedDur = rawKeptDuration / speedFactor;

    // Map source time → edited timeline position
    const sourceToEdited = (sourceMs: number): number => {
      let editedTime = 0;
      for (const [s, e] of kept) {
        if (sourceMs <= s) break;
        if (sourceMs >= e) {
          editedTime += (e - s);
        } else {
          editedTime += (sourceMs - s);
          break;
        }
      }
      return editedTime / speedFactor;
    };

    return { keptSegments: kept, editedDurationMs: editedDur, removedSegments: merged, sourceToEditedTime: sourceToEdited };
  }, [appliedOps, effectiveDuration]);

  const timeToPercent = (ms: number) => (ms / effectiveDuration) * 100;

  // Preview mode — pause at the end of last kept segment
  useEffect(() => {
    if (!previewMode || !videoRef.current || keptSegments.length === 0) return;
    const video = videoRef.current;
    const lastKept = keptSegments[keptSegments.length - 1];
    const endOfEdit = lastKept[1]; // end of the last kept segment in source ms
    const handlePreviewEnd = () => {
      const t = video.currentTime * 1000;
      if (t >= endOfEdit - 100) {
        video.pause();
        setIsPlaying(false);
      }
    };
    video.addEventListener('timeupdate', handlePreviewEnd);
    return () => video.removeEventListener('timeupdate', handlePreviewEnd);
  }, [previewMode, keptSegments]);

  const formatTime = useCallback((ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

  // -----------------------------------------------------------------------
  // Timeline drag-to-seek handlers
  // -----------------------------------------------------------------------
  const seekToTimelinePosition = useCallback((clientX: number) => {
    const ruler = timelineRulerRef.current;
    if (!ruler || !videoRef.current || effectiveDuration <= 0) return;
    const rect = ruler.getBoundingClientRect();
    const px = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const pct = px / rect.width;
    const seekMs = pct * effectiveDuration;
    const seekSec = seekMs / 1000;
    videoRef.current.currentTime = seekSec;
    setCurrentTime(seekMs);
  }, [effectiveDuration]);

  const handleTimelineMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDraggingTimeline(true);
    seekToTimelinePosition(e.clientX);
  }, [seekToTimelinePosition]);

  const handleTimelineMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingTimeline) return;
    seekToTimelinePosition(e.clientX);
  }, [isDraggingTimeline, seekToTimelinePosition]);

  const handleTimelineMouseUp = useCallback(() => {
    setIsDraggingTimeline(false);
  }, []);

  // -----------------------------------------------------------------------
  // Undo / Redo — powered by EditStack
  // -----------------------------------------------------------------------
  const pushHistory = useCallback((label: string, data: any) => {
    // Legacy: pushHistory is only used by the strategy tab "Apply Strategy" button.
    // For AI chat/voice, commits go through editStack.push() directly.
  }, []);

  const handleUndo = useCallback(() => {
    const undone = editStack.undo();
    if (undone) {
      setAppliedEffects(editStack.computeEffectTypes());
      setChatMessages(prev => [...prev, { role: 'assistant', text: `↩️ Undid: "${undone.prompt}"` }]);
    }
  }, [editStack]);

  const handleRedo = useCallback(() => {
    const redone = editStack.redo();
    if (redone) {
      setAppliedEffects(editStack.computeEffectTypes());
      setChatMessages(prev => [...prev, { role: 'assistant', text: `↪️ Redid: "${redone.prompt}"` }]);
    }
  }, [editStack]);

  const handleCut = useCallback(() => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime * 1000;
    const cutStart = Math.max(0, t - 1000);
    const cutEnd = Math.min(effectiveDuration, t + 1000);
    setCutRange({ startMs: cutStart, endMs: cutEnd });
    setChatMessages(prev => [...prev, { role: 'assistant', text: `Cut marker set at ${formatTime(cutStart)}–${formatTime(cutEnd)}` }]);
  }, [effectiveDuration]);

  const handleSplit = useCallback(() => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime * 1000;
    setChatMessages(prev => [...prev, { role: 'assistant', text: `Split point added at ${formatTime(t)}` }]);
  }, []);

  // Build timeline-friendly operations from strategy
  const timelineOps = useCallback((strat: any) => {
    const ops = strat?.strategy?.operations ?? [];
    const dur = effectiveDuration;
    return ops.map((op: any, i: number) => {
      // Since operations don't have timeRange, compute placement based on type
      const count = ops.length;
      const sliceMs = dur / Math.max(count, 1);
      let startMs = 0;
      let endMs = dur;
      // Distribute operations across the timeline for visualization
      if (op.type === 'trim_silence') {
        // Spread across full duration — silence trimming is global
        startMs = 0; endMs = dur;
      } else if (op.type === 'caption') {
        startMs = 0; endMs = dur; // captions span full video
      } else if (op.type === 'zoom') {
        // Show zoom as segments in first half
        startMs = dur * 0.1; endMs = dur * 0.6;
      } else if (op.type === 'speed_ramp') {
        startMs = dur * 0.2; endMs = dur * 0.8;
      } else if (op.type === 'sfx_trigger') {
        startMs = dur * 0.05; endMs = dur * 0.95;
      } else if (op.type === 'music_layer') {
        startMs = 0; endMs = dur;
      } else if (op.type === 'color_grade') {
        startMs = 0; endMs = dur;
      } else if (op.type === 'aspect_ratio') {
        startMs = 0; endMs = dur;
      } else if (op.type === 'loudness') {
        startMs = 0; endMs = dur;
      } else {
        startMs = i * sliceMs;
        endMs = startMs + sliceMs;
      }
      return { ...op, _startMs: startMs, _endMs: endMs };
    });
  }, [effectiveDuration]);

  // -----------------------------------------------------------------------
  // Loading / Error states
  // -----------------------------------------------------------------------
  if (projectLoading) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-brand-400 animate-spin mx-auto mb-3" />
          <p className="text-sm text-white/50">Loading project...</p>
        </div>
      </div>
    );
  }

  if (projectError) {
    return (
      <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
        <div className="text-center max-w-md">
          <p className="text-red-400 font-medium mb-2">Failed to load project</p>
          <p className="text-sm text-white/40 mb-4">{projectError}</p>
          <button onClick={() => router.push('/projects')} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" /> Back to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col -m-4 md:-m-6 animate-fade-in">
      {/* Toolbar */}
      <div className="h-12 bg-surface-1 border-b border-surface-4/50 flex items-center justify-between px-3 md:px-4 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-1">
          <button onClick={() => router.push('/projects')} className="btn-ghost p-2" title="Back">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-surface-4 mx-1" />
          <span className="text-xs text-white/50 font-medium truncate max-w-[120px] md:max-w-[200px]">{project?.name ?? 'Untitled'}</span>
          <div className="w-px h-5 bg-surface-4 mx-1 hidden sm:block" />
          <button onClick={handleUndo} disabled={!canUndo} className="btn-ghost p-2 disabled:opacity-30" title="Undo"><Undo2 className="w-4 h-4" /></button>
          <button onClick={handleRedo} disabled={!canRedo} className="btn-ghost p-2 disabled:opacity-30" title="Redo"><Redo2 className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-surface-4 mx-1 hidden sm:block" />
          <button onClick={handleCut} className="btn-ghost p-2 hidden sm:inline-flex" title="Cut at playhead"><Scissors className="w-4 h-4" /></button>
          <button onClick={handleSplit} className="btn-ghost p-2 hidden sm:inline-flex" title="Split at playhead"><SplitSquareHorizontal className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-surface-4 mx-1 hidden sm:block" />
          <button className="btn-ghost p-2 hidden md:inline-flex" title="Zoom In" onClick={() => setZoom(z => Math.min(z * 1.5, 5))}><ZoomIn className="w-4 h-4" /></button>
          <button className="btn-ghost p-2 hidden md:inline-flex" title="Zoom Out" onClick={() => setZoom(z => Math.max(z / 1.5, 0.2))}><ZoomOut className="w-4 h-4" /></button>
          <span className="text-xs text-white/30 ml-1 hidden md:inline">{(zoom * 100).toFixed(0)}%</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Session control */}
          {!session ? (
            <button
              onClick={startSession}
              disabled={sessionLoading}
              className="btn-primary text-xs py-1.5 px-3"
            >
              {sessionLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <PlayCircle className="w-3.5 h-3.5" />
              )}
              {sessionLoading ? 'Starting...' : 'Start Session'}
            </button>
          ) : (
            <>
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
              {/* ASR provider badge */}
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono ${
                asrProvider === 'custom-whisper'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                  : 'bg-surface-3 text-white/30'
              }`}>
                {asrProvider === 'custom-whisper' ? 'Whisper' : 'Browser'}
              </span>
              <button
                onClick={() => {
                  if (demoVoiceListening) return;
                  voice.isListening ? voice.stopListening() : voice.startListening();
                }}
                className={`btn-ghost p-2 ${(voice.isListening || demoVoiceListening) ? 'text-red-400 bg-red-500/10' : ''}`}
                title={(voice.isListening || demoVoiceListening) ? 'Stop Voice' : 'Start Voice'}
              >
                {(voice.isListening || demoVoiceListening) ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                onClick={endSession}
                className="btn-ghost p-2 text-white/40 hover:text-red-400"
                title="End Session"
              >
                <StopCircle className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Small red dot — starts/stops demo */}
          <button
            onClick={() => demoRunning ? stopDemo() : (() => { setDemoMode(true); runDemo(); })()}
            className={`w-3 h-3 rounded-full shrink-0 transition-all ${
              demoRunning ? 'bg-red-500 shadow-lg shadow-red-500/40 scale-110' : 'bg-red-500/70 hover:bg-red-500 hover:scale-110'
            }`}
            title=""
          />

          <button
            onClick={() => setShowShareModal(true)}
            className="btn-primary text-xs py-1.5 px-3 hidden sm:inline-flex"
          >
            <Share2 className="w-3.5 h-3.5" />
            Post
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Preview Panel */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Video Preview */}
          <div className="flex-1 bg-black flex items-center justify-center relative min-h-[400px]">
            {videoUrl ? (
              /* Uploaded video player */
              <div className="aspect-[9/16] max-h-full max-w-full bg-surface-2 rounded-lg relative overflow-hidden" style={{ height: '100%' }}>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain transition-transform duration-300"
                  style={{
                    transform: activeZoomLevel !== 1 ? `scale(${activeZoomLevel})` : undefined,
                    filter: videoFilterStyle !== 'none' ? videoFilterStyle : undefined,
                  }}
                  onTimeUpdate={(e) => setCurrentTime((e.currentTarget.currentTime) * 1000)}
                  onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration * 1000)}
                  onEnded={() => setIsPlaying(false)}
                  playsInline
                />
                {/* Time-aware caption overlay */}
                {activeCaption && (
                  <div className="absolute bottom-8 left-4 right-4 text-center z-10 pointer-events-none">
                    <p className="text-sm font-bold text-white drop-shadow-lg bg-black/50 rounded px-3 py-1.5 inline-block">
                      {activeCaption}
                    </p>
                  </div>
                )}
                {/* Compact status bar — single row, no overlap */}
                {appliedOps.length > 0 && (
                  <div className="absolute top-2 left-2 right-2 z-10">
                    <div className="flex flex-wrap items-center gap-1 max-w-full">
                      {[...new Set(appliedOps.map(op => op.type))].map(t => {
                        const op = [...appliedOps].reverse().find((o: any) => o.type === t);
                        let label = t.replace('_', ' ');
                        if (t === 'speed') label = `${op?.params?.factor ?? 1}× speed`;
                        if (t === 'cut') label = `cut ${formatTime(op?._startMs ?? 0)}–${formatTime(op?._endMs ?? 0)}`;
                        if (t === 'trim_start') label = `trim ${formatTime(op?._endMs ?? 0)}`;
                        if (t === 'zoom') label = `${op?.params?.level ?? 1}× zoom`;
                        if (t === 'volume') label = `vol ${Math.round((op?.params?.level ?? 1) * 100)}%`;
                        if (t === 'color_grade') label = `${op?.params?.preset ?? 'grade'}`;
                        if (t === 'caption') label = 'captions';
                        const colors: Record<string, string> = {
                          cut: 'bg-red-500/80', trim_start: 'bg-red-500/80', trim_end: 'bg-red-500/80',
                          speed: 'bg-purple-500/80', zoom: 'bg-blue-500/80',
                          volume: 'bg-emerald-500/80', color_grade: 'bg-amber-500/80',
                          caption: 'bg-amber-500/80', music: 'bg-pink-500/80',
                          fade_in: 'bg-indigo-500/80', fade_out: 'bg-indigo-500/80',
                          silence_remove: 'bg-teal-500/80',
                        };
                        return (
                          <span
                            key={t}
                            className={`text-[9px] px-1.5 py-0.5 rounded ${colors[t] ?? 'bg-brand-500/80'} text-white font-medium pointer-events-auto cursor-pointer hover:opacity-70`}
                            title={`Click to remove ${t}`}
                            onClick={() => {
                              // Remove all commits that contain this op type
                              const toRemove = commits.filter(c =>
                                c.enabled && c.operations.some(op => op.type === t)
                              );
                              for (const c of toRemove) editStack.remove(c.id);
                              setAppliedEffects(editStack.computeEffectTypes());
                            }}
                          >
                            {label} ×
                          </span>
                        );
                      })}
                      <button
                        className="text-[9px] px-1.5 py-0.5 rounded bg-white/20 text-white/80 font-medium pointer-events-auto cursor-pointer hover:bg-white/30 transition-colors"
                        title="Clear all edits"
                        onClick={() => { editStack.clearAll(); setAppliedEffects([]); setPreviewMode(false); }}
                      >
                        Clear All
                      </button>
                    </div>
                  </div>
                )}
                {/* Edited duration badge */}
                {appliedOps.length > 0 && editedDurationMs < effectiveDuration && (
                  <div className="absolute bottom-16 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
                    <div className="glass rounded-full px-4 py-1.5 flex items-center gap-2">
                      <Timer className="w-3.5 h-3.5 text-brand-400" />
                      <span className="text-xs font-medium text-white/80">
                        Edited: <span className="text-brand-400 font-bold">{formatTime(editedDurationMs)}</span>
                      </span>
                      <span className="text-[10px] text-white/30">
                        / {formatTime(effectiveDuration)} original
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Upload area */
              <div
                className="aspect-[9/16] max-h-full max-w-full bg-surface-2 rounded-lg flex items-center justify-center relative overflow-hidden cursor-pointer group"
                style={{ height: '100%' }}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="absolute inset-0 bg-gradient-to-b from-surface-3/20 to-surface-3/40 group-hover:from-brand-500/5 group-hover:to-brand-500/10 transition-colors" />
                
                {uploadProgress !== null ? (
                  /* Upload progress */
                  <div className="text-center z-10 px-6">
                    <Loader2 className="w-10 h-10 text-brand-400 mx-auto mb-3 animate-spin" />
                    <p className="text-sm text-white/70 font-medium mb-2">Uploading video...</p>
                    <div className="w-48 h-1.5 bg-surface-4 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-400 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-xs text-white/40 mt-2">{uploadProgress}%</p>
                  </div>
                ) : (
                  /* Upload prompt */
                  <div className="text-center z-10 px-6">
                    <div className="w-16 h-16 rounded-2xl bg-surface-3 flex items-center justify-center mx-auto mb-4 group-hover:bg-brand-500/20 transition-colors">
                      <Upload className="w-8 h-8 text-white/20 group-hover:text-brand-400 transition-colors" />
                    </div>
                    <p className="text-sm text-white/50 font-medium group-hover:text-white/70 transition-colors">
                      Click or drag to upload
                    </p>
                    <p className="text-[10px] text-white/30 mt-1">
                      MP4, MOV, WebM, AVI, MKV &bull; up to 500 MB
                    </p>
                    {uploadError && (
                      <p className="text-xs text-red-400 mt-3 bg-red-500/10 rounded px-3 py-1.5">
                        {uploadError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Preview controls overlay */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 glass rounded-full px-4 py-2">
              <button className="text-white/60 hover:text-white transition-colors" onClick={() => {
                const startMs = previewMode && keptSegments.length > 0 ? keptSegments[0][0] : 0;
                setCurrentTime(startMs);
                if (videoRef.current) videoRef.current.currentTime = startMs / 1000;
              }}>
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                className="w-8 h-8 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? <Pause className="w-4 h-4 text-black" /> : <Play className="w-4 h-4 text-black ml-0.5" />}
              </button>
              <button className="text-white/60 hover:text-white transition-colors" onClick={() => { if (videoRef.current) { videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 5, videoRef.current.duration); } }}>
                <SkipForward className="w-4 h-4" />
              </button>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <span className="text-xs text-white/60 font-mono">
                {previewMode ? formatTime(sourceToEditedTime(currentTime)) : formatTime(currentTime)}
              </span>
              <span className="text-xs text-white/20">/</span>
              <span className="text-xs text-white/40 font-mono">
                {previewMode ? formatTime(editedDurationMs) : formatTime(effectiveDuration)}
              </span>
              {/* Preview mode toggle */}
              {appliedOps.length > 0 && editedDurationMs < effectiveDuration && (
                <>
                  <div className="w-px h-5 bg-white/10 mx-1" />
                  <button
                    className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium transition-all ${
                      previewMode
                        ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/30'
                        : 'bg-white/10 text-white/50 hover:text-white/80 hover:bg-white/20'
                    }`}
                    onClick={() => setPreviewMode(!previewMode)}
                    title={previewMode ? 'Exit preview — show source timeline' : 'Preview edited result'}
                  >
                    <Eye className="w-3 h-3" />
                    {previewMode ? formatTime(editedDurationMs) : 'Preview'}
                  </button>
                </>
              )}
              <div className="w-px h-5 bg-white/10 mx-1" />
              <button className="text-white/60 hover:text-white transition-colors" onClick={() => setIsMuted(!isMuted)}>
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            {/* Scrub bar — thin draggable progress bar */}
            <div
              className="h-2 bg-surface-3/50 cursor-pointer relative group hover:h-3 transition-all"
              onMouseDown={(e) => {
                const bar = e.currentTarget;
                const rect = bar.getBoundingClientRect();
                const pct = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
                const seekMs = pct * effectiveDuration;
                if (videoRef.current) videoRef.current.currentTime = seekMs / 1000;
                setCurrentTime(seekMs);
                setIsDraggingTimeline(true);
                const handleMove = (ev: MouseEvent) => {
                  const r = bar.getBoundingClientRect();
                  const p = Math.max(0, Math.min((ev.clientX - r.left) / r.width, 1));
                  const ms = p * effectiveDuration;
                  if (videoRef.current) videoRef.current.currentTime = ms / 1000;
                  setCurrentTime(ms);
                };
                const handleUp = () => {
                  setIsDraggingTimeline(false);
                  window.removeEventListener('mousemove', handleMove);
                  window.removeEventListener('mouseup', handleUp);
                };
                window.addEventListener('mousemove', handleMove);
                window.addEventListener('mouseup', handleUp);
              }}
            >
              {/* Progress fill */}
              <div
                className="absolute top-0 left-0 bottom-0 bg-brand-400/80 rounded-r transition-none"
                style={{ width: `${effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0}%` }}
              />
              {/* Scrub handle */}
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-brand-400 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ left: `calc(${effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0}% - 6px)` }}
              />
              {/* Cut region indicators on scrub bar */}
              {removedSegments.map(([rs, re], ri) => (
                <div
                  key={ri}
                  className="absolute top-0 bottom-0 bg-red-500/40 pointer-events-none"
                  style={{
                    left: `${(rs / effectiveDuration) * 100}%`,
                    width: `${((re - rs) / effectiveDuration) * 100}%`,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Timeline */}
          <div className="h-32 md:h-48 bg-surface-1 border-t border-surface-4/50 flex flex-col shrink-0" ref={timelineRef}>
            {/* Timeline header */}
            <div className="h-8 border-b border-surface-4/30 flex items-center px-4 justify-between shrink-0">
              <div className="flex items-center gap-4">
                <span className="text-xs font-medium text-white/50">Timeline</span>
                <div className="flex items-center gap-1">
                  {['Video', 'Audio', 'Captions', 'Music', 'Effects'].map((track) => (
                    <span key={track} className="text-[10px] px-2 py-0.5 rounded bg-surface-3 text-white/40">
                      {track}
                    </span>
                  ))}
                </div>
              </div>
              <span className="text-[10px] text-white/30 font-mono">
                {previewMode ? formatTime(sourceToEditedTime(currentTime)) : formatTime(currentTime)} / {previewMode ? formatTime(editedDurationMs) : formatTime(effectiveDuration)}
                {previewMode && <span className="ml-1 text-brand-400">(preview)</span>}
              </span>
            </div>

            {/* Timeline ruler — click/drag to seek */}
            <div
              className="h-5 border-b border-surface-4/20 flex items-end px-4 shrink-0 relative overflow-hidden cursor-pointer select-none"
              onMouseDown={handleTimelineMouseDown}
              onMouseMove={handleTimelineMouseMove}
              onMouseUp={handleTimelineMouseUp}
              onMouseLeave={handleTimelineMouseUp}
              ref={timelineRulerRef}
            >
              {Array.from({ length: Math.ceil(effectiveDuration / 5000) }, (_, i) => (
                <div key={i} className="absolute bottom-0 pointer-events-none" style={{ left: `${(i * 5000 / effectiveDuration) * 100}%` }}>
                  <div className="h-2 w-px bg-white/10" />
                  <span className="text-[8px] text-white/20 ml-0.5">{formatTime(i * 5000)}</span>
                </div>
              ))}
              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-px bg-brand-400 z-10 pointer-events-none"
                style={{ left: `${timeToPercent(currentTime)}%` }}
              >
                <div className="w-2.5 h-2.5 bg-brand-400 rounded-full -ml-[5px] -mt-0.5" />
              </div>
            </div>

            {/* Track lanes — click to seek */}
            <div
              className="flex-1 overflow-y-auto px-4 py-1 space-y-1 cursor-pointer select-none"
              onMouseDown={(e) => {
                // Use ruler ref for bounds calculation (same horizontal space)
                const ruler = timelineRulerRef.current;
                if (!ruler || !videoRef.current || effectiveDuration <= 0) return;
                const rect = ruler.getBoundingClientRect();
                const px = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
                const pct = px / rect.width;
                const seekMs = pct * effectiveDuration;
                videoRef.current.currentTime = seekMs / 1000;
                setCurrentTime(seekMs);
                setIsDraggingTimeline(true);
              }}
              onMouseMove={(e) => { if (isDraggingTimeline) seekToTimelinePosition(e.clientX); }}
              onMouseUp={handleTimelineMouseUp}
              onMouseLeave={handleTimelineMouseUp}
            >
              {[
                { name: 'Video', icon: Film, color: 'bg-blue-500/20 border-blue-500/30', activeColor: 'bg-blue-500/50 border-blue-500/60', types: ['trim_silence', 'speed_ramp', 'zoom', 'aspect_ratio', 'reorder'] },
                { name: 'Audio', icon: Volume2, color: 'bg-emerald-500/20 border-emerald-500/30', activeColor: 'bg-emerald-500/50 border-emerald-500/60', types: ['loudness', 'sfx_trigger'] },
                { name: 'Captions', icon: Type, color: 'bg-amber-500/20 border-amber-500/30', activeColor: 'bg-amber-500/50 border-amber-500/60', types: ['caption'] },
                { name: 'Music', icon: Music, color: 'bg-pink-500/20 border-pink-500/30', activeColor: 'bg-pink-500/50 border-pink-500/60', types: ['music_layer'] },
                { name: 'Effects', icon: Sparkles, color: 'bg-brand-500/20 border-brand-500/30', activeColor: 'bg-brand-500/50 border-brand-500/60', types: ['color_grade'] },
              ].map((track) => {
                // Merge AI chat ops + legacy strategy ops
                const legacyStrat = appliedStrategy ?? strategy;
                const stratOps = legacyStrat ? timelineOps(legacyStrat).filter((op: any) => track.types.includes(op.type)) : [];
                const chatOps = appliedOps.filter((op: any) => {
                  if (track.name === 'Video') return ['cut', 'trim_start', 'trim_end', 'zoom', 'speed', 'split', 'fade_in', 'fade_out', 'trim_silence', 'speed_ramp', 'aspect_ratio'].includes(op.type);
                  if (track.name === 'Audio') return ['volume', 'silence_remove', 'loudness', 'sfx_trigger'].includes(op.type);
                  if (track.name === 'Captions') return ['caption'].includes(op.type);
                  if (track.name === 'Music') return ['music', 'music_layer'].includes(op.type);
                  if (track.name === 'Effects') return ['color_grade', 'fade_in', 'fade_out'].includes(op.type);
                  return false;
                });
                const ops = [...stratOps, ...chatOps];
                const isApplied = ops.length > 0;
                return (
                  <div key={track.name} className="flex items-center gap-2 h-7">
                    <div className="w-20 flex items-center gap-1.5 shrink-0">
                      <track.icon className={`w-3 h-3 ${isApplied ? 'text-white/70' : 'text-white/30'}`} />
                      <span className={`text-[10px] ${isApplied ? 'text-white/70 font-medium' : 'text-white/40'}`}>{track.name}</span>
                    </div>
                    <div className={`flex-1 h-full rounded border ${isApplied ? track.activeColor : track.color} relative`}>
                      {/* Manual cut selection marker */}
                      {track.name === 'Video' && cutRange && (
                        <div
                          className="absolute top-0 bottom-0 bg-red-500/30 border-x border-red-500/50"
                          style={{
                            left: `${(cutRange.startMs / effectiveDuration) * 100}%`,
                            width: `${((cutRange.endMs - cutRange.startMs) / effectiveDuration) * 100}%`,
                          }}
                          title={`Cut: ${formatTime(cutRange.startMs)}–${formatTime(cutRange.endMs)}`}
                        />
                      )}
                      {/* Removed regions from all cuts/trims — red hatched overlay */}
                      {track.name === 'Video' && removedSegments.map(([rs, re], ri) => (
                        <div
                          key={`removed-${ri}`}
                          className="absolute top-0 bottom-0 bg-red-500/25 border-x border-red-500/40 z-[1]"
                          style={{
                            left: `${(rs / effectiveDuration) * 100}%`,
                            width: `${((re - rs) / effectiveDuration) * 100}%`,
                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(239,68,68,0.15) 3px, rgba(239,68,68,0.15) 6px)',
                          }}
                          title={`Removed: ${formatTime(rs)}–${formatTime(re)}`}
                        >
                          <span className="text-[6px] text-red-400/80 font-bold absolute inset-0 flex items-center justify-center overflow-hidden">CUT</span>
                        </div>
                      ))}
                      {/* Strategy operation blocks */}
                      {ops.map((op: any, i: number) => (
                        <div
                          key={i}
                          className={`absolute top-0.5 bottom-0.5 rounded-sm ${isApplied ? track.activeColor : track.color} ${isApplied ? 'opacity-90' : 'opacity-40'} transition-all duration-500`}
                          style={{
                            left: `${(op._startMs / effectiveDuration) * 100}%`,
                            width: `${Math.max(((op._endMs - op._startMs) / effectiveDuration) * 100, 3)}%`,
                          }}
                          title={`${op.type}: ${formatTime(op._startMs)}–${formatTime(op._endMs)}`}
                        >
                          {isApplied && (
                            <span className="text-[7px] text-white/80 font-medium truncate px-0.5 leading-none absolute inset-0 flex items-center">
                              {op.type.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-full lg:w-96 bg-surface-1 border-t lg:border-t-0 lg:border-l border-surface-4/50 flex flex-col shrink-0 max-h-[50vh] lg:max-h-none">
          {/* Panel Tabs */}
          <div className="flex border-b border-surface-4/50 shrink-0">
            {([
              { key: 'strategy' as const, label: 'Strategy', icon: Wand2 },
              { key: 'ai-chat' as const, label: 'AI Chat', icon: MessageSquare },
              { key: 'history' as const, label: 'History', icon: Layers },
            ]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium border-b-2 transition-all ${
                  activeTab === tab.key
                    ? 'border-brand-500 text-brand-300'
                    : 'border-transparent text-white/40 hover:text-white/60'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel Content */}
          <div className={`flex-1 ${activeTab === 'ai-chat' ? 'overflow-hidden' : 'overflow-y-auto'}`}>
            {activeTab === 'strategy' && (
              <div className="p-4 space-y-4">
                {!session && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/80 flex items-start gap-2">
                    <PlayCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Start a session first</p>
                      <p className="text-amber-200/50 mt-0.5">Click &quot;Start Session&quot; in the toolbar to enable strategy generation and voice commands.</p>
                      <button onClick={startSession} disabled={sessionLoading} className="btn-primary text-[10px] py-1 px-2.5 mt-2">
                        {sessionLoading ? 'Starting...' : 'Start Session'}
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Creative Intent</label>
                  <textarea
                    className="input min-h-[80px] resize-none"
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    placeholder='e.g. "Fast-paced short with punchy cuts, bold captions, and energy ramping up"'
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleIntentSubmit(); } }}
                  />
                  <button
                    onClick={handleIntentSubmit}
                    disabled={generating || !intent.trim()}
                    className="btn-primary w-full mt-3 disabled:opacity-50"
                  >
                    {generating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4" />
                        Generate Strategy
                      </>
                    )}
                  </button>
                </div>

                {/* Quick presets */}
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2">Quick Presets</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Fast cuts, bold text',
                      'Cinematic, slow-mo',
                      'Tutorial style, clean',
                      'Energetic, music-driven',
                      'Storytelling, emotional',
                      'Meme edit, chaotic',
                    ].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setIntent(preset)}
                        className="text-[10px] px-2.5 py-1 rounded-full bg-surface-3 border border-surface-4 text-white/50 hover:text-white/70 hover:border-brand-500/30 transition-all"
                      >
                        {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Strategy Output */}
                {strategy && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-white/70">Generated Strategy</h3>
                      <span className="badge-green text-[10px]">
                        {((strategy.strategy?.metadata?.confidenceScore ?? 0) * 100).toFixed(0)}% confidence
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="p-3 rounded-lg bg-surface-2 border border-surface-4/50">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-medium text-white/50">Operations</span>
                          <span className="text-[10px] text-brand-300">{strategy.strategy?.operations?.length ?? 0}</span>
                        </div>
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {strategy.strategy?.operations?.map((op: any, i: number) => (
                            <div key={i} className="flex items-center justify-between py-1 px-2 rounded bg-surface-3/50 text-[10px]">
                              <span className="text-white/60 font-mono">{op.type}</span>
                              <span className="text-white/30">
                                {op.timeRange ? `${formatTime(op.timeRange.startMs)}–${formatTime(op.timeRange.endMs)}` : '—'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2.5 rounded-lg bg-surface-2 border border-surface-4/50">
                          <span className="text-[10px] text-white/40 block">Platform</span>
                          <span className="text-xs font-medium">{strategy.strategy?.targetPlatform ?? 'short'}</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-surface-2 border border-surface-4/50">
                          <span className="text-[10px] text-white/40 block">Model</span>
                          <span className="text-xs font-medium font-mono">{strategy.strategy?.metadata?.agentModel ?? '—'}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            if (!strategy?.id || applying) return;
                            setApplying(true);
                            try {
                              const res = await api.applyStrategy(strategy.id);
                              // Push strategy operations into the edit stack
                              setAppliedStrategy(strategy);
                              const ops = (strategy.strategy?.operations ?? []).map((op: any) => ({
                                type: op.type,
                                startMs: op.timeRange?.startMs ?? 0,
                                endMs: op.timeRange?.endMs ?? effectiveDuration,
                                _startMs: op.timeRange?.startMs ?? 0,
                                _endMs: op.timeRange?.endMs ?? effectiveDuration,
                                params: op.params ?? {},
                                description: op.type,
                              }));
                              if (ops.length > 0) {
                                editStack.push('Apply strategy', ops, 'Strategy');
                              }
                              setAppliedEffects(editStack.computeEffectTypes());
                              setChatMessages((prev) => [...prev, { role: 'assistant', text: `✅ Strategy applied! ${res.operationCount ?? 0} operations executed. Timeline and video updated with: ${ops.map((o: any) => o.type).join(', ')}` }]);
                            } catch (err: any) {
                              setChatMessages((prev) => [...prev, { role: 'assistant', text: `Apply failed: ${err.message}` }]);
                            } finally {
                              setApplying(false);
                            }
                          }}
                          disabled={applying}
                          className="btn-primary flex-1 text-xs py-2 disabled:opacity-50"
                        >
                          {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                          {applying ? 'Applying...' : 'Apply Strategy'}
                        </button>
                        <button
                          onClick={async () => {
                            if (!strategy?.id || applying) return;
                            setApplying(true);
                            try {
                              const res = await api.previewStrategy(strategy.id);
                              setChatMessages((prev) => [...prev, { role: 'assistant', text: `Preview ready: ${res.timeline?.trackCount ?? 0} tracks, ${res.timeline?.operationCount ?? 0} operations.` }]);
                            } catch (err: any) {
                              setChatMessages((prev) => [...prev, { role: 'assistant', text: `Preview failed: ${err.message}` }]);
                            } finally {
                              setApplying(false);
                            }
                          }}
                          disabled={applying}
                          className="btn-secondary flex-1 text-xs py-2 disabled:opacity-50"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Preview
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'ai-chat' && (
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-brand-500/20 text-brand-100 border border-brand-500/20'
                          : 'bg-surface-3 text-white/70 border border-surface-4/50'
                      }`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {/* Demo suggestion bubble */}
                  {demoSuggestion && !generating && (
                    <div className="flex justify-end animate-fade-in">
                      <button
                        onClick={() => {
                          const text = demoSuggestion;
                          setDemoSuggestion('');
                          sendToAI(text);
                        }}
                        className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed bg-brand-500/10 text-brand-200 border border-brand-500/30 border-dashed hover:bg-brand-500/20 transition-all cursor-pointer flex items-center gap-2"
                      >
                        <Sparkles className="w-3 h-3 text-brand-400 shrink-0" />
                        {demoSuggestion}
                      </button>
                    </div>
                  )}
                  {generating && (
                    <div className="flex justify-start">
                      <div className="bg-surface-3 border border-surface-4/50 rounded-xl px-4 py-3 flex items-center gap-2">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-xs text-white/40">Thinking...</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="p-3 border-t border-surface-4/50 space-y-2">
                  {/* Inline voice waveform + transcript (visible when voice is active) */}
                  {(() => {
                    const isVoiceActive = voice.isListening || demoVoiceListening;
                    const activeTranscript = voice.transcript || demoTranscript;
                    if (!isVoiceActive) return null;
                    return (
                      <div className="rounded-lg bg-surface-2 border border-red-500/30 p-2.5 space-y-2 animate-fade-in">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          <span className="text-[10px] font-medium text-red-300">Listening…</span>
                          {demoVoiceHint && (
                            <span className="text-[10px] text-brand-300/70 italic truncate">Say: &ldquo;{demoVoiceHint}&rdquo;</span>
                          )}
                          {/* Mini waveform */}
                          <div className="flex items-center gap-px h-4 ml-auto">
                            {Array.from({ length: 16 }, (_, i) => (
                              <div
                                key={i}
                                className="w-0.5 bg-brand-400 rounded-full animate-waveform"
                                style={{
                                  animationDelay: `${i * 0.06}s`,
                                  height: `${Math.random() * 100}%`,
                                }}
                              />
                            ))}
                          </div>
                        </div>
                        {activeTranscript && (
                          <p className="text-xs text-white/80 leading-relaxed">{activeTranscript}</p>
                        )}
                      </div>
                    );
                  })()}
                  <div className="flex gap-2">
                    <input
                      className="input text-xs py-2"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                      placeholder={(voice.isListening || demoVoiceListening) ? 'Listening… speak your command' : "Tell me what to edit... e.g. 'cut the first 3 seconds'"}
                      disabled={voice.isListening || demoVoiceListening}
                    />
                    {/* Mic toggle button */}
                    <button
                      onClick={() => {
                        if (demoVoiceListening) return;
                        if (!session) return;
                        voice.isListening ? voice.stopListening() : voice.startListening();
                      }}
                      disabled={!session}
                      className={`px-2.5 py-2 rounded-lg border transition-all disabled:opacity-30 ${
                        (voice.isListening || demoVoiceListening)
                          ? 'bg-red-500/15 border-red-500/40 text-red-400'
                          : 'bg-surface-3 border-surface-4 text-white/50 hover:text-brand-400 hover:border-brand-500/40'
                      }`}
                      title={(voice.isListening || demoVoiceListening) ? 'Stop listening' : 'Voice command'}
                    >
                      {(voice.isListening || demoVoiceListening) ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                    </button>
                    <button onClick={handleChatSend} disabled={generating || voice.isListening || demoVoiceListening} className="btn-primary px-3 py-2 disabled:opacity-50">
                      {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-semibold text-white/70">Edit History</h3>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleUndo}
                      disabled={!canUndo}
                      className="text-[10px] px-2 py-1 rounded bg-surface-3 border border-surface-4 text-white/50 hover:text-white/70 disabled:opacity-30 transition-all"
                      title="Undo last edit"
                    >
                      <Undo2 className="w-3 h-3 inline mr-1" />Undo
                    </button>
                    <button
                      onClick={handleRedo}
                      disabled={!canRedo}
                      className="text-[10px] px-2 py-1 rounded bg-surface-3 border border-surface-4 text-white/50 hover:text-white/70 disabled:opacity-30 transition-all"
                      title="Redo"
                    >
                      <Redo2 className="w-3 h-3 inline mr-1" />Redo
                    </button>
                  </div>
                </div>

                {commits.length === 0 ? (
                  <div className="text-center py-12">
                    <Layers className="w-8 h-8 text-white/10 mx-auto mb-3" />
                    <p className="text-sm text-white/40">No edits yet</p>
                    <p className="text-xs text-white/25 mt-1">Use AI Chat or Voice to start editing</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                      {[...commits].reverse().map((commit, idx) => {
                        const opTypes = [...new Set(commit.operations.map(o => o.type))];
                        const colors: Record<string, string> = {
                          cut: 'border-red-500/40', trim_start: 'border-red-500/40', trim_end: 'border-red-500/40',
                          speed: 'border-purple-500/40', zoom: 'border-blue-500/40',
                          volume: 'border-emerald-500/40', color_grade: 'border-amber-500/40',
                          caption: 'border-amber-500/40', music: 'border-pink-500/40',
                          fade_in: 'border-indigo-500/40', fade_out: 'border-indigo-500/40',
                          silence_remove: 'border-teal-500/40',
                        };
                        const borderColor = colors[opTypes[0]] ?? 'border-brand-500/40';

                        return (
                          <div
                            key={commit.id}
                            className={`p-3 rounded-lg bg-surface-2 border-l-2 ${borderColor} ${
                              commit.enabled ? 'opacity-100' : 'opacity-40'
                            } transition-all`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-white/80 font-medium truncate" title={commit.prompt}>
                                  &ldquo;{commit.prompt}&rdquo;
                                </p>
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {commit.operations.map((op, i) => (
                                    <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-surface-3 text-white/50 font-mono">
                                      {op.type}{op.params && Object.keys(op.params).length > 0
                                        ? `: ${Object.entries(op.params).map(([k, v]) => `${k}=${v}`).join(', ')}`
                                        : ''}
                                    </span>
                                  ))}
                                </div>
                                {/* Show if this commit overrides another */}
                                {commit.enabled && (() => {
                                  const effectiveSet = new Set(effectiveOps);
                                  const overridden = commit.operations.some(op => !effectiveSet.has(op));
                                  return overridden ? (
                                    <p className="text-[9px] text-amber-400/60 mt-1">⚡ Partially overridden by a later edit</p>
                                  ) : null;
                                })()}
                                <p className="text-[9px] text-white/20 mt-1">
                                  {new Date(commit.timestamp).toLocaleTimeString()}
                                  {commit.strategyName ? ` · ${commit.strategyName}` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {/* Toggle on/off */}
                                <button
                                  onClick={() => {
                                    editStack.toggle(commit.id);
                                    setAppliedEffects(editStack.computeEffectTypes());
                                  }}
                                  className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                                    commit.enabled
                                      ? 'bg-brand-500/20 text-brand-400 hover:bg-brand-500/30'
                                      : 'bg-surface-3 text-white/20 hover:text-white/40'
                                  }`}
                                  title={commit.enabled ? 'Disable this edit' : 'Enable this edit'}
                                >
                                  {commit.enabled ? (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5" />
                                  )}
                                </button>
                                {/* Remove */}
                                <button
                                  onClick={() => {
                                    editStack.remove(commit.id);
                                    setAppliedEffects(editStack.computeEffectTypes());
                                  }}
                                  className="w-6 h-6 rounded flex items-center justify-center bg-surface-3 text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all"
                                  title="Remove this edit permanently"
                                >
                                  <span className="text-xs font-bold">×</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Summary & Clear All */}
                    <div className="border-t border-surface-4/50 pt-3 mt-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-white/30">
                          {commits.filter(c => c.enabled).length} / {commits.length} edits active · {effectiveOps.length} effective ops
                        </span>
                        <button
                          onClick={() => { editStack.clearAll(); setAppliedEffects([]); setAppliedStrategy(null); }}
                          className="text-[10px] px-2.5 py-1 rounded bg-red-500/10 border border-red-500/20 text-red-400/80 hover:bg-red-500/20 transition-colors"
                        >
                          Reset Everything
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Voice tab removed — voice is now inline in AI Chat */}
          </div>
        </div>
      </div>

      {/* Share / Post Modal */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md" onClick={() => setShowShareModal(false)}>
          <div className="bg-surface-1 border border-surface-4/60 rounded-2xl w-full max-w-[95vw] sm:max-w-lg mx-2 sm:mx-4 shadow-2xl shadow-black/60 max-h-[90vh] overflow-y-auto animate-fade-in" onClick={e => e.stopPropagation()}>
            {/* Header with gradient accent */}
            <div className="relative px-5 pt-5 pb-4 border-b border-surface-4/40">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/50 to-transparent" />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-brand-500/15 border border-brand-500/20 flex items-center justify-center">
                    <Share2 className="w-4.5 h-4.5 text-brand-400" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">Publish</h2>
                    <p className="text-[11px] text-white/35">Share your edit to the world</p>
                  </div>
                </div>
                <button onClick={() => setShowShareModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white hover:bg-surface-3 transition-all">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>

            <div className="px-5 py-4 space-y-5">
              {/* Duration badge */}
              {editedDurationMs > 0 && editedDurationMs < effectiveDuration && (
                <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-brand-500/8 border border-brand-500/15">
                  <Timer className="w-4 h-4 text-brand-400 shrink-0" />
                  <span className="text-xs text-white/60">Edited duration:</span>
                  <span className="text-xs text-brand-300 font-bold">{formatTime(editedDurationMs)}</span>
                  <span className="text-[10px] text-white/25 ml-auto">was {formatTime(effectiveDuration)}</span>
                </div>
              )}

              {/* Title & Description */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Title</label>
                  <input
                    type="text"
                    value={postTitle}
                    onChange={e => setPostTitle(e.target.value)}
                    placeholder="Give your short a title…"
                    className="input text-sm"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-1.5">Description</label>
                  <textarea
                    value={postDescription}
                    onChange={e => setPostDescription(e.target.value)}
                    placeholder="Add a description, hashtags, or mentions…"
                    className="input text-sm resize-none"
                    rows={3}
                    maxLength={2200}
                  />
                  <div className="flex justify-between mt-1">
                    <p className="text-[10px] text-white/15">{postDescription.length > 0 ? `${postDescription.length}/2200` : ''}</p>
                  </div>
                </div>
              </div>

              {/* Platforms */}
              <div>
                <p className="text-[11px] font-semibold text-white/40 uppercase tracking-wider mb-3">Platforms</p>

                <div className="space-y-2.5">
                  {([
                    {
                      key: 'youtube',
                      name: 'YouTube Shorts',
                      subtitle: 'Upload as a Short',
                      iconBg: 'bg-red-600',
                      icon: <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>,
                      ringColor: 'ring-red-500/30',
                      btnClass: 'bg-red-600 text-white hover:bg-red-700',
                      publishedBg: 'bg-red-500/10',
                    },
                    {
                      key: 'instagram',
                      name: 'Instagram Reels',
                      subtitle: 'Share as a Reel',
                      iconBg: 'bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400',
                      icon: <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>,
                      ringColor: 'ring-pink-500/30',
                      btnClass: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600',
                      publishedBg: 'bg-pink-500/10',
                    },
                    {
                      key: 'twitter',
                      name: 'X (Twitter)',
                      subtitle: 'Post as a video',
                      iconBg: 'bg-surface-3 border border-surface-5',
                      icon: <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
                      ringColor: 'ring-white/10',
                      btnClass: 'bg-white text-black hover:bg-gray-200',
                      publishedBg: 'bg-white/5',
                    },
                  ] as const).map(platform => {
                    const status = postStatus[platform.key];
                    const connected = !!connectedAccounts[platform.key];
                    const url = publishUrls[platform.key];
                    const error = publishErrors[platform.key];
                    const isDone = status === 'done';

                    return (
                      <div
                        key={platform.key}
                        className={`rounded-xl border transition-all duration-200 ${
                          isDone
                            ? `${platform.publishedBg} border-emerald-500/20 ring-1 ring-emerald-500/10`
                            : `bg-surface-2/60 border-surface-4/50 hover:border-surface-5 hover:ring-1 ${platform.ringColor}`
                        }`}
                      >
                        <div className="flex items-center gap-3 p-3.5">
                          {/* Icon */}
                          <div className={`w-10 h-10 rounded-xl ${platform.iconBg} flex items-center justify-center shrink-0 shadow-lg shadow-black/20`}>
                            {platform.icon}
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-semibold truncate">{platform.name}</p>
                            <p className="text-white/30 text-[11px] truncate">
                              {connected ? <span className="text-emerald-400">@{connectedAccounts[platform.key]}</span> : platform.subtitle}
                            </p>
                          </div>

                          {/* Action */}
                          {!connected ? (
                            <span className="text-[10px] text-white/25 border border-surface-4 px-2.5 py-1 rounded-lg whitespace-nowrap shrink-0">Not linked</span>
                          ) : isDone ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span className="text-xs font-semibold text-emerald-400">Published</span>
                            </div>
                          ) : (
                            <button
                              onClick={() => handlePublish(platform.key)}
                              disabled={!postTitle.trim() || status === 'posting'}
                              className={`text-xs font-semibold px-4 py-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed whitespace-nowrap shrink-0 ${
                                status === 'posting' ? 'bg-surface-4 text-white/40 cursor-wait' : platform.btnClass
                              }`}
                            >
                              {status === 'posting' ? (
                                <span className="flex items-center gap-2">
                                  <span className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                  Publishing…
                                </span>
                              ) : (
                                <span className="flex items-center gap-1.5">
                                  <Upload className="w-3.5 h-3.5" />
                                  Publish
                                </span>
                              )}
                            </button>
                          )}
                        </div>

                        {/* Published URL */}
                        {isDone && url && (
                          <div className="mx-3.5 mb-3.5 flex items-center gap-2 px-3 py-2 bg-surface-0/60 rounded-lg border border-surface-4/30">
                            <span className="text-[11px] text-emerald-400/80 truncate flex-1 font-mono">{url}</span>
                            <button onClick={() => navigator.clipboard.writeText(url)} className="text-[10px] text-brand-400 hover:text-brand-300 whitespace-nowrap font-medium">Copy</button>
                          </div>
                        )}

                        {/* Error */}
                        {status === 'error' && error && (
                          <div className="mx-3.5 mb-3 flex items-center gap-2 px-3 py-2 bg-red-500/8 border border-red-500/15 rounded-lg">
                            <p className="text-[11px] text-red-400">{error}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-surface-4/30 bg-surface-2/30">
              <p className="text-white/20 text-[11px] text-center">
                Manage connected accounts in <a href="/profile" className="text-brand-400 hover:text-brand-300 underline underline-offset-2">Profile</a>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Film(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/></svg>
  );
}
