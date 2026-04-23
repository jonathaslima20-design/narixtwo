import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  Smartphone,
  Mail,
  Calendar,
  CreditCard,
  UserCheck,
  X,
  RefreshCw,
  Ban,
  CalendarPlus,
  Save,
  ChevronDown,
  Send,
  Power,
  RotateCcw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Plan, Profile, SubscriptionStatus } from '../../lib/types';
import { useClientSubscriptions } from '../../lib/useClientSubscriptions';
import { usePlans } from '../../lib/usePlans';

interface ClientRow extends Profile {
  instance_status?: string;
  instance_phone?: string;
  instance_send_mode?: string;
  lead_count: number;
  campaign_count: number;
  template_count: number;
  subscription_id?: string;
  plan_id?: string;
  plan_name?: string;
  plan_slug?: string;
  plan_max_sends?: number;
  sub_status?: SubscriptionStatus;
  sub_started_at?: string;
  sub_expires_at?: string | null;
  sub_cancelled_at?: string | null;
  sub_notes?: string;
  send_count: number;
}

const SUB_STATUS_MAP: Record<SubscriptionStatus, { label: string; variant: 'success' | 'warning' | 'neutral' | 'error' | 'info' }> = {
  active: { label: 'Ativo', variant: 'success' },
  trial: { label: 'Trial', variant: 'info' },
  cancelled: { label: 'Cancelado', variant: 'neutral' },
  past_due: { label: 'Inadimplente', variant: 'warning' },
  suspended: { label: 'Suspenso', variant: 'error' },
};

const WA_STATUS_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'neutral' }> = {
  connected: { label: 'Conectado', variant: 'success' },
  connecting: { label: 'Conectando', variant: 'warning' },
  disconnected: { label: 'Desconectado', variant: 'neutral' },
  error: { label: 'Erro', variant: 'neutral' },
};

function formatBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function ClientManagement() {
  const { plans } = usePlans();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPlan, setFilterPlan] = useState('all');
  const [filterSubStatus, setFilterSubStatus] = useState('all');
  const [filterWaStatus, setFilterWaStatus] = useState('all');
  const [selectedClient, setSelectedClient] = useState<ClientRow | null>(null);

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    setLoading(true);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'user')
      .order('created_at', { ascending: false });

    if (!profiles) { setLoading(false); return; }

    const enriched = await Promise.all(
      profiles.map(async (p) => {
        const [instRes, leadRes, campaignRes, templateRes, subRes] = await Promise.all([
          supabase.from('whatsapp_instances').select('status, phone_number, send_mode').eq('user_id', p.id).maybeSingle(),
          supabase.from('leads').select('id', { count: 'exact' }).eq('user_id', p.id),
          supabase.from('campaigns').select('id', { count: 'exact' }).eq('user_id', p.id),
          supabase.from('message_templates').select('id', { count: 'exact' }).eq('user_id', p.id),
          supabase.from('client_subscriptions').select('*, plans(*)').eq('user_id', p.id).maybeSingle(),
        ]);

        const sub = subRes.data;
        const plan = sub?.plans as unknown as Plan | null;

        return {
          ...p,
          instance_status: instRes.data?.status || 'disconnected',
          instance_phone: instRes.data?.phone_number || '',
          instance_send_mode: instRes.data?.send_mode || 'manual',
          lead_count: leadRes.count || 0,
          campaign_count: campaignRes.count || 0,
          template_count: templateRes.count || 0,
          subscription_id: sub?.id,
          plan_id: sub?.plan_id,
          plan_name: plan?.name || 'Sem plano',
          plan_slug: plan?.slug,
          plan_max_sends: plan?.max_sends ?? -1,
          sub_status: sub?.status as SubscriptionStatus | undefined,
          sub_started_at: sub?.started_at,
          sub_expires_at: sub?.expires_at,
          sub_cancelled_at: sub?.cancelled_at,
          sub_notes: sub?.notes || '',
          send_count: sub?.send_count ?? 0,
        } as ClientRow;
      }),
    );
    setClients(enriched);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      if (search) {
        const q = search.toLowerCase();
        if (!c.email.toLowerCase().includes(q) && !c.full_name?.toLowerCase().includes(q)) return false;
      }
      if (filterPlan !== 'all' && c.plan_slug !== filterPlan) return false;
      if (filterSubStatus !== 'all' && c.sub_status !== filterSubStatus) return false;
      if (filterWaStatus !== 'all' && (c.instance_status || 'disconnected') !== filterWaStatus) return false;
      return true;
    });
  }, [clients, search, filterPlan, filterSubStatus, filterWaStatus]);

  const stats = useMemo(() => {
    const active = clients.filter((c) => c.sub_status === 'active').length;
    const byPlan: Record<string, number> = {};
    clients.forEach((c) => {
      const key = c.plan_name || 'Sem plano';
      byPlan[key] = (byPlan[key] || 0) + 1;
    });
    return { total: clients.length, active, byPlan };
  }, [clients]);

  function handleClientUpdated(updatedClient: ClientRow) {
    setClients((prev) => prev.map((c) => (c.id === updatedClient.id ? updatedClient : c)));
    setSelectedClient(updatedClient);
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-900 rounded-2xl flex items-center justify-center">
                <Users size={18} className="text-white" />
              </div>
              Gestao de Clientes
            </h1>
            <p className="text-sm text-gray-500 mt-1.5 ml-[52px]">
              {clients.length} clientes cadastrados
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Card>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
              <p className="text-xs text-gray-500 mt-0.5">Total de Clientes</p>
            </Card>
            <Card>
              <p className="text-2xl font-bold text-emerald-600">{stats.active}</p>
              <p className="text-xs text-gray-500 mt-0.5">Assinaturas Ativas</p>
            </Card>
            {Object.entries(stats.byPlan).map(([planName, count]) => (
              <Card key={planName}>
                <p className="text-2xl font-bold text-gray-900">{count}</p>
                <p className="text-xs text-gray-500 mt-0.5">Plano {planName}</p>
              </Card>
            ))}
          </div>

          <div className="flex flex-wrap items-stretch gap-3 mb-6">
            <div className="w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Search size={15} />}
              />
            </div>
            <FilterSelect
              value={filterPlan}
              onChange={setFilterPlan}
              options={[
                { value: 'all', label: 'Todos os planos' },
                ...plans.map((p) => ({ value: p.slug, label: p.name })),
              ]}
            />
            <FilterSelect
              value={filterSubStatus}
              onChange={setFilterSubStatus}
              options={[
                { value: 'all', label: 'Todos os status' },
                { value: 'active', label: 'Ativo' },
                { value: 'trial', label: 'Trial' },
                { value: 'cancelled', label: 'Cancelado' },
                { value: 'past_due', label: 'Inadimplente' },
                { value: 'suspended', label: 'Suspenso' },
              ]}
            />
            <FilterSelect
              value={filterWaStatus}
              onChange={setFilterWaStatus}
              options={[
                { value: 'all', label: 'WhatsApp' },
                { value: 'connected', label: 'Conectado' },
                { value: 'disconnected', label: 'Desconectado' },
              ]}
            />
          </div>

          {loading ? (
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-20 bg-white rounded-2xl border border-gray-100 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="text-center py-16">
              <Users size={36} className="text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Nenhum cliente encontrado.</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {filtered.map((client) => (
                <ClientCard
                  key={client.id}
                  client={client}
                  onClick={() => setSelectedClient(client)}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {selectedClient && (
        <ClientDetailModal
          client={selectedClient}
          plans={plans}
          onClose={() => setSelectedClient(null)}
          onUpdated={handleClientUpdated}
        />
      )}
    </div>
  );
}

/* ======================== Sub-components ======================== */

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-gray-200 rounded-2xl bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}

function ClientCard({ client, onClick }: { client: ClientRow; onClick: () => void }) {
  const waInfo = WA_STATUS_MAP[client.instance_status || 'disconnected'] || WA_STATUS_MAP.disconnected;
  const subInfo = SUB_STATUS_MAP[client.sub_status || 'active'] || SUB_STATUS_MAP.active;
  const planBadgeColor = client.plan_slug === 'anual'
    ? 'bg-amber-50 text-amber-700 border border-amber-200'
    : client.plan_slug === 'trial'
      ? 'bg-sky-50 text-sky-600 border border-sky-200'
      : 'bg-sky-50 text-sky-700 border border-sky-200';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className={`bg-white border rounded-2xl px-5 py-4 flex items-center gap-4 cursor-pointer hover:shadow-sm transition-shadow ${client.is_enabled === false ? 'border-red-200 opacity-60' : 'border-gray-100'}`}
    >
      <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
        {(client.full_name || client.email).charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold text-gray-900 truncate">
            {client.full_name || 'Sem nome'}
          </p>
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${planBadgeColor}`}>
            {client.plan_name}
          </span>
          <Badge variant={subInfo.variant} size="sm">{subInfo.label}</Badge>
          {client.is_enabled === false && (
            <Badge variant="error" size="sm">Desativado</Badge>
          )}
        </div>
        <p className="text-xs text-gray-400 flex items-center gap-1">
          <Mail size={11} />
          {client.email}
        </p>
      </div>

      <div className="flex items-center gap-6 shrink-0">
        <div className="text-center hidden sm:block">
          <p className="text-sm font-bold text-gray-900">{client.send_count}</p>
          <p className="text-xs text-gray-400">Envios</p>
        </div>
        <div className="text-center hidden sm:block">
          <p className="text-sm font-bold text-gray-900">{client.lead_count}</p>
          <p className="text-xs text-gray-400">Leads</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Smartphone size={13} className="text-gray-400" />
          <Badge variant={waInfo.variant}>{waInfo.label}</Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Calendar size={13} className="text-gray-400" />
          <span className="text-xs text-gray-500">
            {formatDate(client.created_at)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function ClientDetailModal({
  client,
  plans,
  onClose,
  onUpdated,
}: {
  client: ClientRow;
  plans: Plan[];
  onClose: () => void;
  onUpdated: (c: ClientRow) => void;
}) {
  const {
    updateSubscriptionPlan,
    cancelSubscription,
    reactivateSubscription,
    suspendSubscription,
    extendExpiry,
    updateNotes,
  } = useClientSubscriptions();

  const [changingPlan, setChangingPlan] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(client.plan_id || '');
  const [notes, setNotes] = useState(client.sub_notes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [expiryDate, setExpiryDate] = useState(
    client.sub_expires_at ? client.sub_expires_at.slice(0, 10) : '',
  );
  const [savingExpiry, setSavingExpiry] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [editSendCount, setEditSendCount] = useState(String(client.send_count));
  const [savingSendCount, setSavingSendCount] = useState(false);

  const currentPlan = plans.find((p) => p.id === client.plan_id);
  const subInfo = SUB_STATUS_MAP[client.sub_status || 'active'] || SUB_STATUS_MAP.active;
  const waInfo = WA_STATUS_MAP[client.instance_status || 'disconnected'] || WA_STATUS_MAP.disconnected;

  async function handleChangePlan() {
    if (!selectedPlanId || selectedPlanId === client.plan_id) return;
    setSavingPlan(true);
    try {
      await updateSubscriptionPlan(client.id, selectedPlanId);
      const newPlan = plans.find((p) => p.id === selectedPlanId);
      onUpdated({
        ...client,
        plan_id: selectedPlanId,
        plan_name: newPlan?.name || 'Sem plano',
        plan_slug: newPlan?.slug,
        plan_max_sends: newPlan?.max_sends ?? -1,
        sub_status: 'active',
        sub_started_at: new Date().toISOString(),
        sub_cancelled_at: null,
      });
      setChangingPlan(false);
    } catch {
      alert('Erro ao alterar plano.');
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleStatusAction(action: 'cancel' | 'reactivate' | 'suspend') {
    setActionLoading(true);
    try {
      if (action === 'cancel') {
        await cancelSubscription(client.id);
        onUpdated({ ...client, sub_status: 'cancelled', sub_cancelled_at: new Date().toISOString() });
      } else if (action === 'reactivate') {
        await reactivateSubscription(client.id);
        onUpdated({ ...client, sub_status: 'active', sub_cancelled_at: null });
      } else {
        await suspendSubscription(client.id);
        onUpdated({ ...client, sub_status: 'suspended' });
      }
    } catch {
      alert('Erro ao atualizar status.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveExpiry() {
    if (!expiryDate) return;
    setSavingExpiry(true);
    try {
      const expiresAt = new Date(expiryDate + 'T23:59:59Z').toISOString();
      await extendExpiry(client.id, expiresAt);
      onUpdated({ ...client, sub_expires_at: expiresAt });
    } catch {
      alert('Erro ao estender vencimento.');
    } finally {
      setSavingExpiry(false);
    }
  }

  async function handleSaveNotes() {
    setSavingNotes(true);
    try {
      await updateNotes(client.id, notes);
      onUpdated({ ...client, sub_notes: notes });
    } catch {
      alert('Erro ao salvar notas.');
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleToggleEnabled() {
    setTogglingEnabled(true);
    try {
      const newVal = !client.is_enabled;
      const { error } = await supabase
        .from('profiles')
        .update({ is_enabled: newVal, updated_at: new Date().toISOString() })
        .eq('id', client.id);
      if (error) throw error;
      onUpdated({ ...client, is_enabled: newVal });
    } catch {
      alert('Erro ao alterar status da conta.');
    } finally {
      setTogglingEnabled(false);
    }
  }

  async function handleSaveSendCount() {
    const val = parseInt(editSendCount, 10);
    if (isNaN(val) || val < 0) return;
    setSavingSendCount(true);
    try {
      const { error } = await supabase
        .from('client_subscriptions')
        .update({ send_count: val, updated_at: new Date().toISOString() })
        .eq('user_id', client.id);
      if (error) throw error;
      onUpdated({ ...client, send_count: val });
    } catch {
      alert('Erro ao salvar contador.');
    } finally {
      setSavingSendCount(false);
    }
  }

  async function handleResetSendCount() {
    setSavingSendCount(true);
    try {
      const { error } = await supabase
        .from('client_subscriptions')
        .update({ send_count: 0, updated_at: new Date().toISOString() })
        .eq('user_id', client.id);
      if (error) throw error;
      setEditSendCount('0');
      onUpdated({ ...client, send_count: 0 });
    } catch {
      alert('Erro ao resetar contador.');
    } finally {
      setSavingSendCount(false);
    }
  }

  function usageBar(used: number, limit: number) {
    if (limit === -1) {
      return (
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">{used.toLocaleString()}</span>
          <span className="text-xs text-gray-400">/ Ilimitado</span>
        </div>
      );
    }
    const pct = limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0;
    const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
    return (
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-gray-700">{used.toLocaleString()}</span>
          <span className="text-xs text-gray-400">/ {limit.toLocaleString()}</span>
        </div>
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto z-10"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-6 py-5 border-b border-gray-100 rounded-t-2xl">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center text-lg font-bold text-gray-600">
                {(client.full_name || client.email).charAt(0).toUpperCase()}
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  {client.full_name || 'Sem nome'}
                  {client.is_enabled === false && <Badge variant="error" size="sm">Desativado</Badge>}
                </h2>
                <p className="text-sm text-gray-500">{client.email}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Account status */}
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Power size={14} className="text-gray-400" />
                Status da Conta
              </h3>
              <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    Conta {client.is_enabled !== false ? 'Ativa' : 'Desativada'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {client.is_enabled !== false
                      ? 'O usuario pode acessar o sistema normalmente.'
                      : 'O usuario esta impedido de acessar o sistema.'}
                  </p>
                </div>
                <button
                  onClick={handleToggleEnabled}
                  disabled={togglingEnabled}
                  className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors disabled:opacity-50 ${
                    client.is_enabled !== false
                      ? 'bg-red-50 text-red-600 hover:bg-red-100'
                      : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                  }`}
                >
                  {client.is_enabled !== false ? 'Desativar' : 'Ativar'}
                </button>
              </div>
            </section>

            {/* Subscription section */}
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <CreditCard size={14} className="text-gray-400" />
                Assinatura Atual
              </h3>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-gray-900">{client.plan_name}</span>
                      <Badge variant={subInfo.variant}>{subInfo.label}</Badge>
                    </div>
                    {currentPlan && (
                      <p className="text-sm text-gray-500">
                        {formatBRL(currentPlan.price_cents)}{currentPlan.billing_period === 'monthly' ? '/mes' : '/ano'}
                      </p>
                    )}
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <p>Inicio: {formatDate(client.sub_started_at)}</p>
                    {client.sub_expires_at && <p>Expira: {formatDate(client.sub_expires_at)}</p>}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setChangingPlan(!changingPlan)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-100 transition-colors"
                  >
                    <RefreshCw size={12} />
                    Alterar Plano
                  </button>
                  {client.sub_status === 'active' && (
                    <>
                      <button
                        onClick={() => handleStatusAction('suspend')}
                        disabled={actionLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-50"
                      >
                        <Ban size={12} />
                        Suspender
                      </button>
                      <button
                        onClick={() => handleStatusAction('cancel')}
                        disabled={actionLoading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
                      >
                        <X size={12} />
                        Cancelar
                      </button>
                    </>
                  )}
                  {(client.sub_status === 'cancelled' || client.sub_status === 'suspended') && (
                    <button
                      onClick={() => handleStatusAction('reactivate')}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw size={12} />
                      Reativar
                    </button>
                  )}
                </div>

                {changingPlan && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(e.target.value)}
                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                      >
                        <option value="">Selecione um plano</option>
                        {plans.filter((p) => p.is_active).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} - {formatBRL(p.price_cents)}/{p.billing_period === 'monthly' ? 'mes' : 'ano'}
                          </option>
                        ))}
                      </select>
                      <Button
                        size="sm"
                        loading={savingPlan}
                        onClick={handleChangePlan}
                        disabled={!selectedPlanId || selectedPlanId === client.plan_id}
                      >
                        Confirmar
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Extend expiry */}
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <CalendarPlus size={14} className="text-gray-400" />
                Vencimento
              </h3>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="flex-1 px-4 py-2.5 text-sm border border-gray-200 rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                />
                <Button size="sm" loading={savingExpiry} onClick={handleSaveExpiry} disabled={!expiryDate}>
                  <CalendarPlus size={14} />
                  Definir
                </Button>
              </div>
              {client.sub_expires_at && (
                <p className="text-xs text-gray-400 mt-1.5">Expira atualmente em: {formatDate(client.sub_expires_at)}</p>
              )}
            </section>

            {/* Send count */}
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Send size={14} className="text-gray-400" />
                Contador de Envios
              </h3>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-600">Envios realizados:</span>
                  <span className="text-sm font-bold text-gray-900">{client.send_count}</span>
                  {client.plan_max_sends !== undefined && client.plan_max_sends !== -1 && (
                    <span className="text-xs text-gray-400">/ {client.plan_max_sends}</span>
                  )}
                  {(client.plan_max_sends === undefined || client.plan_max_sends === -1) && (
                    <span className="text-xs text-gray-400">/ Ilimitado</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    value={editSendCount}
                    onChange={(e) => setEditSendCount(e.target.value)}
                    className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  />
                  <Button size="sm" loading={savingSendCount} onClick={handleSaveSendCount}>
                    <Save size={12} />
                    Salvar
                  </Button>
                  <button
                    onClick={handleResetSendCount}
                    disabled={savingSendCount}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-amber-600 bg-amber-50 hover:bg-amber-100 transition-colors disabled:opacity-50"
                  >
                    <RotateCcw size={12} />
                    Resetar
                  </button>
                </div>
              </div>
            </section>

            {/* Usage & Limits */}
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <UserCheck size={14} className="text-gray-400" />
                Uso e Limites
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1.5">Leads</p>
                  {usageBar(client.lead_count, currentPlan?.max_leads ?? -1)}
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1.5">Campanhas</p>
                  {usageBar(client.campaign_count, currentPlan?.max_campaigns_per_month ?? -1)}
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1.5">Templates</p>
                  {usageBar(client.template_count, currentPlan?.max_templates ?? -1)}
                </div>
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1.5">WhatsApp</p>
                  {usageBar(client.instance_status === 'connected' ? 1 : 0, currentPlan?.max_whatsapp_instances ?? 1)}
                </div>
              </div>
            </section>

            {/* WhatsApp section */}
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Smartphone size={14} className="text-gray-400" />
                WhatsApp
              </h3>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-4">
                  <Badge variant={waInfo.variant}>{waInfo.label}</Badge>
                  {client.instance_phone && (
                    <span className="text-sm text-gray-700">{client.instance_phone}</span>
                  )}
                  <span className="text-xs text-gray-400 capitalize">
                    Modo: {client.instance_send_mode || 'manual'}
                  </span>
                </div>
              </div>
            </section>

            {/* Admin notes */}
            <section>
              <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Save size={14} className="text-gray-400" />
                Notas do Administrador
              </h3>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Adicione notas sobre este cliente..."
                className="w-full px-4 py-3 text-sm border border-gray-200 rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 resize-none placeholder:text-gray-400"
              />
              <div className="flex justify-end mt-2">
                <Button size="sm" loading={savingNotes} onClick={handleSaveNotes}>
                  <Save size={14} />
                  Salvar notas
                </Button>
              </div>
            </section>

            {/* Account info */}
            <section className="pt-4 border-t border-gray-100">
              <div className="flex items-center gap-6 text-xs text-gray-400">
                <span>ID: {client.id.slice(0, 8)}...</span>
                <span>Cadastrado em: {formatDate(client.created_at)}</span>
              </div>
            </section>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
