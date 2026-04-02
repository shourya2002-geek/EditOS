# EditOS: The Agentic Voice Operating System for Creators on the Move!

The Agentic Operating System for Creators on the Move. Upload your content, describe your vision out loud, and let intelligent agents craft a polished, short-form edit in seconds — then publish directly to your favourite platforms, all from wherever you are. Powered by [Mistral AI](https://mistral.ai).

## Demo

[![Demo](https://img.youtube.com/vi/FszafLy5ypc/0.jpg)](https://www.youtube.com/watch?v=FszafLy5ypc)

---

## Features

- **Conversational AI Editing** — Describe edits in plain English; Mistral AI returns structured operations (cut, trim, zoom, speed, caption, color grade, music, fades, and more)
- **Voice Pipeline** — Real-time voice-to-edit via WebSocket with voice activity detection and <2s target latency
- **Custom ASR (Self-Hosted Whisper)** — Feature-flagged alternative to browser SpeechRecognition: a self-hosted OpenAI Whisper model running on a GPU VM (NVIDIA L4) with real-time streaming transcription, togglable from the Settings UI
- **Non-destructive Edit Stack** — Client-side commit-based history with undo/redo, commit toggling, and automatic conflict resolution
- **Multi-Agent Architecture** — 5 specialized Mistral agents (Orchestrator, Intent, Strategy, Collaboration, Publishing) routed via an agent router
- **Video Rendering** — FFmpeg-based render pipeline with GPU acceleration (Apple VideoToolbox, NVIDIA, AMD), worker pool, and job queue
- **Real-time Collaboration** — Yjs CRDT-based multi-user editing with WebSocket sync
- **Creator Style Learning** — Style profile tracking, strategy adaptation, and analytics ingestion
- **A/B Experiment Engine** — Create editing experiments, record variants, and analyze results
- **Publishing Pipeline** — Connect YouTube, Instagram, and Twitter accounts; publish with status tracking
- **Duration Targeting** — AI understands precise duration requests and calculates exact cuts to hit the target

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js 20+, Fastify 4, TypeScript 5.5 |
| **AI** | Mistral AI SDK — multi-model (Large, 8B, 3B) |
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS 3.4 |
| **Video** | FFmpeg (fluent-ffmpeg) |
| **Realtime** | WebSockets (@fastify/websocket), Yjs CRDTs |
| **Queue** | BullMQ + Redis (ioredis) |
| **Validation** | Zod |
| **Logging** | Pino |

---

## Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **npm** (comes with Node)
- **FFmpeg** installed and on PATH
- **Redis** (optional — needed for render/analysis workers)
- A **Mistral AI API key** ([platform.mistral.ai](https://platform.mistral.ai))

### Installation

```bash
# Clone the repository
git clone https://github.com/shourya2002-geek/mistral-hack.git
cd mistral-hack

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

### Configuration

```bash
cp .env.example .env
```

Edit `.env` and set at minimum:

```
MISTRAL_API_KEY=your_api_key_here
```

<details>
<summary>All environment variables</summary>

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Backend server port |
| `HOST` | `0.0.0.0` | Bind address |
| `NODE_ENV` | `development` | Environment |
| `LOG_LEVEL` | `info` | Pino log level |
| `MISTRAL_API_KEY` | — | **Required.** Mistral AI API key |
| `MISTRAL_BASE_URL` | `https://api.mistral.ai` | Mistral endpoint |
| `MISTRAL_ORCHESTRATOR_MODEL` | `mistral-large-latest` | Orchestrator agent model |
| `MISTRAL_INTENT_MODEL` | `ministral-8b-latest` | Intent interpreter model |
| `MISTRAL_STRATEGY_MODEL` | `ministral-8b-latest` | Strategy generator model |
| `MISTRAL_COLLAB_MODEL` | `ministral-8b-latest` | Collaboration model |
| `MISTRAL_PUBLISH_MODEL` | `ministral-3b-latest` | Publishing agent model |
| `MISTRAL_VOICE_MODEL` | `mistral-large-latest` | Voice real-time model |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `UPLOAD_DIR` | `./storage/uploads` | Upload storage path |
| `TEMP_DIR` | `./storage/temp` | Temporary storage |
| `OUTPUT_DIR` | `./storage/output` | Render output path |
| `RENDER_CONCURRENCY` | `2` | Parallel render workers |
| `ANALYSIS_CONCURRENCY` | `4` | Parallel analysis workers |
| `CORS_ORIGIN` | `*` | CORS allowed origin |
| `CUSTOM_ASR_ENABLED` | `false` | Enable self-hosted Whisper ASR |
| `CUSTOM_ASR_URL` | `http://35.244.14.245:8090` | Whisper ASR server URL |
| `CUSTOM_ASR_TIMEOUT_MS` | `30000` | ASR request timeout (ms) |

</details>

### Running

```bash
# Terminal 1 — Backend (port 3000)
npx tsx src/index.ts

# Terminal 2 — Frontend (port 3001)
cd frontend && npm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Next.js Frontend                     │
│  Dashboard │ Video Editor │ Render │ Experiments │ Profile│
│            │  AI Chat + Timeline + Voice                 │
│            │  Non-destructive Edit Stack (client-side)   │
└────────────┬────────────────────────┬────────────────────┘
             │ REST / WebSocket       │ Proxy (next.config)
┌────────────▼────────────────────────▼────────────────────┐
│                   Fastify Backend (3000)                  │
├──────────────────────────────────────────────────────────┤
│  Routes: projects │ sessions │ strategies │ chat │ render │
│          publish  │ collab   │ experiments │ creators     │
├──────────────────────────────────────────────────────────┤
│                    Service Layer                          │
│  ProjectService │ SessionService │ ChatService │ ...      │
├──────────────────────────────────────────────────────────┤
│                     Core Engines                          │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐ │
│  │  Mistral   │ │  Voice    │ │  Video    │ │  Collab  │ │
│  │  Agents    │ │  Pipeline │ │  Timeline │ │  (Yjs)   │ │
│  │  (5 agents)│ │  (VAD/WS) │ │  (FFmpeg) │ │  (CRDT)  │ │
│  └───────────┘ └───────────┘ └───────────┘ └──────────┘ │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐ │
│  │  Intent   │ │  Strategy │ │  Learning │ │  Brain   │ │
│  │  Parser   │ │  DSL      │ │  Profiles │ │  Engines │ │
│  └───────────┘ └───────────┘ └───────────┘ └──────────┘ │
└──────────────────────────┬───────────────────────────────┘
                           │ (optional) POST /transcribe
              ┌────────────▼─────────────────┐
              │   Self-Hosted Whisper ASR     │
              │   GPU VM (NVIDIA L4, CUDA)   │
              │   openai/whisper-small        │
              └──────────────────────────────┘
```

### Multi-Agent System

EditOS uses a **multi-agent Mistral AI architecture** with specialized agents for different tasks:

| Agent | Model | Role |
|---|---|---|
| **Orchestrator** | `mistral-large-latest` | Routes complex requests, coordinates agents |
| **Intent Interpreter** | `ministral-8b-latest` | Parses natural language into editing intents |
| **Editing Strategy** | `ministral-8b-latest` | Generates concrete editing operation sequences |
| **Collaboration** | `ministral-8b-latest` | Manages multi-user editing decisions |
| **Publishing** | `ministral-3b-latest` | Optimizes content for platform-specific publishing |

### Edit Operations

The AI produces structured operations that the frontend applies non-destructively:

| Operation | Description |
|---|---|
| `cut` | Remove a time segment |
| `trim_start` / `trim_end` | Trim from beginning or end |
| `zoom` | Zoom effect with configurable level |
| `speed` | Playback speed change (0.25x–4x) |
| `caption` | Add text overlay (bold/minimal/dynamic) |
| `volume` | Adjust volume (mute → boost) |
| `fade_in` / `fade_out` | Opacity fades |
| `color_grade` | Preset grading (warm, cool, vintage, cinematic, vibrant) |
| `music` | Background music (upbeat, chill, dramatic, energetic) |
| `silence_remove` | Auto-detect and remove silence |
| `split` | Split at a specific point |
| `reset_all` | Clear all edits |

---

## API Reference

All REST endpoints are prefixed with `/api/v1`. The backend also exposes WebSocket endpoints for real-time features.

### REST Endpoints

<details>
<summary><strong>Projects</strong></summary>

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/projects` | Create a new project |
| `GET` | `/api/v1/projects` | List projects |
| `GET` | `/api/v1/projects/:projectId` | Get project details |
| `POST` | `/api/v1/projects/:projectId/upload` | Upload video (multipart, 500MB max) |
| `GET` | `/api/v1/projects/:projectId/video` | Stream video (range requests supported) |

</details>

<details>
<summary><strong>Sessions</strong></summary>

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/sessions` | Start editing session |
| `GET` | `/api/v1/sessions/:sessionId` | Get session state |
| `POST` | `/api/v1/sessions/:sessionId/end` | End session |

</details>

<details>
<summary><strong>AI Chat</strong></summary>

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/chat` | Send message, get AI response + edit operations |
| `DELETE` | `/api/v1/chat/:conversationId` | Clear conversation history |

**Request body** for `POST /api/v1/chat`:
```json
{
  "conversationId": "unique-id",
  "message": "make it cinematic with dramatic zoom",
  "videoDurationMs": 30000,
  "platform": "short"
}
```

</details>

<details>
<summary><strong>Strategies</strong></summary>

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/strategies/generate` | Generate strategy from intent |
| `POST` | `/api/v1/strategies/:id/preview` | Preview strategy |
| `POST` | `/api/v1/strategies/:id/apply` | Apply strategy |
| `POST` | `/api/v1/strategies/:id/undo` | Undo last operation |

</details>

<details>
<summary><strong>Rendering</strong></summary>

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/render` | Submit render job |
| `GET` | `/api/v1/render/stats` | Queue statistics |
| `GET` | `/api/v1/render/queue` | List all jobs |
| `GET` | `/api/v1/render/:jobId` | Get job status |
| `DELETE` | `/api/v1/render/:jobId` | Cancel job |

</details>

<details>
<summary><strong>Publishing</strong></summary>

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/publish/connect` | Connect platform account |
| `GET` | `/api/v1/publish/accounts` | List connected accounts |
| `DELETE` | `/api/v1/publish/accounts/:platform` | Disconnect account |
| `POST` | `/api/v1/publish` | Publish video to platform |
| `GET` | `/api/v1/publish/:jobId` | Get publish status |

</details>

<details>
<summary><strong>Creators & Learning</strong></summary>

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/creators/:id/profile` | Get creator style profile |
| `PATCH` | `/api/v1/creators/:id/profile` | Update profile |
| `GET` | `/api/v1/creators/:id/similar` | Find similar creators |
| `POST` | `/api/v1/creators/:id/analytics` | Ingest analytics data |
| `GET` | `/api/v1/creators/:id/analytics` | Get analytics summary |

</details>

<details>
<summary><strong>Experiments</strong></summary>

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/experiments` | List experiments |
| `POST` | `/api/v1/experiments` | Create experiment |
| `POST` | `/api/v1/experiments/:id/start` | Start experiment |
| `GET` | `/api/v1/experiments/:id` | Get results |
| `POST` | `/api/v1/experiments/:id/record` | Record variant result |

</details>

<details>
<summary><strong>Collaboration</strong></summary>

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/v1/collab/sessions` | Create collab session |
| `GET` | `/api/v1/collab/sessions/:projectId` | Get session |
| `GET` | `/api/v1/collab/sessions/:projectId/script` | Get script board |
| `GET` | `/api/v1/collab/sessions/:projectId/memories` | Get memories |

</details>

<details>
<summary><strong>Custom ASR</strong></summary>

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/asr/config` | Get current ASR provider & status |
| `POST` | `/api/v1/asr/transcribe` | Transcribe audio (multipart `audio` field) |
| `POST` | `/api/v1/asr/toggle` | Toggle custom ASR on/off (`{ "enabled": true }`) |

</details>

### WebSocket Endpoints

| Path | Description |
|---|---|
| `ws://host:3000/ws/voice` | Real-time voice commands (16kHz audio → edits) |
| `ws://host:3000/ws/collab` | Multi-user collaboration (Yjs CRDT sync) |
| `ws://host:3000/ws/render` | Render progress events |

---

## Project Structure

```
├── src/
│   ├── index.ts                 # Fastify entry point
│   ├── config/                  # Environment & configuration
│   ├── api/
│   │   ├── routes/              # REST API routes
│   │   ├── middleware/          # CORS, rate-limit, auth
│   │   └── websocket/          # Voice, collab, render WS handlers
│   ├── core/
│   │   ├── agents/             # Mistral multi-agent system
│   │   ├── brain/              # Creative AI engines (caption, hook, pacing, visual)
│   │   ├── voice/              # Voice pipeline + VAD
│   │   ├── video/              # Timeline, render queue, FFmpeg, workers
│   │   ├── collaboration/      # Yjs CRDT engine
│   │   ├── learning/           # Style profiles, experiments
│   │   ├── dsl/                # Strategy compiler + execution
│   │   └── intent/             # NL intent interpreter
│   ├── services/               # Service layer
│   ├── types/                  # TypeScript type definitions
│   └── workers/                # Background worker scripts
├── frontend/
│   ├── next.config.js          # Proxy rewrites to backend
│   ├── tailwind.config.ts
│   └── src/
│       ├── app/                # Next.js App Router pages
│       │   ├── page.tsx        # Dashboard
│       │   ├── editor/         # Video editor (chat, timeline, voice)
│       │   ├── projects/       # Project management
│       │   ├── experiments/    # A/B testing
│       │   ├── render/         # Render queue
│       │   ├── profile/        # Creator profile
│       │   └── settings/       # Settings
│       ├── components/         # Shared UI components
│       └── lib/
│           ├── api.ts          # API client
│           ├── editStack.ts    # Non-destructive edit stack
│           ├── types.ts        # Frontend types
│           └── websocket.ts    # WebSocket hooks
├── asr_server.py               # Self-hosted Whisper ASR server (deployed to GPU VM)
├── storage/                    # Uploads, temp, output (gitignored)
├── .env.example                # Environment template
└── package.json
```

---

## Custom ASR (Self-Hosted Whisper)

EditOS ships with an optional self-hosted ASR pipeline as an alternative to the browser's built-in `SpeechRecognition` API. It runs **OpenAI Whisper Small** on a GPU VM and streams transcriptions back to the editor in near real-time.

### Why

| | Browser SpeechRecognition | Custom Whisper |
|---|---|---|
| **Accuracy** | Basic | Higher (Whisper Small, 244M params) |
| **Languages** | English-centric | 99 languages |
| **Browser support** | Chrome / Edge / Safari only | Any browser (uses MediaRecorder) |
| **Privacy** | Audio sent to Google/Apple | Audio stays on your own infrastructure |
| **Latency** | ~0s (streaming) | ~1–2s per update (growing-window transcription) |

### Infrastructure

| Component | Details |
|---|---|
| **Cloud** | Google Cloud Platform, project `whisper-gpu-mvp` |
| **VM** | `whisper-gpu-vm`, zone `asia-south1-a`, machine type `g2-standard-4` |
| **GPU** | NVIDIA L4 (24 GB VRAM) |
| **Driver** | NVIDIA 570.211.01, CUDA 12.8 |
| **Model** | `openai/whisper-small` (float16 on CUDA) |
| **Server** | Python HTTP server (`asr_server.py`) on port 8090 |
| **Firewall** | GCP rule `allow-asr-8090` (TCP 8090, tag `http-server`) |

### ASR Server

`asr_server.py` is a lightweight Python HTTP server that loads Whisper once into GPU memory and serves two endpoints:

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Returns model name, device, status |
| `/transcribe` | POST | Accepts multipart audio file, returns `{ "text": "..." }` |

#### Deploy to VM

```bash
# SSH into the VM
ssh -i ~/.ssh/google_compute_engine <USER>@<VM_EXTERNAL_IP>

# Copy the server script
scp -i ~/.ssh/google_compute_engine asr_server.py <USER>@<VM_EXTERNAL_IP>:/tmp/

# On the VM — install dependencies & start
pip install transformers torch accelerate soundfile ffmpeg-python
nohup python3 /tmp/asr_server.py > /tmp/asr.log 2>&1 &

# Verify
curl http://<VM_EXTERNAL_IP>:8090/health
# → {"status": "ok", "model": "openai/whisper-small", "device": "cuda"}
```

### Frontend Integration

The frontend provides two interchangeable voice hooks with an identical interface:

| Hook | Provider | How it works |
|---|---|---|
| `useVoiceWebSocket()` | Browser SpeechRecognition | Native streaming API, interim results word-by-word |
| `useCustomWhisperVoice()` | Self-hosted Whisper | Records mic via MediaRecorder, transcribes a growing audio window every ~1.5s, shows incremental results; finalizes as a command after 2s silence |

The editor page selects the active hook based on the ASR config:

```typescript
const browserVoice = useVoiceWebSocket();
const whisperVoice = useCustomWhisperVoice();
const voice = asrProvider === 'custom-whisper' ? whisperVoice : browserVoice;
```

### How to Enable

1. **Via UI** — Go to **Settings → Voice / ASR** and toggle **Custom Whisper** on. The settings page shows a live health indicator for the GPU VM connection.

2. **Via environment** — Set in `.env` and restart the backend:
   ```
   CUSTOM_ASR_ENABLED=true
   CUSTOM_ASR_URL=http://<VM_EXTERNAL_IP>:8090
   ```

3. **At runtime** — Call the toggle API:
   ```bash
   curl -X POST http://localhost:3000/api/v1/asr/toggle \
     -H 'Content-Type: application/json' \
     -H 'x-creator-id: dev-creator' \
     -d '{"enabled": true}'
   ```

Once enabled, the editor toolbar shows a **"Whisper"** badge next to the mic button (instead of **"Browser"**), and all voice input is routed through the self-hosted model.

### Data Flow

```
┌──────────┐  MediaRecorder   ┌──────────────┐  POST /asr/transcribe  ┌─────────────┐
│  Browser  │ ──── audio ────▶│  EditOS       │ ──── proxy ──────────▶│  GPU VM     │
│  Mic      │  (500ms chunks) │  Backend:3000 │                       │  Whisper    │
└──────────┘                  └──────┬───────┘◀── { text } ──────────│  :8090      │
                                     │                                └─────────────┘
                              transcript (interim)
                                     │
                              ┌──────▼───────┐
                              │  Editor UI   │
                              │  Chat Panel  │
                              │  (live text) │
                              └──────────────┘
```

### Cost Management

The GPU VM is billed per-hour while running. To save costs:

```bash
# Stop the VM when not in use
gcloud compute instances stop whisper-gpu-vm --zone=asia-south1-a --project=whisper-gpu-mvp

# Start it again later
gcloud compute instances start whisper-gpu-vm --zone=asia-south1-a --project=whisper-gpu-mvp
```

The ASR server must be restarted after the VM boots (it doesn't auto-start).

---

