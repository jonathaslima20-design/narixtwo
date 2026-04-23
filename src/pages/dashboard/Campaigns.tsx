import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Megaphone,
  Plus,
  Search,
  Type,
  Image,
  Mic,
  FileText,
  Pause,
  Play,
  Trash2,
  Eye,
  Copy,
  Calendar,
  Send,
  CheckCircle2,
  XCircle,
  Clock,
  MoreVertical,
  X,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useCampaigns } from '../../lib/useCampaigns';
import { Campaign, CampaignStatus, CampaignMessageType } from '../../lib/types';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';

const STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; bg: string; icon: typeof Send }> = {
  draft: { label: 'Rascunho', color: 'text-gray-600', bg: 'bg-gray-100', icon: FileText },
  scheduled: { label: 'Agendada', color: 'text-sky-600', bg: 'bg-sky-50', icon: Calendar },
  sending: { label: 'Enviando', color: 'text-amber-600', bg: 'bg-amber-50', icon: Send },
  paused: { label: 'Pausada', color: 'text-orange-600', bg: 'bg-orange-50', icon: Pause },
  completed: { label: 'Concluída', color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle2 },
  failed: { label: 'Falhou', color: 'text-red-600', bg: 'bg-red-50', icon: XCircle },
  cancelled: { label: 'Cancelada', color: 'text-gray-500', bg: 'bg-gray-50', icon: X },
};

const TYPE_ICONS: Record<CampaignMessageType, typeof Type> = {
  text: Type,
  image: Image,
  audio: Mic,
  document: FileText,
};

const TYPE_LABELS: Record<CampaignMessageType, string> = {
  text: 'Texto',
  image: 'Imagem',
  audio: 'Áudio',
  document: 'Documento',
};

type FilterTab = 'all' | CampaignStatus;

export function Campaigns() {
  const { user } = useAuth();
  const { campaigns, loading, deleteCampaign, updateStatus } = useCampaigns(user?.id);
  const navigate = useNavigate();
  const [filter, setFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filteredCampaigns = campaigns.filter((c) => {
    if (filter !== 'all' && c.status !== filter) return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = {
    total: campaigns.length,
    active: campaigns.filter((c) => c.status === 'sending').length,
    scheduled: campaigns.filter((c) => c.status === 'scheduled').length,
    completed: campaigns.filter((c) => c.status === 'completed').length,
  };

  const filterTabs: { key: FilterTab; label: string; count?: number }[] = [
    { key: 'all', label: 'Todas', count: campaigns.length },
    { key: 'draft', label: 'Rascunhos', count: campaigns.filter((c) => c.status === 'draft').length },
    { key: 'scheduled', label: 'Agendadas', count: campaigns.filter((c) => c.status === 'scheduled').length },
    { key: 'sending', label: 'Enviando', count: campaigns.filter((c) => c.status === 'sending').length },
    { key: 'completed', label: 'Concluídas', count: campaigns.filter((c) => c.status === 'completed').length },
  ];

  async function handleDuplicate(c: Campaign) {
    const { data } = await supabase
      .from('campaigns')
      .insert({
        user_id: user!.id,
        name: `${c.name} (cópia)`,
        status: 'draft',
        message_type: c.message_type,
        content: c.content,
        media_url: c.media_url,
        media_type: c.media_type,
        media_filename: c.media_filename,
        caption: c.caption,
        delay_ms: c.delay_ms,
        send_window_start: c.send_window_start,
        send_window_end: c.send_window_end,
        filter_tags: c.filter_tags,
        filter_category: c.filter_category,
        exclude_recent_days: c.exclude_recent_days,
      })
      .select()
      .maybeSingle();
    if (data) navigate(`/dashboard/campaigns/${data.id}`);
    setMenuOpen(null);
  }

  const [deleting, setDeleting] = useState(false);

  async function handleDelete(id: string) {
    setDeleting(true);
    try {
      await deleteCampaign(id);
      setConfirmDelete(null);
      setMenuOpen(null);
    } catch {
      alert('Erro ao excluir campanha. Tente novamente.');
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(iso: string | null) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function progressPercent(c: Campaign) {
    if (c.total_recipients === 0) return 0;
    return Math.round((c.sent_count / c.total_recipients) * 100);
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto bg-gray-50/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-900 rounded-2xl flex items-center justify-center">
                <Megaphone size={18} className="text-white" />
              </div>
              Campanhas de Envio
            </h1>
            <p className="text-sm text-gray-500 mt-1.5 ml-[52px]">
              Envie mensagens em massa para seus leads via WhatsApp
            </p>
          </div>
          <Button onClick={() => navigate('/dashboard/campaigns/new')} size="lg">
            <Plus size={16} />
            Nova Campanha
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {[
            { label: 'Total', value: stats.total, color: 'bg-gray-900', textColor: 'text-white' },
            { label: 'Ativas agora', value: stats.active, color: 'bg-amber-50', textColor: 'text-amber-700' },
            { label: 'Agendadas', value: stats.scheduled, color: 'bg-sky-50', textColor: 'text-sky-700' },
            { label: 'Concluídas', value: stats.completed, color: 'bg-emerald-50', textColor: 'text-emerald-700' },
          ].map((s) => (
            <div key={s.label} className={`${s.color} rounded-2xl p-4`}>
              <p className={`text-2xl font-bold ${s.textColor}`}>{s.value}</p>
              <p className={`text-sm ${s.textColor} opacity-70`}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Filter tabs + search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4 mb-6">
          <div className="flex items-center gap-1 bg-white rounded-xl p-1 border border-gray-100 overflow-x-auto">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  filter === tab.key
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`ml-1.5 text-xs ${filter === tab.key ? 'text-gray-300' : 'text-gray-400'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar campanha..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
            />
          </div>
        </div>

        {/* Campaign list */}
        {filteredCampaigns.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-gray-100 p-16 text-center"
          >
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Megaphone size={28} className="text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {campaigns.length === 0 ? 'Nenhuma campanha ainda' : 'Nenhum resultado encontrado'}
            </h3>
            <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
              {campaigns.length === 0
                ? 'Crie sua primeira campanha para enviar mensagens em massa pelo WhatsApp.'
                : 'Tente buscar com outros termos ou alterar os filtros.'}
            </p>
            {campaigns.length === 0 && (
              <Button onClick={() => navigate('/dashboard/campaigns/new')}>
                <Plus size={16} />
                Criar primeira campanha
              </Button>
            )}
          </motion.div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filteredCampaigns.map((c) => {
                const statusCfg = STATUS_CONFIG[c.status];
                const StatusIcon = statusCfg.icon;
                const TypeIcon = TYPE_ICONS[c.message_type];
                const progress = progressPercent(c);

                return (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-sm transition-shadow cursor-pointer group"
                    onClick={() => navigate(`/dashboard/campaigns/${c.id}`)}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                      {/* Type icon */}
                      <div className="hidden sm:flex w-11 h-11 bg-gray-50 rounded-xl items-center justify-center shrink-0">
                        <TypeIcon size={18} className="text-gray-600" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-2.5 mb-1 flex-wrap">
                          <h3 className="font-semibold text-gray-900 truncate">{c.name || 'Sem nome'}</h3>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.bg} ${statusCfg.color}`}>
                            <StatusIcon size={11} />
                            {statusCfg.label}
                          </span>
                          {c.status === 'sending' && (
                            <span className="flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 sm:gap-4 text-xs text-gray-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <TypeIcon size={11} />
                            {TYPE_LABELS[c.message_type]}
                          </span>
                          <span>{c.total_recipients} destinatários</span>
                          {c.scheduled_at && (
                            <span className="hidden sm:flex items-center gap-1">
                              <Clock size={11} />
                              {formatDate(c.scheduled_at)}
                            </span>
                          )}
                          <span className="hidden sm:inline">{formatDate(c.created_at)}</span>
                        </div>
                      </div>

                      {/* Progress + delivery + actions row */}
                      <div className="flex items-center gap-3 sm:gap-4">
                        {/* Progress */}
                        {c.total_recipients > 0 && c.status !== 'draft' && (
                          <div className="w-24 sm:w-32 shrink-0">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span className="text-gray-600 font-medium">{progress}%</span>
                              <span className="text-gray-400">
                                {c.sent_count}/{c.total_recipients}
                              </span>
                            </div>
                            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <motion.div
                                className={`h-full rounded-full ${
                                  c.status === 'sending'
                                    ? 'bg-amber-500'
                                    : c.status === 'completed'
                                      ? 'bg-emerald-500'
                                      : c.status === 'failed'
                                        ? 'bg-red-500'
                                        : 'bg-gray-400'
                                }`}
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                transition={{ duration: 0.6 }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Delivery rate */}
                        {c.sent_count > 0 && (
                          <div className="text-right shrink-0 hidden sm:block w-20">
                            <p className="text-sm font-semibold text-gray-900">
                              {Math.round((c.delivered_count / c.sent_count) * 100)}%
                            </p>
                            <p className="text-xs text-gray-400">entregue</p>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="relative shrink-0 ml-auto" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setMenuOpen(menuOpen === c.id ? null : c.id)}
                          className="p-2 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
                        >
                          <MoreVertical size={16} />
                        </button>
                        <AnimatePresence>
                          {menuOpen === c.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="absolute right-0 top-10 z-30 w-44 bg-white rounded-xl border border-gray-100 shadow-lg py-1"
                            >
                              <button
                                onClick={() => { navigate(`/dashboard/campaigns/${c.id}`); setMenuOpen(null); }}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Eye size={14} /> Ver detalhes
                              </button>
                              {c.status === 'sending' && (
                                <button
                                  onClick={() => { updateStatus(c.id, 'paused'); setMenuOpen(null); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-orange-600 hover:bg-orange-50"
                                >
                                  <Pause size={14} /> Pausar
                                </button>
                              )}
                              {c.status === 'paused' && (
                                <button
                                  onClick={() => { updateStatus(c.id, 'sending'); setMenuOpen(null); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-emerald-600 hover:bg-emerald-50"
                                >
                                  <Play size={14} /> Retomar
                                </button>
                              )}
                              <button
                                onClick={() => handleDuplicate(c)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                              >
                                <Copy size={14} /> Duplicar
                              </button>
                              {(c.status === 'draft' || c.status === 'completed' || c.status === 'cancelled' || c.status === 'failed') && (
                                <button
                                  onClick={() => setConfirmDelete(c.id)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 size={14} /> Excluir
                                </button>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Excluir campanha?</h3>
              <p className="text-sm text-gray-500 mb-6">
                Todos os dados desta campanha serao removidos permanentemente. Esta acao nao pode ser desfeita.
              </p>
              <div className="flex gap-3">
                <Button variant="ghost" fullWidth onClick={() => setConfirmDelete(null)}>
                  Cancelar
                </Button>
                <button
                  onClick={() => handleDelete(confirmDelete)}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
