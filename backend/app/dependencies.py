import logging
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import SUPABASE_JWT_SECRET
from app.database import supabase_auth

logger = logging.getLogger(__name__)

security = HTTPBearer()


def _verify_local(token: str) -> UUID:
    """Verify JWT locally using the Supabase JWT secret."""
    payload = jwt.decode(
        token,
        SUPABASE_JWT_SECRET,
        algorithms=["HS256"],
        audience="authenticated",
    )
    sub = payload.get("sub")
    if not sub:
        raise ValueError("Missing sub claim")
    return UUID(sub)


def _verify_remote(token: str) -> UUID:
    """Fallback: verify via Supabase auth.get_user() network call."""
    user_response = supabase_auth.auth.get_user(token)
    if not user_response or not user_response.user:
        raise ValueError("Invalid token")
    return UUID(user_response.user.id)


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> UUID:
    """Validate the Supabase JWT and extract the user ID.

    Uses local JWT verification when SUPABASE_JWT_SECRET is configured,
    with automatic fallback to remote verification if local fails.
    """
    token = credentials.credentials
    try:
        if SUPABASE_JWT_SECRET:
            try:
                return _verify_local(token)
            except Exception as e:
                logger.warning("Local JWT verification failed (%s), falling back to remote", e)
                return _verify_remote(token)
        return _verify_remote(token)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
