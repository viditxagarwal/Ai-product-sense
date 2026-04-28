from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user_id
from app.models.guardrail import GuardrailCreate, GuardrailResponse
from app.services import guardrail_service

router = APIRouter(prefix="/guardrails", tags=["Guardrails"])


@router.get("", response_model=dict)
def list_guardrails(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user_id: UUID = Depends(get_current_user_id),
):
    return guardrail_service.list_guardrails(user_id, page, per_page)


@router.post("/seed", status_code=201)
def seed_platform_guardrails(user_id: UUID = Depends(get_current_user_id)):
    guardrails = guardrail_service.seed_platform_guardrails(user_id)
    return {"seeded": len(guardrails), "data": guardrails}


@router.post("", response_model=GuardrailResponse, status_code=201)
def create_guardrail(data: GuardrailCreate, user_id: UUID = Depends(get_current_user_id)):
    return guardrail_service.create_guardrail(user_id, data)
