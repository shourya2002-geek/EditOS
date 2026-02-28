// ============================================================================
// STEP 9 — PRODUCTION BACKEND: WEBSOCKET HANDLERS
// ============================================================================
// WebSocket upgrade routes for:
//   - Voice pipeline (real-time voice → command)
//   - Collaboration (CRDT sync, presence, script board)
//   - Render progress (live progress updates)
// ============================================================================

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { VoicePipeline } from '../../core/voice/voicePipeline.js';
import { VoiceWebSocketHandler } from '../../core/voice/voiceWebSocket.js';
import { CollaborationManager } from '../../core/collaboration/collaborationEngine.js';
import { CollaborationWebSocketHandler } from '../../core/collaboration/collaborationWebSocket.js';
import { RenderQueue } from '../../core/video/renderQueue.js';

// ---------------------------------------------------------------------------
// Voice WebSocket
// ---------------------------------------------------------------------------
export function registerVoiceWebSocket(
  app: FastifyInstance,
  voicePipeline: VoicePipeline,
): void {
  const voiceHandler = new VoiceWebSocketHandler(voicePipeline);

  app.get('/ws/voice', { websocket: true }, (socket: any, req: FastifyRequest) => {
    const creatorId = (req as any).creatorId ?? 'anonymous';
    const sessionId = (req.query as any)?.sessionId ?? `sess_${Date.now()}`;
    app.log.info({ creatorId }, 'Voice WebSocket connected');

    voiceHandler.handleConnection(socket, sessionId, creatorId);

    socket.on('close', () => {
      app.log.info({ creatorId }, 'Voice WebSocket disconnected');
    });
  });
}

// ---------------------------------------------------------------------------
// Collaboration WebSocket
// ---------------------------------------------------------------------------
export function registerCollabWebSocket(
  app: FastifyInstance,
  collabManager: CollaborationManager,
): void {
  const collabHandler = new CollaborationWebSocketHandler(collabManager);

  app.get('/ws/collab', { websocket: true }, (socket: any, req: FastifyRequest) => {
    const creatorId = (req as any).creatorId ?? 'anonymous';
    app.log.info({ creatorId }, 'Collaboration WebSocket connected');

    collabHandler.handleConnection(socket);

    socket.on('close', () => {
      app.log.info({ creatorId }, 'Collaboration WebSocket disconnected');
    });
  });
}

// ---------------------------------------------------------------------------
// Render progress WebSocket
// ---------------------------------------------------------------------------
export function registerRenderProgressWebSocket(
  app: FastifyInstance,
  renderQueue: RenderQueue,
): void {
  const subscriptions = new Map<any, Set<string>>(); // socket → Set<jobIds>

  app.get('/ws/render', { websocket: true }, (socket: any, req: FastifyRequest) => {
    const creatorId = (req as any).creatorId ?? 'anonymous';
    app.log.info({ creatorId }, 'Render progress WebSocket connected');

    subscriptions.set(socket, new Set());

    socket.on('message', (data: string | Buffer) => {
      try {
        const msg = JSON.parse(typeof data === 'string' ? data : data.toString());

        if (msg.type === 'subscribe' && msg.jobId) {
          subscriptions.get(socket)?.add(msg.jobId);
          socket.send(JSON.stringify({ type: 'subscribed', jobId: msg.jobId }));
        }

        if (msg.type === 'unsubscribe' && msg.jobId) {
          subscriptions.get(socket)?.delete(msg.jobId);
        }
      } catch {
        socket.send(JSON.stringify({ type: 'error', error: 'Invalid message format' }));
      }
    });

    socket.on('close', () => {
      subscriptions.delete(socket);
      app.log.info({ creatorId }, 'Render progress WebSocket disconnected');
    });
  });

  // Forward render events to subscribed clients
  const events: Array<'job:progress' | 'job:completed' | 'job:failed'> = ['job:progress', 'job:completed', 'job:failed'];
  for (const event of events) {
    renderQueue.on(event, (job: any) => {
      const message = JSON.stringify({
        type: event.replace('job:', 'render_'),
        jobId: job.id,
        progress: job.progress,
        status: job.status,
        outputPath: job.outputPath,
        error: job.error,
      });

      for (const [socket, jobIds] of subscriptions) {
        if (jobIds.has(job.id)) {
          try { socket.send(message); } catch { /* dead connection */ }
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Register all WebSocket handlers
// ---------------------------------------------------------------------------
export function registerAllWebSockets(
  app: FastifyInstance,
  deps: {
    voicePipeline: VoicePipeline;
    collabManager: CollaborationManager;
    renderQueue: RenderQueue;
  },
): void {
  registerVoiceWebSocket(app, deps.voicePipeline);
  registerCollabWebSocket(app, deps.collabManager);
  registerRenderProgressWebSocket(app, deps.renderQueue);
}
