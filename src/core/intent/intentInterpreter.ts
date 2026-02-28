// ============================================================================
// STEP 2 — CREATIVE INTENT INTERPRETER
// ============================================================================
// Converts vague voice commands into structured CreativeIntent objects.
// Uses:
//   - Intent classification schema
//   - Style taxonomy
//   - Style embedding system
//   - Creator-specific style profiles
//   - Confidence scoring
//   - Ambiguity resolution
// ============================================================================

import type {
  CreativeIntent,
  IntentClass,
  SubIntent,
  StyleReference,
  AmbiguityFlag,
} from '../../types/agents.js';
import type { Platform, EmotionalTone } from '../../types/core.js';

// ---------------------------------------------------------------------------
// Style taxonomy — maps creator names + style descriptors to traits
// ---------------------------------------------------------------------------
export const STYLE_TAXONOMY: Record<string, StyleTaxonomyEntry> = {
  // Creator-specific styles
  'mrbeast': {
    traits: ['fast_pacing', 'high_energy', 'bold_captions', 'sfx_heavy', 'constant_engagement'],
    tone: 'high_energy',
    pacing: 'constant_high',
    captionPreset: 'aggressive',
    zoomIntensity: 0.8,
    sfxIntensity: 0.9,
    cutInterval: 1800,
  },
  'alex hormozi': {
    traits: ['authoritative', 'direct_to_camera', 'bold_captions', 'clean_edit', 'value_dense'],
    tone: 'authoritative',
    pacing: 'front_loaded',
    captionPreset: 'aggressive',
    zoomIntensity: 0.6,
    sfxIntensity: 0.4,
    cutInterval: 2500,
  },
  'gary vee': {
    traits: ['raw_energy', 'motivational', 'fast_cuts', 'street_footage', 'multiple_angles'],
    tone: 'high_energy',
    pacing: 'constant_high',
    captionPreset: 'energetic',
    zoomIntensity: 0.7,
    sfxIntensity: 0.6,
    cutInterval: 2000,
  },
  'mkbhd': {
    traits: ['cinematic', 'clean', 'premium_feel', 'smooth_transitions', 'color_graded'],
    tone: 'authoritative',
    pacing: 'escalating',
    captionPreset: 'clean',
    zoomIntensity: 0.3,
    sfxIntensity: 0.2,
    cutInterval: 4000,
  },
  'casey neistat': {
    traits: ['cinematic', 'storytelling', 'dynamic_movement', 'drone_broll', 'narrative_arc'],
    tone: 'dramatic',
    pacing: 'dramatic_arc',
    captionPreset: 'minimal',
    zoomIntensity: 0.4,
    sfxIntensity: 0.5,
    cutInterval: 3000,
  },

  // Abstract style descriptors
  'dramatic': {
    traits: ['slow_motion', 'dramatic_music', 'high_contrast', 'tension_build', 'cinematic_lut'],
    tone: 'dramatic',
    pacing: 'dramatic_arc',
    captionPreset: 'dark',
    zoomIntensity: 0.5,
    sfxIntensity: 0.7,
    cutInterval: 3500,
  },
  'viral': {
    traits: ['fast_hook', 'pattern_interrupts', 'curiosity_gap', 'high_retention', 'dopamine_pacing'],
    tone: 'high_energy',
    pacing: 'front_loaded',
    captionPreset: 'aggressive',
    zoomIntensity: 0.8,
    sfxIntensity: 0.8,
    cutInterval: 2000,
  },
  'cinematic': {
    traits: ['wide_shots', 'color_graded', 'slow_transitions', 'letterbox', 'film_grain'],
    tone: 'dramatic',
    pacing: 'dramatic_arc',
    captionPreset: 'minimal',
    zoomIntensity: 0.3,
    sfxIntensity: 0.3,
    cutInterval: 4000,
  },
  'dopamine': {
    traits: ['fast_cuts', 'sfx_every_2s', 'zoom_punches', 'bold_captions', 'pattern_interrupt_heavy'],
    tone: 'high_energy',
    pacing: 'constant_high',
    captionPreset: 'energetic',
    zoomIntensity: 0.9,
    sfxIntensity: 0.9,
    cutInterval: 1500,
  },
  'professional': {
    traits: ['clean_edit', 'minimal_sfx', 'clear_captions', 'consistent_branding', 'value_focused'],
    tone: 'authoritative',
    pacing: 'escalating',
    captionPreset: 'clean',
    zoomIntensity: 0.3,
    sfxIntensity: 0.2,
    cutInterval: 4000,
  },
};

export interface StyleTaxonomyEntry {
  traits: string[];
  tone: EmotionalTone;
  pacing: string;
  captionPreset: string;
  zoomIntensity: number;
  sfxIntensity: number;
  cutInterval: number;
}

// ---------------------------------------------------------------------------
// Intent classification patterns
// ---------------------------------------------------------------------------
export const INTENT_PATTERNS: IntentPattern[] = [
  // Style changes
  { patterns: [/make it (like|feel like|similar to) (.+)/i, /(.+) style/i, /(.+) vibes?/i],
    intentClass: 'style_change', extractorKey: 'style_reference' },

  // Pacing changes
  { patterns: [/make it (faster|slower|quicker)/i, /speed (up|it up)/i, /too (slow|fast)/i,
    /(pace|pacing|rhythm)/i, /more (snappy|punchy)/i],
    intentClass: 'pacing_change', extractorKey: 'pacing_direction' },

  // Content restructuring
  { patterns: [/cut the (fluff|filler|boring parts)/i, /(trim|shorten|condense)/i,
    /make it (shorter|tighter)/i, /high.?retention/i, /remove (the )?(fluff|filler)/i,
    /turn .+ into (\d+) (clips?|videos?)/i],
    intentClass: 'content_restructure', extractorKey: 'restructure_type' },

  // Caption changes
  { patterns: [/caption/i, /subtitle/i, /text (bigger|smaller|bolder)/i,
    /(aggressive|bold|clean|minimal) (captions?|text|subtitles?)/i],
    intentClass: 'caption_change', extractorKey: 'caption_style' },

  // Audio changes
  { patterns: [/add (music|sound|sfx|sound effects)/i, /(louder|quieter|volume)/i,
    /(dramatic|epic|chill) music/i, /sound design/i],
    intentClass: 'audio_change', extractorKey: 'audio_adjustment' },

  // Platform optimization
  { patterns: [/optimize for (tiktok|reels|shorts|twitter|linkedin)/i,
    /(tiktok|reels|shorts|twitter|linkedin) (format|version|optimized)/i],
    intentClass: 'platform_optimize', extractorKey: 'platform' },

  // Clip extraction
  { patterns: [/(\d+) (viral )?(clips?|highlights?)/i, /best (moments?|parts?|clips?)/i,
    /extract (the )?(best|top)/i, /find (the )?(best|top|viral)/i],
    intentClass: 'clip_extraction', extractorKey: 'clip_count' },

  // Full edit
  { patterns: [/edit (this|it|the video)/i, /full edit/i, /do your (thing|magic)/i,
    /make (this|it) (good|great|amazing|viral)/i],
    intentClass: 'full_edit', extractorKey: 'quality_target' },

  // Undo
  { patterns: [/undo/i, /go back/i, /revert/i, /previous version/i],
    intentClass: 'undo', extractorKey: 'undo_scope' },

  // Incremental adjustment
  { patterns: [/more (.+)/i, /less (.+)/i, /a (bit|little|lot) more/i, /increase/i, /decrease/i,
    /add (more )?dopamine/i],
    intentClass: 'incremental_adjust', extractorKey: 'adjustment_direction' },

  // Export
  { patterns: [/export/i, /download/i, /render( it)?$/i, /publish/i, /post (it|this)/i],
    intentClass: 'export', extractorKey: 'export_target' },
];

export interface IntentPattern {
  patterns: RegExp[];
  intentClass: IntentClass;
  extractorKey: string;
}

// ---------------------------------------------------------------------------
// Intent interpreter engine
// ---------------------------------------------------------------------------
export class IntentInterpreter {
  private styleTaxonomy: Map<string, StyleTaxonomyEntry>;

  constructor() {
    this.styleTaxonomy = new Map(Object.entries(STYLE_TAXONOMY));
  }

  /**
   * Parse raw voice/text input into a structured CreativeIntent.
   * This is the LOCAL fast-path. For complex/ambiguous intents,
   * the orchestrator escalates to the Ministral 14b model.
   */
  interpretLocal(rawInput: string): CreativeIntent {
    const normalized = rawInput.trim().toLowerCase();
    const intentClass = this.classifyIntent(normalized);
    const subIntents = this.extractSubIntents(normalized, intentClass);
    const styleRef = this.resolveStyleReference(normalized);
    const platform = this.extractPlatform(normalized);
    const tone = this.inferTone(normalized, styleRef);
    const ambiguities = this.detectAmbiguities(normalized, intentClass, styleRef);

    const confidence = this.computeConfidence(intentClass, subIntents, ambiguities);

    return {
      id: this.generateId(),
      rawInput,
      intentClass,
      subIntents,
      targetPlatform: platform,
      targetTone: tone,
      styleReference: styleRef,
      confidenceScore: confidence,
      ambiguityFlags: ambiguities,
      resolvedParams: this.resolveParams(normalized, intentClass, subIntents),
    };
  }

  /**
   * Build the system prompt for the Ministral 14b Intent Interpreter agent.
   * Called when local interpretation confidence is too low.
   */
  buildAgentPrompt(rawInput: string, context: {
    currentStrategy?: unknown;
    creatorProfile?: unknown;
    projectHistory?: unknown;
  }): string {
    return `You are an expert creative intent interpreter for a video editing AI.

Your task: Convert the creator's vague request into a precise, structured editing intent.

## Creator's Request
"${rawInput}"

## Available Intent Classes
${Object.values(INTENT_PATTERNS).map(p => `- ${p.intentClass}`).join('\n')}

## Available Style References
${Array.from(this.styleTaxonomy.keys()).join(', ')}

## Current Context
${JSON.stringify(context, null, 2)}

## Output Format (JSON)
{
  "intentClass": "...",
  "subIntents": [{ "category": "...", "action": "...", "intensity": 0.0-1.0, "params": {} }],
  "targetPlatform": "tiktok|reels|shorts|...|null",
  "targetTone": "high_energy|dramatic|...|null",
  "styleReference": { "creatorName": "...", "traits": [...] } | null,
  "confidenceScore": 0.0-1.0,
  "ambiguityFlags": [{ "field": "...", "reason": "...", "suggestions": [...], "requiresConfirmation": false }],
  "resolvedParams": { ... }
}

Be precise. Map vague language to specific editing parameters.
"Add dopamine" → fast cuts, sfx every 2s, zoom punches, bold captions.
"Make it like MrBeast" → high energy, constant engagement, bold captions, SFX heavy.
"Cut the fluff" → remove silence, trim filler, increase pacing.
`;
  }

  // --- Private classification methods ---

  private classifyIntent(input: string): IntentClass {
    for (const { patterns, intentClass } of INTENT_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(input)) return intentClass;
      }
    }
    // Default: treat as incremental adjustment
    return 'incremental_adjust';
  }

  private extractSubIntents(input: string, mainClass: IntentClass): SubIntent[] {
    const subs: SubIntent[] = [];

    // "Make it more dramatic" → dramatic style + tension
    if (/more dramatic/i.test(input)) {
      subs.push({ category: 'style', action: 'increase_drama', intensity: 0.7, params: {} });
      subs.push({ category: 'audio', action: 'add_dramatic_music', intensity: 0.6, params: {} });
      subs.push({ category: 'pacing', action: 'slow_key_moments', intensity: 0.5, params: {} });
    }

    // "Add dopamine"
    if (/dopamine/i.test(input)) {
      subs.push({ category: 'pacing', action: 'increase_cut_frequency', intensity: 0.8, params: {} });
      subs.push({ category: 'visual', action: 'add_zoom_punches', intensity: 0.8, params: {} });
      subs.push({ category: 'audio', action: 'add_sfx', intensity: 0.8, params: {} });
      subs.push({ category: 'caption', action: 'bold_pop_captions', intensity: 0.9, params: {} });
    }

    // "Make it faster"
    if (/faster|quicker|snappy|punchy/i.test(input)) {
      subs.push({ category: 'pacing', action: 'increase_speed', intensity: 0.6, params: {} });
      subs.push({ category: 'silence', action: 'trim_silence', intensity: 0.8, params: {} });
    }

    // "Make it viral" / "high retention"
    if (/viral|high.?retention/i.test(input)) {
      subs.push({ category: 'hook', action: 'optimize_hook', intensity: 0.9, params: {} });
      subs.push({ category: 'pacing', action: 'optimize_retention', intensity: 0.9, params: {} });
      subs.push({ category: 'visual', action: 'pattern_interrupts', intensity: 0.8, params: {} });
    }

    // "Aggressive captions"
    if (/aggressive (captions?|text|subtitles?)/i.test(input)) {
      subs.push({ category: 'caption', action: 'set_aggressive', intensity: 1.0, params: { preset: 'aggressive' } });
    }

    // Clip extraction
    const clipMatch = input.match(/(\d+)\s*(viral\s*)?(clips?|highlights?)/i);
    if (clipMatch) {
      subs.push({ category: 'extraction', action: 'extract_clips', intensity: 1.0, params: { count: parseInt(clipMatch[1]) } });
    }

    return subs;
  }

  private resolveStyleReference(input: string): StyleReference | undefined {
    // Check for creator name mentions
    for (const [name, entry] of this.styleTaxonomy) {
      if (input.includes(name.toLowerCase())) {
        return {
          creatorName: name,
          traits: entry.traits,
        };
      }
    }

    // Check for abstract style descriptors
    const styleWords = ['dramatic', 'viral', 'cinematic', 'dopamine', 'professional'];
    for (const word of styleWords) {
      if (input.includes(word)) {
        const entry = this.styleTaxonomy.get(word);
        if (entry) {
          return { traits: entry.traits };
        }
      }
    }

    return undefined;
  }

  private extractPlatform(input: string): Platform | undefined {
    const platformMap: Record<string, Platform> = {
      tiktok: 'tiktok',
      'tik tok': 'tiktok',
      reels: 'reels',
      instagram: 'reels',
      shorts: 'shorts',
      youtube: 'shorts',
      twitter: 'twitter',
      'x.com': 'twitter',
      linkedin: 'linkedin',
    };
    for (const [keyword, platform] of Object.entries(platformMap)) {
      if (input.includes(keyword)) return platform;
    }
    return undefined;
  }

  private inferTone(input: string, styleRef?: StyleReference): EmotionalTone | undefined {
    if (styleRef) {
      const styleEntry = this.styleTaxonomy.get(
        styleRef.creatorName?.toLowerCase() ?? ''
      );
      if (styleEntry) return styleEntry.tone;
    }

    const toneMap: Record<string, EmotionalTone> = {
      dramatic: 'dramatic',
      cinematic: 'dramatic',
      funny: 'comedic',
      comedy: 'comedic',
      educational: 'educational',
      professional: 'authoritative',
      energy: 'high_energy',
      hype: 'high_energy',
      chill: 'casual',
      inspirational: 'inspirational',
    };

    for (const [keyword, tone] of Object.entries(toneMap)) {
      if (input.includes(keyword)) return tone;
    }

    return undefined;
  }

  private detectAmbiguities(
    input: string,
    intentClass: IntentClass,
    styleRef?: StyleReference,
  ): AmbiguityFlag[] {
    const flags: AmbiguityFlag[] = [];

    // Very short input with no clear signals
    if (input.split(/\s+/).length <= 2 && !styleRef) {
      flags.push({
        field: 'intent',
        reason: 'Input too vague to determine precise editing strategy',
        suggestions: ['Could you describe the style or feeling you want?'],
        requiresConfirmation: false,
      });
    }

    // Contradictory signals
    if (/faster/i.test(input) && /dramatic/i.test(input)) {
      flags.push({
        field: 'pacing_vs_drama',
        reason: 'Dramatic usually implies slower pacing, but you asked for faster',
        suggestions: ['Fast-paced dramatic (action style)', 'Slow dramatic (cinematic style)'],
        requiresConfirmation: true,
      });
    }

    return flags;
  }

  private computeConfidence(
    intentClass: IntentClass,
    subIntents: SubIntent[],
    ambiguities: AmbiguityFlag[],
  ): number {
    let confidence = 0.5;

    // More sub-intents = more understanding
    confidence += Math.min(0.3, subIntents.length * 0.1);

    // Ambiguities reduce confidence
    confidence -= ambiguities.filter(a => a.requiresConfirmation).length * 0.15;
    confidence -= ambiguities.filter(a => !a.requiresConfirmation).length * 0.05;

    // Specific intent classes are more confident
    if (intentClass !== 'incremental_adjust') confidence += 0.1;

    return Math.max(0, Math.min(1, confidence));
  }

  private resolveParams(
    input: string,
    intentClass: IntentClass,
    subIntents: SubIntent[],
  ): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // Extract numeric values
    const numMatch = input.match(/(\d+)/);
    if (numMatch) params.numericValue = parseInt(numMatch[1]);

    // Extract "more" / "less" direction
    if (/more/i.test(input)) params.direction = 'increase';
    if (/less/i.test(input)) params.direction = 'decrease';

    // Platform-specific params
    const platform = this.extractPlatform(input);
    if (platform) params.platform = platform;

    return params;
  }

  private generateId(): string {
    return `intent_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }
}
