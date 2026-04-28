from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user_id
from app.models.prompt import PromptVersionCreate, PromptVersionResponse
from app.services import prompt_service

router = APIRouter(prefix="/prompts", tags=["Prompts"])


@router.get("/presets")
def list_presets():
    return prompt_service.list_presets()


@router.get("", response_model=dict)
def list_prompts(
    domain_id: UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user_id: UUID = Depends(get_current_user_id),
):
    return prompt_service.list_prompts(user_id, page, per_page, domain_id)


@router.get("/{prompt_id}", response_model=PromptVersionResponse)
def get_prompt(prompt_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return prompt_service.get_prompt(user_id, prompt_id)


@router.post("", response_model=PromptVersionResponse, status_code=201)
def create_prompt(data: PromptVersionCreate, user_id: UUID = Depends(get_current_user_id)):
    return prompt_service.create_prompt(user_id, data)
