export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'user' | 'admin';
  is_enabled: boolean;
  max_whatsapp_instances_override?: number | null;
  created_at: string;
  updated_at: string;
}

export interface AdminSetting {
  id: string;
  key: string;
  value: string;
  updated_at: string;
}

export type SendMode = 'manual' | 'auto' | 'approval';

export interface WhatsAppInstance {
  id: string;
  user_id: string;
  instance_name: string;
  display_name?: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  phone_number: string;
  qr_code: string;
  ai_prompt?: string;
  send_mode?: SendMode;
  auto_reply_enabled?: boolean;
  business_hours_start?: string;
  business_hours_end?: string;
  away_message?: string;
  qr_updated_at?: string | null;
  last_error?: string | null;
  last_history_sync_at?: string | null;
  history_sync_status?: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadTemperature = 'hot' | 'warm' | 'cold';
export type PipelineStage = string;
export type Sentiment = 'positive' | 'neutral' | 'negative';

export interface Lead {
  id: string;
  user_id: string;
  phone: string;
  name: string;
  email?: string;
  company?: string;
  role_title?: string;
  notes?: string;
  temperature: LeadTemperature;
  pipeline_stage?: PipelineStage;
  category?: string;
  score?: number;
  sentiment?: Sentiment;
  source?: string;
  intent?: string;
  last_message: string;
  message_count: number;
  ai_summary: string;
  tags: string[];
  unread_count?: number;
  last_activity_at?: string;
  last_seen_at?: string;
  is_favorite?: boolean;
  is_archived?: boolean;
  is_blocked?: boolean;
  whatsapp_jid?: string | null;
  profile_picture_url?: string;
  profile_picture_updated_at?: string;
  hydrated_at?: string | null;
  oldest_synced_at?: string | null;
  newest_synced_at?: string | null;
  has_more_history?: boolean;
  full_history_synced_at?: string | null;
  full_history_synced_through?: string | null;
  created_at: string;
  updated_at: string;
}

export type MessageDirection = 'in' | 'out';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  id: string;
  user_id: string;
  lead_id: string;
  direction: MessageDirection;
  content: string;
  media_url: string;
  media_type: string;
  whatsapp_message_id: string;
  status: MessageStatus;
  ai_generated: boolean;
  approved_by_user: boolean;
  audio_duration_seconds?: number;
  created_at: string;
}

export interface LeadNote {
  id: string;
  user_id: string;
  lead_id: string;
  body: string;
  created_at: string;
}

export interface LeadActivity {
  id: string;
  user_id: string;
  lead_id: string;
  action: string;
  meta: Record<string, unknown>;
  created_at: string;
}

export type TemplateMediaType = 'text' | 'image' | 'audio' | 'link';

export interface MessageTemplate {
  id: string;
  user_id: string;
  shortcut: string;
  title: string;
  body: string;
  media_type: TemplateMediaType;
  media_url: string | null;
  audio_duration_seconds: number | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduledFollowup {
  id: string;
  user_id: string;
  lead_id: string;
  due_at: string;
  note: string;
  status: 'pending' | 'done' | 'cancelled';
  created_at: string;
}

export interface AISuggestion {
  id: string;
  user_id: string;
  lead_id: string;
  content: string;
  status: 'pending' | 'approved' | 'rejected' | 'sent';
  created_at: string;
}

export interface AutomationRule {
  id: string;
  user_id: string;
  name: string;
  trigger: string;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface UsageLog {
  id: string;
  user_id: string;
  tokens_in: number;
  tokens_out: number;
  model: string;
  lead_phone: string;
  created_at: string;
}

export interface UsageByUser {
  user_id: string;
  email: string;
  full_name: string;
  total_tokens_in: number;
  total_tokens_out: number;
  total_requests: number;
}

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type CampaignMessageType = 'text' | 'image' | 'audio' | 'document';

export interface Campaign {
  id: string;
  user_id: string;
  name: string;
  status: CampaignStatus;
  message_type: CampaignMessageType;
  content: string;
  media_url: string;
  media_type: string;
  media_filename: string;
  caption: string;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  failed_count: number;
  delay_ms: number;
  send_window_start: string;
  send_window_end: string;
  filter_tags: string[];
  filter_category: string;
  exclude_recent_days: number;
  created_at: string;
  updated_at: string;
}

export type SubscriptionStatus = 'active' | 'trial' | 'cancelled' | 'past_due' | 'suspended';

export interface Plan {
  id: string;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  billing_period: 'monthly' | 'yearly';
  max_leads: number;
  max_campaigns_per_month: number;
  max_recipients_per_campaign: number;
  max_whatsapp_instances: number;
  max_templates: number;
  max_automation_rules: number;
  max_ai_tokens_per_month: number;
  max_sends: number;
  trial_duration_days: number;
  features: Record<string, boolean>;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ClientSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  started_at: string;
  expires_at: string | null;
  cancelled_at: string | null;
  send_count: number;
  notes: string;
  created_at: string;
  updated_at: string;
  plan?: Plan;
}

export type CampaignRecipientStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'skipped';

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  lead_id: string;
  phone: string;
  lead_name: string;
  status: CampaignRecipientStatus;
  whatsapp_message_id: string;
  error_message: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  created_at: string;
}
