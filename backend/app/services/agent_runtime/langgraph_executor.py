"""LangGraph-backed workflow executor.

This module preserves the current product WebSocket/event contract while
running the workflow through a compiled LangGraph graph.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
import traceback
from datetime import datetime, timezone
from typing import Any

from app.database import supabase
from app.services.agent_runtime.compiler import AgentGraphState, END_ROUTE, build_state_graph, graph_snapshot
from app.services.agent_runtime.event_bridge import LangGraphEventBridge
from app.services.agent_runtime.langchain_tools import build_langchain_tools
from app.services.file_context_service import build_thread_file_context, persist_artifacts_from_output
from app.services.tool_executor import fetch_tools_by_ids
from app.services.workflow_executor import (
    WorkflowGraph,
    _build_conversation_context,
    _compact_assistant_content,
    _dedupe_files,
    _execute_node_llm,
    _expects_artifact_surface,
    _files_from_tool_calls,
    _get_thread_context,
    _materialize_output_as_artifact,
    _parse_duration,
    _with_file_context,
    self as traversal_helpers,
)

logger = logging.getLogger("agent_runtime.langgraph")


async def resume_workflow_langgraph(thread_id: str, resume_payload: dict[str, Any], send_event) -> bool:
    """Resume hook for future checkpoint interrupt support.

    The first LangGraph runtime keeps compatibility with the existing WebSocket
    gate wait path, so most reviews are resolved through stream.resolve_gate.
    This hook exists so the router contract already supports Command(resume=...)
    once checkpoint-backed interrupts are enabled.
    """
    return False


async def execute_workflow_langgraph(thread_id: str, user_message: str, send_event):
    bridge: LangGraphEventBridge | None = None
    try:
        ctx = _get_thread_context(thread_id)
        ctx["raw_user_message"] = user_message
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

        workflow = ctx.get("workflow") or {}
        graph_data = workflow.get("graph_data") or {}
        snapshot = graph_snapshot(graph_data)
        bridge = LangGraphEventBridge(thread_id=thread_id, ctx=ctx, send_event=send_event)
        run_id, emitter = await bridge.start_run(step_count=len(snapshot.nodes))

        runtime = _LangGraphRuntime(
            thread_id=thread_id,
            user_message=user_message,
            ctx=ctx,
            graph=WorkflowGraph(graph_data),
            run_id=run_id,
            emitter=emitter,
            send_event=send_event,
        )
        app = build_state_graph(graph_data, runtime)

        initial_state: AgentGraphState = {
            "user_message": user_message,
            "current_input": assembled_user_message,
            "node_outputs": {},
            "path_taken": [],
            "loop_counts": {},
            "next_node": snapshot.start_node_id,
            "final_output": "",
            "total_duration_ms": 0,
            "total_tokens": 0,
            "total_input_tokens": 0,
            "total_output_tokens": 0,
            "total_thinking_tokens": 0,
            "total_cost_usd": 0.0,
            "total_llm_calls": 0,
            "total_tool_calls": 0,
            "models_used": [],
            "tools_used": [],
            "cost_by_model": {},
            "cost_by_node": {},
            "created_files": [],
            "langsmith_trace_url": _langsmith_trace_hint(run_id),
        }

        final_state = await app.ainvoke(
            initial_state,
            config={
                "configurable": {"thread_id": thread_id},
                "metadata": {
                    "thread_id": thread_id,
                    "run_id": run_id,
                    "workflow_id": ctx.get("workflow_id"),
                    "configuration_id": ctx.get("configuration_id"),
                    "runtime": "langgraph",
                },
            },
        )

        final_output = str(final_state.get("final_output") or runtime.last_non_gate_output(final_state))
        final_state["final_output"] = final_output
        created_files = _materialize_files(thread_id, user_message, final_output, final_state)
        final_state["created_files"] = created_files
        await bridge.emit_created_files(created_files)

        await bridge.complete_run(final_state)
        _persist_assistant_messages(thread_id, run_id, ctx, final_output, final_state, created_files)
        if final_output:
            await send_event({
                "type": "assistant_message",
                "content": _compact_assistant_content(final_output, created_files),
                "files": created_files,
                "runtime": "langgraph",
                "langsmith_trace_url": final_state.get("langsmith_trace_url"),
            })

    except Exception as exc:
        logger.error("[langgraph] execution failed: %s\n%s", exc, traceback.format_exc())
        if bridge:
            await bridge.fail_run(exc)
        await send_event({
            "type": "system_message",
            "content": f"LangGraph runtime failed: {exc}",
            "severity": "error",
        })
        raise


class _LangGraphRuntime:
    def __init__(self, *, thread_id: str, user_message: str, ctx: dict[str, Any],
                 graph: WorkflowGraph, run_id: str, emitter, send_event):
        self.thread_id = thread_id
        self.user_message = user_message
        self.ctx = ctx
        self.graph = graph
        self.run_id = run_id
        self.emitter = emitter
        self.send_event = send_event
        self.step_counter = 0
        self.route_output_to_artifact = _expects_artifact_surface(user_message)

    def make_node(self, node_id: str, node: dict[str, Any]):
        async def _node(state: AgentGraphState):
            node_type = self.graph.get_node_type(node_id)
            if node_type in ("start", "end"):
                return await self._run_passthrough_node(node_id, node_type, state)
            if node_type in ("gate", "human_review", "human_checkpoint"):
                return await self._run_gate_node(node_id, node_type, state)
            if node_type in ("split", "parallel", "parallelization"):
                return await self._run_split_node(node_id, node_type, state)
            return await self._run_llm_node(node_id, node_type, state)

        return _node

    async def _run_passthrough_node(self, node_id: str, node_type: str, state: AgentGraphState):
        node_name = self.graph.get_node_label(node_id)
        self.step_counter += 1
        step = supabase.table("execution_steps").insert({
            "run_id": self.run_id,
            "step_number": self.step_counter,
            "node_type": node_type,
            "node_name": node_name,
            "status": "completed",
            "duration_ms": 0,
            "input_payload": {"node_id": node_id, "runtime": "langgraph"},
            "output_payload": {"status": f"{node_type}_passthrough"},
        }).execute()
        step_id = step.data[0]["id"]
        event_id = await self.emitter.node_started(
            node_id=node_id,
            node_label=node_name,
            node_type=node_type,
            component_config={"runtime": "langgraph"},
            input_context=state.get("current_input", ""),
            input_context_source="langgraph_state",
        )
        await self.emitter.node_completed(
            node_id=node_id,
            status="completed",
            output_result="passthrough",
            duration_ms=0,
            total_tokens=0,
            total_cost_usd=0,
            llm_call_count=0,
            tool_call_count=0,
            parent_event_id=event_id,
        )
        await self.send_event({
            "type": "step_started",
            "step_id": step_id,
            "step_number": self.step_counter,
            "node_id": node_id,
            "node_type": node_type,
            "node_name": node_name,
        })
        await self.send_event({
            "type": "step_completed",
            "step_id": step_id,
            "step_number": self.step_counter,
            "duration_ms": 0,
            "result_summary": f"{node_name} — passthrough",
        })

        output = state.get("current_input", "") if node_type == "start" else state.get("final_output", "")
        return await self._attach_next_node(self._state_after_node(state, node_id, output), node_id)

    async def _run_gate_node(self, node_id: str, node_type: str, state: AgentGraphState):
        node_name = self.graph.get_node_label(node_id)
        node_data = self.graph.get_node_data(node_id)
        self.step_counter += 1
        step = supabase.table("execution_steps").insert({
            "run_id": self.run_id,
            "step_number": self.step_counter,
            "node_type": node_type,
            "node_name": node_name,
            "status": "running",
            "input_payload": {"node_id": node_id, "runtime": "langgraph"},
        }).execute()
        step_id = step.data[0]["id"]
        started_at = time.monotonic()

        node_event_id = await self.emitter.node_started(
            node_id=node_id,
            node_label=node_name,
            node_type=node_type,
            component_config=node_data,
            input_context=self._previous_output(state),
            input_context_source="previous_node_output",
        )
        await self.send_event({
            "type": "step_started",
            "step_id": step_id,
            "step_number": self.step_counter,
            "node_id": node_id,
            "node_type": node_type,
            "node_name": node_name,
        })

        previous_output = self._previous_output(state)
        available_actions = node_data.get("availableActions", {"approve": True, "rejectWithReason": True})
        wait_duration = node_data.get("waitDuration", "5m")
        on_timeout = node_data.get("onTimeout", "auto_approve")
        review_instructions = node_data.get("reviewInstructions", "")

        await self.emitter.human_review_requested(
            node_id=node_id,
            node_label=node_name,
            review_instructions=review_instructions,
            available_actions=available_actions,
            wait_duration=wait_duration,
            timeout_action=on_timeout,
            parent_event_id=node_event_id,
        )
        await self.send_event({
            "type": "gate_review_requested",
            "step_id": step_id,
            "node_id": node_id,
            "node_name": node_name,
            "review_instructions": review_instructions,
            "available_actions": available_actions,
            "previous_output": str(previous_output)[:2000],
            "wait_duration": wait_duration,
            "on_timeout": on_timeout,
            "runtime": "langgraph",
        })

        from app.routers.stream import _pending_gates, register_gate_wait

        gate_event, gate_result = register_gate_wait(self.thread_id)
        try:
            await asyncio.wait_for(gate_event.wait(), timeout=_parse_duration(wait_duration))
            action = gate_result["action"]
            comment = gate_result["comment"]
        except asyncio.TimeoutError:
            action = "auto_approve" if on_timeout == "auto_approve" else "auto_reject"
            comment = f"Timed out after {wait_duration}, action: {on_timeout}"
            _pending_gates.pop(self.thread_id, None)

        duration_ms = int((time.monotonic() - started_at) * 1000)
        status = "completed" if action in ("approve", "auto_approve", "edit_and_approve", "add_comment_and_continue") else "failed"
        supabase.table("execution_steps").update({
            "status": status,
            "duration_ms": duration_ms,
            "output_payload": {"action": action, "comment": comment, "runtime": "langgraph"},
        }).eq("id", step_id).execute()
        await self.emitter.human_review_completed(
            node_id=node_id,
            action=action,
            reviewer_comment=comment,
            duration_ms=duration_ms,
            parent_event_id=node_event_id,
        )
        await self.emitter.node_completed(
            node_id=node_id,
            status=status,
            output_result=f"Gate: {action}",
            duration_ms=duration_ms,
            total_tokens=0,
            total_cost_usd=0,
            llm_call_count=0,
            tool_call_count=0,
            parent_event_id=node_event_id,
        )
        await self.send_event({
            "type": "step_completed",
            "step_id": step_id,
            "step_number": self.step_counter,
            "duration_ms": duration_ms,
            "result_summary": f"Gate: {action}" + (f" — {comment}" if comment else ""),
        })

        output = f"Gate {action}: {comment}" if comment else f"Gate {action}"
        next_state = await self._attach_next_node(self._state_after_node(state, node_id, output), node_id)
        next_state["total_duration_ms"] = int(next_state.get("total_duration_ms") or 0) + duration_ms
        if action in ("reject", "auto_reject") and node_data.get("onReject", "stop") == "stop":
            next_state["next_node"] = END_ROUTE
        return next_state

    async def _run_split_node(self, node_id: str, node_type: str, state: AgentGraphState):
        node_name = self.graph.get_node_label(node_id)
        node_data = self.graph.get_node_data(node_id)
        self.step_counter += 1
        outgoing = self.graph.outgoing.get(node_id, [])
        branch_targets = [edge.get("target") for edge in outgoing if edge.get("target")]
        step = supabase.table("execution_steps").insert({
            "run_id": self.run_id,
            "step_number": self.step_counter,
            "node_type": node_type,
            "node_name": node_name,
            "status": "completed",
            "duration_ms": 0,
            "input_payload": {"node_id": node_id, "branch_targets": branch_targets, "runtime": "langgraph"},
            "output_payload": {"status": "fanout_routed", "branch_count": len(branch_targets)},
        }).execute()
        step_id = step.data[0]["id"]
        node_event_id = await self.emitter.node_started(
            node_id=node_id,
            node_label=node_name,
            node_type=node_type,
            component_config=node_data,
            input_context=self._previous_output(state),
            input_context_source="previous_node_output",
        )
        await self.emitter.split_started(
            node_id=node_id,
            branch_count=len(branch_targets),
            fan_out_method=node_data.get("fanOutMethod", "same_input"),
            merge_method=node_data.get("mergeMethod", "summarize"),
            parent_event_id=node_event_id,
        )
        await self.emitter.split_completed(
            node_id=node_id,
            merge_method=node_data.get("mergeMethod", "summarize"),
            merged_output=self._previous_output(state),
            total_branches=len(branch_targets),
            completed_branches=len(branch_targets),
            failed_branches=0,
            parent_event_id=node_event_id,
        )
        await self.emitter.node_completed(
            node_id=node_id,
            status="completed",
            output_result="Fan-out routed by LangGraph",
            duration_ms=0,
            total_tokens=0,
            total_cost_usd=0,
            llm_call_count=0,
            tool_call_count=0,
            parent_event_id=node_event_id,
        )
        await self.send_event({
            "type": "step_started",
            "step_id": step_id,
            "step_number": self.step_counter,
            "node_id": node_id,
            "node_type": node_type,
            "node_name": node_name,
        })
        await self.send_event({
            "type": "step_completed",
            "step_id": step_id,
            "step_number": self.step_counter,
            "duration_ms": 0,
            "result_summary": f"Split routed to {len(branch_targets)} branch(es)",
        })
        return await self._attach_next_node(
            self._state_after_node(state, node_id, self._previous_output(state)),
            node_id,
        )

    async def _run_llm_node(self, node_id: str, node_type: str, state: AgentGraphState):
        node_name = self.graph.get_node_label(node_id)
        node_data = self.graph.get_node_data(node_id)
        self.step_counter += 1
        step_start = time.monotonic()
        step = supabase.table("execution_steps").insert({
            "run_id": self.run_id,
            "step_number": self.step_counter,
            "node_type": node_type,
            "node_name": node_name,
            "status": "running",
            "input_payload": {"node_id": node_id, "runtime": "langgraph"},
        }).execute()
        step_id = step.data[0]["id"]
        node_event_id = await self.emitter.node_started(
            node_id=node_id,
            node_label=node_name,
            node_type=node_type,
            component_config=node_data,
            input_context=self._previous_output(state) or state.get("current_input", ""),
            input_context_source="langgraph_state",
        )
        await self.send_event({
            "type": "step_started",
            "step_id": step_id,
            "step_number": self.step_counter,
            "node_id": node_id,
            "node_type": node_type,
            "node_name": node_name,
        })

        bound_tool_ids = node_data.get("boundTools") or []
        if bound_tool_ids:
            tool_records = fetch_tools_by_ids(bound_tool_ids)
            build_langchain_tools(tool_records, user_id=self.ctx["user_id"], thread_id=self.thread_id)

        node_messages = self._node_messages(node_id, node_data, state)
        step_output, streaming_ctx = await _execute_node_llm(
            node_id,
            node_data,
            node_messages,
            self.ctx,
            self.emitter,
            self.send_event,
            step_id,
            self.step_counter,
            node_event_id,
            (self.ctx.get("config") or {}).get("streaming_mode", "text_and_thinking"),
            route_output_to_artifact=self.route_output_to_artifact,
        )
        duration_ms = int((time.monotonic() - step_start) * 1000)

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
                "model": node_data.get("modelOverride") or node_data.get("model") or self.ctx["model"],
                "runtime": "langgraph",
            },
        }).eq("id", step_id).execute()
        await self.emitter.node_completed(
            node_id=node_id,
            status="completed",
            output_result=step_output,
            duration_ms=duration_ms,
            total_tokens=streaming_ctx.total_tokens,
            total_cost_usd=streaming_ctx.total_cost_usd,
            llm_call_count=len(streaming_ctx.llm_calls),
            tool_call_count=len(streaming_ctx.tool_calls),
            parent_event_id=node_event_id,
        )
        await self.send_event({
            "type": "step_completed",
            "step_id": step_id,
            "step_number": self.step_counter,
            "duration_ms": duration_ms,
            "tokens": streaming_ctx.total_tokens,
            "cost_usd": round(streaming_ctx.total_cost_usd, 6),
            "result_summary": f"Generated {len(step_output)} chars in {duration_ms}ms",
        })

        next_state = await self._attach_next_node(self._state_after_node(state, node_id, step_output), node_id)
        next_state["total_duration_ms"] = int(next_state.get("total_duration_ms") or 0) + duration_ms
        next_state["total_tokens"] = int(next_state.get("total_tokens") or 0) + streaming_ctx.total_tokens
        next_state["total_input_tokens"] = int(next_state.get("total_input_tokens") or 0) + streaming_ctx.total_input_tokens
        next_state["total_output_tokens"] = int(next_state.get("total_output_tokens") or 0) + streaming_ctx.total_output_tokens
        next_state["total_thinking_tokens"] = int(next_state.get("total_thinking_tokens") or 0) + streaming_ctx.total_thinking_tokens
        next_state["total_cost_usd"] = float(next_state.get("total_cost_usd") or 0) + streaming_ctx.total_cost_usd
        next_state["total_llm_calls"] = int(next_state.get("total_llm_calls") or 0) + len(streaming_ctx.llm_calls)
        next_state["total_tool_calls"] = int(next_state.get("total_tool_calls") or 0) + len(streaming_ctx.tool_calls)

        models = set(next_state.get("models_used") or [])
        tools = set(next_state.get("tools_used") or [])
        cost_by_model = dict(next_state.get("cost_by_model") or {})
        for call in streaming_ctx.llm_calls:
            models.add(call.model_id)
            cost_by_model[call.model_id] = round(float(cost_by_model.get(call.model_id, 0)) + call.cost_usd, 6)
        for tool_call in streaming_ctx.tool_calls:
            tools.add(tool_call.tool_name)
        next_state["models_used"] = list(models)
        next_state["tools_used"] = list(tools)
        next_state["cost_by_model"] = cost_by_model
        next_state["cost_by_node"] = {
            **dict(next_state.get("cost_by_node") or {}),
            node_id: round(streaming_ctx.total_cost_usd, 6),
        }
        next_state["created_files"] = [
            *(next_state.get("created_files") or []),
            *_files_from_tool_calls(streaming_ctx),
        ]
        return next_state

    def _node_messages(self, node_id: str, node_data: dict[str, Any], state: AgentGraphState) -> list[dict[str, str]]:
        messages = []
        system_prompt = self.ctx.get("system_prompt", "")
        node_prompt = node_data.get("systemPrompt") or node_data.get("systemPromptHint") or ""
        if node_prompt:
            system_prompt = f"{system_prompt}\n\n## Node Instructions\n{node_prompt}" if system_prompt else node_prompt
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.extend(_build_conversation_context(self.thread_id, self.ctx))

        previous_output = self._previous_output(state)
        if previous_output:
            messages.append({
                "role": "user",
                "content": f"{self.user_message}\n\nPrevious step output:\n{previous_output}",
            })
        else:
            messages.append({"role": "user", "content": state.get("current_input", self.user_message)})
        return messages

    def _state_after_node(self, state: AgentGraphState, node_id: str, output: Any) -> AgentGraphState:
        node_outputs = dict(state.get("node_outputs") or {})
        node_outputs[node_id] = output
        path_taken = [*(state.get("path_taken") or []), node_id]
        final_output = output if self.graph.get_node_type(node_id) not in ("start", "gate", "human_review", "human_checkpoint") else state.get("final_output", "")
        return {
            **state,
            "node_outputs": node_outputs,
            "path_taken": path_taken,
            "next_node": END_ROUTE,
            "final_output": str(final_output or ""),
        }

    async def _attach_next_node(self, state: AgentGraphState, node_id: str) -> AgentGraphState:
        if self.graph.get_node_type(node_id) == "end":
            return {**state, "next_node": END_ROUTE}
        loop_counts = dict(state.get("loop_counts") or {})
        next_node = await self._resolve_next(
            node_id,
            dict(state.get("node_outputs") or {}),
            loop_counts,
        )
        return {**state, "next_node": next_node or END_ROUTE, "loop_counts": loop_counts}

    async def _resolve_next(
        self,
        node_id: str,
        node_outputs: dict[str, Any],
        loop_counts: dict[str, int],
    ) -> str | None:
        # LangGraph conditional functions are synchronous, so evaluate routing
        # inside the async node body and store the target in state.next_node.
        return await traversal_helpers._resolve_next_node(
            self.graph,
            node_id,
            node_outputs,
            self.emitter,
            self.ctx["user_id"],
            loop_counts,
        )

    def _previous_output(self, state: AgentGraphState) -> str:
        for node_id in reversed(state.get("path_taken") or []):
            value = (state.get("node_outputs") or {}).get(node_id)
            if value:
                return str(value)
        return ""

    def last_non_gate_output(self, state: AgentGraphState) -> str:
        for node_id in reversed(state.get("path_taken") or []):
            if self.graph.get_node_type(node_id) in ("start", "end", "gate", "human_review", "human_checkpoint"):
                continue
            output = (state.get("node_outputs") or {}).get(node_id)
            if output:
                return str(output)
        return ""


def _materialize_files(thread_id: str, user_message: str, final_output: str, state: dict[str, Any]) -> list[dict[str, Any]]:
    artifact_files = persist_artifacts_from_output(thread_id, final_output, trigger_step_id=None)
    created_files = _dedupe_files([*(state.get("created_files") or []), *artifact_files])
    if not created_files:
        materialized_file = _materialize_output_as_artifact(thread_id, user_message, final_output, trigger_step_id=None)
        if materialized_file:
            created_files = [materialized_file]
    return created_files


def _persist_assistant_messages(
    thread_id: str,
    run_id: str,
    ctx: dict[str, Any],
    final_output: str,
    state: dict[str, Any],
    created_files: list[dict[str, Any]],
) -> None:
    supabase.table("thread_messages").insert({
        "thread_id": thread_id,
        "role": "assistant",
        "content": "",
        "message_type": "execution_trace",
        "metadata": {"run_id": run_id, "runtime": "langgraph"},
    }).execute()

    if not final_output:
        return

    supabase.table("thread_messages").insert({
        "thread_id": thread_id,
        "role": "assistant",
        "content": _compact_assistant_content(final_output, created_files),
        "message_type": "text",
        "metadata": {
            "run_id": run_id,
            "mode": "workflow",
            "runtime": "langgraph",
            "model": ctx.get("model"),
            "tokens": state.get("total_tokens", 0),
            "cost_usd": round(float(state.get("total_cost_usd") or 0), 6),
            "duration_ms": state.get("total_duration_ms", 0),
            "llm_calls": state.get("total_llm_calls", 0),
            "tool_calls": state.get("total_tool_calls", 0),
            "files": created_files,
            "langsmith_trace_url": state.get("langsmith_trace_url"),
        },
    }).execute()


def _langsmith_trace_hint(run_id: str) -> str | None:
    endpoint = os.environ.get("LANGSMITH_ENDPOINT", "https://smith.langchain.com").rstrip("/")
    project = os.environ.get("LANGSMITH_PROJECT") or os.environ.get("LANGCHAIN_PROJECT")
    if not project:
        return None
    return f"{endpoint}/o/default/projects/p/{project}?q={run_id}"
