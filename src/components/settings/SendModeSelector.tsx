import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Hand, Bot, CheckCircle2, Save, Clock } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { Card } from '../ui/Card';
import { SendMode } from '../../lib/types';

const MODES: { key: SendMode; title: string; desc: string; icon: typeof Hand; tint: string }[] = [
  {
    key: 'manual',
    title: 'Manual',
    desc: 'Você responde a cada mensagem. A IA apenas sugere quando solicitada.',
    icon: Hand,
    tint: 'bg-gray-50 border-gray-200 text-gray-700',
  },
  {
    key: 'approval',
    title: 'IA com aprovação',
    desc: 'A IA gera respostas e você aprova, edita ou descarta antes do envio.',
    icon: CheckCircle2,
    tint: 'bg-amber-50 border-amber-200 text-amber-700',
  },
  {
    key: 'auto',
    title: 'Automático',
    desc: 'A IA responde sozinha e você pode intervir a qualquer momento.',
    icon: Bot,
    tint: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  },
];

export function SendModeSelector() {
  const { user } = useAuth();
  const [mode, setMode] = useState<SendMode>('manual');
  const [original, setOriginal] = useState<SendMode>('manual');
  const [awayMessage, setAwayMessage] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('send_mode, away_message, business_hours_start, business_hours_end')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (data) {
        const d = data as {
          send_mode?: SendMode;
          away_message?: string;
          business_hours_start?: string;
          business_hours_end?: string;
        };
        setMode(d.send_mode || 'manual');
        setOriginal(d.send_mode || 'manual');
        setAwayMessage(d.away_message || '');
        setStart(d.business_hours_start || '09:00');
        setEnd(d.business_hours_end || '18:00');
      }
      setLoading(false);
    }
    load();
  }, [user]);

  async function save() {
    setSaving(true);
    await supabase
      .from('whatsapp_instances')
      .update({
        send_mode: mode,
        away_message: awayMessage,
        business_hours_start: start,
        business_hours_end: end,
      })
      .eq('user_id', user!.id);
    setOriginal(mode);
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 2000);
  }

  const dirty = mode !== original;

  if (loading) {
    return (
      <Card>
        <div className="h-40 bg-gray-50 rounded-xl animate-pulse" />
      </Card>
    );
  }

  return (
    <Card padding="none">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Modo de envio de mensagens</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Escolha como a IA participa nas respostas aos seus leads.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving || (!dirty && !saved)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
            saved
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50'
          }`}
        >
          <Save size={13} /> {saved ? 'Salvo!' : saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {MODES.map((m) => {
            const active = mode === m.key;
            return (
              <motion.button
                key={m.key}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setMode(m.key)}
                className={`text-left p-4 rounded-2xl border-2 transition-all ${
                  active ? 'border-gray-900 bg-white shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 border ${m.tint}`}
                >
                  <m.icon size={15} />
                </div>
                <p className="text-sm font-semibold text-gray-900">{m.title}</p>
                <p className="text-xs text-gray-500 mt-1 leading-snug">{m.desc}</p>
              </motion.button>
            );
          })}
        </div>

        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
            <Clock size={12} /> Horário comercial
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase">Início</label>
              <input
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase">Fim</label>
              <input
                type="time"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-700 block mb-1.5">
            Mensagem fora do expediente
          </label>
          <textarea
            value={awayMessage}
            onChange={(e) => setAwayMessage(e.target.value)}
            placeholder="Ex: Obrigado pela mensagem! Nosso atendimento retorna em breve."
            rows={2}
            className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
      </div>
    </Card>
  );
}
