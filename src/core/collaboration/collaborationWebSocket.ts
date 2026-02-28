// ============================================================================
// STEP 7 — CREATOR LAB: COLLABORATION WEBSOCKET HANDLER
// ============================================================================
// WebSocket handler for real-time collaboration sessions.
// Bridges WebSocket connections to the CollaborationManager.
// Handles presence, script board updates, cursor sync, version ops.
// ============================================================================

import { EventEmitter } from 'events';
import {
  CollaborationManager,
  type Collaborator,
  type CollaboratorRole,
  type ScriptBlock,
  type ProjectMemoryEntry,
} from './collaborationEngine.js';

// ---------------------------------------------------------------------------
// Message protocol
// ---------------------------------------------------------------------------
export type CollabMessageType =
  | 'join_session'
  | 'leave_session'
  | 'cursor_update'
  | 'script_add_block'
  | 'script_update_block'
  | 'script_react'
  | 'create_checkpoint'
  | 'restore_checkpoint'
  | 'list_checkpoints'
  | 'add_memory'
  | 'get_memories'
  | 'get_collaborators'
  | 'crdt_update';

export interface CollabMessage {
  type: CollabMessageType;
  projectId: string;
  userId: string;
  payload: Record<string, any>;
}

export interface CollabResponse {
  type: string;
  success: boolean;
  payload?: Record<string, any>;
  error?: string;
}

// ---------------------------------------------------------------------------
// Collaboration WebSocket handler
// ---------------------------------------------------------------------------
export class CollaborationWebSocketHandler {
  private connections = new Map<string, Set<WebSocketLike>>(); // projectId → sockets
  private socketToUser = new Map<WebSocketLike, { userId: string; projectId: string }>();
  private emitter = new EventEmitter();

  constructor(private collab: CollaborationManager) {
    this.wireCollabEvents();
  }

  /**
   * Handle a new WebSocket connection.
   */
  handleConnection(ws: WebSocketLike): void {
    ws.on('message', (data: string | Buffer) => {
      try {
        const msg: CollabMessage = typeof data === 'string'
          ? JSON.parse(data)
          : JSON.parse(data.toString('utf-8'));

        this.handleMessage(ws, msg);
      } catch (err) {
        this.sendToSocket(ws, {
          type: 'error',
          success: false,
          error: 'Invalid message format',
        });
      }
    });

    ws.on('close', () => {
      this.handleDisconnect(ws);
    });
  }

  /**
   * Route an incoming message to the appropriate handler.
   */
  private handleMessage(ws: WebSocketLike, msg: CollabMessage): void {
    switch (msg.type) {
      case 'join_session':
        this.handleJoin(ws, msg);
        break;
      case 'leave_session':
        this.handleLeave(ws, msg);
        break;
      case 'cursor_update':
        this.handleCursorUpdate(ws, msg);
        break;
      case 'script_add_block':
        this.handleScriptAddBlock(ws, msg);
        break;
      case 'script_update_block':
        this.handleScriptUpdateBlock(ws, msg);
        break;
      case 'script_react':
        this.handleScriptReact(ws, msg);
        break;
      case 'create_checkpoint':
        this.handleCreateCheckpoint(ws, msg);
        break;
      case 'restore_checkpoint':
        this.handleRestoreCheckpoint(ws, msg);
        break;
      case 'list_checkpoints':
        this.handleListCheckpoints(ws, msg);
        break;
      case 'add_memory':
        this.handleAddMemory(ws, msg);
        break;
      case 'get_memories':
        this.handleGetMemories(ws, msg);
        break;
      case 'get_collaborators':
        this.handleGetCollaborators(ws, msg);
        break;
      case 'crdt_update':
        this.handleCRDTUpdate(ws, msg);
        break;
      default:
        this.sendToSocket(ws, {
          type: 'error',
          success: false,
          error: `Unknown message type: ${msg.type}`,
        });
    }
  }

  // --- Handlers ---

  private handleJoin(ws: WebSocketLike, msg: CollabMessage): void {
    const { projectId, userId, payload } = msg;
    const collaborator: Collaborator = {
      id: userId,
      name: payload.name ?? 'Anonymous',
      role: (payload.role ?? 'viewer') as CollaboratorRole,
      color: payload.color ?? this.generateColor(userId),
      isOnline: true,
      lastActive: Date.now(),
    };

    const session = this.collab.joinSession(projectId, collaborator);
    if (!session) {
      this.sendToSocket(ws, {
        type: 'join_session',
        success: false,
        error: 'Session not found or inactive',
      });
      return;
    }

    // Track connection
    if (!this.connections.has(projectId)) {
      this.connections.set(projectId, new Set());
    }
    this.connections.get(projectId)!.add(ws);
    this.socketToUser.set(ws, { userId, projectId });

    // Send success + current state
    this.sendToSocket(ws, {
      type: 'join_session',
      success: true,
      payload: {
        collaborators: Array.from(session.collaborators.values()),
        scriptBoard: this.collab.getScriptBoard(projectId),
      },
    });

    // Broadcast join to others
    this.broadcastToProject(projectId, {
      type: 'collaborator_joined',
      success: true,
      payload: { collaborator },
    }, ws);
  }

  private handleLeave(ws: WebSocketLike, msg: CollabMessage): void {
    this.doLeave(ws, msg.projectId, msg.userId);
  }

  private handleDisconnect(ws: WebSocketLike): void {
    const info = this.socketToUser.get(ws);
    if (info) {
      this.doLeave(ws, info.projectId, info.userId);
    }
  }

  private doLeave(ws: WebSocketLike, projectId: string, userId: string): void {
    this.collab.leaveSession(projectId, userId);
    const sockets = this.connections.get(projectId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) this.connections.delete(projectId);
    }
    this.socketToUser.delete(ws);

    this.broadcastToProject(projectId, {
      type: 'collaborator_left',
      success: true,
      payload: { userId },
    });
  }

  private handleCursorUpdate(ws: WebSocketLike, msg: CollabMessage): void {
    const { position, selection } = msg.payload;
    this.collab.updateCursor(msg.projectId, msg.userId, position, selection);
    // Presence updates are broadcast via collab events (wired below)
  }

  private handleScriptAddBlock(ws: WebSocketLike, msg: CollabMessage): void {
    const block: ScriptBlock = {
      id: `block_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: msg.payload.type ?? 'body',
      content: msg.payload.content ?? '',
      author: msg.userId,
      timestamp: Date.now(),
      reactions: new Map(),
      resolved: false,
    };
    this.collab.addScriptBlock(msg.projectId, block);
    this.sendToSocket(ws, { type: 'script_add_block', success: true, payload: { block } });
  }

  private handleScriptUpdateBlock(ws: WebSocketLike, msg: CollabMessage): void {
    this.collab.updateScriptBlock(msg.projectId, msg.payload.blockId, msg.payload.content);
    this.sendToSocket(ws, { type: 'script_update_block', success: true });
  }

  private handleScriptReact(ws: WebSocketLike, msg: CollabMessage): void {
    this.collab.reactToBlock(msg.projectId, msg.payload.blockId, msg.userId, msg.payload.emoji);
  }

  private handleCreateCheckpoint(ws: WebSocketLike, msg: CollabMessage): void {
    const checkpoint = this.collab.createCheckpoint(
      msg.projectId,
      msg.payload.name,
      msg.payload.description,
      msg.userId,
    );
    this.sendToSocket(ws, {
      type: 'create_checkpoint',
      success: true,
      payload: {
        id: checkpoint.id,
        name: checkpoint.name,
        createdAt: checkpoint.createdAt,
      },
    });
  }

  private handleRestoreCheckpoint(ws: WebSocketLike, msg: CollabMessage): void {
    const ok = this.collab.restoreCheckpoint(msg.projectId, msg.payload.checkpointId);
    this.sendToSocket(ws, {
      type: 'restore_checkpoint',
      success: ok,
      error: ok ? undefined : 'Checkpoint not found',
    });
  }

  private handleListCheckpoints(ws: WebSocketLike, msg: CollabMessage): void {
    const checkpoints = this.collab.getCheckpoints(msg.projectId);
    this.sendToSocket(ws, {
      type: 'list_checkpoints',
      success: true,
      payload: {
        checkpoints: checkpoints.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description,
          createdBy: c.createdBy,
          createdAt: c.createdAt,
        })),
      },
    });
  }

  private handleAddMemory(ws: WebSocketLike, msg: CollabMessage): void {
    const entry: ProjectMemoryEntry = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      projectId: msg.projectId,
      creatorId: msg.userId,
      category: msg.payload.category ?? 'feedback',
      content: msg.payload.content,
      source: msg.payload.source ?? 'user',
      confidence: msg.payload.confidence ?? 0.8,
      createdAt: Date.now(),
      expiresAt: msg.payload.expiresAt,
    };
    this.collab.addMemory(entry);
    this.sendToSocket(ws, { type: 'add_memory', success: true, payload: { id: entry.id } });
  }

  private handleGetMemories(ws: WebSocketLike, msg: CollabMessage): void {
    const memories = this.collab.getMemories(msg.projectId, msg.payload.category);
    this.sendToSocket(ws, {
      type: 'get_memories',
      success: true,
      payload: { memories },
    });
  }

  private handleGetCollaborators(ws: WebSocketLike, msg: CollabMessage): void {
    const collaborators = this.collab.getOnlineCollaborators(msg.projectId);
    this.sendToSocket(ws, {
      type: 'get_collaborators',
      success: true,
      payload: { collaborators },
    });
  }

  private handleCRDTUpdate(ws: WebSocketLike, msg: CollabMessage): void {
    // Relay CRDT updates to all other peers
    this.broadcastToProject(msg.projectId, {
      type: 'crdt_update',
      success: true,
      payload: msg.payload,
    }, ws);
  }

  // --- Utilities ---

  /**
   * Wire collaboration events to broadcast to all connected clients.
   */
  private wireCollabEvents(): void {
    this.collab.on('presence:cursor', (data: any) => {
      this.broadcastToProject(data.projectId, {
        type: 'cursor_update',
        success: true,
        payload: {
          userId: data.userId,
          position: data.position,
          selection: data.selection,
        },
      });
    });

    this.collab.on('script:block_added', (data: any) => {
      this.broadcastToProject(data.projectId, {
        type: 'script_block_added',
        success: true,
        payload: { block: data.block },
      });
    });

    this.collab.on('script:block_updated', (data: any) => {
      this.broadcastToProject(data.projectId, {
        type: 'script_block_updated',
        success: true,
        payload: { blockId: data.blockId, content: data.content },
      });
    });

    this.collab.on('script:reaction', (data: any) => {
      this.broadcastToProject(data.projectId, {
        type: 'script_reaction',
        success: true,
        payload: { blockId: data.blockId, userId: data.userId, emoji: data.emoji },
      });
    });

    this.collab.on('version:restored', (data: any) => {
      this.broadcastToProject(data.projectId, {
        type: 'checkpoint_restored',
        success: true,
        payload: { checkpointId: data.checkpointId },
      });
    });
  }

  private broadcastToProject(projectId: string, response: CollabResponse, exclude?: WebSocketLike): void {
    const sockets = this.connections.get(projectId);
    if (!sockets) return;
    const json = JSON.stringify(response);
    for (const ws of sockets) {
      if (ws !== exclude) {
        try { ws.send(json); } catch { /* ignore dead connections */ }
      }
    }
  }

  private sendToSocket(ws: WebSocketLike, response: CollabResponse): void {
    try {
      ws.send(JSON.stringify(response));
    } catch { /* ignore */ }
  }

  private generateColor(userId: string): string {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash;
    }
    return colors[Math.abs(hash) % colors.length];
  }
}

// ---------------------------------------------------------------------------
// WebSocket-like interface (compatible with ws library)
// ---------------------------------------------------------------------------
export interface WebSocketLike {
  on(event: string, handler: (...args: any[]) => void): void;
  send(data: string | Buffer): void;
  close(): void;
}
