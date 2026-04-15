# Stocks AI

An AI-powered stock analysis platform. Ask questions about stocks, attach JSON/CSV data files, and get structured analysis with probability assessments from LLMs.

## Services

| Service | Stack | Port | Purpose |
|---|---|---|---|
| `client/` | React 19 + MUI Joy | 3000 | Trading UI and chat interface |
| `server/` | Node.js + Express | 3001 | REST API gateway |
| `ai-service/` | Python + FastAPI | 5005 | LLM streaming, model registry |

**Request flow:**
```
Browser → client (3000) → server (3001) → /api/ai/* → ai-service (5005)
                                         → /api/*    → server own routes
```

---

## Prerequisites

| Tool | Minimum version |
|---|---|
| Node.js | 18+ |
| npm | 9+ |
| Python | 3.11+ |

---

## First-time setup

### 1. AI service — Python environment

```bash
cd ai-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

### 2. AI service — API keys

```bash
cp .env.example .env
```

Open `ai-service/.env` and fill in at least one key:

```env
# Free tier — get a key at https://console.groq.com
GROQ_API_KEY=gsk_...

# Requires credits — get a key at https://console.x.ai
XAI_API_KEY=xai-...
```

### 3. Server — Node dependencies

```bash
cd server
npm install
```

### 4. Client — Node dependencies

```bash
cd client
npm install
```

---

## Running in development

Open **three terminals**, one per service.

**Terminal 1 — AI service**
```bash
cd ai-service
.venv/bin/uvicorn src.main:app --reload --port 5005
```

**Terminal 2 — Server**
```bash
cd server
npm run dev
```

**Terminal 3 — Client**
```bash
cd client
npm start
```

The app opens at **http://localhost:3000**.

---

## Adding a new AI model

All model configuration lives in one file: `ai-service/src/config/models.py`.

Add an entry to the `MODELS` list and set the matching env var in `ai-service/.env`:

```python
{
    "id": "gpt-4o",
    "name": "GPT-4o",
    "provider": "openai_compatible",
    "base_url": "https://api.openai.com/v1",
    "api_key_env": "OPENAI_API_KEY",
},
```

The UI dropdown picks it up automatically — no other code changes needed.

---

## API reference

### Server — `http://localhost:3001`

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Server health check |
| * | `/api/ai/*` | Proxied to ai-service |

### AI service — `http://localhost:5005`

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/health` | — | Service health |
| GET | `/models` | — | List configured models with `ready` flag |
| POST | `/chat` | `{ model, messages[], attachments[]?, system_prompt? }` | Streaming SSE chat |

**Chat request example:**
```json
{
  "model": "llama-3.3-70b-versatile",
  "messages": [
    { "role": "user", "content": "Analyze AAPL for a long position" }
  ],
  "attachments": [
    { "name": "portfolio.json", "content": "{...}", "mime_type": "application/json" }
  ]
}
```

**Chat response** — Server-Sent Events stream:
```
data: {"content": "AAPL shows..."}
data: {"content": " strong momentum"}
data: [DONE]
```

---

## Project structure

```
stocks-AI/
├── client/                 # React 19 frontend
│   └── src/
│       ├── App.js
│       └── components/
│           ├── ChatWindow.js
│           ├── ModelSelector.js
│           └── ServerStatus.js
├── server/                 # Express API gateway
│   └── src/
│       ├── index.js
│       └── routes/
│           └── health.js
└── ai-service/             # FastAPI LLM service
    ├── .env.example
    ├── requirements.txt
    └── src/
        ├── main.py
        ├── config/
        │   └── models.py   ← add new models here
        ├── routes/
        │   ├── chat.py
        │   ├── health.py
        │   └── models.py
        └── services/
            └── llm.py
```
