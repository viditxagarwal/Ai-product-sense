from uuid import UUID

from fastapi import HTTPException

from app.database import supabase
from app.models.configuration import ConfigurationCreate


def list_configurations(user_id: UUID, page: int = 1, per_page: int = 20) -> dict:
    offset = (page - 1) * per_page
    count_resp = (
        supabase.table("configurations")
        .select("*", count="exact")
        .eq("user_id", str(user_id))
        .execute()
    )
    total = count_resp.count or 0

    resp = (
        supabase.table("configurations")
        .select("*")
        .eq("user_id", str(user_id))
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )
    return {"data": resp.data, "count": total, "page": page}


def get_configuration(user_id: UUID, config_id: UUID) -> dict:
    resp = (
        supabase.table("configurations")
        .select("*")
        .eq("id", str(config_id))
        .eq("user_id", str(user_id))
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Configuration not found")
    return resp.data


def create_configuration(user_id: UUID, data: ConfigurationCreate) -> dict:
    payload = data.model_dump(mode="json")
    payload["user_id"] = str(user_id)
    resp = supabase.table("configurations").insert(payload).execute()
    return resp.data[0]


def duplicate_configuration(user_id: UUID, source_config_id: UUID, new_name: str) -> dict:
    source = get_configuration(user_id, source_config_id)

    # Remove fields that should not carry over
    exclude_keys = {"id", "user_id", "created_at", "created_from", "config_name", "config_version"}
    new_payload = {k: v for k, v in source.items() if k not in exclude_keys}

    # Set new metadata
    new_payload["config_name"] = new_name
    new_payload["created_from"] = str(source_config_id)
    new_payload["user_id"] = str(user_id)
    new_payload["config_version"] = source.get("config_version", 1) + 1
    new_payload["is_baseline"] = False

    resp = supabase.table("configurations").insert(new_payload).execute()
    return resp.data[0]
