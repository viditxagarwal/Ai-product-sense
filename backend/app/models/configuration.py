from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ConfigurationCreate(BaseModel):
    config_name: str
    config_description: str = ''
    config_version: int = 1
    created_from: Optional[UUID] = None
    is_baseline: bool = False
    tags: list[str] = []

    # References
    prompt_version_id: Optional[UUID] = None

    # 7.1 Model Settings
    primary_model: str = 'claude-sonnet-4'
    fallback_model: Optional[str] = 'gpt-4o-mini'
    per_node_model_override: bool = True
    model_selection_strategy: Literal['fixed', 'cost_optimized', 'quality_optimized', 'adaptive'] = 'fixed'
    temperature: float = 0.2
    max_output_tokens: int = 4096
    top_p: float = 0.9

    # 7.2 Memory & Context
    memory_type: Literal['buffer', 'buffer_window', 'summary', 'token_buffer', 'vector_store', 'combined'] = 'token_buffer'
    buffer_size_messages: int = 20
    buffer_size_tokens: int = 8192
    summary_model: Literal['same_as_primary', 'lighter_model'] = 'lighter_model'
    summary_trigger: Literal['every_N_messages', 'token_threshold', 'manual'] = 'token_threshold'
    cross_thread_memory: Literal['disabled', 'same_domain_only', 'user_profile_only', 'full_cross_thread'] = 'same_domain_only'
    context_source: Literal['system_prompt_only', 'file_context', 'rag', 'structured_extraction', 'combined'] = 'combined'
    file_context_strategy: Literal['full_file', 'relevant_sections', 'chunked_retrieval', 'metadata_only'] = 'relevant_sections'
    max_context_tokens: int = 16384
    context_priority_order: str = 'system_prompt → files → memory → rag'
    persistent_knowledge: Literal['disabled', 'knowledge_base_only', 'user_profile', 'both'] = 'knowledge_base_only'

    # 7.3 RAG Settings
    kb_enabled: bool = True
    chunk_strategy: Literal['fixed_size', 'semantic', 'recursive', 'structural', 'sentence', 'paragraph', 'page'] = 'recursive'
    chunk_size_tokens: int = 512
    chunk_overlap_tokens: int = 64
    embedding_model: str = 'text-embedding-3-large'
    retrieval_strategy: Literal['vector_similarity', 'keyword_bm25', 'hybrid_rrf', 'multi_query', 'contextual_compression', 'parent_document', 'self_query'] = 'hybrid_rrf'
    top_k_results: int = 5
    reranking: Literal['none', 'cncoder', 'llm_rerank', 'cohere_rerank'] = 'cross_encoder'
    rerank_top_n: int = 3
    kb_freshness_preference: Literal['prefer_recent', 'prefer_authoritative', 'no_preference'] = 'no_preference'

    # 7.4 Output & Streaming
    streaming_mode: Literal['token_by_token', 'chunk_by_section', 'structured_blocks', 'complete_then_render'] = 'chunk_by_section'
    explanation_depth: Literal['result_only', 'brief_rationale', 'full_reasoning_chain', 'reasoning_plus_sources'] = 'reasoning_plus_sources'
    confidence_display: Literal['none', 'color_coded_bands', 'explicit_percentage', 'natural_language_hedging', 'icon_indicators'] = 'color_coded_bands'
    output_format: Literal['markdown', 'structured_json', 'html', 'auto_detect'] = 'markdown'
    citation_format: Literal['none', 'inline_parenthetical', 'footnotes', 'end_references', 'linked_highlights'] = 'inline_parenthetical'
    max_output_length: int = 4000
    chain_of_thought_visibility: Literal['always_show', 'always_hide', 'auto', 'user_toggleable'] = 'auto'

    # 7.5 Routing & Control Flow
    routing_strategy: Literal['llm_based', 'rule_based', 'classifier_based', 'hybrid', 'semantic_router'] = 'hybrid'
    routing_model: Literal['same_as_primary', 'lighter_model', 'dedicated_classifier'] = 'lighter_model'
    routing_fallback: Literal['default_path', 'error_node', 'human_review', 'retry_with_primary'] = 'default_path'
    route_confidence_threshold: float = 0.7
    loop_max_count: int = 3
    loop_exit_condition: Literal['max_reached', 'quality_threshold', 'no_improvement', 'human_approval', 'timeout'] = 'quality_threshold'
    loop_exit_threshold: float = 0.85
    condition_evaluation_method: Literal['state_field_check', 'llm_evaluation', 'score_comparison', 'regex_match'] = 'state_field_check'

    # 7.6 Cost & Performance
    max_cost_per_run_usd: float = 5.00
    max_total_tokens: int = 250000
    max_latency_seconds: int = 300
    caching: Literal['none', 'exact_match', 'semantic_cache'] = 'exact_match'
    cache_ttl_hours: int = 24

    # 7.7 Tool Behavior
    tool_selection_strategy: Literal['llm_decides', 'always_available', 'whitelist_per_node'] = 'llm_decides'
    tool_call_timeout: int = 30
    tool_retry_on_failure: int = 1
    tool_result_handling: Literal['raw', 'summarized', 'structured', 'truncated'] = 'structured'
    max_tool_calls_per_node: int = 10
    parallel_tool_calls: bool = True

    # 7.8 Guardrail Ordering & Trigger
    guardrail_priority_order: list[str] = [
        'never_fabricate', 'calculation_accuracy', 'source_grounding',
        'reasoning_transparency', 'comprehensiveness', 'consistency',
        'recency', 'determinism', 'regulatory_compliance',
        'user_privacy', 'minimize_latency', 'minimize_cost',
    ]
    guardrail_trigger_action: Literal['graceful_fallback', 'explicit_warning', 'hard_block', 'silent_retry', 'escalate_to_human'] = 'graceful_fallback'
    max_guardrail_retries: int = 2
    hallucination_detection: Literal['none', 'self_check', 'cross_reference', 'citation_verification', 'all'] = 'citation_verification'
    numerical_validation: Literal['none', 'formula_check', 'range_check', 'cross_reference', 'full_audit'] = 'formula_check'
    source_grounding_level: Literal['none', 'require_citation', 'verify_citation', 'strict_attribution'] = 'verify_citation'
    contradictory_data_handling: Literal['flag_both_with_sources', 'use_most_recent', 'use_most_authoritative', 'halt_and_clarify'] = 'flag_both_with_sources'
    uncertainty_handling: Literal['present_with_confidence', 'show_range', 'escalate_to_human', 'omit_and_note', 'best_guess_with_caveat'] = 'show_range'
    confidence_threshold: float = 0.7

    # 7.9 Persona & Prompt Parameters
    risk_tolerance: Literal['very_conservative', 'conservative', 'moderate', 'aggressive'] = 'conservative'
    detail_level: Literal['concise', 'standard', 'detailed', 'exhaustive'] = 'standard'
    language_formality: Literal['formal', 'semi_formal', 'conversational'] = 'semi_formal'
    disclaimer_inclusion: Literal['always', 'when_uncertain', 'never'] = 'when_uncertain'
    few_shot_examples: Literal['none', 'domain_default', 'auto_select'] = 'domain_default'
    few_shot_count: int = 2
    output_template: Literal['standard_report', 'executive_summary', 'detailed_analysis', 'data_table', 'domain_default'] = 'domain_default'

    # 7.10 Missing Information Strategy
    missing_info_strategy: Literal['ask_user', 'search_external', 'use_defaults', 'estimate_with_reasoning', 'hybrid'] = 'hybrid'
    missing_info_autonomy: Literal['low', 'medium', 'high'] = 'medium'
    external_data_freshness: Literal['real_time', 'cached_24h', 'cached_7d', 'manual_refresh'] = 'cached_24h'
    assumption_source_priority: str = 'user_provided → external_api → model_estimate'


class ConfigurationResponse(ConfigurationCreate):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    created_at: datetime
