/*
  # Relax pipeline_stages position constraint for dynamic stage management

  1. Changes
    - Remove the UNIQUE constraint on (user_id, position) to allow
      adding, deleting, and reordering pipeline stages freely
    - The (user_id, key) unique constraint is kept to prevent duplicate keys

  2. Why
    - The strict unique constraint on position prevents batch reordering
      and makes it impossible to insert/remove stages without complex
      position shuffling within a single transaction
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'pipeline_stages'
      AND constraint_type = 'UNIQUE'
      AND constraint_name LIKE '%position%'
  ) THEN
    EXECUTE 'ALTER TABLE pipeline_stages DROP CONSTRAINT ' ||
      (SELECT constraint_name FROM information_schema.table_constraints
       WHERE table_name = 'pipeline_stages'
         AND constraint_type = 'UNIQUE'
         AND constraint_name LIKE '%position%'
       LIMIT 1);
  END IF;
END $$;
