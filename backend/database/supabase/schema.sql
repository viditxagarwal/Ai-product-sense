-- AI Product Studio Schema
-- Run this in Supabase SQL Editor

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- DOMAINS
-- ============================================================
CREATE TABLE domains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain_name TEXT NOT NULL CHECK (domain_name IN ('financial_valuation', 'coding', 'tax', 'design', 'custom')),
    display_name TEXT NOT NULL,
    description TEXT DEFAULT '',
    memory_isolation TEXT NOT NULL DEFAULT 'strict' CHECK (memory_isolation IN ('strict', 'soft', 'none')),
    base_prompt TEXT DEFAULT '',
    enterprise_guardrails_file_url TEXT,
    enterprise_guardrails_file_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ENTERPRISE DOCUMENTS (Layer 2 Knowledge)
-- ============================================================
CREATE TABLE enterprise_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size_bytes BIGINT,
    collection TEXT DEFAULT 'default',
    tags TEXT[] DEFAULT '{}',
    priority_order INTEGER DEFAULT 0,
    processing_status TEXT NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'indexed', 'failed')),
    chunk_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- WORKFLOWS
-- ============================================================
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    workflow_name TEXT NOT NULL DEFAULT 'Untitled Workflow',
    description TEXT DEFAULT '',
    -- The full React Flow graph stored as JSON
    graph_data JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
    entry_point TEXT,
    exit_point TEXT,
    global_timeout_seconds INTEGER NOT NULL DEFAULT 300,
    error_handling_strategy TEXT NOT NULL DEFAULT 'retry_node' CHECK (error_handling_strategy IN ('fail_fast', 'retry_node', 'skip_node', 'fallback_path')),
    max_total_node_executions INTEGER NOT NULL DEFAULT 50,
    template_source TEXT,  -- which template it was created from, if any
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TOOLS (Global Registry)
-- ============================================================
CREATE TABLE tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tool_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'general',
    is_builtin BOOLEAN NOT NULL DEFAULT TRUE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    default_config JSONB NOT NULL DEFAULT '{}',
    -- tool-specific config schema (what fields exist for this tool)
    config_schema JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, tool_name)
);

-- ============================================================
-- PROMPT VERSIONS
-- ============================================================
CREATE TABLE prompt_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain_id UUID REFERENCES domains(id) ON DELETE SET NULL,
    prompt_name TEXT NOT NULL,
    version_number INTEGER NOT NULL DEFAULT 1,
    prompt_text TEXT NOT NULL DEFAULT '',
    preset_source TEXT, -- 'cautious', 'balanced', 'detailed', 'decisive', 'concise', or NULL if custom
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, prompt_name, version_number)
);

-- ============================================================
-- GUARDRAIL DEFINITIONS
-- ============================================================
CREATE TABLE guardrails (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    guardrail_name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL,
    trigger_description TEXT NOT NULL DEFAULT '',
    is_platform BOOLEAN NOT NULL DEFAULT TRUE,
    -- platform guardrails are read-only; enterprise guardrails are per-user
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CONFIGURATIONS (IMMUTABLE after creation)
-- ============================================================
CREATE TABLE configurations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    config_name TEXT NOT NULL,
    config_description TEXT DEFAULT '',
    config_version INTEGER NOT NULL DEFAULT 1,
    created_from UUID REFERENCES configurations(id),  -- lineage tracking
    is_baseline BOOLEAN NOT NULL DEFAULT FALSE,
    tags TEXT[] DEFAULT '{}',

    -- References
    prompt_version_id UUID REFERENCES prompt_versions(id),

    -- 7.1 Model Settings
    primary_model TEXT NOT NULL DEFAULT 'claude-sonnet-4',
    fallback_model TEXT DEFAULT 'gpt-4o-mini',
    per_node_model_override BOOLEAN NOT NULL DEFAULT TRUE,
    model_selection_strategy TEXT NOT NULL DEFAULT 'fixed' CHECK (model_selection_strategy IN ('fixed', 'cost_optimized', 'quality_optimized', 'adaptive')),
    temperature NUMERIC(3,2) NOT NULL DEFAULT 0.2,
    max_output_tokens INTEGER NOT NULL DEFAULT 4096,
    top_p NUMERIC(3,2) NOT NULL DEFAULT 0.9,

    -- 7.2 Memory & Context
    memory_type TEXT NOT NULL DEFAULT 'token_buffer' CHECK (memory_type IN ('buffer', 'buffer_window', 'summary', 'token_buffer', 'vector_store', 'combined')),
    buffer_size_messages INTEGER NOT NULL DEFAULT 20,
    buffer_size_tokens INTEGER NOT NULL DEFAULT 8192,
    summary_model TEXT NOT NULL DEFAULT 'lighter_model' CHECK (summary_model IN ('same_as_primary', 'lighter_model')),
    summary_trigger TEXT NOT NULL DEFAULT 'token_threshold' CHECK (summary_trigger IN ('every_N_messages', 'token_threshold', 'manual')),
    cross_thread_memory TEXT NOT NULL DEFAULT 'same_domain_only' CHECK (cross_thread_memory IN ('disabled', 'same_domain_only', 'user_profile_only', 'full_cross_thread')),
    context_source TEXT NOT NULL DEFAULT 'combined' CHECK (context_source IN ('system_prompt_only', 'file_context', 'rag', 'structured_extraction', 'combined')),
    file_context_strategy TEXT NOT NULL DEFAULT 'relevant_sections' CHECK (file_context_strategy IN ('full_file', 'relevant_sections', 'chunked_retrieval', 'metadata_only')),
    max_context_tokens INTEGER NOT NULL DEFAULT 16384,
    context_priority_order TEXT NOT NULL DEFAULT 'system_prompt → files → memory → rag',
    persistent_knowledge TEXT NOT NULL DEFAULT 'knowledge_base_only' CHECK (persistent_knowledge IN ('disabled', 'knowledge_base_only', 'user_profile', 'both')),

    -- 7.3 RAG Settings
    kb_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    chunk_strategy TEXT NOT NULL DEFAULT 'recursive' CHECK (chunk_strategy IN ('fixed_size', 'semantic', 'recursive', 'structural', 'sentence', 'paragraph', 'page')),
    chunk_size_tokens INTEGER NOT NULL DEFAULT 512,
    chunk_overlap_tokens INTEGER NOT NULL DEFAULT 64,
    embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-large',
    retrieval_strategy TEXT NOT NULL DEFAULT 'hybrid_rrf' CHECK (retrieval_strategy IN ('vector_similarity', 'keyword_bm25', 'hybrid_rrf', 'multi_query', 'contextual_compression', 'parent_document', 'self_query')),
    top_k_results INTEGER NOT NULL DEFAULT 5,
    reranking TEXT NOT NULL DEFAULT 'cross_encoder' CHECK (reranking IN ('none', 'cncoder', 'llm_rerank', 'cohere_rerank')),
    rerank_top_n INTEGER NOT NULL DEFAULT 3,
    kb_freshness_preference TEXT NOT NULL DEFAULT 'no_preference' CHECK (kb_freshness_preference IN ('prefer_recent', 'prefer_authoritative', 'no_preference')),

    -- 7.4 Output & Streaming
    streaming_mode TEXT NOT NULL DEFAULT 'chunk_by_section' CHECK (streaming_mode IN ('token_by_token', 'chunk_by_section', 'structured_blocks', 'complete_then_render')),
    explanation_depth TEXT NOT NULL DEFAULT 'reasoning_plus_sources' CHECK (explanation_depth IN ('result_only', 'brief_rationale', 'full_reasoning_chain', 'reasoning_plus_sources')),
    confidence_display TEXT NOT NULL DEFAULT 'color_coded_bands' CHECK (confidence_display IN ('none', 'color_coded_bands', 'explicit_percentage', 'natural_language_hedging', 'icon_indicators')),
    output_format TEXT NOT NULL DEFAULT 'markdown' CHECK (output_format IN ('markdown', 'structured_json', 'html', 'auto_detect')),
    citation_format TEXT NOT NULL DEFAULT 'inline_parenthetical' CHECK (citation_format IN ('none', 'inline_parenthetical', 'footnotes', 'end_references', 'linked_highlights')),
    max_output_length INTEGER NOT NULL DEFAULT 4000,
    chain_of_thought_visibility TEXT NOT NULL DEFAULT 'auto' CHECK (chain_of_thought_visibility IN ('always_show', 'always_hide', 'auto', 'user_toggleable')),

    -- 7.5 Routing & Control Flow
    routing_strategy TEXT NOT NULL DEFAULT 'hybrid' CHECK (routing_strategy IN ('llm_based', 'rule_based', 'classifier_based', 'hybrid', 'semantic_router')),
    routing_model TEXT NOT NULL DEFAULT 'lighter_model' CHECK (routing_model IN ('same_as_primary', 'lighter_model', 'dedicated_classifier')),
    routing_fallback TEXT NOT NULL DEFAULT 'default_path' CHECK (routing_fallback IN ('default_path', 'error_node', 'human_review', 'retry_with_primary')),
    route_confidence_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.7,
    loop_max_count INTEGER NOT NULL DEFAULT 3,
    loop_exit_condition TEXT NOT NULL DEFAULT 'quality_threshold' CHECK (loop_exit_condition IN ('max_reached', 'quality_threshold', 'no_improvement', 'human_approval', 'timeout')),
    loop_exit_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.85,
    condition_evaluation_method TEXT NOT NULL DEFAULT 'state_field_check' CHECK (condition_evaluation_method IN ('state_field_check', 'llm_evaluation', 'score_comparison', 'regex_match')),

    -- 7.6 Cost & Performance
    max_cost_per_run_usd NUMERIC(10,2) NOT NULL DEFAULT 5.00,
    max_total_tokens INTEGER NOT NULL DEFAULT 250000,
    max_latency_seconds INTEGER NOT NULL DEFAULT 300,
    caching TEXT NOT NULL DEFAULT 'exact_match' CHECK (caching IN ('none', 'exact_match', 'semantic_cache')),
    cache_ttl_hours INTEGER NOT NULL DEFAULT 24,

    -- 7.7 Tool Behavior
    tool_selection_strategy TEXT NOT NULL DEFAULT 'llm_decides' CHECK (tool_selection_strategy IN ('llm_decides', 'always_available', 'whitelist_per_node')),
    tool_call_timeout INTEGER NOT NULL DEFAULT 30,
    tool_retry_on_failure INTEGER NOT NULL DEFAULT 1,
    tool_result_handling TEXT NOT NULL DEFAULT 'structured' CHECK (tool_result_handling IN ('raw', 'summarized', 'structured', 'truncated')),
    max_tool_calls_per_node INTEGER NOT NULL DEFAULT 10,
    parallel_tool_calls BOOLEAN NOT NULL DEFAULT TRUE,

    -- 7.8 Guardrail Ordering & Trigger
    guardrail_priority_order TEXT[] NOT NULL DEFAULT ARRAY[
        'never_fabricate', 'calculation_accuracy', 'source_grounding',
        'reasoning_transparency', 'comprehensiveness', 'consistency',
        'recency', 'determinism', 'regulatory_compliance',
        'user_privacy', 'minimize_latency', 'minimize_cost'
    ],
    guardrail_trigger_action TEXT NOT NULL DEFAULT 'graceful_fallback' CHECK (guardrail_trigger_action IN ('graceful_fallback', 'explicit_warning', 'hard_block', 'silent_retry', 'escalate_to_human')),
    max_guardrail_retries INTEGER NOT NULL DEFAULT 2,
    hallucination_detection TEXT NOT NULL DEFAULT 'citation_verification' CHECK (hallucination_detection IN ('none', 'self_check', 'cross_reference', 'citation_verification', 'all')),
    numerical_validation TEXT NOT NULL DEFAULT 'formula_check' CHECK (numerical_validation IN ('none', 'formula_check', 'range_check', 'cross_reference', 'full_audit')),
    source_grounding_level TEXT NOT NULL DEFAULT 'verify_citation' CHECK (source_grounding_level IN ('none', 'require_citation', 'verify_citation', 'strict_attribution')),
    contradictory_data_handling TEXT NOT NULL DEFAULT 'flag_both_with_sources' CHECK (contradictory_data_handling IN ('flag_both_with_sources', 'use_most_recent', 'use_most_authoritative', 'halt_and_clarify')),
    uncertainty_handling TEXT NOT NULL DEFAULT 'show_range' CHECK (uncertainty_handling IN ('present_with_confidence', 'show_range', 'escalate_to_human', 'omit_and_note', 'best_guess_with_caveat')),
    confidence_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.7,

    -- 7.9 Persona & Prompt Parameters
    risk_tolerance TEXT NOT NULL DEFAULT 'conservative' CHECK (risk_tolerance IN ('very_conservative', 'conservative', 'moderate', 'aggressive')),
    detail_level TEXT NOT NULL DEFAULT 'standard' CHECK (detail_level IN ('concise', 'standard', 'detailed', 'exhaustive')),
    language_formality TEXT NOT NULL DEFAULT 'semi_formal' CHECK (language_formality IN ('formal', 'semi_formal', 'conversational')),
    disclaimer_inclusion TEXT NOT NULL DEFAULT 'when_uncertain' CHECK (disclaimer_inclusion IN ('always', 'when_uncertain', 'never')),
    few_shot_examples TEXT NOT NULL DEFAULT 'domain_default' CHECK (few_shot_examples IN ('none', 'domain_default', 'auto_select')),
    few_shot_count INTEGER NOT NULL DEFAULT 2,
    output_template TEXT NOT NULL DEFAULT 'domain_default' CHECK (output_template IN ('standard_report', 'executive_summary', 'detailed_analysis', 'data_table', 'domain_default')),

    -- 7.10 Missing Information Strategy
    missing_info_strategy TEXT NOT NULL DEFAULT 'hybrid' CHECK (missing_info_strategy IN ('ask_user', 'search_external', 'use_defaults', 'estimate_with_reasoning', 'hybrid')),
    missing_info_autonomy TEXT NOT NULL DEFAULT 'medium' CHECK (missing_info_autonomy IN ('low', 'medium', 'high')),
    external_data_freshness TEXT NOT NULL DEFAULT 'cached_24h' CHECK (external_data_freshness IN ('real_time', 'cached_24h', 'cached_7d', 'manual_refresh')),
    assumption_source_priority TEXT NOT NULL DEFAULT 'user_provided → external_api → model_estimate',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    -- NOTE: No updated_at — configurations are IMMUTABLE
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE enterprise_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardrails ENABLE ROW LEVEL SECURITY;
ALTER TABLE configurations ENABLE ROW LEVEL SECURITY;

-- Policies: users can only see their own data
CREATE POLICY "Users see own d" ON domains FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own enterprise docs" ON enterprise_documents FOR ALL USING (
    domain_id IN (SELECT id FROM domains WHERE user_id = auth.uid())
);
CREATE POLICY "Users see own workflows" ON workflows FOR ALL USING (
    domain_id IN (SELECT id FROM domains WHERE user_id = auth.uid())
);
CREATE POLICY "Users see own tools" ON tools FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own prompts" ON prompt_versions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own guardrails" ON guardrails FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own configs" ON configurations FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_domains_user ON domains(user_id);
CREATE INDEX idx_workflows_domain ON workflows(domain_id);
CREATE INDEX idx_enterprise_docs_domain ON enterprise_documents(domain_id);
CREATE INDEX idx_prompt_versions_user ON prompt_versions(user_id);
CREATE INDEX idx_configurations_user ON configurations(user_id);
CREATE INDEX idx_tools_user ON tools(user_id);

-- ============================================================
-- SEED: Platform Guardrails (12 built-in)
-- ============================================================
-- These are seeded per-user on first login via the backend.
-- The backend seed function inserts these 12 for each new user.

-- ============================================================
-- FUNCTION: Prevent configuration mutation
-- ============================================================
CREATE OR REPLACE FUNCTION prevent_config_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Configurations are immutable. Create a new configuration instead.';
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_config_update
    BEFORE UPDATE ON configurations
    FOR EACH ROW
    EXECUTE FUNCTION prevent_config_mutation();

CREATE TRIGGER no_config_delete
    BEFORE DELETE ON configurations
    FOR EACH ROW
    EXECUTE FUNCTION prevent_config_mutation();

-- ============================================================
-- ALERT THRESHOLDS (T3.8)
-- ============================================================
CREATE TABLE alert_thresholds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    operator TEXT NOT NULL CHECK (operator IN ('gt', 'gte', 'lt', 'lte')),
    value NUMERIC NOT NULL,
    action TEXT NOT NULL DEFAULT 'log' CHECK (action IN ('log', 'notify', 'block')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE triggered_alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    threshold_id UUID NOT NULL REFERENCES alert_thresholds(id) ON DELETE CASCADE,
    run_id UUID NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    threshold_value NUMERIC NOT NULL,
    actual_value NUMERIC NOT NULL,
    operator TEXT NOT NULL,
    action TEXT NOT NULL DEFAULT 'log',
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
