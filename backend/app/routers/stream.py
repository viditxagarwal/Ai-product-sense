import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.database import supabase
from app.services.execution_simulator import simulate_execution

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
        except Exception:
            pass

    if not user_id:
        try:
            resp = supabase_auth.auth.get_user(token)
            if resp and resp.user:
                user_id = resp.user.id
        except Exception:
            return False

    if not user_id:
        return False

    thread = (
        supabase.table("threads")
        .select("id")
        .eq("id", thread_id)
        .eq("user_id", user_id)
        .execute()
    )
    return bool(thread.data)


@router.websocket("/threads/{thread_id}/stream")
async def thread_stream(websocket: WebSocket, thread_id: str):
    # Auth: expect token as query param or first message
    token = websocket.query_params.get("token")

    await websocket.accept()

    if not token:
        # Try to get token from first message
        try:
            first_msg = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            data = json.loads(first_msg)
            token = data.get("token")
        except Exception:
            await websocket.send_json({"type": "error", "message": "Authentication required"})
            await websocket.close(code=4001)
            return

    if not _verify_thread_access(thread_id, token):
        await websocket.send_json({"type": "error", "message": "Access denied"})
        await websocket.close(code=4003)
        return

    async def send_event(event: dict):
        try:
            await websocket.send_json(event)
        except Exception:
            pass

    try:
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "start_run":
                user_message = msg.get("message", "")
                if not user_message:
                    await send_event({"type": "error", "message": "Message text required"})
                    continue

                # Cancel any existing run for this thread
                existing = _active_runs.get(thread_id)
                if existing and not existing.done():
                    existing.cancel()

                task = asyncio.create_task(
                    simulate_execution(thread_id, user_message, send_event)
                )
                _active_runs[thread_id] = task

            elif msg_type == "cancel_run":
                existing = _active_runs.get(thread_id)
                if existing and not existing.done():
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

    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        # Clean up active task
        existing = _active_runs.pop(thread_id, None)
        if existing and not existing.done():
            existing.cancel()
