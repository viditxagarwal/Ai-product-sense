from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class FileChangeCreate(BaseModel):
    file_version_id: UUID
    change_type: Literal["cell_modify", "line_modify"]
    location: str
    old_value: str = ""
    new_value: str = ""
    reason: Optional[str] = None
    downstream_impact: Optional[dict] = None


class FileChangeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    file_version_id: UUID
    change_type: str
    location: str
    old_value: str
    new_value: str
    reason: Optional[str]
    downstream_impact: Optional[dict]
    status: str
    resolved_at: Optional[datetime]


class FileChangeUpdate(BaseModel):
    status: Literal["accepted", "rejected", "reverted"]
    resolved_at: Optional[datetime] = None
