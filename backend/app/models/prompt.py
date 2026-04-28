from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PromptVersionBase(BaseModel):
    prompt_name: str
    version_number: int = 1
    prompt_text: str = ''
    preset_source: Optional[str] = None
    tags: list[str] = []


class PromptVersionCreate(PromptVersionBase):
    domain_id: Optional[UUID] = None


class PromptVersionResponse(PromptVersionBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    domain_id: Optional[UUID] = None
    created_at: datetime
