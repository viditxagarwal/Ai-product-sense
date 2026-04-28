"""Simulated execution engine for Phase 2 v1.

Reads the workflow graph, walks each node with realistic delays,
creates DB records (runs, steps, messages, files), and streams
events through a callback. Will be replaced by a real agent executor.
"""

import asyncio
import random
import uuid
from datetime import datetime, timezone

from app.database import supabase

# --- Fake output generators per node type ---

NODE_SIMULATORS: dict[str, callable] = {}


def _reg(node_type: str):
    def decorator(fn):
        NODE_SIMULATORS[node_type] = fn
        return fn
    return decorator


@_reg("agent_node")
def _sim_agent(node):
    return {
        "output_payload": {"response": f"Analyzed input and produced structured output for '{node.get('data', {}).get('label', 'Node')}'."},
        "tokens": random.randint(800, 2000),
        "result_summary": "Generated analysis response",
    }


@_reg("route")
def _sim_route(node):
    paths = ["path_a", "path_b", "default"]
    chosen = random.choice(paths)
    confidence = round(random.uniform(0.65, 0.98), 2)
    return {
        "output_payload": {"chosen_route": chosen},
        "routing_decision": {"candidates": paths, "chosen": chosen, "confidence": confidence},
        "confidence_score": confidence,
        "tokens": random.randint(100, 400),
        "result_summary": f"Routed to {chosen} (confidence: {confidence})",
    }


@_reg("retriever")
def _sim_retriever(node):
    doc_count = random.randint(2, 5)
    docs = [{"title": f"Document {i+1}", "relevance": round(random.uniform(0.7, 0.99), 2)} for i in range(doc_count)]
    return {
        "output_payload": {"documents": docs, "total_retrieved": doc_count},
        "tokens": random.randint(200, 600),
        "result_summary": f"Retrieved {doc_count} documents from knowledge base",
    }


@_reg("calculator")
def _sim_calculator(node):
    result = round(random.uniform(1000, 50000000), 2)
    return {
        "output_payload": {"calculation": "DCF Valuation", "result": result, "currency": "USD"},
        "tokens": random.randint(300, 800),
        "result_summary": f"Calculated value: ${result:,.2f}",
    }


@_reg("validator")
def _sim_validator(node):
    checks = ["never_fabricate", "source_grounding", "calculation_accuracy"]
    results = {c: random.choice(["passed", "passed", "passed", "warning"]) for c in checks}
    return {
        "output_payload": {"guardrail_results": results},
        "guardrails_fired": [c for c, v in results.items() if v == "warning"],
        "tokens": random.randint(100, 300),
        "result_summary": f"Guardrails checked: {sum(1 for v in results.values() if v == 'passed')}/{len(checks)} passed",
    }


@_reg("file_writer")
def _sim_file_writer(node):
    return {
        "output_payload": {"action": "file_creation"},
        "file_operation_type": "creation",
        "tokens": random.randint(500, 1500),
        "result_summary": "Created output file",
    }


@_reg("parallelization")
def _sim_parallel(node):
    branch_count = node.get("data", {}).get("branchCount", 3)
    return {
        "output_payload": {"branches_executed": branch_count, "merge_method": "concatenate"},
        "tokens": random.randint(200, 500),
        "result_summary": f"Executed {branch_count} parallel branches",
    }


@_reg("loop")
def _sim_loop(node):
    iterations = random.randint(1, 3)
    return {
        "output_payload": {"iterations": iterations, "exit_reason": "quality_threshold_met"},
        "tokens": random.randint(400, 1200),
        "result_summary": f"Looped {iterations} times, exited on quality threshold",
    }


@_reg("human_review")
def _sim_human(node):
    return {
        "output_payload": {"status": "auto_approved", "note": "Simulated human approval"},
        "tokens": 0,
        "result_summary": "Human review auto-approved (simulated)",
    }


@_reg("end")
def _sim_end(node):
    return {
        "output_payload": {"status": "workflow_complete"},
        "tokens": 0,
        "result_summary": "Workflow completed",
    }


def _default_sim(node):
    return {
        "output_payload": {"result": "Step completed"},
        "tokens": random.randint(100, 500),
        "result_summary": "Step executed successfully",
    }


COST_PER_TOKEN = 0.000003  # ~$3 per 1M tokens


def _get_nodes_in_order(graph_data: dict) -> list[dict]:
    """Extract nodes from graph_data, attempt topological order via edges."""
    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    if not nodes:
        return []

    # Build adjacency for simple ordering
    node_map = {n["id"]: n for n in nodes}
    in_degree = {n["id"]: 0 for n in nodes}
    adj = {n["id"]: [] for n in nodes}

    for e in edges:
        src = e.get("source")
        tgt = e.get("target")
        if src in adj and tgt in in_degree:
            adj[src].append(tgt)
            in_degree[tgt] = in_degree.get(tgt, 0) + 1

    # Kahn's algorithm
    queue = [nid for nid, deg in in_degree.items() if deg == 0]
    ordered = []
    while queue:
        nid = queue.pop(0)
        ordered.append(node_map[nid])
        for neighbor in adj.get(nid, []):
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    # Append any missed nodes (disconnected)
    seen = {n["id"] for n in ordered}
    for n in nodes:
        if n["id"] not in seen:
            ordered.append(n)

    return ordered


async def simulate_execution(thread_id: str, user_message: str, send_event):
    """Run the simulation. send_event is an async callable that sends a dict to the WebSocket."""

    # Fetch thread + workflow
    thread = supabase.table("threads").select("*").eq("id", thread_id).single().execute()
    if not thread.data:
        await send_event({"type": "error", "message": "Thread not found"})
        return

    workflow = supabase.table("workflows").select("*").eq("id", thread.data["workflow_id"]).single().execute()
    if not workflow.data:
        await send_event({"type": "error", "message": "Workflow not found"})
        return

    graph_data = workflow.data.get("graph_data", {})
    nodes = _get_nodes_in_order(graph_data)

    if not nodes:
        nodes = [{"id": "default", "type": "agent_node", "data": {"label": "Default Agent"}}]

    # Create user message
    user_msg = supabase.table("thread_messages").insert({
        "thread_id": thread_id,
        "role": "user",
        "content": user_message,
        "message_type": "text",
    }).execute()
    user_msg_id = user_msg.data[0]["id"]

    # Create execution run
    run = supabase.table("execution_runs").insert({
        "thread_id": thread_id,
        "trigger_message_id": user_msg_id,
        "status": "running",
    }).execute()
    run_id = run.data[0]["id"]

    await send_event({
        "type": "run_started",
        "run_id": run_id,
        "step_count": len(nodes),
    })

    total_tokens = 0
    total_cost = 0.0
    total_duration = 0
    created_files = []

    try:
        for i, node in enumerate(nodes):
            node_type = node.get("type", "agent_node")
            node_name = node.get("data", {}).get("label", node_type)
            step_number = i + 1

            # Create step record
            step = supabase.table("execution_steps").insert({
                "run_id": run_id,
                "step_number": step_number,
                "node_type": node_type,
                "node_name": node_name,
                "status": "running",
            }).execute()
            step_id = step.data[0]["id"]

            await send_event({
                "type": "step_started",
                "step_id": step_id,
                "step_number": step_number,
                "node_type": node_type,
                "node_name": node_name,
            })

            # Simulate thinking delay
            duration_ms = random.randint(500, 5000)
            chunks = random.randint(2, 4)
            per_chunk = duration_ms / chunks / 1000

            for c in range(chunks):
                await asyncio.sleep(per_chunk)
                progress_texts = [
                    f"Processing {node_name}...",
                    f"Analyzing input data...",
                    f"Generating output for step {step_number}...",
                    f"Applying {node_type} logic...",
                ]
                await send_event({
                    "type": "step_progress",
                    "step_id": step_id,
                    "content": progress_texts[c % len(progress_texts)],
                })

            # Generate simulated output
            simulator = NODE_SIMULATORS.get(node_type, _default_sim)
            sim_result = simulator(node)

            tokens = sim_result.get("tokens", 100)
            cost = round(tokens * COST_PER_TOKEN, 4)
            total_tokens += tokens
            total_cost += cost
            total_duration += duration_ms

            file_op = sim_result.get("file_operation_type", "none")

            # Update step as completed
            update_payload = {
                "status": "completed",
                "duration_ms": duration_ms,
                "tokens_used": tokens,
                "cost_usd": cost,
                "output_payload": sim_result.get("output_payload", {}),
                "routing_decision": sim_result.get("routing_decision", {}),
                "guardrails_fired": sim_result.get("guardrails_fired", []),
                "file_operation_type": file_op,
                "confidence_score": sim_result.get("confidence_score"),
            }
            supabase.table("execution_steps").update(update_payload).eq("id", step_id).execute()

            step_completed_event = {
                "type": "step_completed",
                "step_id": step_id,
                "step_number": step_number,
                "duration_ms": duration_ms,
                "result_summary": sim_result.get("result_summary", "Done"),
                "file_operation_type": file_op,
            }
            await send_event(step_completed_event)

            # If file_writer node, create actual file record
            if node_type == "file_writer" or file_op == "creation":
                file_name = f"output_{step_number}_{uuid.uuid4().hex[:6]}.md"
                file_record = supabase.table("thread_files").insert({
                    "thread_id": thread_id,
                    "file_name": file_name,
                    "file_url": f"/simulated/{file_name}",
                    "file_type": "text/markdown",
                    "source": "ai_generated",
                }).execute()
                fid = file_record.data[0]["id"]

                supabase.table("file_versions").insert({
                    "file_id": fid,
                    "version_number": 1,
                    "file_url": f"/simulated/{file_name}",
                    "operation_type": "creation",
                    "created_by": "ai",
                    "trigger_step_id": step_id,
                }).execute()

                created_files.append({"file_id": fid, "file_name": file_name, "file_type": "text/markdown"})
                await send_event({
                    "type": "file_created",
                    "file_id": fid,
                    "file_name": file_name,
                    "file_type": "text/markdown",
                })

        # Complete the run
        supabase.table("execution_runs").update({
            "status": "completed",
            "total_duration_ms": total_duration,
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 4),
            "step_count": len(nodes),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", run_id).execute()

        await send_event({
            "type": "run_completed",
            "run_id": run_id,
            "total_duration_ms": total_duration,
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 4),
        })

        # Create assistant message
        assistant_content = (
            f"I've completed the analysis using the {workflow.data.get('workflow_name', 'workflow')} workflow. "
            f"Processed {len(nodes)} steps in {total_duration/1000:.1f}s using {total_tokens} tokens."
        )
        if created_files:
            file_list = ", ".join(f["file_name"] for f in created_files)
            assistant_content += f"\n\nGenerated files: {file_list}"

        supabase.table("thread_messages").insert({
            "thread_id": thread_id,
            "role": "assistant",
            "content": assistant_content,
            "message_type": "text",
            "metadata": {"run_id": run_id, "files": created_files},
        }).execute()

        await send_event({
            "type": "assistant_message",
            "content": assistant_content,
            "files": created_files,
        })

    except asyncio.CancelledError:
        supabase.table("execution_runs").update({
            "status": "cancelled",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", run_id).execute()
        await send_event({"type": "run_failed", "run_id": run_id, "error": "Execution cancelled"})

    except Exception as e:
        supabase.table("execution_runs").update({
            "status": "failed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", run_id).execute()
        await send_event({"type": "run_failed", "run_id": run_id, "error": str(e)})
