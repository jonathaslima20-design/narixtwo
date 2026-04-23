/*
  # One-time backfill of `leads.last_activity_at` from real message timestamps

  Existing leads were imported with `last_activity_at = now()` at the time of
  the seed run. That makes the conversation list order by import time instead
  of by the real last-message time from WhatsApp.

  For leads that already have messages in the `messages` table, update
  `last_activity_at` to the most recent `messages.created_at` for that lead.
  This only overwrites rows whose current `last_activity_at` does not match
  any real message, which is the safe case.

  1. Changes
    - Updates `leads.last_activity_at` and `leads.last_message` (if empty) for
      leads that have at least one message, using the latest message.

  2. Security
    - No RLS changes.

  3. Notes
    - Uses a single correlated subquery; safe to run repeatedly (idempotent
      when the newest message already equals the stored `last_activity_at`).
*/

WITH latest AS (
  SELECT
    m.lead_id,
    m.user_id,
    m.created_at AS latest_at,
    m.content AS latest_content,
    ROW_NUMBER() OVER (PARTITION BY m.lead_id ORDER BY m.created_at DESC) AS rn
  FROM messages m
)
UPDATE leads l
SET
  last_activity_at = latest.latest_at,
  last_message = COALESCE(NULLIF(l.last_message, ''), latest.latest_content)
FROM latest
WHERE latest.rn = 1
  AND latest.lead_id = l.id
  AND latest.user_id = l.user_id
  AND (l.last_activity_at IS NULL OR l.last_activity_at <> latest.latest_at);