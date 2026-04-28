from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_user_id
from app.models.thread import ThreadCreate, ThreadResponse
from app.models.thread_message import ThreadMessageCreate, ThreadMessageResponse
from app.models.thread_file import ThreadFileCreate, ThreadFileResponse
from app.services import thread_service, thread_file_service

router = APIRouter(prefix="/threads", tags=["Threads"])


@router.post("", response_model=ThreadResponse, status_code=201)
def create_thread(data: ThreadCreate, user_id: UUID = Depends(get_current_user_id)):
    return thread_service.create_thread(user_id, data)


@router.get("", response_model=dict)
def list_threads(
    domain_id: UUID = Query(...),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    user_id: UUID = Depends(get_current_user_id),
):
    return thread_service.list_threads(user_id, domain_id, page, per_page)


@router.get("/{thread_id}", response_model=dict)
def get_thread(thread_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return thread_service.get_thread(user_id, thread_id)


@router.patch("/{thread_id}/archive", response_model=ThreadResponse)
def archive_thread(thread_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return thread_service.archive_thread(user_id, thread_id)


@router.get("/{thread_id}/messages", response_model=dict)
def list_messages(
    thread_id: UUID,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    user_id: UUID = Depends(get_current_user_id),
):
    return thread_service.get_thread_messages(user_id, thread_id, page, per_page)


@router.post("/{thread_id}/messages", response_model=ThreadMessageResponse, status_code=201)
def create_message(
    thread_id: UUID,
    data: ThreadMessageCreate,
    user_id: UUID = Depends(get_current_user_id),
):
    return thread_service.create_message(user_id, thread_id, data)


@router.get("/{thread_id}/files", response_model=list[ThreadFileResponse])
def list_thread_files(thread_id: UUID, user_id: UUID = Depends(get_current_user_id)):
    return thread_file_service.list_files(user_id, thread_id)


@router.post("/{thread_id}/files", response_model=ThreadFileResponse, status_code=201)
def create_thread_file(
    thread_id: UUID,
    data: ThreadFileCreate,
    user_id: UUID = Depends(get_current_user_id),
):
    return thread_file_service.create_file(user_id, thread_id, data)
