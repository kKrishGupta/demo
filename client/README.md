# ActionFlow AI — Intelligent Micro-Action Orchestration Platform

A hybrid intelligence system that understands natural speech (English, Hindi, Hinglish), extracts structured micro-actions, detects dependencies and ambiguity, and prepares tasks for execution — all with field-level confidence scoring and explicit approval gating.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT (React + Vite, runs in-browser)                         │
│  ├── VoiceCapture (Web Speech API)                              │
│  ├── Rule Engine (deterministic extraction — 305 tests)         │
│  ├── Hybrid Intelligence Service (PATH A/B/C orchestrator)       │
│  ├── DAG Planner (topological sort, parallel groups, cycles)     │
│  ├── Confidence Engine (calibrated per-field scores)            │
│  ├── Context Memory (pronoun resolution, session context)        │
│  ├── Duplicate Detector (fingerprinting + Jaccard similarity)   │
│  └── ActionPlan UI (execution plan visualization)                │
│                                                                  │
│  Optional: VITE_API_BASE_URL → calls server for Gemini analysis  │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP / WebSocket
┌───────────────────────────────▼─────────────────────────────────┐
│  SERVER (Express.js + WebSocket)                                │
│  ├── Gemini 3.8 Flash Integration (structured JSON output)       │
│  ├── Redis Cache (with in-memory fallback)                       │
│  ├── Hybrid Extraction Service (input classification + merge)    │
│  ├── Execution Gateway (approval required for external actions)  │
│  ├── WhatsApp Service (Twilio, idempotent)                       │
│  ├── Calendar Service (Google OAuth + event creation)            │
│  ├── Context Service (persistent session context)                │
│  ├── Audit Service (PII-redacted structured logs)               │
│  └── WebSocket Server (live extraction streaming)               │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### Client (works standalone, no server needed)

```bash
cd client
npm install
npm run dev      # http://localhost:5173
```

### Server (optional — adds Gemini, caching, execution gateway)

```bash
cd server
cp .env.example .env   # Set GEMINI_API_KEY
npm install
npm run dev            # http://localhost:3001
```

### Connect client to server

Create `client/.env.local`:
```
VITE_API_BASE_URL=http://localhost:3001
```

## Key Features

### 1. Hybrid Intelligence Pipeline (3 Paths)

| Path | When | Method | Latency |
|------|------|--------|---------|
| **FAST** | Simple commands ≤8 words | Pure rule engine | <5ms |
| **CONTEXTUAL** | Long/complex (60+ words) | Gemini 3.8 Flash | 3-90s |
| **HYBRID** | Medium (20-60 words) | Rule + Gemini merge | 10-50ms |

### 2. Advanced Micro-Action Extraction

- 18 action types: `CREATE_TASK`, `SEND_WHATSAPP`, `CREATE_CALENDAR_EVENT`, etc.
- Multi-action decomposition from single utterances
- Dependency detection ("after X is complete, do Y")
- Multi-task segmentation (3+ tasks from one transcript)

### 3. Field-Level Confidence Engine

Calibrated scores per field — not LLM-fabricated:

```json
{
  "confidence": {
    "intent": 0.95,
    "title": 0.9,
    "assignee": 1.0,
    "deadline": 0.7,
    "priority": 0.85,
    "overall": 0.85
  }
}
```

### 4. DAG-Based Execution Planner

- Topological ordering (Kahn's algorithm, priority-weighted)
- Parallel execution group identification
- Cycle detection (DFS coloring)
- Deadline conflict detection
- Smart action recommendations

### 5. Context Memory & Pronoun Resolution

- "Ask her to complete the report" → resolves "her" to last mentioned person
- "Wahi task" → resolves to last mentioned task
- Session-scoped (no cross-user leakage)

### 6. Safe Execution Gateway

External actions require explicit approval:

| Action | Approval Required |
|--------|:-:|
| CREATE_TASK | No |
| SEND_WHATSAPP | **Yes** |
| SEND_EMAIL | **Yes** |
| CREATE_CALENDAR_EVENT | **Yes** |
| DELETE_TASK | **Yes** |

### 7. Duplicate Detection & Idempotency

- Structural fingerprinting (title + assignee + deadline + type)
- Fuzzy title similarity (Jaccard)
- Processing locks prevent concurrent duplicates
- UNKNOWN_EXECUTION_STATE on timeout (never auto-retry)

### 8. Multilingual Support

- English, Hindi (Devanagari), Hinglish (Latin-script Hindi)
- Devanagari → Latin transliteration in normalization
- Hindi date expressions: `kal subah`, `parso`, `har shukravaar`
- Code-mixed sentences handled naturally

## Test Results

| Metric | Value |
|--------|-------|
| Client unit tests | **305/305 passed** (15 files) |
| Server unit tests | **33/33 passed** (standalone runner) |
| Extraction accuracy | **97.9%** (685/700 records) |
| Avg extraction latency | **10.47ms** |
| P95 latency | **18.89ms** |
| P99 latency | **40.71ms** |
| Production build | 461KB (133KB gzipped) |
| Build time | 1.58s |

### Accuracy by Category

| Category | Accuracy |
|----------|----------|
| Hinglish | 100.0% |
| Multi-action | 100.0% |
| Corrections | 100.0% |
| Negations | 100.0% |
| Speech errors | 100.0% |
| Ambiguous | 100.0% |
| Irrelevant | 100.0% |
| Simple English | 99.0% |
| Regression (120 cases) | 97.5% |
| Date relative | 91.7% |
| Recurring | 92.5% |

## Running Tests

```bash
# Client tests
cd client && npm test

# Server unit tests (no external API needed)
cd server && npm run test:standalone

# Accuracy evaluation (700 records)
cd server && node src/tests/evalRunner.js
```

## Project Structure

```
demo Project/
├── client/                 # React frontend + rule engine + intelligence modules
│   ├── src/
│   │   ├── features/
│   │   │   ├── extraction/    # Rule-based NLP (normalization, entity matching, dates)
│   │   │   ├── intelligence/  # Action types, DAG, confidence, context, duplicates
│   │   │   └── voice/         # Web Speech API integration
│   │   ├── components/      # VoiceCapture, TaskForm, TaskReview, ActionPlan
│   │   ├── services/        # taskService, intelligenceApi
│   │   ├── adapters/        # Task submission with idempotency
│   │   ├── data/            # Sample directory, projects, departments
│   │   └── tests/           # 15 test files, 305 tests
│   └── package.json
│
├── server/                  # Express.js backend
│   ├── src/
│   │   ├── services/        # Gemini, cache, context, execution, WhatsApp, calendar, audit
│   │   ├── routes/          # /api/v1/intelligence/*, /execution/*, /audit
│   │   ├── middleware/      # Helmet, CORS, rate limit, tracing
│   │   ├── websocket/       # WebSocket streaming server
│   │   └── tests/           # Standalone runner + evaluation
│   └── package.json
```

## Configuration

### Client

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE_URL` | No | — | Server URL for Gemini-backed analysis |

### Server

See `server/.env.example` for all options. Key ones:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GEMINI_API_KEY` | For PATH B | — | Google Gemini API key |
| `GEMINI_MODEL` | No | `gemini-3.8-flash` | Model name |
| `REDIS_URL` | No | — | Falls back to in-memory cache |
| `TWILIO_ACCOUNT_SID` | No | — | WhatsApp messaging |
| `GOOGLE_CALENDAR_CLIENT_ID` | No | — | Calendar integration |

## Evaluation Dataset

The evaluation dataset contains **700 records** across 11 categories:
- 120 regression cases (from original test suite)
- 100 simple English commands
- 60 Hinglish commands
- 60 date-relative commands
- 40 each: recurring, multi-action, corrections, negations, speech errors
- 20 each: ambiguous, irrelevant

Run the evaluation:
```bash
cd server && node src/tests/evalRunner.js
```

## License

This is a demonstration project. All sample data is fictional.
