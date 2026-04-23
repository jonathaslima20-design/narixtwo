/*
  # Create lead_categories table

  1. New Tables
    - `lead_categories`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to profiles)
      - `key` (text) - internal identifier (e.g. 'cold', 'warm')
      - `label` (text) - display name (e.g. 'Frio', 'Morno')
      - `color` (text) - Tailwind CSS color classes
      - `icon` (text) - Lucide icon name (e.g. 'Snowflake', 'Flame')
      - `position` (integer) - display order
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
    - UNIQUE constraint on (user_id, key)

  2. Security
    - Enable RLS on `lead_categories`
    - Policies for authenticated users to manage their own categories

  3. Seed
    - Function to seed default categories for a user
    - Trigger to auto-seed on profile creation
    - Backfill for existing users

  4. Realtime
    - Add table to supabase_realtime publication
*/

-- Create the table
CREATE TABLE IF NOT EXISTS lead_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  color text NOT NULL DEFAULT 'bg-gray-100 text-gray-700',
  icon text NOT NULL DEFAULT 'CircleDot',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, key)
);

-- Enable RLS
ALTER TABLE lead_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own categories"
  ON lead_categories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categories"
  ON lead_categories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories"
  ON lead_categories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories"
  ON lead_categories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Seed function for default categories
CREATE OR REPLACE FUNCTION seed_default_lead_categories(p_user_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
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

-- Trigger to seed categories for new profiles
CREATE OR REPLACE FUNCTION trigger_seed_lead_categories()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM seed_default_lead_categories(NEW.id);
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_profile_created_seed_lead_categories'
  ) THEN
    CREATE TRIGGER on_profile_created_seed_lead_categories
      AFTER INSERT ON profiles
      FOR EACH ROW
      EXECUTE FUNCTION trigger_seed_lead_categories();
  END IF;
END $$;

-- Backfill: seed default categories for all existing users who don't have them yet
INSERT INTO lead_categories (user_id, key, label, color, icon, position)
SELECT p.id, v.key, v.label, v.color, v.icon, v.position
FROM profiles p
CROSS JOIN (
  VALUES
    ('cold',   'Frio',    'bg-sky-100 text-sky-700',     'Snowflake',   0),
    ('warm',   'Morno',   'bg-amber-100 text-amber-700', 'Thermometer', 1),
    ('hot',    'Quente',  'bg-red-100 text-red-700',     'Flame',       2),
    ('closed', 'Fechado', 'bg-teal-100 text-teal-700',   'Check',       3)
) AS v(key, label, color, icon, position)
ON CONFLICT (user_id, key) DO NOTHING;

-- Add to realtime publication
ALTER TABLE lead_categories REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'lead_categories'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE lead_categories;
  END IF;
END $$;

-- Index for efficient queries
CREATE INDEX IF NOT EXISTS idx_lead_categories_user_position
  ON lead_categories (user_id, position);
