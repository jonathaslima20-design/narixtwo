import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home, MessageCircle, LogOut, Brain, Users, Megaphone, Settings, X } from 'lucide-react';
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

      <div className="px-3 py-4 border-t border-gray-100">
        <div className="px-3 py-2 mb-1">
          <p className="text-xs font-medium text-gray-900 truncate">
            {profile?.full_name || profile?.email || 'Usuario'}
          </p>
          <p className="text-xs text-gray-400 truncate">{profile?.email}</p>
          {plan?.name && (
            <span className="inline-block mt-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
              {plan.name}
            </span>
          )}
          {isTrial && !plan?.name && (
            <span className="inline-block mt-1 text-[10px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
              Trial
            </span>
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

