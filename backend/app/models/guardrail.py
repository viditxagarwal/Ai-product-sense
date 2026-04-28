from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class GuardrailBase(BaseModel):
    guardrail_name: str
    display_name: str
    description: str
    trigger_description: str = ''
    is_platform: bool = True


class GuardrailCreate(GuardrailBase):
    pass


class GuardrailResponse(GuardrailBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    created_at: datetime
