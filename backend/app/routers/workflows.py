from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user_id
from app.models.workflow import WorkflowCreate, WorkflowResponse, WorkflowUpdate
from app.services import workflow_service

router = APIRouter(prefix="/workflows", tags=["Workflows"])


@router.get("", response_model=dict)
def list_workflows(
    domain_id: UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user_id: UUID = Depends(get_current_user_id),
):
    return workflow_service.list_workflows(user_id, page, per_page, domain_id)


@router.get("/{workflow_id}", response_model=WorkflowResponse)
def get_workflow(workflow_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return workflow_service.get_workflow(user_id, workflow_id)


@router.post("", response_model=WorkflowResponse, status_code=201)
def create_workflow(data: WorkflowCreate, user_id: UUID = Depends(get_current_user_id)):
    return workflow_service.create_workflow(user_id, data)


@router.patch("/{workflow_id}", response_model=WorkflowResponse)
def update_workflow(
    workflow_id: UUID, data: WorkflowUpdate, user_id: UUID = Depends(get_current_user_id)
):
    return workflow_service.update_workflow(user_id, workflow_id, data)


@router.delete("/{workflow_id}")
def delete_workflow(workflow_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return workflow_service.delete_workflow(user_id, workflow_id)


@router.post("/{workflow_id}/validate")
def validate_workflow(workflow_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    wf = workflow_service.get_workflow(user_id, workflow_id)
    graph_data = wf.get("graph_data", {})
    return workflow_service.validate_graph(graph_data)
