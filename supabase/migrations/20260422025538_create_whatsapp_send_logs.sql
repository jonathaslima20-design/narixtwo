/*
  # WhatsApp send telemetry

  1. New Tables
    - `whatsapp_send_logs`
      - Captures every stage of an outbound WhatsApp send so we can diagnose
        silent failures that never reach the existing `messages` / `link_preview_attempts`
        tables.
      - Fields: user_id, lead_id, stage (boot/auth_ok/lead_loaded/state_checked/
        evolution_called/finished/error), http_status, evolution_endpoint,
        request_payload (jsonb), evolution_response (jsonb), error_message,
        number_used, jid_used, phone_original, variant, duration_ms, meta (jsonb).
  2. Security
    - RLS enabled. Only service role writes (no insert policy for authenticated users).
    - Users can SELECT their own logs to power a debug view later.
  3. Housekeeping
    - Index on (user_id, created_at desc) for fast lookup.
    - Index on (lead_id, created_at desc).
    - No automatic purge here; a periodic cleanup job can remove rows older than 7 days.
*/

CREATE TABLE IF NOT EXISTS whatsapp_send_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid,
  stage text NOT NULL DEFAULT '',
  http_status integer DEFAULT 0,
  evolution_endpoint text DEFAULT '',
  request_payload jsonb DEFAULT '{}'::jsonb,
  evolution_response jsonb DEFAULT '{}'::jsonb,
  error_message text DEFAULT '',
  number_used text DEFAULT '',
  jid_used text DEFAULT '',
  phone_original text DEFAULT '',
  variant text DEFAULT '',
  duration_ms integer DEFAULT 0,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_send_logs_user_idx
  ON whatsapp_send_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS whatsapp_send_logs_lead_idx
  ON whatsapp_send_logs (lead_id, created_at DESC);

ALTER TABLE whatsapp_send_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own send logs"
  ON whatsapp_send_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
