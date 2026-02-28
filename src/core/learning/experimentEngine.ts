// ============================================================================
// STEP 8 — LEARNING MOAT: A/B TESTING & STRATEGY EXPERIMENTATION
// ============================================================================
// Systematic experimentation framework:
//   - Generate variant strategies for A/B testing
//   - Track variant performance
//   - Statistical significance testing
//   - Auto-graduate winning variants into creator profiles
// ============================================================================

import type { EditingStrategy } from '../../types/dsl.js';
import type { CreatorStyleProfile, RetentionAnalytics } from './styleProfile.js';

// ---------------------------------------------------------------------------
// Experiment types
// ---------------------------------------------------------------------------
export type ExperimentStatus = 'draft' | 'running' | 'completed' | 'graduated';

export interface Experiment {
  id: string;
  creatorId: string;
  name: string;
  hypothesis: string;
  status: ExperimentStatus;
  createdAt: number;
  completedAt?: number;
  variants: ExperimentVariant[];
  control: ExperimentVariant;
  winningVariantId?: string;
  requiredSampleSize: number;
  significanceThreshold: number; // p-value threshold (e.g. 0.05)
}

export interface ExperimentVariant {
  id: string;
  name: string;
  description: string;
  strategyOverrides: Partial<StrategyOverrides>;
  metrics: VariantMetrics;
  sampleSize: number;
}

export interface StrategyOverrides {
  cutIntervalMs: number;
  hookStyle: string;
  captionPreset: string;
  zoomIntensity: number;
  sfxIntensity: number;
  speedRampIntensity: number;
  transitionType: string;
  colorGrade: string;
  energyCurve: string;
}

export interface VariantMetrics {
  retentionRates: number[];
  completionRates: number[];
  engagementRates: number[];
  avgRetention: number;
  avgCompletion: number;
  avgEngagement: number;
  varianceRetention: number;
}

// ---------------------------------------------------------------------------
// Experiment Engine
// ---------------------------------------------------------------------------
export class ExperimentEngine {
  private experiments = new Map<string, Experiment>();

  /**
   * Create a new experiment with automatic variant generation.
   */
  createExperiment(
    creatorId: string,
    profile: CreatorStyleProfile,
    name: string,
    hypothesis: string,
    dimension: keyof StrategyOverrides,
  ): Experiment {
    const control = this.buildControlVariant(profile);
    const variants = this.generateVariants(profile, dimension);

    const experiment: Experiment = {
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      creatorId,
      name,
      hypothesis,
      status: 'draft',
      createdAt: Date.now(),
      variants,
      control,
      requiredSampleSize: 30,       // Need 30 videos per variant for significance
      significanceThreshold: 0.05,
    };

    this.experiments.set(experiment.id, experiment);
    return experiment;
  }

  /**
   * Start an experiment.
   */
  startExperiment(experimentId: string): void {
    const exp = this.experiments.get(experimentId);
    if (exp && exp.status === 'draft') {
      exp.status = 'running';
    }
  }

  /**
   * Record a result for a variant.
   */
  recordResult(experimentId: string, variantId: string, analytics: RetentionAnalytics): void {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== 'running') return;

    const variant = variantId === exp.control.id
      ? exp.control
      : exp.variants.find(v => v.id === variantId);

    if (!variant) return;

    variant.metrics.retentionRates.push(analytics.retentionRate);
    variant.metrics.completionRates.push(analytics.completionRate);
    if (analytics.engagementRate !== undefined) {
      variant.metrics.engagementRates.push(analytics.engagementRate);
    }
    variant.sampleSize++;

    // Recompute aggregates
    variant.metrics.avgRetention = this.mean(variant.metrics.retentionRates);
    variant.metrics.avgCompletion = this.mean(variant.metrics.completionRates);
    variant.metrics.avgEngagement = this.mean(variant.metrics.engagementRates);
    variant.metrics.varianceRetention = this.variance(variant.metrics.retentionRates);

    // Check if we have enough samples to evaluate
    this.checkSignificance(exp);
  }

  /**
   * Get the strategy overrides for a given experiment + variant.
   */
  getVariantOverrides(experimentId: string, variantId: string): Partial<StrategyOverrides> | null {
    const exp = this.experiments.get(experimentId);
    if (!exp) return null;
    if (variantId === exp.control.id) return exp.control.strategyOverrides;
    const variant = exp.variants.find(v => v.id === variantId);
    return variant?.strategyOverrides ?? null;
  }

  /**
   * Assign a variant to a video (round-robin with control).
   */
  assignVariant(experimentId: string): ExperimentVariant | null {
    const exp = this.experiments.get(experimentId);
    if (!exp || exp.status !== 'running') return null;

    // Find variant with fewest samples (balanced assignment)
    const allVariants = [exp.control, ...exp.variants];
    allVariants.sort((a, b) => a.sampleSize - b.sampleSize);
    return allVariants[0];
  }

  /**
   * Get experiment results summary.
   */
  getResults(experimentId: string): ExperimentResults | null {
    const exp = this.experiments.get(experimentId);
    if (!exp) return null;

    const allVariants = [exp.control, ...exp.variants];
    const results: ExperimentResults = {
      experimentId,
      status: exp.status,
      totalSamples: allVariants.reduce((s, v) => s + v.sampleSize, 0),
      variants: allVariants.map(v => ({
        id: v.id,
        name: v.name,
        sampleSize: v.sampleSize,
        avgRetention: v.metrics.avgRetention,
        avgCompletion: v.metrics.avgCompletion,
        avgEngagement: v.metrics.avgEngagement,
        isControl: v.id === exp.control.id,
        isWinner: v.id === exp.winningVariantId,
      })),
      winningVariantId: exp.winningVariantId,
      isSignificant: exp.status === 'completed',
    };

    return results;
  }

  /**
   * List active experiments for a creator.
   */
  getActiveExperiments(creatorId: string): Experiment[] {
    return Array.from(this.experiments.values())
      .filter(e => e.creatorId === creatorId && e.status === 'running');
  }

  // --- Private ---

  private buildControlVariant(profile: CreatorStyleProfile): ExperimentVariant {
    return {
      id: `var_control_${Date.now()}`,
      name: 'Control',
      description: 'Current creator style (no changes)',
      strategyOverrides: {},
      metrics: this.emptyMetrics(),
      sampleSize: 0,
    };
  }

  private generateVariants(
    profile: CreatorStyleProfile,
    dimension: keyof StrategyOverrides,
  ): ExperimentVariant[] {
    const variants: ExperimentVariant[] = [];

    switch (dimension) {
      case 'cutIntervalMs': {
        const base = (profile.pacing.preferredCutIntervalMs[0] + profile.pacing.preferredCutIntervalMs[1]) / 2;
        variants.push(this.makeVariant('Faster cuts', `Cut interval ${(base * 0.7).toFixed(0)}ms`, { cutIntervalMs: base * 0.7 }));
        variants.push(this.makeVariant('Slower cuts', `Cut interval ${(base * 1.3).toFixed(0)}ms`, { cutIntervalMs: base * 1.3 }));
        break;
      }
      case 'hookStyle': {
        const styles = ['question', 'bold_claim', 'cold_open', 'numbers', 'controversy'];
        const current = profile.hook.preferredOpeningStyle;
        for (const style of styles) {
          if (style !== current) {
            variants.push(this.makeVariant(`Hook: ${style}`, `Test ${style} hook style`, { hookStyle: style }));
          }
        }
        variants.splice(2); // Max 2 variants + control
        break;
      }
      case 'captionPreset': {
        const presets = ['aggressive', 'clean', 'energetic', 'minimal', 'dark'];
        const current = profile.captions.preferredColorPreset;
        for (const preset of presets) {
          if (preset !== current) {
            variants.push(this.makeVariant(`Captions: ${preset}`, `Test ${preset} caption style`, { captionPreset: preset }));
          }
        }
        variants.splice(2);
        break;
      }
      case 'zoomIntensity': {
        const base = profile.visual.zoomIntensity;
        variants.push(this.makeVariant('More zoom', `Zoom intensity ${(base * 1.5).toFixed(2)}`, { zoomIntensity: Math.min(base * 1.5, 1) }));
        variants.push(this.makeVariant('Less zoom', `Zoom intensity ${(base * 0.5).toFixed(2)}`, { zoomIntensity: base * 0.5 }));
        break;
      }
      case 'sfxIntensity': {
        const base = profile.visual.sfxIntensity;
        variants.push(this.makeVariant('More SFX', `SFX intensity ${(base * 1.5).toFixed(2)}`, { sfxIntensity: Math.min(base * 1.5, 1) }));
        variants.push(this.makeVariant('Less SFX', `SFX intensity ${(base * 0.5).toFixed(2)}`, { sfxIntensity: base * 0.5 }));
        break;
      }
      default: {
        // Generic ±20% variant
        variants.push(this.makeVariant('Variant A', `+20% ${dimension}`, {}));
        variants.push(this.makeVariant('Variant B', `-20% ${dimension}`, {}));
      }
    }

    return variants;
  }

  private makeVariant(name: string, description: string, overrides: Partial<StrategyOverrides>): ExperimentVariant {
    return {
      id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      description,
      strategyOverrides: overrides,
      metrics: this.emptyMetrics(),
      sampleSize: 0,
    };
  }

  private emptyMetrics(): VariantMetrics {
    return {
      retentionRates: [],
      completionRates: [],
      engagementRates: [],
      avgRetention: 0,
      avgCompletion: 0,
      avgEngagement: 0,
      varianceRetention: 0,
    };
  }

  /**
   * Check if we have enough data to determine a winner.
   * Uses Welch's t-test for statistical significance.
   */
  private checkSignificance(exp: Experiment): void {
    const allVariants = [exp.control, ...exp.variants];

    // Need minimum samples
    if (allVariants.some(v => v.sampleSize < exp.requiredSampleSize)) return;

    // Compare each variant against control
    let bestVariant: ExperimentVariant | null = null;
    let bestImprovement = 0;

    for (const variant of exp.variants) {
      const pValue = this.welchTTest(
        exp.control.metrics.retentionRates,
        variant.metrics.retentionRates,
      );

      if (pValue < exp.significanceThreshold) {
        const improvement = variant.metrics.avgRetention - exp.control.metrics.avgRetention;
        if (improvement > bestImprovement) {
          bestImprovement = improvement;
          bestVariant = variant;
        }
      }
    }

    if (bestVariant) {
      exp.winningVariantId = bestVariant.id;
      exp.status = 'completed';
      exp.completedAt = Date.now();
    } else if (allVariants.every(v => v.sampleSize >= exp.requiredSampleSize * 2)) {
      // Double the required samples with no winner → conclude no significant difference
      exp.winningVariantId = exp.control.id;
      exp.status = 'completed';
      exp.completedAt = Date.now();
    }
  }

  /**
   * Welch's t-test (two-sample, unequal variance).
   * Returns approximate p-value.
   */
  private welchTTest(sample1: number[], sample2: number[]): number {
    const n1 = sample1.length;
    const n2 = sample2.length;
    if (n1 < 2 || n2 < 2) return 1;

    const m1 = this.mean(sample1);
    const m2 = this.mean(sample2);
    const v1 = this.variance(sample1);
    const v2 = this.variance(sample2);

    const se = Math.sqrt(v1 / n1 + v2 / n2);
    if (se === 0) return 1;

    const t = Math.abs(m1 - m2) / se;

    // Welch-Satterthwaite degrees of freedom
    const num = (v1 / n1 + v2 / n2) ** 2;
    const den = (v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1);
    const df = num / den;

    // Approximate p-value using t-distribution (normal approximation for large df)
    return this.tDistPValue(t, df);
  }

  /**
   * Approximate p-value from t-distribution.
   * Uses the approximation from Abramowitz & Stegun.
   */
  private tDistPValue(t: number, df: number): number {
    // For large df, t ≈ normal
    if (df > 30) {
      // Standard normal CDF approximation
      const x = t;
      const a = 0.2316419;
      const b1 = 0.319381530;
      const b2 = -0.356563782;
      const b3 = 1.781477937;
      const b4 = -1.821255978;
      const b5 = 1.330274429;
      const k = 1 / (1 + a * Math.abs(x));
      const cdf = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-x * x / 2) *
        (b1 * k + b2 * k * k + b3 * k ** 3 + b4 * k ** 4 + b5 * k ** 5);
      return 2 * (1 - cdf); // Two-tailed
    }

    // For small df, use crude approximation
    // p ≈ 2 * (1 - regularizedBetaIncomplete)
    // Simplified: if t > 3 and df > 5, p < 0.01
    if (t > 3.0 && df > 5) return 0.005;
    if (t > 2.5 && df > 5) return 0.02;
    if (t > 2.0 && df > 5) return 0.05;
    if (t > 1.5 && df > 5) return 0.15;
    return 0.5;
  }

  private mean(arr: number[]): number {
    return arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
  }

  private variance(arr: number[]): number {
    if (arr.length < 2) return 0;
    const m = this.mean(arr);
    return arr.reduce((s, v) => s + (v - m) * (v - m), 0) / (arr.length - 1);
  }
}

// ---------------------------------------------------------------------------
// Experiment results type
// ---------------------------------------------------------------------------
export interface ExperimentResults {
  experimentId: string;
  status: ExperimentStatus;
  totalSamples: number;
  variants: Array<{
    id: string;
    name: string;
    sampleSize: number;
    avgRetention: number;
    avgCompletion: number;
    avgEngagement: number;
    isControl: boolean;
    isWinner: boolean;
  }>;
  winningVariantId?: string;
  isSignificant: boolean;
}
