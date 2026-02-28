// ============================================================================
// STEP 7 — CREATOR LAB: COLLABORATION ENGINE
// ============================================================================
// Real-time multiplayer collaboration features:
//   - CRDT-based shared document state (Y.js)
//   - Shared script board for brainstorming
//   - Project session management
//   - Presence & cursor awareness
//   - Version history with named checkpoints
//   - Project memory (persistent context per creator)
// ============================================================================

import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type CollaboratorRole = 'owner' | 'editor' | 'viewer' | 'ai_agent';

export interface Collaborator {
  id: string;
  name: string;
  role: CollaboratorRole;
  color: string;
  cursor?: { position: number; selection?: [number, number] };
  isOnline: boolean;
  lastActive: number;
}

export interface ProjectSession {
  projectId: string;
  name: string;
  ownerId: string;
  collaborators: Map<string, Collaborator>;
  createdAt: number;
  updatedAt: number;
  state: 'active' | 'archived' | 'deleted';
}

export interface VersionCheckpoint {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: number;
  snapshot: Uint8Array; // Y.js encoded state
}

export interface ScriptBlock {
  id: string;
  type: 'hook' | 'body' | 'cta' | 'note' | 'ai_suggestion';
  content: string;
  author: string;
  timestamp: number;
  reactions: Map<string, string[]>; // emoji → userId[]
  resolved: boolean;
}

export interface ProjectMemoryEntry {
  id: string;
  projectId: string;
  creatorId: string;
  category: 'preference' | 'feedback' | 'lesson' | 'style_note' | 'performance_insight';
  content: string;
  source: 'user' | 'ai' | 'analytics';
  confidence: number;
  createdAt: number;
  expiresAt?: number;
}

// ---------------------------------------------------------------------------
// CRDT Document Manager (Y.js abstraction)
// ---------------------------------------------------------------------------
export class CRDTDocumentManager {
  private documents = new Map<string, CRDTDocument>();

  /**
   * Get or create a shared document for a project.
   */
  getDocument(projectId: string): CRDTDocument {
    let doc = this.documents.get(projectId);
    if (!doc) {
      doc = new CRDTDocument(projectId);
      this.documents.set(projectId, doc);
    }
    return doc;
  }

  /**
   * Destroy a document and free resources.
   */
  destroyDocument(projectId: string): void {
    const doc = this.documents.get(projectId);
    if (doc) {
      doc.destroy();
      this.documents.delete(projectId);
    }
  }

  /**
   * Get all active document IDs.
   */
  getActiveDocuments(): string[] {
    return Array.from(this.documents.keys());
  }
}

// ---------------------------------------------------------------------------
// CRDT Document
// ---------------------------------------------------------------------------
// In production, this wraps Y.Doc from y-js. We define the interface here
// and the Y.js binding separately to keep the collaboration logic testable.
// ---------------------------------------------------------------------------
export class CRDTDocument {
  private emitter = new EventEmitter();
  private state = new Map<string, any>();
  private history: Array<{ key: string; oldValue: any; newValue: any; timestamp: number }> = [];

  constructor(public readonly projectId: string) {}

  /**
   * Get a shared map (like Y.Map).
   */
  getMap<T>(name: string): Map<string, T> {
    if (!this.state.has(name)) {
      this.state.set(name, new Map<string, T>());
    }
    return this.state.get(name) as Map<string, T>;
  }

  /**
   * Get a shared array (like Y.Array).
   */
  getArray<T>(name: string): T[] {
    if (!this.state.has(name)) {
      this.state.set(name, [] as T[]);
    }
    return this.state.get(name) as T[];
  }

  /**
   * Get shared text (like Y.Text).
   */
  getText(name: string): SharedText {
    if (!this.state.has(name)) {
      this.state.set(name, new SharedText());
    }
    return this.state.get(name) as SharedText;
  }

  /**
   * Apply a binary update (from another peer).
   */
  applyUpdate(update: Uint8Array): void {
    // In production: Y.applyUpdate(this.doc, update)
    this.emitter.emit('update', update);
  }

  /**
   * Encode the current state for snapshots.
   */
  encodeState(): Uint8Array {
    // In production: Y.encodeStateAsUpdate(this.doc)
    const json = JSON.stringify(Array.from(this.state.entries()));
    return new TextEncoder().encode(json);
  }

  /**
   * Subscribe to updates for replication.
   */
  onUpdate(handler: (update: Uint8Array) => void): void {
    this.emitter.on('update', handler);
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    this.emitter.removeAllListeners();
    this.state.clear();
    this.history = [];
  }
}

// ---------------------------------------------------------------------------
// SharedText (Y.Text abstraction)
// ---------------------------------------------------------------------------
export class SharedText {
  private content = '';
  private emitter = new EventEmitter();

  insert(index: number, text: string): void {
    this.content = this.content.slice(0, index) + text + this.content.slice(index);
    this.emitter.emit('change', { type: 'insert', index, text });
  }

  delete(index: number, length: number): void {
    const deleted = this.content.slice(index, index + length);
    this.content = this.content.slice(0, index) + this.content.slice(index + length);
    this.emitter.emit('change', { type: 'delete', index, length, deleted });
  }

  toString(): string {
    return this.content;
  }

  get length(): number {
    return this.content.length;
  }

  onChange(handler: (delta: any) => void): void {
    this.emitter.on('change', handler);
  }
}

// ---------------------------------------------------------------------------
// Collaboration Session Manager
// ---------------------------------------------------------------------------
export class CollaborationManager {
  private sessions = new Map<string, ProjectSession>();
  private crdtManager = new CRDTDocumentManager();
  private memories = new Map<string, ProjectMemoryEntry[]>(); // projectId → entries
  private checkpoints = new Map<string, VersionCheckpoint[]>(); // projectId → checkpoints
  private emitter = new EventEmitter();

  // --- Session management ---

  /**
   * Create a new project session.
   */
  createSession(projectId: string, name: string, owner: Collaborator): ProjectSession {
    const session: ProjectSession = {
      projectId,
      name,
      ownerId: owner.id,
      collaborators: new Map([[owner.id, owner]]),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      state: 'active',
    };

    this.sessions.set(projectId, session);
    this.emitter.emit('session:created', session);
    return session;
  }

  /**
   * Join an existing session.
   */
  joinSession(projectId: string, collaborator: Collaborator): ProjectSession | null {
    const session = this.sessions.get(projectId);
    if (!session || session.state !== 'active') return null;

    collaborator.isOnline = true;
    collaborator.lastActive = Date.now();
    session.collaborators.set(collaborator.id, collaborator);
    session.updatedAt = Date.now();

    // Get the CRDT document and sync
    const doc = this.crdtManager.getDocument(projectId);

    this.emitter.emit('session:joined', { session, collaborator });
    return session;
  }

  /**
   * Leave a session.
   */
  leaveSession(projectId: string, userId: string): void {
    const session = this.sessions.get(projectId);
    if (!session) return;

    const collaborator = session.collaborators.get(userId);
    if (collaborator) {
      collaborator.isOnline = false;
      collaborator.lastActive = Date.now();
    }

    // If all collaborators are offline, archive after timeout
    const anyOnline = Array.from(session.collaborators.values()).some(c => c.isOnline);
    if (!anyOnline) {
      // Schedule archive after 30 minutes of inactivity
      setTimeout(() => {
        const current = this.sessions.get(projectId);
        if (current) {
          const stillOffline = Array.from(current.collaborators.values()).every(c => !c.isOnline);
          if (stillOffline) {
            this.archiveSession(projectId);
          }
        }
      }, 30 * 60 * 1000);
    }

    this.emitter.emit('session:left', { projectId, userId });
  }

  /**
   * Archive a session.
   */
  archiveSession(projectId: string): void {
    const session = this.sessions.get(projectId);
    if (!session) return;
    session.state = 'archived';
    this.crdtManager.destroyDocument(projectId);
    this.emitter.emit('session:archived', session);
  }

  /**
   * Get session info.
   */
  getSession(projectId: string): ProjectSession | undefined {
    return this.sessions.get(projectId);
  }

  // --- Script board ---

  /**
   * Get the shared script board for a project.
   */
  getScriptBoard(projectId: string): ScriptBlock[] {
    const doc = this.crdtManager.getDocument(projectId);
    return doc.getArray<ScriptBlock>('scriptBoard');
  }

  /**
   * Add a block to the script board.
   */
  addScriptBlock(projectId: string, block: ScriptBlock): void {
    const doc = this.crdtManager.getDocument(projectId);
    const board = doc.getArray<ScriptBlock>('scriptBoard');
    board.push(block);
    this.emitter.emit('script:block_added', { projectId, block });
  }

  /**
   * Update a script block's content.
   */
  updateScriptBlock(projectId: string, blockId: string, content: string): void {
    const board = this.getScriptBoard(projectId);
    const block = board.find(b => b.id === blockId);
    if (block) {
      block.content = content;
      block.timestamp = Date.now();
      this.emitter.emit('script:block_updated', { projectId, blockId, content });
    }
  }

  /**
   * React to a script block.
   */
  reactToBlock(projectId: string, blockId: string, userId: string, emoji: string): void {
    const board = this.getScriptBoard(projectId);
    const block = board.find(b => b.id === blockId);
    if (block) {
      if (!block.reactions.has(emoji)) {
        block.reactions.set(emoji, []);
      }
      const users = block.reactions.get(emoji)!;
      if (!users.includes(userId)) {
        users.push(userId);
      }
      this.emitter.emit('script:reaction', { projectId, blockId, userId, emoji });
    }
  }

  // --- Presence ---

  /**
   * Update a collaborator's cursor position.
   */
  updateCursor(projectId: string, userId: string, position: number, selection?: [number, number]): void {
    const session = this.sessions.get(projectId);
    if (!session) return;

    const collaborator = session.collaborators.get(userId);
    if (collaborator) {
      collaborator.cursor = { position, selection };
      collaborator.lastActive = Date.now();
      this.emitter.emit('presence:cursor', { projectId, userId, position, selection });
    }
  }

  /**
   * Get all online collaborators for a project.
   */
  getOnlineCollaborators(projectId: string): Collaborator[] {
    const session = this.sessions.get(projectId);
    if (!session) return [];
    return Array.from(session.collaborators.values()).filter(c => c.isOnline);
  }

  // --- Version history ---

  /**
   * Create a named checkpoint.
   */
  createCheckpoint(projectId: string, name: string, description: string | undefined, userId: string): VersionCheckpoint {
    const doc = this.crdtManager.getDocument(projectId);
    const checkpoint: VersionCheckpoint = {
      id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      projectId,
      name,
      description,
      createdBy: userId,
      createdAt: Date.now(),
      snapshot: doc.encodeState(),
    };

    if (!this.checkpoints.has(projectId)) {
      this.checkpoints.set(projectId, []);
    }
    this.checkpoints.get(projectId)!.push(checkpoint);

    this.emitter.emit('version:checkpoint', checkpoint);
    return checkpoint;
  }

  /**
   * List checkpoints for a project.
   */
  getCheckpoints(projectId: string): VersionCheckpoint[] {
    return this.checkpoints.get(projectId) ?? [];
  }

  /**
   * Restore to a checkpoint.
   */
  restoreCheckpoint(projectId: string, checkpointId: string): boolean {
    const checkpoints = this.checkpoints.get(projectId);
    if (!checkpoints) return false;

    const checkpoint = checkpoints.find(c => c.id === checkpointId);
    if (!checkpoint) return false;

    const doc = this.crdtManager.getDocument(projectId);
    doc.applyUpdate(checkpoint.snapshot);

    this.emitter.emit('version:restored', { projectId, checkpointId });
    return true;
  }

  // --- Project memory ---

  /**
   * Store a memory entry for a project.
   * Project memory accumulates context that the AI uses for future edits.
   */
  addMemory(entry: ProjectMemoryEntry): void {
    const key = entry.projectId;
    if (!this.memories.has(key)) {
      this.memories.set(key, []);
    }
    this.memories.get(key)!.push(entry);

    // Prune expired entries
    const now = Date.now();
    const entries = this.memories.get(key)!;
    const valid = entries.filter(e => !e.expiresAt || e.expiresAt > now);
    this.memories.set(key, valid);

    this.emitter.emit('memory:added', entry);
  }

  /**
   * Retrieve memories for a project, optionally filtered by category.
   */
  getMemories(
    projectId: string,
    category?: ProjectMemoryEntry['category'],
  ): ProjectMemoryEntry[] {
    const entries = this.memories.get(projectId) ?? [];
    if (category) return entries.filter(e => e.category === category);
    return entries;
  }

  /**
   * Build a context string from project memories for LLM consumption.
   */
  buildMemoryContext(projectId: string): string {
    const entries = this.getMemories(projectId);
    if (entries.length === 0) return '';

    const grouped = new Map<string, ProjectMemoryEntry[]>();
    for (const entry of entries) {
      if (!grouped.has(entry.category)) grouped.set(entry.category, []);
      grouped.get(entry.category)!.push(entry);
    }

    const sections: string[] = [];
    for (const [category, items] of grouped) {
      const lines = items
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10) // Top 10 per category
        .map(e => `  - [${e.source}] ${e.content} (confidence: ${e.confidence.toFixed(2)})`);
      sections.push(`${category.toUpperCase()}:\n${lines.join('\n')}`);
    }

    return `PROJECT MEMORY (${entries.length} entries):\n${sections.join('\n\n')}`;
  }

  // --- Events ---

  on(event: string, handler: (...args: any[]) => void): void {
    this.emitter.on(event, handler);
  }
}
