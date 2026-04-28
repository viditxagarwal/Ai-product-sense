-- Phase 2: Task Execution & Working Screen Tables
-- Run this in Supabase SQL Editor AFTER the Phase 1 schema

-- ============================================================
-- THREADS
-- ============================================================
CREATE TABLE threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    configuration_id UUID NOT NULL REFERENCES configurations(id),
    title TEXT NOT NULL DEFAULT 'New Thread',
    instructions TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- THREAD MESSAGES
-- ============================================================
CREATE TABLE thread_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL DEFAULT '',
    message_type TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'execution_trace', 'file_attachment')),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- EXECUTION RUNS
-- ============================================================
CREATE TABLE execution_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    trigger_message_id UUID REFERENCES thread_messages(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    total_duration_ms INTEGER,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
    step_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ============================================================
-- EXECUTION STEPS
-- ============================================================
CREATE TABLE execution_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_id UUID NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    node_type TEXT NOT NULL,
    node_name TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
    duration_ms INTEGER,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    cost_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
    tool_name TEXT,
    tool_config JSONB,
    input_payload JSONB,
    output_payload JSONB,
    routing_decision JSONB,
    guardrails_fired TEXT[],
    file_operation_type TEXT NOT NULL DEFAULT 'none' CHECK (file_operation_type IN ('creation', 'targeted_edit', 'append', 'bulk_rewrite', 'none')),
    confidence_score NUMERIC(5,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- THREAD FILES
-- ============================================================
CREATE TABLE thread_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size_bytes BIGINT,
    source TEXT NOT NULL DEFAULT 'ai_generated' CHECK (source IN ('user_upload', 'ai_generated')),
    current_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FILE VERSIONS
-- ============================================================
CREATE TABLE file_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES thread_files(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    file_url TEXT NOT NULL,
    operation_type TEXT NOT NULL CHECK (operation_type IN ('creation', 'targeted_edit', 'append', 'bulk_rewrite')),
    change_summary JSONB,
    created_by TEXT NOT NULL DEFAULT 'ai' CHECK (created_by IN ('user', 'ai')),
    trigger_step_id UUID REFERENCES execution_steps(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FILE CHANGES (for targeted_edit versions only)
-- ============================================================
CREATE TABLE file_changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_version_id UUID NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,
    change_type TEXT NOT NULL CHECK (change_type IN ('cell_modify', 'line_modify')),
    location TEXT NOT NULL,
    old_value TEXT NOT NULL DEFAULT '',
    new_value TEXT NOT NULL DEFAULT '',
    reason TEXT,
    downstream_impact JSONB,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'reverted')),
    resolved_at TIMESTAMPTZ
);

-- ============================================================
-- PM ANNOTATIONS
-- ============================================================
CREATE TABLE pm_annotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    step_id UUID NOT NULL REFERENCES execution_steps(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    annotation_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE thread_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pm_annotations ENABLE ROW LEVEL SECURITY;

-- Threads: users see own threads
CREATE POLICY "Users see own threads" ON threads FOR ALL USING (auth.uid() = user_id);

-- Thread messages: users see messages in their own threads
CREATE POLICY "Users see own thread messages" ON thread_messages FOR ALL USING (
    thread_id IN (SELECT id FROM threads WHERE user_id = auth.uid())
);

-- Execution runs: users see runs in their own threads
CREATE POLICY "Users see own execution runs" ON execution_runs FOR ALL USING (
    thread_id IN (SELECT id FROM threads WHERE user_id = auth.uid())
);

-- Execution steps: users see steps in runs from their threads
CREATE POLICY "Users see own execution steps" ON execution_steps FOR ALL USING (
    run_id IN (
        SELECT er.id FROM execution_runs er
        JOIN threads t ON er.thread_id = t.id
        WHERE t.user_id = auth.uid()
    )
);

-- Thread files: users see files in their own threads
CREATE POLICY "Users see own thread files" ON thread_files FOR ALL USING (
    thread_id IN (SELECT id FROM threads WHERE user_id = auth.uid())
);

-- File versions: users see versions of their own files
CREATE POLICY "Users see own file versions" ON file_versions FOR ALL USING (
    file_id IN (
        SELECT tf.id FROM thread_files tf
        JOIN threads t ON tf.thread_id = t.id
        WHERE t.user_id = auth.uid()
    )
);

-- File changes: users see changes in their own file versions
CREATE POLICY "Users see own file changes" ON file_changes FOR ALL USING (
    file_version_id IN (
        SELECT fv.id FROM file_versions fv
        JOIN thread_files tf ON fv.file_id = tf.id
        JOIN threads t ON tf.thread_id = t.id
        WHERE t.user_id = auth.uid()
    )
);

-- PM annotations: users see own annotations
CREATE POLICY "Users see own annotations" ON pm_annotations FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_threads_user ON threads(user_id);
CREATE INDEX idx_threads_domain ON threads(domain_id);
CREATE INDEX idx_thread_messages_thread ON thread_messages(thread_id);
CREATE INDEX idx_thread_messages_created ON thread_messages(thread_id, created_at);
CREATE INDEX idx_execution_runs_thread ON execution_runs(thread_id);
CREATE INDEX idx_execution_steps_run ON execution_steps(run_id);
CREATE INDEX idx_execution_steps_run_step ON execution_steps(run_id, step_number);
CREATE INDEX idx_thread_files_thread ON thread_files(thread_id);
CREATE INDEX idx_file_versions_file ON file_versions(file_id);
CREATE INDEX idx_file_versions_file_num ON file_versions(file_id, version_number);
CREATE INDEX idx_file_changes_version ON file_changes(file_version_id);
CREATE INDEX idx_file_changes_pending ON file_changes(file_version_id, status) WHERE status = 'pending';
CREATE INDEX idx_pm_annotations_step ON pm_annotations(step_id);
