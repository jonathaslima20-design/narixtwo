import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  leadId: string;
  name: string;
  phone: string;
  preview: string;
  avatarUrl?: string;
}

interface Props {
  toasts: ToastItem[];
  onOpen: (leadId: string) => void;
  onDismiss: (id: string) => void;
}

export function IncomingMessageToastStack({ toasts, onOpen, onDismiss }: Props) {
  return (
    <div className="fixed top-4 right-4 z-[60] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onOpen={onOpen} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({
  toast,
  onOpen,
  onDismiss,
}: {
  toast: ToastItem;
  onOpen: (leadId: string) => void;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(toast.id), 4500);
    return () => window.clearTimeout(t);
  }, [toast.id, onDismiss]);

  const title = toast.name || toast.phone;
  const initial = (title || '?').charAt(0).toUpperCase();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12, x: 24 }}
      animate={{ opacity: 1, y: 0, x: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      className="pointer-events-auto w-80 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          onOpen(toast.leadId);
          onDismiss(toast.id);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen(toast.leadId);
            onDismiss(toast.id);
          }
        }}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="relative w-10 h-10 shrink-0">
          {toast.avatarUrl ? (
            <img
              src={toast.avatarUrl}
              alt={title}
              className="w-10 h-10 rounded-full object-cover bg-gray-100"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-700">
              {initial}
            </div>
          )}
          <span className="absolute -bottom-1 -right-1 bg-emerald-500 rounded-full p-1 border-2 border-white">
            <MessageSquare size={9} className="text-white" />
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-emerald-600 font-semibold uppercase tracking-wide">
            Nova mensagem
          </p>
          <p className="text-sm font-bold text-gray-900 truncate mt-0.5">{title}</p>
          <p className="text-xs text-gray-600 truncate mt-0.5">{toast.preview}</p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(toast.id);
          }}
          className="shrink-0 p-1 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          aria-label="Dispensar notificação"
        >
          <X size={14} />
        </button>
      </div>
    </motion.div>
  );
}
