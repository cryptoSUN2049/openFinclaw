-- Multi-tenant channel management table
-- Stores per-tenant channel connections (Telegram, Discord, etc.)

CREATE TABLE IF NOT EXISTS tenant_channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       TEXT NOT NULL,                    -- supabaseUser.id
  channel_type    TEXT NOT NULL,                    -- 'telegram', 'discord', 'slack', etc.
  label           TEXT,                             -- user-defined display name
  credentials     JSONB NOT NULL,                   -- { encrypted, iv, bot_id } (AES-256-GCM encrypted token)
  config          JSONB DEFAULT '{}',               -- channel-specific config overrides
  status          TEXT DEFAULT 'inactive',          -- active | inactive | error
  last_error      TEXT,
  bot_info        JSONB,                            -- cached getMe / bot identity
  webhook_secret  TEXT NOT NULL,                    -- per-channel webhook secret for URL verification
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, channel_type, (credentials->>'bot_id'))
);

CREATE INDEX IF NOT EXISTS idx_tc_tenant ON tenant_channels(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tc_active ON tenant_channels(status) WHERE status = 'active';

-- Auto-update updated_at on row modification
CREATE OR REPLACE FUNCTION update_tenant_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_tenant_channels_updated_at ON tenant_channels;
CREATE TRIGGER trigger_tenant_channels_updated_at
  BEFORE UPDATE ON tenant_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_channels_updated_at();

-- Row Level Security (defense-in-depth for direct Supabase client access)
-- Gateway uses service_role key which bypasses RLS, but this protects against
-- compromised anon keys or misconfigured client access.
ALTER TABLE tenant_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_channels_select ON tenant_channels
  FOR SELECT USING (auth.uid()::text = tenant_id);

CREATE POLICY tenant_channels_insert ON tenant_channels
  FOR INSERT WITH CHECK (auth.uid()::text = tenant_id);

CREATE POLICY tenant_channels_update ON tenant_channels
  FOR UPDATE USING (auth.uid()::text = tenant_id);

CREATE POLICY tenant_channels_delete ON tenant_channels
  FOR DELETE USING (auth.uid()::text = tenant_id);
