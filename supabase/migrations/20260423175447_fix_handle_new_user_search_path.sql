/*
  # Fix handle_new_user and all signup trigger functions

  1. Problem
    - Signup fails with "Database error saving new user"
    - Trigger functions lack explicit search_path, which can cause
      resolution failures when called from auth schema context

  2. Changes
    - Recreate handle_new_user() with SET search_path = public
    - Recreate handle_new_user_trial_subscription() with SET search_path = public
    - Recreate trigger_seed_lead_categories() with SET search_path = public
    - Recreate on_profile_created_seed_stages() with SET search_path = public
    - Recreate seed_default_lead_categories() with SET search_path = public
    - Recreate seed_default_pipeline_stages() with SET search_path = public

  3. Security
    - All functions remain SECURITY DEFINER owned by postgres
    - No RLS changes
*/

-- 1. handle_new_user (on auth.users INSERT)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')
  );
  RETURN NEW;
END;
$$;

-- 2. handle_new_user_trial_subscription (on profiles INSERT)
CREATE OR REPLACE FUNCTION public.handle_new_user_trial_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. trigger_seed_lead_categories (on profiles INSERT)
CREATE OR REPLACE FUNCTION public.trigger_seed_lead_categories()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM seed_default_lead_categories(NEW.id);
  RETURN NEW;
END;
$$;

-- 4. seed_default_lead_categories (called by trigger_seed_lead_categories)
CREATE OR REPLACE FUNCTION public.seed_default_lead_categories(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO lead_categories (user_id, key, label, color, icon, position)
  VALUES
    (p_user_id, 'cold',   'Frio',    'bg-sky-100 text-sky-700',     'Snowflake',   0),
    (p_user_id, 'warm',   'Morno',   'bg-amber-100 text-amber-700', 'Thermometer', 1),
    (p_user_id, 'hot',    'Quente',  'bg-red-100 text-red-700',     'Flame',       2),
    (p_user_id, 'closed', 'Fechado', 'bg-teal-100 text-teal-700',   'Check',       3)
  ON CONFLICT (user_id, key) DO NOTHING;
END;
$$;

-- 5. on_profile_created_seed_stages (on profiles INSERT)
CREATE OR REPLACE FUNCTION public.on_profile_created_seed_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM seed_default_pipeline_stages(NEW.id);
  RETURN NEW;
END;
$$;

-- 6. seed_default_pipeline_stages (called by on_profile_created_seed_stages)
CREATE OR REPLACE FUNCTION public.seed_default_pipeline_stages(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO pipeline_stages (user_id, key, label, color, position)
  VALUES
    (p_user_id, 'new',       'Novo',        'bg-sky-100 text-sky-700',         0),
    (p_user_id, 'contact',   'Contato',     'bg-amber-100 text-amber-700',     1),
    (p_user_id, 'qualified', 'Qualificado', 'bg-emerald-100 text-emerald-700', 2),
    (p_user_id, 'proposal',  'Proposta',    'bg-orange-100 text-orange-700',   3),
    (p_user_id, 'closed',    'Fechado',     'bg-teal-100 text-teal-700',       4),
    (p_user_id, 'lost',      'Perdido',     'bg-red-100 text-red-700',         5)
  ON CONFLICT (user_id, key) DO NOTHING;
END;
$$;
