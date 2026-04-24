/*
  # Create admin_audit_logs table

  1. New Tables
    - `admin_audit_logs`
      - `id` (uuid, primary key)
      - `admin_id` (uuid) - profile id of the admin who performed the action
      - `admin_email` (text) - email snapshot for easier display/auditing
      - `target_user_id` (uuid, nullable) - target profile id when action concerns a client
      - `target_label` (text, nullable) - human-friendly label (email, plan name, etc.)
      - `action` (text) - short code like 'plan.duplicate', 'client.suspend', etc.
      - `description` (text) - readable description
      - `metadata` (jsonb) - structured payload with before/after details
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on `admin_audit_logs`
    - Admins can read all rows
    - Admins can insert rows where `admin_id = auth.uid()`
    - No update/delete policies (audit trail is immutable)

  3. Notes
    - Indexed on `admin_id`, `target_user_id`, `created_at desc` for fast filtering
*/

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  admin_email text NOT NULL DEFAULT '',
  target_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  target_label text DEFAULT '',
  action text NOT NULL,
  description text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_id_idx ON admin_audit_logs (admin_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_user_id_idx ON admin_audit_logs (target_user_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_created_at_idx ON admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_action_idx ON admin_audit_logs (action);

ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read audit logs"
  ON admin_audit_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert audit logs"
  ON admin_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    admin_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
