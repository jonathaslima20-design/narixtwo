/*
  # Rotulagem por instância em leads, mensagens e campanhas

  1. Alterações
    - `leads.instance_id` (uuid, nullable, FK para whatsapp_instances): qual instância capturou/recebeu este lead.
    - `messages.instance_id` (uuid, nullable, FK para whatsapp_instances): qual instância enviou/recebeu a mensagem.
    - `campaigns.instance_ids` (uuid[], default '{}'): lista de instâncias selecionadas para o disparo. Vazio significa usar a primeira instância conectada.
    - `campaign_recipients.instance_id` (uuid, nullable, FK): qual instância efetivamente enviou este destinatário.
    - Índices auxiliares para filtros rápidos por instância.

  2. Segurança
    - Nenhuma alteração nas políticas RLS existentes.

  3. Notas
    - Todas as colunas são aditivas e nullables. Nenhum dado existente é alterado.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='leads' AND column_name='instance_id'
  ) THEN
    ALTER TABLE public.leads ADD COLUMN instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_leads_instance_id ON public.leads(instance_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='messages' AND column_name='instance_id'
  ) THEN
    ALTER TABLE public.messages ADD COLUMN instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_messages_instance_id ON public.messages(instance_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='campaigns' AND column_name='instance_ids'
  ) THEN
    ALTER TABLE public.campaigns ADD COLUMN instance_ids uuid[] DEFAULT '{}'::uuid[];
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='campaign_recipients' AND column_name='instance_id'
  ) THEN
    ALTER TABLE public.campaign_recipients ADD COLUMN instance_id uuid REFERENCES public.whatsapp_instances(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_campaign_recipients_instance_id ON public.campaign_recipients(instance_id);
  END IF;
END $$;
