# VIRCUT ENGINE — MOAT-DRIVEN SYSTEM ARCHITECTURE

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     CREATOR INTERFACE LAYER                      │
│  ┌──────────┐  ┌──────────────┐  ┌────────────┐  ┌───────────┐ │
│  │  Voice    │  │   Web UI     │  │   API      │  │  Webhook  │ │
│  │  (Voxtral)│  │  (WebSocket) │  │  (REST)    │  │  Ingest   │ │
│  └────┬─────┘  └──────┬───────┘  └─────┬──────┘  └─────┬─────┘ │
└───────┼────────────────┼────────────────┼───────────────┼───────┘
        │                │                │               │
┌───────▼────────────────▼────────────────▼───────────────▼───────┐
│                   ORCHESTRATOR (Mistral Large 3)                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  Session Manager  │  Agent Router  │  State Machine        │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────┬──────────┬──────────┬──────────┬──────────┬──────────┘
          │          │          │          │          │
    ┌─────▼───┐ ┌───▼────┐ ┌──▼───┐ ┌───▼────┐ ┌──▼─────┐
    │ Intent  │ │Strategy│ │Collab│ │Publish │ │ Voice  │
    │ 14b     │ │ 14b    │ │ 8b   │ │ 3b     │ │Voxtral │
    └────┬────┘ └───┬────┘ └──┬───┘ └───┬────┘ └──┬─────┘
         │          │         │         │          │
┌────────▼──────────▼─────────▼─────────▼──────────▼─────────────┐
│                    EXECUTION ENGINE                              │
│  ┌─────────┐  ┌──────────┐  ┌─────────┐  ┌──────────────────┐ │
│  │Timeline │  │ FFmpeg   │  │ Render  │  │ Asset Pipeline   │ │
│  │ Engine  │  │ Pipeline │  │ Queue   │  │ (B-roll/SFX/LUT) │ │
│  └─────────┘  └──────────┘  └─────────┘  └──────────────────┘ │
└────────────────────────────────────────────────────────────────┘
         │
┌────────▼───────────────────────────────────────────────────────┐
│                    DATA & LEARNING LAYER                        │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌─────────────┐ │
│  │ Creator  │  │ Retention │  │ Style     │  │ Strategy    │ │
│  │ Profiles │  │ Analytics │  │ Embeddings│  │ Adaptation  │ │
│  └──────────┘  └───────────┘  └───────────┘  └─────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

## Model Routing Strategy

| Agent              | Model           | Latency Target | Context Window | Cost Tier |
|--------------------|-----------------|----------------|----------------|-----------|
| Orchestrator       | Mistral Large 3 | <800ms         | 128k           | High      |
| Intent Interpreter | Ministral 14b   | <400ms         | 32k            | Medium    |
| Strategy Agent     | Ministral 14b   | <600ms         | 32k            | Medium    |
| Collaboration      | Ministral 8b    | <300ms         | 16k            | Low       |
| Publishing         | Ministral 3b    | <200ms         | 8k             | Minimal   |
| Voice Interface    | Voxtral RT      | <150ms         | Streaming      | Medium    |

### OSS Models (Local)
- **Whisper medium** → Transcription fallback (GPU)
- **PySceneDetect** → Shot boundary detection (CPU)
- **Silero VAD** → Silence/voice activity detection (CPU)
- **MediaPipe Face** → Face detection + tracking (CPU/GPU)
- **all-MiniLM-L6-v2** → Style embeddings (CPU)

## Design Principles

1. **DSL-First**: All editing operations expressed as a typed DSL
2. **Agent Isolation**: Each agent has defined I/O contracts, no shared mutable state
3. **Event-Driven**: All inter-system communication via typed events
4. **Idempotent Execution**: Timeline operations are replayable
5. **Progressive Enhancement**: Render preview → draft → final
6. **Creator Memory**: Every interaction feeds the learning moat
