-- API Keys table for storing encrypted provider credentials
CREATE TABLE IF NOT EXISTS api_keys (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID NOT NULL,
    provider    TEXT NOT NULL,           -- e.g. 'openai', 'anthropic', 'groq', 'google_ai', 'ollama', 'custom_openai', 'tavily', 'alpha_vantage', 'polygon', 'database_pg', 'database_mysql'
    encrypted_key TEXT NOT NULL,          -- encrypted API key / connection string
    key_hint    TEXT NOT NULL DEFAULT '', -- last 6 chars of key for display
    extra_fields JSONB DEFAULT '{}',     -- provider-specific extra fields (org_id, base_url, model_name, db host/port, etc.)
    is_valid    BOOLEAN DEFAULT NULL,    -- NULL = untested, TRUE = passed, FALSE = failed
    last_tested_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT now() NOT NULL,

    CONSTRAINT unique_user_provider UNIQUE (user_id, provider)
);

-- RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own api_keys"
    ON api_keys FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Index
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys (user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_api_keys_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_api_keys_updated_at
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_api_keys_updated_at();
