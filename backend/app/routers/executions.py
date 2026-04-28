from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies import get_current_user_id
from app.models.execution import (
    ExecutionRunResponse,
    ExecutionStepCreate,
    ExecutionStepResponse,
    ExecutionStepUpdate,
)
from app.models.annotation import PMAnnotationCreate, PMAnnotationResponse
from app.services import execution_service

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
    # Verify ownership
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
