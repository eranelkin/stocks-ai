import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Ensure the src/ directory is on sys.path so intra-service imports work
# regardless of how uvicorn is invoked (src.main vs main).
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

load_dotenv()  # must run before any route imports that read env vars

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.logs_db import init_logs_db
from db.models_db import init_db
from routes.chat import router as chat_router
from routes.health import router as health_router
from routes.logs import router as logs_router
from routes.models import router as models_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()       # idempotent — seeds from models.py on first run
    init_logs_db()  # idempotent — creates audit_logs table
    yield


app = FastAPI(title="stocks-ai-service", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5005"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/health")
app.include_router(models_router, prefix="/models")
app.include_router(chat_router, prefix="/chat")
app.include_router(logs_router, prefix="/logs")
