/*
  # Link preview para mensagens WhatsApp

  1. Alteracoes em `messages`
    - Adiciona colunas `preview_url`, `preview_title`, `preview_description`,
      `preview_image`, `preview_site_name` para armazenar metadados OG de links
    - Todas com default `''` para nao quebrar registros existentes

  2. Nova tabela `link_preview_cache`
    - Guarda resultado de scrape OG por URL para evitar refetch
    - `url` como PK; `title`, `description`, `image`, `site_name`, `error`
    - `fetched_at` para permitir expiracao logica por TTL
    - RLS habilitada. Apenas service role escreve/le; nenhum client tem acesso direto.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'preview_url'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN preview_url text DEFAULT '';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'preview_title'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN preview_title text DEFAULT '';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'preview_description'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN preview_description text DEFAULT '';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'preview_image'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN preview_image text DEFAULT '';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'preview_site_name'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN preview_site_name text DEFAULT '';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.link_preview_cache (
  url text PRIMARY KEY,
  title text DEFAULT '',
  description text DEFAULT '',
  image text DEFAULT '',
  site_name text DEFAULT '',
  error text DEFAULT '',
  fetched_at timestamptz DEFAULT now()
);

ALTER TABLE public.link_preview_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'link_preview_cache'
      AND policyname = 'No client access to preview cache'
  ) THEN
    CREATE POLICY "No client access to preview cache"
      ON public.link_preview_cache
      FOR SELECT
      TO authenticated
      USING (false);
  END IF;
END $$;
