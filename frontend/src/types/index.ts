// Paginated list response
export interface PaginatedResponse<T> {
  data: T[];
  count: number;
  page: number;
}

// ─── Domains ───────────────────────────────────────────────

export type DomainName =
  | "financial_valuation"
  | "coding"
  | "tax"
  | "design"
  | "custom";

export type MemoryIsolation = "strict" | "soft" | "none";

export interface DomainResponse {
  id: string;
  user_id: string;
  domain_name: DomainName;
  display_name: string;
  description: string;
  memory_isolation: MemoryIsolation;
  base_prompt: string;
  enterprise_guardrails_file_url: string | null;
  enterprise_guardrails_file_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface DomainCreate {
  domain_name: DomainName;
  display_name: string;
  description?: string;
  memory_isolation?: MemoryIsolation;
  base_prompt?: string;
}

export interface DomainUpdate {
  display_name?: string;
  description?: string;
  memory_isolation?: MemoryIsolation;
  base_prompt?: string;
  enterprise_guardrails_file_url?: string;
  enterprise_guardrails_file_name?: string;
}

// ─── Workflows ─────────────────────────────────────────────

export type ErrorHandlingStrategy =
  | "fail_fast"
  | "retry_node"
  | "skip_node"
  | "fallback_path";

export interface GraphData {
  nodes: Record<string, unknown>[];
  edges: Record<string, unknown>[];
}

export interface WorkflowResponse {
  id: string;
  domain_id: string;
  workflow_name: string;
  description: string;
  graph_data: GraphData;
  entry_point: string | null;
  exit_point: string | null;
  global_timeout_seconds: number;
  error_handling_strategy: ErrorHandlingStrategy;
  max_total_node_executions: number;
  template_source: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowCreate {
  domain_id: string;
  workflow_name?: string;
  description?: string;
  graph_data?: GraphData;
  error_handling_strategy?: ErrorHandlingStrategy;
}

export interface WorkflowUpdate {
  workflow_name?: string;
  description?: string;
  graph_data?: GraphData;
  entry_point?: string;
  exit_point?: string;
  global_timeout_seconds?: number;
  error_handling_strategy?: ErrorHandlingStrategy;
  max_total_node_executions?: number;
}

// ─── Tools ─────────────────────────────────────────────────

export interface ToolResponse {
  id: string;
  user_id: string;
  tool_name: string;
  display_name: string;
  description: string;
  category: string;
  is_builtin: boolean;
  is_enabled: boolean;
  default_config: Record<string, unknown>;
  config_schema: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ToolCreate {
  tool_name: string;
  display_name: string;
  description: string;
  category?: string;
  is_builtin?: boolean;
  is_enabled?: boolean;
  default_config?: Record<string, unknown>;
  config_schema?: Record<string, unknown>;
}

export interface ToolUpdate {
  display_name?: string;
  description?: string;
  category?: string;
  is_enabled?: boolean;
  default_config?: Record<string, unknown>;
  config_schema?: Record<string, unknown>;
}

// ─── Knowledge (Enterprise Documents) ──────────────────────

export type ProcessingStatus = "pending" | "processing" | "indexed" | "failed";

export interface EnterpriseDocumentResponse {
  id: string;
  domain_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size_bytes: number | null;
  collection: string;
  tags: string[];
  priority_order: number;
  processing_status: ProcessingStatus;
  chunk_count: number;
  created_at: string;
}

export interface EnterpriseDocumentCreate {
  domain_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size_bytes?: number;
  collection?: string;
  tags?: string[];
  priority_order?: number;
}

// ─── Prompts ───────────────────────────────────────────────

export interface PromptVersionResponse {
  id: string;
  user_id: string;
  domain_id: string | null;
  prompt_name: string;
  version_number: number;
  prompt_text: string;
  preset_source: string | null;
  tags: string[];
  created_at: string;
}

export interface PromptVersionCreate {
  prompt_name: string;
  domain_id?: string;
  version_number?: number;
  prompt_text?: string;
  preset_source?: string;
  tags?: string[];
}

// ─── Guardrails ────────────────────────────────────────────

export interface GuardrailResponse {
  id: string;
  user_id: string;
  guardrail_name: string;
  display_name: string;
  description: string;
  trigger_description: string;
  is_platform: boolean;
  created_at: string;
}

export interface GuardrailCreate {
  guardrail_name: string;
  display_name: string;
  description: string;
  trigger_description?: string;
}

// ─── Configurations ────────────────────────────────────────

export interface ConfigurationResponse {
  id: string;
  user_id: string;
  config_name: string;
  config_description: string;
  config_version: number;
  created_from: string | null;
  is_baseline: boolean;
  tags: string[];
  prompt_version_id: string | null;

  // Model Settings
  primary_model: string;
  fallback_model: string | null;
  per_node_model_override: boolean;
  model_selection_strategy: string;
  temperature: number;
  max_output_tokens: number;
  top_p: number;

  // Memory & Context
  memory_type: string;
  buffer_size_messages: number;
  buffer_size_tokens: number;
  summary_model: string;
  summary_trigger: string;
  cross_thread_memory: string;
  context_source: string;
  file_context_strategy: string;
  max_context_tokens: number;
  context_priority_order: string;
  persistent_knowledge: string;

  // RAG Settings
  kb_enabled: boolean;
  chunk_strategy: string;
  chunk_size_tokens: number;
  chunk_overlap_tokens: number;
  embedding_model: string;
  retrieval_strategy: string;
  top_k_results: number;
  reranking: string;
  rerank_top_n: number;
  kb_freshness_preference: string;

  // Output & Streaming
  streaming_mode: string;
  explanation_depth: string;
  confidence_display: string;
  output_format: string;
  citation_format: string;
  max_output_length: number;
  chain_of_thought_visibility: string;

  // Routing & Control Flow
  routing_strategy: string;
  routing_model: string;
  routing_fallback: string;
  route_confidence_threshold: number;
  loop_max_count: number;
  loop_exit_condition: string;
  loop_exit_threshold: number;
  condition_evaluation_method: string;

  // Cost & Performance
  max_cost_per_run_usd: number;
  max_total_tokens: number;
  max_latency_seconds: number;
  caching: string;
  cache_ttl_hours: number;

  // Tool Behavior
  tool_selection_strategy: string;
  tool_call_timeout: number;
  tool_retry_on_failure: number;
  tool_result_handling: string;
  max_tool_calls_per_node: number;
  parallel_tool_calls: boolean;

  // Guardrail Ordering & Trigger
  guardrail_priority_order: string[];
  guardrail_trigger_action: string;
  max_guardrail_retries: number;
  hallucination_detection: string;
  numerical_validation: string;
  source_grounding_level: string;
  contradictory_data_handling: string;
  uncertainty_handling: string;
  confidence_threshold: number;

  // Persona & Prompt Parameters
  risk_tolerance: string;
  detail_level: string;
  language_formality: string;
  disclaimer_inclusion: string;
  few_shot_examples: string;
  few_shot_count: number;
  output_template: string;

  // Missing Information Strategy
  missing_info_strategy: string;
  missing_info_autonomy: string;
  external_data_freshness: string;
  assumption_source_priority: string;

  created_at: string;
}

export interface ConfigurationCreate {
  config_name: string;
  config_description?: string;
  tags?: string[];
  prompt_version_id?: string;
  // All other fields are optional — server provides defaults
  [key: string]: unknown;
}
