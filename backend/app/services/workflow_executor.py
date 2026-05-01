"""Workflow executor — graph-based traversal with conditional routing,
loops, splits, gate reviews, and edge mapping.

Enhanced to emit execution events (Section G) and capture full Layer 1-4
data (Section A) for every LLM call, tool execution, and node step.

Tier 2: Replaces linear topological-sort execution with true graph traversal
that follows edges, evaluates conditions (5 levels), handles loops,
parallel splits, gate reviews, and inputOutputMapping transforms.

If the workflow fails for ANY reason, falls back to a direct LLM call
with the system prompt + user message. The user always gets a response.
"""

import asyncio
import json
import logging
import re
import time
import traceback
from datetime import datetime, timezone
from functools import partial
from typing import Any

from app.database import supabase
from app.services.event_emitter import EventEmitter
from app.services.llm_service import (
    StreamingContext,
    call_llm_streaming,
)
from app.services.file_context_service import (
    build_thread_file_context,
    persist_artifacts_from_output,
)
from app.services.prompt_injector import build_config_injections
from app.services.tool_executor import (
    build_openai_tools,
    execute_tool_call,
    fetch_tools_by_ids,
)

logger = logging.getLogger("ws.executor")


# ══════════════════════════════════════════════════════════════
# Graph data structures
# ══════════════════════════════════════════════════════════════

class WorkflowGraph:
    """Parsed workflow graph with adjacency and lookup helpers."""

    def __init__(self, graph_data: dict):
        self.nodes: dict[str, dict] = {}
        self.edges: list[dict] = []
        self.outgoing: dict[str, list[dict]] = {}  # node_id -> list of edges
        self.incoming: dict[str, list[dict]] = {}   # node_id -> list of edges

        for n in graph_data.get("nodes", []):
            nid = n["id"]
            self.nodes[nid] = n
            self.outgoing[nid] = []
            self.incoming[nid] = []

        for e in graph_data.get("edges", []):
            self.edges.append(e)
            src = e.get("source")
            tgt = e.get("target")
            if src in self.outgoing:
                self.outgoing[src].append(e)
            if tgt in self.incoming:
                self.incoming[tgt].append(e)

    def find_start_node(self) -> str | None:
        """Find the start node (componentType=start or type=start, or node with in_degree=0)."""
        for nid, node in self.nodes.items():
            data = node.get("data", {})
            ct = data.get("componentType", node.get("type", ""))
            if ct == "start":
                return nid
        # Fallback: first node with no incoming edges
        for nid in self.nodes:
            if not self.incoming.get(nid):
                return nid
        return None

    def get_node_type(self, node_id: str) -> str:
        """Get the effective component type of a node."""
        node = self.nodes.get(node_id)
        if not node:
            return "unknown"
        data = node.get("data", {})
        return data.get("componentType", node.get("type", "step"))

    def get_node_data(self, node_id: str) -> dict:
        node = self.nodes.get(node_id, {})
        return node.get("data", {})

    def get_node_label(self, node_id: str) -> str:
        data = self.get_node_data(node_id)
        return data.get("label", self.get_node_type(node_id))


# ══════════════════════════════════════════════════════════════
# Edge condition evaluation (5 levels)
# ══════════════════════════════════════════════════════════════

def _extract_field_value(output: Any, field_path: str) -> Any:
    """Extract a value from step output by field path (dot-notation or 'full_output')."""
    if field_path in ("full_output", "output", ""):
        return str(output) if not isinstance(output, str) else output
    if isinstance(output, dict):
        parts = field_path.split(".")
        val = output
        for p in parts:
            if isinstance(val, dict):
                val = val.get(p)
            else:
                return None
        return val
    # For string output, the whole thing is the value
    return str(output)


def _eval_field_comparison(output: Any, field: str, operator: str, value: str) -> bool:
    """Level 1: Simple field comparison."""
    actual = _extract_field_value(output, field or "full_output")
    actual_str = str(actual) if actual is not None else ""
    try:
        actual_num = float(actual_str) if actual_str else None
        value_num = float(value) if value else None
    except (ValueError, TypeError):
        actual_num = None
        value_num = None

    match operator:
        case "equals": return actual_str == value
        case "not_equals": return actual_str != value
        case "contains": return value in actual_str
        case "not_contains": return value not in actual_str
        case "starts_with": return actual_str.startswith(value)
        case "ends_with": return actual_str.endswith(value)
        case "is_empty": return not actual_str.strip()
        case "is_not_empty": return bool(actual_str.strip())
        case "matches_regex": return bool(re.search(value, actual_str))
        case "in_list":
            items = [v.strip() for v in value.split(",")]
            return actual_str in items
        case "not_in_list":
            items = [v.strip() for v in value.split(",")]
            return actual_str not in items
        case "greater_than": return actual_num is not None and value_num is not None and actual_num > value_num
        case "less_than": return actual_num is not None and value_num is not None and actual_num < value_num
        case "greater_than_or_equal": return actual_num is not None and value_num is not None and actual_num >= value_num
        case "less_than_or_equal": return actual_num is not None and value_num is not None and actual_num <= value_num
        case _: return False


def _eval_pattern_match(output: Any, field: str, operator: str, value: str) -> bool:
    """Level 2: Pattern matching."""
    actual = _extract_field_value(output, field or "full_output")
    actual_str = str(actual) if actual is not None else ""
    match operator:
        case "contains": return value in actual_str
        case "regex": return bool(re.search(value, actual_str))
        case "starts_with": return actual_str.startswith(value)
        case "ends_with": return actual_str.endswith(value)
        case _: return False


def _eval_multi_condition(output: Any, rules: list[dict], combinator: str) -> bool:
    """Level 3: Multiple conditions with AND/OR."""
    if not rules:
        return True
    results = [
        _eval_field_comparison(output, r.get("field", ""), r.get("operator", "equals"), r.get("value", ""))
        for r in rules
    ]
    if combinator == "OR":
        return any(results)
    return all(results)  # AND is default


async def _eval_llm_evaluation(
    output: Any, prompt: str, model: str, threshold: float,
    response_mapping: dict | None, user_id: str,
) -> tuple[bool, dict]:
    """Level 4: LLM-based condition evaluation. Returns (result, details)."""
    eval_prompt = f"{prompt}\n\nContent to evaluate:\n{str(output)[:2000]}"
    messages = [
        {"role": "system", "content": "You are an evaluation agent. Respond with YES or NO followed by a confidence score 0-100 and brief reasoning. Format: YES|85|reason or NO|30|reason"},
        {"role": "user", "content": eval_prompt},
    ]
    response = ""
    async for chunk in call_llm_streaming(
        user_id=user_id, model=model or "gpt-4o-mini",
        messages=messages, temperature=0.1, max_tokens=200,
    ):
        response += chunk

    # Parse response: "YES|85|reason" or "NO|30|reason"
    parts = response.strip().split("|", 2)
    decision = parts[0].strip().upper() if parts else "NO"
    confidence = 0.0
    reason = ""
    if len(parts) >= 2:
        try:
            confidence = float(parts[1].strip()) / 100.0
        except ValueError:
            confidence = 0.5
    if len(parts) >= 3:
        reason = parts[2].strip()

    result = decision == "YES" and confidence >= threshold
    details = {"decision": decision, "confidence": confidence, "reason": reason, "threshold": threshold}

    # Apply response mapping if provided
    if response_mapping and decision in response_mapping:
        details["mapped_target"] = response_mapping[decision]

    return result, details


async def _eval_webhook(url: str, input_mapping: dict | None, response_field: str,
                         output: Any) -> tuple[bool, dict]:
    """Level 5: Webhook-based condition evaluation."""
    import httpx
    payload = {}
    if input_mapping:
        for target_key, source_expr in input_mapping.items():
            payload[target_key] = _extract_field_value(output, source_expr)
    else:
        payload["output"] = str(output)[:2000]

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            field_val = data.get(response_field, data.get("result", False))
            result = bool(field_val)
            return result, {"webhook_status": resp.status_code, "response": data}
    except Exception as e:
        logger.warning("[exec] Webhook evaluation failed: %s", e)
        return False, {"webhook_error": str(e)}


async def evaluate_edge_condition(edge: dict, output: Any, user_id: str) -> tuple[bool, dict]:
    """Evaluate an edge's condition at the appropriate level. Returns (passed, details)."""
    edge_data = edge.get("data", {})
    method = edge_data.get("conditionMethod", "")

    if not method:
        # No condition = unconditional edge (always passes)
        return True, {"method": "unconditional"}

    match method:
        case "field_comparison":
            result = _eval_field_comparison(
                output,
                edge_data.get("conditionField", ""),
                edge_data.get("conditionOperator", "equals"),
                edge_data.get("conditionValue", ""),
            )
            return result, {"method": method, "field": edge_data.get("conditionField"),
                            "operator": edge_data.get("conditionOperator"), "value": edge_data.get("conditionValue")}

        case "pattern_match":
            result = _eval_pattern_match(
                output,
                edge_data.get("patternField", "full_output"),
                edge_data.get("patternOperator", "contains"),
                edge_data.get("patternValue", ""),
            )
            return result, {"method": method, "field": edge_data.get("patternField"),
                            "operator": edge_data.get("patternOperator"), "value": edge_data.get("patternValue")}

        case "multi_condition":
            rules = edge_data.get("conditionRules", [])
            combinator = edge_data.get("conditionCombinator", "AND")
            result = _eval_multi_condition(output, rules, combinator)
            return result, {"method": method, "combinator": combinator, "rule_count": len(rules)}

        case "llm_evaluation":
            result, details = await _eval_llm_evaluation(
                output,
                edge_data.get("conditionPrompt", ""),
                edge_data.get("evaluatorModel", "gpt-4o-mini"),
                edge_data.get("confidenceThreshold", 0.7),
                edge_data.get("evaluationResponseMapping"),
                user_id,
            )
            return result, {**details, "method": method}

        case "webhook_function":
            result, details = await _eval_webhook(
                edge_data.get("webhookUrl", ""),
                edge_data.get("webhookInputMapping"),
                edge_data.get("webhookResponseField", "result"),
                output,
            )
            return result, {**details, "method": method}

        case _:
            return True, {"method": "unknown", "raw_method": method}


# ══════════════════════════════════════════════════════════════
# Input/Output Mapping transforms (Section E.2)
# ══════════════════════════════════════════════════════════════

def _apply_mapping(mappings: list[dict], source_output: Any) -> dict:
    """Apply inputOutputMapping transforms from an edge. Returns transformed context dict."""
    result: dict[str, Any] = {}
    for m in mappings:
        target = m.get("targetField", "")
        source_expr = m.get("sourceExpression", "")
        transform = m.get("transform", "direct")
        config = m.get("transformConfig", "")

        raw_value = _extract_field_value(source_output, source_expr)

        match transform:
            case "direct":
                result[target] = raw_value
            case "template":
                # config is a template string with {value} placeholder
                result[target] = config.replace("{value}", str(raw_value)) if config else str(raw_value)
            case "lookup":
                # config is JSON: {"key1": "val1", ...}
                try:
                    lookup_table = json.loads(config) if isinstance(config, str) else config
                    result[target] = lookup_table.get(str(raw_value), raw_value)
                except (json.JSONDecodeError, TypeError):
                    result[target] = raw_value
            case "jsonpath":
                # Simple jsonpath: just use dot-notation extraction
                result[target] = _extract_field_value(source_output, config or source_expr)
            case "type_cast":
                # config is target type: "int", "float", "str", "bool"
                try:
                    match config:
                        case "int": result[target] = int(float(str(raw_value)))
                        case "float": result[target] = float(str(raw_value))
                        case "bool": result[target] = str(raw_value).lower() in ("true", "1", "yes")
                        case _: result[target] = str(raw_value)
                except (ValueError, TypeError):
                    result[target] = raw_value
            case "expression":
                # config is a Python expression with `value` variable
                try:
                    result[target] = eval(config, {"__builtins__": {}}, {"value": raw_value})
                except Exception:
                    result[target] = raw_value
            case _:
                result[target] = raw_value

    return result


# ══════════════════════════════════════════════════════════════
# Config snapshot helpers
# ══════════════════════════════════════════════════════════════

def _build_config_snapshot(ctx: dict) -> dict:
    config = ctx.get("config") or {}
    return {
        "execution_trace_placement": config.get("execution_trace_placement", "inline_interleaved"),
        "harness_display_mode": config.get("harness_display_mode", "sequential_visible"),
        "intermediate_steps_in_chat": config.get("intermediate_steps_in_chat", "status_pills"),
        "explanation_depth": config.get("explanation_depth", "reasoning_plus_sources"),
        "confidence_display": config.get("confidence_display", "color_coded_bands"),
        "primary_model": config.get("primary_model", "gpt-4o-mini"),
        "temperature": float(config.get("temperature", 0.2)),
        "max_output_tokens": config.get("max_output_tokens", 4096),
        "streaming_mode": config.get("streaming_mode", "text_and_thinking"),
        "chain_of_thought_visibility": config.get("chain_of_thought_visibility", "auto"),
    }


def _build_full_config_snapshot(ctx: dict) -> dict:
    config = ctx.get("config") or {}
    snapshot = _build_config_snapshot(ctx)
    for key in ["memory_type", "buffer_size_messages", "routing_strategy",
                "tool_selection_strategy", "max_tool_calls_per_node",
                "guardrail_priority_order", "output_format", "citation_format"]:
        if key in config:
            snapshot[key] = config[key]
    return snapshot


def _normalize_streaming_mode(streaming_mode: str | None) -> str:
    """Map legacy DB values to the executor's current streaming modes."""
    legacy_map = {
        "token_by_token": "text_only",
        "chunk_by_section": "text_only",
        "structured_blocks": "text_only",
        "complete_then_render": "off",
    }
    return legacy_map.get(streaming_mode or "", streaming_mode or "text_and_thinking")


def _streaming_flags(streaming_mode: str | None) -> tuple[bool, bool]:
    normalized = _normalize_streaming_mode(streaming_mode)
    return (
        normalized in ("text_only", "text_and_thinking", "text_and_tools", "full"),
        normalized in ("text_and_thinking", "full"),
    )


def _with_file_context(user_message: str, file_context: dict | None) -> str:
    """Attach parsed thread files to the user message that enters the graph."""
    if not file_context or not file_context.get("text"):
        return user_message
    return (
        f"{user_message}\n\n"
        "## Assembled task context from uploaded files\n"
        f"{file_context['text']}"
    )


def _artifact_instruction() -> str:
    return (
        "\n\n## Artifact generation contract\n"
        "When the user asks for a downloadable or reusable artifact, include each artifact as a fenced block "
        "using this exact format:\n"
        '```artifact filename="descriptive-name.md" type="text/markdown"\n'
        "<artifact content>\n"
        "```\n"
        "Use the right extension and MIME type, for example text/markdown, text/csv, application/json, or text/plain."
    )


# ══════════════════════════════════════════════════════════════
# Resolve thread context
# ══════════════════════════════════════════════════════════════

def _get_thread_context(thread_id: str) -> dict:
    """Fetch thread, workflow, configuration, prompt, and user_id."""
    thread = supabase.table("threads").select("*").eq("id", thread_id).single().execute()
    if not thread.data:
        raise RuntimeError(f"Thread not found: {thread_id}")

    t = thread.data
    result = {
        "thread": t,
        "user_id": t["user_id"],
        "workflow_id": t["workflow_id"],
        "configuration_id": t["configuration_id"],
    }

    wf = supabase.table("workflows").select("*").eq("id", t["workflow_id"]).single().execute()
    result["workflow"] = wf.data if wf.data else None

    cfg = supabase.table("configurations").select("*").eq("id", t["configuration_id"]).single().execute()
    result["config"] = cfg.data if cfg.data else None

    system_prompt = ""
    if cfg.data and cfg.data.get("prompt_version_id"):
        pv = supabase.table("prompt_versions").select("prompt_text").eq("id", cfg.data["prompt_version_id"]).single().execute()
        if pv.data:
            system_prompt = pv.data.get("prompt_text", "") or pv.data.get("content", "")

    if cfg.data:
        config_injections = build_config_injections(cfg.data)
        if config_injections:
            system_prompt += config_injections

    if t.get("instructions"):
        if system_prompt:
            system_prompt += f"\n\n## Additional Instructions\n{t['instructions']}"
        else:
            system_prompt = t["instructions"]

    system_prompt += _artifact_instruction()
    result["system_prompt"] = system_prompt

    c = cfg.data if cfg.data else {}
    result["model"] = c.get("primary_model", "gpt-4o-mini")
    result["temperature"] = float(c.get("temperature", 0.2))
    result["max_tokens"] = c.get("max_output_tokens", 4096)
    result["top_p"] = float(c.get("top_p", 1.0))
    result["thread_id"] = thread_id
    result["max_tool_calls_per_node"] = c.get("max_tool_calls_per_node", 10)
    result["parallel_tool_calls"] = c.get("parallel_tool_calls", True)
    result["tool_call_timeout"] = c.get("tool_call_timeout", 30)
    result["tool_retry_on_failure"] = c.get("tool_retry_on_failure", 0)
    result["buffer_size_messages"] = c.get("buffer_size_messages", 20)
    result["stop_sequences"] = c.get("stop_sequences") or None
    result["json_schema"] = c.get("json_schema") or None
    result["thinking_enabled"] = c.get("thinking_enabled", False)
    result["thinking_budget_tokens"] = c.get("thinking_budget_tokens", 0)
    result["reasoning_effort"] = c.get("reasoning_effort") or None

    return result


def _get_conversation_history(thread_id: str, limit: int = 50) -> list[dict]:
    resp = (
        supabase.table("thread_messages")
        .select("role, content, message_type")
        .eq("thread_id", thread_id)
        .neq("message_type", "execution_trace")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    messages = []
    for m in reversed(resp.data or []):
        role = m["role"]
        if role not in ("user", "assistant"):
            continue
        messages.append({"role": role, "content": m["content"]})
    return messages


def _build_conversation_context(thread_id: str, ctx: dict) -> list[dict]:
    """Build conversation history based on the configured memory strategy."""
    config = ctx.get("config") or {}
    strategy = config.get("memory_type", "buffer_window")
    buffer_size = ctx.get("buffer_size_messages", 20)

    if strategy == "buffer" or strategy == "full_history":
        # Include all messages
        return _get_conversation_history(thread_id, limit=500)

    if strategy == "buffer_window" or strategy == "sliding_window":
        return _get_conversation_history(thread_id, limit=buffer_size)

    if strategy == "token_buffer":
        # Fetch more messages, then trim to approximate token budget
        buffer_tokens = int(config.get("buffer_size_tokens", 8000))
        messages = _get_conversation_history(thread_id, limit=100)
        trimmed = []
        token_estimate = 0
        for m in reversed(messages):
            msg_tokens = len(m.get("content", "")) // 4  # rough estimate
            if token_estimate + msg_tokens > buffer_tokens:
                break
            trimmed.insert(0, m)
            token_estimate += msg_tokens
        return trimmed

    if strategy == "summary":
        # Use buffer_window as base, with a note that summary should be generated
        # Full summary implementation requires an extra LLM call - stub for now
        return _get_conversation_history(thread_id, limit=buffer_size)

    # Default: buffer_window
    return _get_conversation_history(thread_id, limit=buffer_size)


# ══════════════════════════════════════════════════════════════
# Direct LLM call (fallback)
# ══════════════════════════════════════════════════════════════

async def _direct_llm_call(
    thread_id: str,
    user_message: str,
    send_event,
    ctx: dict,
    is_fallback: bool = False,
):
    """Simple direct LLM call — no workflow, no routing. Always produces output."""
    user_id = ctx["user_id"]
    model = ctx["model"]
    system_prompt = ctx["system_prompt"]
    temperature = ctx["temperature"]
    max_tokens = ctx["max_tokens"]
    top_p = ctx.get("top_p", 1.0)
    llm_user_message = ctx.get("assembled_user_message") or user_message
    file_context = ctx.get("file_context") or {"files": [], "total_chars": 0}
    buffer_size = ctx.get("buffer_size_messages", 20)

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    history = _build_conversation_context(thread_id, ctx)
    if history and history[-1]["role"] == "user" and history[-1]["content"] == user_message:
        history = history[:-1]
    messages.extend(history)
    messages.append({"role": "user", "content": llm_user_message})

    logger.info("[exec] Direct LLM call: model=%s messages=%d fallback=%s", model, len(messages), is_fallback)

    run = supabase.table("execution_runs").insert({
        "thread_id": thread_id,
        "status": "running",
        "workflow_id": ctx.get("workflow_id"),
        "configuration_id": ctx.get("configuration_id"),
        "config_snapshot": _build_full_config_snapshot(ctx),
    }).execute()
    run_id = run.data[0]["id"]

    config_snapshot = _build_config_snapshot(ctx)
    full_snapshot = _build_full_config_snapshot(ctx)
    emitter = EventEmitter(run_id, send_event)

    await emitter.workflow_started(
        workflow_id="direct",
        workflow_name=f"Direct Chat ({model})",
        trigger="user_message",
        user_input=user_message,
        config_snapshot=full_snapshot,
        step_count=1,
    )
    await send_event({
        "type": "run_started",
        "run_id": run_id,
        "step_count": 1,
        "config_snapshot": config_snapshot,
    })

    if is_fallback:
        await send_event({
            "type": "system_message",
            "content": "Running in direct mode (workflow execution failed). Your message is being sent directly to the LLM.",
            "severity": "warning",
        })

    step = supabase.table("execution_steps").insert({
        "run_id": run_id,
        "step_number": 1,
        "node_type": "direct_llm",
        "node_name": f"Direct Chat ({model})",
        "status": "running",
        "input_payload": {
            "node_id": "direct",
            "raw_user_message": user_message,
            "assembled_context": {
                "source": "thread_files",
                "file_count": len(file_context.get("files", [])),
                "parsed_characters": file_context.get("total_chars", 0),
                "files": file_context.get("files", []),
                "preview": (file_context.get("text") or "")[:4000],
            },
        },
    }).execute()
    step_id = step.data[0]["id"]

    node_event_id = await emitter.node_started(
        node_id="direct",
        node_label=f"Direct Chat ({model})",
        node_type="direct_llm",
        component_config={"model": model, "temperature": temperature, "max_output_tokens": max_tokens},
        input_context=llm_user_message,
        input_context_source="user_message+thread_files" if file_context.get("files") else "user_message",
    )

    await send_event({
        "type": "step_started",
        "step_id": step_id,
        "step_number": 1,
        "node_type": "direct_llm",
        "node_name": f"Direct Chat ({model})",
    })

    start_time = time.monotonic()
    full_response = ""
    streaming_ctx = StreamingContext()

    try:
        config = ctx.get("config") or {}
        _stream_text, _stream_thinking = _streaming_flags(
            config.get("streaming_mode", "text_and_thinking")
        )

        _thinking_started_flag_direct = [False]  # mutable container for closure

        async def _on_thinking_delta_direct(text):
            if not _thinking_started_flag_direct[0]:
                _thinking_started_flag_direct[0] = True
                await emitter.thinking_started(node_id="direct", parent_event_id=node_event_id)
            if _stream_thinking:
                await send_event({"type": "thinking_delta", "content": text})

        async for chunk in call_llm_streaming(
            user_id=user_id, model=model, messages=messages,
            temperature=temperature, max_tokens=max_tokens, top_p=top_p,
            streaming_ctx=streaming_ctx,
            on_thinking_delta=_on_thinking_delta_direct,
            stop_sequences=ctx.get("stop_sequences"),
            json_schema=ctx.get("json_schema"),
            thinking_enabled=ctx.get("thinking_enabled", False),
            thinking_budget_tokens=ctx.get("thinking_budget_tokens", 0),
            reasoning_effort=ctx.get("reasoning_effort"),
        ):
            full_response += chunk
            if _stream_text:
                await send_event({"type": "text_delta", "content": chunk})
            await emitter.step_progress(step_id, chunk)

        duration_ms = int((time.monotonic() - start_time) * 1000)

        for i, llm_call in enumerate(streaming_ctx.llm_calls):
            await emitter.llm_call_completed(
                node_id="direct", call_index=i,
                call_data=llm_call.to_dict(),
                parent_event_id=node_event_id,
            )

        supabase.table("execution_steps").update({
            "status": "completed",
            "duration_ms": duration_ms,
            "tokens_used": streaming_ctx.total_tokens,
            "cost_usd": round(streaming_ctx.total_cost_usd, 4),
            "output_payload": {
                "response_length": len(full_response),
                "input_tokens": streaming_ctx.total_input_tokens,
                "output_tokens": streaming_ctx.total_output_tokens,
                "thinking_tokens": streaming_ctx.total_thinking_tokens,
                "model": model,
            },
        }).eq("id", step_id).execute()

        await emitter.node_completed(
            node_id="direct", status="completed", output_result=full_response,
            duration_ms=duration_ms, total_tokens=streaming_ctx.total_tokens,
            total_cost_usd=streaming_ctx.total_cost_usd,
            llm_call_count=len(streaming_ctx.llm_calls),
            tool_call_count=len(streaming_ctx.tool_calls),
            parent_event_id=node_event_id,
        )

        await send_event({
            "type": "step_completed",
            "step_id": step_id,
            "step_number": 1,
            "duration_ms": duration_ms,
            "tokens": streaming_ctx.total_tokens,
            "cost_usd": round(streaming_ctx.total_cost_usd, 6),
            "result_summary": f"Generated {len(full_response)} chars",
        })

        models_used = list({c.model_id for c in streaming_ctx.llm_calls})
        tools_used = list({c.tool_name for c in streaming_ctx.tool_calls})
        cost_by_model: dict[str, float] = {}
        for c in streaming_ctx.llm_calls:
            cost_by_model[c.model_id] = cost_by_model.get(c.model_id, 0) + c.cost_usd

        supabase.table("execution_runs").update({
            "status": "completed",
            "total_duration_ms": duration_ms,
            "total_tokens": streaming_ctx.total_tokens,
            "total_cost_usd": round(streaming_ctx.total_cost_usd, 4),
            "step_count": 1,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "total_input_tokens": streaming_ctx.total_input_tokens,
            "total_output_tokens": streaming_ctx.total_output_tokens,
            "total_thinking_tokens": streaming_ctx.total_thinking_tokens,
            "total_llm_calls": len(streaming_ctx.llm_calls),
            "total_tool_calls": len(streaming_ctx.tool_calls),
            "path_taken": ["direct"],
            "models_used": models_used,
            "tools_used": tools_used,
            "cost_by_model": {k: round(v, 6) for k, v in cost_by_model.items()},
            "cost_by_node": {"direct": round(streaming_ctx.total_cost_usd, 6)},
        }).eq("id", run_id).execute()

        await emitter.workflow_completed(
            status="completed", final_output=full_response,
            total_duration_ms=duration_ms, total_tokens=streaming_ctx.total_tokens,
            total_cost_usd=streaming_ctx.total_cost_usd, path_taken=["direct"],
        )

        created_files = persist_artifacts_from_output(thread_id, full_response, trigger_step_id=step_id)
        for file in created_files:
            await send_event({
                "type": "file_created",
                "file_id": file["file_id"],
                "file_name": file["file_name"],
                "file_type": file["file_type"],
                "operation_type": "creation",
            })

        await send_event({
            "type": "run_completed",
            "run_id": run_id,
            "total_duration_ms": duration_ms,
            "total_tokens": streaming_ctx.total_tokens,
            "total_cost_usd": round(streaming_ctx.total_cost_usd, 6),
        })

        supabase.table("thread_messages").insert({
            "thread_id": thread_id,
            "role": "assistant",
            "content": "",
            "message_type": "execution_trace",
            "metadata": {"run_id": run_id},
        }).execute()

        supabase.table("thread_messages").insert({
            "thread_id": thread_id,
            "role": "assistant",
            "content": full_response,
            "message_type": "text",
            "metadata": {
                "run_id": run_id,
                "mode": "direct" if is_fallback else "normal",
                "model": model,
                "tokens": streaming_ctx.total_tokens,
                "cost_usd": round(streaming_ctx.total_cost_usd, 6),
                "duration_ms": duration_ms,
                "files": created_files,
            },
        }).execute()

        await send_event({"type": "assistant_message", "content": full_response, "files": created_files})

        logger.info("[exec] Direct LLM call completed: %d chars, %dms, %d tokens, $%.6f",
                     len(full_response), duration_ms, streaming_ctx.total_tokens, streaming_ctx.total_cost_usd)

    except Exception as e:
        error_msg = str(e)
        logger.error("[exec] Direct LLM call failed: %s\n%s", error_msg, traceback.format_exc())

        await emitter.error(
            node_id="direct", error_type="llm_error",
            error_message=error_msg, stack_trace=traceback.format_exc(),
        )

        supabase.table("execution_steps").update({"status": "failed"}).eq("id", step_id).execute()
        await send_event({
            "type": "step_completed", "step_id": step_id, "step_number": 1,
            "duration_ms": 0, "result_summary": f"Error: {error_msg}",
        })

        supabase.table("execution_runs").update({
            "status": "failed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", run_id).execute()

        await send_event({"type": "run_failed", "run_id": run_id, "error": error_msg})
        await send_event({"type": "execution_error", "error": error_msg})


# ══════════════════════════════════════════════════════════════
# Main entry point
# ══════════════════════════════════════════════════════════════

async def execute_workflow(thread_id: str, user_message: str, send_event):
    """Run the workflow. Falls back to direct LLM on any failure."""
    logger.info("[exec] === Starting execution: thread=%s ===", thread_id)
    logger.info("[exec] User message: '%s'", user_message[:200])

    try:
        ctx = _get_thread_context(thread_id)
    except Exception as e:
        logger.error("[exec] Failed to resolve thread context: %s\n%s", e, traceback.format_exc())
        await send_event({
            "type": "execution_error",
            "error": f"Failed to load thread context: {e}",
        })
        return

    max_context_chars = int((ctx.get("config") or {}).get("max_context_tokens", 12000)) * 4
    file_context = build_thread_file_context(thread_id, max_chars=min(max_context_chars, 60000))
    assembled_user_message = _with_file_context(user_message, file_context)
    ctx["file_context"] = file_context
    ctx["assembled_user_message"] = assembled_user_message

    if file_context.get("files"):
        await send_event({
            "type": "context_assembled",
            "file_count": len(file_context["files"]),
            "parsed_characters": file_context.get("total_chars", 0),
            "files": file_context["files"],
        })

    logger.info("[exec] Context resolved: model=%s workflow=%s config=%s prompt_len=%d",
                ctx["model"],
                ctx["workflow"]["workflow_name"] if ctx.get("workflow") else "NONE",
                ctx["config"]["config_name"] if ctx.get("config") else "NONE",
                len(ctx["system_prompt"]))

    workflow = ctx.get("workflow")
    graph_data = workflow.get("graph_data", {}) if workflow else {}

    # Build graph
    graph = WorkflowGraph(graph_data)
    if not graph.nodes:
        logger.info("[exec] No workflow nodes — using direct LLM call")
        await _direct_llm_call(thread_id, user_message, send_event, ctx)
        return

    logger.info("[exec] Workflow '%s' has %d nodes, %d edges",
                workflow.get("workflow_name"), len(graph.nodes), len(graph.edges))

    try:
        await _execute_workflow_graph(thread_id, user_message, send_event, ctx, graph)
    except Exception as e:
        logger.error("[exec] Workflow execution failed, falling back to direct LLM: %s\n%s",
                     e, traceback.format_exc())
        await send_event({
            "type": "system_message",
            "content": f"Workflow error: {e}",
            "severity": "error",
        })
        await _direct_llm_call(thread_id, user_message, send_event, ctx, is_fallback=True)


# ══════════════════════════════════════════════════════════════
# Graph-based workflow execution engine (Tier 2)
# ══════════════════════════════════════════════════════════════

async def _execute_node_llm(
    node_id: str, node_data: dict, node_messages: list[dict],
    ctx: dict, emitter: EventEmitter, send_event,
    step_id: str, step_number: int, node_event_id: str,
    graph_streaming_mode: str,
) -> tuple[str, StreamingContext]:
    """Execute an LLM call for a single node. Returns (output_text, streaming_ctx)."""
    user_id = ctx["user_id"]
    model = node_data.get("modelOverride") or node_data.get("model") or ctx["model"]
    temperature = node_data.get("temperature", ctx["temperature"])
    max_tokens = node_data.get("maxOutputTokens", ctx["max_tokens"])
    top_p = ctx.get("top_p", 1.0)

    # Resolve bound tools
    bound_tool_ids = node_data.get("boundTools", [])
    openai_tools = None
    tool_exec_fn = None

    if bound_tool_ids:
        tool_records = fetch_tools_by_ids(bound_tool_ids)
        if tool_records:
            openai_tools = build_openai_tools(tool_records)
            tool_exec_fn = partial(execute_tool_call, user_id=user_id, thread_id=ctx.get("thread_id"))
            logger.info("[exec] Node '%s' has %d bound tools", node_id, len(openai_tools))

    step_output = ""
    streaming_ctx = StreamingContext()

    async def _on_llm_call_start(call_idx, mdl, msgs):
        await emitter.llm_call_started(
            node_id=node_id, call_index=call_idx,
            model_id=mdl, provider="",
            temperature=temperature, max_output_tokens=max_tokens,
            parent_event_id=node_event_id,
        )

    async def _on_llm_call_complete(call_idx, call_result):
        await emitter.llm_call_completed(
            node_id=node_id, call_index=call_idx,
            call_data=call_result.to_dict(),
            parent_event_id=node_event_id,
        )

    async def _on_tool_start(tool_name, args):
        await emitter.tool_started(
            node_id=node_id, tool_name=tool_name,
            input_arguments=args, input_summary=f"{tool_name}: {str(args)[:100]}",
            parent_event_id=node_event_id,
        )

    async def _on_tool_complete(tool_result):
        await emitter.tool_completed(
            node_id=node_id, tool_data=tool_result.to_dict(),
            parent_event_id=node_event_id,
        )
        try:
            parsed = json.loads(tool_result.output_result)
        except (TypeError, json.JSONDecodeError):
            return
        if parsed.get("file_id"):
            await send_event({
                "type": "file_created",
                "file_id": parsed["file_id"],
                "file_name": parsed.get("file_name", "Artifact"),
                "file_type": parsed.get("file_type", ""),
                "operation_type": "creation",
            })

    _g_stream_text, _g_stream_thinking = _streaming_flags(graph_streaming_mode)

    _thinking_started_flag = [False]  # mutable container for closure

    async def _on_thinking_delta(text):
        if not _thinking_started_flag[0]:
            _thinking_started_flag[0] = True
            await emitter.thinking_started(node_id=node_id, parent_event_id=node_event_id)
        if _g_stream_thinking:
            await send_event({"type": "thinking_delta", "content": text})

    async for chunk in call_llm_streaming(
        user_id=user_id, model=model, messages=node_messages,
        temperature=temperature, max_tokens=max_tokens, top_p=top_p,
        tools=openai_tools, tool_executor_fn=tool_exec_fn,
        streaming_ctx=streaming_ctx,
        on_llm_call_start=_on_llm_call_start,
        on_llm_call_complete=_on_llm_call_complete,
        on_tool_start=_on_tool_start,
        on_tool_complete=_on_tool_complete,
        on_thinking_delta=_on_thinking_delta,
        max_tool_rounds=node_data.get("maxToolIterations") or ctx.get("max_tool_calls_per_node", 10),
        parallel_tool_calls=ctx.get("parallel_tool_calls", True),
        tool_call_timeout=ctx.get("tool_call_timeout", 30),
        tool_retry_on_failure=ctx.get("tool_retry_on_failure", 0),
        stop_sequences=ctx.get("stop_sequences"),
        json_schema=ctx.get("json_schema"),
        thinking_enabled=ctx.get("thinking_enabled", False),
        thinking_budget_tokens=ctx.get("thinking_budget_tokens", 0),
        reasoning_effort=ctx.get("reasoning_effort"),
    ):
        step_output += chunk
        if _g_stream_text:
            await send_event({"type": "text_delta", "content": chunk})
        await emitter.step_progress(step_id, chunk)

    return step_output, streaming_ctx


async def _execute_workflow_graph(
    thread_id: str, user_message: str, send_event, ctx: dict, graph: WorkflowGraph
):
    """Walk the workflow graph following edges, evaluating conditions, handling loops/splits/gates."""
    user_id = ctx["user_id"]
    model = ctx["model"]
    system_prompt = ctx["system_prompt"]
    temperature = ctx["temperature"]
    max_tokens = ctx["max_tokens"]
    buffer_size = ctx.get("buffer_size_messages", 20)
    llm_user_message = ctx.get("assembled_user_message") or user_message
    file_context = ctx.get("file_context") or {"files": [], "total_chars": 0, "text": ""}

    workflow = ctx.get("workflow", {})
    run = supabase.table("execution_runs").insert({
        "thread_id": thread_id,
        "status": "running",
        "workflow_id": ctx.get("workflow_id"),
        "configuration_id": ctx.get("configuration_id"),
        "config_snapshot": _build_full_config_snapshot(ctx),
    }).execute()
    run_id = run.data[0]["id"]

    config_snapshot = _build_config_snapshot(ctx)
    full_snapshot = _build_full_config_snapshot(ctx)
    emitter = EventEmitter(run_id, send_event)

    await emitter.workflow_started(
        workflow_id=workflow.get("id", ""),
        workflow_name=workflow.get("workflow_name", ""),
        trigger="user_message",
        user_input=user_message,
        config_snapshot=full_snapshot,
        step_count=len(graph.nodes),
    )
    await send_event({
        "type": "run_started",
        "run_id": run_id,
        "step_count": len(graph.nodes),
        "config_snapshot": config_snapshot,
    })

    history = _build_conversation_context(thread_id, ctx)
    if history and history[-1]["role"] == "user" and history[-1]["content"] == user_message:
        history = history[:-1]

    # ── Execution state ──────────────────────────────────────
    node_outputs: dict[str, Any] = {}       # node_id -> output
    path_taken: list[str] = []
    step_counter = 0
    total_duration = 0
    total_tokens = 0
    total_input_tokens = 0
    total_output_tokens = 0
    total_thinking_tokens = 0
    total_cost = 0.0
    total_llm_calls = 0
    total_tool_calls = 0
    all_models_used: set[str] = set()
    all_tools_used: set[str] = set()
    cost_by_model: dict[str, float] = {}
    cost_by_node: dict[str, float] = {}
    loop_counts: dict[str, int] = {}        # edge_id -> iteration count
    start_time = time.monotonic()

    config = ctx.get("config") or {}
    graph_streaming_mode = config.get("streaming_mode", "text_and_thinking")
    max_total_executions = workflow.get("max_total_node_executions", 50) or 50

    # Find start node
    current_node_id = graph.find_start_node()
    if not current_node_id:
        raise RuntimeError("No start node found in workflow graph")

    try:
        while current_node_id and step_counter < max_total_executions:
            node = graph.nodes.get(current_node_id)
            if not node:
                logger.warning("[exec] Node %s not found in graph, stopping", current_node_id)
                break

            node_data = node.get("data", {})
            node_type = graph.get_node_type(current_node_id)
            node_name = graph.get_node_label(current_node_id)
            step_counter += 1
            path_taken.append(current_node_id)

            logger.info("[exec] Executing node: '%s' (type: %s) [step %d]",
                        node_name, node_type, step_counter)

            # ── START/END nodes ──────────────────────────────
            if node_type in ("start", "end"):
                step = supabase.table("execution_steps").insert({
                    "run_id": run_id,
                    "step_number": step_counter,
                    "node_type": node_type,
                    "node_name": node_name,
                    "status": "completed",
                    "duration_ms": 0,
                    "input_payload": {
                        "node_id": current_node_id,
                        "raw_user_message": user_message if node_type == "start" else None,
                        "assembled_context": {
                            "source": "thread_files",
                            "file_count": len(file_context.get("files", [])),
                            "parsed_characters": file_context.get("total_chars", 0),
                            "files": file_context.get("files", []),
                            "preview": (file_context.get("text") or "")[:4000],
                        } if node_type == "start" else None,
                    },
                    "output_payload": {
                        "status": f"{node_type}_passthrough",
                        "output_preview": (llm_user_message if node_type == "start" else "")[:1000],
                    },
                }).execute()

                node_event_id = await emitter.node_started(
                    node_id=current_node_id, node_label=node_name,
                    node_type=node_type, component_config={},
                    input_context=llm_user_message if node_type == "start" else "",
                    input_context_source="user_message+thread_files" if node_type == "start" and file_context.get("files") else "user_message",
                )
                await emitter.node_completed(
                    node_id=current_node_id, status="completed", output_result="passthrough",
                    duration_ms=0, total_tokens=0, total_cost_usd=0,
                    llm_call_count=0, tool_call_count=0,
                    parent_event_id=node_event_id,
                )

                await send_event({
                    "type": "step_started",
                    "step_id": step.data[0]["id"],
                    "step_number": step_counter,
                    "node_type": node_type,
                    "node_name": node_name,
                })
                await send_event({
                    "type": "step_completed",
                    "step_id": step.data[0]["id"],
                    "step_number": step_counter,
                    "duration_ms": 0,
                    "result_summary": f"{node_name} — passthrough",
                })

                node_outputs[current_node_id] = llm_user_message if node_type == "start" else node_outputs.get(current_node_id, "")

                if node_type == "end":
                    break

                # Follow edges from start
                current_node_id = await self._resolve_next_node(
                    graph, current_node_id, node_outputs, emitter, user_id, loop_counts
                )
                continue

            # ── GATE nodes (real human-in-the-loop) ──────────
            if node_type in ("gate", "human_review", "human_checkpoint"):
                step = supabase.table("execution_steps").insert({
                    "run_id": run_id,
                    "step_number": step_counter,
                    "node_type": node_type,
                    "node_name": node_name,
                    "status": "running",
                    "input_payload": {"node_id": current_node_id},
                }).execute()
                step_id = step.data[0]["id"]

                node_event_id = await emitter.node_started(
                    node_id=current_node_id, node_label=node_name,
                    node_type=node_type,
                    component_config={
                        "availableActions": node_data.get("availableActions", {}),
                        "onReject": node_data.get("onReject", "stop"),
                        "waitDuration": node_data.get("waitDuration"),
                        "onTimeout": node_data.get("onTimeout", "auto_approve"),
                    },
                )

                await send_event({
                    "type": "step_started",
                    "step_id": step_id,
                    "step_number": step_counter,
                    "node_type": node_type,
                    "node_name": node_name,
                })

                # Get previous node output for review context
                prev_output = self._get_last_output(node_outputs, graph, current_node_id)

                available_actions = node_data.get("availableActions", {
                    "approve": True, "rejectWithReason": True,
                })
                review_instructions = node_data.get("reviewInstructions", "")
                wait_duration = node_data.get("waitDuration", "5m")
                on_timeout = node_data.get("onTimeout", "auto_approve")

                await emitter.human_review_requested(
                    node_id=current_node_id,
                    node_label=node_name,
                    review_instructions=review_instructions,
                    available_actions=available_actions,
                    wait_duration=wait_duration,
                    timeout_action=on_timeout,
                    parent_event_id=node_event_id,
                )

                await send_event({
                    "type": "gate_review_requested",
                    "step_id": step_id,
                    "node_id": current_node_id,
                    "node_name": node_name,
                    "review_instructions": review_instructions,
                    "available_actions": available_actions,
                    "previous_output": str(prev_output)[:2000],
                    "wait_duration": wait_duration,
                    "on_timeout": on_timeout,
                })

                # Wait for human review via WebSocket
                from app.routers.stream import register_gate_wait
                gate_event, gate_result = register_gate_wait(thread_id)

                # Parse timeout
                timeout_seconds = _parse_duration(wait_duration)
                gate_start = time.monotonic()

                try:
                    await asyncio.wait_for(gate_event.wait(), timeout=timeout_seconds)
                    action = gate_result["action"]
                    comment = gate_result["comment"]
                except asyncio.TimeoutError:
                    action = "auto_approve" if on_timeout == "auto_approve" else "auto_reject"
                    comment = f"Timed out after {wait_duration}, action: {on_timeout}"
                    # Clean up pending gate
                    from app.routers.stream import _pending_gates
                    _pending_gates.pop(thread_id, None)

                gate_duration = int((time.monotonic() - gate_start) * 1000)

                await emitter.human_review_completed(
                    node_id=current_node_id, action=action,
                    reviewer_comment=comment, duration_ms=gate_duration,
                    parent_event_id=node_event_id,
                )

                gate_status = "completed" if action in ("approve", "auto_approve", "edit_and_approve", "add_comment_and_continue") else "failed"
                supabase.table("execution_steps").update({
                    "status": gate_status,
                    "duration_ms": gate_duration,
                    "output_payload": {"action": action, "comment": comment},
                }).eq("id", step_id).execute()

                await emitter.node_completed(
                    node_id=current_node_id, status=gate_status,
                    output_result=f"Gate: {action}",
                    duration_ms=gate_duration, total_tokens=0, total_cost_usd=0,
                    llm_call_count=0, tool_call_count=0,
                    parent_event_id=node_event_id,
                )

                await send_event({
                    "type": "step_completed",
                    "step_id": step_id,
                    "step_number": step_counter,
                    "duration_ms": gate_duration,
                    "result_summary": f"Gate: {action}" + (f" — {comment}" if comment else ""),
                })

                total_duration += gate_duration
                node_outputs[current_node_id] = f"Gate {action}: {comment}" if comment else f"Gate {action}"

                # Handle rejection
                on_reject = node_data.get("onReject", "stop")
                if action in ("reject", "auto_reject"):
                    if on_reject == "stop":
                        logger.info("[exec] Gate rejected with stop — ending workflow")
                        break
                    elif on_reject == "retry_previous":
                        # Go back to the previous node in path
                        if len(path_taken) >= 2:
                            current_node_id = path_taken[-2]
                            continue
                    # route_to_fallback: just follow edges normally

                current_node_id = await self._resolve_next_node(
                    graph, current_node_id, node_outputs, emitter, user_id, loop_counts
                )
                continue

            # ── SPLIT nodes (parallel branches) ──────────────
            if node_type in ("split", "parallel", "parallelization"):
                step = supabase.table("execution_steps").insert({
                    "run_id": run_id,
                    "step_number": step_counter,
                    "node_type": node_type,
                    "node_name": node_name,
                    "status": "running",
                    "input_payload": {"node_id": current_node_id},
                }).execute()
                step_id = step.data[0]["id"]

                node_event_id = await emitter.node_started(
                    node_id=current_node_id, node_label=node_name,
                    node_type=node_type,
                    component_config={
                        "fanOutMethod": node_data.get("fanOutMethod", "same_input"),
                        "mergeMethod": node_data.get("mergeMethod", "concatenate"),
                        "waitStrategy": node_data.get("waitStrategy", "wait_all"),
                        "branchCount": node_data.get("branchCount", 0),
                    },
                )

                await send_event({
                    "type": "step_started",
                    "step_id": step_id,
                    "step_number": step_counter,
                    "node_type": node_type,
                    "node_name": node_name,
                })

                split_start = time.monotonic()
                prev_output = self._get_last_output(node_outputs, graph, current_node_id)

                # Get outgoing edges = branches
                out_edges = graph.outgoing.get(current_node_id, [])
                branch_targets = [e["target"] for e in out_edges if e.get("target") in graph.nodes]

                fan_out = node_data.get("fanOutMethod", "same_input")
                merge_method = node_data.get("mergeMethod", "concatenate")
                branch_prompts = node_data.get("branchPrompts", [])
                max_concurrent = node_data.get("maxConcurrent", len(branch_targets)) or len(branch_targets)
                on_branch_failure = node_data.get("onBranchFailure", "continue")
                branch_timeout = node_data.get("branchTimeout", 120)

                await emitter.split_started(
                    node_id=current_node_id,
                    branch_count=len(branch_targets),
                    fan_out_method=fan_out,
                    merge_method=merge_method,
                    parent_event_id=node_event_id,
                )

                # Prepare branch inputs
                branch_inputs: list[str] = []
                if fan_out == "split_input" and isinstance(prev_output, str):
                    # Try to split output by paragraphs or sections
                    parts = [p.strip() for p in prev_output.split("\n\n") if p.strip()]
                    while len(parts) < len(branch_targets):
                        parts.append(str(prev_output))
                    branch_inputs = parts[:len(branch_targets)]
                elif fan_out == "custom_per_branch" and branch_prompts:
                    branch_inputs = branch_prompts[:len(branch_targets)]
                    while len(branch_inputs) < len(branch_targets):
                        branch_inputs.append(str(prev_output))
                else:  # same_input
                    branch_inputs = [str(prev_output)] * len(branch_targets)

                # Execute branches in parallel
                sem = asyncio.Semaphore(max_concurrent)
                branch_results: list[tuple[int, str, str, StreamingContext | None]] = []  # (idx, target, output, ctx)

                async def _run_branch(idx: int, target_id: str, branch_input: str):
                    async with sem:
                        tgt_data = graph.get_node_data(target_id)
                        tgt_name = graph.get_node_label(target_id)

                        # Build messages for branch
                        branch_msgs = []
                        effective_prompt = system_prompt
                        branch_instructions = tgt_data.get("systemPrompt") or tgt_data.get("purpose") or ""
                        if branch_instructions:
                            effective_prompt = f"{system_prompt}\n\n## Branch {idx+1}: {tgt_name}\n{branch_instructions}"
                        if effective_prompt:
                            branch_msgs.append({"role": "system", "content": effective_prompt})
                        branch_msgs.extend(history)
                        branch_msgs.append({"role": "user", "content": f"{user_message}\n\nBranch input:\n{branch_input}"})

                        # Create a step for this branch
                        branch_step = supabase.table("execution_steps").insert({
                            "run_id": run_id,
                            "step_number": step_counter * 100 + idx + 1,  # sub-steps
                            "node_type": graph.get_node_type(target_id),
                            "node_name": f"{tgt_name} (branch {idx+1})",
                            "status": "running",
                            "input_payload": {"node_id": target_id, "branch_index": idx},
                        }).execute()
                        branch_step_id = branch_step.data[0]["id"]

                        branch_node_event = await emitter.node_started(
                            node_id=target_id, node_label=f"{tgt_name} (branch {idx+1})",
                            node_type=graph.get_node_type(target_id),
                            component_config={"branch_index": idx},
                            input_context=branch_input[:1000],
                        )

                        try:
                            output, sctx = await asyncio.wait_for(
                                _execute_node_llm(
                                    target_id, tgt_data, branch_msgs,
                                    ctx, emitter, send_event,
                                    branch_step_id, step_counter * 100 + idx + 1,
                                    branch_node_event, graph_streaming_mode,
                                ),
                                timeout=branch_timeout,
                            )

                            branch_dur = int(sctx.total_cost_usd) if sctx else 0
                            supabase.table("execution_steps").update({
                                "status": "completed",
                                "tokens_used": sctx.total_tokens if sctx else 0,
                                "cost_usd": round(sctx.total_cost_usd, 4) if sctx else 0,
                                "output_payload": {"response_length": len(output), "branch_index": idx},
                            }).eq("id", branch_step_id).execute()

                            await emitter.split_branch_completed(
                                node_id=current_node_id, branch_index=idx,
                                branch_node_id=target_id, status="completed",
                                duration_ms=0, tokens=sctx.total_tokens if sctx else 0,
                                parent_event_id=node_event_id,
                            )

                            return idx, target_id, output, sctx

                        except Exception as e:
                            logger.error("[exec] Branch %d failed: %s", idx, e)
                            supabase.table("execution_steps").update({
                                "status": "failed",
                                "output_payload": {"error": str(e), "branch_index": idx},
                            }).eq("id", branch_step_id).execute()

                            await emitter.split_branch_completed(
                                node_id=current_node_id, branch_index=idx,
                                branch_node_id=target_id, status="failed",
                                duration_ms=0, tokens=0,
                                parent_event_id=node_event_id,
                            )

                            if on_branch_failure == "stop_all":
                                raise
                            return idx, target_id, f"[Branch {idx+1} failed: {e}]", None

                tasks = [
                    _run_branch(idx, target_id, branch_inputs[idx] if idx < len(branch_inputs) else str(prev_output))
                    for idx, target_id in enumerate(branch_targets)
                ]
                results = await asyncio.gather(*tasks, return_exceptions=True)

                # Collect results
                branch_outputs: list[str] = []
                completed = 0
                failed = 0
                for r in results:
                    if isinstance(r, Exception):
                        failed += 1
                        branch_outputs.append(f"[Branch failed: {r}]")
                    else:
                        idx, target_id, output, sctx = r
                        branch_outputs.append(output)
                        node_outputs[target_id] = output
                        if sctx:
                            completed += 1
                            total_tokens += sctx.total_tokens
                            total_input_tokens += sctx.total_input_tokens
                            total_output_tokens += sctx.total_output_tokens
                            total_thinking_tokens += sctx.total_thinking_tokens
                            total_cost += sctx.total_cost_usd
                            total_llm_calls += len(sctx.llm_calls)
                            total_tool_calls += len(sctx.tool_calls)
                            for c in sctx.llm_calls:
                                all_models_used.add(c.model_id)
                                cost_by_model[c.model_id] = cost_by_model.get(c.model_id, 0) + c.cost_usd
                            for c in sctx.tool_calls:
                                all_tools_used.add(c.tool_name)
                        else:
                            failed += 1

                # Merge results
                if merge_method == "concatenate":
                    merged = "\n\n---\n\n".join(branch_outputs)
                elif merge_method == "best_of_n":
                    merged = max(branch_outputs, key=len) if branch_outputs else ""
                elif merge_method == "summarize" or merge_method == "custom":
                    # Use LLM to merge
                    merge_prompt = node_data.get("mergePrompt", "Synthesize these branch outputs into a coherent response:")
                    merge_msgs = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"{merge_prompt}\n\n" + "\n\n---\n\n".join(
                            f"Branch {i+1}:\n{o}" for i, o in enumerate(branch_outputs)
                        )},
                    ]
                    merge_output = ""
                    merge_model = node_data.get("mergeModel", model)
                    async for chunk in call_llm_streaming(
                        user_id=user_id, model=merge_model,
                        messages=merge_msgs, temperature=0.3, max_tokens=max_tokens,
                    ):
                        merge_output += chunk
                    merged = merge_output
                elif merge_method == "vote":
                    # Simple majority — pick most common non-trivial output
                    merged = max(set(branch_outputs), key=branch_outputs.count) if branch_outputs else ""
                else:
                    merged = "\n\n".join(branch_outputs)

                split_duration = int((time.monotonic() - split_start) * 1000)
                total_duration += split_duration
                node_outputs[current_node_id] = merged
                cost_by_node[current_node_id] = round(total_cost, 6)

                await emitter.split_completed(
                    node_id=current_node_id, merge_method=merge_method,
                    merged_output=merged, total_branches=len(branch_targets),
                    completed_branches=completed, failed_branches=failed,
                    parent_event_id=node_event_id,
                )

                supabase.table("execution_steps").update({
                    "status": "completed",
                    "duration_ms": split_duration,
                    "output_payload": {
                        "merge_method": merge_method,
                        "branches": len(branch_targets),
                        "completed": completed,
                        "failed": failed,
                        "response_length": len(merged),
                    },
                }).eq("id", step_id).execute()

                await emitter.node_completed(
                    node_id=current_node_id, status="completed", output_result=merged,
                    duration_ms=split_duration, total_tokens=0, total_cost_usd=0,
                    llm_call_count=0, tool_call_count=0,
                    parent_event_id=node_event_id,
                )

                await send_event({
                    "type": "step_completed",
                    "step_id": step_id,
                    "step_number": step_counter,
                    "duration_ms": split_duration,
                    "result_summary": f"Split: {completed}/{len(branch_targets)} branches completed, merged via {merge_method}",
                })

                # After split, find the merge node (node that all branches' targets converge to)
                # For simplicity: find the first node that has incoming edges from all branch targets
                merge_target = self._find_merge_node(graph, branch_targets)
                current_node_id = merge_target
                continue

            # ── Regular LLM nodes (node, decision, route, etc.) ──
            step = supabase.table("execution_steps").insert({
                "run_id": run_id,
                "step_number": step_counter,
                "node_type": node_type,
                "node_name": node_name,
                "status": "running",
                "input_payload": {"node_id": current_node_id},
            }).execute()
            step_id = step.data[0]["id"]

            node_config = {
                "llmEnabled": node_data.get("llmEnabled", True),
                "model": node_data.get("modelOverride") or node_data.get("model") or model,
                "temperature": node_data.get("temperature", temperature),
                "max_output_tokens": node_data.get("maxOutputTokens", max_tokens),
                "systemPrompt": node_data.get("systemPrompt", ""),
                "boundTools": node_data.get("boundTools", []),
                "componentType": node_type,
            }

            prev_output = self._get_last_output(node_outputs, graph, current_node_id)
            node_event_id = await emitter.node_started(
                node_id=current_node_id, node_label=node_name,
                node_type=node_type,
                component_config=node_config,
                input_context=str(prev_output)[:1000] if prev_output else llm_user_message,
                input_context_source=(
                    "previous_step"
                    if prev_output
                    else "user_message+thread_files" if file_context.get("files") else "user_message"
                ),
            )

            elapsed_so_far = int((time.monotonic() - start_time) * 1000)
            await send_event({
                "type": "step_started",
                "step_id": step_id,
                "step_number": step_counter,
                "node_type": node_type,
                "node_name": node_name,
                "progress_pct": round((step_counter - 1) / len(graph.nodes) * 100, 1),
                "cost_so_far": round(total_cost, 6),
                "elapsed_ms": elapsed_so_far,
                "tokens_so_far": total_tokens,
            })

            step_start = time.monotonic()

            # Check if LLM is disabled (tool-only node)
            llm_enabled = node_data.get("llmEnabled", True)
            if not llm_enabled:
                duration_ms = 50
                supabase.table("execution_steps").update({
                    "status": "completed",
                    "duration_ms": duration_ms,
                    "output_payload": {"status": "tool_execution", "tools": node_data.get("boundTools", [])},
                }).eq("id", step_id).execute()

                await emitter.node_completed(
                    node_id=current_node_id, status="completed",
                    output_result=f"Tool node executed ({len(node_data.get('boundTools', []))} tools)",
                    duration_ms=duration_ms, total_tokens=0, total_cost_usd=0,
                    llm_call_count=0, tool_call_count=0,
                    parent_event_id=node_event_id,
                )
                await send_event({
                    "type": "step_completed",
                    "step_id": step_id,
                    "step_number": step_counter,
                    "duration_ms": duration_ms,
                    "result_summary": f"Tool node executed ({len(node_data.get('boundTools', []))} tools)",
                })
                total_duration += duration_ms
                node_outputs[current_node_id] = str(prev_output)
                current_node_id = await self._resolve_next_node(
                    graph, current_node_id, node_outputs, emitter, user_id, loop_counts
                )
                continue

            # Build messages
            node_instructions = (
                node_data.get("systemPrompt")
                or node_data.get("systemPromptHint")
                or node_data.get("purpose")
                or ""
            )
            node_messages = []

            effective_prompt = system_prompt
            if node_instructions:
                effective_prompt = f"{system_prompt}\n\n## Current Step: {node_name}\n{node_instructions}"
            if effective_prompt:
                node_messages.append({"role": "system", "content": effective_prompt})

            node_messages.extend(history)

            # Apply input mapping from incoming edges
            mapped_context = None
            for edge in graph.incoming.get(current_node_id, []):
                edge_data = edge.get("data", {})
                mappings = edge_data.get("inputOutputMapping", [])
                if mappings:
                    source_id = edge.get("source")
                    source_output = node_outputs.get(source_id, prev_output)
                    mapped_context = _apply_mapping(mappings, source_output)
                    await emitter.mapping_applied(
                        edge_id=edge.get("id", ""),
                        source_node=source_id,
                        target_node=current_node_id,
                        mappings=mappings,
                    )
                    break  # Use first edge with mapping

            # Build user message content
            if mapped_context:
                context_str = json.dumps(mapped_context, indent=2)
                node_messages.append({"role": "user", "content":
                    f"{llm_user_message}\n\nMapped input:\n{context_str}"
                })
            elif prev_output:
                node_messages.append({"role": "user", "content":
                    f"{user_message}\n\nPrevious step output:\n{prev_output}"
                })
            else:
                node_messages.append({"role": "user", "content": llm_user_message})

            # Execute LLM
            try:
                step_output, streaming_ctx = await _execute_node_llm(
                    current_node_id, node_data, node_messages,
                    ctx, emitter, send_event,
                    step_id, step_counter, node_event_id, graph_streaming_mode,
                )
            except RuntimeError as e:
                error_msg = str(e)
                logger.error("[exec] LLM call failed at node '%s': %s", node_name, error_msg)
                await emitter.error(
                    node_id=current_node_id, error_type="llm_error",
                    error_message=error_msg, stack_trace=traceback.format_exc(),
                    parent_event_id=node_event_id,
                )
                supabase.table("execution_steps").update({
                    "status": "failed", "output_payload": {"error": error_msg},
                }).eq("id", step_id).execute()
                await send_event({
                    "type": "step_completed", "step_id": step_id,
                    "step_number": step_counter, "duration_ms": 0,
                    "result_summary": f"Error: {error_msg}",
                })
                raise

            duration_ms = int((time.monotonic() - step_start) * 1000)
            total_duration += duration_ms
            total_tokens += streaming_ctx.total_tokens
            total_input_tokens += streaming_ctx.total_input_tokens
            total_output_tokens += streaming_ctx.total_output_tokens
            total_thinking_tokens += streaming_ctx.total_thinking_tokens
            total_cost += streaming_ctx.total_cost_usd
            total_llm_calls += len(streaming_ctx.llm_calls)
            total_tool_calls += len(streaming_ctx.tool_calls)
            node_outputs[current_node_id] = step_output

            for c in streaming_ctx.llm_calls:
                all_models_used.add(c.model_id)
                cost_by_model[c.model_id] = cost_by_model.get(c.model_id, 0) + c.cost_usd
            for c in streaming_ctx.tool_calls:
                all_tools_used.add(c.tool_name)
            cost_by_node[current_node_id] = round(streaming_ctx.total_cost_usd, 6)

            supabase.table("execution_steps").update({
                "status": "completed",
                "duration_ms": duration_ms,
                "tokens_used": streaming_ctx.total_tokens,
                "cost_usd": round(streaming_ctx.total_cost_usd, 4),
                "output_payload": {
                    "response_length": len(step_output),
                    "input_tokens": streaming_ctx.total_input_tokens,
                    "output_tokens": streaming_ctx.total_output_tokens,
                    "thinking_tokens": streaming_ctx.total_thinking_tokens,
                    "llm_calls": len(streaming_ctx.llm_calls),
                    "tool_calls": len(streaming_ctx.tool_calls),
                    "model": node_data.get("modelOverride") or node_data.get("model") or model,
                },
            }).eq("id", step_id).execute()

            await emitter.node_completed(
                node_id=current_node_id, status="completed", output_result=step_output,
                duration_ms=duration_ms, total_tokens=streaming_ctx.total_tokens,
                total_cost_usd=streaming_ctx.total_cost_usd,
                llm_call_count=len(streaming_ctx.llm_calls),
                tool_call_count=len(streaming_ctx.tool_calls),
                parent_event_id=node_event_id,
            )

            elapsed_total = int((time.monotonic() - start_time) * 1000)
            await send_event({
                "type": "step_completed",
                "step_id": step_id,
                "step_number": step_counter,
                "duration_ms": duration_ms,
                "tokens": streaming_ctx.total_tokens,
                "cost_usd": round(streaming_ctx.total_cost_usd, 6),
                "result_summary": f"Generated {len(step_output)} chars in {duration_ms}ms",
                "progress_pct": round(step_counter / len(graph.nodes) * 100, 1),
                "cost_so_far": round(total_cost, 6),
                "elapsed_ms": elapsed_total,
                "tokens_so_far": total_tokens,
            })

            # Resolve next node by following edges
            current_node_id = await self._resolve_next_node(
                graph, current_node_id, node_outputs, emitter, user_id, loop_counts
            )

        # ── All done ─────────────────────────────────────────
        last_output = ""
        # Find the last non-start/end output
        for nid in reversed(path_taken):
            if nid in node_outputs and node_outputs[nid]:
                nt = graph.get_node_type(nid)
                if nt not in ("start", "end", "gate", "human_review", "human_checkpoint"):
                    last_output = node_outputs[nid]
                    break
        if not last_output:
            last_output = node_outputs.get(path_taken[-1], "") if path_taken else ""

        supabase.table("execution_runs").update({
            "status": "completed",
            "total_duration_ms": total_duration,
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 4),
            "step_count": step_counter,
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "total_thinking_tokens": total_thinking_tokens,
            "total_llm_calls": total_llm_calls,
            "total_tool_calls": total_tool_calls,
            "path_taken": path_taken,
            "models_used": list(all_models_used),
            "tools_used": list(all_tools_used),
            "cost_by_model": {k: round(v, 6) for k, v in cost_by_model.items()},
            "cost_by_node": cost_by_node,
        }).eq("id", run_id).execute()

        await emitter.workflow_completed(
            status="completed", final_output=last_output,
            total_duration_ms=total_duration, total_tokens=total_tokens,
            total_cost_usd=total_cost, path_taken=path_taken,
        )

        created_files = persist_artifacts_from_output(thread_id, str(last_output), trigger_step_id=None)
        for file in created_files:
            await send_event({
                "type": "file_created",
                "file_id": file["file_id"],
                "file_name": file["file_name"],
                "file_type": file["file_type"],
                "operation_type": "creation",
            })

        await send_event({
            "type": "run_completed",
            "run_id": run_id,
            "total_duration_ms": total_duration,
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 6),
            "total_llm_calls": total_llm_calls,
            "total_tool_calls": total_tool_calls,
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "total_thinking_tokens": total_thinking_tokens,
            "progress_pct": 100.0,
            "path_taken": path_taken,
            "models_used": list(all_models_used),
            "tools_used": list(all_tools_used),
        })

        supabase.table("thread_messages").insert({
            "thread_id": thread_id,
            "role": "assistant",
            "content": "",
            "message_type": "execution_trace",
            "metadata": {"run_id": run_id},
        }).execute()

        if last_output:
            supabase.table("thread_messages").insert({
                "thread_id": thread_id,
                "role": "assistant",
                "content": last_output,
                "message_type": "text",
                "metadata": {
                    "run_id": run_id,
                    "mode": "workflow",
                    "model": model,
                    "tokens": total_tokens,
                    "cost_usd": round(total_cost, 6),
                    "duration_ms": total_duration,
                    "llm_calls": total_llm_calls,
                    "tool_calls": total_tool_calls,
                    "files": created_files,
                },
            }).execute()

            await send_event({"type": "assistant_message", "content": last_output, "files": created_files})

        logger.info("[exec] Workflow run completed: %d steps, %dms, %d tokens, $%.6f",
                     step_counter, total_duration, total_tokens, total_cost)

    except Exception as e:
        logger.error("[exec] Workflow graph execution failed at run=%s: %s", run_id, e)
        supabase.table("execution_runs").update({
            "status": "failed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", run_id).execute()
        await send_event({"type": "run_failed", "run_id": run_id, "error": str(e)})
        raise


# ══════════════════════════════════════════════════════════════
# Graph traversal helpers (used by _execute_workflow_graph)
# ══════════════════════════════════════════════════════════════

class _GraphTraversal:
    """Namespace for graph traversal helper methods used within _execute_workflow_graph."""

    @staticmethod
    def _get_last_output(node_outputs: dict, graph: WorkflowGraph, current_node_id: str) -> Any:
        """Get output from the most recent predecessor of current_node_id."""
        incoming = graph.incoming.get(current_node_id, [])
        for edge in incoming:
            source_id = edge.get("source")
            if source_id in node_outputs:
                return node_outputs[source_id]
        # Fallback: last non-empty output
        for nid, out in reversed(list(node_outputs.items())):
            if out:
                return out
        return ""

    @staticmethod
    async def _resolve_next_node(
        graph: WorkflowGraph,
        current_node_id: str,
        node_outputs: dict,
        emitter: EventEmitter,
        user_id: str,
        loop_counts: dict[str, int],
    ) -> str | None:
        """Follow outgoing edges from current node, evaluating conditions.
        Returns the next node_id to execute, or None if workflow should stop."""
        out_edges = graph.outgoing.get(current_node_id, [])
        if not out_edges:
            return None

        current_output = node_outputs.get(current_node_id, "")

        # Separate edges by type
        loop_edges = [e for e in out_edges if (e.get("data", {}).get("edgeType") == "loop")]
        conditional_edges = [e for e in out_edges if (e.get("data", {}).get("edgeType") == "conditional")]
        flow_edges = [e for e in out_edges if (e.get("data", {}).get("edgeType", "flow") == "flow" and e not in loop_edges)]

        # 1. Evaluate conditional edges first
        for edge in conditional_edges:
            edge_id = edge.get("id", "")
            target = edge.get("target")
            passed, details = await evaluate_edge_condition(edge, current_output, user_id)

            await emitter.edge_evaluated(
                edge_id=edge_id, source_node=current_node_id,
                target_node=target, condition_method=details.get("method", ""),
                condition_result=passed, evaluation_details=details,
            )

            if passed:
                logger.info("[exec] Conditional edge %s -> %s: PASSED", current_node_id, target)
                return target

        # 2. Evaluate loop edges (back-edges)
        for edge in loop_edges:
            edge_id = edge.get("id", "")
            target = edge.get("target")
            edge_data = edge.get("data", {})
            max_iterations = edge_data.get("maxIterations", 3)
            exit_threshold = edge_data.get("exitThreshold")
            on_max = edge_data.get("onMaxReached", "use_last")

            iteration = loop_counts.get(edge_id, 0)

            # Check if max iterations reached
            if iteration >= max_iterations:
                logger.info("[exec] Loop edge %s max iterations reached (%d)", edge_id, max_iterations)
                await emitter.loop_completed(
                    edge_id=edge_id, source_node=current_node_id,
                    target_node=target, total_iterations=iteration,
                    exit_reason=f"max_iterations ({max_iterations})",
                )
                # Don't take loop edge — fall through to flow edges
                continue

            # Check exit threshold (if output contains a confidence/quality score)
            exit_met = False
            if exit_threshold is not None:
                try:
                    # Try to extract a numeric score from output
                    score_match = re.search(r'(?:score|confidence|quality)[:\s]*(\d+(?:\.\d+)?)', str(current_output), re.I)
                    if score_match:
                        score = float(score_match.group(1))
                        if score >= exit_threshold:
                            exit_met = True
                except (ValueError, AttributeError):
                    pass

            if exit_met:
                logger.info("[exec] Loop edge %s exit threshold met", edge_id)
                await emitter.loop_completed(
                    edge_id=edge_id, source_node=current_node_id,
                    target_node=target, total_iterations=iteration,
                    exit_reason="exit_threshold_met",
                )
                continue

            # Check condition on loop edge (if any)
            passed, details = await evaluate_edge_condition(edge, current_output, user_id)

            await emitter.edge_evaluated(
                edge_id=edge_id, source_node=current_node_id,
                target_node=target, condition_method=details.get("method", ""),
                condition_result=passed, evaluation_details=details,
            )

            if passed:
                loop_counts[edge_id] = iteration + 1
                await emitter.loop_iteration(
                    edge_id=edge_id, source_node=current_node_id,
                    target_node=target, iteration=iteration + 1,
                    max_iterations=max_iterations,
                )
                logger.info("[exec] Loop iteration %d/%d: %s -> %s",
                            iteration + 1, max_iterations, current_node_id, target)
                return target

        # 3. Fall through to flow edges (unconditional)
        if flow_edges:
            # Take the first flow edge
            target = flow_edges[0].get("target")
            edge_id = flow_edges[0].get("id", "")
            await emitter.edge_evaluated(
                edge_id=edge_id, source_node=current_node_id,
                target_node=target, condition_method="flow",
                condition_result=True, evaluation_details={"method": "flow"},
            )
            return target

        return None

    @staticmethod
    def _find_merge_node(graph: WorkflowGraph, branch_targets: list[str]) -> str | None:
        """Find the merge node — first node that all branch targets lead to."""
        if not branch_targets:
            return None

        # For each branch target, find its outgoing targets
        downstream_sets: list[set[str]] = []
        for bt in branch_targets:
            downstream = set()
            queue = [bt]
            visited = set()
            while queue:
                nid = queue.pop(0)
                if nid in visited:
                    continue
                visited.add(nid)
                for edge in graph.outgoing.get(nid, []):
                    tgt = edge.get("target")
                    if tgt:
                        downstream.add(tgt)
                        queue.append(tgt)
            downstream_sets.append(downstream)

        # Find common downstream nodes
        if downstream_sets:
            common = downstream_sets[0]
            for ds in downstream_sets[1:]:
                common = common & ds
            if common:
                # Return the one closest (fewest hops) from branch targets
                return min(common, key=lambda n: sum(
                    1 for bt in branch_targets
                    for e in graph.outgoing.get(bt, [])
                    if e.get("target") == n
                ), default=next(iter(common)))

        # Fallback: first downstream of first branch
        for bt in branch_targets:
            for edge in graph.outgoing.get(bt, []):
                tgt = edge.get("target")
                if tgt and tgt not in branch_targets:
                    return tgt

        return None


# Bind traversal helpers as module-level references for _execute_workflow_graph
# (avoids `self.` in the non-class function — uses a simple namespace pattern)
self = _GraphTraversal()


def _parse_duration(duration_str: str) -> float:
    """Parse a duration string like '5m', '1h', '30s' into seconds."""
    if not duration_str:
        return 300  # 5 minutes default
    duration_str = duration_str.strip().lower()
    match = re.match(r'^(\d+(?:\.\d+)?)\s*(s|m|h|d)?$', duration_str)
    if not match:
        return 300
    value = float(match.group(1))
    unit = match.group(2) or "s"
    multipliers = {"s": 1, "m": 60, "h": 3600, "d": 86400}
    return value * multipliers.get(unit, 1)
