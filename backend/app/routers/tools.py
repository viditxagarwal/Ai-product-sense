from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user_id
from app.models.tool import ToolCreate, ToolResponse, ToolUpdate
from pydantic import BaseModel

from app.services import tool_service
from app.services.postman_service import export_tools_as_postman, import_postman_collection

router = APIRouter(prefix="/tools", tags=["Tools"])


@router.get("", response_model=dict)
def list_tools(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user_id: UUID = Depends(get_current_user_id),
):
    return tool_service.list_tools(user_id, page, per_page)


@router.get("/{tool_id}", response_model=ToolResponse)
def get_tool(tool_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return tool_service.get_tool(user_id, tool_id)


@router.post("", response_model=ToolResponse, status_code=201)
def create_tool(data: ToolCreate, user_id: UUID = Depends(get_current_user_id)):
    return tool_service.create_tool(user_id, data)


@router.patch("/{tool_id}", response_model=ToolResponse)
def update_tool(
    tool_id: UUID, data: ToolUpdate, user_id: UUID = Depends(get_current_user_id)
):
    return tool_service.update_tool(user_id, tool_id, data)


@router.delete("/{tool_id}")
def delete_tool(tool_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return tool_service.delete_tool(user_id, tool_id)


@router.post("/seed", status_code=201)
def seed_default_tools(user_id: UUID = Depends(get_current_user_id)):
    tools = tool_service.seed_default_tools(user_id)
    return {"seeded": len(tools), "data": tools}


# --- Postman Integration (T3.7) ---

class PostmanExportQuery(BaseModel):
    tool_ids: list[str] | None = None


@router.get("/postman/export")
def postman_export(
    user_id: UUID = Depends(get_current_user_id),
    tool_ids: str | None = Query(None, description="Comma-separated tool IDs"),
):
    """Export tools as a Postman Collection v2.1."""
    ids = tool_ids.split(",") if tool_ids else None
    return export_tools_as_postman(str(user_id), ids)


@router.post("/postman/import", status_code=201)
def postman_import(
    collection: dict,
    user_id: UUID = Depends(get_current_user_id),
):
    """Import a Postman Collection and create tool definitions."""
    created = import_postman_collection(str(user_id), collection)
    return {"imported": len(created), "data": created}
