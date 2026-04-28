from uuid import UUID

from fastapi import HTTPException

from app.database import supabase
from app.models.knowledge import EnterpriseDocumentCreate, EnterpriseDocumentUpdate


def list_documents(user_id: UUID, page: int = 1, per_page: int = 20, domain_id: UUID | None = None) -> dict:
    offset = (page - 1) * per_page

    query = supabase.table("enterprise_documents").select(
        "*, domains!inner(user_id)", count="exact"
    )
    query = query.eq("domains.user_id", str(user_id))
    if domain_id:
        query = query.eq("domain_id", str(domain_id))
    count_resp = query.execute()
    total = count_resp.count or 0

    query = supabase.table("enterprise_documents").select("*, domains!inner(user_id)")
    query = query.eq("domains.user_id", str(user_id))
    if domain_id:
        query = query.eq("domain_id", str(domain_id))
    resp = query.order("priority_order").range(offset, offset + per_page - 1).execute()

    data = [{k: v for k, v in row.items() if k != "domains"} for row in resp.data]
    return {"data": data, "count": total, "page": page}


def get_document(user_id: UUID, document_id: UUID) -> dict:
    resp = (
        supabase.table("enterprise_documents")
        .select("*, domains!inner(user_id)")
        .eq("id", str(document_id))
        .eq("domains.user_id", str(user_id))
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Document not found")
    data = {k: v for k, v in resp.data.items() if k != "domains"}
    return data


def create_document(user_id: UUID, data: EnterpriseDocumentCreate) -> dict:
    # Verify domain ownership
    domain_check = (
        supabase.table("domains")
        .select("id")
        .eq("id", str(data.domain_id))
        .eq("user_id", str(user_id))
        .single()
        .execute()
    )
    if not domain_check.data:
        raise HTTPException(status_code=404, detail="Domain not found")

    payload = data.model_dump(mode="json")
    resp = supabase.table("enterprise_documents").insert(payload).execute()
    return resp.data[0]


def update_document(user_id: UUID, document_id: UUID, data: EnterpriseDocumentUpdate) -> dict:
    get_document(user_id, document_id)
    payload = data.model_dump(exclude_none=True, mode="json")
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    resp = (
        supabase.table("enterprise_documents")
        .update(payload)
        .eq("id", str(document_id))
        .execute()
    )
    return resp.data[0]


def delete_document(user_id: UUID, document_id: UUID) -> dict:
    get_document(user_id, document_id)
    supabase.table("enterprise_documents").delete().eq("id", str(document_id)).execute()
    return {"success": True}
