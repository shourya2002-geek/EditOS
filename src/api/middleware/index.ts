// ============================================================================
// STEP 9 — PRODUCTION BACKEND: MIDDLEWARE
// ============================================================================
// Fastify middleware/hooks for:
//   - Authentication (API key / JWT placeholder)
//   - Request logging (latency tracking)
//   - Error handling
//   - Rate limiting per creator
//   - CORS configuration
// ============================================================================

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { appConfig } from '../../config/index.js';

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
export async function registerAuthMiddleware(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health endpoints
    if (req.url === '/health' || req.url === '/ready') return;

    // Skip auth in development mode
    if (process.env.NODE_ENV === 'development') {
      (req as any).creatorId = req.headers['x-creator-id'] ?? 'dev-creator';
      return;
    }

    const apiKey = req.headers['x-api-key'] as string | undefined;
    const authHeader = req.headers.authorization;

    if (!apiKey && !authHeader) {
      return reply.status(401).send({ error: 'Authentication required. Provide x-api-key header or Authorization: Bearer <token>' });
    }

    // API key auth (simple)
    if (apiKey) {
      // In production: validate against stored API keys
      // For now, accept any non-empty key
      (req as any).creatorId = req.headers['x-creator-id'] ?? 'anonymous';
      return;
    }

    // JWT auth (placeholder)
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      // In production: verify JWT, extract claims
      // For now, extract creatorId from a simple base64-encoded payload
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64').toString());
        (req as any).creatorId = payload.sub ?? 'anonymous';
      } catch {
        (req as any).creatorId = 'anonymous';
      }
      return;
    }

    return reply.status(401).send({ error: 'Invalid authentication' });
  });
}

// ---------------------------------------------------------------------------
// Request logging / latency tracking
// ---------------------------------------------------------------------------
export async function registerLoggingMiddleware(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', async (req: FastifyRequest) => {
    (req as any).startTime = process.hrtime.bigint();
  });

  app.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
    const start = (req as any).startTime as bigint;
    if (start) {
      const durationNs = process.hrtime.bigint() - start;
      const durationMs = Number(durationNs) / 1_000_000;

      app.log.info({
        method: req.method,
        url: req.url,
        statusCode: reply.statusCode,
        durationMs: durationMs.toFixed(2),
        creatorId: (req as any).creatorId,
      }, 'request completed');

      // Track latency metrics
      const metricsService = (app as any).metricsService;
      if (metricsService) {
        metricsService.recordLatency(req.method, req.url, durationMs);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
export async function registerErrorHandler(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, req, reply) => {
    const statusCode = error.statusCode ?? 500;

    app.log.error({
      method: req.method,
      url: req.url,
      statusCode,
      error: error.message,
      stack: statusCode >= 500 ? error.stack : undefined,
    }, 'request error');

    // Don't leak internal errors in production
    const isProduction = process.env.NODE_ENV === 'production';
    const message = statusCode >= 500 && isProduction
      ? 'Internal server error'
      : error.message;

    return reply.status(statusCode).send({
      error: message,
      statusCode,
      ...(error.validation ? { validation: error.validation } : {}),
    });
  });

  // 404 handler
  app.setNotFoundHandler((_req, reply) => {
    return reply.status(404).send({ error: 'Route not found', statusCode: 404 });
  });
}

// ---------------------------------------------------------------------------
// CORS configuration
// ---------------------------------------------------------------------------
export async function registerCors(app: FastifyInstance): Promise<void> {
  // @fastify/cors handles this, but we register with the right options
  await app.register(import('@fastify/cors'), {
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-creator-id', 'x-session-id'],
    exposedHeaders: ['x-request-id', 'x-latency-ms'],
    credentials: true,
    maxAge: 86400,
  });
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------
export async function registerRateLimiting(app: FastifyInstance): Promise<void> {
  await app.register(import('@fastify/rate-limit'), {
    max: 100,           // 100 requests per window
    timeWindow: '1 minute',
    keyGenerator: (req: FastifyRequest) => {
      return (req as any).creatorId ?? req.ip;
    },
    errorResponseBuilder: (_req: FastifyRequest, context: any) => {
      return {
        error: 'Rate limit exceeded',
        statusCode: 429,
        retryAfter: context.after,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Register all middleware
// ---------------------------------------------------------------------------
export async function registerAllMiddleware(app: FastifyInstance): Promise<void> {
  await registerCors(app);
  await registerRateLimiting(app);
  await registerAuthMiddleware(app);
  await registerLoggingMiddleware(app);
  await registerErrorHandler(app);
}
