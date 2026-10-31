# ActionFlow AI — Backend Server

> Hybrid intelligence backend with Gemini integration, Redis caching, execution gateway, and WebSocket streaming.

## Quick Start

```bash
cd server
cp .env.example .env  # Fill in GEMINI_API_KEY
npm install
npm run dev            # Starts on http://localhost:3001
```

## Architecture

```
server/
├── src/
│   ├── config.js                    # Centralized env config (no secrets in code)
│   ├── index.js                     # Express + WebSocket server entry
│   ├── cache/
│   │   └── cacheService.js          # Redis with in-memory fallback
│   ├── services/
│   │   ├── geminiService.js         # Gemini 3.8 Flash integration (PATH B)
│   │   ├── hybridExtractionService.js # Input classifier + field-level merge
│   │   ├── contextService.js        # Session context, pronoun resolution
│   │   ├── executionGateway.js      # Approval gate, lifecycle management
│   │   ├── whatsappService.js       # Twilio WhatsApp with idempotency
│   │   ├── calendarService.js       # Google Calendar OAuth + event creation
│   │   └── auditService.js          # Structured audit log (PII-redacted)
│   ├── routes/
│   │   ├── intelligenceRoutes.js    # /api/v1/intelligence/*
│   │   ├── executionRoutes.js       # /api/v1/execution/*
│   │   └── auditRoutes.js           # /api/v1/audit/*
│   ├── middleware/
│   │   └── index.js                 # Helmet, CORS, rate limit, tracing
│   ├── websocket/
│   │   └── wsServer.js               # WebSocket streaming for live previews
│   └── tests/
│       ├── run.js                   # Standalone test runner (33 tests)
│       └── evalRunner.js            # 700-record accuracy evaluation
├── .env.example
├── package.json
└── README.md
```

## API Endpoints

### Intelligence

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/intelligence/analyze` | Full hybrid pipeline (rule + Gemini) |
| `POST` | `/api/v1/intelligence/extract` | Fast rule-based extraction only |
| `POST` | `/api/v1/intelligence/clarify` | Process clarification response |
| `POST` | `/api/v1/intelligence/validate` | Validate task payload |
| `POST` | `/api/v1/intelligence/plan` | Build DAG execution plan |
| `POST` | `/api/v1/intelligence/feedback` | Record user correction |
| `GET`  | `/api/v1/intelligence/requests/:id` | Retrieve analysis result |
| `GET`  | `/api/v1/intelligence/requests/:id/actions` | Get actions for request |

### Execution

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/execution/approve` | Approve & execute action |
| `POST` | `/api/v1/execution/execute` | Execute (requires approval for external) |
| `POST` | `/api/v1/execution/cancel` | Cancel an action |
| `POST` | `/api/v1/execution/trusted-policy` | Register trusted automation |
| `GET`  | `/api/v1/execution/:id` | Get action execution state |

### Audit & Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Server health check |
| `GET` | `/api/v1/audit` | Recent audit entries |
| `GET` | `/api/v1/audit/:actionId` | Entries for specific action |
| `WS`  | `/ws` | WebSocket streaming connection |

## Example: Analyze a transcript

```bash
curl -X POST http://localhost:3001/api/v1/intelligence/analyze \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: my-session" \
  -d '{
    "transcript": "Assign Priya to prepare the quarterly report by Friday. High priority.",
    "directory": [{"id": "p3", "name": "Priya Singh", "aliases": ["priya"]}],
    "projects": []
  }'
```

Response:
```json
{
  "requestId": "req_123",
  "status": "extracted",
  "language": "en",
  "extractionPath": "FAST",
  "actions": [
    {
      "id": "action_req_123_0",
      "type": "CREATE_TASK",
      "title": "Prepare the quarterly report",
      "priority": "High",
      "assignee": { "id": "p3", "name": "Priya Singh" },
      "deadline": "2026-10-30T17:00",
      "executionState": "DRAFT",
      "confidence": { "title": 0.95, "assignee": 1.0, "deadline": 0.9, "overall": 0.85 }
    }
  ],
  "executionPlan": {
    "orderedActionIds": ["action_req_123_0"],
    "parallelGroups": [["action_req_123_0"]],
    "hasCycle": false
  },
  "metadata": {
    "model": "rule-engine-v2",
    "extractionPath": "FAST",
    "processingTimeMs": 8
  }
}
```

## Hybrid Intelligence Pipeline

```
INPUT → Input Classification → Context Resolution → Rule Engine (always)
                                                        ↓
                                              If CONTEXTUAL/HYBRID + Gemini available
                                                        ↓
                                              Gemini Extraction (PATH B)
                                                        ↓
                                              Field-Level Merge (PATH C)
                                                        ↓
                                              Action Generation → Confidence → DAG → Response
```

### Extraction Paths

| Path | When | Speed |
|------|------|------|
| **FAST** | Simple commands ≤8 words | <5ms |
| **HYBRID** | Medium complexity (20-60 words) | 10-50ms |
| **CONTEXTUAL** | Long transcripts or Hindi/Hinglish (60+ words) | 3-90s (Gemini) |

### Merge Rules (PATH C)

- **Rule engine wins**: Dates (chrono-node), Assignee (directory match)
- **Gemini wins**: Intent (when rule returns informational), Title (when rule fails), Dependencies, Multi-action detection
- **Both merged**: Clarifications (deduplicated), Warnings (deduplicated)

## Execution Gateway

Actions with external side effects require explicit approval:

| Action Type | Requires Approval |
|---|---|
| CREATE_TASK | No |
| CREATE_REMINDER | No |
| RETRIEVE_TASKS | No |
| SEND_WHATSAPP | **Yes** |
| SEND_EMAIL | **Yes** |
| CREATE_CALENDAR_EVENT | **Yes** |
| DELETE_TASK | **Yes** |

Trusted automation policies can be registered per session for narrow, repeatable actions.

## Security

- **Helmet**: Security headers on all responses
- **CORS**: Configurable allowed origins
- **Rate limiting**: 100 req/min default, 20 req/min for Gemini endpoints
- **Input validation**: Transcript max 10KB, JSON body max 100KB
- **PII protection**: Audit log redacts tokens, passwords, secrets
- **Request tracing**: X-Request-ID and X-Session-ID on every request
- **No secrets in code**: All credentials via `.env` only

## Testing

```bash
# Unit tests (33 tests, no external dependencies needed)
npm run test:standalone

# Accuracy evaluation (700 records, ~10s)
node src/tests/evalRunner.js
```

## Environment Variables

See `.env.example` for all configuration options. Key ones:

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | For PATH B | — | Google Gemini API key |
| `GEMINI_MODEL` | No | `gemini-3.8-flash` | Model name |
| `REDIS_URL` | No | — | Falls back to in-memory |
| `TWILIO_ACCOUNT_SID` | No | — | For WhatsApp sending |
| `GOOGLE_CALENDAR_CLIENT_ID` | No | — | For Calendar API |
| `ALLOWED_ORIGINS` | No | `localhost:5173` | CORS origins |
