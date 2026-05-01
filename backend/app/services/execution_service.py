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


# ── Test Single Node (standalone) ─────────────────────────

async def test_node(user_id: UUID, node_config: dict, input_data: str, config_id: str | None = None) -> dict:
    """Execute a single node with provided config and input, no workflow required."""
    import time as _time

    # Load configuration if provided
    config: dict = {}
    system_prompt = ""
    if config_id:
        cfg = supabase.table("configurations").select("*").eq("id", config_id).single().execute()
        if cfg.data:
            config = cfg.data
            if cfg.data.get("prompt_version_id"):
                pv = (
                    supabase.table("prompt_versions")
                    .select("prompt_text")
                    .eq("id", cfg.data["prompt_version_id"])
                    .single()
                    .execute()
                )
                if pv.data:
                    system_prompt = pv.data.get("prompt_text", "")

    # Build messages
    node_system_prompt = node_config.get("systemPrompt", "") or system_prompt
    messages: list[dict] = []
    if node_system_prompt:
        messages.append({"role": "system", "content": node_system_prompt})
    messages.append({"role": "user", "content": str(input_data)})

    # Resolve model parameters
    model = (
        node_config.get("model")
        or node_config.get("modelOverride")
        or config.get("primary_model", "gpt-4o-mini")
    )
    temperature = float(node_config.get("temperature", config.get("temperature", 0.2)))
    max_tokens = int(node_config.get("maxOutputTokens", config.get("max_output_tokens", 4096)))

    from app.services.llm_service import StreamingContext, call_llm_streaming

    streaming_ctx = StreamingContext()
    output = ""
    start = _time.time()

    try:
        async for chunk in call_llm_streaming(
            user_id=str(user_id),
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            streaming_ctx=streaming_ctx,
        ):
            output += chunk

        return {
            "output": output,
            "tokens": {
                "input": streaming_ctx.total_input_tokens,
                "output": streaming_ctx.total_output_tokens,
                "thinking": streaming_ctx.total_thinking_tokens,
                "total": streaming_ctx.total_tokens,
            },
            "cost_usd": round(streaming_ctx.total_cost_usd, 6),
            "duration_ms": streaming_ctx.total_duration_ms,
            "llm_calls": [c.to_dict() for c in streaming_ctx.llm_calls],
            "tool_calls": [c.to_dict() for c in streaming_ctx.tool_calls],
            "model": model,
            "errors": [],
        }
    except Exception as e:
        elapsed_ms = int((_time.time() - start) * 1000)
        return {
            "output": "",
            "tokens": {"input": 0, "output": 0, "thinking": 0, "total": 0},
            "cost_usd": 0,
            "duration_ms": elapsed_ms,
            "llm_calls": [],
            "tool_calls": [],
            "model": model,
            "errors": [str(e)],
        }


# ── Test This Step (T3.5) ────────────────────────────────

async def test_single_step(
    user_id: UUID,
    workflow_id: str,
    node_id: str,
    input_payload: dict,
    configuration_id: str | None = None,
) -> dict:
    """Execute a single workflow node in isolation for testing."""
    import time as _time
    from app.services.workflow_executor import WorkflowGraph, _execute_node_llm

    # Fetch workflow graph
    wf = (
        supabase.table("workflows")
        .select("graph_data")
        .eq("id", workflow_id)
        .single()
        .execute()
    )
    if not wf.data:
        raise HTTPException(status_code=404, detail="Workflow not found")

    graph = WorkflowGraph(wf.data.get("graph_data", {}))
    node = graph.nodes.get(node_id)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node '{node_id}' not found in workflow")

    # Load configuration if provided
    config_snapshot = {}
    if configuration_id:
        cfg = (
            supabase.table("configurations")
            .select("*")
            .eq("id", configuration_id)
            .single()
            .execute()
        )
        if cfg.data:
            config_snapshot = cfg.data

    node_data = node.get("data", {})
    start = _time.time()

    try:
        from app.services.llm_service import StreamingContext, call_llm_streaming
        from app.services.tool_executor import build_openai_tools, fetch_tools_by_ids

        # Build system prompt from node
        system_prompt = node_data.get("systemPrompt", "You are a helpful assistant.")

        # Fetch tools if bound
        tool_ids = node_data.get("boundTools") or node_data.get("boundToolIds", [])
        tools_openai = []
        tools_map = {}
        if tool_ids:
            tools_db = fetch_tools_by_ids(tool_ids)
            tools_openai, tools_map = build_openai_tools(tools_db)

        # Build messages
        messages = [{"role": "system", "content": system_prompt}]
        user_input = input_payload.get("message", input_payload.get("input", str(input_payload)))
        messages.append({"role": "user", "content": str(user_input)})

        model = (
            node_data.get("modelOverride")
            or node_data.get("model")
            or config_snapshot.get("primary_model")
            or config_snapshot.get("model")
            or "gpt-4o-mini"
        )
        temperature = node_data.get("temperature", config_snapshot.get("temperature", 0.7))

        # Non-streaming call for test via OpenAI-compatible client
        from app.services.llm_service import get_api_key_for_user, _resolve_provider

        provider = _resolve_provider(model)
        key_data = get_api_key_for_user(str(user_id), provider)
        if not key_data:
            raise Exception(f"No API key found for provider '{provider}'")
        api_key = key_data["api_key"]

        from openai import AsyncOpenAI
        base_url = {"openai": "https://api.openai.com/v1", "groq": "https://api.groq.com/openai/v1"}.get(provider)
        client = AsyncOpenAI(api_key=api_key, base_url=base_url)

        kwargs: dict = {"model": model, "messages": messages, "temperature": temperature}
        if tools_openai:
            kwargs["tools"] = tools_openai

        resp = await client.chat.completions.create(**kwargs)
        choice = resp.choices[0]
        elapsed_ms = int((_time.time() - start) * 1000)

        return {
            "status": "completed",
            "node_id": node_id,
            "node_name": node_data.get("label", node_id),
            "output": choice.message.content or "",
            "model": model,
            "tokens_used": resp.usage.total_tokens if resp.usage else 0,
            "duration_ms": elapsed_ms,
            "tool_calls": [tc.model_dump() for tc in (choice.message.tool_calls or [])],
        }

    except Exception as e:
        elapsed_ms = int((_time.time() - start) * 1000)
        return {
            "status": "failed",
            "node_id": node_id,
            "node_name": node_data.get("label", node_id),
            "error": str(e),
            "duration_ms": elapsed_ms,
        }


# ── Export & Replay (T3.6) ───────────────────────────────

def export_run(user_id: UUID, run_id: UUID) -> dict:
    """Export full execution trace as a portable JSON object."""
    run = get_run(user_id, run_id)
    steps = get_run_steps(user_id, run_id)
    events = get_run_events(user_id, run_id)
    summary = get_run_summary(user_id, run_id)

    return {
        "export_version": "1.0",
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "run": run,
        "steps": steps,
        "events": events,
        "summary": summary,
    }


def export_execution(run_id: str) -> dict:
    """Export full execution data (run + steps + events) as JSON, by run_id string."""
    run = supabase.table("execution_runs").select("*").eq("id", run_id).single().execute()
    if not run.data:
        raise HTTPException(status_code=404, detail="Execution run not found")

    steps = (
        supabase.table("execution_steps")
        .select("*")
        .eq("run_id", run_id)
        .order("step_number")
        .execute()
    )
    events = (
        supabase.table("execution_events")
        .select("*")
        .eq("execution_id", run_id)
        .order("timestamp")
        .execute()
    )

    return {
        "execution_id": run_id,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "execution_run": run.data,
        "steps": steps.data or [],
        "events": events.data or [],
    }


def create_replay_run(user_id: UUID, thread_id: UUID, source_run_id: UUID) -> dict:
    """Create a new run that references a source run for replay."""
    source = get_run(user_id, source_run_id)

    payload = {
        "thread_id": str(thread_id),
        "status": "pending",
        "metadata": {
            "replay_source": str(source_run_id),
            "original_status": source.get("status"),
        },
    }
    resp = supabase.table("execution_runs").insert(payload).execute()
    return resp.data[0]


# ── Alert Thresholds (T3.8) ──────────────────────────────

def create_alert_threshold(user_id: UUID, threshold: dict) -> dict:
    """Create an alert threshold for execution metrics."""
    payload = {
        "user_id": str(user_id),
        **threshold,
    }
    resp = supabase.table("alert_thresholds").insert(payload).execute()
    return resp.data[0]


def list_alert_thresholds(user_id: UUID) -> list:
    """List all alert thresholds for a user."""
    resp = (
        supabase.table("alert_thresholds")
        .select("*")
        .eq("user_id", str(user_id))
        .order("created_at", desc=False)
        .execute()
    )
    return resp.data


def delete_alert_threshold(user_id: UUID, threshold_id: UUID) -> None:
    """Delete an alert threshold."""
    resp = (
        supabase.table("alert_thresholds")
        .delete()
        .eq("id", str(threshold_id))
        .eq("user_id", str(user_id))
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Threshold not found")


def get_run_alerts(user_id: UUID, run_id: UUID) -> list:
    """Get alerts triggered by a specific run."""
    get_run(user_id, run_id)  # verify ownership
    resp = (
        supabase.table("triggered_alerts")
        .select("*")
        .eq("run_id", str(run_id))
        .order("triggered_at", desc=False)
        .execute()
    )
    return resp.data


def evaluate_alerts_for_run(user_id: UUID, run_id: UUID) -> list:
    """Evaluate all user thresholds against a completed run. Returns triggered alerts."""
    run = get_run(user_id, run_id)
    thresholds = list_alert_thresholds(user_id)
    triggered = []

    for t in thresholds:
        metric = t.get("metric", "")
        operator = t.get("operator", "gt")
        threshold_value = t.get("value", 0)
        actual_value = run.get(metric)

        if actual_value is None:
            continue

        fired = False
        if operator == "gt" and actual_value > threshold_value:
            fired = True
        elif operator == "gte" and actual_value >= threshold_value:
            fired = True
        elif operator == "lt" and actual_value < threshold_value:
            fired = True
        elif operator == "lte" and actual_value <= threshold_value:
            fired = True

        if fired:
            alert_payload = {
                "threshold_id": t["id"],
                "run_id": str(run_id),
                "user_id": str(user_id),
                "metric": metric,
                "threshold_value": threshold_value,
                "actual_value": actual_value,
                "operator": operator,
                "action": t.get("action", "log"),
            }
            resp = supabase.table("triggered_alerts").insert(alert_payload).execute()
            if resp.data:
                triggered.append(resp.data[0])

    return triggered


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
