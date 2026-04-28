from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ThreadFileCreate(BaseModel):
    thread_id: UUID
    file_name: str
    file_url: str
    file_type: str
    file_size_bytes: Optional[int] = None
    source: Literal["user_upload", "ai_generated"] = "ai_generated"


class ThreadFileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    thread_id: UUID
    file_name: str
    file_url: str
    file_type: str
    file_size_bytes: Optional[int]
    source: str
    current_version: int
    created_at: datetime
    updated_at: datetime
