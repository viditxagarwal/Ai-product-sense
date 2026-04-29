from uuid import UUID

from fastapi import APIRouter, Depends

from app.dependencies import get_current_user_id
from app.models.api_key import ApiKeyCreate, ApiKeyResponse, ApiKeyTestResult
from app.services import api_key_service

router = APIRouter(prefix="/settings", tags=["Settings"])


@router.get("/api-keys", response_model=list[ApiKeyResponse])
def list_keys(user_id: UUID = Depends(get_current_user_id)):
    return api_key_service.list_api_keys(user_id)


@router.post("/api-keys", response_model=ApiKeyResponse, status_code=201)
def store_key(data: ApiKeyCreate, user_id: UUID = Depends(get_current_user_id)):
    return api_key_service.upsert_api_key(user_id, data)


@router.delete("/api-keys/{key_id}", status_code=204)
def remove_key(key_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    api_key_service.delete_api_key(user_id, key_id)


@router.post("/api-keys/{key_id}/test", response_model=ApiKeyTestResult)
async def test_key(key_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return await api_key_service.test_api_key(user_id, key_id)


@router.get("/available-models")
async def available_models(user_id: UUID = Depends(get_current_user_id)):
    return await api_key_service.get_available_models(user_id)
