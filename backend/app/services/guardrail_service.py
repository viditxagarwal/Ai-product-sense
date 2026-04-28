from uuid import UUID

from fastapi import HTTPException

from app.database import supabase
from app.models.guardrail import GuardrailCreate

PLATFORM_GUARDRAILS: list[dict] = [
    {
        "guardrail_name": "never_fabricate",
        "display_name": "Never Fabricate",
        "description": "Never invent data, statistics, quotes, or sources. If information is unavailable, say so explicitly.",
        "trigger_description": "Triggered when the model generates claims without grounding in provided sources or verified data.",
        "is_platform": True,
    },
    {
        "guardrail_name": "calculation_accuracy",
        "display_name": "Calculation Accuracy",
        "description": "All numerical calculations must be verifiable and accurate. Use tools for complex math.",
        "trigger_description": "Triggered when numerical outputs differ from tool-verified results or contain arithmetic errors.",
        "is_platform": True,
    },
    {
        "guardrail_name": "source_grounding",
        "display_name": "Source Grounding",
        "description": "All claims must be traceable to a specific source document, data point, or explicit reasoning chain.",
        "trigger_description": "Triggered when assertions lack citation or cannot be traced to provided context.",
        "is_platform": True,
    },
    {
        "guardrail_name": "reasoning_transparency",
        "display_name": "Reasoning Transparency",
        "description": "Show the reasoning process. Make assumptions explicit and distinguish facts from inferences.",
        "trigger_description": "Triggered when conclusions are presented without visible reasoning steps or assumption disclosure.",
        "is_platform": True,
    },
    {
        "guardrail_name": "comprehensiveness",
        "display_name": "Comprehensiveness",
        "description": "Address all aspects of the user's query. Do not silently omit relevant dimensions of analysis.",
        "trigger_description": "Triggered when the response skips key aspects of the query or omits material considerations.",
        "is_platform": True,
    },
    {
        "guardrail_name": "consistency",
        "display_name": "Consistency",
        "description": "Ensure internal consistency across the response. Numbers, conclusions, and recommendations must not contradict each other.",
        "trigger_description": "Triggered when different parts of the response contain contradictory statements or figures.",
        "is_platform": True,
    },
    {
        "guardrail_name": "recency",
        "display_name": "Recency",
        "description": "Prefer the most recent data available. Flag when data may be outdated and note the data date.",
        "trigger_description": "Triggered when analysis relies on potentially stale data without disclosure of the data date.",
        "is_platform": True,
    },
    {
        "guardrail_name": "determinism",
        "display_name": "Determinism",
        "description": "Given identical inputs and context, produce consistent outputs. Minimize non-deterministic variation.",
        "trigger_description": "Triggered when repeated identical queries produce materially different answers.",
        "is_platform": True,
    },
    {
        "guardrail_name": "regulatory_compliance",
        "display_name": "Regulatory Compliance",
        "description": "Include required disclaimers and comply with domain-specific regulations (financial, legal, medical, etc.).",
        "trigger_description": "Triggered when output lacks required regulatory disclaimers or violates domain compliance rules.",
        "is_platform": True,
    },
    {
        "guardrail_name": "user_privacy",
        "display_name": "User Privacy",
        "description": "Never expose, log, or repeat sensitive user data (PII, credentials, financial details) in outputs.",
        "trigger_description": "Triggered when output contains or echoes back sensitive personal or financial information.",
        "is_platform": True,
    },
    {
        "guardrail_name": "minimize_latency",
        "display_name": "Minimize Latency",
        "description": "Optimize for response speed. Avoid unnecessary tool calls, redundant retrievals, or excessive chain-of-thought.",
        "trigger_description": "Triggered when response time exceeds configured thresholds due to avoidable processing.",
        "is_platform": True,
    },
    {
        "guardrail_name": "minimize_cost",
        "display_name": "Minimize Cost",
        "description": "Optimize token usage and tool calls to stay within budget. Use lighter models for simple sub-tasks.",
        "trigger_description": "Triggered when token usage or tool call count approaches or exceeds configured cost limits.",
        "is_platform": True,
    },
]


def list_guardrails(user_id: UUID, page: int = 1, per_page: int = 20) -> dict:
    offset = (page - 1) * per_page
    count_resp = (
        supabase.table("guardrails")
        .select("*", count="exact")
        .eq("user_id", str(user_id))
        .execute()
    )
    total = count_resp.count or 0

    resp = (
        supabase.table("guardrails")
        .select("*")
        .eq("user_id", str(user_id))
        .order("is_platform", desc=True)
        .order("created_at")
        .range(offset, offset + per_page - 1)
        .execute()
    )
    return {"data": resp.data, "count": total, "page": page}


def get_guardrail(user_id: UUID, guardrail_id: UUID) -> dict:
    resp = (
        supabase.table("guardrails")
        .select("*")
        .eq("id", str(guardrail_id))
        .eq("user_id", str(user_id))
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Guardrail not found")
    return resp.data


def create_guardrail(user_id: UUID, data: GuardrailCreate) -> dict:
    payload = data.model_dump()
    payload["user_id"] = str(user_id)
    payload["is_platform"] = False  # User-created guardrails are never platform
    resp = supabase.table("guardrails").insert(payload).execute()
    return resp.data[0]


def seed_platform_guardrails(user_id: UUID) -> list[dict]:
    rows = []
    for guardrail in PLATFORM_GUARDRAILS:
        rows.append({**guardrail, "user_id": str(user_id)})
    resp = supabase.table("guardrails").insert(rows).execute()
    return resp.data
