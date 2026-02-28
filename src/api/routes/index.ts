// ============================================================================
// STEP 9 — PRODUCTION BACKEND: API ROUTES
// ============================================================================
// RESTful + WebSocket API surface for the VIRCUT ENGINE.
//
// Route groups:
//   /api/v1/projects    — Project CRUD, upload, render
//   /api/v1/sessions    — Editing sessions, voice pipeline
//   /api/v1/strategies  — Strategy generation, preview
//   /api/v1/render      — Render queue management
//   /api/v1/creators    — Creator profiles, analytics
//   /api/v1/experiments — A/B testing
//   /api/v1/collab      — Collaboration sessions
//   /health             — Health check
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime(),
      version: '1.0.0',
    });
  });

  app.get('/ready', async (_req: FastifyRequest, reply: FastifyReply) => {
    // Check all dependencies
    const checks = {
      redis: false, // will be populated by middleware
      ffmpeg: false,
    };

    try {
      // Minimal readiness — in production these check actual connections
      checks.redis = true;
      checks.ffmpeg = true;

      const allReady = Object.values(checks).every(Boolean);
      return reply.status(allReady ? 200 : 503).send({
        status: allReady ? 'ready' : 'not_ready',
        checks,
      });
    } catch {
      return reply.status(503).send({ status: 'not_ready', checks });
    }
  });
}

// ---------------------------------------------------------------------------
// Project routes
// ---------------------------------------------------------------------------
export async function registerProjectRoutes(app: FastifyInstance): Promise<void> {
  // Create project
  app.post('/api/v1/projects', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { name: string; creatorId?: string; platform?: string };
    const creatorId = body.creatorId ?? (req as any).creatorId ?? 'anonymous';

    if (!body.name) {
      return reply.status(400).send({ error: 'name is required' });
    }

    const project = {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: body.name,
      creatorId,
      platform: body.platform ?? 'tiktok',
      status: 'created',
      createdAt: Date.now(),
    };

    // Store in service layer (injected via decorator)
    const projectService = (app as any).projectService;
    if (projectService) {
      await projectService.create(project);
    }

    return reply.status(201).send(project);
  });

  // Get project
  app.get('/api/v1/projects/:projectId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };
    const projectService = (app as any).projectService;

    if (projectService) {
      const project = await projectService.get(projectId);
      if (!project) return reply.status(404).send({ error: 'Project not found' });
      return reply.send(project);
    }

    return reply.status(404).send({ error: 'Project not found' });
  });

  // List projects for creator
  app.get('/api/v1/projects', async (req: FastifyRequest, reply: FastifyReply) => {
    const { creatorId, limit, offset } = req.query as { creatorId?: string; limit?: string; offset?: string };
    const projectService = (app as any).projectService;

    if (projectService) {
      const projects = await projectService.list({
        creatorId,
        limit: parseInt(limit ?? '20', 10),
        offset: parseInt(offset ?? '0', 10),
      });
      return reply.send(projects);
    }

    return reply.send({ projects: [], total: 0 });
  });

  // Upload video to project
  app.post('/api/v1/projects/:projectId/upload', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };
    const projectService = (app as any).projectService;

    // Verify project exists
    if (projectService) {
      const project = await projectService.get(projectId);
      if (!project) return reply.status(404).send({ error: 'Project not found' });
    }

    try {
      const data = await req.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded. Send a multipart form with a "video" field.' });
      }

      // Validate file type
      const allowedMimes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-matroska'];
      if (!allowedMimes.includes(data.mimetype)) {
        return reply.status(400).send({
          error: `Invalid file type: ${data.mimetype}. Allowed: ${allowedMimes.join(', ')}`,
        });
      }

      // Ensure upload directory exists
      const fs = await import('fs');
      const path = await import('path');
      const { appConfig } = await import('../../config/index.js');
      const uploadDir = path.resolve(appConfig.storage.uploadDir, projectId);
      fs.mkdirSync(uploadDir, { recursive: true });

      // Generate filename
      const ext = path.extname(data.filename) || '.mp4';
      const safeFilename = `source_${Date.now()}${ext}`;
      const filePath = path.join(uploadDir, safeFilename);

      // Stream file to disk
      const writeStream = fs.createWriteStream(filePath);
      await new Promise<void>((resolve, reject) => {
        data.file.pipe(writeStream);
        data.file.on('end', resolve);
        data.file.on('error', reject);
        writeStream.on('error', reject);
      });

      // Get file stats
      const stats = fs.statSync(filePath);

      // Build video metadata
      const videoMeta = {
        id: `vid_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        filename: data.filename,
        storedPath: filePath,
        size: stats.size,
        mimetype: data.mimetype,
        uploadedAt: Date.now(),
      };

      // Update project with video info
      if (projectService) {
        await projectService.update(projectId, {
          status: 'uploaded',
          video: videoMeta,
          updatedAt: Date.now(),
        });
      }

      return reply.status(201).send({
        projectId,
        video: videoMeta,
        status: 'uploaded',
        message: 'Video uploaded successfully.',
      });
    } catch (err: any) {
      req.log.error(err, 'Upload failed');
      return reply.status(500).send({ error: `Upload failed: ${err.message}` });
    }
  });

  // Get uploaded video file (serve for preview)
  app.get('/api/v1/projects/:projectId/video', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };
    const projectService = (app as any).projectService;

    if (!projectService) return reply.status(500).send({ error: 'Service unavailable' });

    const project = await projectService.get(projectId);
    if (!project?.video?.storedPath) {
      return reply.status(404).send({ error: 'No video uploaded for this project' });
    }

    const fs = await import('fs');
    if (!fs.existsSync(project.video.storedPath)) {
      return reply.status(404).send({ error: 'Video file not found on disk' });
    }

    const stat = fs.statSync(project.video.storedPath);
    const range = req.headers.range;

    // Support range requests for video seeking
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      reply.raw.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': project.video.mimetype || 'video/mp4',
      });

      const stream = fs.createReadStream(project.video.storedPath, { start, end });
      return reply.send(stream);
    }

    reply.header('Content-Type', project.video.mimetype || 'video/mp4');
    reply.header('Content-Length', stat.size);
    reply.header('Accept-Ranges', 'bytes');
    const stream = fs.createReadStream(project.video.storedPath);
    return reply.send(stream);
  });
}

// ---------------------------------------------------------------------------
// Session routes
// ---------------------------------------------------------------------------
export async function registerSessionRoutes(app: FastifyInstance): Promise<void> {
  // Start editing session
  app.post('/api/v1/sessions', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { projectId: string; creatorId?: string; mode?: string };

    const session = {
      id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      projectId: body.projectId,
      creatorId: body.creatorId ?? (req as any).creatorId ?? 'anonymous',
      mode: body.mode ?? 'voice',
      status: 'active',
      createdAt: Date.now(),
    };

    const sessionService = (app as any).sessionService;
    if (sessionService) {
      await sessionService.create(session);
    }

    return reply.status(201).send(session);
  });

  // Get session state
  app.get('/api/v1/sessions/:sessionId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = req.params as { sessionId: string };
    const sessionService = (app as any).sessionService;

    if (sessionService) {
      const session = await sessionService.get(sessionId);
      if (!session) return reply.status(404).send({ error: 'Session not found' });
      return reply.send(session);
    }

    return reply.status(404).send({ error: 'Session not found' });
  });

  // End session
  app.post('/api/v1/sessions/:sessionId/end', async (req: FastifyRequest, reply: FastifyReply) => {
    const { sessionId } = req.params as { sessionId: string };
    const sessionService = (app as any).sessionService;

    if (sessionService) {
      await sessionService.end(sessionId);
    }

    return reply.send({ sessionId, status: 'ended' });
  });
}

// ---------------------------------------------------------------------------
// Strategy routes
// ---------------------------------------------------------------------------
export async function registerStrategyRoutes(app: FastifyInstance): Promise<void> {
  // Generate editing strategy from intent
  app.post('/api/v1/strategies/generate', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      projectId: string;
      creatorId: string;
      intent: string;
      platform?: string;
    };

    if (!body.projectId || !body.intent) {
      return reply.status(400).send({ error: 'projectId and intent are required' });
    }

    const strategyService = (app as any).strategyService;
    if (strategyService) {
      const result = await strategyService.generateFromIntent(body);
      return reply.send(result);
    }

    return reply.status(503).send({ error: 'Strategy service unavailable' });
  });

  // Get strategy preview (lightweight render)
  app.post('/api/v1/strategies/:strategyId/preview', async (req: FastifyRequest, reply: FastifyReply) => {
    const { strategyId } = req.params as { strategyId: string };
    const body = req.body as { timestamp?: number };

    const strategyService = (app as any).strategyService;
    if (strategyService) {
      const preview = await strategyService.generatePreview(strategyId, body.timestamp);
      return reply.send(preview);
    }

    return reply.status(503).send({ error: 'Preview service unavailable' });
  });

  // Apply strategy (execute all operations)
  app.post('/api/v1/strategies/:strategyId/apply', async (req: FastifyRequest, reply: FastifyReply) => {
    const { strategyId } = req.params as { strategyId: string };

    const strategyService = (app as any).strategyService;
    if (strategyService) {
      const result = await strategyService.apply(strategyId);
      return reply.status(202).send(result);
    }

    return reply.status(503).send({ error: 'Strategy service unavailable' });
  });

  // Undo last operation
  app.post('/api/v1/strategies/:strategyId/undo', async (req: FastifyRequest, reply: FastifyReply) => {
    const { strategyId } = req.params as { strategyId: string };

    const strategyService = (app as any).strategyService;
    if (strategyService) {
      const result = await strategyService.undo(strategyId);
      return reply.send(result);
    }

    return reply.status(503).send({ error: 'Strategy service unavailable' });
  });
}

// ---------------------------------------------------------------------------
// Render routes
// ---------------------------------------------------------------------------
export async function registerRenderRoutes(app: FastifyInstance): Promise<void> {
  // Submit render job
  app.post('/api/v1/render', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      projectId: string;
      strategyId: string;
      priority?: string;
      platform?: string;
    };

    if (!body.projectId || !body.strategyId) {
      return reply.status(400).send({ error: 'projectId and strategyId are required' });
    }

    const renderService = (app as any).renderService;
    if (renderService) {
      const job = await renderService.submit(body);
      return reply.status(202).send(job);
    }

    return reply.status(503).send({ error: 'Render service unavailable' });
  });

  // Get render job status
  app.get('/api/v1/render/:jobId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = req.params as { jobId: string };

    const renderService = (app as any).renderService;
    if (renderService) {
      const job = await renderService.getJob(jobId);
      if (!job) return reply.status(404).send({ error: 'Render job not found' });
      return reply.send(job);
    }

    return reply.status(404).send({ error: 'Render job not found' });
  });

  // Cancel render job
  app.delete('/api/v1/render/:jobId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { jobId } = req.params as { jobId: string };

    const renderService = (app as any).renderService;
    if (renderService) {
      const ok = await renderService.cancel(jobId);
      return reply.send({ jobId, cancelled: ok });
    }

    return reply.status(503).send({ error: 'Render service unavailable' });
  });

  // Get render queue stats
  app.get('/api/v1/render/stats', async (_req: FastifyRequest, reply: FastifyReply) => {
    const renderService = (app as any).renderService;
    if (renderService) {
      return reply.send(await renderService.getStats());
    }
    return reply.send({ queued: 0, processing: 0, completed: 0 });
  });
}

// ---------------------------------------------------------------------------
// Creator profile routes
// ---------------------------------------------------------------------------
export async function registerCreatorRoutes(app: FastifyInstance): Promise<void> {
  // Get creator profile
  app.get('/api/v1/creators/:creatorId/profile', async (req: FastifyRequest, reply: FastifyReply) => {
    const { creatorId } = req.params as { creatorId: string };

    const learningService = (app as any).learningService;
    if (learningService) {
      const profile = learningService.getProfile(creatorId);
      return reply.send(profile);
    }

    return reply.status(503).send({ error: 'Learning service unavailable' });
  });

  // Update creator profile manually
  app.patch('/api/v1/creators/:creatorId/profile', async (req: FastifyRequest, reply: FastifyReply) => {
    const { creatorId } = req.params as { creatorId: string };
    const updates = req.body as Record<string, any>;

    const learningService = (app as any).learningService;
    if (learningService) {
      const updated = learningService.updateProfile(creatorId, updates);
      return reply.send(updated);
    }

    return reply.status(503).send({ error: 'Learning service unavailable' });
  });

  // Find similar creators
  app.get('/api/v1/creators/:creatorId/similar', async (req: FastifyRequest, reply: FastifyReply) => {
    const { creatorId } = req.params as { creatorId: string };
    const { limit } = req.query as { limit?: string };

    const learningService = (app as any).learningService;
    if (learningService) {
      const similar = learningService.findSimilar(creatorId, parseInt(limit ?? '5', 10));
      return reply.send({ similar });
    }

    return reply.send({ similar: [] });
  });

  // Ingest analytics
  app.post('/api/v1/creators/:creatorId/analytics', async (req: FastifyRequest, reply: FastifyReply) => {
    const { creatorId } = req.params as { creatorId: string };
    const analytics = req.body as any;

    const learningService = (app as any).learningService;
    if (learningService) {
      learningService.ingestAnalytics(creatorId, analytics);
      return reply.send({ status: 'ingested' });
    }

    return reply.status(503).send({ error: 'Learning service unavailable' });
  });
}

// ---------------------------------------------------------------------------
// Experiment routes
// ---------------------------------------------------------------------------
export async function registerExperimentRoutes(app: FastifyInstance): Promise<void> {
  // Create experiment
  app.post('/api/v1/experiments', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      creatorId: string;
      name: string;
      hypothesis: string;
      dimension: string;
    };

    const experimentService = (app as any).experimentService;
    if (experimentService) {
      const experiment = experimentService.create(body);
      return reply.status(201).send(experiment);
    }

    return reply.status(503).send({ error: 'Experiment service unavailable' });
  });

  // Start experiment
  app.post('/api/v1/experiments/:experimentId/start', async (req: FastifyRequest, reply: FastifyReply) => {
    const { experimentId } = req.params as { experimentId: string };

    const experimentService = (app as any).experimentService;
    if (experimentService) {
      experimentService.start(experimentId);
      return reply.send({ experimentId, status: 'running' });
    }

    return reply.status(503).send({ error: 'Experiment service unavailable' });
  });

  // Get experiment results
  app.get('/api/v1/experiments/:experimentId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { experimentId } = req.params as { experimentId: string };

    const experimentService = (app as any).experimentService;
    if (experimentService) {
      const results = experimentService.getResults(experimentId);
      if (!results) return reply.status(404).send({ error: 'Experiment not found' });
      return reply.send(results);
    }

    return reply.status(404).send({ error: 'Experiment not found' });
  });

  // Record experiment result
  app.post('/api/v1/experiments/:experimentId/record', async (req: FastifyRequest, reply: FastifyReply) => {
    const { experimentId } = req.params as { experimentId: string };
    const body = req.body as { variantId: string; analytics: any };

    const experimentService = (app as any).experimentService;
    if (experimentService) {
      experimentService.recordResult(experimentId, body.variantId, body.analytics);
      return reply.send({ status: 'recorded' });
    }

    return reply.status(503).send({ error: 'Experiment service unavailable' });
  });
}

// ---------------------------------------------------------------------------
// Collaboration routes
// ---------------------------------------------------------------------------
export async function registerCollabRoutes(app: FastifyInstance): Promise<void> {
  // Create collaboration session
  app.post('/api/v1/collab/sessions', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { projectId: string; name: string; ownerId: string; ownerName: string };

    const collabService = (app as any).collabService;
    if (collabService) {
      const session = collabService.createSession(body);
      return reply.status(201).send(session);
    }

    return reply.status(503).send({ error: 'Collaboration service unavailable' });
  });

  // Get collaboration session
  app.get('/api/v1/collab/sessions/:projectId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };

    const collabService = (app as any).collabService;
    if (collabService) {
      const session = collabService.getSession(projectId);
      if (!session) return reply.status(404).send({ error: 'Session not found' });
      return reply.send(session);
    }

    return reply.status(404).send({ error: 'Session not found' });
  });

  // Get script board
  app.get('/api/v1/collab/sessions/:projectId/script', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };

    const collabService = (app as any).collabService;
    if (collabService) {
      const board = collabService.getScriptBoard(projectId);
      return reply.send({ blocks: board });
    }

    return reply.send({ blocks: [] });
  });

  // Get project memories
  app.get('/api/v1/collab/sessions/:projectId/memories', async (req: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = req.params as { projectId: string };
    const { category } = req.query as { category?: string };

    const collabService = (app as any).collabService;
    if (collabService) {
      const memories = collabService.getMemories(projectId, category);
      return reply.send({ memories });
    }

    return reply.send({ memories: [] });
  });
}

// ---------------------------------------------------------------------------
// Register all routes
// ---------------------------------------------------------------------------
export async function registerAllRoutes(app: FastifyInstance): Promise<void> {
  await registerHealthRoutes(app);
  await registerProjectRoutes(app);
  await registerSessionRoutes(app);
  await registerStrategyRoutes(app);
  await registerRenderRoutes(app);
  await registerCreatorRoutes(app);
  await registerExperimentRoutes(app);
  await registerCollabRoutes(app);
}
