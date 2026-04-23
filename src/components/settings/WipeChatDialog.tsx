import { useEffect, useState } from 'react';
import { AlertTriangle, Trash2, Loader2, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';

const CONFIRM_WORD = 'LIMPAR';

interface Counts {
  leads: number;
  messages: number;
}

interface Props {
  open: boolean;
  userId: string;
  onClose: () => void;
  onWiped?: () => void;
}

type Phase = 'idle' | 'running' | 'done' | 'error';

export function WipeChatDialog({ open, userId, onClose, onWiped }: Props) {
  const [confirmText, setConfirmText] = useState('');
  const [counts, setCounts] = useState<Counts | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [deleted, setDeleted] = useState<{ leads: number; messages: number; audio_files: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    setConfirmText('');
    setPhase('idle');
    setError('');
    setDeleted(null);

    let cancelled = false;
    (async () => {
      const [leadsRes, messagesRes] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('messages').select('id', { count: 'exact', head: true }).eq('user_id', userId),
      ]);
      if (cancelled) return;
      setCounts({
        leads: leadsRes.count ?? 0,
        messages: messagesRes.count ?? 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  async function handleConfirm() {
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD) return;
    setPhase('running');
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sua sessão expirou. Faça login novamente.');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
      const res = await fetch(`${supabaseUrl}/functions/v1/chat-wipe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: anonKey,
        },
        body: JSON.stringify({ confirm: CONFIRM_WORD }),
      });
      const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok) {
        const message =
          (typeof payload.error === 'string' && payload.error) ||
          (typeof payload.message === 'string' && payload.message) ||
          `Erro ${res.status}`;
        const step = typeof payload.step === 'string' ? ` (${payload.step})` : '';
        const details = typeof payload.details === 'string' && payload.details ? ` — ${payload.details}` : '';
        throw new Error(`${message}${step}${details}`);
      }

      const deletedPayload = (payload.deleted as { leads?: number; messages?: number; audio_files?: number } | undefined) || {};
      setDeleted({
        leads: deletedPayload.leads ?? 0,
        messages: deletedPayload.messages ?? 0,
        audio_files: deletedPayload.audio_files ?? 0,
      });
      setPhase('done');
      onWiped?.();
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Erro inesperado');
    }
  }

  const confirmMatches = confirmText.trim().toUpperCase() === CONFIRM_WORD;
  const running = phase === 'running';

  return (
    <Modal open={open} onClose={running ? () => {} : onClose} title="Limpar dados do BrainLead" maxWidth="md">
      {phase === 'done' ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
            <CheckCircle2 size={22} className="text-emerald-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">Limpeza concluída</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {deleted?.leads ?? 0} conversas, {deleted?.messages ?? 0} mensagens e {deleted?.audio_files ?? 0} áudios removidos.
                O histórico será re-importado do WhatsApp assim que houver uma conexão ativa.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={onClose}>Fechar</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-100 rounded-2xl">
            <AlertTriangle size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-red-700 leading-relaxed">
              <p className="font-semibold mb-1">Esta ação não pode ser desfeita.</p>
              <p>
                Todas as conversas, mensagens, áudios, lembretes e notas salvas aqui no BrainLead serão apagadas.
                <span className="font-semibold"> Nenhuma mensagem é removida do WhatsApp</span> — o histórico
                original continua intacto na Evolution e será re-importado automaticamente após a limpeza.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">Conversas</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">
                {counts ? counts.leads.toLocaleString('pt-BR') : '—'}
              </p>
            </div>
            <div className="p-3 bg-gray-50 border border-gray-100 rounded-xl">
              <p className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">Mensagens</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">
                {counts ? counts.messages.toLocaleString('pt-BR') : '—'}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Digite <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{CONFIRM_WORD}</span> para confirmar
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={running}
              placeholder={CONFIRM_WORD}
              autoFocus
              className="w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-gray-50"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={running}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirm}
              disabled={!confirmMatches || running}
              loading={running}
            >
              {running ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Limpando…
                </>
              ) : (
                <>
                  <Trash2 size={14} /> Limpar tudo
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
