import base64
import hashlib
import json
import logging
import os
from datetime import datetime, timezone
from uuid import UUID

import httpx
from cryptography.fernet import Fernet
from fastapi import HTTPException

from app.database import supabase
from app.models.api_key import ApiKeyCreate, ApiKeyTestResult

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Encryption helpers
# ---------------------------------------------------------------------------
# Derive a Fernet key from ENCRYPTION_SECRET (or fallback to SUPABASE_SERVICE_ROLE_KEY).
_raw_secret = os.environ.get(
    "ENCRYPTION_SECRET",
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "fallback-secret-change-me"),
)
_fernet_key = base64.urlsafe_b64encode(
    hashlib.sha256(_raw_secret.encode()).digest()
)
_fernet = Fernet(_fernet_key)


def _encrypt(plain: str) -> str:
    return _fernet.encrypt(plain.encode()).decode()


def _decrypt(token: str) -> str:
    return _fernet.decrypt(token.encode()).decode()


def _key_hint(key: str) -> str:
    if len(key) <= 6:
        return "••••••"
    return key[-6:]


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

def list_api_keys(user_id: UUID) -> list[dict]:
    resp = (
        supabase.table("api_keys")
        .select("*")
        .eq("user_id", str(user_id))
        .order("created_at")
        .execute()
    )
    # Strip encrypted_key from response
    for row in resp.data:
        row.pop("encrypted_key", None)
    return resp.data


def upsert_api_key(user_id: UUID, data: ApiKeyCreate) -> dict:
    hint = _key_hint(data.api_key) if data.api_key else ""
    encrypted = _encrypt(data.api_key) if data.api_key else _encrypt("")

    # Check if exists
    existing = (
        supabase.table("api_keys")
        .select("id")
        .eq("user_id", str(user_id))
        .eq("provider", data.provider)
        .execute()
    )

    payload = {
        "user_id": str(user_id),
        "provider": data.provider,
        "encrypted_key": encrypted,
        "key_hint": hint,
        "extra_fields": data.extra_fields,
        "is_valid": None,
        "last_tested_at": None,
    }

    if existing.data:
        row_id = existing.data[0]["id"]
        resp = (
            supabase.table("api_keys")
            .update(payload)
            .eq("id", row_id)
            .execute()
        )
    else:
        resp = supabase.table("api_keys").insert(payload).execute()

    row = resp.data[0]
    row.pop("encrypted_key", None)
    return row


def delete_api_key(user_id: UUID, key_id: UUID) -> None:
    resp = (
        supabase.table("api_keys")
        .delete()
        .eq("id", str(key_id))
        .eq("user_id", str(user_id))
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="API key not found")


# ---------------------------------------------------------------------------
# Test connection
# ---------------------------------------------------------------------------

async def test_api_key(user_id: UUID, key_id: UUID) -> ApiKeyTestResult:
    resp = (
        supabase.table("api_keys")
        .select("*")
        .eq("id", str(key_id))
        .eq("user_id", str(user_id))
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="API key not found")

    row = resp.data
    provider = row["provider"]
    api_key = _decrypt(row["encrypted_key"])
    extra = row.get("extra_fields", {}) or {}

    result = await _test_provider(provider, api_key, extra)

    # Update validity
    supabase.table("api_keys").update({
        "is_valid": result.success,
        "last_tested_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", str(key_id)).execute()

    return result


async def _test_provider(
    provider: str, api_key: str, extra: dict
) -> ApiKeyTestResult:
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            if provider == "openai":
                return await _test_openai(client, api_key, extra)
            elif provider == "anthropic":
                return await _test_anthropic(client, api_key)
            elif provider == "groq":
                return await _test_groq(client, api_key)
            elif provider == "google_ai":
                return await _test_google_ai(client, api_key)
            elif provider == "ollama":
                return await _test_ollama(client, extra)
            elif provider == "custom_openai":
                return await _test_custom_openai(client, api_key, extra)
            elif provider == "tavily":
                return await _test_tavily(client, api_key)
            elif provider in ("alpha_vantage", "polygon"):
                return await _test_financial(client, provider, api_key)
            elif provider in ("database_pg", "database_mysql"):
                return ApiKeyTestResult(
                    success=True,
                    message="Database connection saved. Test from your workflow.",
                )
            else:
                return ApiKeyTestResult(success=False, message=f"Unknown provider: {provider}")
    except httpx.TimeoutException:
        return ApiKeyTestResult(success=False, message="Connection timed out")
    except Exception as e:
        logger.exception("Test connection failed for %s", provider)
        return ApiKeyTestResult(success=False, message=str(e))


async def _test_openai(client: httpx.AsyncClient, api_key: str, extra: dict) -> ApiKeyTestResult:
    headers = {"Authorization": f"Bearer {api_key}"}
    if extra.get("organization_id"):
        headers["OpenAI-Organization"] = extra["organization_id"]
    r = await client.get("https://api.openai.com/v1/models", headers=headers)
    if r.status_code == 200:
        models = [m["id"] for m in r.json().get("data", [])]
        return ApiKeyTestResult(success=True, message="Connected to OpenAI", models=models[:20])
    return ApiKeyTestResult(success=False, message=f"OpenAI returned {r.status_code}: {r.text[:200]}")


async def _test_anthropic(client: httpx.AsyncClient, api_key: str) -> ApiKeyTestResult:
    r = await client.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
        json={
            "model": "claude-haiku-4-5-20251001",
            "max_tokens": 1,
            "messages": [{"role": "user", "content": "hi"}],
        },
    )
    if r.status_code == 200:
        return ApiKeyTestResult(success=True, message="Connected to Anthropic")
    if r.status_code == 401:
        return ApiKeyTestResult(success=False, message="Invalid Anthropic API key")
    return ApiKeyTestResult(success=False, message=f"Anthropic returned {r.status_code}: {r.text[:200]}")


async def _test_groq(client: httpx.AsyncClient, api_key: str) -> ApiKeyTestResult:
    r = await client.get(
        "https://api.groq.com/openai/v1/models",
        headers={"Authorization": f"Bearer {api_key}"},
    )
    if r.status_code == 200:
        models = [m["id"] for m in r.json().get("data", [])]
        return ApiKeyTestResult(success=True, message="Connected to Groq", models=models[:20])
    return ApiKeyTestResult(success=False, message=f"Groq returned {r.status_code}: {r.text[:200]}")


async def _test_google_ai(client: httpx.AsyncClient, api_key: str) -> ApiKeyTestResult:
    r = await client.post(
        f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}",
        json={"contents": [{"parts": [{"text": "hi"}]}]},
    )
    if r.status_code == 200:
        return ApiKeyTestResult(success=True, message="Connected to Google AI")
    return ApiKeyTestResult(success=False, message=f"Google AI returned {r.status_code}: {r.text[:200]}")


async def _test_ollama(client: httpx.AsyncClient, extra: dict) -> ApiKeyTestResult:
    base_url = extra.get("base_url", "http://localhost:11434").rstrip("/")
    r = await client.get(f"{base_url}/api/tags")
    if r.status_code == 200:
        models = [m["name"] for m in r.json().get("models", [])]
        return ApiKeyTestResult(
            success=True,
            message=f"Connected to Ollama — {len(models)} model(s) available",
            models=models,
        )
    return ApiKeyTestResult(success=False, message=f"Ollama returned {r.status_code}")


async def _test_custom_openai(client: httpx.AsyncClient, api_key: str, extra: dict) -> ApiKeyTestResult:
    base_url = extra.get("base_url", "").rstrip("/")
    if not base_url:
        return ApiKeyTestResult(success=False, message="Base URL is required")
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    r = await client.get(f"{base_url}/v1/models", headers=headers)
    if r.status_code == 200:
        models = [m["id"] for m in r.json().get("data", [])]
        return ApiKeyTestResult(success=True, message="Connected to custom endpoint", models=models[:20])
    return ApiKeyTestResult(success=False, message=f"Returned {r.status_code}: {r.text[:200]}")


async def _test_tavily(client: httpx.AsyncClient, api_key: str) -> ApiKeyTestResult:
    r = await client.post(
        "https://api.tavily.com/search",
        json={"api_key": api_key, "query": "test", "max_results": 1},
    )
    if r.status_code == 200:
        return ApiKeyTestResult(success=True, message="Connected to Tavily")
    return ApiKeyTestResult(success=False, message=f"Tavily returned {r.status_code}: {r.text[:200]}")


async def _test_financial(client: httpx.AsyncClient, provider: str, api_key: str) -> ApiKeyTestResult:
    if provider == "alpha_vantage":
        r = await client.get(
            f"https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=IBM&interval=5min&apikey={api_key}"
        )
        if r.status_code == 200 and "Error" not in r.text:
            return ApiKeyTestResult(success=True, message="Connected to Alpha Vantage")
        return ApiKeyTestResult(success=False, message="Alpha Vantage key invalid or rate limited")
    elif provider == "polygon":
        r = await client.get(
            f"https://api.polygon.io/v2/aggs/ticker/AAPL/prev?apiKey={api_key}"
        )
        if r.status_code == 200:
            return ApiKeyTestResult(success=True, message="Connected to Polygon.io")
        return ApiKeyTestResult(success=False, message=f"Polygon returned {r.status_code}")
    return ApiKeyTestResult(success=False, message=f"Unknown financial provider: {provider}")
