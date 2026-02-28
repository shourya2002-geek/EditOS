'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useVoiceWebSocket } from '@/lib/websocket';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Mic, MicOff, Wand2, Undo2, Redo2, ZoomIn, ZoomOut,
  Layers, Type, Music, Image, Scissors, Sparkles,
  ChevronRight, Send, MessageSquare, Download, Eye,
  Maximize2, Settings, SplitSquareHorizontal, Upload, CheckCircle2, Loader2,
} from 'lucide-react';

type EditorTab = 'strategy' | 'timeline' | 'voice' | 'ai-chat';

export default function EditorPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [activeTab, setActiveTab] = useState<EditorTab>('strategy');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration] = useState(60000);
  const [zoom, setZoom] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Strategy generation
  const [intent, setIntent] = useState('');
  const [strategy, setStrategy] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  // AI Chat
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; text: string }>>([
    { role: 'assistant', text: 'Hi! I\'m your AI editing assistant. Describe what you want and I\'ll generate an editing strategy. Try something like "make it fast-paced with hard cuts and bold captions".' },
  ]);
  const [chatInput, setChatInput] = useState('');

  // Voice
  const voice = useVoiceWebSocket();

  // Video upload
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploaded, setIsUploaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);

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
      const result = await api.uploadVideo(projectId, file, (pct) => setUploadProgress(pct));
      setIsUploaded(true);
      setUploadProgress(null);
      // Set video URL for preview
      setVideoUrl(api.getVideoUrl(projectId));
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', text: `Video "${file.name}" uploaded successfully (${(file.size / 1024 / 1024).toFixed(1)} MB). You can now generate an editing strategy!` },
      ]);
    } catch (err: any) {
      setUploadError(err.message);
      setUploadProgress(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      const input = fileInputRef.current;
      if (input) {
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      // Also trigger directly
      const allowed = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];
      if (!allowed.includes(file.type)) {
        setUploadError(`Unsupported file type. Use MP4, MOV, WebM, AVI, or MKV.`);
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

  // Sync video element with play state
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

  const generateStrategy = async (intentText: string) => {
    if (!intentText.trim()) return;
    setGenerating(true);
    try {
      const result = await api.generateStrategy({
        projectId,
        intent: intentText,
        platform: 'tiktok',
      });
      setStrategy(result);
      setChatMessages((prev) => [
        ...prev,
        { role: 'user', text: intentText },
        { role: 'assistant', text: `Strategy generated! ${result.strategy?.operations?.length ?? 0} operations planned with ${(result.strategy?.metadata?.confidenceScore * 100)?.toFixed(0) ?? '?'}% confidence. Operations include: ${result.strategy?.operations?.slice(0, 3).map((op: any) => op.type).join(', ') ?? 'N/A'}${(result.strategy?.operations?.length ?? 0) > 3 ? '...' : ''}` },
      ]);
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        { role: 'user', text: intentText },
        { role: 'assistant', text: `Error: ${err.message}` },
      ]);
    } finally {
      setGenerating(false);
    }
  };

  const handleChatSend = () => {
    if (!chatInput.trim()) return;
    generateStrategy(chatInput);
    setChatInput('');
  };

  const handleIntentSubmit = () => {
    generateStrategy(intent);
    setIntent('');
  };

  const effectiveDuration = videoDuration > 0 ? videoDuration : duration;
  const timeToPercent = (ms: number) => (ms / effectiveDuration) * 100;
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col -m-6 animate-fade-in">
      {/* Toolbar */}
      <div className="h-12 bg-surface-1 border-b border-surface-4/50 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-1">
          <button className="btn-ghost p-2" title="Undo"><Undo2 className="w-4 h-4" /></button>
          <button className="btn-ghost p-2" title="Redo"><Redo2 className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-surface-4 mx-1" />
          <button className="btn-ghost p-2" title="Cut"><Scissors className="w-4 h-4" /></button>
          <button className="btn-ghost p-2" title="Split"><SplitSquareHorizontal className="w-4 h-4" /></button>
          <div className="w-px h-5 bg-surface-4 mx-1" />
          <button className="btn-ghost p-2" title="Zoom In" onClick={() => setZoom(z => Math.min(z * 1.5, 5))}><ZoomIn className="w-4 h-4" /></button>
          <button className="btn-ghost p-2" title="Zoom Out" onClick={() => setZoom(z => Math.max(z / 1.5, 0.2))}><ZoomOut className="w-4 h-4" /></button>
          <span className="text-xs text-white/30 ml-1">{(zoom * 100).toFixed(0)}%</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => voice.isListening ? voice.stopListening() : voice.startListening()}
            className={`btn-ghost p-2 ${voice.isListening ? 'text-red-400 bg-red-500/10' : ''}`}
            title={voice.isListening ? 'Stop Voice' : 'Start Voice'}
          >
            {voice.isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
          <button className="btn-primary text-xs py-1.5 px-3">
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Preview Panel */}
        <div className="flex-1 flex flex-col">
          {/* Video Preview */}
          <div className="flex-1 bg-black flex items-center justify-center relative">
            {videoUrl ? (
              /* Uploaded video player */
              <div className="aspect-[9/16] max-h-full bg-surface-2 rounded-lg relative overflow-hidden" style={{ height: '80%' }}>
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full h-full object-contain"
                  onTimeUpdate={(e) => setCurrentTime((e.currentTarget.currentTime) * 1000)}
                  onLoadedMetadata={(e) => setVideoDuration(e.currentTarget.duration * 1000)}
                  onEnded={() => setIsPlaying(false)}
                  playsInline
                />
                {/* Caption overlay mockup */}
                {strategy && (
                  <div className="absolute bottom-8 left-4 right-4 text-center z-10">
                    <p className="text-sm font-bold text-white drop-shadow-lg bg-black/40 rounded px-2 py-1 inline-block">
                      &quot;Your AI-generated captions appear here&quot;
                    </p>
                  </div>
                )}
              </div>
            ) : (
              /* Upload area */
              <div
                className="aspect-[9/16] max-h-full bg-surface-2 rounded-lg flex items-center justify-center relative overflow-hidden cursor-pointer group"
                style={{ height: '80%' }}
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
              <button className="text-white/60 hover:text-white transition-colors" onClick={() => { setCurrentTime(0); if (videoRef.current) videoRef.current.currentTime = 0; }}>
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
              <span className="text-xs text-white/60 font-mono">{formatTime(currentTime)}</span>
              <span className="text-xs text-white/20">/</span>
              <span className="text-xs text-white/40 font-mono">{formatTime(effectiveDuration)}</span>
              <div className="w-px h-5 bg-white/10 mx-1" />
              <button className="text-white/60 hover:text-white transition-colors" onClick={() => setIsMuted(!isMuted)}>
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="h-48 bg-surface-1 border-t border-surface-4/50 flex flex-col shrink-0">
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
              <span className="text-[10px] text-white/30 font-mono">{formatTime(currentTime)} / {formatTime(effectiveDuration)}</span>
            </div>

            {/* Timeline ruler */}
            <div className="h-5 border-b border-surface-4/20 flex items-end px-4 shrink-0 relative overflow-hidden">
              {Array.from({ length: Math.ceil(effectiveDuration / 5000) }, (_, i) => (
                <div key={i} className="absolute bottom-0" style={{ left: `${(i * 5000 / effectiveDuration) * 100}%` }}>
                  <div className="h-2 w-px bg-white/10" />
                  <span className="text-[8px] text-white/20 ml-0.5">{formatTime(i * 5000)}</span>
                </div>
              ))}
              {/* Playhead */}
              <div
                className="absolute top-0 bottom-0 w-px bg-brand-400 z-10"
                style={{ left: `${timeToPercent(currentTime)}%` }}
              >
                <div className="w-2.5 h-2.5 bg-brand-400 rounded-full -ml-[5px] -mt-0.5" />
              </div>
            </div>

            {/* Track lanes */}
            <div className="flex-1 overflow-y-auto px-4 py-1 space-y-1">
              {[
                { name: 'Video', icon: Film, color: 'bg-blue-500/20 border-blue-500/30' },
                { name: 'Audio', icon: Volume2, color: 'bg-emerald-500/20 border-emerald-500/30' },
                { name: 'Captions', icon: Type, color: 'bg-amber-500/20 border-amber-500/30' },
                { name: 'Music', icon: Music, color: 'bg-pink-500/20 border-pink-500/30' },
                { name: 'Effects', icon: Sparkles, color: 'bg-brand-500/20 border-brand-500/30' },
              ].map((track) => (
                <div key={track.name} className="flex items-center gap-2 h-7">
                  <div className="w-20 flex items-center gap-1.5 shrink-0">
                    <track.icon className="w-3 h-3 text-white/30" />
                    <span className="text-[10px] text-white/40">{track.name}</span>
                  </div>
                  <div className={`flex-1 h-full rounded border ${track.color} relative`}>
                    {/* Show strategy operations as blocks */}
                    {strategy?.strategy?.operations
                      ?.filter((op: any) => {
                        if (track.name === 'Video') return ['cut', 'trim', 'speed_ramp', 'zoom'].includes(op.type);
                        if (track.name === 'Captions') return op.type === 'caption_add';
                        if (track.name === 'Audio') return ['audio_ducking', 'audio_fade'].includes(op.type);
                        if (track.name === 'Effects') return ['transition', 'effect_overlay'].includes(op.type);
                        return false;
                      })
                      .map((op: any, i: number) => (
                        <div
                          key={i}
                          className={`absolute top-0.5 bottom-0.5 rounded-sm ${track.color} opacity-60`}
                          style={{
                            left: `${(op.timeRange?.startMs ?? i * 5000) / duration * 100}%`,
                            width: `${Math.max(((op.timeRange?.endMs ?? (i * 5000 + 3000)) - (op.timeRange?.startMs ?? i * 5000)) / duration * 100, 2)}%`,
                          }}
                          title={`${op.type}: ${formatTime(op.timeRange?.startMs ?? 0)}`}
                        />
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div className="w-96 bg-surface-1 border-l border-surface-4/50 flex flex-col shrink-0">
          {/* Panel Tabs */}
          <div className="flex border-b border-surface-4/50 shrink-0">
            {([
              { key: 'strategy' as const, label: 'Strategy', icon: Wand2 },
              { key: 'ai-chat' as const, label: 'AI Chat', icon: MessageSquare },
              { key: 'voice' as const, label: 'Voice', icon: Mic },
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
          <div className="flex-1 overflow-y-auto">
            {activeTab === 'strategy' && (
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Creative Intent</label>
                  <textarea
                    className="input min-h-[80px] resize-none"
                    value={intent}
                    onChange={(e) => setIntent(e.target.value)}
                    placeholder='e.g. "Fast-paced TikTok with punchy cuts, bold captions, and energy ramping up"'
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
                          <span className="text-xs font-medium">{strategy.strategy?.targetPlatform ?? 'tiktok'}</span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-surface-2 border border-surface-4/50">
                          <span className="text-[10px] text-white/40 block">Model</span>
                          <span className="text-xs font-medium font-mono">{strategy.strategy?.metadata?.agentModel ?? '—'}</span>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => strategy.id && api.applyStrategy(strategy.id)}
                          className="btn-primary flex-1 text-xs py-2"
                        >
                          Apply Strategy
                        </button>
                        <button
                          onClick={() => strategy.id && api.previewStrategy(strategy.id)}
                          className="btn-secondary flex-1 text-xs py-2"
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
                <div className="p-3 border-t border-surface-4/50">
                  <div className="flex gap-2">
                    <input
                      className="input text-xs py-2"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                      placeholder="Describe your edit..."
                    />
                    <button onClick={handleChatSend} className="btn-primary px-3 py-2">
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'voice' && (
              <div className="p-4 space-y-6">
                <div className="text-center py-8">
                  <button
                    onClick={() => voice.isListening ? voice.stopListening() : voice.startListening()}
                    className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center transition-all ${
                      voice.isListening
                        ? 'bg-red-500/20 border-2 border-red-500 animate-pulse shadow-lg shadow-red-500/20'
                        : 'bg-surface-3 border-2 border-surface-4 hover:border-brand-500/50 hover:bg-brand-500/10'
                    }`}
                  >
                    {voice.isListening ? (
                      <MicOff className="w-8 h-8 text-red-400" />
                    ) : (
                      <Mic className="w-8 h-8 text-white/40" />
                    )}
                  </button>
                  <p className="text-sm font-medium mt-4">
                    {voice.isListening ? 'Listening...' : 'Tap to start voice commands'}
                  </p>
                  <p className="text-xs text-white/40 mt-1">
                    {voice.isListening
                      ? 'Speak naturally — "cut the first 3 seconds", "add captions"'
                      : 'Use voice to control the editor hands-free'
                    }
                  </p>
                </div>

                {/* Waveform visualization */}
                {voice.isListening && (
                  <div className="flex items-center justify-center gap-0.5 h-12">
                    {Array.from({ length: 20 }, (_, i) => (
                      <div
                        key={i}
                        className="w-1 bg-brand-400 rounded-full animate-waveform"
                        style={{
                          animationDelay: `${i * 0.05}s`,
                          height: `${Math.random() * 100}%`,
                        }}
                      />
                    ))}
                  </div>
                )}

                {/* Transcript */}
                {voice.transcript && (
                  <div className="p-3 rounded-lg bg-surface-2 border border-surface-4/50">
                    <span className="text-[10px] font-medium text-white/40 block mb-1">Transcript</span>
                    <p className="text-sm text-white/80">{voice.transcript}</p>
                  </div>
                )}

                {/* Voice command history */}
                {voice.commands.length > 0 && (
                  <div>
                    <span className="text-xs font-medium text-white/50 block mb-2">Command History</span>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {voice.commands.map((cmd, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded bg-surface-2 text-xs">
                          <ChevronRight className="w-3 h-3 text-brand-400 shrink-0" />
                          <span className="text-white/70">{cmd.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Film(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/></svg>
  );
}
