/*
  # Add Trial Plan, Send Counter, Account Enable Flag, and Checkout Settings

  1. Changes to `plans` table
    - Add `max_sends` column (integer, default -1 for unlimited)
    - Add `trial_duration_days` column (integer, default 0)
    - Insert "Trial" plan: free, 2-day duration, 20 send limit

  2. Changes to `client_subscriptions` table
    - Add `send_count` column (integer, default 0) to track total sends per user

  3. Changes to `profiles` table
    - Add `is_enabled` column (boolean, default true) to allow admin to disable user access

  4. New rows in `admin_settings`
    - `checkout_link_mensal` — external payment URL for monthly plan
    - `checkout_link_anual` — external payment URL for annual plan

  5. New RLS policy on `admin_settings`
    - Authenticated users can read checkout link keys (read-only)

  6. Update existing plans
    - Set `max_sends = -1` (unlimited) on Mensal and Anual plans

  7. Trigger: auto-create Trial subscription for new users
    - On insert into `profiles`, create `client_subscriptions` row with Trial plan
*/

-- 1. Add columns to plans
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'max_sends'
  ) THEN
    ALTER TABLE plans ADD COLUMN max_sends integer NOT NULL DEFAULT -1;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'plans' AND column_name = 'trial_duration_days'
  ) THEN
    ALTER TABLE plans ADD COLUMN trial_duration_days integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Insert Trial plan if not exists
INSERT INTO plans (name, slug, description, price_cents, billing_period, max_leads, max_campaigns_per_month, max_recipients_per_campaign, max_whatsapp_instances, max_templates, max_automation_rules, max_ai_tokens_per_month, features, is_active, sort_order, max_sends, trial_duration_days)
SELECT 'Trial', 'trial', 'Plano de teste gratuito por 2 dias ou 20 envios.', 0, 'monthly', -1, -1, -1, 1, -1, -1, -1, '{}'::jsonb, true, 0, 20, 2
WHERE NOT EXISTS (SELECT 1 FROM plans WHERE slug = 'trial');

-- Update existing Mensal and Anual plans to have unlimited sends
UPDATE plans SET max_sends = -1 WHERE slug IN ('mensal', 'anual') AND max_sends IS DISTINCT FROM -1;

-- 2. Add send_count to client_subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_subscriptions' AND column_name = 'send_count'
  ) THEN
    ALTER TABLE client_subscriptions ADD COLUMN send_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

-- 3. Add is_enabled to profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_enabled'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_enabled boolean NOT NULL DEFAULT true;
  END IF;
END $$;

-- 4. Insert checkout link settings
INSERT INTO admin_settings (key, value)
SELECT 'checkout_link_mensal', ''
WHERE NOT EXISTS (SELECT 1 FROM admin_settings WHERE key = 'checkout_link_mensal');

INSERT INTO admin_settings (key, value)
SELECT 'checkout_link_anual', ''
WHERE NOT EXISTS (SELECT 1 FROM admin_settings WHERE key = 'checkout_link_anual');

-- 5. RLS: let authenticated users read checkout link keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_settings' AND policyname = 'Users can read checkout links'
  ) THEN
    CREATE POLICY "Users can read checkout links"
      ON admin_settings
      FOR SELECT
      TO authenticated
      USING (key LIKE 'checkout_link_%');
  END IF;
END $$;

-- 6. Trigger: auto-create Trial subscription for new users
CREATE OR REPLACE FUNCTION public.handle_new_user_trial_subscription()
RETURNS trigger AS $$
DECLARE
  trial_plan_id uuid;
BEGIN
  IF NEW.role = 'user' THEN
    SELECT id INTO trial_plan_id FROM public.plans WHERE slug = 'trial' LIMIT 1;
    IF trial_plan_id IS NOT NULL THEN
      INSERT INTO public.client_subscriptions (user_id, plan_id, status, started_at, expires_at, send_count)
      VALUES (
        NEW.id,
        trial_plan_id,
        'trial',
        now(),
        now() + interval '2 days',
        0
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_profile_created_trial_subscription'
  ) THEN
    CREATE TRIGGER on_profile_created_trial_subscription
      AFTER INSERT ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.handle_new_user_trial_subscription();
  END IF;
END $$;
