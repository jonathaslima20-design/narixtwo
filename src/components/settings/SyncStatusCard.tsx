import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, Users, Image as ImageIcon, History, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type SyncRun = {
  id: string;
  status: 'running' | 'completed' | 'timeout' | 'failed';
  started_at: string;
  finished_at: string | null;
  evolution_total_fetched: number;
  pages_fetched_chats: number;
  pages_fetched_contacts: number;
  imported: number;
  created_count: number;
  updated_count: number;
  skipped_groups: number;
  skipped_broadcasts: number;
  skipped_invalid_phone: number;
  skipped_own_number: number;
  skipped_duplicates: number;
  groups_total: number;
  timed_out: boolean;
  last_error: string | null;
  elapsed_ms: number;
};

type BackfillProgress = {
  totalLeads: number;
  picturesMissing: number;
  historyPending: number;
};

async function getFreshAccessToken(): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  let session = sessionData.session;
  if (session?.expires_at) {
    const expiresInMs = session.expires_at * 1000 - Date.now();
    if (expiresInMs < 60_000) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session) session = refreshed.session;
    }
  }
  return session?.access_token ?? null;
}

async function invokeBackfill(fn: string, body: Record<string, unknown>) {
  const token = await getFreshAccessToken();
  if (!token) throw new Error('Sessão expirada.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON,
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = typeof data.error === 'string' ? data.error : `Erro ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

export function SyncStatusCard({ userId }: { userId: string }) {
  const [run, setRun] = useState<SyncRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [backfillingPics, setBackfillingPics] = useState(false);
  const [backfillingHistory, setBackfillingHistory] = useState(false);
  const [purging, setPurging] = useState(false);
  const [purgeResult, setPurgeResult] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState<BackfillProgress>({
    totalLeads: 0,
    picturesMissing: 0,
    historyPending: 0,
  });

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('whatsapp_sync_runs')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setRun(data as SyncRun | null);
    setLoading(false);
  }, [userId]);

  const loadProgress = useCallback(async () => {
    const totalRes = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);
    const missingPicsRes = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .or('profile_picture_url.is.null,profile_picture_url.eq.');
    const pendingHistoryRes = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('history_backfill_attempted_at', null);
    setProgress({
      totalLeads: totalRes.count ?? 0,
      picturesMissing: missingPicsRes.count ?? 0,
      historyPending: pendingHistoryRes.count ?? 0,
    });
  }, [userId]);

  useEffect(() => {
    load();
    loadProgress();
  }, [load, loadProgress]);

  useEffect(() => {
    const channel = supabase
      .channel(`sync-runs-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_sync_runs', filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'leads', filter: `user_id=eq.${userId}` },
        () => loadProgress(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load, loadProgress]);

  async function runSync(mode: 'force' | 'resume') {
    setSyncing(true);
    setError('');
    try {
      const payload = mode === 'resume' ? { resume: true } : { force: true };
      await invokeBackfill('whatsapp-seed-contacts', payload);
      await load();
      await loadProgress();
      runBackfillPictures().catch(() => {});
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  }

  async function runBackfillPictures(force = false) {
    setBackfillingPics(true);
    setError('');
    try {
      await invokeBackfill('whatsapp-backfill-pictures', force ? { force: true } : {});
      await loadProgress();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Erro ao buscar fotos');
    } finally {
      setBackfillingPics(false);
    }
  }

  async function runCleanAndResync() {
    const confirmed = window.confirm(
      'Isso vai remover todos os leads que não têm nenhuma mensagem trocada e, em seguida, re-sincronizar apenas as conversas reais do WhatsApp. Continuar?',
    );
    if (!confirmed) return;
    setPurging(true);
    setPurgeResult(null);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('purge_chatless_leads');
      if (rpcError) throw new Error(rpcError.message);
      const removed = typeof data === 'number' ? data : 0;
      setPurgeResult(removed);
      await supabase
        .from('whatsapp_instances')
        .update({ contacts_seeded_at: null })
        .eq('user_id', userId);
      await invokeBackfill('whatsapp-seed-contacts', { force: true });
      await load();
      await loadProgress();
      runBackfillPictures().catch(() => {});
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Erro ao limpar e re-sincronizar');
    } finally {
      setPurging(false);
    }
  }

  async function runBackfillHistory(force = false) {
    setBackfillingHistory(true);
    setError('');
    try {
      await invokeBackfill('whatsapp-backfill-history', force ? { force: true } : {});
      await loadProgress();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Erro ao baixar histórico');
    } finally {
      setBackfillingHistory(false);
    }
  }

  if (loading) return null;

  const skippedTotal =
    (run?.skipped_groups ?? 0) +
    (run?.skipped_broadcasts ?? 0) +
    (run?.skipped_invalid_phone ?? 0) +
    (run?.skipped_own_number ?? 0) +
    (run?.skipped_duplicates ?? 0);

  const fetched = run?.evolution_total_fetched ?? 0;
  const imported = run?.imported ?? 0;
  const completion = fetched > 0 ? Math.min(100, Math.round(((imported + skippedTotal) / fetched) * 100)) : 0;

  const isRunning = run?.status === 'running';
  const isTimeout = run?.status === 'timeout';
  const isFailed = run?.status === 'failed';
  const isCompleted = run?.status === 'completed';

  const picturesDone = progress.totalLeads - progress.picturesMissing;
  const picturesPct =
    progress.totalLeads > 0 ? Math.round((picturesDone / progress.totalLeads) * 100) : 0;
  const historyDone = progress.totalLeads - progress.historyPending;
  const historyPct =
    progress.totalLeads > 0 ? Math.round((historyDone / progress.totalLeads) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="mt-6 space-y-4"
    >
      <Card>
        <div className="flex items-start gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isCompleted
                ? 'bg-emerald-50'
                : isTimeout
                ? 'bg-amber-50'
                : isFailed
                ? 'bg-red-50'
                : 'bg-sky-50'
            }`}
          >
            {isCompleted ? (
              <CheckCircle2 size={18} className="text-emerald-500" />
            ) : isTimeout ? (
              <Clock size={18} className="text-amber-500" />
            ) : isFailed ? (
              <AlertTriangle size={18} className="text-red-500" />
            ) : (
              <Users size={18} className="text-sky-500" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-900">Sincronização de contatos</h4>
              {run && (
                <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">
                  {isCompleted
                    ? 'Concluída'
                    : isTimeout
                    ? 'Incompleta'
                    : isFailed
                    ? 'Falhou'
                    : isRunning
                    ? 'Executando'
                    : ''}
                </span>
              )}
            </div>

            {!run && (
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Nenhuma sincronização registrada ainda. Ao conectar o WhatsApp pela primeira vez, os contatos são
                importados automaticamente.
              </p>
            )}

            {run && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <Stat label="Recebidos da Evolution" value={fetched} />
                  <Stat label="Importados no BrainLead" value={imported} highlight />
                  <Stat label="Grupos no WhatsApp" value={run.groups_total} muted />
                  <Stat label="Transmissões ignoradas" value={run.skipped_broadcasts} muted />
                  <Stat label="Telefones inválidos" value={run.skipped_invalid_phone} muted />
                  <Stat label="Duplicados ignorados" value={run.skipped_duplicates} muted />
                </div>

                {fetched > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isTimeout ? 'bg-amber-400' : 'bg-emerald-400'
                        }`}
                        style={{ width: `${completion}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1.5">
                      {isTimeout
                        ? `Interrompida por tempo. ${fetched} registros lidos até agora em ${(
                            run.elapsed_ms / 1000
                          ).toFixed(1)}s. Clique em "Continuar" para buscar o restante.`
                        : isCompleted
                        ? `Concluída em ${(run.elapsed_ms / 1000).toFixed(1)}s. Páginas de conversas lidas: ${
                            run.pages_fetched_chats
                          }.`
                        : `Em andamento...`}
                    </p>
                  </div>
                )}

                {isFailed && run.last_error && (
                  <p className="text-[11px] text-red-600 mt-2 leading-relaxed">Erro: {run.last_error}</p>
                )}
              </>
            )}

            {error && <p className="text-[11px] text-red-600 mt-2">{error}</p>}
            {purgeResult !== null && (
              <p className="text-[11px] text-emerald-600 mt-2">
                {purgeResult === 0
                  ? 'Nenhum lead sem conversa foi encontrado.'
                  : `${purgeResult.toLocaleString('pt-BR')} leads sem conversa removidos. Re-sincronizando...`}
              </p>
            )}

            <div className="mt-3 flex items-center gap-2 flex-wrap">
              {isTimeout && (
                <Button size="sm" onClick={() => runSync('resume')} loading={syncing}>
                  <RefreshCw size={14} /> Continuar sincronização
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => runSync('force')} loading={syncing}>
                <RefreshCw size={14} /> Re-sincronizar tudo
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={runCleanAndResync}
                loading={purging}
                className="text-red-600 hover:bg-red-50"
              >
                <Trash2 size={14} /> Limpar leads sem conversa e re-sincronizar
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <BackfillCard
        icon={<ImageIcon size={18} className="text-sky-500" />}
        iconBg="bg-sky-50"
        title="Fotos de perfil"
        description="Busca as fotos dos contatos diretamente no WhatsApp via Evolution."
        done={picturesDone}
        total={progress.totalLeads}
        pct={picturesPct}
        pending={progress.picturesMissing}
        barClass="bg-sky-400"
        onRun={() => runBackfillPictures(false)}
        onForce={() => runBackfillPictures(true)}
        loading={backfillingPics}
        pendingLabel="sem foto"
        doneLabel="com foto"
      />

      <BackfillCard
        icon={<History size={18} className="text-emerald-500" />}
        iconBg="bg-emerald-50"
        title="Histórico completo de conversas"
        description="Baixa até 2.000 mensagens por conversa em segundo plano."
        done={historyDone}
        total={progress.totalLeads}
        pct={historyPct}
        pending={progress.historyPending}
        barClass="bg-emerald-400"
        onRun={() => runBackfillHistory(false)}
        onForce={() => runBackfillHistory(true)}
        loading={backfillingHistory}
        pendingLabel="pendentes"
        doneLabel="hidratadas"
      />
    </motion.div>
  );
}

function BackfillCard({
  icon,
  iconBg,
  title,
  description,
  done,
  total,
  pct,
  pending,
  barClass,
  onRun,
  onForce,
  loading,
  pendingLabel,
  doneLabel,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  description: string;
  done: number;
  total: number;
  pct: number;
  pending: number;
  barClass: string;
  onRun: () => void;
  onForce: () => void;
  loading: boolean;
  pendingLabel: string;
  doneLabel: string;
}) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
            <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">
              {total > 0 ? `${pct}%` : '—'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{description}</p>

          {total > 0 ? (
            <div className="mt-3">
              <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct}%` }} />
              </div>
              <p className="text-[11px] text-gray-500 mt-1.5">
                {done.toLocaleString('pt-BR')} {doneLabel} · {pending.toLocaleString('pt-BR')} {pendingLabel}
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-gray-500 mt-2">
              Nenhuma conversa encontrada ainda.
            </p>
          )}

          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <Button size="sm" onClick={onRun} loading={loading} disabled={total === 0}>
              <RefreshCw size={14} /> {pending > 0 ? 'Continuar' : 'Rodar agora'}
            </Button>
            <Button variant="secondary" size="sm" onClick={onForce} loading={loading} disabled={total === 0}>
              <RefreshCw size={14} /> Forçar reprocessamento
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Stat({
  label,
  value,
  highlight,
  muted,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-3 py-2 border ${
        highlight
          ? 'bg-emerald-50 border-emerald-100'
          : muted
          ? 'bg-gray-50 border-gray-100'
          : 'bg-white border-gray-100'
      }`}
    >
      <div
        className={`text-[10px] uppercase tracking-wide font-semibold ${
          highlight ? 'text-emerald-700' : 'text-gray-500'
        }`}
      >
        {label}
      </div>
      <div
        className={`text-base font-bold leading-tight mt-0.5 ${
          highlight ? 'text-emerald-700' : 'text-gray-900'
        }`}
      >
        {value.toLocaleString('pt-BR')}
      </div>
    </div>
  );
}
