import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  Plus,
  Pencil,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Infinity,
  Users,
  Send,
  Smartphone,
  FileText,
  Zap,
  Settings2,
} from 'lucide-react';
import { usePlans } from '../../lib/usePlans';
import { supabase } from '../../lib/supabase';
import { Plan } from '../../lib/types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';

type PlanForm = {
  name: string;
  slug: string;
  description: string;
  price_reais: string;
  billing_period: 'monthly' | 'yearly';
  max_leads: number;
  max_campaigns_per_month: number;
  max_recipients_per_campaign: number;
  max_whatsapp_instances: number;
  max_templates: number;
  max_automation_rules: number;
  max_ai_tokens_per_month: number;
  sort_order: number;
};

const EMPTY_FORM: PlanForm = {
  name: '',
  slug: '',
  description: '',
  price_reais: '',
  billing_period: 'monthly',
  max_leads: -1,
  max_campaigns_per_month: -1,
  max_recipients_per_campaign: -1,
  max_whatsapp_instances: 1,
  max_templates: -1,
  max_automation_rules: -1,
  max_ai_tokens_per_month: -1,
  sort_order: 0,
};

const LIMIT_FIELDS: { key: keyof PlanForm; label: string; icon: typeof Users }[] = [
  { key: 'max_leads', label: 'Leads', icon: Users },
  { key: 'max_campaigns_per_month', label: 'Campanhas / mês', icon: Send },
  { key: 'max_recipients_per_campaign', label: 'Destinatários / campanha', icon: Send },
  { key: 'max_whatsapp_instances', label: 'Instâncias WhatsApp', icon: Smartphone },
  { key: 'max_templates', label: 'Templates', icon: FileText },
  { key: 'max_automation_rules', label: 'Regras de automação', icon: Settings2 },
  { key: 'max_ai_tokens_per_month', label: 'Tokens IA / mês', icon: Zap },
];

function formatBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function PlanManagement() {
  const { plans, loading, createPlan, updatePlan, deletePlan, togglePlanActive } = usePlans();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [subscriberCounts, setSubscriberCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function loadCounts() {
      const { data } = await supabase
        .from('client_subscriptions')
        .select('plan_id');
      if (data) {
        const counts: Record<string, number> = {};
        data.forEach((s) => { counts[s.plan_id] = (counts[s.plan_id] || 0) + 1; });
        setSubscriberCounts(counts);
      }
    }
    loadCounts();
  }, [plans]);

  function openCreate() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, sort_order: plans.length + 1 });
    setModalOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      slug: plan.slug,
      description: plan.description,
      price_reais: (plan.price_cents / 100).toFixed(2).replace('.', ','),
      billing_period: plan.billing_period,
      max_leads: plan.max_leads,
      max_campaigns_per_month: plan.max_campaigns_per_month,
      max_recipients_per_campaign: plan.max_recipients_per_campaign,
      max_whatsapp_instances: plan.max_whatsapp_instances,
      max_templates: plan.max_templates,
      max_automation_rules: plan.max_automation_rules,
      max_ai_tokens_per_month: plan.max_ai_tokens_per_month,
      sort_order: plan.sort_order,
    });
    setModalOpen(true);
  }

  function parsePriceCents(reais: string): number {
    const cleaned = reais.replace(/[^\d,]/g, '').replace(',', '.');
    return Math.round(parseFloat(cleaned || '0') * 100);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        slug: form.slug || slugify(form.name),
        description: form.description,
        price_cents: parsePriceCents(form.price_reais),
        billing_period: form.billing_period,
        max_leads: form.max_leads,
        max_campaigns_per_month: form.max_campaigns_per_month,
        max_recipients_per_campaign: form.max_recipients_per_campaign,
        max_whatsapp_instances: form.max_whatsapp_instances,
        max_templates: form.max_templates,
        max_automation_rules: form.max_automation_rules,
        max_ai_tokens_per_month: form.max_ai_tokens_per_month,
        features: {},
        is_active: true,
        sort_order: form.sort_order,
      };
      if (editingId) {
        await updatePlan(editingId, payload);
      } else {
        await createPlan(payload);
      }
      setModalOpen(false);
    } catch {
      alert('Erro ao salvar plano. Verifique os dados e tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await deletePlan(confirmDeleteId);
      setConfirmDeleteId(null);
    } catch {
      alert('Não foi possível excluir. Verifique se não há clientes neste plano.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-900 rounded-2xl flex items-center justify-center">
                  <CreditCard size={18} className="text-white" />
                </div>
                Gestão de Planos
              </h1>
              <p className="text-sm text-gray-500 mt-1.5 ml-[52px]">
                {plans.length} {plans.length === 1 ? 'plano configurado' : 'planos configurados'}
              </p>
            </div>
            <Button onClick={openCreate} size="lg">
              <Plus size={16} />
              Novo Plano
            </Button>
          </div>

          {/* Plan cards */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-64 bg-white rounded-2xl border border-gray-100 animate-pulse" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <Card className="text-center py-16">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CreditCard size={28} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Nenhum plano cadastrado</h3>
              <p className="text-sm text-gray-500 mb-6">Crie seu primeiro plano para começar a gerenciar assinaturas.</p>
              <Button onClick={openCreate}>
                <Plus size={16} />
                Criar primeiro plano
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  subscriberCount={subscriberCounts[plan.id] || 0}
                  onEdit={() => openEdit(plan)}
                  onToggle={() => togglePlanActive(plan.id, !plan.is_active)}
                  onDelete={() => setConfirmDeleteId(plan.id)}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Create / Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar Plano' : 'Novo Plano'} maxWidth="lg">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nome do plano"
              placeholder="Ex: Mensal"
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({
                  ...f,
                  name,
                  slug: editingId ? f.slug : slugify(name),
                }));
              }}
            />
            <Input
              label="Slug (identificador)"
              placeholder="Ex: mensal"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </div>

          <Input
            label="Descrição"
            placeholder="Breve descrição do plano"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Preço (R$)"
              placeholder="49,00"
              value={form.price_reais}
              onChange={(e) => setForm((f) => ({ ...f, price_reais: e.target.value }))}
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Período</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, billing_period: 'monthly' }))}
                  className={`flex-1 py-2.5 rounded-2xl text-sm font-medium border transition-all ${
                    form.billing_period === 'monthly'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Mensal
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, billing_period: 'yearly' }))}
                  className={`flex-1 py-2.5 rounded-2xl text-sm font-medium border transition-all ${
                    form.billing_period === 'yearly'
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                  }`}
                >
                  Anual
                </button>
              </div>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">Limites do plano</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {LIMIT_FIELDS.map(({ key, label, icon: Icon }) => {
                const value = form[key] as number;
                const isUnlimited = value === -1;
                return (
                  <div key={key} className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5">
                    <Icon size={14} className="text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-600 flex-1 min-w-0 truncate">{label}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((f) => ({ ...f, [key]: isUnlimited ? 100 : -1 }))
                      }
                      className={`text-xs px-2 py-0.5 rounded-full font-medium transition-colors ${
                        isUnlimited
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                      }`}
                    >
                      {isUnlimited ? 'Ilimitado' : 'Limitar'}
                    </button>
                    {!isUnlimited && (
                      <input
                        type="number"
                        min={0}
                        value={value}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, [key]: parseInt(e.target.value) || 0 }))
                        }
                        className="w-20 px-2 py-1 text-xs border border-gray-200 rounded-lg text-right focus:outline-none focus:ring-1 focus:ring-gray-400"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Input
            label="Ordem de exibição"
            type="number"
            value={form.sort_order.toString()}
            onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
          />

          <div className="flex gap-3 pt-2">
            <Button variant="ghost" fullWidth onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              fullWidth
              loading={saving}
              onClick={handleSave}
              disabled={!form.name.trim()}
            >
              {editingId ? 'Salvar Alterações' : 'Criar Plano'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setConfirmDeleteId(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Excluir plano?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Este plano será removido permanentemente. Só é possível excluir planos sem clientes vinculados.
              </p>
              <div className="flex gap-3">
                <Button variant="ghost" fullWidth onClick={() => setConfirmDeleteId(null)}>
                  Cancelar
                </Button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {deleting ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlanCard({
  plan,
  subscriberCount,
  onEdit,
  onToggle,
  onDelete,
}: {
  plan: Plan;
  subscriberCount: number;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const periodLabel = plan.billing_period === 'monthly' ? '/mês' : '/ano';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
            <Badge variant={plan.is_active ? 'success' : 'neutral'}>
              {plan.is_active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          {plan.description && (
            <p className="text-xs text-gray-500 max-w-xs">{plan.description}</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900">{formatBRL(plan.price_cents)}</p>
          <p className="text-xs text-gray-400">{periodLabel}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-gray-50 rounded-xl">
        <Users size={13} className="text-gray-400" />
        <span className="text-xs text-gray-600">
          {subscriberCount} {subscriberCount === 1 ? 'cliente' : 'clientes'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-5">
        {LIMIT_FIELDS.slice(0, 4).map(({ key, label, icon: Icon }) => {
          const value = plan[key as keyof Plan] as number;
          return (
            <div key={key} className="flex items-center gap-1.5 text-xs text-gray-500">
              <Icon size={11} className="text-gray-400" />
              <span className="truncate">{label}:</span>
              {value === -1 ? (
                <Infinity size={11} className="text-emerald-500 shrink-0" />
              ) : (
                <span className="font-semibold text-gray-700">{value.toLocaleString()}</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2 pt-4 border-t border-gray-100">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <Pencil size={12} />
          Editar
        </button>
        <button
          onClick={onToggle}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            plan.is_active
              ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
              : 'text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
          }`}
        >
          {plan.is_active ? (
            <>
              <ToggleLeft size={12} />
              Desativar
            </>
          ) : (
            <>
              <ToggleRight size={12} />
              Ativar
            </>
          )}
        </button>
        {subscriberCount === 0 && (
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors ml-auto"
          >
            <Trash2 size={12} />
            Excluir
          </button>
        )}
      </div>
    </motion.div>
  );
}
