from uuid import UUID

from fastapi import HTTPException

from app.database import supabase
from app.models.thread_file import ThreadFileCreate
from app.models.file_version import FileVersionCreate


def create_file(user_id: UUID, thread_id: UUID, data: ThreadFileCreate) -> dict:
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

    payload = data.model_dump()
    payload["thread_id"] = str(thread_id)
    resp = supabase.table("thread_files").insert(payload).execute()
    return resp.data[0]


def list_files(user_id: UUID, thread_id: UUID) -> list:
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

    resp = (
        supabase.table("thread_files")
        .select("*")
        .eq("thread_id", str(thread_id))
        .order("created_at", desc=False)
        .execute()
    )
    return resp.data


def get_file(user_id: UUID, file_id: UUID) -> dict:
    resp = (
        supabase.table("thread_files")
        .select("*, threads!inner(user_id)")
        .eq("id", str(file_id))
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="File not found")
    if resp.data.get("threads", {}).get("user_id") != str(user_id):
        raise HTTPException(status_code=403, detail="Access denied")
    resp.data.pop("threads", None)
    return resp.data


def create_version(file_id: UUID, data: FileVersionCreate) -> dict:
    payload = data.model_dump()
    payload["file_id"] = str(file_id)
    if payload.get("trigger_step_id"):
        payload["trigger_step_id"] = str(payload["trigger_step_id"])

    resp = supabase.table("file_versions").insert(payload).execute()

    # Increment current_version on the file
    supabase.table("thread_files").update(
        {"current_version": data.version_number}
    ).eq("id", str(file_id)).execute()

    return resp.data[0]


def get_versions(file_id: UUID) -> list:
    resp = (
        supabase.table("file_versions")
        .select("*")
        .eq("file_id", str(file_id))
        .order("version_number", desc=False)
        .execute()
    )
    return resp.data


def get_latest_version(file_id: UUID) -> dict:
    resp = (
        supabase.table("file_versions")
        .select("*")
        .eq("file_id", str(file_id))
        .order("version_number", desc=True)
        .limit(1)
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="No versions found")
    return resp.data
