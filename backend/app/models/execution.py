from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ExecutionRunCreate(BaseModel):
    thread_id: UUID
    trigger_message_id: Optional[UUID] = None


class ExecutionRunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    thread_id: UUID
    trigger_message_id: Optional[UUID]
    status: str
    total_duration_ms: Optional[int]
    total_tokens: int
    total_cost_usd: float
    step_count: int
    created_at: datetime
    completed_at: Optional[datetime]


class ExecutionStepCreate(BaseModel):
    run_id: UUID
    step_number: int
    node_type: str
    node_name: str = ""
    tool_name: Optional[str] = None
    tool_config: Optional[dict] = None
    file_operation_type: Literal["creation", "targeted_edit", "append", "bulk_rewrite", "none"] = "none"


class ExecutionStepResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    run_id: UUID
    step_number: int
    node_type: str
    node_name: str
    status: str
    duration_ms: Optional[int]
    tokens_used: int
    cost_usd: float
    tool_name: Optional[str]
    tool_config: Optional[dict]
    input_payload: Optional[dict]
    output_payload: Optional[dict]
    routing_decision: Optional[dict]
    guardrails_fired: Optional[list]
    file_operation_type: str
    confidence_score: Optional[float]
    created_at: datetime


class ExecutionStepUpdate(BaseModel):
    status: Optional[Literal["pending", "running", "completed", "failed", "skipped"]] = None
    duration_ms: Optional[int] = None
    tokens_used: Optional[int] = None
    cost_usd: Optional[float] = None
    output_payload: Optional[dict] = None
    routing_decision: Optional[dict] = None
    guardrails_fired: Optional[list] = None
    file_operation_type: Optional[Literal["creation", "targeted_edit", "append", "bulk_rewrite", "none"]] = None
    confidence_score: Optional[float] = None
