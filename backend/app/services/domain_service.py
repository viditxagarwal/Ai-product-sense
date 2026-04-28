from uuid import UUID

from fastapi import HTTPException

from app.database import supabase
from app.models.domain import DomainCreate, DomainUpdate


def list_domains(user_id: UUID, page: int = 1, per_page: int = 20) -> dict:
    offset = (page - 1) * per_page
    count_resp = (
        supabase.table("domains")
        .select("*", count="exact")
        .eq("user_id", str(user_id))
        .execute()
    )
    total = count_resp.count or 0

    resp = (
        supabase.table("domains")
        .select("*")
        .eq("user_id", str(user_id))
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )
    return {"data": resp.data, "count": total, "page": page}


def get_domain(user_id: UUID, domain_id: UUID) -> dict:
    resp = (
        supabase.table("domains")
        .select("*")
        .eq("id", str(domain_id))
        .eq("user_id", str(user_id))
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Domain not found")
    return resp.data


def create_domain(user_id: UUID, data: DomainCreate) -> dict:
    payload = data.model_dump()
    payload["user_id"] = str(user_id)
    resp = supabase.table("domains").insert(payload).execute()
    return resp.data[0]


def update_domain(user_id: UUID, domain_id: UUID, data: DomainUpdate) -> dict:
    # Verify ownership
    get_domain(user_id, domain_id)
    payload = data.model_dump(exclude_none=True)
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    resp = (
        supabase.table("domains")
        .update(payload)
        .eq("id", str(domain_id))
        .eq("user_id", str(user_id))
        .execute()
    )
    return resp.data[0]


def delete_domain(user_id: UUID, domain_id: UUID) -> dict:
    # Verify ownership
    get_domain(user_id, domain_id)
    supabase.table("domains").delete().eq("id", str(domain_id)).eq(
        "user_id", str(user_id)
    ).execute()
    return {"success": True}
