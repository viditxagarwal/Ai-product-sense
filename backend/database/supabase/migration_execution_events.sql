-- Migration: Execution Events + Model Pricing
-- Implements Section G (Dynamic Event Schema) and Section L.1 (Pricing)
-- Run this in Supabase SQL Editor AFTER phase2_schema.sql

-- ============================================================
-- EXECUTION EVENTS (Section G)
-- Core event table for all execution telemetry
-- ============================================================
CREATE TABLE IF NOT EXISTS execution_events (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    execution_id    UUID NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
    parent_event_id UUID REFERENCES execution_events(id),
    event_type      TEXT NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data            JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT fk_parent FOREIGN KEY (parent_event_id) REFERENCES execution_events(id)
);

CREATE INDEX IF NOT EXISTS idx_exec_events_exec_time
    ON execution_events (execution_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_exec_events_exec_type
    ON execution_events (execution_id, event_type);
CREATE INDEX IF NOT EXISTS idx_exec_events_parent
    ON execution_events (parent_event_id) WHERE parent_event_id IS NOT NULL;

-- ============================================================
-- MODEL PRICING (Section L.1)
-- Configurable pricing table for cost computation
-- ============================================================
CREATE TABLE IF NOT EXISTS model_pricing (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider            TEXT NOT NULL,
    model_id            TEXT NOT NULL,
    display_name        TEXT NOT NULL,
    input_cost_per_m    NUMERIC(10,4) NOT NULL DEFAULT 0,
    output_cost_per_m   NUMERIC(10,4) NOT NULL DEFAULT 0,
    cache_read_per_m    NUMERIC(10,4) DEFAULT 0,
    cache_write_per_m   NUMERIC(10,4) DEFAULT 0,
    thinking_cost_per_m NUMERIC(10,4) DEFAULT 0,
    context_window      INTEGER NOT NULL DEFAULT 128000,
    max_output_tokens   INTEGER NOT NULL DEFAULT 4096,
    supports_thinking   BOOLEAN NOT NULL DEFAULT FALSE,
    supports_tools      BOOLEAN NOT NULL DEFAULT TRUE,
    supports_streaming  BOOLEAN NOT NULL DEFAULT TRUE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(provider, model_id)
);

-- ============================================================
-- DISPLAY SETTINGS (Section I)
-- Per-user display preferences for the Inspector
-- ============================================================
CREATE TABLE IF NOT EXISTS display_settings (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    settings    JSONB NOT NULL DEFAULT '{
        "show_inner_llm_calls": true,
        "show_tool_call_details": true,
        "show_thinking": true,
        "show_system_prompts": true,
        "show_raw_messages": false,
        "show_token_counts": true,
        "show_costs": true,
        "show_edge_evaluations": true,
        "show_mapping_details": true,
        "stream_text": true,
        "stream_thinking": true,
        "show_live_tool_cards": true,
        "show_progress_bar": true,
        "show_activity_log": false,
        "show_cost_breakdown": true,
        "show_token_heatmap": false,
        "show_latency_waterfall": true,
        "enable_comparison_view": true
    }',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(user_id)
);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE execution_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE display_settings ENABLE ROW LEVEL SECURITY;

-- Execution events: users see events for their own runs
CREATE POLICY "Users see own execution events" ON execution_events FOR ALL USING (
    execution_id IN (
        SELECT er.id FROM execution_runs er
        JOIN threads t ON er.thread_id = t.id
        WHERE t.user_id = auth.uid()
    )
);

-- Model pricing: everyone can read (public reference data)
CREATE POLICY "Anyone can read model pricing" ON model_pricing FOR SELECT USING (true);

-- Display settings: users see own settings
CREATE POLICY "Users see own display settings" ON display_settings FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_display_settings_user ON display_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_model_pricing_provider ON model_pricing(provider, model_id);

-- ============================================================
-- SEED: Model Pricing (Section L.1 — May 2025 prices)
-- ============================================================
INSERT INTO model_pricing (provider, model_id, display_name, input_cost_per_m, output_cost_per_m, cache_read_per_m, cache_write_per_m, thinking_cost_per_m, context_window, max_output_tokens, supports_thinking) VALUES
    ('anthropic', 'claude-opus-4', 'Claude Opus 4', 15.00, 75.00, 1.50, 18.75, 75.00, 200000, 32000, true),
    ('anthropic', 'claude-sonnet-4', 'Claude Sonnet 4', 3.00, 15.00, 0.30, 3.75, 15.00, 200000, 16384, true),
    ('anthropic', 'claude-haiku-3.5', 'Claude Haiku 3.5', 0.80, 4.00, 0.08, 1.00, 0, 200000, 8192, false),
    ('openai', 'gpt-4o', 'GPT-4o', 2.50, 10.00, 1.25, 2.50, 0, 128000, 16384, false),
    ('openai', 'gpt-4o-mini', 'GPT-4o Mini', 0.15, 0.60, 0.075, 0.15, 0, 128000, 16384, false),
    ('openai', 'o3', 'O3', 10.00, 40.00, 0, 0, 40.00, 200000, 100000, true),
    ('openai', 'o3-mini', 'O3 Mini', 1.10, 4.40, 0, 0, 4.40, 200000, 100000, true),
    ('openai', 'o4-mini', 'O4 Mini', 1.10, 4.40, 0, 0, 4.40, 200000, 100000, true),
    ('google', 'gemini-2.0-flash', 'Gemini 2.0 Flash', 0.10, 0.40, 0, 0, 0, 1000000, 8192, false),
    ('google', 'gemini-2.5-pro', 'Gemini 2.5 Pro', 1.25, 10.00, 0, 0, 10.00, 1000000, 65536, true)
ON CONFLICT (provider, model_id) DO UPDATE SET
    input_cost_per_m = EXCLUDED.input_cost_per_m,
    output_cost_per_m = EXCLUDED.output_cost_per_m,
    cache_read_per_m = EXCLUDED.cache_read_per_m,
    cache_write_per_m = EXCLUDED.cache_write_per_m,
    thinking_cost_per_m = EXCLUDED.thinking_cost_per_m,
    context_window = EXCLUDED.context_window,
    max_output_tokens = EXCLUDED.max_output_tokens,
    supports_thinking = EXCLUDED.supports_thinking,
    updated_at = NOW();
