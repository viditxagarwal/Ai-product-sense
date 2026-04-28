from uuid import UUID

from fastapi import HTTPException

from app.database import supabase
from app.models.thread import ThreadCreate
from app.models.thread_message import ThreadMessageCreate


def create_thread(user_id: UUID, data: ThreadCreate) -> dict:
    payload = data.model_dump()
    payload["user_id"] = str(user_id)
    payload["domain_id"] = str(payload["domain_id"])
    payload["workflow_id"] = str(payload["workflow_id"])
    payload["configuration_id"] = str(payload["configuration_id"])
    resp = supabase.table("threads").insert(payload).execute()
    return resp.data[0]


def list_threads(user_id: UUID, domain_id: UUID, page: int = 1, per_page: int = 20) -> dict:
    offset = (page - 1) * per_page
    count_resp = (
        supabase.table("threads")
        .select("*", count="exact")
        .eq("user_id", str(user_id))
        .eq("domain_id", str(domain_id))
        .execute()
    )
    total = count_resp.count or 0

    resp = (
        supabase.table("threads")
        .select("*")
        .eq("user_id", str(user_id))
        .eq("domain_id", str(domain_id))
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )
    return {"data": resp.data, "count": total, "page": page}


def get_thread(user_id: UUID, thread_id: UUID) -> dict:
    resp = (
        supabase.table("threads")
        .select("*")
        .eq("id", str(thread_id))
        .eq("user_id", str(user_id))
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Thread not found")
    # Add message count
    msg_count = (
        supabase.table("thread_messages")
        .select("*", count="exact")
        .eq("thread_id", str(thread_id))
        .execute()
    )
    resp.data["message_count"] = msg_count.count or 0
    return resp.data


def archive_thread(user_id: UUID, thread_id: UUID) -> dict:
    get_thread(user_id, thread_id)
    resp = (
        supabase.table("threads")
        .update({"status": "archived"})
        .eq("id", str(thread_id))
        .eq("user_id", str(user_id))
        .execute()
    )
    return resp.data[0]


def get_thread_messages(user_id: UUID, thread_id: UUID, page: int = 1, per_page: int = 50) -> dict:
    # Verify ownership
    get_thread(user_id, thread_id)

    offset = (page - 1) * per_page
    count_resp = (
        supabase.table("thread_messages")
        .select("*", count="exact")
        .eq("thread_id", str(thread_id))
        .execute()
    )
    total = count_resp.count or 0

    resp = (
        supabase.table("thread_messages")
        .select("*")
        .eq("thread_id", str(thread_id))
        .order("created_at", desc=False)
        .range(offset, offset + per_page - 1)
        .execute()
    )
    return {"data": resp.data, "count": total, "page": page}


def create_message(user_id: UUID, thread_id: UUID, data: ThreadMessageCreate) -> dict:
    # Verify ownership
    get_thread(user_id, thread_id)

    payload = data.model_dump()
    payload["thread_id"] = str(thread_id)
    resp = supabase.table("thread_messages").insert(payload).execute()
    return resp.data[0]
