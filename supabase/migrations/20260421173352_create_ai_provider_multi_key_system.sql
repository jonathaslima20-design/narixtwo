/*
  # Multi-provider AI system with multiple keys per provider

  1. New Tables
    - `ai_provider_config`: per-provider settings (enabled, priority, default model, max iterations, timeout)
    - `ai_provider_keys`: multiple API keys per provider with labels, health tracking, priority and rate limit state
  2. Seeded providers: gemini, groq, openrouter, cerebras, mistral
  3. Backfill: copies existing admin_settings.GEMINI_API_KEY into ai_provider_keys so the assistant keeps working after deploy
  4. Schema tweaks
    - adds `provider`, `key_id`, `model`, `latency_ms`, `fallback_from` columns to `ai_action_logs`
  5. Security
    - Both new tables have RLS enabled
    - Only authenticated users with profiles.role = 'admin' can SELECT/INSERT/UPDATE/DELETE
    - Service role (edge functions) bypasses RLS as usual

  Important:
  1. No destructive changes: the old `admin_settings.GEMINI_API_KEY` row is kept intact for safety.
  2. API key values are stored in plain text in a locked-down table (RLS restricts to admins only, just like admin_settings).
*/

CREATE TABLE IF NOT EXISTS ai_provider_config (
  provider text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 100,
  default_model text NOT NULL DEFAULT '',
  max_iterations integer NOT NULL DEFAULT 6,
  timeout_ms integer NOT NULL DEFAULT 25000,
  selection_strategy text NOT NULL DEFAULT 'round-robin',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_provider_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  label text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  model_override text NOT NULL DEFAULT '',
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  rate_limited_until timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text NOT NULL DEFAULT '',
  requests_today integer NOT NULL DEFAULT 0,
  requests_reset_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_provider_keys_provider_idx ON ai_provider_keys(provider, priority);
CREATE INDEX IF NOT EXISTS ai_provider_keys_active_idx ON ai_provider_keys(provider, is_active);

ALTER TABLE ai_provider_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provider_keys ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_provider_config' AND policyname = 'Admins can view provider config') THEN
    CREATE POLICY "Admins can view provider config"
      ON ai_provider_config FOR SELECT
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_provider_config' AND policyname = 'Admins can insert provider config') THEN
    CREATE POLICY "Admins can insert provider config"
      ON ai_provider_config FOR INSERT
      TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_provider_config' AND policyname = 'Admins can update provider config') THEN
    CREATE POLICY "Admins can update provider config"
      ON ai_provider_config FOR UPDATE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_provider_config' AND policyname = 'Admins can delete provider config') THEN
    CREATE POLICY "Admins can delete provider config"
      ON ai_provider_config FOR DELETE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_provider_keys' AND policyname = 'Admins can view provider keys') THEN
    CREATE POLICY "Admins can view provider keys"
      ON ai_provider_keys FOR SELECT
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_provider_keys' AND policyname = 'Admins can insert provider keys') THEN
    CREATE POLICY "Admins can insert provider keys"
      ON ai_provider_keys FOR INSERT
      TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_provider_keys' AND policyname = 'Admins can update provider keys') THEN
    CREATE POLICY "Admins can update provider keys"
      ON ai_provider_keys FOR UPDATE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
      WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_provider_keys' AND policyname = 'Admins can delete provider keys') THEN
    CREATE POLICY "Admins can delete provider keys"
      ON ai_provider_keys FOR DELETE
      TO authenticated
      USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
  END IF;
END $$;

INSERT INTO ai_provider_config (provider, enabled, priority, default_model, max_iterations, timeout_ms, selection_strategy)
VALUES
  ('groq', true, 1, 'llama-3.3-70b-versatile', 4, 25000, 'round-robin'),
  ('gemini', true, 2, 'gemini-2.0-flash', 6, 25000, 'round-robin'),
  ('openrouter', false, 3, 'meta-llama/llama-3.3-70b-instruct:free', 4, 30000, 'round-robin'),
  ('cerebras', false, 4, 'llama-3.3-70b', 4, 25000, 'round-robin'),
  ('mistral', false, 5, 'mistral-small-latest', 4, 25000, 'round-robin')
ON CONFLICT (provider) DO NOTHING;

DO $$
DECLARE
  legacy_key text;
BEGIN
  SELECT value INTO legacy_key FROM admin_settings WHERE key = 'GEMINI_API_KEY' LIMIT 1;
  IF legacy_key IS NOT NULL AND legacy_key <> '' THEN
    IF NOT EXISTS (SELECT 1 FROM ai_provider_keys WHERE provider = 'gemini' AND api_key = legacy_key) THEN
      INSERT INTO ai_provider_keys (provider, label, api_key, priority, is_active)
      VALUES ('gemini', 'Chave original (migracao)', legacy_key, 1, true);
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_action_logs' AND column_name = 'provider'
  ) THEN
    ALTER TABLE ai_action_logs ADD COLUMN provider text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_action_logs' AND column_name = 'key_id'
  ) THEN
    ALTER TABLE ai_action_logs ADD COLUMN key_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_action_logs' AND column_name = 'model'
  ) THEN
    ALTER TABLE ai_action_logs ADD COLUMN model text NOT NULL DEFAULT '';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_action_logs' AND column_name = 'latency_ms'
  ) THEN
    ALTER TABLE ai_action_logs ADD COLUMN latency_ms integer NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_action_logs' AND column_name = 'fallback_from'
  ) THEN
    ALTER TABLE ai_action_logs ADD COLUMN fallback_from text NOT NULL DEFAULT '';
  END IF;
END $$;
