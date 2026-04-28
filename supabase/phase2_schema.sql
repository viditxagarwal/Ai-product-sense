-- AI Product Studio — Phase 2 Schema
-- Run AFTER Phase 1 schema is in place

-- ============================================================
-- THREADS
-- ============================================================
CREATE TABLE threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  domain_id UUID NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE RESTRICT,
  configuration_id UUID NOT NULL REFERENCES configurations(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Thread',
  instructions TEXT DEFAULT '',
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
  metadata JSONB DEFAULT '{}',
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
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd NUMERIC(10,4) DEFAULT 0,
  step_count INTEGER DEFAULT 0,
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
  tokens_used INTEGER DEFAULT 0,
  cost_usd NUMERIC(10,4) DEFAULT 0,
  tool_name TEXT,
  tool_config JSONB DEFAULT '{}',
  input_payload JSONB DEFAULT '{}',
  output_payload JSONB DEFAULT '{}',
  routing_decision JSONB DEFAULT '{}',
  guardrails_fired JSONB DEFAULT '[]',
  file_operation_type TEXT DEFAULT 'none' CHECK (file_operation_type IN ('creation', 'targeted_edit', 'append', 'bulk_rewrite', 'none')),
  confidence_score NUMERIC(3,2),
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
  change_summary JSONB DEFAULT '{}',
  created_by TEXT NOT NULL DEFAULT 'ai' CHECK (created_by IN ('user', 'ai')),
  trigger_step_id UUID REFERENCES execution_steps(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(file_id, version_number)
);

-- ============================================================
-- FILE CHANGES (only for targeted_edit versions)
-- ============================================================
CREATE TABLE file_changes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  file_version_id UUID NOT NULL REFERENCES file_versions(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL CHECK (change_type IN ('cell_modify', 'line_modify')),
  location TEXT NOT NULL,
  old_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT '',
  reason TEXT DEFAULT '',
  downstream_impact JSONB DEFAULT '{}',
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

CREATE POLICY "Users see own threads" ON threads FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users see own thread messages" ON thread_messages FOR ALL USING (
  thread_id IN (SELECT id FROM threads WHERE user_id = auth.uid())
);
CREATE POLICY "Users see own execution runs" ON execution_runs FOR ALL USING (
  thread_id IN (SELECT id FROM threads WHERE user_id = auth.uid())
);
CREATE POLICY "Users see own execution steps" ON execution_steps FOR ALL USING (
  run_id IN (SELECT id FROM execution_runs WHERE thread_id IN (SELECT id FROM threads WHERE user_id = auth.uid()))
);
CREATE POLICY "Users see own thread files" ON thread_files FOR ALL USING (
  thread_id IN (SELECT id FROM threads WHERE user_id = auth.uid())
);
CREATE POLICY "Users see own file versions" ON file_versions FOR ALL USING (
  file_id IN (SELECT id FROM thread_files WHERE thread_id IN (SELECT id FROM threads WHERE user_id = auth.uid()))
);
CREATE POLICY "Users see own file changes" ON file_changes FOR ALL USING (
  file_version_id IN (SELECT id FROM file_versions WHERE file_id IN (SELECT id FROM thread_files WHERE thread_id IN (SELECT id FROM threads WHERE user_id = auth.uid())))
);
CREATE POLICY "Users see own annotations" ON pm_annotations FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_threads_domain ON threads(domain_id);
CREATE INDEX idx_threads_user ON threads(user_id);
CREATE INDEX idx_thread_messages_thread ON thread_messages(thread_id);
CREATE INDEX idx_thread_messages_created ON thread_messages(created_at);
CREATE INDEX idx_execution_runs_thread ON execution_runs(thread_id);
CREATE INDEX idx_execution_steps_run ON execution_steps(run_id);
CREATE INDEX idx_execution_steps_step_number ON execution_steps(run_id, step_number);
CREATE INDEX idx_thread_files_thread ON thread_files(thread_id);
CREATE INDEX idx_file_versions_file ON file_versions(file_id);
CREATE INDEX idx_file_changes_version ON file_changes(file_version_id);
CREATE INDEX idx_file_changes_status ON file_changes(status);
CREATE INDEX idx_pm_annotations_step ON pm_annotations(step_id);

-- ============================================================
-- ENABLE SUPABASE REALTIME for file_changes table
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE file_changes;
ALTER PUBLICATION supabase_realtime ADD TABLE file_versions;
ALTER PUBLICATION supabase_realtime ADD TABLE execution_steps;
