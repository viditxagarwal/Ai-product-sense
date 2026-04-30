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

    # ── Output format ───────────────────────────────────────
    output_format = config.get("output_format", "markdown")
    format_map = {
        "markdown": "Format your response in Markdown.",
        "structured_json": "Return your response as valid JSON.",
        "html": "Format your response as clean HTML.",
    }
    if output_format in format_map:
        injections.append(format_map[output_format])

    # ── Citation format ─────────────────────────────────────
    citation = config.get("citation_format", "none")
    citation_map = {
        "inline_parenthetical": "Cite sources inline using parenthetical references, e.g., (Source Name, 2024).",
        "footnotes": "Use numbered footnotes for citations. List all references at the end.",
        "end_references": "Collect all references and list them at the end of your response.",
        "linked_highlights": "Hyperlink key claims to their source URLs where possible.",
    }
    if citation in citation_map:
        injections.append(citation_map[citation])

    # ── Max output length ───────────────────────────────────
    max_length = config.get("max_output_length", 4000)
    if max_length and max_length < 4000:
        injections.append(f"Keep your response under approximately {max_length} characters.")

    # ── Missing info strategy ───────────────────────────────
    missing = config.get("missing_info_strategy", "hybrid")
    missing_map = {
        "ask_user": "If you are missing information needed to answer, ask the user for it before proceeding.",
        "search_external": "If data is missing, attempt to search external sources before answering.",
        "use_defaults": "If information is missing, use reasonable defaults and note your assumptions.",
        "estimate_with_reasoning": "If data is missing, estimate with explicit reasoning and flag the estimate.",
    }
    if missing in missing_map:
        injections.append(missing_map[missing])

    # ── Combine ──────────────────────────────────────────────
    if not injections:
        return ""

    body = "\n".join(f"- {line}" for line in injections)
    return f"\n\n## Response Guidelines\n{body}"
