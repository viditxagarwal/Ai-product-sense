from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class DomainBase(BaseModel):
    domain_name: Literal['financial_valuation', 'coding', 'tax', 'design', 'custom']
    display_name: str
    description: str = ''
    memory_isolation: Literal['strict', 'soft', 'none'] = 'strict'
    base_prompt: str = ''
    enterprise_guardrails_file_url: Optional[str] = None
    enterprise_guardrails_file_name: Optional[str] = None


class DomainCreate(DomainBase):
    pass


class DomainUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    memory_isolation: Optional[Literal['strict', 'soft', 'none']] = None
    base_prompt: Optional[str] = None
    enterprise_guardrails_file_url: Optional[str] = None
    enterprise_guardrails_file_name: Optional[str] = None


class DomainResponse(DomainBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
