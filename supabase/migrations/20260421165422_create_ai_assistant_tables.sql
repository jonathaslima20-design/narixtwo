/*
  # AI Assistant Tables

  Creates persistence for the new in-app AI assistant that acts as an operational
  copilot (no longer qualifies leads). Stores conversations, messages, and an
  action log for auditability.

  1. New Tables
    - `ai_conversations` (id, user_id, title, created_at, updated_at) - one chat
      thread per user; multiple allowed for history.
    - `ai_messages` (id, conversation_id, user_id, role, content, tool_name,
      tool_args, tool_result, created_at) - individual messages including tool
      calls and tool results.
    - `ai_action_logs` (id, user_id, conversation_id, tool_name, input, output,
      status, error, created_at) - audit trail of every side-effectful action
      the assistant executes.

  2. Security
    - Enable RLS on all three tables.
    - Restrict every policy to `authenticated` and filter by `auth.uid()` so
      users only see and mutate their own data.
    - Separate policies for select / insert / update / delete.

  3. Notes
    - `role` supports 'user', 'assistant', 'tool', 'system'.
    - `tool_args` and `tool_result` are jsonb for flexibility.
    - Indexes added on (user_id, updated_at desc) and (conversation_id, created_at).
*/

CREATE TABLE IF NOT EXISTS ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Nova conversa',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_user_updated_idx
  ON ai_conversations (user_id, updated_at DESC);

ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own conversations"
  ON ai_conversations FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own conversations"
  ON ai_conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own conversations"
  ON ai_conversations FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own conversations"
  ON ai_conversations FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'assistant', 'tool', 'system')),
  content text NOT NULL DEFAULT '',
  tool_name text NOT NULL DEFAULT '',
  tool_args jsonb NOT NULL DEFAULT '{}'::jsonb,
  tool_result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_messages_conversation_created_idx
  ON ai_messages (conversation_id, created_at);

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own ai messages"
  ON ai_messages FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own ai messages"
  ON ai_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own ai messages"
  ON ai_messages FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own ai messages"
  ON ai_messages FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS ai_action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES ai_conversations(id) ON DELETE SET NULL,
  tool_name text NOT NULL DEFAULT '',
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'success'
    CHECK (status IN ('success', 'error')),
  error text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_action_logs_user_created_idx
  ON ai_action_logs (user_id, created_at DESC);

ALTER TABLE ai_action_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own ai action logs"
  ON ai_action_logs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own ai action logs"
  ON ai_action_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
