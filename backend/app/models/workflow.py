from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GraphData(BaseModel):
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []


class WorkflowBase(BaseModel):
    workflow_name: str = 'Untitled Workflow'
    description: str = ''
    graph_data: GraphData = Field(default_factory=GraphData)
    entry_point: Optional[str] = None
    exit_point: Optional[str] = None
    global_timeout_seconds: int = 300
    error_handling_strategy: Literal['fail_fast', 'retry_node', 'skip_node', 'fallback_path'] = 'retry_node'
    max_total_node_executions: int = 50
    template_source: Optional[str] = None


class WorkflowCreate(WorkflowBase):
    domain_id: UUID


class WorkflowUpdate(BaseModel):
    workflow_name: Optional[str] = None
    description: Optional[str] = None
    graph_data: Optional[GraphData] = None
    entry_point: Optional[str] = None
    exit_point: Optional[str] = None
    global_timeout_seconds: Optional[int] = None
    error_handling_strategy: Optional[Literal['fail_fast', 'retry_node', 'skip_node', 'fallback_path']] = None
    max_total_node_executions: Optional[int] = None
    template_source: Optional[str] = None


class WorkflowResponse(WorkflowBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    domain_id: UUID
    created_at: datetime
    updated_at: datetime
