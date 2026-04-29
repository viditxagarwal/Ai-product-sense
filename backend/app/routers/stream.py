import asyncio
import json
import logging
import traceback

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import supabase
from app.services.workflow_executor import execute_workflow

logger = logging.getLogger("ws.stream")

router = APIRouter(tags=["Streaming"])

# Track active simulation tasks so they can be cancelled
_active_runs: dict[str, asyncio.Task] = {}


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
