-- Migration: Add rendering config fields + thread_metrics table
-- Date: 2026-04-29

-- ═══════════════════════════════════════════════════════════════
-- 1. Add new columns to configurations
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE configurations
ADD COLUMN IF NOT EXISTS execution_trace_placement TEXT NOT NULL DEFAULT 'inline_interleaved'
    CHECK (execution_trace_placement IN ('inline_interleaved', 'top_status_bar', 'collapsible_below', 'side_panel', 'hidden_inspectable')),
ADD COLUMN IF NOT EXISTS harness_display_mode TEXT NOT NULL DEFAULT 'sequential_visible'
    CHECK (harness_display_mode IN ('sequential_visible', 'collapsed_summary', 'final_only', 'all_expanded')),
ADD COLUMN IF NOT EXISTS intermediate_steps_in_chat TEXT NOT NULL DEFAULT 'status_pills'
    CHECK (intermediate_steps_in_chat IN ('full_output', 'status_pills', 'progress_bar', 'none'));


-- ═══════════════════════════════════════════════════════════════
-- 2. Create thread_metrics table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS thread_metrics (
    thread_id UUID PRIMARY KEY REFERENCES threads(id),
    total_messages INT DEFAULT 0,
    total_harnesses INT DEFAULT 0,
    total_steps INT DEFAULT 0,
    total_prompt_tokens INT DEFAULT 0,
    total_completion_tokens INT DEFAULT 0,
    total_tokens INT DEFAULT 0,
    total_cost_usd NUMERIC(10,4) DEFAULT 0,
    total_duration_ms INT DEFAULT 0,
    models_used TEXT[] DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- ═══════════════════════════════════════════════════════════════
-- 3. Enable RLS on thread_metrics
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE thread_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view metrics for their threads"
    ON thread_metrics
    FOR SELECT
    USING (
        thread_id IN (
            SELECT id FROM threads WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert metrics for their threads"
    ON thread_metrics
    FOR INSERT
    WITH CHECK (
        thread_id IN (
            SELECT id FROM threads WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update metrics for their threads"
    ON thread_metrics
    FOR UPDATE
    USING (
        thread_id IN (
            SELECT id FROM threads WHERE user_id = auth.uid()
        )
    );
