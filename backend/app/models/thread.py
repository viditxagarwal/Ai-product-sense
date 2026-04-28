from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ThreadCreate(BaseModel):
    domain_id: UUID
    workflow_id: UUID
    configuration_id: UUID
    title: str = "New Thread"
    instructions: str = ""


class ThreadResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    domain_id: UUID
    workflow_id: UUID
    configuration_id: UUID
    user_id: UUID
    title: str
    instructions: str
    status: str
    created_at: datetime
    updated_at: datetime


class ThreadWithMessages(ThreadResponse):
    messages: list["ThreadMessageResponse"] = []


from app.models.thread_message import ThreadMessageResponse  # noqa: E402

ThreadWithMessages.model_rebuild()
