import logging
import os
import sys

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import CORS_ORIGINS, UPLOAD_DIR

# ── Logging setup ────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    stream=sys.stdout,
)
# WebSocket + execution loggers default to INFO; set DEBUG for more detail
logging.getLogger("ws").setLevel(logging.DEBUG)
logging.getLogger("ws.stream").setLevel(logging.DEBUG)
logging.getLogger("ws.execution").setLevel(logging.INFO)
from app.routers import (
    api_keys,
    auth,
    configurations,
    domains,
    executions,
    file_changes,
    guardrails,
    knowledge,
    prompts,
    stream,
    threads,
    tools,
    workflows,
)

app = FastAPI(title="AI Product Studio", version="0.1.0")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# Rate limiting error handler
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(domains.router, prefix=API_PREFIX)
app.include_router(workflows.router, prefix=API_PREFIX)
app.include_router(tools.router, prefix=API_PREFIX)
app.include_router(knowledge.router, prefix=API_PREFIX)
app.include_router(prompts.router, prefix=API_PREFIX)
app.include_router(guardrails.router, prefix=API_PREFIX)
app.include_router(configurations.router, prefix=API_PREFIX)
app.include_router(threads.router, prefix=API_PREFIX)
app.include_router(executions.router, prefix=API_PREFIX)
app.include_router(file_changes.router, prefix=API_PREFIX)
app.include_router(stream.router, prefix=API_PREFIX)
app.include_router(api_keys.router, prefix=API_PREFIX)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/api/v1/debug/status")
async def debug_status():
    """Diagnostic endpoint — shows config, DB connectivity, and active WS runs."""
    from app.routers.stream import _active_runs
    from app.database import supabase as db

    checks: dict = {"server": "ok", "cors_origins": CORS_ORIGINS}

    # DB connectivity
    try:
        result = db.table("threads").select("id", count="exact").limit(0).execute()
        checks["database"] = "ok"
        checks["thread_count"] = result.count
    except Exception as e:
        checks["database"] = f"error: {e}"

    # Active WebSocket runs
    checks["active_ws_runs"] = {
        tid: "running" if not task.done() else "done"
        for tid, task in _active_runs.items()
    }

    # Environment sanity
    from app.config import SUPABASE_URL, SUPABASE_JWT_SECRET
    checks["supabase_url"] = SUPABASE_URL[:40] + "..." if SUPABASE_URL else "MISSING"
    checks["jwt_secret_set"] = bool(SUPABASE_JWT_SECRET)

    return checks
