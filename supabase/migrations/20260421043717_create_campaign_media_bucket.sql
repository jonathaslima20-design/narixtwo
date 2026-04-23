/*
  # Create Campaign Media Storage Bucket

  1. Storage
    - Creates `campaign-media` bucket for campaign image, audio, and document uploads
    - Path convention: {userId}/{campaignId}/{uuid}.{ext}
    - Max file size: 16 MB

  2. Security
    - Authenticated users can upload to their own folder
    - Authenticated users can read their own files
    - Authenticated users can delete their own files
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('campaign-media', 'campaign-media', false, 16777216)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload campaign media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'campaign-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read own campaign media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'campaign-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own campaign media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'campaign-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );