from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class FileVersionCreate(BaseModel):
    file_id: UUID
    version_number: int
    file_url: str
    operation_type: Literal["creation", "targeted_edit", "append", "bulk_rewrite"]
    change_summary: Optional[dict] = None
    created_by: Literal["user", "ai"] = "ai"
    trigger_step_id: Optional[UUID] = None


class FileVersionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    file_id: UUID
    version_number: int
    file_url: str
    operation_type: str
    change_summary: Optional[dict]
    created_by: str
    trigger_step_id: Optional[UUID]
    created_at: datetime
