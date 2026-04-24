/*
  # Add delay_ms_max to campaigns

  ## Summary
  Adds a second delay boundary so the sending engine can pick a random wait time
  between delay_ms (minimum) and delay_ms_max (maximum) instead of a fixed value.

  ## Changes
  - `campaigns.delay_ms_max` (integer, default 40000): upper bound of the random
    interval in milliseconds. When NULL or equal to delay_ms the engine falls back
    to the fixed delay for backwards-compatibility with existing campaigns.

  ## Notes
  - Existing campaigns are unaffected; the Edge Function treats NULL delay_ms_max
    as "use delay_ms as a fixed value" (same behaviour as before).
  - Frontend enforces: delay_ms_max - delay_ms >= 15000 (15 s gap).
  - Backend enforces: minimum effective delay of 15 000 ms on each bound.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'campaigns' AND column_name = 'delay_ms_max'
  ) THEN
    ALTER TABLE campaigns ADD COLUMN delay_ms_max integer NOT NULL DEFAULT 40000;
  END IF;
END $$;
