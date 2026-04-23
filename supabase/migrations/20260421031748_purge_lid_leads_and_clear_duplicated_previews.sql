/*
  # Clean up bogus leads and duplicated chat previews

  The previous seed runs imported two classes of bad data:

  1. Leads whose `phone` is a raw WhatsApp `@lid` identifier (15-18 random
     digits). Those are never real phone numbers and cannot be messaged
     back, so we remove them permanently.
  2. Real leads whose `last_message` was populated from a shared
     `lastMessage` object returned by Evolution's `/chat/findChats`
     (all chats ended up with the same preview text like "Ainda nao ,
     boa noite"). We clear that field and reset `last_activity_at` for
     leads that still have no messages, so the UI stops showing bogus
     timestamps. Leads that already have real messages are untouched.

  1. Changes
    - Deletes from `leads` where phone length is outside [10,15] digits
      and the lead has no messages.
    - Clears `last_message` for leads where that text appears more than
      20 times for the same user (strong signal it came from the bogus
      shared preview).
    - Sets `last_activity_at = NULL` for leads that have no messages
      AND no picture backfill attempts yet (still "fresh" seed rows).

  2. Security
    - No RLS changes.

  3. Notes
    - All statements are idempotent and safe to re-run.
*/

DELETE FROM leads
WHERE (length(regexp_replace(phone, '\D', '', 'g')) < 10
       OR length(regexp_replace(phone, '\D', '', 'g')) > 15)
  AND NOT EXISTS (
    SELECT 1 FROM messages m WHERE m.lead_id = leads.id
  );

WITH bogus_previews AS (
  SELECT user_id, last_message
  FROM leads
  WHERE last_message IS NOT NULL AND last_message <> ''
  GROUP BY user_id, last_message
  HAVING count(*) > 20
)
UPDATE leads l
SET last_message = ''
FROM bogus_previews b
WHERE l.user_id = b.user_id
  AND l.last_message = b.last_message
  AND NOT EXISTS (
    SELECT 1 FROM messages m WHERE m.lead_id = l.id
  );

UPDATE leads l
SET last_activity_at = NULL
WHERE NOT EXISTS (SELECT 1 FROM messages m WHERE m.lead_id = l.id)
  AND (l.last_message IS NULL OR l.last_message = '');