/*
  # Add filter_category to campaigns table

  1. Changes
    - Add `filter_category` column (text, default '') to campaigns table
    - Used to filter campaign recipients by the new unified category system

  2. Why
    - Replaces the separate filter_temperature and filter_pipeline_stage fields
      with a single category-based filter
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'filter_category'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN filter_category text NOT NULL DEFAULT '';
  END IF;
END $$;
