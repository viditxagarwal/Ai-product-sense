/** Default values for every configuration field — mirrors backend Pydantic defaults */
export const CONFIG_DEFAULTS: Record<string, unknown> = {
  // Properties
  config_name: "",
  config_description: "",
  tags: [],
  prompt_version_id: null,
  is_baseline: false,

  // Model Settings
  primary_model: "claude-sonnet-4",
  fallback_model: "gpt-4o-mini",
  per_node_model_override: true,
  model_selection_strategy: "fixed",
  temperature: 0.2,
  max_output_tokens: 4096,
  top_p: 0.9,

  // Memory & Context
  memory_type: "token_buffer",
  buffer_size_messages: 20,
  buffer_size_tokens: 8192,
  summary_model: "lighter_model",
  summary_trigger: "token_threshold",
  cross_thread_memory: "same_domain_only",
  context_source: "combined",
  file_context_strategy: "relevant_sections",
  max_context_tokens: 16384,
  context_priority_order: "system_prompt → files → memory → rag",
  persistent_knowledge: "knowledge_base_only",

  // RAG Settings
  kb_enabled: true,
  chunk_strategy: "recursive",
  chunk_size_tokens: 512,
  chunk_overlap_tokens: 64,
  embedding_model: "text-embedding-3-large",
  retrieval_strategy: "hybrid_rrf",
  top_k_results: 5,
  reranking: "cross_encoder",
  rerank_top_n: 3,
  kb_freshness_preference: "no_preference",

  // Output & Streaming
  streaming_mode: "chunk_by_section",
  explanation_depth: "reasoning_plus_sources",
  confidence_display: "color_coded_bands",
  output_format: "markdown",
  citation_format: "inline_parenthetical",
  max_output_length: 4000,
  chain_of_thought_visibility: "auto",

  // Routing & Control Flow
  routing_strategy: "hybrid",
  routing_model: "lighter_model",
  routing_fallback: "default_path",
  route_confidence_threshold: 0.7,
  loop_max_count: 3,
  loop_exit_condition: "quality_threshold",
  loop_exit_threshold: 0.85,
  condition_evaluation_method: "state_field_check",

  // Cost & Performance
  max_cost_per_run_usd: 5.0,
  max_total_tokens: 250000,
  max_latency_seconds: 300,
  caching: "exact_match",
  cache_ttl_hours: 24,

  // Tool Behavior
  tool_selection_strategy: "llm_decides",
  tool_call_timeout: 30,
  tool_retry_on_failure: 1,
  tool_result_handling: "structured",
  max_tool_calls_per_node: 10,
  parallel_tool_calls: true,

  // Guardrail Ordering & Trigger
  guardrail_priority_order: [
    "never_fabricate",
    "calculation_accuracy",
    "source_grounding",
    "reasoning_transparency",
    "comprehensiveness",
    "consistency",
    "recency",
    "determinism",
    "regulatory_compliance",
    "user_privacy",
    "minimize_latency",
    "minimize_cost",
  ],
  guardrail_trigger_action: "graceful_fallback",
  max_guardrail_retries: 2,
  hallucination_detection: "citation_verification",
  numerical_validation: "formula_check",
  source_grounding_level: "verify_citation",
  contradictory_data_handling: "flag_both_with_sources",
  uncertainty_handling: "show_range",
  confidence_threshold: 0.7,

  // Persona & Prompt Parameters
  risk_tolerance: "conservative",
  detail_level: "standard",
  language_formality: "semi_formal",
  disclaimer_inclusion: "when_uncertain",
  few_shot_examples: "domain_default",
  few_shot_count: 2,
  output_template: "domain_default",

  // Missing Information Strategy
  missing_info_strategy: "hybrid",
  missing_info_autonomy: "medium",
  external_data_freshness: "cached_24h",
  assumption_source_priority: "user_provided → external_api → model_estimate",
};

/** Model options for dropdowns */
export const MODEL_OPTIONS = [
  { value: "claude-sonnet-4", label: "Claude Sonnet 4" },
  { value: "claude-opus-4", label: "Claude Opus 4" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
];

/** Guardrail display names for the reorder list */
export const GUARDRAIL_LABELS: Record<string, string> = {
  never_fabricate: "Never Fabricate",
  calculation_accuracy: "Calculation Accuracy",
  source_grounding: "Source Grounding",
  reasoning_transparency: "Reasoning Transparency",
  comprehensiveness: "Comprehensiveness",
  consistency: "Consistency",
  recency: "Recency",
  determinism: "Determinism",
  regulatory_compliance: "Regulatory Compliance",
  user_privacy: "User Privacy",
  minimize_latency: "Minimize Latency",
  minimize_cost: "Minimize Cost",
  enterprise_guardrails: "Enterprise Guardrails",
};
