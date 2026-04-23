/*
  # Purge chatless leads

  Removes leads that were imported from the Evolution contacts list (the
  phone book) but have never exchanged a real message with the account
  owner. After this, the leads list mirrors the WhatsApp "chats" tab.

  1. New function
    - `purge_chatless_leads()` — deletes every lead of the calling user
      that has zero rows in `messages`. Returns the number of removed
      rows. Runs with the caller's privileges; uses `auth.uid()` so each
      user only affects their own data.

  2. Security
    - Function is `SECURITY INVOKER` so existing RLS on leads/messages
      applies; only callable by authenticated users.
    - Grants EXECUTE to the `authenticated` role only.
*/

CREATE OR REPLACE FUNCTION public.purge_chatless_leads()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  removed integer := 0;
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  WITH victims AS (
    SELECT l.id
    FROM leads l
    WHERE l.user_id = uid
      AND NOT EXISTS (
        SELECT 1 FROM messages m WHERE m.lead_id = l.id AND m.user_id = uid
      )
  ),
  deleted AS (
    DELETE FROM leads
    WHERE id IN (SELECT id FROM victims)
    RETURNING id
  )
  SELECT count(*) INTO removed FROM deleted;

  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_chatless_leads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_chatless_leads() TO authenticated;