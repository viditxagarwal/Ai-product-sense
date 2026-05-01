"""Execution Event Emitter — persists events to execution_events table.

Implements Section G event schema. Each event is stored with its type,
parent relationship, and JSONB data payload. Events are also forwarded
to the WebSocket/SSE send_event callback for real-time streaming.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from app.database import supabase

logger = logging.getLogger("events")


class EventEmitter:
    """Emits and persists execution events for a single workflow run."""

    def __init__(self, execution_id: str, send_event=None):
        self.execution_id = execution_id
        self.send_event = send_event  # async fn(event_dict) for real-time push

    async def emit(
        self,
        event_type: str,
        data: dict,
        parent_event_id: str | None = None,
        persist: bool = True,
    ) -> str:
        """Persist an event and push it to the client. Returns the event ID."""
        event_id = None

        if persist:
            try:
                row = {
                    "execution_id": self.execution_id,
                    "event_type": event_type,
                    "data": data,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
                if parent_event_id:
                    row["parent_event_id"] = parent_event_id

                resp = supabase.table("execution_events").insert(row).execute()
                event_id = resp.data[0]["id"] if resp.data else None

                logger.debug("[events] Emitted %s (run=%s, id=%s)", event_type, self.execution_id[:8], event_id)
            except Exception as e:
                logger.warning("[events] Failed to persist event %s: %s", event_type, e)

        # Push to client in real-time
        if self.send_event:
            try:
                client_event = {"type": event_type, **data}
                if event_id:
                    client_event["event_id"] = event_id
                await self.send_event(client_event)
            except Exception as e:
                logger.warning("[events] Failed to send event %s to client: %s", event_type, e)

        return event_id or ""

    # ── Convenience methods for each event type ──────────────

    async def workflow_started(self, workflow_id: str, workflow_name: str, trigger: str,
                                user_input: str, config_snapshot: dict, step_count: int) -> str:
        return await self.emit("workflow_started", {
            "workflow_id": workflow_id,
            "workflow_name": workflow_name,
            "trigger": trigger,
            "user_input": user_input,
            "config_snapshot": config_snapshot,
            "step_count": step_count,
        })

    async def workflow_completed(self, status: str, final_output: str,
                                  total_duration_ms: int, total_tokens: int,
                                  total_cost_usd: float, path_taken: list[str]) -> str:
        return await self.emit("workflow_completed", {
            "status": status,
            "final_output": final_output[:500],  # truncate for event storage
            "total_duration_ms": total_duration_ms,
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost_usd, 6),
            "path_taken": path_taken,
        })

    async def node_started(self, node_id: str, node_label: str, node_type: str,
                           component_config: dict, input_context: str = "",
                           input_context_source: str = "user_message") -> str:
        return await self.emit("node_started", {
            "node_id": node_id,
            "node_label": node_label,
            "node_type": node_type,
            "component_config": component_config,
            "input_context": input_context[:1000],
            "input_context_source": input_context_source,
        })

    async def node_completed(self, node_id: str, status: str, output_result: str,
                              duration_ms: int, total_tokens: int, total_cost_usd: float,
                              llm_call_count: int, tool_call_count: int,
                              edge_taken: dict | None = None,
                              parent_event_id: str | None = None) -> str:
        return await self.emit("node_completed", {
            "node_id": node_id,
            "status": status,
            "output_result": output_result[:1000],
            "duration_ms": duration_ms,
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost_usd, 6),
            "llm_call_count": llm_call_count,
            "tool_call_count": tool_call_count,
            "edge_taken": edge_taken,
        }, parent_event_id=parent_event_id)

    async def llm_call_started(self, node_id: str, call_index: int, model_id: str,
                                provider: str, temperature: float, max_output_tokens: int,
                                parent_event_id: str | None = None) -> str:
        return await self.emit("llm_call_started", {
            "node_id": node_id,
            "call_index": call_index,
            "model_id": model_id,
            "provider": provider,
            "temperature": temperature,
            "max_output_tokens": max_output_tokens,
        }, parent_event_id=parent_event_id)

    async def llm_call_completed(self, node_id: str, call_index: int,
                                  call_data: dict,
                                  parent_event_id: str | None = None) -> str:
        """call_data is LLMCallResult.to_dict()"""
        return await self.emit("llm_call_completed", {
            "node_id": node_id,
            "call_index": call_index,
            **call_data,
        }, parent_event_id=parent_event_id)

    async def llm_chunk(self, node_id: str, text_delta: str = "",
                         thinking_delta: str = "", tokens_so_far: int = 0) -> None:
        """Lightweight — send to client but don't persist (too noisy)."""
        if self.send_event:
            try:
                await self.send_event({
                    "type": "llm_chunk",
                    "node_id": node_id,
                    "text_delta": text_delta,
                    "thinking_delta": thinking_delta,
                    "tokens_so_far": tokens_so_far,
                })
            except Exception:
                pass

    async def thinking_started(self, node_id: str, parent_event_id: str | None = None):
        """Emit when extended thinking begins for an LLM call."""
        await self.emit("thinking_started", {
            "node_id": node_id,
        }, parent_event_id=parent_event_id, persist=False)

    async def tool_started(self, node_id: str, tool_name: str,
                           input_arguments: dict, input_summary: str,
                           triggered_by: str = "llm_tool_call",
                           parent_event_id: str | None = None) -> str:
        return await self.emit("tool_started", {
            "node_id": node_id,
            "tool_name": tool_name,
            "input_arguments": input_arguments,
            "input_summary": input_summary,
            "triggered_by": triggered_by,
        }, parent_event_id=parent_event_id)

    async def tool_completed(self, node_id: str, tool_data: dict,
                              parent_event_id: str | None = None) -> str:
        """tool_data is ToolCallResult.to_dict()"""
        return await self.emit("tool_completed", {
            "node_id": node_id,
            **tool_data,
        }, parent_event_id=parent_event_id)

    async def step_progress(self, step_id: str, content: str) -> None:
        """Forward streaming text to client (not persisted)."""
        if self.send_event:
            try:
                await self.send_event({
                    "type": "step_progress",
                    "step_id": step_id,
                    "content": content,
                })
            except Exception:
                pass

    async def error(self, node_id: str, error_type: str, error_message: str,
                    stack_trace: str = "", retry_attempt: int = 0,
                    will_retry: bool = False,
                    parent_event_id: str | None = None) -> str:
        return await self.emit("error", {
            "node_id": node_id,
            "error_type": error_type,
            "error_message": error_message,
            "stack_trace": stack_trace[:2000],
            "retry_attempt": retry_attempt,
            "will_retry": will_retry,
        }, parent_event_id=parent_event_id)

    # ── Tier 2: Edge evaluation events ───────────────────────

    async def edge_evaluated(self, edge_id: str, source_node: str, target_node: str,
                              condition_method: str, condition_result: bool,
                              evaluation_details: dict,
                              parent_event_id: str | None = None) -> str:
        return await self.emit("edge_evaluated", {
            "edge_id": edge_id,
            "source_node": source_node,
            "target_node": target_node,
            "condition_method": condition_method,
            "condition_result": condition_result,
            "evaluation_details": evaluation_details,
        }, parent_event_id=parent_event_id)

    async def mapping_applied(self, edge_id: str, source_node: str, target_node: str,
                               mappings: list[dict],
                               parent_event_id: str | None = None) -> str:
        return await self.emit("mapping_applied", {
            "edge_id": edge_id,
            "source_node": source_node,
            "target_node": target_node,
            "mappings": mappings,
        }, parent_event_id=parent_event_id)

    # ── Tier 2: Split/merge events ───────────────────────────

    async def split_started(self, node_id: str, branch_count: int,
                             fan_out_method: str, merge_method: str,
                             parent_event_id: str | None = None) -> str:
        return await self.emit("split_started", {
            "node_id": node_id,
            "branch_count": branch_count,
            "fan_out_method": fan_out_method,
            "merge_method": merge_method,
        }, parent_event_id=parent_event_id)

    async def split_branch_completed(self, node_id: str, branch_index: int,
                                      branch_node_id: str, status: str,
                                      duration_ms: int, tokens: int,
                                      parent_event_id: str | None = None) -> str:
        return await self.emit("split_branch_completed", {
            "node_id": node_id,
            "branch_index": branch_index,
            "branch_node_id": branch_node_id,
            "status": status,
            "duration_ms": duration_ms,
            "tokens": tokens,
        }, parent_event_id=parent_event_id)

    async def split_completed(self, node_id: str, merge_method: str,
                               merged_output: str, total_branches: int,
                               completed_branches: int, failed_branches: int,
                               parent_event_id: str | None = None) -> str:
        return await self.emit("split_completed", {
            "node_id": node_id,
            "merge_method": merge_method,
            "merged_output": merged_output[:1000],
            "total_branches": total_branches,
            "completed_branches": completed_branches,
            "failed_branches": failed_branches,
        }, parent_event_id=parent_event_id)

    # ── Tier 2: Human review / gate events ───────────────────

    async def human_review_requested(self, node_id: str, node_label: str,
                                      review_instructions: str,
                                      available_actions: dict,
                                      wait_duration: str | None = None,
                                      timeout_action: str | None = None,
                                      parent_event_id: str | None = None) -> str:
        return await self.emit("human_review_requested", {
            "node_id": node_id,
            "node_label": node_label,
            "review_instructions": review_instructions,
            "available_actions": available_actions,
            "wait_duration": wait_duration,
            "timeout_action": timeout_action,
        }, parent_event_id=parent_event_id)

    async def human_review_completed(self, node_id: str, action: str,
                                      reviewer_comment: str = "",
                                      duration_ms: int = 0,
                                      parent_event_id: str | None = None) -> str:
        return await self.emit("human_review_completed", {
            "node_id": node_id,
            "action": action,
            "reviewer_comment": reviewer_comment,
            "duration_ms": duration_ms,
        }, parent_event_id=parent_event_id)

    # ── Tier 2: Loop events ──────────────────────────────────

    async def loop_iteration(self, edge_id: str, source_node: str, target_node: str,
                              iteration: int, max_iterations: int,
                              exit_condition_met: bool = False,
                              parent_event_id: str | None = None) -> str:
        return await self.emit("loop_iteration", {
            "edge_id": edge_id,
            "source_node": source_node,
            "target_node": target_node,
            "iteration": iteration,
            "max_iterations": max_iterations,
            "exit_condition_met": exit_condition_met,
        }, parent_event_id=parent_event_id)

    async def loop_completed(self, edge_id: str, source_node: str, target_node: str,
                              total_iterations: int, exit_reason: str,
                              parent_event_id: str | None = None) -> str:
        return await self.emit("loop_completed", {
            "edge_id": edge_id,
            "source_node": source_node,
            "target_node": target_node,
            "total_iterations": total_iterations,
            "exit_reason": exit_reason,
        }, parent_event_id=parent_event_id)
