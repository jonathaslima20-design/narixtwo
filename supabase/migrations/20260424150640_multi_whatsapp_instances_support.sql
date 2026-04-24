/*
  # Suporte a múltiplas instâncias de WhatsApp por usuário

  1. Alterações
    - Adiciona unique (user_id, instance_name) em whatsapp_instances para permitir múltiplas instâncias por usuário, evitando duplicatas com o mesmo nome.
    - Adiciona coluna `max_instances_override` em client_subscriptions (integer, nullable) permitindo que o administrador defina um limite específico por cliente, sobrepondo o limite do plano. NULL significa usar o limite do plano.
    - Adiciona coluna `label` em whatsapp_instances para o usuário nomear cada instância (ex: "Vendas", "Suporte").

  2. Segurança
    - Nenhuma alteração de RLS. Políticas existentes continuam válidas.

  3. Notas
    - Nenhum dado é destruído. Alterações são puramente aditivas.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.whatsapp_instances'::regclass
      AND conname = 'whatsapp_instances_user_instance_name_unique'
  ) THEN
    ALTER TABLE public.whatsapp_instances
      ADD CONSTRAINT whatsapp_instances_user_instance_name_unique
      UNIQUE (user_id, instance_name);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_instances'
      AND column_name = 'label'
  ) THEN
    ALTER TABLE public.whatsapp_instances ADD COLUMN label text DEFAULT '';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_subscriptions'
      AND column_name = 'max_instances_override'
  ) THEN
    ALTER TABLE public.client_subscriptions ADD COLUMN max_instances_override integer;
  END IF;
END $$;
