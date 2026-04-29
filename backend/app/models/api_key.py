from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


Provider = Literal[
    "openai",
    "anthropic",
    "groq",
    "google_ai",
    "ollama",
    "custom_openai",
    "tavily",
    "alpha_vantage",
    "polygon",
    "database_pg",
    "database_mysql",
]


class ApiKeyCreate(BaseModel):
    provider: Provider
    api_key: str = ""  # plain-text key from user; empty for ollama
    extra_fields: dict = {}  # org_id, base_url, model_name, db fields, etc.


class ApiKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    provider: Provider
    key_hint: str
    extra_fields: dict
    is_valid: Optional[bool]
    last_tested_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class ApiKeyTestResult(BaseModel):
    success: bool
    message: str
    models: list[str] = []  # populated for providers that return model lists
