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

// Component types on canvas
export type WorkflowComponentType = 'node' | 'gate' | 'split' | 'start' | 'end';

// Edge types
export type WorkflowEdgeType = 'flow' | 'conditional' | 'loop';

// Condition evaluation methods
export type ConditionMethod = 'rule_based' | 'llm_evaluation' | 'score_comparison' | 'regex_match' | 'always';

// The universal Node's data
export interface WorkflowNodeData {
  label: string;
  componentType: WorkflowComponentType;
  /** @deprecated Use componentType instead. Kept for backward compat. */
  nodeType?: string;

  // === Node-specific (componentType === 'node') ===
  llmEnabled?: boolean;
  systemPrompt?: string;
  promptVersionId?: string;
  modelOverride?: string;
  temperature?: number;
  maxOutputTokens?: number;
  boundTools?: string[];
  inputContext?: 'user_message' | 'previous_step' | 'full_history' | 'custom';
  customContextTemplate?: string;
  selectedToolId?: string;
  toolConfig?: Record<string, unknown>;
  inputMapping?: string;

  // === Gate-specific (componentType === 'gate') ===
  reviewDisplay?: string[];
  reviewInstructions?: string;
  displayFormat?: 'full_text' | 'summary_detail' | 'side_by_side';
  availableActions?: {
    approve: boolean;
    rejectWithReason: boolean;
    editAndApprove: boolean;
    sendBackForRevision: boolean;
    addCommentAndContinue: boolean;
  };
  onReject?: 'stop' | 'route_to_fallback' | 'retry_previous';
  waitDuration?: string;
  onTimeout?: 'auto_approve' | 'auto_reject' | 'escalate' | 'stop';
  escalateTo?: string;
  notifyVia?: string[];
  notificationTemplate?: string;

  // === Split-specific (componentType === 'split') ===
  branchCount?: number;
  fanOutMethod?: 'same_input' | 'split_input' | 'custom_per_branch';
  branchPrompts?: string[];
  mergeMethod?: 'concatenate' | 'summarize' | 'best_of_n' | 'vote' | 'custom';
  mergePrompt?: string;
  mergeModel?: string;
  waitStrategy?: 'wait_all' | 'first_n' | 'timeout_best';
  branchTimeout?: number;
  maxConcurrent?: number;
  onBranchFailure?: 'continue' | 'retry' | 'stop_all';

  // === Error handling (all node types) ===
  timeoutSeconds?: number;
  onFailure?: 'retry_once' | 'skip_warning' | 'stop' | 'fallback';
  fallbackValue?: string;

  // === Legacy fields (backward compat) ===
  purpose?: string;
  systemPromptHint?: string;
  onMissingData?: string;
  onToolFailure?: string;
  onLowConfidence?: string;
  guardrailOverride?: string;
  conditionType?: string;
  conditionPrompt?: string;
  pathMappings?: string;
  maxBranches?: number;
  displayContent?: string;
  humanOptions?: string;
  timeoutBehavior?: string;
  timeoutMinutes?: number;
  retrievalSource?: string;
  topK?: number;
  rerankingEnabled?: boolean;
  knowledgeLayers?: string;
  [key: string]: unknown;
}

// Edge data stored in graph_data
export interface WorkflowEdgeData {
  [key: string]: unknown; // index signature for React Flow compat
  edgeType: WorkflowEdgeType;
  label?: string;

  // === Conditional edge ===
  conditionMethod?: ConditionMethod;
  ruleField?: string;
  ruleOperator?: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
  ruleValue?: string;
  conditionPrompt?: string;
  evaluatorModel?: string;
  confidenceThreshold?: number;
  scoreField?: string;
  scoreOperator?: '>' | '>=' | '<' | '<=' | '==';
  scoreThreshold?: number;
  regexPattern?: string;
  regexMatchField?: 'full_output' | 'specific_field';

  // === Loop edge ===
  maxIterations?: number;
  exitThreshold?: number;
  onMaxReached?: 'use_best' | 'use_last' | 'stop_error' | 'route_fallback';
}

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
  template_source?: string;
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

// ─── Phase 2: Threads ─────────────────────────────────────

export interface Thread {
  id: string;
  domain_id: string;
  workflow_id: string;
  configuration_id: string;
  user_id: string;
  title: string;
  instructions: string;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ThreadCreate {
  domain_id: string;
  workflow_id: string;
  configuration_id: string;
  title?: string;
  instructions?: string;
}

export interface ThreadMessage {
  id: string;
  thread_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  message_type: "text" | "execution_trace" | "file_attachment";
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ThreadMessageCreate {
  thread_id: string;
  role: "user" | "assistant" | "system";
  content?: string;
  message_type?: "text" | "execution_trace" | "file_attachment";
  metadata?: Record<string, unknown>;
}

// ─── Phase 2: Execution ───────────────────────────────────

export interface ExecutionRun {
  id: string;
  thread_id: string;
  trigger_message_id: string | null;
  status: "running" | "completed" | "failed" | "cancelled";
  total_duration_ms: number | null;
  total_tokens: number;
  total_cost_usd: number;
  step_count: number;
  created_at: string;
  completed_at: string | null;
}

export type FileOperationType = "creation" | "targeted_edit" | "append" | "bulk_rewrite" | "none";

export interface ExecutionStep {
  id: string;
  run_id: string;
  step_number: number;
  node_type: string;
  node_name: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  duration_ms: number | null;
  tokens_used: number;
  cost_usd: number;
  tool_name: string | null;
  tool_config: Record<string, unknown> | null;
  input_payload: Record<string, unknown> | null;
  output_payload: Record<string, unknown> | null;
  routing_decision: Record<string, unknown> | null;
  guardrails_fired: unknown[] | null;
  file_operation_type: FileOperationType;
  confidence_score: number | null;
  created_at: string;
}

// ─── Phase 2: Files ───────────────────────────────────────

export interface ThreadFile {
  id: string;
  thread_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  file_size_bytes: number | null;
  source: "user_upload" | "ai_generated";
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface FileVersion {
  id: string;
  file_id: string;
  version_number: number;
  file_url: string;
  operation_type: "creation" | "targeted_edit" | "append" | "bulk_rewrite";
  change_summary: Record<string, unknown> | null;
  created_by: "user" | "ai";
  trigger_step_id: string | null;
  created_at: string;
}

export interface FileChange {
  id: string;
  file_version_id: string;
  change_type: "cell_modify" | "line_modify";
  location: string;
  old_value: string;
  new_value: string;
  reason: string | null;
  downstream_impact: Record<string, unknown> | null;
  status: "pending" | "accepted" | "rejected" | "reverted";
  resolved_at: string | null;
}

// ─── Phase 2: Annotations ─────────────────────────────────

export interface PMAnnotation {
  id: string;
  step_id: string;
  user_id: string;
  annotation_text: string;
  created_at: string;
}
