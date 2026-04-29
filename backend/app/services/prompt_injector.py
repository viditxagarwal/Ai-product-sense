"""Prompt injector — builds config-driven prompt injections.

Reads configuration fields and generates additional system prompt text
that shapes the LLM's response style, depth, and behavior.
"""


def build_config_injections(config: dict) -> str:
    """Return extra system prompt text based on config fields.

    Args:
        config: Configuration dict (from DB row or Pydantic model).

    Returns:
        A string block to append to the system prompt, or empty string.
    """
    injections: list[str] = []

    # ── Explanation depth ────────────────────────────────────
    depth = config.get("explanation_depth", "reasoning_plus_sources")
    depth_map = {
        "result_only": "Provide only the final answer. No reasoning, no explanations, no preamble.",
        "brief_rationale": "Provide the answer followed by a brief 1-2 sentence rationale.",
        "full_reasoning_chain": "Show your complete reasoning chain step by step, then provide the final answer.",
        "reasoning_plus_sources": "Show your reasoning, cite sources for each claim, then provide the final answer with references.",
    }
    if depth in depth_map:
        injections.append(depth_map[depth])

    # ── Confidence display ───────────────────────────────────
    confidence = config.get("confidence_display", "color_coded_bands")
    confidence_map = {
        "explicit_percentage": "After each major claim or conclusion, include a confidence score in parentheses, e.g., (85% confidence).",
        "natural_language_hedging": "Use natural language to express certainty levels. For high confidence use phrases like 'I'm confident that...'. For medium use 'It appears that...'. For low use 'I'm uncertain, but...'.",
        "icon_indicators": "After each claim, add a confidence indicator: ✓ for high confidence, ~ for medium confidence, ? for low confidence.",
    }
    if confidence in confidence_map:
        injections.append(confidence_map[confidence])

    # ── Language formality ───────────────────────────────────
    formality = config.get("language_formality", "semi_formal")
    formality_map = {
        "formal": "Use formal, professional language throughout.",
        "conversational": "Use a conversational, friendly tone.",
    }
    if formality in formality_map:
        injections.append(formality_map[formality])

    # ── Detail level ─────────────────────────────────────────
    detail = config.get("detail_level", "standard")
    detail_map = {
        "concise": "Be extremely concise. Minimize words.",
        "detailed": "Provide thorough, detailed explanations.",
        "exhaustive": "Be exhaustive. Cover every aspect, edge case, and nuance.",
    }
    if detail in detail_map:
        injections.append(detail_map[detail])

    # ── Risk tolerance ───────────────────────────────────────
    risk = config.get("risk_tolerance", "moderate")
    risk_map = {
        "very_conservative": "Be extremely cautious. Flag all uncertainties. Avoid speculation.",
        "conservative": "Be cautious with claims. Clearly distinguish facts from estimates.",
        "aggressive": "Be bold in your analysis. Take strong positions where data supports them.",
    }
    if risk in risk_map:
        injections.append(risk_map[risk])

    # ── Disclaimer inclusion ─────────────────────────────────
    disclaimer = config.get("disclaimer_inclusion", "when_uncertain")
    disclaimer_map = {
        "always": "Include appropriate disclaimers with every response.",
        "when_uncertain": "Include disclaimers when you are uncertain about claims.",
    }
    if disclaimer in disclaimer_map:
        injections.append(disclaimer_map[disclaimer])

    # ── Combine ──────────────────────────────────────────────
    if not injections:
        return ""

    body = "\n".join(f"- {line}" for line in injections)
    return f"\n\n## Response Guidelines\n{body}"
