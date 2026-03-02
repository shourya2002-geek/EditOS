// ============================================================================
// DEMO SCRIPT — Deterministic auto-play sequence for recording demos
// ============================================================================
// Each step describes an action the demo engine will perform automatically.
// AI responses are pre-scripted so no Mistral API call is needed.
// ============================================================================

export interface DemoAIResponse {
  message: string;
  operations: Array<{
    type: string;
    startMs: number;
    endMs: number;
    params?: Record<string, any>;
    description?: string;
  }>;
  strategyName?: string;
}

export type DemoStepType =
  | 'switch-tab'
  | 'type-chat'
  | 'send-chat'
  | 'send-chat-ai'
  | 'suggest-chat'
  | 'wait'
  | 'simulate-upload'
  | 'trigger-upload'
  | 'start-session'
  | 'start-voice'
  | 'voice-command'
  | 'stop-voice'
  | 'play-video'
  | 'pause-video'
  | 'toggle-preview'
  | 'open-share'
  | 'fill-title'
  | 'fill-description'
  | 'publish'
  | 'close-share';

export interface DemoStep {
  type: DemoStepType;
  /** Delay (ms) before executing this step */
  delay: number;
  /** For switch-tab */
  tab?: 'strategy' | 'ai-chat' | 'history';
  /** For type-chat — the text to type with typewriter effect */
  text?: string;
  /** For type-chat — ms per character (default 45) */
  typeSpeed?: number;
  /** For send-chat — the pre-scripted AI response */
  response?: DemoAIResponse;
  /** For fill-title / fill-description */
  value?: string;
  /** For publish — which platform */
  platform?: string;
  /** For wait — duration ms */
  duration?: number;
}

// ---------------------------------------------------------------------------
// The actual demo script — a cinematic editing flow
// ---------------------------------------------------------------------------

/** Pre-scripted AI responses (deterministic, no API calls) */
const RESPONSE_CINEMATIC: DemoAIResponse = {
  message: 'Done! I\'ve given your video a full cinematic treatment — dramatic color grading, a 1.5× zoom on the hero moment, bold captions, atmospheric music, and smooth fades in and out. 🎬',
  operations: [
    {
      type: 'color_grade',
      startMs: 0,
      endMs: 30000,
      params: { preset: 'cinematic' },
      description: 'Apply cinematic color grade',
    },
    {
      type: 'zoom',
      startMs: 8000,
      endMs: 18000,
      params: { level: 1.5 },
      description: 'Dramatic zoom on hero moment',
    },
    {
      type: 'caption',
      startMs: 2000,
      endMs: 12000,
      params: { text: 'The moment everything changed.', style: 'bold' },
      description: 'Bold opening caption',
    },
    {
      type: 'music',
      startMs: 0,
      endMs: 30000,
      params: { mood: 'dramatic', volume: 0.3 },
      description: 'Dramatic background music',
    },
    {
      type: 'fade_in',
      startMs: 0,
      endMs: 1500,
      params: { durationMs: 1500 },
      description: 'Smooth fade in',
    },
    {
      type: 'fade_out',
      startMs: 28500,
      endMs: 30000,
      params: { durationMs: 1500 },
      description: 'Smooth fade out',
    },
  ],
  strategyName: 'cinematic_treatment',
};

const RESPONSE_CUT_FADE: DemoAIResponse = {
  message: 'Trimmed the first 3 seconds and added a clean fade in. Your video now starts with impact. ✂️',
  operations: [
    {
      type: 'cut',
      startMs: 0,
      endMs: 3000,
      description: 'Cut first 3 seconds',
    },
    {
      type: 'fade_in',
      startMs: 3000,
      endMs: 4500,
      params: { durationMs: 1500 },
      description: 'Fade in after cut',
    },
  ],
  strategyName: 'trim_and_fade',
};

const RESPONSE_SPEED: DemoAIResponse = {
  message: 'Middle section is now 1.5× speed — keeps the energy high without losing context. ⚡',
  operations: [
    {
      type: 'speed',
      startMs: 10000,
      endMs: 22000,
      params: { factor: 1.5 },
      description: 'Speed up middle section to 1.5x',
    },
  ],
  strategyName: 'speed_ramp',
};

const RESPONSE_VOICE_ZOOM: DemoAIResponse = {
  message: 'Added a slow cinematic zoom on the ending — 1.3× from the 22-second mark through the end. Gives it a dramatic close! 🔍',
  operations: [
    {
      type: 'zoom',
      startMs: 22000,
      endMs: 30000,
      params: { level: 1.3 },
      description: 'Slow cinematic zoom on ending',
    },
  ],
  strategyName: 'ending_zoom',
};

// ---------------------------------------------------------------------------
// Full demo sequence — deterministic instructions sent to real Mistral AI
// ---------------------------------------------------------------------------
export const DEMO_STEPS: DemoStep[] = [
  // 1. Open the real file picker so user can upload their own video
  { type: 'trigger-upload', delay: 1000 },

  // 2. Start an editing session
  { type: 'start-session', delay: 1200 },

  // 3. Switch to AI Chat
  { type: 'switch-tab', delay: 1000, tab: 'ai-chat' },

  // 4. First command — shown as a suggestion bubble, then auto-sent to real AI
  {
    type: 'suggest-chat',
    delay: 1200,
    text: 'make it cinematic with dramatic zoom',
  },

  // 5. Wait for AI to process + user to see the edits
  { type: 'wait', delay: 4000, duration: 4000 },

  // 6. Second command — typed with typewriter, sent to real AI
  {
    type: 'type-chat',
    delay: 800,
    text: 'cut the last 5 seconds and add a fade in at the end',
    typeSpeed: 35,
  },
  { type: 'send-chat-ai', delay: 400 },

  // 7. Wait
  { type: 'wait', delay: 4000, duration: 4000 },

  // 8. Third command
  {
    type: 'type-chat',
    delay: 800,
    text: 'speed up the middle section to 1.5x',
    typeSpeed: 35,
  },
  { type: 'send-chat-ai', delay: 400 },

  // 9. Wait
  { type: 'wait', delay: 4000, duration: 4000 },

  // 10. Fourth command
  {
    type: 'type-chat',
    delay: 800,
    text: 'add a slow zoom on the ending',
    typeSpeed: 35,
  },
  { type: 'send-chat-ai', delay: 400 },

  // 11. Wait
  { type: 'wait', delay: 3000, duration: 3000 },

  // 12. Toggle preview mode
  { type: 'toggle-preview', delay: 1000 },

  // 13. Play video for a bit
  { type: 'play-video', delay: 1500 },

  // 14. Wait while video plays
  { type: 'wait', delay: 4000, duration: 4000 },

  // 15. Pause
  { type: 'pause-video', delay: 0 },

  // 16. Open share modal
  { type: 'open-share', delay: 1500 },

  // 19. Fill title
  {
    type: 'fill-title',
    delay: 1000,
    value: 'My Cinematic Short 🎬',
    typeSpeed: 35,
  },

  // 20. Fill description
  {
    type: 'fill-description',
    delay: 800,
    value: 'Created with EditOS AI ✨ #shorts #cinematic #ai',
    typeSpeed: 30,
  },

  // 21. Publish to YouTube
  { type: 'publish', delay: 1500, platform: 'youtube' },

  // 22. Wait for publish to complete
  { type: 'wait', delay: 4000, duration: 4000 },

  // 23. Publish to Instagram
  { type: 'publish', delay: 1000, platform: 'instagram' },

  // 24. Wait
  { type: 'wait', delay: 4000, duration: 4000 },

  // 25. Done — close modal after a pause
  { type: 'close-share', delay: 2000 },
];

// ---------------------------------------------------------------------------
// Helper: typewriter effect — resolves after full text is typed
// ---------------------------------------------------------------------------
export function typewriterEffect(
  text: string,
  onChar: (partial: string) => void,
  speed: number = 45,
): Promise<void> {
  return new Promise((resolve) => {
    let i = 0;
    const interval = setInterval(() => {
      i++;
      onChar(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(interval);
        resolve();
      }
    }, speed);
  });
}

// ---------------------------------------------------------------------------
// Helper: play a pre-recorded demo audio file (kept for future use)
// ---------------------------------------------------------------------------
let _demoAudio: HTMLAudioElement | null = null;

export function playDemoAudio(src: string, volume: number = 0.85): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(); return; }
    stopDemoAudio();
    const audio = new Audio(src);
    audio.volume = volume;
    audio.onended = () => { _demoAudio = null; resolve(); };
    audio.onerror = () => { _demoAudio = null; resolve(); };
    _demoAudio = audio;
    audio.play().catch(() => { _demoAudio = null; resolve(); });
  });
}

export function stopDemoAudio(): void {
  if (_demoAudio) {
    _demoAudio.pause();
    _demoAudio.currentTime = 0;
    _demoAudio = null;
  }
}

// ---------------------------------------------------------------------------
// Helper: listen for live speech via Web Speech API (SpeechRecognition)
// Returns the final transcript string. Resolves when the user stops speaking.
// If abortSignal is provided, it can cancel early.
// ---------------------------------------------------------------------------
export function listenForSpeech(
  onInterim: (transcript: string) => void,
  abortCheck?: () => boolean,
): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') { resolve(''); return; }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition not supported');
      resolve('');
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalTranscript = '';
    let settled = false;
    const finish = (t: string) => { if (!settled) { settled = true; resolve(t); } };

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interim += t;
        }
      }
      onInterim(finalTranscript || interim);
    };

    recognition.onerror = () => finish(finalTranscript);
    recognition.onend = () => finish(finalTranscript);

    recognition.start();

    // Poll for abort
    if (abortCheck) {
      const poll = setInterval(() => {
        if (abortCheck()) {
          clearInterval(poll);
          try { recognition.stop(); } catch (_) {}
          finish(finalTranscript);
        }
      }, 200);
      // Also clear when done naturally
      const origFinish = recognition.onend;
      recognition.onend = () => { clearInterval(poll); finish(finalTranscript); };
    }
  });
}
