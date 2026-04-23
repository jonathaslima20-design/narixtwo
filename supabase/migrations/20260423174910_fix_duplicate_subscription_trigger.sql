/*
  # Fix duplicate subscription trigger on signup

  1. Problem
    - Two AFTER INSERT triggers on `profiles` both insert into `client_subscriptions`
    - `on_profile_created_subscription` assigns Mensal plan (old, should have been replaced)
    - `on_profile_created_trial_subscription` assigns Trial plan (new, correct)
    - The conflict between them causes "Database error saving new user" on signup

  2. Changes
    - Drop old trigger `on_profile_created_subscription` on `profiles`
    - Drop old function `handle_new_profile_subscription()`
    - Recreate `handle_new_user_trial_subscription()` with explicit conflict target

  3. Security
    - No changes to RLS policies
    - Function remains SECURITY DEFINER owned by postgres
*/

-- Drop the old trigger that incorrectly assigns Mensal plan on signup
DROP TRIGGER IF EXISTS on_profile_created_subscription ON public.profiles;

-- Drop the old function
DROP FUNCTION IF EXISTS handle_new_profile_subscription();

-- Recreate the trial subscription function with explicit conflict target
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
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
