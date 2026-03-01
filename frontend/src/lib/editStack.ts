// ============================================================================
// CLIENT EDIT STACK — Non-destructive operation management
// ============================================================================
// Each AI command (chat or voice) produces an EditCommit.
// The stack replays commits with conflict resolution to produce a single
// effective operation set. Creators can undo/redo, toggle individual commits
// on/off, and reset everything.
//
// Conflict rules:
//   replace_global   — Last commit of this type wins (speed, volume, color…)
//   replace_overlap  — Replaces only if time ranges overlap (zoom, trim…)
//   stack            — Multiple can coexist (caption, cut, sfx…)
// ============================================================================

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface EditOperation {
  type: string;
  startMs?: number;
  endMs?: number;
  params?: Record<string, any>;
  description?: string;
  // Computed by the editor — actual resolved time range
  _startMs?: number;
  _endMs?: number;
}

export interface EditCommit {
  id: string;
  timestamp: number;
  prompt: string;           // what the creator said
  strategyName?: string;    // short name from Mistral
  operations: EditOperation[];
  enabled: boolean;         // toggle on/off without deleting
}

// Conflict categories
export type ConflictRule = 'replace_global' | 'replace_overlap' | 'stack';

export const CONFLICT_RULES: Record<string, ConflictRule> = {
  // Global effects — last one wins entirely
  speed:          'replace_global',
  volume:         'replace_global',
  color_grade:    'replace_global',
  music:          'replace_global',
  fade_in:        'replace_global',
  fade_out:       'replace_global',
  silence_remove: 'replace_global',

  // Ranged effects — replace only if time ranges overlap
  zoom:           'replace_overlap',
  trim_start:     'replace_overlap',
  trim_end:       'replace_overlap',

  // Stackable — multiple can coexist at different times
  cut:            'stack',
  caption:        'stack',
  sfx:            'stack',
  split:          'stack',
};

// ---------------------------------------------------------------------------
// EditStack engine
// ---------------------------------------------------------------------------
export class ClientEditStack {
  private commits: EditCommit[] = [];
  private listeners: Array<() => void> = [];

  // Snapshot caches — must be referentially stable for useSyncExternalStore
  private _cachedEffective: EditOperation[] = [];
  private _cachedCommits: readonly EditCommit[] = [];
  private _cachedCanUndo = false;
  private _cachedCanRedo = false;

  // ---- Subscription (React integration) ---------------------------------

  /** Subscribe to changes. Returns unsubscribe function. */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter(l => l !== fn);
    };
  };

  private recomputeCache(): void {
    this._cachedEffective = this._computeEffectiveInternal();
    this._cachedCommits = [...this.commits];
    this._cachedCanUndo = this.commits.some(c => c.enabled);
    const lastEnabled = this.findLastEnabledIndex();
    this._cachedCanRedo = lastEnabled + 1 < this.commits.length && !this.commits[lastEnabled + 1]?.enabled;
  }

  private notify(): void {
    this.recomputeCache();
    for (const fn of this.listeners) fn();
  }

  // ---- Commit management ------------------------------------------------

  /** Push a new commit from AI response. */
  push(prompt: string, operations: EditOperation[], strategyName?: string): EditCommit {
    // Disable any commits that were previously undone (discard redo branch)
    // Actually — we keep all commits. Undo/redo toggles "enabled".
    // If user pushes new commit after undo, remove disabled tail.
    const lastEnabledIdx = this.findLastEnabledIndex();
    if (lastEnabledIdx < this.commits.length - 1) {
      // Trim redo tail — user made a new choice
      this.commits = this.commits.slice(0, lastEnabledIdx + 1);
    }

    const commit: EditCommit = {
      id: `ec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
      prompt,
      strategyName,
      operations,
      enabled: true,
    };
    this.commits.push(commit);
    this.notify();
    return commit;
  }

  /** Undo — disable the last enabled commit. */
  undo(): EditCommit | null {
    for (let i = this.commits.length - 1; i >= 0; i--) {
      if (this.commits[i].enabled) {
        this.commits[i].enabled = false;
        this.notify();
        return this.commits[i];
      }
    }
    return null;
  }

  /** Redo — re-enable the first disabled commit after the last enabled one. */
  redo(): EditCommit | null {
    const lastEnabled = this.findLastEnabledIndex();
    const nextIdx = lastEnabled + 1;
    if (nextIdx < this.commits.length && !this.commits[nextIdx].enabled) {
      this.commits[nextIdx].enabled = true;
      this.notify();
      return this.commits[nextIdx];
    }
    return null;
  }

  /** Toggle a specific commit on/off. */
  toggle(id: string): boolean {
    const commit = this.commits.find(c => c.id === id);
    if (!commit) return false;
    commit.enabled = !commit.enabled;
    this.notify();
    return commit.enabled;
  }

  /** Remove a specific commit entirely. */
  remove(id: string): void {
    this.commits = this.commits.filter(c => c.id !== id);
    this.notify();
  }

  /** Clear everything — reset to blank slate. */
  clearAll(): void {
    this.commits = [];
    this.notify();
  }

  /** Get all commits (for UI display). */
  getCommits = (): readonly EditCommit[] => {
    return this._cachedCommits;
  };

  /** Can undo? */
  getCanUndo = (): boolean => {
    return this._cachedCanUndo;
  };

  /** Can redo? */
  getCanRedo = (): boolean => {
    return this._cachedCanRedo;
  };

  // ---- Effective state computation --------------------------------------

  /**
   * Return the cached effective operations.
   * Stable reference — only changes after push/undo/redo/toggle/remove/clear.
   */
  computeEffective = (): EditOperation[] => {
    return this._cachedEffective;
  };

  /**
   * Internal: Replay the enabled commits with conflict resolution.
   * Returns the final set of non-conflicting operations.
   */
  private _computeEffectiveInternal(): EditOperation[] {
    const result: EditOperation[] = [];

    for (const commit of this.commits) {
      if (!commit.enabled) continue;

      for (const op of commit.operations) {
        const rule = CONFLICT_RULES[op.type] ?? 'stack';

        switch (rule) {
          case 'replace_global':
            // Remove all previous ops of this type
            for (let i = result.length - 1; i >= 0; i--) {
              if (result[i].type === op.type) result.splice(i, 1);
            }
            result.push(op);
            break;

          case 'replace_overlap':
            // Remove previous ops of this type with overlapping time ranges
            for (let i = result.length - 1; i >= 0; i--) {
              if (result[i].type !== op.type) continue;
              const s1 = result[i]._startMs ?? result[i].startMs ?? 0;
              const e1 = result[i]._endMs ?? result[i].endMs ?? Infinity;
              const s2 = op._startMs ?? op.startMs ?? 0;
              const e2 = op._endMs ?? op.endMs ?? Infinity;
              if (Math.max(s1, s2) < Math.min(e1, e2)) {
                result.splice(i, 1);
              }
            }
            result.push(op);
            break;

          case 'stack':
          default:
            result.push(op);
            break;
        }
      }
    }

    return result;
  }

  /**
   * Get the set of unique effect types from effective operations.
   */
  computeEffectTypes(): string[] {
    return [...new Set(this._cachedEffective.map(op => op.type))];
  }

  /**
   * Generate a human-readable summary.
   */
  summarize(): string {
    const ops = this._cachedEffective;
    if (ops.length === 0) return 'No edits applied.';
    return ops.map(op => `• ${op.description ?? op.type}`).join('\n');
  }

  // ---- Private helpers --------------------------------------------------

  private findLastEnabledIndex(): number {
    for (let i = this.commits.length - 1; i >= 0; i--) {
      if (this.commits[i].enabled) return i;
    }
    return -1;
  }
}
