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
  | 'wait'
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
  tab?: 'strategy' | 'ai-chat' | 'history' | 'voice';
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

// ---------------------------------------------------------------------------
// Full demo sequence
// ---------------------------------------------------------------------------
export const DEMO_STEPS: DemoStep[] = [
  // 1. Switch to AI Chat
  { type: 'switch-tab', delay: 800, tab: 'ai-chat' },

  // 2. Type first prompt
  {
    type: 'type-chat',
    delay: 1000,
    text: 'make it cinematic with dramatic zoom and bold captions',
    typeSpeed: 40,
  },

  // 3. Send & get deterministic response
  { type: 'send-chat', delay: 600, response: RESPONSE_CINEMATIC },

  // 4. Wait for user to see the edits on timeline
  { type: 'wait', delay: 3000, duration: 3000 },

  // 5. Type second prompt
  {
    type: 'type-chat',
    delay: 500,
    text: 'cut the first 3 seconds and add a fade in',
    typeSpeed: 40,
  },

  // 6. Send
  { type: 'send-chat', delay: 600, response: RESPONSE_CUT_FADE },

  // 7. Wait
  { type: 'wait', delay: 2500, duration: 2500 },

  // 8. Type third prompt
  {
    type: 'type-chat',
    delay: 500,
    text: 'speed up the middle section to 1.5x',
    typeSpeed: 40,
  },

  // 9. Send
  { type: 'send-chat', delay: 600, response: RESPONSE_SPEED },

  // 10. Wait
  { type: 'wait', delay: 2000, duration: 2000 },

  // 11. Toggle preview mode
  { type: 'toggle-preview', delay: 1000 },

  // 12. Play video for a bit
  { type: 'play-video', delay: 1500 },

  // 13. Wait while video plays
  { type: 'wait', delay: 4000, duration: 4000 },

  // 14. Pause
  { type: 'pause-video', delay: 0 },

  // 15. Open share modal
  { type: 'open-share', delay: 1500 },

  // 16. Fill title
  {
    type: 'fill-title',
    delay: 1000,
    value: 'My Cinematic Short 🎬',
    typeSpeed: 35,
  },

  // 17. Fill description
  {
    type: 'fill-description',
    delay: 800,
    value: 'Created with EditOS AI ✨ #shorts #cinematic #ai',
    typeSpeed: 30,
  },

  // 18. Publish to YouTube
  { type: 'publish', delay: 1500, platform: 'youtube' },

  // 19. Wait for publish to complete
  { type: 'wait', delay: 4000, duration: 4000 },

  // 20. Publish to Instagram
  { type: 'publish', delay: 1000, platform: 'instagram' },

  // 21. Wait
  { type: 'wait', delay: 4000, duration: 4000 },

  // 22. Done — close modal after a pause
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
