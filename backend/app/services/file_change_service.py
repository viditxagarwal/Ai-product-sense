from datetime import datetime, timezone
from uuid import UUID

from fastapi import HTTPException

from app.database import supabase
from app.models.file_change import FileChangeCreate


def create_changes(file_version_id: UUID, changes: list[FileChangeCreate]) -> list:
    # Verify the version is a targeted_edit
    version = (
        supabase.table("file_versions")
        .select("operation_type")
        .eq("id", str(file_version_id))
        .single()
        .execute()
    )
    if not version.data:
        raise HTTPException(status_code=404, detail="File version not found")
    if version.data["operation_type"] != "targeted_edit":
        raise HTTPException(
            status_code=400,
            detail="File changes are only created for targeted_edit versions",
        )

    rows = []
    for c in changes:
        payload = c.model_dump()
        payload["file_version_id"] = str(file_version_id)
        rows.append(payload)

    resp = supabase.table("file_changes").insert(rows).execute()
    return resp.data


def get_pending_changes(file_id: UUID) -> list:
    # Find the latest targeted_edit version for this file
    version = (
        supabase.table("file_versions")
        .select("id")
        .eq("file_id", str(file_id))
        .eq("operation_type", "targeted_edit")
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    )
    if not version.data:
        return []

    version_id = version.data[0]["id"]
    resp = (
        supabase.table("file_changes")
        .select("*")
        .eq("file_version_id", version_id)
        .eq("status", "pending")
        .execute()
    )
    return resp.data


def resolve_change(change_id: UUID, status: str) -> dict:
    if status not in ("accepted", "rejected", "reverted"):
        raise HTTPException(status_code=400, detail="Invalid status")

    resp = (
        supabase.table("file_changes")
        .update({
            "status": status,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("id", str(change_id))
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Change not found")
    return resp.data[0]


def bulk_resolve_changes(file_version_id: UUID, status: str) -> list:
    if status not in ("accepted", "rejected"):
        raise HTTPException(status_code=400, detail="Invalid status")

    resp = (
        supabase.table("file_changes")
        .update({
            "status": status,
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("file_version_id", str(file_version_id))
        .eq("status", "pending")
        .execute()
    )
    return resp.data


def get_changes_for_version(file_version_id: UUID) -> list:
    resp = (
        supabase.table("file_changes")
        .select("*")
        .eq("file_version_id", str(file_version_id))
        .execute()
    )
    return resp.data
