import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Crown, Zap, Clock, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface PricingModalProps {
  open: boolean;
  onClose?: () => void;
  permanent?: boolean;
}

const FEATURES = [
  'Chat integrado com WhatsApp',
  'Gestao e qualificacao de leads',
  'Campanhas de envio em massa',
  'Templates de mensagens',
  'Categorias personalizadas',
];

export function PricingModal({ open, onClose, permanent }: PricingModalProps) {
  const [checkoutLinks, setCheckoutLinks] = useState({ mensal: '', anual: '' });

  useEffect(() => {
    if (!open) return;
    supabase
      .from('admin_settings')
      .select('key, value')
      .in('key', ['checkout_link_mensal', 'checkout_link_anual'])
      .then(({ data }) => {
        if (!data) return;
        const links = { mensal: '', anual: '' };
        data.forEach((row) => {
          if (row.key === 'checkout_link_mensal') links.mensal = row.value;
          if (row.key === 'checkout_link_anual') links.anual = row.value;
        });
        setCheckoutLinks(links);
      });
  }, [open]);

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  function handleSubscribe(link: string) {
    if (link) window.open(link, '_blank', 'noopener');
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={permanent ? undefined : onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-w-3xl z-10 max-h-[95vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 sm:p-8">
              {!permanent && onClose && (
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  <X size={18} />
                </button>
              )}

              <div className="text-center mb-8">
                <div className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Crown size={22} className="text-white" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
                  Seu periodo de teste terminou. Escolha um plano para continuar.
                </h2>
                <p className="text-sm text-gray-500">
                  Desbloqueie todas as funcionalidades do BrainLead.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Trial */}
                <div className="border border-gray-200 rounded-2xl p-5 bg-gray-50 opacity-60">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock size={16} className="text-gray-400" />
                    <span className="text-sm font-semibold text-gray-600">Trial</span>
                  </div>
                  <div className="mb-4">
                    <span className="text-2xl font-bold text-gray-400">Gratis</span>
                  </div>
                  <p className="text-xs text-gray-400 mb-4">2 dias ou 20 envios</p>
                  <button
                    disabled
                    className="w-full py-2.5 rounded-xl text-sm font-medium bg-gray-200 text-gray-400 cursor-not-allowed"
                  >
                    Plano Atual
                  </button>
                  <ul className="mt-4 space-y-2">
                    {FEATURES.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-gray-400">
                        <Check size={13} className="mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                    <li className="flex items-start gap-2 text-xs text-gray-400">
                      <Check size={13} className="mt-0.5 shrink-0" />
                      Limite: 20 envios
                    </li>
                  </ul>
                </div>

                {/* Mensal */}
                <div className="border border-gray-200 rounded-2xl p-5 bg-white">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap size={16} className="text-gray-900" />
                    <span className="text-sm font-semibold text-gray-900">Mensal</span>
                  </div>
                  <div className="mb-4">
                    <span className="text-2xl font-bold text-gray-900">R$49</span>
                    <span className="text-sm text-gray-500">/mes</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">Envios ilimitados</p>
                  <button
                    onClick={() => handleSubscribe(checkoutLinks.mensal)}
                    disabled={!checkoutLinks.mensal}
                    className="w-full py-2.5 rounded-xl text-sm font-medium bg-gray-900 text-white hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Assinar Mensal
                  </button>
                  <ul className="mt-4 space-y-2">
                    {FEATURES.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-gray-600">
                        <Check size={13} className="mt-0.5 text-emerald-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                    <li className="flex items-start gap-2 text-xs text-gray-600">
                      <Check size={13} className="mt-0.5 text-emerald-500 shrink-0" />
                      Envios ilimitados
                    </li>
                  </ul>
                </div>

                {/* Anual */}
                <div className="relative border-2 border-emerald-500 rounded-2xl p-5 bg-white shadow-lg shadow-emerald-100/50">
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-500 text-white text-xs font-semibold rounded-full">
                      <Crown size={11} />
                      Melhor Custo-Beneficio
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-3 mt-1">
                    <Crown size={16} className="text-emerald-600" />
                    <span className="text-sm font-semibold text-gray-900">Anual</span>
                  </div>
                  <div className="mb-1">
                    <span className="text-2xl font-bold text-gray-900">R$389</span>
                    <span className="text-sm text-gray-500">/ano</span>
                  </div>
                  <p className="text-xs text-emerald-600 font-medium mb-4">~R$32/mes - Economize 34%</p>
                  <button
                    onClick={() => handleSubscribe(checkoutLinks.anual)}
                    disabled={!checkoutLinks.anual}
                    className="w-full py-2.5 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Assinar Anual
                  </button>
                  <ul className="mt-4 space-y-2">
                    {FEATURES.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-gray-600">
                        <Check size={13} className="mt-0.5 text-emerald-500 shrink-0" />
                        {f}
                      </li>
                    ))}
                    <li className="flex items-start gap-2 text-xs text-gray-600">
                      <Check size={13} className="mt-0.5 text-emerald-500 shrink-0" />
                      Envios ilimitados
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
