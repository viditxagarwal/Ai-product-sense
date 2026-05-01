import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL: str = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY: str = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_JWT_SECRET: str = os.environ.get("SUPABASE_JWT_SECRET", "")
UPLOAD_DIR: str = os.environ.get(
    "UPLOAD_DIR",
    os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "uploads")),
)

# Comma-separated list of allowed CORS origins
CORS_ORIGINS: list[str] = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

# Agent runtime selection:
# - legacy: existing custom graph executor
# - langgraph: compile workflow graph_data into a LangGraph runtime
AGENT_RUNTIME: str = os.environ.get("AGENT_RUNTIME", "legacy").strip().lower()
LANGGRAPH_CHECKPOINT_BACKEND: str = os.environ.get("LANGGRAPH_CHECKPOINT_BACKEND", "memory").strip().lower()
LANGGRAPH_ENABLE_INTERRUPTS: bool = os.environ.get("LANGGRAPH_ENABLE_INTERRUPTS", "false").strip().lower() in {
    "1",
    "true",
    "yes",
}

# LangSmith tracing is activated by LangChain/LangGraph when these env vars are present.
LANGSMITH_TRACING: bool = os.environ.get("LANGSMITH_TRACING", os.environ.get("LANGCHAIN_TRACING_V2", "false")).strip().lower() in {
    "1",
    "true",
    "yes",
}
