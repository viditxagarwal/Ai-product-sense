from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ThreadMessageCreate(BaseModel):
    thread_id: UUID
    role: Literal["user", "assistant", "system"]
    content: str = ""
    message_type: Literal["text", "execution_trace", "file_attachment"] = "text"
    metadata: Optional[dict] = None


class ThreadMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    thread_id: UUID
    role: str
    content: str
    message_type: str
    metadata: Optional[dict]
    created_at: datetime
