/*
  # Remove assistente de IA

  1. Remocao de tabelas
    - Dropa `ai_provider_keys`, `ai_provider_config` (sistema de chaves/provedores)
    - Dropa `ai_action_logs`, `ai_messages`, `ai_conversations` (historico do chat do assistente)

  2. Contexto
    - Todo o assistente de IA foi removido do produto
    - As edge functions `ai-assistant` e `ai-keys-admin` nao existem mais no codigo
    - Tabela `ai_suggestions` nao e tocada (feature separada, linkada a leads)

  3. Notas
    - Uso de CASCADE para remover policies, indices e foreign keys dependentes
*/

DROP TABLE IF EXISTS public.ai_action_logs CASCADE;
DROP TABLE IF EXISTS public.ai_messages CASCADE;
DROP TABLE IF EXISTS public.ai_conversations CASCADE;
DROP TABLE IF EXISTS public.ai_provider_keys CASCADE;
DROP TABLE IF EXISTS public.ai_provider_config CASCADE;
