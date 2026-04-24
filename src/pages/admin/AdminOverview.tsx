import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users,
  Smartphone,
  TrendingUp,
  Activity,
  CreditCard,
  DollarSign,
  ChevronDown,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  AlertTriangle,
  CheckCircle2,
  WifiOff,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';
import { Plan } from '../../lib/types';

interface Stats {
  totalUsers: number;
  activeInstances: number;
  totalLeads: number;
  newUsers: number;
  prevNewUsers: number;
  newLeads: number;
  prevNewLeads: number;
  prevActiveInstances: number;
  prevTotalUsers: number;
}

interface PlanDist {
  plan_name: string;
  plan_slug: string;
  price_cents: number;
  billing_period: string;
  count: number;
}

interface HealthStat {
  connected: number;
  disconnected: number;
  failedSends: number;
  totalInstances: number;
}

const PERIOD_OPTIONS = [
  { value: '7d', label: '7 dias', days: 7 },
  { value: '30d', label: '30 dias', days: 30 },
  { value: '90d', label: '90 dias', days: 90 },
];

function formatBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function pctChange(now: number, prev: number): { label: string; direction: 'up' | 'down' | 'flat' } {
  if (prev === 0 && now === 0) return { label: '0%', direction: 'flat' };
  if (prev === 0) return { label: '+100%', direction: 'up' };
  const diff = ((now - prev) / prev) * 100;
  if (Math.abs(diff) < 0.5) return { label: '0%', direction: 'flat' };
  return {
    label: `${diff > 0 ? '+' : ''}${diff.toFixed(0)}%`,
    direction: diff > 0 ? 'up' : 'down',
  };
}

export function AdminOverview() {
  const [period, setPeriod] = useState('30d');
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    activeInstances: 0,
    totalLeads: 0,
    newUsers: 0,
    prevNewUsers: 0,
    newLeads: 0,
    prevNewLeads: 0,
    prevActiveInstances: 0,
    prevTotalUsers: 0,
  });
  const [planDist, setPlanDist] = useState<PlanDist[]>([]);
  const [recentLogs, setRecentLogs] = useState<{ id: string; email: string; tokens_in: number; tokens_out: number; created_at: string }[]>([]);
  const [health, setHealth] = useState<HealthStat>({ connected: 0, disconnected: 0, failedSends: 0, totalInstances: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const days = PERIOD_OPTIONS.find((p) => p.value === period)?.days || 30;
      const now = new Date();
      const currentStart = new Date(now.getTime() - days * 24 * 3600 * 1000).toISOString();
      const previousStart = new Date(now.getTime() - 2 * days * 24 * 3600 * 1000).toISOString();

      const [
        usersRes,
        instancesAllRes,
        instancesConnectedRes,
        leadsRes,
        logsRes,
        plansRes,
        subsRes,
        newUsersRes,
        prevNewUsersRes,
        newLeadsRes,
        prevNewLeadsRes,
        failedSendsRes,
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user'),
        supabase.from('whatsapp_instances').select('status', { count: 'exact' }),
        supabase.from('whatsapp_instances').select('id', { count: 'exact', head: true }).eq('status', 'connected'),
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('usage_logs').select('tokens_in, tokens_out, created_at, user_id, profiles(email)').order('created_at', { ascending: false }).limit(10),
        supabase.from('plans').select('*').order('sort_order'),
        supabase.from('client_subscriptions').select('plan_id, status').eq('status', 'active'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', currentStart),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user').gte('created_at', previousStart).lt('created_at', currentStart),
        supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', currentStart),
        supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', previousStart).lt('created_at', currentStart),
        supabase.from('whatsapp_send_logs').select('id', { count: 'exact', head: true }).not('error_message', 'is', null).gte('created_at', currentStart),
      ]);

      const totalInstances = instancesAllRes.count || 0;
      const connected = instancesConnectedRes.count || 0;

      setStats({
        totalUsers: usersRes.count || 0,
        activeInstances: connected,
        totalLeads: leadsRes.count || 0,
        newUsers: newUsersRes.count || 0,
        prevNewUsers: prevNewUsersRes.count || 0,
        newLeads: newLeadsRes.count || 0,
        prevNewLeads: prevNewLeadsRes.count || 0,
        prevActiveInstances: connected,
        prevTotalUsers: usersRes.count || 0,
      });

      setHealth({
        connected,
        disconnected: Math.max(totalInstances - connected, 0),
        failedSends: failedSendsRes.count || 0,
        totalInstances,
      });

      const planMap = new Map<string, Plan>();
      (plansRes.data || []).forEach((p) => planMap.set(p.id, p as Plan));

      const countByPlan: Record<string, number> = {};
      (subsRes.data || []).forEach((s) => {
        countByPlan[s.plan_id] = (countByPlan[s.plan_id] || 0) + 1;
      });

      const dist: PlanDist[] = [];
      planMap.forEach((plan, planId) => {
        dist.push({
          plan_name: plan.name,
          plan_slug: plan.slug,
          price_cents: plan.price_cents,
          billing_period: plan.billing_period,
          count: countByPlan[planId] || 0,
        });
      });
      setPlanDist(dist);

      setRecentLogs(
        (logsRes.data || []).map((l) => ({
          id: l.user_id,
          email: (l.profiles as unknown as { email: string })?.email || 'N/A',
          tokens_in: l.tokens_in,
          tokens_out: l.tokens_out,
          created_at: l.created_at,
        })),
      );

      setLoading(false);
    }
    load();
  }, [period]);

  const totalMRR = useMemo(
    () =>
      planDist.reduce((acc, p) => {
        const monthlyValue = p.billing_period === 'yearly'
          ? Math.round(p.price_cents / 12)
          : p.price_cents;
        return acc + monthlyValue * p.count;
      }, 0),
    [planDist],
  );

  const totalSubscribers = planDist.reduce((acc, p) => acc + p.count, 0);
  const maxPlanCount = Math.max(...planDist.map((p) => p.count), 1);

  const usersDelta = pctChange(stats.newUsers, stats.prevNewUsers);
  const leadsDelta = pctChange(stats.newLeads, stats.prevNewLeads);

  const statCards = [
    {
      label: 'Clientes Ativos',
      value: stats.totalUsers,
      sub: `${stats.newUsers} novos no período`,
      delta: usersDelta,
      icon: Users,
      color: 'text-sky-500',
      bg: 'bg-sky-50',
    },
    {
      label: 'WhatsApp Conectados',
      value: stats.activeInstances,
      sub: `${health.totalInstances} instâncias no total`,
      delta: { label: '', direction: 'flat' as const },
      icon: Smartphone,
      color: 'text-emerald-500',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Leads no Período',
      value: stats.newLeads,
      sub: `${stats.totalLeads.toLocaleString('pt-BR')} no total`,
      delta: leadsDelta,
      icon: TrendingUp,
      color: 'text-amber-500',
      bg: 'bg-amber-50',
    },
    {
      label: 'MRR Estimado',
      value: formatBRL(totalMRR),
      sub: `${totalSubscribers} assinantes ativos`,
      delta: { label: '', direction: 'flat' as const },
      icon: DollarSign,
      color: 'text-teal-500',
      bg: 'bg-teal-50',
    },
  ];

  const PLAN_COLORS: Record<string, string> = {
    mensal: 'bg-sky-500',
    anual: 'bg-amber-500',
  };

  const healthItems = [
    {
      label: 'WhatsApp Conectados',
      value: health.connected,
      total: health.totalInstances,
      icon: CheckCircle2,
      tone: 'emerald',
    },
    {
      label: 'WhatsApp Desconectados',
      value: health.disconnected,
      total: health.totalInstances,
      icon: WifiOff,
      tone: health.disconnected > 0 ? 'amber' : 'emerald',
    },
    {
      label: 'Envios com Falha',
      value: health.failedSends,
      total: 0,
      icon: AlertTriangle,
      tone: health.failedSends > 0 ? 'red' : 'emerald',
    },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Visão Geral</h1>
            <p className="text-sm text-gray-500 mt-1">Monitoramento global da plataforma BrainLead.</p>
          </div>
          <PeriodSelect value={period} onChange={setPeriod} />
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {statCards.map((card) => (
            <Card key={card.label}>
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center`}>
                  <card.icon size={18} className={card.color} />
                </div>
                {card.delta.label && <DeltaBadge direction={card.delta.direction} label={card.delta.label} />}
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {loading ? <span className="w-10 h-6 bg-gray-100 rounded animate-pulse inline-block" /> : card.value}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
              {card.sub && <p className="text-xs text-gray-400 mt-1.5">{card.sub}</p>}
            </Card>
          ))}
        </div>

        {/* Health panel */}
        <div className="mb-8">
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <Activity size={16} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Saúde do Sistema</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {healthItems.map((h) => {
                const toneClasses = {
                  emerald: 'text-emerald-600 bg-emerald-50',
                  amber: 'text-amber-600 bg-amber-50',
                  red: 'text-red-600 bg-red-50',
                } as const;
                return (
                  <div key={h.label} className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toneClasses[h.tone as keyof typeof toneClasses]}`}>
                      <h.icon size={18} />
                    </div>
                    <div>
                      <p className="text-lg font-bold text-gray-900">{h.value}</p>
                      <p className="text-xs text-gray-500">{h.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Plan distribution */}
        <div className="mb-8">
          <Card>
            <div className="flex items-center gap-2 mb-5">
              <CreditCard size={16} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Distribuição por Plano</h2>
              <span className="ml-auto text-xs text-gray-400">
                {totalSubscribers} {totalSubscribers === 1 ? 'assinante ativo' : 'assinantes ativos'}
              </span>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => (
                  <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : planDist.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum plano configurado.</p>
            ) : (
              <div className="space-y-4">
                {planDist.map((p) => {
                  const barWidth = maxPlanCount > 0 ? Math.max((p.count / maxPlanCount) * 100, 4) : 4;
                  const barColor = PLAN_COLORS[p.plan_slug] || 'bg-gray-400';
                  const monthlyEquiv = p.billing_period === 'yearly'
                    ? formatBRL(Math.round(p.price_cents / 12))
                    : formatBRL(p.price_cents);
                  const planMRR = (p.billing_period === 'yearly' ? Math.round(p.price_cents / 12) : p.price_cents) * p.count;

                  return (
                    <div key={p.plan_slug}>
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{p.plan_name}</span>
                          <span className="text-xs text-gray-400">
                            {formatBRL(p.price_cents)}/{p.billing_period === 'monthly' ? 'mês' : 'ano'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">
                            {p.count} {p.count === 1 ? 'cliente' : 'clientes'}
                          </span>
                          <span className="text-xs font-medium text-gray-700">
                            {monthlyEquiv}/mês equiv.
                          </span>
                          <span className="text-xs font-semibold text-emerald-600">
                            {formatBRL(planMRR)}
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden">
                        <motion.div
                          className={`h-full rounded-full ${barColor}`}
                          initial={{ width: 0 }}
                          animate={{ width: `${barWidth}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Recent AI activity */}
        <div>
          <Card>
            <div className="flex items-center gap-2 mb-4">
              <Activity size={16} className="text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Atividade Recente de IA</h2>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : recentLogs.length === 0 ? (
              <div className="text-center py-8">
                <Activity size={28} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Nenhuma atividade registrada.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-gray-400 border-b border-gray-100">
                      <th className="text-left pb-2 font-medium">Usuário</th>
                      <th className="text-right pb-2 font-medium">Tokens Entrada</th>
                      <th className="text-right pb-2 font-medium">Tokens Saída</th>
                      <th className="text-right pb-2 font-medium">Total</th>
                      <th className="text-right pb-2 font-medium">Data</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recentLogs.map((log, i) => (
                      <tr key={i} className="text-gray-700">
                        <td className="py-2.5 text-xs">{log.email}</td>
                        <td className="py-2.5 text-right text-xs text-gray-500">{log.tokens_in}</td>
                        <td className="py-2.5 text-right text-xs text-gray-500">{log.tokens_out}</td>
                        <td className="py-2.5 text-right text-xs font-medium">{log.tokens_in + log.tokens_out}</td>
                        <td className="py-2.5 text-right text-xs text-gray-400">
                          {new Date(log.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </motion.div>
    </div>
  );
}

function PeriodSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-200 rounded-2xl bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 cursor-pointer"
      >
        {PERIOD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}

function DeltaBadge({ direction, label }: { direction: 'up' | 'down' | 'flat'; label: string }) {
  const classes = {
    up: 'bg-emerald-50 text-emerald-700',
    down: 'bg-red-50 text-red-600',
    flat: 'bg-gray-100 text-gray-500',
  }[direction];
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium ${classes}`}>
      <Icon size={10} />
      {label}
    </span>
  );
}
