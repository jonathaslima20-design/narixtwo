/*
  # Bucket de mídia recebida pelo WhatsApp

  1. Novo Bucket
    - `lead-media` (privado): armazena imagens, vídeos, documentos e stickers recebidos/enviados via WhatsApp. URLs assinadas com 1 ano.

  2. Segurança
    - Políticas RLS no storage.objects garantindo que cada usuário só tenha acesso à sua pasta (primeiro segmento = user_id).
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('lead-media', 'lead-media', false, 31457280)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can read own lead media'
  ) THEN
    CREATE POLICY "Users can read own lead media"
      ON storage.objects FOR SELECT
      TO authenticated
      USING (bucket_id = 'lead-media' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can upload own lead media'
  ) THEN
    CREATE POLICY "Users can upload own lead media"
      ON storage.objects FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'lead-media' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'Users can delete own lead media'
  ) THEN
    CREATE POLICY "Users can delete own lead media"
      ON storage.objects FOR DELETE
      TO authenticated
      USING (bucket_id = 'lead-media' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;
