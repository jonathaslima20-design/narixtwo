import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Smartphone, TrendingUp, Activity, CreditCard, DollarSign } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Card } from '../../components/ui/Card';
import { Plan } from '../../lib/types';

interface Stats {
  totalUsers: number;
  activeInstances: number;
  totalLeads: number;
}

interface PlanDist {
  plan_name: string;
  plan_slug: string;
  price_cents: number;
  billing_period: string;
  count: number;
}

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 280, damping: 26 } },
};

function formatBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function AdminOverview() {
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, activeInstances: 0, totalLeads: 0 });
  const [planDist, setPlanDist] = useState<PlanDist[]>([]);
  const [recentLogs, setRecentLogs] = useState<{ id: string; email: string; tokens_in: number; tokens_out: number; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [usersRes, instancesRes, leadsRes, logsRes, plansRes, subsRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact' }).eq('role', 'user'),
        supabase.from('whatsapp_instances').select('id', { count: 'exact' }).eq('status', 'connected'),
        supabase.from('leads').select('id', { count: 'exact' }),
        supabase.from('usage_logs').select('tokens_in, tokens_out, created_at, user_id, profiles(email)').order('created_at', { ascending: false }).limit(10),
        supabase.from('plans').select('*').order('sort_order'),
        supabase.from('client_subscriptions').select('plan_id, status').eq('status', 'active'),
      ]);

      setStats({
        totalUsers: usersRes.count || 0,
        activeInstances: instancesRes.count || 0,
        totalLeads: leadsRes.count || 0,
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
  }, []);

  const totalMRR = planDist.reduce((acc, p) => {
    const monthlyValue = p.billing_period === 'yearly'
      ? Math.round(p.price_cents / 12)
      : p.price_cents;
    return acc + monthlyValue * p.count;
  }, 0);

  const totalSubscribers = planDist.reduce((acc, p) => acc + p.count, 0);
  const maxPlanCount = Math.max(...planDist.map((p) => p.count), 1);

  const statCards = [
    { label: 'Clientes Ativos', value: stats.totalUsers, icon: Users, color: 'text-sky-500', bg: 'bg-sky-50' },
    { label: 'WhatsApp Conectados', value: stats.activeInstances, icon: Smartphone, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Total de Leads', value: stats.totalLeads, icon: TrendingUp, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Receita Mensal Estimada', value: formatBRL(totalMRR), icon: DollarSign, color: 'text-teal-500', bg: 'bg-teal-50' },
  ];

  const PLAN_COLORS: Record<string, string> = {
    mensal: 'bg-sky-500',
    anual: 'bg-amber-500',
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-5xl mx-auto">
        <motion.div variants={item} className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Visão Geral</h1>
          <p className="text-sm text-gray-500 mt-1">Monitoramento global da plataforma BrainLead.</p>
        </motion.div>

        {/* Stat cards */}
        <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {statCards.map((card) => (
            <Card key={card.label}>
              <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center mb-3`}>
                <card.icon size={18} className={card.color} />
              </div>
              <p className="text-2xl font-bold text-gray-900">
                {loading ? <span className="w-10 h-6 bg-gray-100 rounded animate-pulse inline-block" /> : card.value}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
            </Card>
          ))}
        </motion.div>

        {/* Plan distribution */}
        <motion.div variants={item} className="mb-8">
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
        </motion.div>

        {/* Recent AI activity */}
        <motion.div variants={item}>
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
        </motion.div>
      </motion.div>
    </div>
  );
}
