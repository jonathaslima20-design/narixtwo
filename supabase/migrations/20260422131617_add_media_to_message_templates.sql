/*
  # Extend message_templates for rich media (Quick Replies)

  1. Modified Tables
    - `message_templates`
      - `media_type` (text, default 'text') -- one of: text, image, audio, link
      - `media_url` (text, nullable) -- storage path for image/audio attachments
      - `audio_duration_seconds` (integer, nullable) -- duration for audio quick replies

  2. Storage
    - Create private bucket `quick-reply-media` for storing quick reply image and audio files
    - RLS policies on storage.objects limiting access to user's own folder `{user_id}/...`

  3. Notes
    - Existing text-only templates continue to work unchanged (media_type defaults to 'text')
    - Files stored under path: `{user_id}/{uuid}.{ext}`
*/

-- Add media columns to message_templates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'message_templates' AND column_name = 'media_type'
  ) THEN
    ALTER TABLE message_templates ADD COLUMN media_type text NOT NULL DEFAULT 'text';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'message_templates' AND column_name = 'media_url'
  ) THEN
    ALTER TABLE message_templates ADD COLUMN media_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'message_templates' AND column_name = 'audio_duration_seconds'
  ) THEN
    ALTER TABLE message_templates ADD COLUMN audio_duration_seconds integer;
  END IF;
END $$;

-- Create private bucket for quick reply media
INSERT INTO storage.buckets (id, name, public)
VALUES ('quick-reply-media', 'quick-reply-media', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Users can upload own quick reply media'
  ) THEN
    CREATE POLICY "Users can upload own quick reply media"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (
        bucket_id = 'quick-reply-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Users can read own quick reply media'
  ) THEN
    CREATE POLICY "Users can read own quick reply media"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (
        bucket_id = 'quick-reply-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Users can delete own quick reply media'
  ) THEN
    CREATE POLICY "Users can delete own quick reply media"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (
        bucket_id = 'quick-reply-media'
        AND (storage.foldername(name))[1] = auth.uid()::text
      );
  END IF;
END $$;
