import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import { Menu, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AdminSidebar } from './AdminSidebar';
import { useAuth } from '../../lib/AuthContext';
import { BrainLoader } from '../ui/BrainLoader';

export function AdminLayout() {
  const { user, profile, loading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/" replace />;
  if (profile && profile.role !== 'admin') return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen bg-gray-950 font-sans">
      {/* Desktop sidebar */}
      <div className="hidden lg:block sticky top-0 h-screen">
        <AdminSidebar />
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
              <AdminSidebar onClose={() => setSidebarOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col overflow-auto bg-gray-50">
        {/* Mobile header */}
        <div className="sticky top-0 z-30 bg-gray-950/90 backdrop-blur-md border-b border-gray-800 px-4 py-3 flex items-center gap-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Menu size={20} />
          </button>
          <ShieldCheck size={16} className="text-white" />
          <span className="font-semibold text-white text-sm">Admin</span>
        </div>
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <BrainLoader size="lg" />
        <p className="text-sm text-gray-400">Carregando...</p>
      </div>
    </div>
  );
}
