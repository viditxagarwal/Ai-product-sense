from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.dependencies import get_current_user_id
from app.models.configuration import ConfigurationCreate, ConfigurationResponse
from app.services import configuration_service

router = APIRouter(prefix="/configurations", tags=["Configurations"])


class DuplicateRequest(BaseModel):
    new_name: str


@router.get("", response_model=dict)
def list_configurations(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user_id: UUID = Depends(get_current_user_id),
):
    return configuration_service.list_configurations(user_id, page, per_page)


@router.get("/{config_id}", response_model=ConfigurationResponse)
def get_configuration(config_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return configuration_service.get_configuration(user_id, config_id)


@router.post("", response_model=ConfigurationResponse, status_code=201)
def create_configuration(
    data: ConfigurationCreate, user_id: UUID = Depends(get_current_user_id)
):
    return configuration_service.create_configuration(user_id, data)


@router.post("/{config_id}/duplicate", response_model=ConfigurationResponse, status_code=201)
def duplicate_configuration(
    config_id: UUID,
    data: DuplicateRequest,
    user_id: UUID = Depends(get_current_user_id),
):
    return configuration_service.duplicate_configuration(user_id, config_id, data.new_name)
