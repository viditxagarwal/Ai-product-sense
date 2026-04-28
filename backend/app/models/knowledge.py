from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class EnterpriseDocumentBase(BaseModel):
    file_name: str
    file_url: str
    file_type: str
    file_size_bytes: Optional[int] = None
    collection: str = 'default'
    tags: list[str] = []
    priority_order: int = 0
    processing_status: Literal['pending', 'processing', 'indexed', 'failed'] = 'pending'
    chunk_count: int = 0


class EnterpriseDocumentCreate(BaseModel):
    domain_id: UUID
    file_name: str
    file_url: str
    file_type: str
    file_size_bytes: Optional[int] = None
    collection: str = 'default'
    tags: list[str] = []
    priority_order: int = 0


class EnterpriseDocumentUpdate(BaseModel):
    file_name: Optional[str] = None
    collection: Optional[str] = None
    tags: Optional[list[str]] = None
    priority_order: Optional[int] = None
    processing_status: Optional[Literal['pending', 'processing', 'indexed', 'failed']] = None
    chunk_count: Optional[int] = None


class EnterpriseDocumentResponse(EnterpriseDocumentBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    domain_id: UUID
    created_at: datetime
