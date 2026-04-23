import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, TrendingUp, ArrowRight, Clock, Send, CheckCircle, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { Card } from '../../components/ui/Card';
import { Lead } from '../../lib/types';
import { leadDisplayName, leadPhoneLabel } from '../../lib/leadDisplay';
import { useLeadCategories } from '../../lib/useLeadCategories';
import { resolveIcon } from '../../lib/iconMap';
import { useSubscriptionCtx } from '../../lib/SubscriptionContext';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 28 } },
};

export function DashboardHome() {
  const { profile } = useAuth();
  const { categories } = useLeadCategories();
  const { plan, isTrial, sendCount, remainingSends, daysLeft, isBlocked } = useSubscriptionCtx();
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [recentLeads, setRecentLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
      if (data) {
        setAllLeads(data as Lead[]);
        setRecentLeads((data as Lead[]).slice(0, 5));
      }
      setLoading(false);
    }
    load();
  }, []);

  const name = profile?.full_name?.split(' ')[0] || 'Usuario';

  const statCards = [
    { label: 'Total de Leads', value: allLeads.length, iconName: 'Users', color: 'text-gray-600', bg: 'bg-gray-50' },
    ...categories.map((cat) => {
      const count = allLeads.filter((l) => l.category === cat.key).length;
      const palette = cat.color.match(/text-(\w+)-(\d+)/);
      const colorClass = palette ? `text-${palette[1]}-${palette[2]}` : 'text-gray-600';
      const bgClass = palette ? `bg-${palette[1]}-50` : 'bg-gray-50';
      return { label: cat.label, value: count, iconName: cat.icon, color: colorClass, bg: bgClass };
    }),
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <motion.div variants={container} initial="hidden" animate="show" className="max-w-4xl mx-auto">
        <motion.div variants={item} className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Ola, {name}</h1>
          <p className="text-gray-500 text-sm mt-1">Aqui esta um resumo dos seus leads hoje.</p>
        </motion.div>

        {/* Plan status banner */}
        <motion.div variants={item} className="mb-6">
          <PlanBanner
            planName={plan?.name ?? 'Sem plano'}
            isTrial={isTrial}
            sendCount={sendCount}
            remainingSends={remainingSends}
            daysLeft={daysLeft}
            isBlocked={isBlocked}
            maxSends={plan?.max_sends ?? -1}
          />
        </motion.div>

        <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {statCards.slice(0, 8).map((card) => {
            const Icon = card.iconName === 'Users' ? Users : resolveIcon(card.iconName);
            return (
              <Card key={card.label} className="flex flex-col gap-3">
                <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center`}>
                  <Icon size={18} className={card.color} />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {loading ? <span className="w-8 h-6 bg-gray-100 rounded animate-pulse inline-block" /> : card.value}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
                </div>
              </Card>
            );
          })}
        </motion.div>

        <motion.div variants={item}>
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900">Leads Recentes</h2>
              </div>
              <Link
                to="/dashboard/leads"
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-900 transition-colors"
              >
                Ver todos <ArrowRight size={12} />
              </Link>
            </div>

            {loading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : recentLeads.length === 0 ? (
              <div className="text-center py-10">
                <Users size={32} className="text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Nenhum lead ainda.</p>
                <p className="text-xs text-gray-300 mt-1">Conecte seu WhatsApp para comecar a capturar leads.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentLeads.map((lead) => {
                  const cat = categories.find((c) => c.key === lead.category);
                  const CatIcon = cat ? resolveIcon(cat.icon) : Users;
                  const catColor = cat?.color.split(' ')[1] || 'text-gray-400';
                  const catLabel = cat?.label || lead.category || '';
                  return (
                    <div
                      key={lead.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        {lead.profile_picture_url ? (
                          <img
                            src={lead.profile_picture_url}
                            alt={leadDisplayName(lead)}
                            className="w-8 h-8 rounded-full object-cover bg-gray-100"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }}
                          />
                        ) : null}
                        <div className={`w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium text-gray-600${lead.profile_picture_url ? ' hidden' : ''}`}>
                          {leadDisplayName(lead).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{leadDisplayName(lead)}</p>
                          <p className="text-xs text-gray-400">{leadPhoneLabel(lead)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CatIcon size={12} className={catColor} />
                        <span className="text-xs text-gray-500">{catLabel}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}

function PlanBanner({
  planName,
  isTrial,
  sendCount,
  remainingSends,
  daysLeft,
  isBlocked,
  maxSends,
}: {
  planName: string;
  isTrial: boolean;
  sendCount: number;
  remainingSends: number;
  daysLeft: number;
  isBlocked: boolean;
  maxSends: number;
}) {
  if (isBlocked) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-2xl">
        <AlertTriangle size={16} className="text-red-500 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium text-red-800">Plano expirado</p>
          <p className="text-xs text-red-600">Seu periodo de teste terminou. Escolha um plano para continuar.</p>
        </div>
      </div>
    );
  }

  if (isTrial) {
    const sendPct = maxSends > 0 ? Math.min(100, Math.round((sendCount / maxSends) * 100)) : 0;
    const isLow = daysLeft <= 1 || remainingSends <= 5;
    return (
      <div className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 rounded-2xl border ${isLow ? 'bg-amber-50 border-amber-200' : 'bg-sky-50 border-sky-200'}`}>
        <div className="flex items-center gap-2 shrink-0">
          <Clock size={14} className={isLow ? 'text-amber-500' : 'text-sky-500'} />
          <span className={`text-sm font-semibold ${isLow ? 'text-amber-800' : 'text-sky-800'}`}>Plano Trial</span>
        </div>
        <div className="flex-1 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 flex-1">
            <Send size={12} className="text-gray-400 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs text-gray-600">{sendCount}/{maxSends} envios</span>
                <span className="text-xs text-gray-400">{remainingSends} restantes</span>
              </div>
              <div className="w-full h-1.5 bg-white rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${sendPct >= 80 ? 'bg-red-500' : sendPct >= 50 ? 'bg-amber-500' : 'bg-sky-500'}`}
                  style={{ width: `${sendPct}%` }}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Clock size={12} className="text-gray-400" />
            <span className="text-xs text-gray-600">{daysLeft} {daysLeft === 1 ? 'dia restante' : 'dias restantes'}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
      <CheckCircle size={16} className="text-emerald-500 shrink-0" />
      <div>
        <p className="text-sm font-medium text-emerald-800">Plano {planName}</p>
        <p className="text-xs text-emerald-600">Envios ilimitados</p>
      </div>
    </div>
  );
}
