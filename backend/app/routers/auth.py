from uuid import UUID

from fastapi import APIRouter, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.dependencies import get_current_user_id
from app.services import tool_service, guardrail_service

limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/init-user", status_code=201)
@limiter.limit("5/minute")
def init_user(request: Request, user_id: UUID = Depends(get_current_user_id)):
    """Seed default tools and guardrails for a newly signed-up user.

    This endpoint is idempotent — the seed functions check if data
    already exists before inserting.
    """
    tools = tool_service.seed_default_tools(user_id)
    guardrails = guardrail_service.seed_platform_guardrails(user_id)
    return {
        "seeded_tools": len(tools),
        "seeded_guardrails": len(guardrails),
    }
