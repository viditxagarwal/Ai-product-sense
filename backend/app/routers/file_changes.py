from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.dependencies import get_current_user_id
from app.models.file_version import FileVersionResponse
from app.models.file_change import FileChangeResponse
from app.services import thread_file_service, file_change_service

router = APIRouter(tags=["Files & Changes"])


# --- File versions ---

@router.get("/files/{file_id}/versions", response_model=list[FileVersionResponse])
def get_file_versions(file_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    thread_file_service.get_file(user_id, file_id)
    return thread_file_service.get_versions(file_id)


# --- File changes ---

@router.get("/files/{file_id}/changes", response_model=list[FileChangeResponse])
def get_pending_changes(file_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    thread_file_service.get_file(user_id, file_id)
    return file_change_service.get_pending_changes(file_id)


class ChangeResolveBody(BaseModel):
    status: str  # 'accepted' or 'rejected'


@router.patch("/changes/{change_id}", response_model=FileChangeResponse)
def resolve_change(
    change_id: UUID,
    data: ChangeResolveBody,
    user_id: UUID = Depends(get_current_user_id),
):
    return file_change_service.resolve_change(change_id, data.status)


class BulkResolveBody(BaseModel):
    file_version_id: UUID
    status: str  # 'accepted' or 'rejected'


@router.patch("/changes/bulk", response_model=list[FileChangeResponse])
def bulk_resolve_changes(
    data: BulkResolveBody,
    user_id: UUID = Depends(get_current_user_id),
):
    return file_change_service.bulk_resolve_changes(data.file_version_id, data.status)
