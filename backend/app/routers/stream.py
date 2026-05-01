import asyncio
import json
import logging
import traceback

from fastapi import APIRouter, Depends, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from app.database import supabase
from app.dependencies import get_current_user_id
from app.services.agent_runtime import execute_workflow, resume_workflow

logger = logging.getLogger("ws.stream")

router = APIRouter(tags=["Streaming"])

# Track active simulation tasks so they can be cancelled
_active_runs: dict[str, asyncio.Task] = {}

# Pending gate reviews: thread_id -> asyncio.Event + result dict
# Set by gate node in executor, waited on until PM approves/rejects via WS
_pending_gates: dict[str, dict] = {}


def register_gate_wait(thread_id: str) -> tuple[asyncio.Event, dict]:
    """Register a pending gate review for a thread. Returns (event, result_holder)."""
    result_holder: dict = {"action": None, "comment": ""}
    event = asyncio.Event()
    _pending_gates[thread_id] = {"event": event, "result": result_holder}
    return event, result_holder


def resolve_gate(thread_id: str, action: str, comment: str = "") -> bool:
    """Resolve a pending gate review. Returns True if there was a gate waiting."""
    gate = _pending_gates.pop(thread_id, None)
    if not gate:
        return False
    gate["result"]["action"] = action
    gate["result"]["comment"] = comment
    gate["event"].set()
    return True


def _verify_thread_access(thread_id: str, token: str) -> bool:
    """Verify the user owns this thread using their JWT."""
    from app.config import SUPABASE_JWT_SECRET
    from app.database import supabase_auth

    user_id = None
    if SUPABASE_JWT_SECRET:
        import jwt
        try:
            payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
            user_id = payload.get("sub")
            logger.info("[auth] JWT decoded OK, user_id=%s", user_id)
        except Exception as e:
            logger.warning("[auth] JWT decode failed: %s", e)

    if not user_id:
        try:
            resp = supabase_auth.auth.get_user(token)
            if resp and resp.user:
                user_id = resp.user.id
                logger.info("[auth] Supabase get_user OK, user_id=%s", user_id)
        except Exception as e:
            logger.warning("[auth] Supabase get_user failed: %s", e)
            return False

    if not user_id:
        logger.warning("[auth] No user_id resolved from token")
        return False

    thread = (
        supabase.table("threads")
        .select("id")
        .eq("id", thread_id)
        .eq("user_id", user_id)
        .execute()
    )
    has_access = bool(thread.data)
    logger.info("[auth] Thread access check: thread=%s user=%s access=%s", thread_id, user_id, has_access)
    return has_access


@router.websocket("/threads/{thread_id}/stream")
async def thread_stream(websocket: WebSocket, thread_id: str):
    client_info = f"{websocket.client.host}:{websocket.client.port}" if websocket.client else "unknown"
    logger.info("[ws] Connection attempt: thread=%s client=%s", thread_id, client_info)

    # Auth: expect token as query param or first message
    token = websocket.query_params.get("token")
    token_source = "query_param" if token else "none"
    token_preview = f"{token[:20]}..." if token else "MISSING"
    logger.info("[ws] Token source=%s preview=%s", token_source, token_preview)

    await websocket.accept()
    logger.info("[ws] Connection accepted: thread=%s", thread_id)

    if not token:
        # Try to get token from first message
        logger.info("[ws] No token in query params, waiting for first message...")
        try:
            first_msg = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            data = json.loads(first_msg)
            token = data.get("token")
            token_source = "first_message" if token else "none"
            logger.info("[ws] First message received: has_token=%s keys=%s", bool(token), list(data.keys()))
        except asyncio.TimeoutError:
            logger.error("[ws] Timeout waiting for first message (5s)")
            await websocket.send_json({"type": "error", "message": "Authentication timeout - no token received within 5s"})
            await websocket.close(code=4001)
            return
        except Exception as e:
            logger.error("[ws] Error reading first message: %s", e)
            await websocket.send_json({"type": "error", "message": f"Authentication required: {e}"})
            await websocket.close(code=4001)
            return

    if not token:
        logger.error("[ws] No token available from any source. Closing with 4001.")
        await websocket.send_json({"type": "error", "message": "No auth token provided (checked query param and first message)"})
        await websocket.close(code=4001)
        return

    logger.info("[ws] Verifying thread access...")
    if not _verify_thread_access(thread_id, token):
        logger.error("[ws] Access denied: thread=%s", thread_id)
        await websocket.send_json({"type": "error", "message": "Access denied - token valid but user does not own this thread"})
        await websocket.close(code=4003)
        return

    logger.info("[ws] Auth OK. Listening for messages on thread=%s", thread_id)

    async def send_event(event: dict):
        event_type = event.get("type", "unknown")
        try:
            await websocket.send_json(event)
            logger.debug("[ws] Sent event: type=%s thread=%s", event_type, thread_id)
        except Exception as e:
            logger.error("[ws] Failed to send event type=%s: %s", event_type, e)

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")
            logger.info("[ws] Received message: type=%s thread=%s", msg_type, thread_id)

            if msg_type == "start_run":
                user_message = msg.get("message", "")
                if not user_message:
                    logger.warning("[ws] start_run with empty message")
                    await send_event({"type": "error", "message": "Message text required"})
                    continue

                logger.info("[ws] Starting execution: thread=%s message='%s'", thread_id, user_message[:100])

                # Cancel any existing run for this thread
                existing = _active_runs.get(thread_id)
                if existing and not existing.done():
                    logger.info("[ws] Cancelling existing run for thread=%s", thread_id)
                    existing.cancel()

                task = asyncio.create_task(
                    execute_workflow(thread_id, user_message, send_event)
                )
                _active_runs[thread_id] = task

                # Monitor the task for unexpected failures
                def _on_task_done(t: asyncio.Task, tid=thread_id):
                    if t.cancelled():
                        logger.info("[ws] Execution task cancelled: thread=%s", tid)
                    elif t.exception():
                        logger.error("[ws] Execution task FAILED: thread=%s error=%s\n%s",
                                     tid, t.exception(),
                                     "".join(traceback.format_exception(type(t.exception()), t.exception(), t.exception().__traceback__)))
                    else:
                        logger.info("[ws] Execution task completed: thread=%s", tid)

                task.add_done_callback(_on_task_done)

            elif msg_type == "cancel_run":
                existing = _active_runs.get(thread_id)
                if existing and not existing.done():
                    logger.info("[ws] User cancelled run: thread=%s", thread_id)
                    existing.cancel()
                    await send_event({"type": "run_failed", "run_id": msg.get("run_id", ""), "error": "Cancelled by user"})

            elif msg_type == "gate_review":
                action = msg.get("action", "")  # approve, reject, edit_and_approve, etc.
                comment = msg.get("comment", "")
                logger.info("[ws] Gate review: thread=%s action=%s", thread_id, action)
                if not action:
                    await send_event({"type": "error", "message": "gate_review requires 'action' field"})
                elif resolve_gate(thread_id, action, comment):
                    await send_event({"type": "gate_review_ack", "action": action})
                elif await resume_workflow(thread_id, {"action": action, "comment": comment}, send_event):
                    await send_event({"type": "gate_review_ack", "action": action})
                else:
                    await send_event({"type": "error", "message": "No pending gate review for this thread"})

            elif msg_type == "expand_step":
                step_id = msg.get("step_id")
                if step_id:
                    step = supabase.table("execution_steps").select("*").eq("id", step_id).single().execute()
                    if step.data:
                        await send_event({"type": "step_detail", "step": step.data})
                    else:
                        await send_event({"type": "error", "message": "Step not found"})

    except WebSocketDisconnect as e:
        logger.info("[ws] Client disconnected: thread=%s code=%s reason=%s", thread_id, e.code, e.reason)
    except Exception as e:
        logger.error("[ws] Unexpected error: thread=%s error=%s\n%s", thread_id, e, traceback.format_exc())
    finally:
        # Clean up active task
        existing = _active_runs.pop(thread_id, None)
        if existing and not existing.done():
            logger.info("[ws] Cleaning up active task for thread=%s", thread_id)
            existing.cancel()
        logger.info("[ws] Connection closed: thread=%s", thread_id)


# ══════════════════════════════════════════════════════════════
# SSE Endpoint (Section D.1)
# ══════════════════════════════════════════════════════════════

@router.get("/runs/{run_id}/events/stream")
async def stream_run_events(
    run_id: str,
    request: Request,
    last_event_id: str = Query(None, alias="Last-Event-ID"),
):
    """SSE endpoint to stream execution events for a run in real-time.

    Also useful for replaying completed runs — streams all stored events.
    Supports reconnection via Last-Event-ID header.
    """
    async def event_generator():
        # First: send all stored events (for replay or reconnection)
        try:
            query = (
                supabase.table("execution_events")
                .select("*")
                .eq("execution_id", run_id)
                .order("timestamp", desc=False)
            )
            resp = query.execute()
            events = resp.data or []

            # If reconnecting, skip events up to Last-Event-ID
            skip = bool(last_event_id)
            for evt in events:
                if skip:
                    if evt["id"] == last_event_id:
                        skip = False
                    continue

                event_data = json.dumps({
                    "event_type": evt["event_type"],
                    "data": evt["data"],
                    "timestamp": evt["timestamp"],
                    "parent_event_id": evt.get("parent_event_id"),
                })
                yield f"id: {evt['id']}\nevent: {evt['event_type']}\ndata: {event_data}\n\n"

            # Check if run is complete
            run = supabase.table("execution_runs").select("status").eq("id", run_id).single().execute()
            if run.data and run.data.get("status") in ("completed", "failed", "cancelled"):
                yield f"event: stream_end\ndata: {{\"status\": \"{run.data['status']}\"}}\n\n"
                return

        except Exception as e:
            logger.error("[sse] Error streaming events: %s", e)
            yield f"event: error\ndata: {{\"message\": \"{str(e)[:200]}\"}}\n\n"
            return

        # For active runs: poll for new events every 1s
        last_ts = events[-1]["timestamp"] if events else None
        poll_count = 0
        max_polls = 300  # 5 minutes max

        while poll_count < max_polls:
            if await request.is_disconnected():
                break

            await asyncio.sleep(1)
            poll_count += 1

            try:
                query = (
                    supabase.table("execution_events")
                    .select("*")
                    .eq("execution_id", run_id)
                    .order("timestamp", desc=False)
                )
                if last_ts:
                    query = query.gt("timestamp", last_ts)
                resp = query.execute()

                for evt in (resp.data or []):
                    event_data = json.dumps({
                        "event_type": evt["event_type"],
                        "data": evt["data"],
                        "timestamp": evt["timestamp"],
                        "parent_event_id": evt.get("parent_event_id"),
                    })
                    yield f"id: {evt['id']}\nevent: {evt['event_type']}\ndata: {event_data}\n\n"
                    last_ts = evt["timestamp"]

                # Check completion
                run = supabase.table("execution_runs").select("status").eq("id", run_id).single().execute()
                if run.data and run.data.get("status") in ("completed", "failed", "cancelled"):
                    yield f"event: stream_end\ndata: {{\"status\": \"{run.data['status']}\"}}\n\n"
                    return

            except Exception:
                pass

            # Keep-alive ping every 15 polls (~15s)
            if poll_count % 15 == 0:
                yield f": keepalive\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ══════════════════════════════════════════════════════════════
# Polling Endpoint (Section D.3 — fallback)
# ══════════════════════════════════════════════════════════════

@router.get("/execution/{run_id}/status")
async def get_execution_status(run_id: str):
    """Polling fallback for execution status (Section D.3)."""
    try:
        run = supabase.table("execution_runs").select("*").eq("id", run_id).single().execute()
        if not run.data:
            return {"error": "Run not found"}

        # Get recent events since this is a polling endpoint
        events = (
            supabase.table("execution_events")
            .select("event_type, data, timestamp")
            .eq("execution_id", run_id)
            .order("timestamp", desc=True)
            .limit(10)
            .execute()
        )

        r = run.data
        # Determine current node from most recent node_started event
        current_node = ""
        current_action = ""
        for evt in (events.data or []):
            if evt["event_type"] == "node_started":
                current_node = evt["data"].get("node_label", "")
                current_action = f"Processing {current_node}..."
                break

        return {
            "status": r.get("status"),
            "steps_completed": r.get("step_count", 0),
            "current_node": current_node,
            "current_action": current_action,
            "tokens_so_far": r.get("total_tokens", 0),
            "cost_so_far": float(r.get("total_cost_usd", 0)),
            "elapsed_ms": r.get("total_duration_ms", 0),
            "events_since": list(reversed(events.data or [])),
        }
    except Exception as e:
        return {"error": str(e)}
