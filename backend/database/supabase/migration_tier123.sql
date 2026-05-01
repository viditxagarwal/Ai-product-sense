-- Migration: Tier 1-3 Schema Changes
-- Run this in Supabase SQL Editor AFTER phase2_schema.sql and migration_execution_events.sql
--
-- What this does:
--   1. Adds missing columns to execution_runs (token breakdowns, path tracking, config refs)
--   2. Adds metadata column to execution_runs and tools
--   3. Updates CHECK constraints on configurations for new enum values
--   4. Adds pending status to execution_runs
--   5. Creates alert_thresholds and triggered_alerts tables (if not exist)
--   6. Adds RLS policies for new tables


-- ============================================================
-- 1. EXECUTION RUNS — new columns for Tier 2 telemetry
-- ============================================================

-- Reference columns (which workflow + config produced this run)
ALTER TABLE execution_runs
    ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS configuration_id UUID REFERENCES configurations(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS config_snapshot JSONB;

-- Token breakdown columns
ALTER TABLE execution_runs
    ADD COLUMN IF NOT EXISTS total_input_tokens INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_output_tokens INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_thinking_tokens INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_llm_calls INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_tool_calls INTEGER NOT NULL DEFAULT 0;

-- Path & attribution tracking
ALTER TABLE execution_runs
    ADD COLUMN IF NOT EXISTS path_taken TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS models_used TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS tools_used TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS cost_by_model JSONB DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS cost_by_node JSONB DEFAULT '{}';

-- Metadata (used by replay feature)
ALTER TABLE execution_runs
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Allow 'pending' status (used by replay)
ALTER TABLE execution_runs DROP CONSTRAINT IF EXISTS execution_runs_status_check;
ALTER TABLE execution_runs ADD CONSTRAINT execution_runs_status_check
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled'));


-- ============================================================
-- 2. TOOLS — metadata column for Postman imports
-- ============================================================
ALTER TABLE tools
    ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';


-- ============================================================
-- 3. CONFIGURATIONS — update CHECK constraints for new enum values
--    (Configurations are immutable, so existing rows keep old values.
--     New configs will use the new values.)
-- ============================================================

-- streaming_mode: off | text_only | text_and_thinking | text_and_tools | full
ALTER TABLE configurations DROP CONSTRAINT IF EXISTS configurations_streaming_mode_check;
ALTER TABLE configurations ADD CONSTRAINT configurations_streaming_mode_check
    CHECK (streaming_mode IN (
        'off', 'text_only', 'text_and_thinking', 'text_and_tools', 'full',
        -- Legacy values (existing immutable configs may still have these)
        'token_by_token', 'chunk_by_section', 'structured_blocks', 'complete_then_render'
    ));

-- Also update the default for new rows
ALTER TABLE configurations ALTER COLUMN streaming_mode SET DEFAULT 'text_and_thinking';

-- output_format: freetext | markdown | structured_json | table | custom_template
ALTER TABLE configurations DROP CONSTRAINT IF EXISTS configurations_output_format_check;
ALTER TABLE configurations ADD CONSTRAINT configurations_output_format_check
    CHECK (output_format IN (
        'freetext', 'markdown', 'structured_json', 'table', 'custom_template',
        -- Legacy values
        'html', 'auto_detect'
    ));

-- missing_info_strategy: ask_user | search_external | use_defaults | estimate_with_reasoning | rag_memory | structured | combined
ALTER TABLE configurations DROP CONSTRAINT IF EXISTS configurations_missing_info_strategy_check;
ALTER TABLE configurations ADD CONSTRAINT configurations_missing_info_strategy_check
    CHECK (missing_info_strategy IN (
        'ask_user', 'search_external', 'use_defaults', 'estimate_with_reasoning',
        'rag_memory', 'structured', 'combined',
        -- Legacy value
        'hybrid'
    ));

ALTER TABLE configurations ALTER COLUMN missing_info_strategy SET DEFAULT 'combined';


-- ============================================================
-- 4. ALERT THRESHOLDS (T3.8) — create if not exists
-- ============================================================
CREATE TABLE IF NOT EXISTS alert_thresholds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    operator TEXT NOT NULL CHECK (operator IN ('gt', 'gte', 'lt', 'lte')),
    value NUMERIC NOT NULL,
    action TEXT NOT NULL DEFAULT 'log' CHECK (action IN ('log', 'notify', 'block')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS triggered_alerts (
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


-- ============================================================
-- 5. RLS for new tables
-- ============================================================
ALTER TABLE alert_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE triggered_alerts ENABLE ROW LEVEL SECURITY;

-- Drop-if-exists to make this script idempotent
DROP POLICY IF EXISTS "Users see own alert thresholds" ON alert_thresholds;
CREATE POLICY "Users see own alert thresholds" ON alert_thresholds
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users see own triggered alerts" ON triggered_alerts;
CREATE POLICY "Users see own triggered alerts" ON triggered_alerts
    FOR ALL USING (auth.uid() = user_id);


-- ============================================================
-- 6. INDEXES for new columns
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_execution_runs_workflow ON execution_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_execution_runs_config ON execution_runs(configuration_id);
CREATE INDEX IF NOT EXISTS idx_alert_thresholds_user ON alert_thresholds(user_id);
CREATE INDEX IF NOT EXISTS idx_triggered_alerts_run ON triggered_alerts(run_id);
CREATE INDEX IF NOT EXISTS idx_triggered_alerts_user ON triggered_alerts(user_id);
