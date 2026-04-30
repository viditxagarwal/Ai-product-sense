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

    # Layer 4 fields
    workflow_id: Optional[UUID] = None
    configuration_id: Optional[UUID] = None
    config_snapshot: Optional[dict] = None
    path_taken: list[str] = []
    total_llm_calls: int = 0
    total_tool_calls: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_thinking_tokens: int = 0
    models_used: list[str] = []
    tools_used: list[str] = []
    cost_by_model: dict = {}
    cost_by_node: dict = {}


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


# ── Execution Events (Section G) ──────────────────────────

class ExecutionEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    execution_id: UUID
    parent_event_id: Optional[UUID] = None
    event_type: str
    timestamp: datetime
    data: dict


class ExecutionSummaryResponse(BaseModel):
    """Aggregated metrics for an execution run."""
    model_config = ConfigDict(from_attributes=True)

    execution_id: UUID
    status: str
    total_duration_ms: Optional[int] = 0
    total_tokens: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_thinking_tokens: int = 0
    total_cache_read_tokens: int = 0
    total_cache_write_tokens: int = 0
    total_cost_usd: float = 0.0
    total_llm_calls: int = 0
    total_tool_calls: int = 0
    step_count: int = 0
    path_taken: list[str] = []
    models_used: list[str] = []
    tools_used: list[str] = []
    cost_by_model: dict = {}
    cost_by_node: dict = {}


class DisplaySettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    settings: dict
    updated_at: datetime


class DisplaySettingsUpdate(BaseModel):
    settings: dict
