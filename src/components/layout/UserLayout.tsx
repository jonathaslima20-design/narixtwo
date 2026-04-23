import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Brain, Menu, ShieldOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { UserSidebar } from './UserSidebar';
import { useAuth } from '../../lib/AuthContext';
import { SubscriptionProvider, useSubscriptionCtx } from '../../lib/SubscriptionContext';
import { PricingModal } from '../ui/PricingModal';

export function UserLayout() {
  const { user, profile, loading } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/" replace />;
  if (profile?.role === 'admin') return <Navigate to="/admin" replace />;

  return (
    <SubscriptionProvider>
      <UserLayoutInner />
    </SubscriptionProvider>
  );
}

function UserLayoutInner() {
  const { profile } = useAuth();
  const { isBlocked, loading: subLoading, isTrial, daysLeft, sendCount, plan } = useSubscriptionCtx();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const accountDisabled = profile?.is_enabled === false;

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      {/* Desktop sidebar */}
      <div className="hidden lg:block sticky top-0 h-screen">
        <UserSidebar />
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="fixed inset-y-0 left-0 z-50 lg:hidden"
            >
              <UserSidebar onClose={() => setSidebarOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col overflow-auto">
        {/* Mobile header */}
        <div className="sticky top-0 z-30 bg-white/80 backdrop-blur-md border-b border-gray-100 px-4 py-3 flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <Menu size={20} />
          </button>
        </div>
        <main className="flex-1">
          <Outlet />
        </main>
        <footer className="py-6 flex items-center justify-center gap-2 opacity-40">
          <div className="w-6 h-6 bg-gray-900 rounded-lg flex items-center justify-center">
            <Brain size={12} className="text-white" />
          </div>
          <span className="text-xs font-medium text-gray-500 tracking-tight">BrainLead</span>
        </footer>
      </div>

      {/* Account disabled overlay */}
      {accountDisabled && (
        <div className="fixed inset-0 z-[60] bg-white/95 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldOff size={24} className="text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Conta desativada</h2>
            <p className="text-sm text-gray-500">
              Sua conta foi desativada pelo administrador. Entre em contato com o suporte para mais informacoes.
            </p>
          </div>
        </div>
      )}

      {/* Paywall modal */}
      {!subLoading && isBlocked && !accountDisabled && (
        <PricingModal
          open
          permanent
          reason={
            (() => {
              const maxSends = plan?.max_sends ?? -1;
              const sendsExhausted = maxSends !== -1 && sendCount >= maxSends;
              const timeExpired = daysLeft <= 0;
              if (sendsExhausted && timeExpired) return 'both_expired' as const;
              if (sendsExhausted) return 'sends_exhausted' as const;
              return 'time_expired' as const;
            })()
          }
        />
      )}
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-400">Carregando...</p>
      </div>
    </div>
  );
}
