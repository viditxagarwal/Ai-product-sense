from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user_id
from app.models.domain import DomainCreate, DomainResponse, DomainUpdate
from app.services import domain_service

router = APIRouter(prefix="/domains", tags=["Domains"])


@router.get("", response_model=dict)
def list_domains(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user_id: UUID = Depends(get_current_user_id),
):
    return domain_service.list_domains(user_id, page, per_page)


@router.get("/{domain_id}", response_model=DomainResponse)
def get_domain(domain_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return domain_service.get_domain(user_id, domain_id)


@router.post("", response_model=DomainResponse, status_code=201)
def create_domain(data: DomainCreate, user_id: UUID = Depends(get_current_user_id)):
    return domain_service.create_domain(user_id, data)


@router.patch("/{domain_id}", response_model=DomainResponse)
def update_domain(
    domain_id: UUID, data: DomainUpdate, user_id: UUID = Depends(get_current_user_id)
):
    return domain_service.update_domain(user_id, domain_id, data)


@router.delete("/{domain_id}")
def delete_domain(domain_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return domain_service.delete_domain(user_id, domain_id)
