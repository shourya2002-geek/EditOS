// ============================================================================
// VIRCUT ENGINE — MAIN ENTRY POINT
// ============================================================================
// Production server bootstrap:
//   1. Load config
//   2. Initialize core engines
//   3. Initialize services
//   4. Build Fastify app with middleware, routes, WebSocket
//   5. Start worker pool
//   6. Listen
// ============================================================================

import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyMultipart from '@fastify/multipart';
import { appConfig } from './config/index.js';

// Core engines
import { MistralClient } from './core/agents/mistralClient.js';
import { AgentRouter } from './core/agents/agentRouter.js';
import { OrchestratorAgent } from './core/agents/orchestratorAgent.js';
import {
  IntentInterpreterAgent,
  EditingStrategyAgent,
  CollaborationAgent,
  PublishingAgent,
} from './core/agents/specializedAgents.js';
import { VoicePipeline } from './core/voice/voicePipeline.js';
import { RenderQueue } from './core/video/renderQueue.js';
import { WorkerPool } from './core/video/renderWorker.js';
import type { HardwareProfile } from './core/video/ffmpegBuilder.js';
import { CollaborationManager } from './core/collaboration/collaborationEngine.js';
import { StyleProfileManager, StrategyAdaptationEngine } from './core/learning/styleProfile.js';
import { ExperimentEngine } from './core/learning/experimentEngine.js';

// Services
import {
  ProjectService,
  SessionService,
  StrategyService,
  RenderService,
  LearningService,
  CollabService,
  ExperimentService,
  MetricsService,
} from './services/index.js';

// API
import { registerAllMiddleware } from './api/middleware/index.js';
import { registerAllRoutes } from './api/routes/index.js';
import { registerAllWebSockets } from './api/websocket/index.js';

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const config = appConfig;

  // -----------------------------------------------------------------------
  // 1. Create Fastify instance
  // -----------------------------------------------------------------------
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
    },
    trustProxy: true,
  });

  // Register WebSocket support
  await app.register(fastifyWebsocket, {
    options: {
      maxPayload: 1_048_576, // 1MB max message
    },
  });

  // Register multipart support for file uploads
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB max file size
      files: 1,
    },
  });

  // -----------------------------------------------------------------------
  // 2. Initialize core engines
  // -----------------------------------------------------------------------
  const mistralClient = new MistralClient(config.mistral.apiKey, config.mistral.baseUrl);

  // Agent system
  const agentRouter = new AgentRouter();
  const orchestrator = new OrchestratorAgent(mistralClient);
  const intentAgent = new IntentInterpreterAgent(mistralClient);
  const strategyAgent = new EditingStrategyAgent(mistralClient);
  const collabAgent = new CollaborationAgent(mistralClient);
  const publishAgent = new PublishingAgent(mistralClient);

  agentRouter.registerAgent(orchestrator);
  agentRouter.registerAgent(intentAgent);
  agentRouter.registerAgent(strategyAgent);
  agentRouter.registerAgent(collabAgent);
  agentRouter.registerAgent(publishAgent);

  // Voice pipeline
  const voicePipeline = new VoicePipeline();

  // Render system
  const renderQueue = new RenderQueue(config.workers.renderConcurrency);
  const gpuVendor = detectGpuVendor();
  const hwProfile: HardwareProfile = {
    gpuAvailable: gpuVendor !== 'none',
    gpuType: gpuVendor !== 'none' ? gpuVendor : undefined,
    gpuVram: 4096,
    cpuCores: getCpuCores(),
    ramGb: 16,
  };
  const workerPool = new WorkerPool(renderQueue, hwProfile);

  // Collaboration
  const collabManager = new CollaborationManager();

  // Learning
  const profileManager = new StyleProfileManager();
  const experimentEngine = new ExperimentEngine();

  // -----------------------------------------------------------------------
  // 3. Initialize services
  // -----------------------------------------------------------------------
  const projectService = new ProjectService();
  const sessionService = new SessionService();
  const strategyService = new StrategyService(profileManager);
  const renderService = new RenderService(renderQueue, workerPool);
  const learningService = new LearningService(profileManager, experimentEngine);
  const collabService = new CollabService(collabManager);
  const experimentService = new ExperimentService(experimentEngine, profileManager);
  const metricsService = new MetricsService();

  // Decorate Fastify with services
  (app as any).projectService = projectService;
  (app as any).sessionService = sessionService;
  (app as any).strategyService = strategyService;
  (app as any).renderService = renderService;
  (app as any).learningService = learningService;
  (app as any).collabService = collabService;
  (app as any).experimentService = experimentService;
  (app as any).metricsService = metricsService;
  (app as any).agentRouter = agentRouter;

  // -----------------------------------------------------------------------
  // 4. Register middleware & routes
  // -----------------------------------------------------------------------
  await registerAllMiddleware(app);
  await registerAllRoutes(app);

  // -----------------------------------------------------------------------
  // 5. Register WebSocket handlers
  // -----------------------------------------------------------------------
  registerAllWebSockets(app, {
    voicePipeline,
    collabManager,
    renderQueue,
  });

  // -----------------------------------------------------------------------
  // 6. Start worker pool
  // -----------------------------------------------------------------------
  const workerCount = config.workers.renderConcurrency;
  workerPool.spawn(
    workerCount,
    config.storage.tempDir,
    config.storage.outputDir,
  );
  app.log.info(`Started ${workerCount} render workers`);

  // -----------------------------------------------------------------------
  // 7. Graceful shutdown
  // -----------------------------------------------------------------------
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}. Shutting down gracefully...`);

    // Stop accepting new connections
    await app.close();

    // Drain render workers
    await workerPool.shutdown();

    app.log.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Unhandled rejection safety net
  process.on('unhandledRejection', (err) => {
    app.log.error(err, 'Unhandled rejection');
  });

  // -----------------------------------------------------------------------
  // 8. Start listening
  // -----------------------------------------------------------------------
  const host = config.host;
  const port = config.port;

  await app.listen({ host, port });
  app.log.info(`🎬 VIRCUT ENGINE running at http://${host}:${port}`);
  app.log.info(`   Voice WebSocket:  ws://${host}:${port}/ws/voice`);
  app.log.info(`   Collab WebSocket: ws://${host}:${port}/ws/collab`);
  app.log.info(`   Render WebSocket: ws://${host}:${port}/ws/render`);
  app.log.info(`   API docs:         http://${host}:${port}/health`);
}

// ---------------------------------------------------------------------------
// Hardware detection helpers
// ---------------------------------------------------------------------------
function detectGpuVendor(): 'nvidia' | 'amd' | 'intel' | 'apple' | 'none' {
  if (process.platform === 'darwin') return 'apple';
  // In production: probe nvidia-smi, rocm-smi, vainfo
  return 'none';
}

function getCpuCores(): number {
  try {
    const os = require('os');
    return os.cpus().length;
  } catch {
    return 4;
  }
}

function detectEncoders(): string[] {
  const encoders = ['libx264', 'libx265', 'aac', 'libfdk_aac'];
  if (process.platform === 'darwin') {
    encoders.push('h264_videotoolbox', 'hevc_videotoolbox');
  }
  return encoders;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
