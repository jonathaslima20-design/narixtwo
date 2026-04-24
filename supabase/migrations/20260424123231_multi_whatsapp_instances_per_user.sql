/*
  # Suporte a múltiplas instâncias de WhatsApp por usuário

  ## Contexto
  Até agora o sistema permitia apenas uma instância de WhatsApp por usuário
  devido ao constraint UNIQUE em `whatsapp_instances.user_id`. Esta migração
  permite que cada usuário possua múltiplas instâncias, respeitando um limite
  configurado pelo administrador (individualmente por cliente) ou, como
  fallback, o limite definido no plano do usuário.

  ## Mudanças

  1. Tabela `profiles`
     - Nova coluna opcional `max_whatsapp_instances_override` (integer).
       Quando preenchida, sobrescreve o `max_whatsapp_instances` do plano
       do usuário. Quando NULL, o sistema utiliza o limite do plano.

  2. Tabela `whatsapp_instances`
     - Remove constraint UNIQUE(user_id) para permitir múltiplas linhas.
     - Nova coluna opcional `display_name` (text) para apelido amigável.
     - Adiciona política DELETE (usuários podem excluir suas próprias
       instâncias; admins podem excluir qualquer uma).
     - Adiciona política de UPDATE/DELETE para admins (suporte e moderação).
     - Adiciona índice em `user_id` para consultas rápidas.

  3. Função + trigger `enforce_whatsapp_instance_limit()`
     - Ao inserir uma nova instância, valida se o usuário ainda está abaixo
       do limite permitido. Calcula o limite com a precedência:
       profiles.max_whatsapp_instances_override -> plan.max_whatsapp_instances
       -> 1 (fallback conservador quando não houver plano).

  ## Notas importantes

  1. Dados existentes permanecem intocados — nenhuma instância é removida.
  2. Trigger apenas valida INSERT; atualizações e deleções seguem livres.
  3. A função é SECURITY DEFINER com search_path fixo para evitar bypass.
*/

-- 1. Adiciona coluna de override no profile
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'max_whatsapp_instances_override'
  ) THEN
    ALTER TABLE public.profiles
      ADD COLUMN max_whatsapp_instances_override integer;
  END IF;
END $$;

-- 2. Remove constraint UNIQUE em whatsapp_instances.user_id (se existir)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'whatsapp_instances_user_id_key'
      AND conrelid = 'public.whatsapp_instances'::regclass
  ) THEN
    ALTER TABLE public.whatsapp_instances
      DROP CONSTRAINT whatsapp_instances_user_id_key;
  END IF;
END $$;

-- 3. Adiciona coluna display_name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'whatsapp_instances'
      AND column_name = 'display_name'
  ) THEN
    ALTER TABLE public.whatsapp_instances
      ADD COLUMN display_name text NOT NULL DEFAULT '';
  END IF;
END $$;

-- 4. Índice em user_id para lookups rápidos
CREATE INDEX IF NOT EXISTS whatsapp_instances_user_id_idx
  ON public.whatsapp_instances (user_id);

-- 5. Políticas RLS adicionais
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_instances'
      AND policyname = 'Users can delete own instances'
  ) THEN
    CREATE POLICY "Users can delete own instances"
      ON public.whatsapp_instances
      FOR DELETE
      TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_instances'
      AND policyname = 'Admins can update all instances'
  ) THEN
    CREATE POLICY "Admins can update all instances"
      ON public.whatsapp_instances
      FOR UPDATE
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      ));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_instances'
      AND policyname = 'Admins can delete all instances'
  ) THEN
    CREATE POLICY "Admins can delete all instances"
      ON public.whatsapp_instances
      FOR DELETE
      TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
      ));
  END IF;
END $$;

-- 6. Função que resolve o limite efetivo de um usuário
CREATE OR REPLACE FUNCTION public.resolve_whatsapp_instance_limit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  override_value integer;
  plan_value integer;
BEGIN
  SELECT max_whatsapp_instances_override INTO override_value
  FROM public.profiles
  WHERE id = p_user_id;

  IF override_value IS NOT NULL THEN
    RETURN override_value;
  END IF;

  SELECT p.max_whatsapp_instances INTO plan_value
  FROM public.client_subscriptions cs
  JOIN public.plans p ON p.id = cs.plan_id
  WHERE cs.user_id = p_user_id
    AND cs.status IN ('active', 'trial')
  ORDER BY cs.started_at DESC
  LIMIT 1;

  IF plan_value IS NOT NULL THEN
    RETURN plan_value;
  END IF;

  RETURN 1;
END;
$$;

-- 7. Trigger enforcer
CREATE OR REPLACE FUNCTION public.enforce_whatsapp_instance_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count integer;
  effective_limit integer;
BEGIN
  SELECT COUNT(*) INTO current_count
  FROM public.whatsapp_instances
  WHERE user_id = NEW.user_id;

  effective_limit := public.resolve_whatsapp_instance_limit(NEW.user_id);

  IF effective_limit IS NOT NULL AND effective_limit >= 0 AND current_count >= effective_limit THEN
    RAISE EXCEPTION 'Limite de instâncias de WhatsApp atingido (%).', effective_limit
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_whatsapp_instance_limit_trigger
  ON public.whatsapp_instances;

CREATE TRIGGER enforce_whatsapp_instance_limit_trigger
  BEFORE INSERT ON public.whatsapp_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_whatsapp_instance_limit();
