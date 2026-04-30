from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException

from app.database import supabase
from app.models.execution import ExecutionStepCreate, ExecutionStepUpdate


def create_run(user_id: UUID, thread_id: UUID, trigger_message_id: UUID | None = None) -> dict:
    # Verify thread ownership
    thread = (
        supabase.table("threads")
        .select("id")
        .eq("id", str(thread_id))
        .eq("user_id", str(user_id))
        .single()
        .execute()
    )
    if not thread.data:
        raise HTTPException(status_code=404, detail="Thread not found")

    payload = {
        "thread_id": str(thread_id),
        "trigger_message_id": str(trigger_message_id) if trigger_message_id else None,
        "status": "running",
    }
    resp = supabase.table("execution_runs").insert(payload).execute()
    return resp.data[0]


def complete_run(run_id: UUID, total_duration_ms: int, total_tokens: int, total_cost_usd: float, step_count: int) -> dict:
    resp = (
        supabase.table("execution_runs")
        .update({
            "status": "completed",
            "total_duration_ms": total_duration_ms,
            "total_tokens": total_tokens,
            "total_cost_usd": total_cost_usd,
            "step_count": step_count,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", str(run_id))
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Run not found")
    return resp.data[0]


def fail_run(run_id: UUID) -> dict:
    resp = (
        supabase.table("execution_runs")
        .update({
            "status": "failed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", str(run_id))
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Run not found")
    return resp.data[0]


def get_run(user_id: UUID, run_id: UUID) -> dict:
    resp = (
        supabase.table("execution_runs")
        .select("*, threads!inner(user_id)")
        .eq("id", str(run_id))
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Run not found")
    if resp.data.get("threads", {}).get("user_id") != str(user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    resp.data.pop("threads", None)
    return resp.data


def create_step(run_id: UUID, data: ExecutionStepCreate) -> dict:
    payload = data.model_dump()
    payload["run_id"] = str(run_id)
    resp = supabase.table("execution_steps").insert(payload).execute()
    return resp.data[0]


def update_step(step_id: UUID, data: ExecutionStepUpdate) -> dict:
    payload = data.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    resp = (
        supabase.table("execution_steps")
        .update(payload)
        .eq("id", str(step_id))
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Step not found")
    return resp.data[0]


def get_run_steps(user_id: UUID, run_id: UUID) -> list:
    # Verify ownership via run
    get_run(user_id, run_id)
    resp = (
        supabase.table("execution_steps")
        .select("*")
        .eq("run_id", str(run_id))
        .order("step_number", desc=False)
        .execute()
    )
    return resp.data


def create_annotation(user_id: UUID, step_id: UUID, text: str) -> dict:
    payload = {
        "step_id": str(step_id),
        "user_id": str(user_id),
        "annotation_text": text,
    }
    resp = supabase.table("pm_annotations").insert(payload).execute()
    return resp.data[0]


def get_step_annotations(step_id: UUID) -> list:
    resp = (
        supabase.table("pm_annotations")
        .select("*")
        .eq("step_id", str(step_id))
        .order("created_at", desc=False)
        .execute()
    )
    return resp.data


# ── Execution Events (Section G) ──────────────────────────

def get_run_events(user_id: UUID, run_id: UUID, event_type: str | None = None) -> list:
    """Fetch execution events for a run, optionally filtered by type."""
    get_run(user_id, run_id)  # verify ownership
    query = (
        supabase.table("execution_events")
        .select("*")
        .eq("execution_id", str(run_id))
        .order("timestamp", desc=False)
    )
    if event_type:
        query = query.eq("event_type", event_type)
    resp = query.execute()
    return resp.data


def get_run_summary(user_id: UUID, run_id: UUID) -> dict:
    """Compute aggregated execution summary from events."""
    run = get_run(user_id, run_id)
    events = get_run_events(user_id, run_id)

    total_input_tokens = 0
    total_output_tokens = 0
    total_thinking_tokens = 0
    total_cache_read = 0
    total_cache_write = 0
    total_cost = 0.0
    llm_call_count = 0
    tool_call_count = 0
    models_used = set()
    tools_used = set()
    cost_by_model = {}
    cost_by_node = {}
    path_taken = []

    for evt in events:
        data = evt.get("data", {})
        etype = evt.get("event_type", "")

        if etype == "llm_call_completed":
            llm_call_count += 1
            model = data.get("model_id", "")
            if model:
                models_used.add(model)
            in_tok = data.get("input_tokens", 0)
            out_tok = data.get("output_tokens", 0)
            think_tok = data.get("thinking_tokens", 0)
            cache_r = data.get("cache_read_tokens", 0)
            cache_w = data.get("cache_write_tokens", 0)
            cost = data.get("cost_usd", 0)

            total_input_tokens += in_tok
            total_output_tokens += out_tok
            total_thinking_tokens += think_tok
            total_cache_read += cache_r
            total_cache_write += cache_w
            total_cost += cost

            cost_by_model[model] = cost_by_model.get(model, 0) + cost

        elif etype == "tool_completed":
            tool_call_count += 1
            tool = data.get("tool_name", "")
            if tool:
                tools_used.add(tool)

        elif etype == "node_completed":
            node_id = data.get("node_id", "")
            node_cost = data.get("total_cost_usd", 0)
            if node_id:
                cost_by_node[node_id] = cost_by_node.get(node_id, 0) + node_cost

        elif etype == "workflow_completed":
            path_taken = data.get("path_taken", [])

    return {
        "execution_id": str(run_id),
        "status": run.get("status", ""),
        "total_duration_ms": run.get("total_duration_ms", 0),
        "total_tokens": run.get("total_tokens", 0),
        "total_input_tokens": total_input_tokens,
        "total_output_tokens": total_output_tokens,
        "total_thinking_tokens": total_thinking_tokens,
        "total_cache_read_tokens": total_cache_read,
        "total_cache_write_tokens": total_cache_write,
        "total_cost_usd": round(total_cost, 6),
        "total_llm_calls": llm_call_count,
        "total_tool_calls": tool_call_count,
        "step_count": run.get("step_count", 0),
        "path_taken": path_taken,
        "models_used": sorted(models_used),
        "tools_used": sorted(tools_used),
        "cost_by_model": cost_by_model,
        "cost_by_node": cost_by_node,
    }


# ── Display Settings (Section I) ─────────────────────────

def get_display_settings(user_id: UUID) -> dict:
    """Get or create display settings for a user."""
    resp = (
        supabase.table("display_settings")
        .select("*")
        .eq("user_id", str(user_id))
        .execute()
    )
    if resp.data:
        return resp.data[0]

    # Create default settings
    default = {
        "user_id": str(user_id),
        "settings": {
            "show_inner_llm_calls": True,
            "show_tool_call_details": True,
            "show_thinking": True,
            "show_system_prompts": True,
            "show_raw_messages": False,
            "show_token_counts": True,
            "show_costs": True,
            "show_edge_evaluations": True,
            "show_mapping_details": True,
            "stream_text": True,
            "stream_thinking": True,
            "show_live_tool_cards": True,
            "show_progress_bar": True,
            "show_activity_log": False,
            "show_cost_breakdown": True,
            "show_token_heatmap": False,
            "show_latency_waterfall": True,
            "enable_comparison_view": True,
        },
    }
    resp = supabase.table("display_settings").insert(default).execute()
    return resp.data[0] if resp.data else default


def update_display_settings(user_id: UUID, settings: dict) -> dict:
    """Update display settings for a user."""
    existing = get_display_settings(user_id)
    merged = {**existing.get("settings", {}), **settings}
    resp = (
        supabase.table("display_settings")
        .update({"settings": merged, "updated_at": datetime.now(timezone.utc).isoformat()})
        .eq("user_id", str(user_id))
        .execute()
    )
    if resp.data:
        return resp.data[0]
    return {"user_id": str(user_id), "settings": merged}
