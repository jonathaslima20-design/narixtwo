import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, TrendingUp, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { Card } from '../../components/ui/Card';
import { Lead } from '../../lib/types';
import { leadDisplayName, leadPhoneLabel } from '../../lib/leadDisplay';
import { useLeadCategories } from '../../lib/useLeadCategories';
import { resolveIcon } from '../../lib/iconMap';

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
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Ola, {name}</h1>
          <p className="text-gray-500 text-sm mt-1.5">Aqui esta um resumo dos seus leads hoje.</p>
        </motion.div>

        <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {statCards.slice(0, 8).map((card) => {
            const Icon = card.iconName === 'Users' ? Users : resolveIcon(card.iconName);
            return (
              <motion.div
                key={card.label}
                whileHover={{ y: -2, boxShadow: '0 8px 24px -6px rgba(0,0,0,0.10)' }}
                transition={{ duration: 0.18 }}
              >
                <Card className="flex flex-col gap-3 h-full">
                  <div className={`w-10 h-10 ${card.bg} rounded-xl flex items-center justify-center`}>
                    <Icon size={18} className={card.color} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900 tracking-tight">
                      {loading ? <span className="w-8 h-6 bg-gray-100 rounded animate-pulse inline-block" /> : card.value}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{card.label}</p>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </motion.div>

        <motion.div variants={item}>
          <Card>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center">
                  <TrendingUp size={14} className="text-gray-600" />
                </div>
                <h2 className="text-sm font-semibold text-gray-900">Leads Recentes</h2>
              </div>
              <Link
                to="/dashboard/leads"
                className="flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-gray-900 transition-colors"
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
              <div className="text-center py-12">
                <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Users size={24} className="text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-500">Nenhum lead ainda.</p>
                <p className="text-xs text-gray-300 mt-1">Conecte seu WhatsApp para comecar a capturar leads.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {recentLeads.map((lead) => {
                  const cat = categories.find((c) => c.key === lead.category);
                  const CatIcon = cat ? resolveIcon(cat.icon) : Users;
                  const catColor = cat?.color.split(' ')[1] || 'text-gray-400';
                  const catLabel = cat?.label || lead.category || '';
                  return (
                    <motion.div
                      key={lead.id}
                      whileHover={{ x: 2 }}
                      transition={{ duration: 0.15 }}
                      className="flex items-center justify-between p-3 rounded-xl bg-gray-50 hover:bg-gray-100/80 transition-colors cursor-default"
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
                        <div className={`w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-semibold text-gray-600${lead.profile_picture_url ? ' hidden' : ''}`}>
                          {leadDisplayName(lead).charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{leadDisplayName(lead)}</p>
                          <p className="text-xs text-gray-400">{leadPhoneLabel(lead)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 bg-white border border-gray-100 px-2 py-1 rounded-lg">
                        <CatIcon size={11} className={catColor} />
                        <span className="text-xs text-gray-500">{catLabel}</span>
                      </div>
                    </motion.div>
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
