/*
  # Add pipeline_stages to realtime publication

  1. Changes
    - Add `pipeline_stages` to the `supabase_realtime` publication
    - Set `REPLICA IDENTITY FULL` for complete row data in UPDATE/DELETE payloads

  2. Why
    - The LeadManagement and PipelineSettings pages subscribe to pipeline_stages
      changes via realtime. Without being in the publication, those subscriptions
      silently receive no events.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='pipeline_stages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pipeline_stages';
  END IF;
END $$;

ALTER TABLE public.pipeline_stages REPLICA IDENTITY FULL;
