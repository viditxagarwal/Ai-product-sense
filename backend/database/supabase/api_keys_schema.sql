-- API Keys table (encrypted storage)
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,  -- 'openai', 'anthropic', 'groq', 'google_ai', 'ollama', 'custom_openai', 'tavily', 'alpha_vantage', 'polygon', 'database_postgres', 'database_mysql'
    encrypted_key TEXT NOT NULL,  -- encrypted API key
    key_hint TEXT NOT NULL DEFAULT '',  -- last 6 characters for display
    base_url TEXT,  -- for Ollama, custom providers, database host
    additional_config JSONB DEFAULT '{}',  -- org_id, database port, etc.
    is_valid BOOLEAN DEFAULT NULL,  -- NULL = untested, true = passed, false = failed
    last_tested_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own keys" ON api_keys FOR ALL USING (auth.uid() = user_id);

-- Index
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
