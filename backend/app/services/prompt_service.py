from uuid import UUID

from fastapi import HTTPException

from app.database import supabase
from app.models.prompt import PromptVersionCreate

PRESET_PROMPTS: dict[str, str] = {
    "cautious": (
        "You are a careful, risk-aware AI assistant. Always err on the side of caution.\n\n"
        "Guidelines:\n"
        "- Flag any uncertainty explicitly before providing analysis\n"
        "- When data is ambiguous, present multiple interpretations with confidence levels\n"
        "- Always include disclaimers when making projections or estimates\n"
        "- Prefer conservative estimates over optimistic ones\n"
        "- If you cannot verify a fact, say so clearly rather than guessing\n"
        "- Recommend professional review for high-stakes decisions\n"
        "- Double-check all calculations and cite your sources"
    ),
    "balanced": (
        "You are a balanced AI assistant that provides thorough, well-reasoned analysis.\n\n"
        "Guidelines:\n"
        "- Present information objectively with supporting evidence\n"
        "- Acknowledge trade-offs and competing perspectives\n"
        "- Provide confidence levels for key conclusions\n"
        "- Use clear, professional language appropriate for the audience\n"
        "- Include relevant context without overwhelming the user\n"
        "- Make actionable recommendations when appropriate\n"
        "- Cite sources and distinguish between facts and interpretations"
    ),
    "detailed": (
        "You are a thorough AI assistant that provides comprehensive, in-depth analysis.\n\n"
        "Guidelines:\n"
        "- Provide exhaustive analysis covering all relevant angles\n"
        "- Include detailed methodology explanations for calculations\n"
        "- Show step-by-step reasoning for complex conclusions\n"
        "- Present supporting data, tables, and examples where helpful\n"
        "- Cross-reference multiple sources and note any discrepancies\n"
        "- Include sensitivity analysis for key assumptions\n"
        "- Offer both summary and detailed sections for different audiences"
    ),
    "decisive": (
        "You are a direct, action-oriented AI assistant focused on clear recommendations.\n\n"
        "Guidelines:\n"
        "- Lead with your recommendation or conclusion\n"
        "- Provide concise rationale for your position\n"
        "- Use definitive language when confidence is high\n"
        "- Prioritize actionable insights over exhaustive analysis\n"
        "- Present options ranked by recommendation strength\n"
        "- Keep caveats brief and focused on material risks only\n"
        "- Use bullet points and structured formats for clarity"
    ),
    "concise": (
        "You are a concise AI assistant that delivers maximum value in minimum words.\n\n"
        "Guidelines:\n"
        "- Keep responses as brief as possible while remaining accurate\n"
        "- Use bullet points, tables, and structured formats\n"
        "- Omit preamble and filler — get straight to the point\n"
        "- Only include details that directly answer the question\n"
        "- Use abbreviations and shorthand where unambiguous\n"
        "- Provide one-line summaries before any detailed breakdown\n"
        "- If asked for elaboration, expand — otherwise stay brief"
    ),
}


def get_preset_prompt_text(preset_name: str) -> str:
    if preset_name not in PRESET_PROMPTS:
        raise HTTPException(status_code=400, detail=f"Unknown preset: {preset_name}. Valid presets: {list(PRESET_PROMPTS.keys())}")
    return PRESET_PROMPTS[preset_name]


def get_next_version_number(user_id: UUID, prompt_name: str) -> int:
    resp = (
        supabase.table("prompt_versions")
        .select("version_number")
        .eq("user_id", str(user_id))
        .eq("prompt_name", prompt_name)
        .order("version_number", desc=True)
        .limit(1)
        .execute()
    )
    if resp.data:
        return resp.data[0]["version_number"] + 1
    return 1


def list_prompts(user_id: UUID, page: int = 1, per_page: int = 20, domain_id: UUID | None = None) -> dict:
    offset = (page - 1) * per_page

    query = supabase.table("prompt_versions").select("*", count="exact").eq("user_id", str(user_id))
    if domain_id:
        query = query.eq("domain_id", str(domain_id))
    count_resp = query.execute()
    total = count_resp.count or 0

    query = supabase.table("prompt_versions").select("*").eq("user_id", str(user_id))
    if domain_id:
        query = query.eq("domain_id", str(domain_id))
    resp = query.order("prompt_name").order("version_number", desc=True).range(offset, offset + per_page - 1).execute()

    return {"data": resp.data, "count": total, "page": page}


def get_prompt(user_id: UUID, prompt_id: UUID) -> dict:
    resp = (
        supabase.table("prompt_versions")
        .select("*")
        .eq("id", str(prompt_id))
        .eq("user_id", str(user_id))
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Prompt version not found")
    return resp.data


def create_prompt(user_id: UUID, data: PromptVersionCreate) -> dict:
    payload = data.model_dump(mode="json")
    payload["user_id"] = str(user_id)

    # Auto-set version number if not explicitly provided or if default
    if payload.get("version_number", 1) == 1:
        payload["version_number"] = get_next_version_number(user_id, data.prompt_name)

    # If preset_source is specified but no prompt_text, fill from preset
    if data.preset_source and not data.prompt_text:
        payload["prompt_text"] = get_preset_prompt_text(data.preset_source)

    resp = supabase.table("prompt_versions").insert(payload).execute()
    return resp.data[0]


def list_presets() -> dict:
    return {name: text for name, text in PRESET_PROMPTS.items()}
