from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PMAnnotationCreate(BaseModel):
    step_id: UUID
    annotation_text: str


class PMAnnotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    step_id: UUID
    user_id: UUID
    annotation_text: str
    created_at: datetime
