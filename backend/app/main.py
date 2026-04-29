from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import CORS_ORIGINS
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
