from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user_id
from app.models.knowledge import EnterpriseDocumentCreate, EnterpriseDocumentResponse
from app.services import knowledge_service

router = APIRouter(prefix="/knowledge", tags=["Knowledge Base"])


@router.get("", response_model=dict)
def list_documents(
    domain_id: UUID | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user_id: UUID = Depends(get_current_user_id),
):
    return knowledge_service.list_documents(user_id, page, per_page, domain_id)


@router.post("", response_model=EnterpriseDocumentResponse, status_code=201)
def create_document(
    data: EnterpriseDocumentCreate, user_id: UUID = Depends(get_current_user_id)
):
    return knowledge_service.create_document(user_id, data)


@router.delete("/{document_id}")
def delete_document(document_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return knowledge_service.delete_document(user_id, document_id)
