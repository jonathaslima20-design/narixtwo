import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Send,
  Pause,
  Play,
  XCircle,
  CheckCircle2,
  Eye,
  Download,
  Clock,
  Users,
  X,
  Type,
  Image,
  Mic,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useCampaignDetail } from '../../lib/useCampaignDetail';
import { CampaignRecipientStatus, CampaignStatus } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';

const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; bg: string }> = {
  draft: { label: 'Rascunho', color: 'text-gray-600', bg: 'bg-gray-100' },
  scheduled: { label: 'Agendada', color: 'text-sky-600', bg: 'bg-sky-50' },
  sending: { label: 'Enviando', color: 'text-amber-600', bg: 'bg-amber-50' },
  paused: { label: 'Pausada', color: 'text-orange-600', bg: 'bg-orange-50' },
  completed: { label: 'Concluída', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  failed: { label: 'Falhou', color: 'text-red-600', bg: 'bg-red-50' },
  cancelled: { label: 'Cancelada', color: 'text-gray-500', bg: 'bg-gray-50' },
};

const RECIPIENT_STATUS: Record<CampaignRecipientStatus, { label: string; color: string; bg: string }> = {
  pending: { label: 'Pendente', color: 'text-gray-500', bg: 'bg-gray-50' },
  sending: { label: 'Enviando', color: 'text-amber-600', bg: 'bg-amber-50' },
  sent: { label: 'Enviado', color: 'text-sky-600', bg: 'bg-sky-50' },
  delivered: { label: 'Entregue', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  read: { label: 'Lido', color: 'text-teal-600', bg: 'bg-teal-50' },
  failed: { label: 'Falhou', color: 'text-red-600', bg: 'bg-red-50' },
  skipped: { label: 'Pulado', color: 'text-gray-400', bg: 'bg-gray-50' },
};

const TYPE_ICONS: Record<string, typeof Type> = {
  text: Type,
  image: Image,
  audio: Mic,
  document: FileText,
};

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { campaign, recipients, loading, startSending } = useCampaignDetail(id, user?.id);
  const [recipientFilter, setRecipientFilter] = useState<CampaignRecipientStatus | 'all'>('all');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const filteredRecipients = useMemo(() => {
    if (recipientFilter === 'all') return recipients;
    return recipients.filter((r) => r.status === recipientFilter);
  }, [recipients, recipientFilter]);

  const stats = useMemo(() => {
    const total = campaign?.total_recipients || recipients.length;
    const sent = recipients.filter((r) => ['sent', 'delivered', 'read'].includes(r.status)).length;
    const delivered = recipients.filter((r) => ['delivered', 'read'].includes(r.status)).length;
    const read = recipients.filter((r) => r.status === 'read').length;
    const failed = recipients.filter((r) => ['failed', 'skipped'].includes(r.status)).length;
    const pending = recipients.filter((r) => ['pending', 'sending'].includes(r.status)).length;
    return { total, sent, delivered, read, failed, pending };
  }, [campaign, recipients]);

  const progressPercent = stats.total > 0 ? Math.round(((stats.sent + stats.failed) / stats.total) * 100) : 0;

  async function handleStartSend() {
    if (!campaign || sending) return;
    setSending(true);
    setSendError(null);
    if (campaign.status === 'draft' || campaign.status === 'paused') {
      await supabase.from('campaigns').update({
        status: 'sending',
        started_at: campaign.started_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', campaign.id);
    }
    const error = await startSending();
    if (error) {
      setSendError(error);
      await supabase.from('campaigns').update({
        status: 'paused',
        updated_at: new Date().toISOString(),
      }).eq('id', campaign.id);
    }
    setSending(false);
  }

  async function handlePause() {
    if (!campaign) return;
    await supabase.from('campaigns').update({
      status: 'paused',
      updated_at: new Date().toISOString(),
    }).eq('id', campaign.id);
  }

  async function handleCancel() {
    if (!campaign) return;
    await supabase.from('campaigns').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', campaign.id);
  }

  function exportCSV() {
    if (!recipients.length) return;
    const headers = ['Nome', 'Telefone', 'Status', 'Enviado em', 'Entregue em', 'Lido em', 'Erro'];
    const rows = recipients.map((r) => [
      r.lead_name,
      r.phone,
      RECIPIENT_STATUS[r.status]?.label || r.status,
      r.sent_at || '',
      r.delivered_at || '',
      r.read_at || '',
      r.error_message || '',
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campanha-${campaign?.name || id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatDate(iso: string | null) {
    if (!iso) return '-';
    return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  if (loading || !campaign) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  const statusCfg = STATUS_CONFIG[campaign.status];
  const TypeIcon = TYPE_ICONS[campaign.message_type] || Type;

  return (
    <div className="flex-1 overflow-auto bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6 sm:mb-8">
          <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
            <button
              onClick={() => navigate('/dashboard/campaigns')}
              className="p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all text-gray-500 shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">{campaign.name}</h1>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                  {statusCfg.label}
                  {campaign.status === 'sending' && (
                    <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                  )}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 flex-wrap">
                <span className="flex items-center gap-1"><TypeIcon size={12} /> {campaign.message_type === 'text' ? 'Texto' : campaign.message_type === 'image' ? 'Imagem' : campaign.message_type === 'audio' ? 'Áudio' : 'Documento'}</span>
                <span className="hidden sm:inline">Criada em {formatDate(campaign.created_at)}</span>
                {campaign.scheduled_at && <span className="flex items-center gap-1"><Clock size={12} /> Agendada para {formatDate(campaign.scheduled_at)}</span>}
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 ml-11 sm:ml-0">
            {(campaign.status === 'draft' || campaign.status === 'paused') && (
              <Button onClick={handleStartSend} loading={sending}>
                <Play size={14} />
                <span className="hidden sm:inline">{campaign.status === 'paused' ? 'Retomar' : 'Iniciar envio'}</span>
                <span className="sm:hidden">{campaign.status === 'paused' ? 'Retomar' : 'Enviar'}</span>
              </Button>
            )}
            {campaign.status === 'sending' && (
              <>
                <Button variant="secondary" onClick={handlePause}>
                  <Pause size={14} />
                  <span className="hidden sm:inline">Pausar</span>
                </Button>
                <Button variant="danger" onClick={handleCancel}>
                  <X size={14} />
                  <span className="hidden sm:inline">Cancelar</span>
                </Button>
              </>
            )}
            <Button variant="ghost" onClick={exportCSV}>
              <Download size={14} />
              <span className="hidden sm:inline">CSV</span>
            </Button>
          </div>
        </div>

        {/* Error banner */}
        {sendError && (
          <div className="mb-4 flex items-start gap-3 bg-red-50 border border-red-200 rounded-2xl p-4">
            <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-red-800">Falha ao enviar campanha</p>
              <p className="text-xs text-red-600 mt-0.5">{sendError}</p>
            </div>
            <button
              onClick={() => setSendError(null)}
              className="p-1 rounded-lg hover:bg-red-100 text-red-400 shrink-0"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Progress ring + stats */}
        <div className="grid grid-cols-1 sm:grid-cols-6 gap-4 mb-6">
          {/* Big progress card */}
          <div className="sm:col-span-2 bg-white rounded-2xl border border-gray-100 p-6 flex flex-col items-center justify-center">
            <div className="relative w-28 h-28 mb-3">
              <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" fill="none" stroke="#f3f4f6" strokeWidth="8" />
                <motion.circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={campaign.status === 'completed' ? '#10b981' : campaign.status === 'sending' ? '#f59e0b' : '#6b7280'}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 42}
                  initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                  animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - progressPercent / 100) }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-gray-900">{progressPercent}%</span>
              </div>
            </div>
            <p className="text-sm text-gray-500">
              {stats.sent + stats.failed} de {stats.total} processados
            </p>
          </div>

          {/* Stat cards */}
          <div className="sm:col-span-4 grid grid-cols-2 sm:grid-cols-2 gap-3">
            {[
              { label: 'Total', value: stats.total, icon: Users, color: 'text-gray-900', bg: 'bg-gray-50' },
              { label: 'Enviados', value: stats.sent, icon: Send, color: 'text-sky-700', bg: 'bg-sky-50' },
              { label: 'Entregues', value: stats.delivered, icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50' },
              { label: 'Lidos', value: stats.read, icon: Eye, color: 'text-teal-700', bg: 'bg-teal-50' },
              { label: 'Falhas', value: stats.failed, icon: XCircle, color: 'text-red-700', bg: 'bg-red-50' },
              { label: 'Pendentes', value: stats.pending, icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50' },
            ].map((s) => (
              <div key={s.label} className={`${s.bg} rounded-xl p-4 flex items-center gap-3`}>
                <s.icon size={18} className={s.color} />
                <div>
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
                {stats.total > 0 && (
                  <span className="ml-auto text-xs font-medium text-gray-400">
                    {Math.round((s.value / stats.total) * 100)}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Message preview */}
        {(campaign.content || campaign.caption) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Mensagem</h3>
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{campaign.content || campaign.caption}</p>
            </div>
          </div>
        )}

        {/* Recipients table */}
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="px-4 sm:px-5 py-4 border-b border-gray-50 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Destinatários ({recipients.length})</h3>
            <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-0.5 overflow-x-auto">
              {(['all', 'sent', 'delivered', 'read', 'failed', 'pending'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setRecipientFilter(f)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    recipientFilter === f ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f === 'all' ? 'Todos' : RECIPIENT_STATUS[f]?.label || f}
                </button>
              ))}
            </div>
          </div>
          <div className="max-h-[500px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50/90 backdrop-blur-sm">
                <tr className="text-left text-xs text-gray-500 font-medium">
                  <th className="px-5 py-2.5">Nome</th>
                  <th className="px-5 py-2.5">Telefone</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5">Enviado</th>
                  <th className="px-5 py-2.5">Entregue</th>
                  <th className="px-5 py-2.5">Lido</th>
                  <th className="px-5 py-2.5">Erro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <AnimatePresence>
                  {filteredRecipients.map((r) => {
                    const rCfg = RECIPIENT_STATUS[r.status];
                    return (
                      <motion.tr
                        key={r.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="px-5 py-3 font-medium text-gray-900">{r.lead_name || '-'}</td>
                        <td className="px-5 py-3 text-gray-500">{r.phone}</td>
                        <td className="px-5 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${rCfg.bg} ${rCfg.color}`}>
                            {r.status === 'sending' && <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />}
                            {rCfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-gray-500">{formatDate(r.sent_at)}</td>
                        <td className="px-5 py-3 text-xs text-gray-500">{formatDate(r.delivered_at)}</td>
                        <td className="px-5 py-3 text-xs text-gray-500">{formatDate(r.read_at)}</td>
                        <td className="px-5 py-3 text-xs text-red-500 max-w-[200px] truncate">{r.error_message || '-'}</td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
                {filteredRecipients.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">
                      Nenhum destinatário neste filtro
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
