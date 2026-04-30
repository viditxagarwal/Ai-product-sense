from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
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
