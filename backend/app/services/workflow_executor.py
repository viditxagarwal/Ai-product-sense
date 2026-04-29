"""Workflow executor — walks the workflow graph and calls the LLM.

If the workflow fails for ANY reason, falls back to a direct LLM call
with the system prompt + user message. The user always gets a response.
"""

import asyncio
import logging
import traceback
from datetime import datetime, timezone

from app.database import supabase
from app.services.llm_service import call_llm_streaming
from app.services.prompt_injector import build_config_injections

logger = logging.getLogger("ws.executor")


# ══════════════════════════════════════════════════════════════
# Graph helpers
# ══════════════════════════════════════════════════════════════

def _get_nodes_in_order(graph_data: dict) -> list[dict]:
    """Topological sort of workflow nodes."""
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])
    if not nodes:
        return []

    node_map = {n["id"]: n for n in nodes}
    in_degree = {n["id"]: 0 for n in nodes}
    adj = {n["id"]: [] for n in nodes}

    for e in edges:
        src, tgt = e.get("source"), e.get("target")
        if src in adj and tgt in in_degree:
            adj[src].append(tgt)
            in_degree[tgt] = in_degree.get(tgt, 0) + 1

    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    ordered = []
    while queue:
        nid = queue.pop(0)
        ordered.append(node_map[nid])
        for neighbor in adj.get(nid, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    seen = {n["id"] for n in ordered}
    for n in nodes:
        if n["id"] not in seen:
            ordered.append(n)
    return ordered


def _build_config_snapshot(ctx: dict) -> dict:
    """Extract rendering-relevant config fields for the frontend."""
    config = ctx.get("config") or {}
    return {
        "execution_trace_placement": config.get("execution_trace_placement", "inline_interleaved"),
        "harness_display_mode": config.get("harness_display_mode", "sequential_visible"),
        "intermediate_steps_in_chat": config.get("intermediate_steps_in_chat", "status_pills"),
        "explanation_depth": config.get("explanation_depth", "reasoning_plus_sources"),
        "confidence_display": config.get("confidence_display", "color_coded_bands"),
    }


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

    # Workflow
    wf = supabase.table("workflows").select("*").eq("id", t["workflow_id"]).single().execute()
    result["workflow"] = wf.data if wf.data else None

    # Configuration
    cfg = supabase.table("configurations").select("*").eq("id", t["configuration_id"]).single().execute()
    result["config"] = cfg.data if cfg.data else None

    # System prompt from prompt version
    system_prompt = ""
    if cfg.data and cfg.data.get("prompt_version_id"):
        pv = supabase.table("prompt_versions").select("content").eq("id", cfg.data["prompt_version_id"]).single().execute()
        if pv.data:
            system_prompt = pv.data.get("content", "")

    # Inject config-driven response guidelines
    if cfg.data:
        config_injections = build_config_injections(cfg.data)
        if config_injections:
            system_prompt += config_injections

    # Thread instructions override
    if t.get("instructions"):
        if system_prompt:
            system_prompt += f"\n\n## Additional Instructions\n{t['instructions']}"
        else:
            system_prompt = t["instructions"]

    result["system_prompt"] = system_prompt

    # Model from config
    result["model"] = cfg.data.get("primary_model", "gpt-4o-mini") if cfg.data else "gpt-4o-mini"
    result["temperature"] = cfg.data.get("temperature", 0.2) if cfg.data else 0.2
    result["max_tokens"] = cfg.data.get("max_output_tokens", 4096) if cfg.data else 4096

    return result


def _get_conversation_history(thread_id: str, limit: int = 20) -> list[dict]:
    """Fetch recent messages for the thread to include as conversation context."""
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

    # Build messages
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    # Add conversation history
    history = _get_conversation_history(thread_id)
    # Remove the last user message if it matches (we'll add it fresh)
    if history and history[-1]["role"] == "user" and history[-1]["content"] == user_message:
        history = history[:-1]
    messages.extend(history)
    messages.append({"role": "user", "content": user_message})

    logger.info("[exec] Direct LLM call: model=%s messages=%d fallback=%s", model, len(messages), is_fallback)

    # Create a run record
    run = supabase.table("execution_runs").insert({
        "thread_id": thread_id,
        "status": "running",
    }).execute()
    run_id = run.data[0]["id"]

    config_snapshot = _build_config_snapshot(ctx)

    await send_event({
        "type": "run_started",
        "run_id": run_id,
        "step_count": 1,
        "config_snapshot": config_snapshot,
    })

    # Show fallback warning
    if is_fallback:
        await send_event({
            "type": "system_message",
            "content": "Running in direct mode (workflow execution failed). Your message is being sent directly to the LLM.",
            "severity": "warning",
        })

    # Create a single step
    step = supabase.table("execution_steps").insert({
        "run_id": run_id,
        "step_number": 1,
        "node_type": "direct_llm",
        "node_name": f"Direct Chat ({model})",
        "status": "running",
    }).execute()
    step_id = step.data[0]["id"]

    await send_event({
        "type": "step_started",
        "step_id": step_id,
        "step_number": 1,
        "node_type": "direct_llm",
        "node_name": f"Direct Chat ({model})",
    })

    start_time = datetime.now(timezone.utc)
    full_response = ""

    try:
        async for chunk in call_llm_streaming(
            user_id=user_id,
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        ):
            full_response += chunk
            await send_event({
                "type": "step_progress",
                "step_id": step_id,
                "content": chunk,
            })

        duration_ms = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)

        # Mark step completed
        supabase.table("execution_steps").update({
            "status": "completed",
            "duration_ms": duration_ms,
            "output_payload": {"response_length": len(full_response)},
        }).eq("id", step_id).execute()

        await send_event({
            "type": "step_completed",
            "step_id": step_id,
            "step_number": 1,
            "duration_ms": duration_ms,
            "result_summary": f"Generated {len(full_response)} chars",
        })

        # Complete run
        supabase.table("execution_runs").update({
            "status": "completed",
            "total_duration_ms": duration_ms,
            "step_count": 1,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", run_id).execute()

        await send_event({
            "type": "run_completed",
            "run_id": run_id,
            "total_duration_ms": duration_ms,
        })

        # Save and send assistant message
        supabase.table("thread_messages").insert({
            "thread_id": thread_id,
            "role": "assistant",
            "content": full_response,
            "message_type": "text",
            "metadata": {"run_id": run_id, "mode": "direct" if is_fallback else "normal"},
        }).execute()

        await send_event({
            "type": "assistant_message",
            "content": full_response,
        })

        logger.info("[exec] Direct LLM call completed: %d chars, %dms", len(full_response), duration_ms)

    except Exception as e:
        error_msg = str(e)
        logger.error("[exec] Direct LLM call failed: %s\n%s", error_msg, traceback.format_exc())

        supabase.table("execution_steps").update({
            "status": "failed",
        }).eq("id", step_id).execute()

        await send_event({
            "type": "step_completed",
            "step_id": step_id,
            "step_number": 1,
            "duration_ms": 0,
            "result_summary": f"Error: {error_msg}",
        })

        supabase.table("execution_runs").update({
            "status": "failed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", run_id).execute()

        await send_event({"type": "run_failed", "run_id": run_id, "error": error_msg})

        # Send error as visible message
        await send_event({
            "type": "execution_error",
            "error": error_msg,
        })


# ══════════════════════════════════════════════════════════════
# Main entry point
# ══════════════════════════════════════════════════════════════

async def execute_workflow(thread_id: str, user_message: str, send_event):
    """Run the workflow. Falls back to direct LLM on any failure."""
    logger.info("[exec] === Starting execution: thread=%s ===", thread_id)
    logger.info("[exec] User message: '%s'", user_message[:200])

    # ── Resolve context ──────────────────────────────────────
    try:
        ctx = _get_thread_context(thread_id)
    except Exception as e:
        logger.error("[exec] Failed to resolve thread context: %s\n%s", e, traceback.format_exc())
        await send_event({
            "type": "execution_error",
            "error": f"Failed to load thread context: {e}",
        })
        return

    logger.info("[exec] Context resolved: model=%s workflow=%s config=%s prompt_len=%d",
                ctx["model"],
                ctx["workflow"]["workflow_name"] if ctx.get("workflow") else "NONE",
                ctx["config"]["config_name"] if ctx.get("config") else "NONE",
                len(ctx["system_prompt"]))

    # ── Check if workflow has nodes ──────────────────────────
    workflow = ctx.get("workflow")
    graph_data = workflow.get("graph_data", {}) if workflow else {}
    nodes = _get_nodes_in_order(graph_data)

    if not nodes:
        logger.info("[exec] No workflow nodes — using direct LLM call")
        await _direct_llm_call(thread_id, user_message, send_event, ctx)
        return

    logger.info("[exec] Workflow '%s' has %d nodes", workflow.get("workflow_name"), len(nodes))

    # ── Try workflow execution ───────────────────────────────
    try:
        await _execute_workflow_graph(thread_id, user_message, send_event, ctx, nodes)
    except Exception as e:
        logger.error("[exec] Workflow execution failed, falling back to direct LLM: %s\n%s",
                     e, traceback.format_exc())
        await send_event({
            "type": "system_message",
            "content": f"Workflow error: {e}",
            "severity": "error",
        })
        # Fallback to direct LLM
        await _direct_llm_call(thread_id, user_message, send_event, ctx, is_fallback=True)


async def _execute_workflow_graph(
    thread_id: str, user_message: str, send_event, ctx: dict, nodes: list[dict]
):
    """Walk the workflow graph, executing each node."""
    user_id = ctx["user_id"]
    model = ctx["model"]
    system_prompt = ctx["system_prompt"]
    temperature = ctx["temperature"]
    max_tokens = ctx["max_tokens"]

    # Create run
    run = supabase.table("execution_runs").insert({
        "thread_id": thread_id,
        "status": "running",
    }).execute()
    run_id = run.data[0]["id"]

    config_snapshot = _build_config_snapshot(ctx)

    await send_event({
        "type": "run_started",
        "run_id": run_id,
        "step_count": len(nodes),
        "config_snapshot": config_snapshot,
    })

    history = _get_conversation_history(thread_id)
    if history and history[-1]["role"] == "user" and history[-1]["content"] == user_message:
        history = history[:-1]

    last_output = ""
    total_duration = 0
    start_time = datetime.now(timezone.utc)

    try:
        for i, node in enumerate(nodes):
            node_type = node.get("type", "step")
            node_data = node.get("data", {})
            node_name = node_data.get("label", node_type)
            component_type = node_data.get("componentType", node_type)
            step_number = i + 1

            logger.info("[exec] Executing node: '%s' (type: %s, component: %s) [step %d/%d]",
                        node_name, node_type, component_type, step_number, len(nodes))

            # ── START/END nodes are passthrough ──────────────
            if component_type in ("start", "end") or node_type in ("start", "end"):
                logger.info("[exec] %s node — passthrough", component_type or node_type)
                step = supabase.table("execution_steps").insert({
                    "run_id": run_id,
                    "step_number": step_number,
                    "node_type": component_type or node_type,
                    "node_name": node_name,
                    "status": "completed",
                    "duration_ms": 0,
                    "output_payload": {"status": f"{(component_type or node_type)}_passthrough"},
                }).execute()
                await send_event({
                    "type": "step_started",
                    "step_id": step.data[0]["id"],
                    "step_number": step_number,
                    "node_type": component_type or node_type,
                    "node_name": node_name,
                })
                await send_event({
                    "type": "step_completed",
                    "step_id": step.data[0]["id"],
                    "step_number": step_number,
                    "duration_ms": 0,
                    "result_summary": f"{node_name} — passthrough",
                })
                continue

            # Create step record
            step = supabase.table("execution_steps").insert({
                "run_id": run_id,
                "step_number": step_number,
                "node_type": component_type or node_type,
                "node_name": node_name,
                "status": "running",
            }).execute()
            step_id = step.data[0]["id"]

            await send_event({
                "type": "step_started",
                "step_id": step_id,
                "step_number": step_number,
                "node_type": component_type or node_type,
                "node_name": node_name,
            })

            step_start = datetime.now(timezone.utc)

            # ── Build messages for this node ─────────────────
            # Support both new (systemPrompt) and old (systemPromptHint, purpose) field names
            node_instructions = (
                node_data.get("systemPrompt")
                or node_data.get("systemPromptHint")
                or node_data.get("purpose")
                or ""
            )
            node_messages = []

            # System prompt
            effective_prompt = system_prompt
            if node_instructions:
                effective_prompt = f"{system_prompt}\n\n## Current Step: {node_name}\n{node_instructions}"
            if effective_prompt:
                node_messages.append({"role": "system", "content": effective_prompt})

            # Conversation history
            node_messages.extend(history)

            # ── Gate nodes (human_review, human_checkpoint) — auto-approve ──
            if component_type == "gate" or node_type in ("human_review", "human_checkpoint"):
                logger.info("[exec] Gate node '%s' auto-approved", node_name)
                duration_ms = 10
                supabase.table("execution_steps").update({
                    "status": "completed",
                    "duration_ms": duration_ms,
                    "output_payload": {"status": "auto_approved"},
                }).eq("id", step_id).execute()
                await send_event({
                    "type": "step_completed",
                    "step_id": step_id,
                    "step_number": step_number,
                    "duration_ms": duration_ms,
                    "result_summary": "Gate: auto-approved (simulated)",
                })
                total_duration += duration_ms
                continue

            # ── Split nodes (parallel, parallelization) ──────
            elif component_type == "split" or node_type in ("parallel", "parallelization"):
                node_messages.append({"role": "user", "content":
                    f"Process the following in parallel (handle all branches):\n{user_message}\n\nPrevious context:\n{last_output or 'Start of workflow'}"
                })

            # ── Decision/Route nodes (old types, now handled via edges) ──
            elif node_type in ("decision", "route"):
                conditions = node_data.get("conditions", "") or node_data.get("conditionPrompt", "")
                if conditions:
                    node_messages.append({"role": "user", "content":
                        f"Based on the previous output, evaluate these conditions and decide the route:\n{conditions}\n\nPrevious output:\n{last_output or user_message}"
                    })
                else:
                    logger.info("[exec] Decision node '%s' has no conditions, passing through", node_name)
                    duration_ms = 10
                    supabase.table("execution_steps").update({
                        "status": "completed",
                        "duration_ms": duration_ms,
                        "output_payload": {"routing_decision": "pass_through"},
                    }).eq("id", step_id).execute()
                    await send_event({
                        "type": "step_completed",
                        "step_id": step_id,
                        "step_number": step_number,
                        "duration_ms": duration_ms,
                        "result_summary": "Decision: pass through (no conditions configured)",
                    })
                    total_duration += duration_ms
                    continue

            # ── Node type (new) or regular step ──────────────
            else:
                llm_enabled = node_data.get("llmEnabled", True)
                if not llm_enabled:
                    # Tool-only node — skip LLM call, passthrough
                    logger.info("[exec] Tool-only node '%s' (llmEnabled=false), passthrough", node_name)
                    duration_ms = 50
                    supabase.table("execution_steps").update({
                        "status": "completed",
                        "duration_ms": duration_ms,
                        "output_payload": {"status": "tool_execution", "tools": node_data.get("boundTools", [])},
                    }).eq("id", step_id).execute()
                    await send_event({
                        "type": "step_completed",
                        "step_id": step_id,
                        "step_number": step_number,
                        "duration_ms": duration_ms,
                        "result_summary": f"Tool node executed ({len(node_data.get('boundTools', []))} tools)",
                    })
                    total_duration += duration_ms
                    continue

                # LLM-enabled node — add the user message or previous output
                if last_output:
                    node_messages.append({"role": "user", "content":
                        f"{user_message}\n\nPrevious step output:\n{last_output}"
                    })
                else:
                    node_messages.append({"role": "user", "content": user_message})

            # ── Call LLM ─────────────────────────────────────
            step_output = ""
            try:
                async for chunk in call_llm_streaming(
                    user_id=user_id,
                    model=model,
                    messages=node_messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                ):
                    step_output += chunk
                    await send_event({
                        "type": "step_progress",
                        "step_id": step_id,
                        "content": chunk,
                    })
            except RuntimeError as e:
                # LLM error — mark step failed but don't crash the whole run
                error_msg = str(e)
                logger.error("[exec] LLM call failed at node '%s': %s", node_name, error_msg)
                supabase.table("execution_steps").update({
                    "status": "failed",
                    "output_payload": {"error": error_msg},
                }).eq("id", step_id).execute()
                await send_event({
                    "type": "step_completed",
                    "step_id": step_id,
                    "step_number": step_number,
                    "duration_ms": 0,
                    "result_summary": f"Error: {error_msg}",
                })
                # Re-raise to trigger fallback
                raise

            duration_ms = int((datetime.now(timezone.utc) - step_start).total_seconds() * 1000)
            total_duration += duration_ms
            last_output = step_output

            supabase.table("execution_steps").update({
                "status": "completed",
                "duration_ms": duration_ms,
                "output_payload": {"response_length": len(step_output)},
            }).eq("id", step_id).execute()

            await send_event({
                "type": "step_completed",
                "step_id": step_id,
                "step_number": step_number,
                "duration_ms": duration_ms,
                "result_summary": f"Generated {len(step_output)} chars in {duration_ms}ms",
            })

        # ── All nodes done ───────────────────────────────────
        supabase.table("execution_runs").update({
            "status": "completed",
            "total_duration_ms": total_duration,
            "step_count": len(nodes),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", run_id).execute()

        await send_event({
            "type": "run_completed",
            "run_id": run_id,
            "total_duration_ms": total_duration,
        })

        # Save assistant message (use last output)
        if last_output:
            supabase.table("thread_messages").insert({
                "thread_id": thread_id,
                "role": "assistant",
                "content": last_output,
                "message_type": "text",
                "metadata": {"run_id": run_id, "mode": "workflow"},
            }).execute()

            await send_event({
                "type": "assistant_message",
                "content": last_output,
            })

        logger.info("[exec] Workflow run completed: %d nodes, %dms", len(nodes), total_duration)

    except Exception as e:
        logger.error("[exec] Workflow graph execution failed at run=%s: %s", run_id, e)
        supabase.table("execution_runs").update({
            "status": "failed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", run_id).execute()
        await send_event({"type": "run_failed", "run_id": run_id, "error": str(e)})
        raise  # propagate to trigger fallback in execute_workflow()
