"""Agent runtime facade.

This module lets the product keep the existing WebSocket/API contract while
switching the execution engine underneath it.
"""

import logging
from typing import Any

from app.config import AGENT_RUNTIME

logger = logging.getLogger("agent_runtime")

VALID_RUNTIMES = {"legacy", "langgraph"}


def selected_runtime() -> str:
    if AGENT_RUNTIME in VALID_RUNTIMES:
        return AGENT_RUNTIME
    logger.warning("Unknown AGENT_RUNTIME=%s; falling back to legacy", AGENT_RUNTIME)
    return "legacy"


def runtime_status() -> dict[str, Any]:
    selected = selected_runtime()
    return {
        "configured": AGENT_RUNTIME,
        "selected": selected,
        "valid": AGENT_RUNTIME in VALID_RUNTIMES,
        "available": sorted(VALID_RUNTIMES),
    }


async def execute_workflow(thread_id: str, user_message: str, send_event):
    """Execute a thread workflow with the configured runtime."""
    if selected_runtime() == "langgraph":
        from app.services.agent_runtime.langgraph_executor import execute_workflow_langgraph

        return await execute_workflow_langgraph(thread_id, user_message, send_event)

    from app.services.workflow_executor import execute_workflow as execute_legacy_workflow

    return await execute_legacy_workflow(thread_id, user_message, send_event)


async def resume_workflow(thread_id: str, resume_payload: dict[str, Any], send_event) -> bool:
    """Resume a paused runtime if the configured engine supports it."""
    if selected_runtime() != "langgraph":
        return False

    from app.services.agent_runtime.langgraph_executor import resume_workflow_langgraph

    return await resume_workflow_langgraph(thread_id, resume_payload, send_event)
