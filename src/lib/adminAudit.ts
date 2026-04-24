import { supabase } from './supabase';

export interface AdminAuditLog {
  id: string;
  admin_id: string | null;
  admin_email: string;
  target_user_id: string | null;
  target_label: string;
  action: string;
  description: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface LogAdminActionInput {
  action: string;
  description: string;
  targetUserId?: string | null;
  targetLabel?: string;
  metadata?: Record<string, unknown>;
}

export async function logAdminAction(input: LogAdminActionInput): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const admin = session.user;
  if (!admin) return;

  await supabase.from('admin_audit_logs').insert({
    admin_id: admin.id,
    admin_email: admin.email || '',
    target_user_id: input.targetUserId ?? null,
    target_label: input.targetLabel ?? '',
    action: input.action,
    description: input.description,
    metadata: input.metadata ?? {},
  });
}

export const ACTION_LABELS: Record<string, string> = {
  'client.suspend': 'Suspender cliente',
  'client.reactivate': 'Reativar cliente',
  'client.cancel': 'Cancelar assinatura',
  'client.enable': 'Ativar conta',
  'client.disable': 'Desativar conta',
  'client.plan_change': 'Alterar plano',
  'client.extend_expiry': 'Estender vencimento',
  'client.reset_sends': 'Resetar contador de envios',
  'client.edit_sends': 'Editar contador de envios',
  'client.update_notes': 'Atualizar notas',
  'client.instance_limit': 'Alterar limite de instâncias',
  'client.bulk_suspend': 'Suspensão em lote',
  'client.bulk_reactivate': 'Reativação em lote',
  'client.export_csv': 'Exportar clientes (CSV)',
  'plan.create': 'Criar plano',
  'plan.update': 'Atualizar plano',
  'plan.duplicate': 'Duplicar plano',
  'plan.delete': 'Excluir plano',
  'plan.toggle': 'Ativar/desativar plano',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action;
}
