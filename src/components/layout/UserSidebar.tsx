import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, MessageCircle, LogOut, Brain, Users, Megaphone, Settings, X, Clock, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAuth } from '../../lib/AuthContext';
import { useSubscriptionCtx } from '../../lib/SubscriptionContext';
import { PricingModal } from '../ui/PricingModal';

const navItems = [
  { to: '/dashboard', icon: Home, label: 'Inicio', end: true, alwaysEnabled: true },
  { to: '/dashboard/leads', icon: MessageCircle, label: 'Chat', end: false, alwaysEnabled: false },
  { to: '/dashboard/crm', icon: Users, label: 'Gestao de Leads', end: false, alwaysEnabled: false },
  { to: '/dashboard/campaigns', icon: Megaphone, label: 'Campanhas', end: false, alwaysEnabled: false },
  { to: '/dashboard/settings', icon: Settings, label: 'Configuracoes', end: false, alwaysEnabled: false },
];

export function UserSidebar({ onClose }: { onClose?: () => void }) {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [showPricing, setShowPricing] = useState(false);

  let isBlocked = false;
  let plan: { slug?: string; name?: string; max_sends?: number } | null = null;
  let isTrial = false;
  let sendCount = 0;
  let remainingSends = 0;
  let daysLeft = 0;
  try {
    const sub = useSubscriptionCtx();
    isBlocked = sub.isBlocked;
    plan = sub.plan;
    isTrial = sub.isTrial;
    sendCount = sub.sendCount;
    remainingSends = sub.remainingSends;
    daysLeft = sub.daysLeft;
  } catch {
    // SubscriptionProvider may not be mounted yet
  }

  const maxSends = plan?.max_sends ?? -1;
  const sendsExhausted = maxSends !== -1 && sendCount >= maxSends;
  const timeExpired = daysLeft <= 0;
  const pricingReason = isBlocked
    ? sendsExhausted && timeExpired
      ? 'both_expired' as const
      : sendsExhausted
        ? 'sends_exhausted' as const
        : timeExpired
          ? 'time_expired' as const
          : 'time_expired' as const
    : 'browse' as const;

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  function handleNav() {
    onClose?.();
  }

  return (
    <aside className="w-60 shrink-0 h-screen bg-white border-r border-gray-100 flex flex-col">
      <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gray-900 rounded-xl flex items-center justify-center">
            <Brain size={16} className="text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-base tracking-tight">BrainLead</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
        {navItems.map(({ to, icon: Icon, label, end, alwaysEnabled }) => {
          const disabled = isBlocked && !alwaysEnabled;
          return (
            <NavLink
              key={to}
              to={disabled ? '#' : to}
              end={end}
              onClick={(e) => { if (disabled) { e.preventDefault(); return; } handleNav(); }}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                  disabled
                    ? 'opacity-40 cursor-not-allowed text-gray-400'
                    : isActive
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={16} className={disabled ? 'text-gray-300' : isActive ? 'text-white' : 'text-gray-400'} />
                  {label}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <PricingModal open={showPricing} onClose={() => setShowPricing(false)} reason={pricingReason} />

      {isTrial && (
        <div className="px-3 pb-3">
          <button
            onClick={() => setShowPricing(true)}
            className="w-full text-left rounded-2xl p-3.5 bg-gray-50 border border-gray-100 hover:bg-gray-100/80 transition-all duration-150 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <Clock size={12} className="text-amber-500" />
                <span className="text-xs font-semibold text-gray-900">Trial</span>
              </div>
              <span className="text-[10px] font-medium text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-100">
                {daysLeft}d restante{daysLeft !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1">
                <Send size={10} className="text-gray-400" />
                <span className="text-[11px] text-gray-500">Envios</span>
              </div>
              <span className="text-[11px] font-medium text-gray-700">{sendCount}/{maxSends}</span>
            </div>
            <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  maxSends > 0 && sendCount / maxSends >= 0.8
                    ? 'bg-red-500'
                    : maxSends > 0 && sendCount / maxSends >= 0.5
                      ? 'bg-amber-500'
                      : 'bg-gray-900'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${maxSends > 0 ? Math.min(100, Math.round((sendCount / maxSends) * 100)) : 0}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">{remainingSends} restante{remainingSends !== 1 ? 's' : ''}</p>
          </button>
        </div>
      )}

      <div className="px-3 py-4 border-t border-gray-100">
        <div className="px-3 py-2 mb-1">
          <p className="text-xs font-medium text-gray-900 truncate">
            {profile?.full_name || profile?.email || 'Usuario'}
          </p>
          <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
          {plan?.name && !isTrial && (
            <button
              onClick={() => setShowPricing(true)}
              className="inline-block mt-1.5 text-[10px] font-semibold text-white bg-gray-900 px-2.5 py-1 rounded-lg tracking-wide uppercase hover:bg-gray-700 transition-colors cursor-pointer"
            >
              {plan.name}
            </button>
          )}
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-500 transition-all duration-150"
        >
          <LogOut size={16} />
          Sair
        </motion.button>
      </div>
    </aside>
  );
}

