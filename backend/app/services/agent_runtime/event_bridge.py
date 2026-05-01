"""Translate LangGraph runtime activity into the existing product event model."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.database import supabase
from app.services.event_emitter import EventEmitter
from app.services.workflow_executor import _build_config_snapshot, _build_full_config_snapshot


class LangGraphEventBridge:
    """Compatibility bridge for the current workspace UI and Inspector."""

    def __init__(self, *, thread_id: str, ctx: dict[str, Any], send_event):
        self.thread_id = thread_id
        self.ctx = ctx
        self.send_event = send_event
        self.run_id: str | None = None
        self.emitter: EventEmitter | None = None

    async def start_run(self, step_count: int) -> tuple[str, EventEmitter]:
        workflow = self.ctx.get("workflow") or {}
        run = supabase.table("execution_runs").insert({
            "thread_id": self.thread_id,
            "status": "running",
            "workflow_id": self.ctx.get("workflow_id"),
            "configuration_id": self.ctx.get("configuration_id"),
            "config_snapshot": _build_full_config_snapshot(self.ctx),
            "metadata": {"runtime": "langgraph"},
        }).execute()
        self.run_id = run.data[0]["id"]
        self.emitter = EventEmitter(self.run_id, self.send_event)

        await self.emitter.workflow_started(
            workflow_id=workflow.get("id", ""),
            workflow_name=workflow.get("workflow_name", ""),
            trigger="user_message",
            user_input=self.ctx.get("raw_user_message", ""),
            config_snapshot=_build_full_config_snapshot(self.ctx),
            step_count=step_count,
        )
        await self.send_event({
            "type": "run_started",
            "run_id": self.run_id,
            "step_count": step_count,
            "config_snapshot": {
                **_build_config_snapshot(self.ctx),
                "runtime": "langgraph",
            },
        })

        return self.run_id, self.emitter

    async def complete_run(self, state: dict[str, Any]):
        if not self.run_id or not self.emitter:
            return

        total_cost = float(state.get("total_cost_usd") or 0)
        total_tokens = int(state.get("total_tokens") or 0)
        total_duration = int(state.get("total_duration_ms") or 0)
        path_taken = state.get("path_taken") or []
        final_output = str(state.get("final_output") or "")

        supabase.table("execution_runs").update({
            "status": "completed",
            "total_duration_ms": total_duration,
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 4),
            "step_count": len(path_taken),
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "total_input_tokens": int(state.get("total_input_tokens") or 0),
            "total_output_tokens": int(state.get("total_output_tokens") or 0),
            "total_thinking_tokens": int(state.get("total_thinking_tokens") or 0),
            "total_llm_calls": int(state.get("total_llm_calls") or 0),
            "total_tool_calls": int(state.get("total_tool_calls") or 0),
            "path_taken": path_taken,
            "models_used": state.get("models_used") or [],
            "tools_used": state.get("tools_used") or [],
            "cost_by_model": state.get("cost_by_model") or {},
            "cost_by_node": state.get("cost_by_node") or {},
            "metadata": {
                "runtime": "langgraph",
                "langsmith_trace_url": state.get("langsmith_trace_url"),
            },
        }).eq("id", self.run_id).execute()

        await self.emitter.workflow_completed(
            status="completed",
            final_output=final_output,
            total_duration_ms=total_duration,
            total_tokens=total_tokens,
            total_cost_usd=total_cost,
            path_taken=path_taken,
        )
        await self.send_event({
            "type": "run_completed",
            "run_id": self.run_id,
            "total_duration_ms": total_duration,
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 6),
            "total_llm_calls": int(state.get("total_llm_calls") or 0),
            "total_tool_calls": int(state.get("total_tool_calls") or 0),
            "total_input_tokens": int(state.get("total_input_tokens") or 0),
            "total_output_tokens": int(state.get("total_output_tokens") or 0),
            "total_thinking_tokens": int(state.get("total_thinking_tokens") or 0),
            "progress_pct": 100.0,
            "path_taken": path_taken,
            "models_used": state.get("models_used") or [],
            "tools_used": state.get("tools_used") or [],
            "langsmith_trace_url": state.get("langsmith_trace_url"),
            "runtime": "langgraph",
        })

    async def emit_created_files(self, created_files: list[dict[str, Any]]) -> None:
        """Notify the workspace UI so the Artifacts tab selects generated files."""
        for file in created_files:
            file_id = file.get("file_id") or file.get("id")
            if not file_id:
                continue
            await self.send_event({
                "type": "file_created",
                "file_id": file_id,
                "file_name": file.get("file_name", "Artifact"),
                "file_type": file.get("file_type", ""),
                "operation_type": "creation",
                "runtime": "langgraph",
            })

    async def fail_run(self, error: Exception):
        if not self.run_id:
            return
        supabase.table("execution_runs").update({
            "status": "failed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "metadata": {"runtime": "langgraph", "error": str(error)},
        }).eq("id", self.run_id).execute()
        await self.send_event({"type": "run_failed", "run_id": self.run_id, "error": str(error)})
