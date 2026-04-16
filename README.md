# Stocks AI

An AI-powered stock analysis platform. Save prompts, run them against LLMs, capture structured output as reports, and monitor market sentiment with the Fear & Greed Index.

## Services

| Service | Stack | Port | Purpose |
|---|---|---|---|
| `client/` | React 19 + MUI Joy | **5005** | Trading UI — Chat, Prompts, Reports, Market |
| `server/` | Node.js + Express | **5006** | REST API gateway + SQLite DB |
| `ai-service/` | Python + FastAPI | **5007** | LLM streaming, model registry |

**Request flow:**
```
Browser → client (5005) → server (5006) → /api/ai/* → ai-service (5007)
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

> The client repo includes a `client/.env` file that sets `PORT=5005`. No extra step needed.

---

## Running in development

Open **three terminals**, one per service.

**Terminal 1 — AI service**
```bash
cd ai-service
.venv/bin/uvicorn src.main:app --reload --port 5007
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

The app opens at **http://localhost:5005**.

---

## Features

### Prompts
Save and manage reusable prompt templates. Hit the play button to send a prompt directly to chat.

### Chat
Chat with any configured LLM. Attach JSON or CSV files for analysis. When the AI response contains a `| Symbol | Current Price` table, a **Save Report** button appears on the message.

### Reports
All saved reports are listed here. Click a row to view the full parsed table. Delete reports you no longer need.

### Market
Live Fear & Greed Index gauge (CNN-style SVG dial) with a component breakdown table. Data is fetched from `feargreedchart.com` and cached server-side for 15 minutes.

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

### Server — `http://localhost:5006`

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Server health check |
| GET | `/api/prompts` | List all prompts |
| POST | `/api/prompts` | Create a prompt |
| PUT | `/api/prompts/:id` | Update a prompt |
| DELETE | `/api/prompts/:id` | Delete a prompt |
| GET | `/api/reports` | List all reports |
| GET | `/api/reports/:id` | Get a single report |
| POST | `/api/reports` | Save a report `{ title, columns, rows, source_prompt_title? }` |
| DELETE | `/api/reports/:id` | Delete a report |
| GET | `/api/feargreed` | Fear & Greed Index (15 min cache) |
| * | `/api/ai/*` | Proxied to ai-service |

### AI service — `http://localhost:5007`

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

## Database

The server uses **SQLite** (via `better-sqlite3`) stored at `data/stocks-ai.db` (auto-created on first run, excluded from git).

Tables:
- `prompts` — saved prompt templates
- `reports` — saved AI-generated output tables (columns/rows stored as JSON)

---

## Project structure

```
stocks-AI/
├── client/                 # React 19 frontend
│   ├── .env                # PORT=5005
│   └── src/
│       ├── App.js
│       ├── components/
│       │   ├── ChatWindow.js
│       │   ├── ModelSelector.js
│       │   └── ServerStatus.js
│       ├── pages/
│       │   ├── PromptsPage.js
│       │   ├── ReportsPage.js
│       │   └── MarketPage.js
│       └── utils/
│           └── parseMarkdownTable.js
├── server/                 # Express API gateway
│   └── src/
│       ├── index.js
│       ├── db/
│       │   └── index.js    ← SQLite schema init
│       └── routes/
│           ├── health.js
│           ├── prompts.js
│           ├── reports.js
│           └── feargreed.js
├── ai-service/             # FastAPI LLM service
│   ├── .env.example
│   ├── requirements.txt
│   └── src/
│       ├── main.py
│       ├── config/
│       │   └── models.py   ← add new models here
│       ├── routes/
│       │   ├── chat.py
│       │   ├── health.py
│       │   └── models.py
│       └── services/
│           └── llm.py
└── data/                   # SQLite DB lives here (git-ignored)
```
