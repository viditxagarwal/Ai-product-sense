"""Pricing service — computes LLM call costs from token counts.

Uses the model_pricing table (Section L.1) with an in-memory cache.
Falls back to hardcoded defaults if DB is unavailable.
"""

import logging
from dataclasses import dataclass
from typing import Optional

from app.database import supabase

logger = logging.getLogger("pricing")

# In-memory pricing cache (refreshed on first use and on demand)
_pricing_cache: dict[str, dict] = {}


# Hardcoded fallback prices ($/1M tokens) — May 2025
_FALLBACK_PRICING = {
    "claude-opus-4":     {"input": 15.00, "output": 75.00, "cache_read": 1.50, "cache_write": 18.75, "thinking": 75.00},
    "claude-sonnet-4":   {"input": 3.00,  "output": 15.00, "cache_read": 0.30, "cache_write": 3.75,  "thinking": 15.00},
    "claude-haiku-3.5":  {"input": 0.80,  "output": 4.00,  "cache_read": 0.08, "cache_write": 1.00,  "thinking": 0},
    "gpt-4o":            {"input": 2.50,  "output": 10.00, "cache_read": 1.25, "cache_write": 2.50,  "thinking": 0},
    "gpt-4o-mini":       {"input": 0.15,  "output": 0.60,  "cache_read": 0.075,"cache_write": 0.15,  "thinking": 0},
    "gpt-4.1":           {"input": 2.00,  "output": 8.00,  "cache_read": 0.50, "cache_write": 2.00,  "thinking": 0},
    "gpt-4.1-mini":      {"input": 0.40,  "output": 1.60,  "cache_read": 0.10, "cache_write": 0.40,  "thinking": 0},
    "o1":                {"input": 15.00, "output": 60.00, "cache_read": 0,    "cache_write": 0,     "thinking": 60.00},
    "o1-mini":           {"input": 1.10,  "output": 4.40,  "cache_read": 0,    "cache_write": 0,     "thinking": 4.40},
    "o3":                {"input": 10.00, "output": 40.00, "cache_read": 0,    "cache_write": 0,     "thinking": 40.00},
    "o3-mini":           {"input": 1.10,  "output": 4.40,  "cache_read": 0,    "cache_write": 0,     "thinking": 4.40},
    "o4-mini":           {"input": 1.10,  "output": 4.40,  "cache_read": 0,    "cache_write": 0,     "thinking": 4.40},
    "gemini-2.0-flash":  {"input": 0.10,  "output": 0.40,  "cache_read": 0,    "cache_write": 0,     "thinking": 0},
    "gemini-2.5-pro":    {"input": 1.25,  "output": 10.00, "cache_read": 0,    "cache_write": 0,     "thinking": 10.00},
}


@dataclass
class CostBreakdown:
    input_cost: float = 0.0
    output_cost: float = 0.0
    thinking_cost: float = 0.0
    cache_read_cost: float = 0.0
    cache_write_cost: float = 0.0
    total_cost: float = 0.0


def _load_pricing_cache():
    """Load pricing from DB into memory cache."""
    global _pricing_cache
    try:
        resp = supabase.table("model_pricing").select("*").eq("is_active", True).execute()
        if resp.data:
            for row in resp.data:
                key = row["model_id"]
                _pricing_cache[key] = {
                    "input": float(row.get("input_cost_per_m", 0)),
                    "output": float(row.get("output_cost_per_m", 0)),
                    "cache_read": float(row.get("cache_read_per_m", 0)),
                    "cache_write": float(row.get("cache_write_per_m", 0)),
                    "thinking": float(row.get("thinking_cost_per_m", 0)),
                }
            logger.info("Loaded %d model pricing entries from DB", len(_pricing_cache))
    except Exception as e:
        logger.warning("Failed to load pricing from DB, using fallback: %s", e)
        _pricing_cache = dict(_FALLBACK_PRICING)


def _get_pricing(model_id: str) -> dict:
    """Get pricing for a model, loading cache if needed."""
    if not _pricing_cache:
        _load_pricing_cache()

    # Try exact match
    if model_id in _pricing_cache:
        return _pricing_cache[model_id]

    # Try prefix match (e.g., "gpt-4o-2024-08-06" -> "gpt-4o")
    for key in _pricing_cache:
        if model_id.startswith(key):
            return _pricing_cache[key]

    # Try fallback
    if model_id in _FALLBACK_PRICING:
        return _FALLBACK_PRICING[model_id]

    for key in _FALLBACK_PRICING:
        if model_id.startswith(key):
            return _FALLBACK_PRICING[key]

    # Unknown model — return zeros
    logger.warning("No pricing found for model: %s", model_id)
    return {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "thinking": 0}


def compute_cost(
    model_id: str,
    input_tokens: int = 0,
    output_tokens: int = 0,
    thinking_tokens: int = 0,
    cache_read_tokens: int = 0,
    cache_write_tokens: int = 0,
) -> CostBreakdown:
    """Compute the USD cost of an LLM call from token counts.

    Prices are per 1M tokens, so we divide by 1_000_000.
    """
    pricing = _get_pricing(model_id)

    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    thinking_cost = (thinking_tokens / 1_000_000) * pricing.get("thinking", pricing["output"])
    cache_read_cost = (cache_read_tokens / 1_000_000) * pricing["cache_read"]
    cache_write_cost = (cache_write_tokens / 1_000_000) * pricing["cache_write"]

    total = input_cost + output_cost + thinking_cost + cache_read_cost + cache_write_cost

    return CostBreakdown(
        input_cost=round(input_cost, 8),
        output_cost=round(output_cost, 8),
        thinking_cost=round(thinking_cost, 8),
        cache_read_cost=round(cache_read_cost, 8),
        cache_write_cost=round(cache_write_cost, 8),
        total_cost=round(total, 8),
    )


def get_all_pricing() -> list[dict]:
    """Return all model pricing for the frontend."""
    if not _pricing_cache:
        _load_pricing_cache()
    return [
        {"model_id": k, **v}
        for k, v in (_pricing_cache or _FALLBACK_PRICING).items()
    ]


def refresh_pricing_cache():
    """Force reload pricing from DB."""
    global _pricing_cache
    _pricing_cache = {}
    _load_pricing_cache()
