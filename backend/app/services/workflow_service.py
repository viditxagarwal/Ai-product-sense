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


# ── Graph validation ─────────────────────────────────────

VALID_COMPONENT_TYPES = {"start", "end", "node", "gate", "split"}
VALID_EDGE_TYPES = {"flow", "conditional", "loop"}


def validate_graph(graph_data: dict) -> dict:
    """Validate a workflow graph and return errors/warnings.

    Returns {"valid": bool, "errors": [...], "warnings": [...]}.
    """
    errors: list[str] = []
    warnings: list[str] = []

    nodes = graph_data.get("nodes", [])
    edges = graph_data.get("edges", [])

    if not nodes:
        errors.append("Graph has no nodes")
        return {"valid": False, "errors": errors, "warnings": warnings}

    node_ids = {n["id"] for n in nodes}

    # Check START/END presence
    start_nodes = [n for n in nodes if n.get("type") == "start" or n.get("data", {}).get("componentType") == "start"]
    end_nodes = [n for n in nodes if n.get("type") == "end" or n.get("data", {}).get("componentType") == "end"]

    if len(start_nodes) == 0:
        errors.append("Graph must have a START node")
    elif len(start_nodes) > 1:
        errors.append("Graph must have exactly one START node")

    if len(end_nodes) == 0:
        errors.append("Graph must have an END node")
    elif len(end_nodes) > 1:
        errors.append("Graph must have exactly one END node")

    # Check componentType on all nodes
    for n in nodes:
        ct = n.get("data", {}).get("componentType", n.get("type", ""))
        if ct and ct not in VALID_COMPONENT_TYPES:
            # Allow legacy types — just warn
            warnings.append(f"Node '{n.get('data', {}).get('label', n['id'])}' has legacy type '{ct}'")

    # Validate edges reference existing nodes
    for e in edges:
        src = e.get("source")
        tgt = e.get("target")
        if src not in node_ids:
            errors.append(f"Edge '{e.get('id', '?')}' references missing source node '{src}'")
        if tgt not in node_ids:
            errors.append(f"Edge '{e.get('id', '?')}' references missing target node '{tgt}'")

    # Check no edges TO start or FROM end
    for e in edges:
        tgt = e.get("target")
        src = e.get("source")
        tgt_node = next((n for n in nodes if n["id"] == tgt), None)
        src_node = next((n for n in nodes if n["id"] == src), None)
        if tgt_node and (tgt_node.get("type") == "start" or tgt_node.get("data", {}).get("componentType") == "start"):
            warnings.append(f"Edge targets START node (unusual)")
        if src_node and (src_node.get("type") == "end" or src_node.get("data", {}).get("componentType") == "end"):
            warnings.append(f"Edge originates from END node (unusual)")

    # Check for disconnected nodes (no incoming AND no outgoing edges, excluding start/end)
    connected = set()
    for e in edges:
        connected.add(e.get("source"))
        connected.add(e.get("target"))
    for n in nodes:
        ct = n.get("data", {}).get("componentType", n.get("type", ""))
        if ct not in ("start", "end") and n["id"] not in connected:
            warnings.append(f"Node '{n.get('data', {}).get('label', n['id'])}' is disconnected")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }
