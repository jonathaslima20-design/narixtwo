/*
  # Add category column to leads table

  1. Changes
    - Add `category` column (text, default 'cold') to leads table
    - Populate from existing `temperature` column for all leads
    - Add index on (user_id, category) for efficient filtering

  2. Why
    - Replaces the dual temperature + pipeline_stage system with a single
      unified category system that users can customize
    - 'cold' is the first default category, used for new incoming leads
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'category'
  ) THEN
    ALTER TABLE leads ADD COLUMN category text NOT NULL DEFAULT 'cold';
  END IF;
END $$;

-- Populate category from existing temperature values
UPDATE leads SET category = temperature
WHERE category = 'cold' AND temperature IN ('hot', 'warm', 'cold')
  AND temperature != 'cold';

-- Index for efficient category queries
CREATE INDEX IF NOT EXISTS idx_leads_user_category
  ON leads (user_id, category);
