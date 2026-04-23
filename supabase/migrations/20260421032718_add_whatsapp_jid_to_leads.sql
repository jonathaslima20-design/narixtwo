/*
  # Add WhatsApp JID as canonical chat identifier

  WhatsApp now commonly uses `@lid` JIDs for contacts that hide their
  phone number. Those are legitimate chat targets but cannot be stored
  as a real phone. We add `whatsapp_jid` as the authoritative chat
  address and backfill it from existing phones.

  1. Changes
    - New column `leads.whatsapp_jid text` (nullable — non-WhatsApp
      leads may not have one).
    - Unique index `leads_user_jid_unique` on `(user_id, whatsapp_jid)`
      when JID is not null, so the same contact is never duplicated
      regardless of how the phone was normalized.
    - Backfill: for every existing lead whose `phone` is purely digits
      (10-15 digits), set `whatsapp_jid = phone || '@s.whatsapp.net'`.

  2. Security
    - No RLS changes. Column inherits existing leads RLS.

  3. Notes
    - Existing `leads_user_phone_unique` stays, so legacy code paths
      that look up by phone continue to work.
*/

ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_jid text;

CREATE UNIQUE INDEX IF NOT EXISTS leads_user_jid_unique
  ON leads(user_id, whatsapp_jid)
  WHERE whatsapp_jid IS NOT NULL;

UPDATE leads
SET whatsapp_jid = phone || '@s.whatsapp.net'
WHERE whatsapp_jid IS NULL
  AND phone ~ '^[0-9]{10,15}$';
