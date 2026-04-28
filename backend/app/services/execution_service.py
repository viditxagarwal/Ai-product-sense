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
