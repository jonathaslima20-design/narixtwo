/*
  # Plans and Client Subscriptions System

  1. New Tables
    - `plans`
      - `id` (uuid, primary key)
      - `name` (text) -- display name e.g. "Mensal", "Anual"
      - `slug` (text, unique) -- machine identifier e.g. "mensal", "anual"
      - `description` (text) -- short description
      - `price_cents` (integer) -- price in BRL cents: 4900 = R$49,00
      - `billing_period` (text) -- "monthly" or "yearly"
      - `max_leads` (integer) -- lead limit per user (-1 = unlimited)
      - `max_campaigns_per_month` (integer) -- campaigns per month limit
      - `max_recipients_per_campaign` (integer) -- recipients per campaign limit
      - `max_whatsapp_instances` (integer) -- WhatsApp connections limit
      - `max_templates` (integer) -- message template limit
      - `max_automation_rules` (integer) -- automation rules limit
      - `max_ai_tokens_per_month` (integer) -- AI token monthly quota
      - `features` (jsonb) -- flexible feature flags
      - `is_active` (boolean) -- whether plan is available for new assignments
      - `sort_order` (integer) -- display ordering
      - `created_at` / `updated_at` (timestamptz)

    - `client_subscriptions`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles, unique) -- one subscription per user
      - `plan_id` (uuid, references plans)
      - `status` (text) -- active, trial, cancelled, past_due, suspended
      - `started_at` (timestamptz) -- subscription start date
      - `expires_at` (timestamptz, nullable) -- expiration date
      - `cancelled_at` (timestamptz, nullable)
      - `notes` (text) -- admin notes
      - `created_at` / `updated_at` (timestamptz)

  2. Security
    - RLS enabled on both tables
    - `plans`: admins can full CRUD, authenticated users can SELECT active plans
    - `client_subscriptions`: admins can full CRUD, users can SELECT own subscription

  3. Seed Data
    - "Mensal" plan at R$49,00/month
    - "Anual" plan at R$389,00/year

  4. Automation
    - Trigger on profiles to auto-create subscription with default "Mensal" plan
    - Both tables added to supabase_realtime publication

  5. Notes
    - plans.id uses ON DELETE RESTRICT in client_subscriptions FK to prevent
      deleting a plan that has subscribers
    - client_subscriptions has unique constraint on user_id ensuring one active
      subscription per user
*/

-- ============================================================
-- Plans table
-- ============================================================
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text DEFAULT '',
  price_cents integer NOT NULL DEFAULT 0,
  billing_period text NOT NULL DEFAULT 'monthly'
    CHECK (billing_period IN ('monthly', 'yearly')),
  max_leads integer NOT NULL DEFAULT -1,
  max_campaigns_per_month integer NOT NULL DEFAULT -1,
  max_recipients_per_campaign integer NOT NULL DEFAULT -1,
  max_whatsapp_instances integer NOT NULL DEFAULT 1,
  max_templates integer NOT NULL DEFAULT -1,
  max_automation_rules integer NOT NULL DEFAULT -1,
  max_ai_tokens_per_month integer NOT NULL DEFAULT -1,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage plans"
  ON plans FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can view active plans"
  ON plans FOR SELECT
  TO authenticated
  USING (is_active = true);

-- ============================================================
-- Client subscriptions table
-- ============================================================
CREATE TABLE IF NOT EXISTS client_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'trial', 'cancelled', 'past_due', 'suspended')),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  cancelled_at timestamptz,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE client_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage subscriptions"
  ON client_subscriptions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Users can view own subscription"
  ON client_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_client_subscriptions_plan_id
  ON client_subscriptions (plan_id);

CREATE INDEX IF NOT EXISTS idx_client_subscriptions_status
  ON client_subscriptions (status);

-- ============================================================
-- Seed default plans
-- ============================================================
INSERT INTO plans (name, slug, description, price_cents, billing_period, max_leads, max_campaigns_per_month, max_recipients_per_campaign, max_whatsapp_instances, max_templates, max_automation_rules, max_ai_tokens_per_month, sort_order)
VALUES
  ('Mensal', 'mensal', 'Plano mensal com acesso completo a todas as funcionalidades.', 4900, 'monthly', -1, -1, -1, 1, -1, -1, -1, 1),
  ('Anual', 'anual', 'Plano anual com desconto. Acesso completo a todas as funcionalidades.', 38900, 'yearly', -1, -1, -1, 1, -1, -1, -1, 2)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Auto-create subscription for new users
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_profile_subscription()
RETURNS trigger AS $$
DECLARE
  default_plan_id uuid;
BEGIN
  IF NEW.role = 'user' THEN
    SELECT id INTO default_plan_id FROM plans WHERE slug = 'mensal' LIMIT 1;
    IF default_plan_id IS NOT NULL THEN
      INSERT INTO client_subscriptions (user_id, plan_id, status)
      VALUES (NEW.id, default_plan_id, 'active')
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_profile_created_subscription'
  ) THEN
    CREATE TRIGGER on_profile_created_subscription
      AFTER INSERT ON profiles
      FOR EACH ROW
      EXECUTE FUNCTION handle_new_profile_subscription();
  END IF;
END $$;

-- ============================================================
-- Backfill subscriptions for existing users
-- ============================================================
DO $$
DECLARE
  default_plan_id uuid;
BEGIN
  SELECT id INTO default_plan_id FROM plans WHERE slug = 'mensal' LIMIT 1;
  IF default_plan_id IS NOT NULL THEN
    INSERT INTO client_subscriptions (user_id, plan_id, status)
    SELECT p.id, default_plan_id, 'active'
    FROM profiles p
    WHERE p.role = 'user'
    AND NOT EXISTS (
      SELECT 1 FROM client_subscriptions cs WHERE cs.user_id = p.id
    );
  END IF;
END $$;

-- ============================================================
-- Add to realtime publication
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE plans;
ALTER PUBLICATION supabase_realtime ADD TABLE client_subscriptions;
