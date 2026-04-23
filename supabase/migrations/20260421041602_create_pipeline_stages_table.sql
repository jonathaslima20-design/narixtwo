/*
  # Create pipeline_stages table for customizable pipeline names

  1. New Tables
    - `pipeline_stages`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references profiles)
      - `key` (text, internal identifier e.g. 'new', 'contact')
      - `label` (text, user-facing display name)
      - `color` (text, Tailwind CSS color class)
      - `position` (integer, display order)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `pipeline_stages` table
    - Users can read their own pipeline stages
    - Users can insert their own pipeline stages
    - Users can update their own pipeline stages
    - Users can delete their own pipeline stages

  3. Seed Function
    - Creates a function to seed default pipeline stages for a user
    - Trigger auto-seeds when a new profile is created

  4. Constraints
    - Unique constraint on (user_id, key) to prevent duplicate stage keys per user
    - Unique constraint on (user_id, position) to enforce ordering
*/

-- Create the pipeline_stages table
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  color text NOT NULL DEFAULT 'bg-gray-100 text-gray-700',
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, key),
  UNIQUE (user_id, position)
);

-- Enable RLS
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own pipeline stages"
  ON pipeline_stages FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own pipeline stages"
  ON pipeline_stages FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pipeline stages"
  ON pipeline_stages FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own pipeline stages"
  ON pipeline_stages FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to seed default stages for a given user
CREATE OR REPLACE FUNCTION seed_default_pipeline_stages(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO pipeline_stages (user_id, key, label, color, position)
  VALUES
    (p_user_id, 'new',       'Novo',        'bg-sky-100 text-sky-700',     0),
    (p_user_id, 'contact',   'Contato',     'bg-amber-100 text-amber-700', 1),
    (p_user_id, 'qualified', 'Qualificado', 'bg-emerald-100 text-emerald-700', 2),
    (p_user_id, 'proposal',  'Proposta',    'bg-orange-100 text-orange-700', 3),
    (p_user_id, 'closed',    'Fechado',     'bg-teal-100 text-teal-700',   4),
    (p_user_id, 'lost',      'Perdido',     'bg-red-100 text-red-700',     5)
  ON CONFLICT (user_id, key) DO NOTHING;
END;
$$;

-- Trigger function: auto-seed on new profile creation
CREATE OR REPLACE FUNCTION on_profile_created_seed_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM seed_default_pipeline_stages(NEW.id);
  RETURN NEW;
END;
$$;

-- Create the trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_seed_pipeline_stages'
  ) THEN
    CREATE TRIGGER trg_seed_pipeline_stages
      AFTER INSERT ON profiles
      FOR EACH ROW
      EXECUTE FUNCTION on_profile_created_seed_stages();
  END IF;
END $$;

-- Seed default stages for all existing users who don't have them yet
INSERT INTO pipeline_stages (user_id, key, label, color, position)
SELECT p.id, s.key, s.label, s.color, s.position
FROM profiles p
CROSS JOIN (
  VALUES
    ('new',       'Novo',        'bg-sky-100 text-sky-700',          0),
    ('contact',   'Contato',     'bg-amber-100 text-amber-700',     1),
    ('qualified', 'Qualificado', 'bg-emerald-100 text-emerald-700', 2),
    ('proposal',  'Proposta',    'bg-orange-100 text-orange-700',   3),
    ('closed',    'Fechado',     'bg-teal-100 text-teal-700',       4),
    ('lost',      'Perdido',     'bg-red-100 text-red-700',         5)
) AS s(key, label, color, position)
ON CONFLICT (user_id, key) DO NOTHING;

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_user_id ON pipeline_stages(user_id, position);
