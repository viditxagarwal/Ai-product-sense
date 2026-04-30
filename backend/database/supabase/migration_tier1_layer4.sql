-- ============================================================
-- TIER 1 MIGRATION: Add Layer 4 fields to execution_runs
-- Also adds new config columns for thinking/reasoning/stop_sequences
-- ============================================================

-- execution_runs: Layer 4 telemetry fields
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL;
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS configuration_id UUID REFERENCES configurations(id) ON DELETE SET NULL;
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS config_snapshot JSONB;
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS path_taken TEXT[] DEFAULT '{}';
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS total_llm_calls INTEGER DEFAULT 0;
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS total_tool_calls INTEGER DEFAULT 0;
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS total_input_tokens INTEGER DEFAULT 0;
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS total_output_tokens INTEGER DEFAULT 0;
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS total_thinking_tokens INTEGER DEFAULT 0;
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS models_used TEXT[] DEFAULT '{}';
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS tools_used TEXT[] DEFAULT '{}';
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS cost_by_model JSONB DEFAULT '{}';
ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS cost_by_node JSONB DEFAULT '{}';

-- configurations: new fields for thinking/reasoning/stop_sequences
ALTER TABLE configurations ADD COLUMN IF NOT EXISTS thinking_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE configurations ADD COLUMN IF NOT EXISTS thinking_budget_tokens INTEGER DEFAULT 0;
ALTER TABLE configurations ADD COLUMN IF NOT EXISTS reasoning_effort TEXT CHECK (reasoning_effort IS NULL OR reasoning_effort IN ('low', 'medium', 'high'));
ALTER TABLE configurations ADD COLUMN IF NOT EXISTS stop_sequences TEXT[] DEFAULT '{}';
ALTER TABLE configurations ADD COLUMN IF NOT EXISTS json_schema JSONB;

-- Index for workflow_id lookups on execution_runs
CREATE INDEX IF NOT EXISTS idx_execution_runs_workflow ON execution_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_execution_runs_config ON execution_runs(configuration_id);
