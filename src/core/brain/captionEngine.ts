// ============================================================================
// STEP 1 — ELITE SHORT-FORM EDITING BRAIN: CAPTION PSYCHOLOGY ENGINE
// ============================================================================
// Encodes caption design heuristics for maximum dopamine and retention:
//   - Font weight selection
//   - Word timing for emphasis
//   - Color psychology
//   - Animation selection
//   - Karaoke-style word highlighting
//   - Platform-specific caption placement
// ============================================================================

import type { TranscriptSegment, WordTiming, Platform } from '../../types/core.js';
import type {
  CaptionStyle,
  CaptionAnimation,
  EmphasisStrategy,
  CaptionSegment,
} from '../../types/dsl.js';

// ---------------------------------------------------------------------------
// Caption psychology rules
// ---------------------------------------------------------------------------
export const CAPTION_RULES = {
  // Words per line — cognitive load limits
  MAX_WORDS_PER_LINE: {
    tiktok: 4,
    reels: 4,
    shorts: 5,
    twitter: 6,
    linkedin: 7,
    generic: 5,
  } as Record<string, number>,

  // Font weight mapping — heavier = more emotional impact
  FONT_WEIGHT_MAP: {
    whisper: 300,
    normal: 500,
    emphasis: 700,
    shouting: 900,
    dramatic: 800,
  },

  // Font size (% of frame height)
  FONT_SIZE: {
    small: 3.5,
    medium: 4.5,
    large: 5.5,
    xl: 7.0,
  },

  // Color psychology presets
  COLOR_PRESETS: {
    // High contrast / aggressive (Hormozi, MrBeast)
    aggressive: {
      primary: '#FFFFFF',
      accent: '#FFD700',    // gold emphasis
      background: '#000000',
      backgroundOpacity: 0.7,
    },
    // Clean / professional
    clean: {
      primary: '#FFFFFF',
      accent: '#00BFFF',    // cyan emphasis
      background: '#1A1A1A',
      backgroundOpacity: 0.5,
    },
    // Energetic / fun
    energetic: {
      primary: '#FFFFFF',
      accent: '#FF4444',    // red emphasis
      background: undefined,
      backgroundOpacity: 0,
    },
    // Minimal / aesthetic
    minimal: {
      primary: '#FFFFFF',
      accent: '#FFFFFF',
      background: undefined,
      backgroundOpacity: 0,
    },
    // Dark mode
    dark: {
      primary: '#E0E0E0',
      accent: '#FF6B6B',
      background: '#0D0D0D',
      backgroundOpacity: 0.8,
    },
  } as Record<string, {
    primary: string;
    accent: string;
    background?: string;
    backgroundOpacity: number;
  }>,

  // Animation selection based on tone
  ANIMATION_MAP: {
    high_energy: 'pop' as CaptionAnimation,
    dramatic: 'scale_in' as CaptionAnimation,
    comedic: 'bounce' as CaptionAnimation,
    educational: 'fade_in' as CaptionAnimation,
    casual: 'slide_up' as CaptionAnimation,
    authoritative: 'typewriter' as CaptionAnimation,
    default: 'pop' as CaptionAnimation,
  } as Record<string, CaptionAnimation>,

  // Emphasis detection — words to highlight
  EMPHASIS_PATTERNS: {
    // Numbers always get emphasis
    numbers: /\b\d+[\d,.]*[kKmMbB%]?\b/,
    // Strong emotion words
    emotion: /\b(never|always|every|impossible|incredible|insane|crazy|amazing|terrible|worst|best|secret|only|must|guaranteed|free|new|now|today)\b/i,
    // Action words
    action: /\b(stop|start|watch|listen|look|think|imagine|notice|remember|forget|click|subscribe|share|buy|get|make|do)\b/i,
    // Negative emphasis (for contrast)
    negative: /\b(don't|can't|won't|shouldn't|never|no one|nobody|nothing|wrong|bad|fail|lose|mistake)\b/i,
  },

  // Caption safe zones per platform (% from edges)
  SAFE_ZONES: {
    tiktok: { top: 15, bottom: 20 },     // avoid username/music label
    reels: { top: 12, bottom: 18 },
    shorts: { top: 10, bottom: 15 },
    twitter: { top: 5, bottom: 10 },
    linkedin: { top: 5, bottom: 10 },
    generic: { top: 10, bottom: 15 },
  } as Record<string, { top: number; bottom: number }>,
} as const;

// ---------------------------------------------------------------------------
// Caption psychology engine
// ---------------------------------------------------------------------------
export class CaptionEngine {
  /**
   * Generate a complete caption style based on tone, platform, and style preset.
   */
  generateCaptionStyle(
    tone: string,
    platform: Platform,
    stylePreset: string = 'aggressive',
  ): CaptionStyle {
    const colors = CAPTION_RULES.COLOR_PRESETS[stylePreset]
      ?? CAPTION_RULES.COLOR_PRESETS.aggressive;
    const animation = CAPTION_RULES.ANIMATION_MAP[tone]
      ?? CAPTION_RULES.ANIMATION_MAP.default;

    return {
      enabled: true,
      position: 'center',  // center is highest retention for short-form
      maxWordsPerLine: CAPTION_RULES.MAX_WORDS_PER_LINE[platform] ?? 5,
      fontFamily: 'Montserrat',  // high legibility, modern, bold-friendly
      fontWeight: tone === 'high_energy' || tone === 'dramatic'
        ? CAPTION_RULES.FONT_WEIGHT_MAP.emphasis
        : CAPTION_RULES.FONT_WEIGHT_MAP.normal,
      fontSize: CAPTION_RULES.FONT_SIZE.large,
      primaryColor: colors.primary,
      accentColor: colors.accent,
      backgroundColor: colors.background,
      backgroundOpacity: colors.backgroundOpacity,
      animation,
      emphasisStrategy: this.selectEmphasisStrategy(tone),
      wordByWord: true,  // karaoke = higher engagement
    };
  }

  /**
   * Process transcript into caption segments with emphasis detection.
   */
  generateCaptionSegments(
    transcript: TranscriptSegment[],
    style: CaptionStyle,
  ): CaptionSegment[] {
    const segments: CaptionSegment[] = [];

    for (const seg of transcript) {
      // Split into lines based on max words per line
      const words = seg.text.split(/\s+/);
      const lines: string[][] = [];
      let currentLine: string[] = [];

      for (const word of words) {
        currentLine.push(word);
        if (currentLine.length >= style.maxWordsPerLine) {
          lines.push([...currentLine]);
          currentLine = [];
        }
      }
      if (currentLine.length > 0) lines.push(currentLine);

      // Distribute timing across lines
      const segDuration = seg.endMs - seg.startMs;
      const totalWords = words.length;
      let wordIndex = 0;

      for (const line of lines) {
        const lineStartRatio = wordIndex / totalWords;
        const lineEndRatio = (wordIndex + line.length) / totalWords;
        const lineText = line.join(' ');

        // Detect emphasis words
        const emphasisWords = this.detectEmphasisWords(lineText);

        segments.push({
          text: lineText,
          startMs: Math.round(seg.startMs + segDuration * lineStartRatio),
          endMs: Math.round(seg.startMs + segDuration * lineEndRatio),
          emphasisWords,
          animation: style.animation,
        });

        wordIndex += line.length;
      }
    }

    return segments;
  }

  /**
   * Adapt caption style for a specific creator profile.
   */
  adaptForCreatorStyle(
    baseStyle: CaptionStyle,
    creatorPreferences: {
      preferBold?: boolean;
      preferMinimal?: boolean;
      accentColor?: string;
      fontFamily?: string;
    },
  ): CaptionStyle {
    return {
      ...baseStyle,
      fontWeight: creatorPreferences.preferBold
        ? CAPTION_RULES.FONT_WEIGHT_MAP.emphasis
        : baseStyle.fontWeight,
      accentColor: creatorPreferences.accentColor ?? baseStyle.accentColor,
      fontFamily: creatorPreferences.fontFamily ?? baseStyle.fontFamily,
      backgroundOpacity: creatorPreferences.preferMinimal ? 0 : baseStyle.backgroundOpacity,
    };
  }

  /**
   * Detect words that should receive visual emphasis.
   */
  detectEmphasisWords(text: string): string[] {
    const emphasis: Set<string> = new Set();
    const words = text.split(/\s+/);

    for (const word of words) {
      const clean = word.replace(/[^a-zA-Z0-9]/g, '');
      for (const pattern of Object.values(CAPTION_RULES.EMPHASIS_PATTERNS)) {
        if (pattern.test(clean)) {
          emphasis.add(word);
          break;
        }
      }
    }

    return Array.from(emphasis);
  }

  // --- Private helpers ---

  private selectEmphasisStrategy(tone: string): EmphasisStrategy {
    switch (tone) {
      case 'high_energy':
      case 'dramatic':
        return 'color_keywords';
      case 'educational':
        return 'bold_keywords';
      case 'comedic':
        return 'size_keywords';
      case 'authoritative':
        return 'all_caps_keywords';
      default:
        return 'color_keywords';
    }
  }
}
