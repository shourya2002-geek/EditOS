// ============================================================================
// ENVIRONMENT CONFIGURATION
// ============================================================================

import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

export interface AppConfig {
  // Server
  port: number;
  host: string;
  env: 'development' | 'staging' | 'production';

  // Mistral API
  mistral: {
    apiKey: string;
    baseUrl: string;
    models: {
      orchestrator: string;     // Mistral Large 3
      intent: string;           // Ministral 14b
      strategy: string;         // Ministral 14b
      collaboration: string;    // Ministral 8b
      publishing: string;       // Ministral 3b
      voiceRealtime: string;    // Voxtral Realtime
    };
    timeouts: {
      orchestrator: number;
      intent: number;
      strategy: number;
      collaboration: number;
      publishing: number;
    };
  };

  // Redis
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };

  // Storage
  storage: {
    uploadDir: string;
    outputDir: string;
    tempDir: string;
    assetDir: string;
    cacheDir: string;
    maxFileSize: number;
  };

  // Workers
  workers: {
    renderConcurrency: number;
    analysisConcurrency: number;
    maxRetries: number;
  };

  // Voice
  voice: {
    sampleRate: number;
    channels: number;
    chunkSizeMs: number;
    vadThreshold: number;
    silenceTimeoutMs: number;
  };

  // Latency budgets (ms)
  latency: {
    voiceToIntent: number;
    intentToStrategy: number;
    strategyToPreview: number;
    totalVoiceLoop: number;
  };
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT ?? '3000'),
    host: process.env.HOST ?? '0.0.0.0',
    env: (process.env.NODE_ENV as AppConfig['env']) ?? 'development',

    mistral: {
      apiKey: process.env.MISTRAL_API_KEY ?? '',
      baseUrl: process.env.MISTRAL_BASE_URL ?? 'https://api.mistral.ai',
      models: {
        orchestrator: process.env.MISTRAL_MODEL_ORCHESTRATOR ?? 'mistral-large-latest',
        intent: process.env.MISTRAL_MODEL_INTENT ?? 'ministral-8b-latest',
        strategy: process.env.MISTRAL_MODEL_STRATEGY ?? 'ministral-8b-latest',
        collaboration: process.env.MISTRAL_MODEL_COLLAB ?? 'ministral-8b-latest',
        publishing: process.env.MISTRAL_MODEL_PUBLISH ?? 'ministral-3b-latest',
        voiceRealtime: process.env.MISTRAL_MODEL_VOICE ?? 'mistral-large-latest',
      },
      timeouts: {
        orchestrator: 15000,
        intent: 8000,
        strategy: 12000,
        collaboration: 6000,
        publishing: 4000,
      },
    },

    redis: {
      host: process.env.REDIS_HOST ?? '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT ?? '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB ?? '0'),
    },

    storage: {
      uploadDir: process.env.UPLOAD_DIR ?? './storage/uploads',
      outputDir: process.env.OUTPUT_DIR ?? './storage/outputs',
      tempDir: process.env.TEMP_DIR ?? './storage/temp',
      assetDir: process.env.ASSET_DIR ?? './storage/assets',
      cacheDir: process.env.CACHE_DIR ?? './storage/cache',
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE ?? String(500 * 1024 * 1024)), // 500MB
    },

    workers: {
      renderConcurrency: parseInt(process.env.RENDER_CONCURRENCY ?? '2'),
      analysisConcurrency: parseInt(process.env.ANALYSIS_CONCURRENCY ?? '4'),
      maxRetries: parseInt(process.env.MAX_RETRIES ?? '3'),
    },

    voice: {
      sampleRate: 16000,
      channels: 1,
      chunkSizeMs: 100,
      vadThreshold: 0.5,
      silenceTimeoutMs: 1500,
    },

    latency: {
      voiceToIntent: 400,
      intentToStrategy: 600,
      strategyToPreview: 800,
      totalVoiceLoop: 2000,
    },
  };
}

export const appConfig = loadConfig();
