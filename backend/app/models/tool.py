from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ToolBase(BaseModel):
    tool_name: str
    display_name: str
    description: str
    category: str = 'general'
    is_builtin: bool = True
    is_enabled: bool = True
    default_config: dict[str, Any] = {}
    config_schema: dict[str, Any] = {}


class ToolCreate(ToolBase):
    pass


class ToolUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    is_enabled: Optional[bool] = None
    default_config: Optional[dict[str, Any]] = None
    config_schema: Optional[dict[str, Any]] = None


class ToolResponse(ToolBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    created_at: datetime
    updated_at: datetime
