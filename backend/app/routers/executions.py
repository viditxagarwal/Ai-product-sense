import json
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.dependencies import get_current_user_id
from app.models.execution import (
    DisplaySettingsResponse,
    DisplaySettingsUpdate,
    ExecutionEventResponse,
    ExecutionRunResponse,
    ExecutionStepCreate,
    ExecutionStepResponse,
    ExecutionStepUpdate,
    ExecutionSummaryResponse,
)
from app.models.annotation import PMAnnotationCreate, PMAnnotationResponse
from app.services import execution_service
from app.services.pricing_service import get_all_pricing

router = APIRouter(tags=["Executions"])


# --- Runs ---

class RunCreateBody(BaseModel):
    thread_id: UUID
    trigger_message_id: UUID | None = None


class RunCompleteBody(BaseModel):
    total_duration_ms: int
    total_tokens: int
    total_cost_usd: float
    step_count: int


@router.post("/runs", response_model=ExecutionRunResponse, status_code=201)
def create_run(data: RunCreateBody, user_id: UUID = Depends(get_current_user_id)):
    return execution_service.create_run(user_id, data.thread_id, data.trigger_message_id)


@router.get("/runs/{run_id}", response_model=ExecutionRunResponse)
def get_run(run_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return execution_service.get_run(user_id, run_id)


@router.patch("/runs/{run_id}/complete", response_model=ExecutionRunResponse)
def complete_run(run_id: UUID, data: RunCompleteBody, user_id: UUID = Depends(get_current_user_id)):
    execution_service.get_run(user_id, run_id)
    return execution_service.complete_run(
        run_id, data.total_duration_ms, data.total_tokens, data.total_cost_usd, data.step_count
    )


@router.patch("/runs/{run_id}/fail", response_model=ExecutionRunResponse)
def fail_run(run_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    execution_service.get_run(user_id, run_id)
    return execution_service.fail_run(run_id)


# --- Steps ---

@router.get("/runs/{run_id}/steps", response_model=list[ExecutionStepResponse])
def get_run_steps(run_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return execution_service.get_run_steps(user_id, run_id)


@router.post("/runs/{run_id}/steps", response_model=ExecutionStepResponse, status_code=201)
def create_step(run_id: UUID, data: ExecutionStepCreate, user_id: UUID = Depends(get_current_user_id)):
    execution_service.get_run(user_id, run_id)
    return execution_service.create_step(run_id, data)


@router.patch("/steps/{step_id}", response_model=ExecutionStepResponse)
def update_step(step_id: UUID, data: ExecutionStepUpdate, user_id: UUID = Depends(get_current_user_id)):
    return execution_service.update_step(step_id, data)


# --- Execution Events (Section G) ---

@router.get("/runs/{run_id}/events", response_model=list[ExecutionEventResponse])
def get_run_events(
    run_id: UUID,
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    user_id: UUID = Depends(get_current_user_id),
):
    """Get all execution events for a run, optionally filtered by type."""
    return execution_service.get_run_events(user_id, run_id, event_type)


@router.get("/runs/{run_id}/summary")
def get_run_summary(run_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    """Get aggregated execution summary with token/cost breakdowns."""
    return execution_service.get_run_summary(user_id, run_id)


# --- Annotations ---

class AnnotationBody(BaseModel):
    annotation_text: str


@router.post("/steps/{step_id}/annotations", response_model=PMAnnotationResponse, status_code=201)
def create_annotation(
    step_id: UUID,
    data: AnnotationBody,
    user_id: UUID = Depends(get_current_user_id),
):
    return execution_service.create_annotation(user_id, step_id, data.annotation_text)


@router.get("/steps/{step_id}/annotations", response_model=list[PMAnnotationResponse])
def get_step_annotations(step_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return execution_service.get_step_annotations(step_id)


# --- Display Settings (Section I) ---

@router.get("/display-settings")
def get_display_settings(user_id: UUID = Depends(get_current_user_id)):
    """Get the user's inspector display settings."""
    return execution_service.get_display_settings(user_id)


@router.patch("/display-settings")
def update_display_settings(
    data: DisplaySettingsUpdate,
    user_id: UUID = Depends(get_current_user_id),
):
    """Update the user's inspector display settings (partial merge)."""
    return execution_service.update_display_settings(user_id, data.settings)


# --- Model Pricing (Section L.1) ---

@router.get("/model-pricing")
def get_model_pricing():
    """Get all model pricing for cost estimation."""
    return get_all_pricing()


# --- Test This Step (T3.5) ---

class TestStepRequest(BaseModel):
    workflow_id: UUID
    node_id: str
    input_payload: dict = {}
    configuration_id: UUID | None = None


@router.post("/steps/test")
async def test_step(
    data: TestStepRequest,
    user_id: UUID = Depends(get_current_user_id),
):
    """Execute a single workflow node in isolation with provided input."""
    result = await execution_service.test_single_step(
        user_id, str(data.workflow_id), data.node_id,
        data.input_payload, str(data.configuration_id) if data.configuration_id else None,
    )
    return JSONResponse(content=result)


# --- Export & Replay (T3.6) ---

@router.get("/runs/{run_id}/export")
def export_run(run_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    """Export a full execution trace (run + steps + events) as JSON."""
    return execution_service.export_run(user_id, run_id)


class ReplayRequest(BaseModel):
    thread_id: UUID
    source_run_id: UUID


@router.post("/runs/replay", status_code=201)
def replay_run(data: ReplayRequest, user_id: UUID = Depends(get_current_user_id)):
    """Create a new run by replaying a previous execution's configuration."""
    return execution_service.create_replay_run(user_id, data.thread_id, data.source_run_id)


# --- Alert Thresholds (T3.8) ---

class AlertThresholdCreate(BaseModel):
    metric: str  # e.g. "total_cost_usd", "total_tokens", "total_duration_ms"
    operator: str  # "gt", "gte", "lt", "lte"
    value: float
    action: str = "log"  # "log", "notify", "block"


@router.post("/alert-thresholds", status_code=201)
def create_alert_threshold(
    data: AlertThresholdCreate,
    user_id: UUID = Depends(get_current_user_id),
):
    """Create an alert threshold for execution metrics."""
    return execution_service.create_alert_threshold(user_id, data.model_dump())


@router.get("/alert-thresholds")
def list_alert_thresholds(user_id: UUID = Depends(get_current_user_id)):
    """List all alert thresholds for the user."""
    return execution_service.list_alert_thresholds(user_id)


@router.delete("/alert-thresholds/{threshold_id}")
def delete_alert_threshold(threshold_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    """Delete an alert threshold."""
    execution_service.delete_alert_threshold(user_id, threshold_id)
    return {"status": "deleted"}


@router.get("/runs/{run_id}/alerts")
def get_run_alerts(run_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    """Get alerts triggered by a specific run."""
    return execution_service.get_run_alerts(user_id, run_id)
