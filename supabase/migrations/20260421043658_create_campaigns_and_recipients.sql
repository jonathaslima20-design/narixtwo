/*
  # Create Campaigns System for Bulk WhatsApp Messaging

  1. New Tables
    - `campaigns`
      - `id` (uuid, primary key) - Unique campaign identifier
      - `user_id` (uuid, FK to profiles) - Campaign owner
      - `name` (text) - Campaign display name
      - `status` (text) - draft/scheduled/sending/paused/completed/failed/cancelled
      - `message_type` (text) - text/image/audio/document
      - `content` (text) - Message body text
      - `media_url` (text) - Storage path or external URL for media
      - `media_type` (text) - MIME type (image/png, audio/ogg, etc.)
      - `media_filename` (text) - Original uploaded file name
      - `caption` (text) - Caption for images/documents
      - `scheduled_at` (timestamptz) - When to send (null = immediate)
      - `started_at` (timestamptz) - When sending actually began
      - `completed_at` (timestamptz) - When all sends finished
      - `cancelled_at` (timestamptz) - When campaign was cancelled
      - `total_recipients` (integer) - Number of recipients queued
      - `sent_count` (integer) - Successfully sent messages
      - `delivered_count` (integer) - Delivery confirmations received
      - `read_count` (integer) - Read receipts received
      - `failed_count` (integer) - Failed sends
      - `delay_ms` (integer) - Delay between messages in ms (default 3000)
      - `send_window_start` (text) - Business hours start (HH:MM)
      - `send_window_end` (text) - Business hours end (HH:MM)
      - `filter_tags` (text[]) - Audience filter: lead tags
      - `filter_temperature` (text) - Audience filter: hot/warm/cold or empty for all
      - `filter_pipeline_stage` (text) - Audience filter: pipeline stage or empty for all
      - `exclude_recent_days` (integer) - Skip leads who received campaign in last N days
      - `created_at`, `updated_at` (timestamptz)

    - `campaign_recipients`
      - `id` (uuid, primary key) - Unique recipient record
      - `campaign_id` (uuid, FK to campaigns) - Parent campaign
      - `lead_id` (uuid, FK to leads) - Target lead
      - `phone` (text) - Snapshot of lead phone at queue time
      - `lead_name` (text) - Snapshot of lead name at queue time
      - `status` (text) - pending/sending/sent/delivered/read/failed/skipped
      - `whatsapp_message_id` (text) - Evolution API message ID
      - `error_message` (text) - Error details for failed sends
      - `sent_at` (timestamptz) - When message was sent
      - `delivered_at` (timestamptz) - When delivery confirmed
      - `read_at` (timestamptz) - When read receipt received
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on both tables
    - Policies restrict all operations to authenticated users accessing only their own data
    - campaign_recipients policies use a subquery to verify campaign ownership

  3. Indexes
    - campaigns(user_id, status) for filtered listing
    - campaign_recipients(campaign_id, status) for progress tracking
    - campaign_recipients(whatsapp_message_id) for webhook delivery updates
*/

-- Create campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'paused', 'completed', 'failed', 'cancelled')),
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'document')),
  content text NOT NULL DEFAULT '',
  media_url text NOT NULL DEFAULT '',
  media_type text NOT NULL DEFAULT '',
  media_filename text NOT NULL DEFAULT '',
  caption text NOT NULL DEFAULT '',
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  read_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  delay_ms integer NOT NULL DEFAULT 3000,
  send_window_start text NOT NULL DEFAULT '',
  send_window_end text NOT NULL DEFAULT '',
  filter_tags text[] NOT NULL DEFAULT '{}',
  filter_temperature text NOT NULL DEFAULT '',
  filter_pipeline_stage text NOT NULL DEFAULT '',
  exclude_recent_days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create campaign_recipients table
CREATE TABLE IF NOT EXISTS campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  phone text NOT NULL DEFAULT '',
  lead_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped')),
  whatsapp_message_id text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_campaigns_user_status ON campaigns(user_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_scheduled ON campaigns(status, scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status ON campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_wa_id ON campaign_recipients(whatsapp_message_id) WHERE whatsapp_message_id != '';

-- Enable RLS
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;

-- Campaigns RLS policies
CREATE POLICY "Users can view own campaigns"
  ON campaigns FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own campaigns"
  ON campaigns FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own campaigns"
  ON campaigns FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own campaigns"
  ON campaigns FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Campaign recipients RLS policies (verify ownership via campaign)
CREATE POLICY "Users can view own campaign recipients"
  ON campaign_recipients FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_recipients.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create own campaign recipients"
  ON campaign_recipients FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_recipients.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own campaign recipients"
  ON campaign_recipients FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_recipients.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_recipients.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own campaign recipients"
  ON campaign_recipients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM campaigns
      WHERE campaigns.id = campaign_recipients.campaign_id
      AND campaigns.user_id = auth.uid()
    )
  );

-- Add realtime for live progress updates
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE campaign_recipients;