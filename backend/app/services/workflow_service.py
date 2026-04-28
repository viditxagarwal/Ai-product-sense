from uuid import UUID

from fastapi import HTTPException

from app.database import supabase
from app.models.workflow import WorkflowCreate, WorkflowUpdate


def list_workflows(user_id: UUID, page: int = 1, per_page: int = 20, domain_id: UUID | None = None) -> dict:
    offset = (page - 1) * per_page

    # Workflows belong to domains owned by user — join through domain_id
    query = supabase.table("workflows").select("*, domains!inner(user_id)", count="exact")
    query = query.eq("domains.user_id", str(user_id))
    if domain_id:
        query = query.eq("domain_id", str(domain_id))
    count_resp = query.execute()
    total = count_resp.count or 0

    query = supabase.table("workflows").select("*,  domains!inner(user_id)")
    query = query.eq("domains.user_id", str(user_id))
    if domain_id:
        query = query.eq("domain_id", str(domain_id))
    resp = query.order("created_at", desc=True).range(offset, offset + per_page - 1).execute()

    # Strip the joined domains object from results
    data = [{k: v for k, v in row.items() if k != "domains"} for row in resp.data]
    return {"data": data, "count": total, "page": page}


def get_workflow(user_id: UUID, workflow_id: UUID) -> dict:
    resp = (
        supabase.table("workflows")
        .select("*, domains!inner(user_id)")
        .eq("id", str(workflow_id))
        .eq("domains.user_id", str(user_id))
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Workflow not found")
    data = {k: v for k, v in resp.data.items() if k != "domains"}
    return data


def create_workflow(user_id: UUID, data: WorkflowCreate) -> dict:
    # Verify the domain belongs to the user
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
    resp = supabase.table("workflows").insert(payload).execute()
    return resp.data[0]


def update_workflow(user_id: UUID, workflow_id: UUID, data: WorkflowUpdate) -> dict:
    # Verify ownership
    get_workflow(user_id, workflow_id)
    payload = data.model_dump(exclude_none=True, mode="json")
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    resp = (
        supabase.table("workflows")
        .update(payload)
        .eq("id", str(workflow_id))
        .execute()
    )
    return resp.data[0]


def delete_workflow(user_id: UUID, workflow_id: UUID) -> dict:
    get_workflow(user_id, workflow_id)
    supabase.table("workflows").delete().eq("id", str(workflow_id)).execute()
    return {"success": True}
