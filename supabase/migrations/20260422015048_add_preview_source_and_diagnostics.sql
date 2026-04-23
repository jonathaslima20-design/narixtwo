/*
  # Melhorias no pipeline de pré-visualização de links

  1. Alterações em `link_preview_cache`
    - Adiciona coluna `source` (text) para rastrear origem do preview
      (valores possíveis: 'og', 'microlink', 'manual', 'none')

  2. Nova tabela `link_preview_attempts`
    - Registra cada tentativa de envio com preview para diagnóstico
    - Campos: `user_id`, `url`, `scraper_result` (jsonb), `evolution_payload` (jsonb),
      `evolution_response` (jsonb), `variant_used` (text), `success` (boolean),
      `created_at`
    - RLS habilitada: usuário autenticado só lê os próprios registros;
      apenas service role grava.

  3. Limpeza
    - Remove entradas existentes do `link_preview_cache` sem título e sem imagem
      (previews quebrados que ficaram cacheados) para forçar rebuscar.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'link_preview_cache' AND column_name = 'source'
  ) THEN
    ALTER TABLE public.link_preview_cache ADD COLUMN source text DEFAULT 'og';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.link_preview_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  url text NOT NULL DEFAULT '',
  scraper_result jsonb DEFAULT '{}'::jsonb,
  evolution_payload jsonb DEFAULT '{}'::jsonb,
  evolution_response jsonb DEFAULT '{}'::jsonb,
  variant_used text DEFAULT '',
  success boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.link_preview_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'link_preview_attempts'
      AND policyname = 'Users read own preview attempts'
  ) THEN
    CREATE POLICY "Users read own preview attempts"
      ON public.link_preview_attempts
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_link_preview_attempts_user_created
  ON public.link_preview_attempts (user_id, created_at DESC);

DELETE FROM public.link_preview_cache
WHERE COALESCE(title, '') = '' AND COALESCE(image, '') = '';
