import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  QrCode,
  RotateCcw,
  Plus,
  Trash2,
  Pencil,
  ArrowLeft,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { WhatsAppInstance } from '../../lib/types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const QR_LIFETIME_SECONDS = 40;

function isValidQr(qr: string | null | undefined): qr is string {
  if (!qr || typeof qr !== 'string') return false;
  if (qr.startsWith('data:image')) return qr.length > 50;
  if (qr.startsWith('SIMULATED')) return false;
  if (qr.length < 100) return false;
  return /^[A-Za-z0-9+/=\s]+$/.test(qr);
}

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

async function callEdge<T>(path: string, body?: unknown): Promise<T> {
  const token = await getFreshAccessToken();
  if (!token) throw new Error('Sua sessão expirou. Faça login novamente.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON,
    },
    body: body ? JSON.stringify(body) : JSON.stringify({}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const obj = (json && typeof json === 'object' ? json : {}) as Record<string, unknown>;
    const message =
      (typeof obj.error === 'string' && obj.error) ||
      (typeof obj.message === 'string' && obj.message) ||
      `Erro ${res.status}`;
    throw new Error(message);
  }
  return json as T;
}

interface Limits {
  planLimit: number;
  override: number | null;
  effective: number;
}

export function ConnectWhatsApp({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [limits, setLimits] = useState<Limits>({ planLimit: 1, override: null, effective: 1 });
  const [loading, setLoading] = useState(true);
  const [activeInstance, setActiveInstance] = useState<WhatsAppInstance | null>(null);
  const [creating, setCreating] = useState(false);

  const loadAll = useCallback(async () => {
    if (!user?.id) return;
    const [{ data: inst }, { data: sub }] = await Promise.all([
      supabase
        .from('whatsapp_instances')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true }),
      supabase
        .from('client_subscriptions')
        .select('max_instances_override, plans(max_whatsapp_instances)')
        .eq('user_id', user.id)
        .maybeSingle(),
    ]);
    setInstances((inst ?? []) as WhatsAppInstance[]);
    const plan = (sub?.plans as { max_whatsapp_instances?: number } | null | undefined) ?? null;
    const planLimit = plan?.max_whatsapp_instances ?? 1;
    const override = (sub as { max_instances_override?: number | null } | null)?.max_instances_override ?? null;
    const effective = override !== null ? override : planLimit;
    setLimits({ planLimit, override, effective });
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`whatsapp-instances-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_instances', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id?: string })?.id;
            if (deletedId) {
              setInstances((prev) => prev.filter((i) => i.id !== deletedId));
              setActiveInstance((cur) => (cur?.id === deletedId ? null : cur));
            }
          } else if (payload.new) {
            const row = payload.new as WhatsAppInstance;
            setInstances((prev) => {
              const idx = prev.findIndex((i) => i.id === row.id);
              if (idx === -1) return [...prev, row];
              const next = prev.slice();
              next[idx] = row;
              return next;
            });
            setActiveInstance((cur) => (cur?.id === row.id ? row : cur));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  async function startNewInstance(label: string) {
    setCreating(true);
    try {
      const result = await callEdge<{ instance: WhatsAppInstance }>('whatsapp-connect', { label });
      setInstances((prev) => [...prev, result.instance]);
      setActiveInstance(result.instance);
    } catch (err) {
      const e = err as { message?: string };
      alert(e.message || 'Erro ao criar instância');
    } finally {
      setCreating(false);
    }
  }

  async function removeInstance(instance: WhatsAppInstance) {
    if (!confirm('Remover esta instância? A conexão será desfeita.')) return;
    try {
      await callEdge('whatsapp-disconnect', { instance_id: instance.id, delete: true });
      setInstances((prev) => prev.filter((i) => i.id !== instance.id));
      if (activeInstance?.id === instance.id) setActiveInstance(null);
    } catch (err) {
      const e = err as { message?: string };
      alert(e.message || 'Erro ao remover instância');
    }
  }

  async function renameInstance(instance: WhatsAppInstance) {
    const next = prompt('Novo nome para esta instância:', instance.label || '');
    if (next === null) return;
    const newLabel = next.trim().slice(0, 60);
    const { error } = await supabase
      .from('whatsapp_instances')
      .update({ label: newLabel })
      .eq('id', instance.id);
    if (error) {
      alert('Erro ao renomear');
      return;
    }
    setInstances((prev) => prev.map((i) => (i.id === instance.id ? { ...i, label: newLabel } : i)));
  }

  const atLimit = limits.effective !== -1 && instances.length >= limits.effective;

  const content = (
    <div className="max-w-3xl mx-auto">
      {loading ? (
        <Card>
          <div className="flex flex-col items-center py-8 gap-3">
            <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
            <p className="text-sm text-gray-400">Carregando...</p>
          </div>
        </Card>
      ) : activeInstance ? (
        <InstanceDetail
          instance={activeInstance}
          onBack={() => setActiveInstance(null)}
          onUpdate={(updated) => {
            setActiveInstance(updated);
            setInstances((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
          }}
          onRemoved={() => {
            setInstances((prev) => prev.filter((i) => i.id !== activeInstance.id));
            setActiveInstance(null);
          }}
        />
      ) : (
        <InstanceList
          instances={instances}
          limits={limits}
          atLimit={atLimit}
          creating={creating}
          onSelect={setActiveInstance}
          onCreate={startNewInstance}
          onRename={renameInstance}
          onRemove={removeInstance}
        />
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Conectar WhatsApp</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gerencie suas instâncias de WhatsApp. Você pode conectar múltiplos números conforme o limite do seu plano.
        </p>
      </div>
      {content}
    </div>
  );
}

function InstanceList({
  instances,
  limits,
  atLimit,
  creating,
  onSelect,
  onCreate,
  onRename,
  onRemove,
}: {
  instances: WhatsAppInstance[];
  limits: Limits;
  atLimit: boolean;
  creating: boolean;
  onSelect: (i: WhatsAppInstance) => void;
  onCreate: (label: string) => void;
  onRename: (i: WhatsAppInstance) => void;
  onRemove: (i: WhatsAppInstance) => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  const limitLabel =
    limits.effective === -1 ? 'ilimitadas' : `${instances.length}/${limits.effective}`;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-semibold text-gray-900">Instâncias do WhatsApp</p>
            <p className="text-xs text-gray-500 mt-0.5">Uso: {limitLabel}</p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowCreate(true)}
            disabled={atLimit || creating}
            loading={creating}
          >
            <Plus size={14} />
            Nova instância
          </Button>
        </div>
        {atLimit && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Limite de instâncias atingido. Fale com o administrador para aumentar.
          </div>
        )}
      </Card>

      {instances.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center text-center py-8">
            <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-3">
              <Smartphone size={28} className="text-gray-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">Nenhuma instância conectada</h3>
            <p className="text-sm text-gray-500 mb-4 max-w-xs">
              Crie sua primeira instância para começar a usar o WhatsApp.
            </p>
            <Button onClick={() => setShowCreate(true)} disabled={atLimit}>
              <Plus size={16} />
              Conectar WhatsApp
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {instances.map((inst) => (
            <InstanceCard
              key={inst.id}
              instance={inst}
              onSelect={() => onSelect(inst)}
              onRename={() => onRename(inst)}
              onRemove={() => onRemove(inst)}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Nova instância</h3>
              <p className="text-sm text-gray-500 mb-4">
                Dê um nome para identificar este número (ex: Vendas, Suporte).
              </p>
              <Input
                label="Nome"
                placeholder="Ex: Atendimento"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                autoFocus
              />
              <div className="flex gap-3 mt-5">
                <Button variant="ghost" fullWidth onClick={() => setShowCreate(false)}>
                  Cancelar
                </Button>
                <Button
                  fullWidth
                  onClick={() => {
                    onCreate(newLabel.trim());
                    setShowCreate(false);
                    setNewLabel('');
                  }}
                >
                  Criar e gerar QR
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InstanceCard({
  instance,
  onSelect,
  onRename,
  onRemove,
}: {
  instance: WhatsAppInstance;
  onSelect: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const status = instance.status;
  const statusColor =
    status === 'connected'
      ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
      : status === 'connecting'
        ? 'bg-amber-50 text-amber-600 border border-amber-100'
        : 'bg-gray-50 text-gray-500 border border-gray-100';
  const statusLabel =
    status === 'connected'
      ? 'Conectado'
      : status === 'connecting'
        ? 'Conectando'
        : 'Desconectado';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-sm transition-shadow cursor-pointer"
      onClick={onSelect}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
          <Smartphone size={18} className="text-white" />
        </div>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
          {statusLabel}
        </span>
      </div>
      <p className="text-sm font-semibold text-gray-900 truncate">
        {instance.label?.trim() || 'Sem nome'}
      </p>
      <p className="text-xs text-gray-500 truncate mt-0.5">
        {instance.phone_number || 'Não conectado'}
      </p>
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
        <button
          onClick={(e) => { e.stopPropagation(); onRename(); }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Pencil size={12} /> Renomear
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors ml-auto"
        >
          <Trash2 size={12} /> Remover
        </button>
      </div>
    </motion.div>
  );
}

function InstanceDetail({
  instance,
  onBack,
  onUpdate,
  onRemoved,
}: {
  instance: WhatsAppInstance;
  onBack: () => void;
  onUpdate: (i: WhatsAppInstance) => void;
  onRemoved: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [imgError, setImgError] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(QR_LIFETIME_SECONDS);
  const pollingRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const autoRefreshTriggeredRef = useRef(false);

  const pollStatus = useCallback(async () => {
    try {
      const result = await callEdge<{ instance: WhatsAppInstance | null }>(
        'whatsapp-status',
        { instance_id: instance.id },
      );
      if (result.instance) onUpdate(result.instance);
    } catch {
      // silent
    }
  }, [instance.id, onUpdate]);

  useEffect(() => {
    if (instance.status === 'connected' || instance.status === 'disconnected') {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }
    if (pollingRef.current) return;
    pollingRef.current = window.setInterval(pollStatus, 4000);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [instance.status, pollStatus]);

  useEffect(() => {
    if (instance.status !== 'connecting' || !instance.qr_updated_at) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      setSecondsLeft(QR_LIFETIME_SECONDS);
      return;
    }
    const tick = () => {
      const issuedAt = new Date(instance.qr_updated_at as string).getTime();
      const elapsed = Math.floor((Date.now() - issuedAt) / 1000);
      const remaining = Math.max(0, QR_LIFETIME_SECONDS - elapsed);
      setSecondsLeft(remaining);
      if (remaining === 0 && !autoRefreshTriggeredRef.current && !generating) {
        autoRefreshTriggeredRef.current = true;
        void generateQRCode(false);
      }
    };
    tick();
    countdownRef.current = window.setInterval(tick, 1000);
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.qr_updated_at, instance.status]);

  async function generateQRCode(forceReset: boolean) {
    setGenerating(true);
    setError('');
    setImgError(false);
    autoRefreshTriggeredRef.current = false;
    try {
      const result = await callEdge<{ instance: WhatsAppInstance }>('whatsapp-connect', {
        instance_id: instance.id,
        reset: forceReset,
      });
      onUpdate(result.instance);
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Erro ao gerar QR Code');
    } finally {
      setGenerating(false);
    }
  }

  async function disconnect() {
    try {
      await callEdge('whatsapp-disconnect', { instance_id: instance.id });
      await pollStatus();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Erro ao desconectar');
    }
  }

  async function remove() {
    if (!confirm('Remover esta instância? A conexão será desfeita.')) return;
    try {
      await callEdge('whatsapp-disconnect', { instance_id: instance.id, delete: true });
      onRemoved();
    } catch (err) {
      const e = err as { message?: string };
      setError(e.message || 'Erro ao remover');
    }
  }

  const status = instance.status;
  const hasValidQr = isValidQr(instance.qr_code);
  const lastError = (instance.last_error || '').trim();

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft size={14} /> Voltar para instâncias
      </button>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
          <Smartphone size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="text-base font-semibold text-gray-900">{instance.label?.trim() || 'Sem nome'}</p>
          <p className="text-xs text-gray-500">{instance.phone_number || 'Não conectado'}</p>
        </div>
        <button
          onClick={remove}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={12} /> Remover
        </button>
      </div>

      {status === 'connected' ? (
        <ConnectedState instance={instance} onDisconnect={disconnect} />
      ) : status === 'connecting' && hasValidQr && !imgError ? (
        <QRCodeState
          instance={instance}
          onRefresh={() => generateQRCode(false)}
          onForceReset={() => generateQRCode(true)}
          refreshing={generating}
          secondsLeft={secondsLeft}
          lastError={lastError}
          onImageError={() => setImgError(true)}
        />
      ) : (
        <DisconnectedState
          onConnect={() => generateQRCode(true)}
          loading={generating}
          error={error || lastError}
        />
      )}
    </div>
  );
}

function ConnectedState({ instance, onDisconnect }: { instance: WhatsAppInstance; onDisconnect: () => void }) {
  return (
    <Card>
      <div className="flex flex-col items-center text-center py-6">
        <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mb-4">
          <CheckCircle2 size={28} className="text-emerald-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-1">WhatsApp Conectado</h3>
        <p className="text-sm text-gray-500 mb-1">
          {instance.phone_number || 'Número conectado com sucesso'}
        </p>
        <div className="flex items-center gap-1.5 mb-6">
          <Wifi size={12} className="text-emerald-500" />
          <span className="text-xs text-emerald-600 font-medium">Online</span>
        </div>
        <Button variant="secondary" onClick={onDisconnect} size="sm">
          <WifiOff size={14} />
          Desconectar
        </Button>
      </div>
    </Card>
  );
}

function QRCodeState({
  instance,
  onRefresh,
  onForceReset,
  refreshing,
  secondsLeft,
  lastError,
  onImageError,
}: {
  instance: WhatsAppInstance;
  onRefresh: () => void;
  onForceReset: () => void;
  refreshing: boolean;
  secondsLeft: number;
  lastError: string;
  onImageError: () => void;
}) {
  const qrSrc = instance.qr_code.startsWith('data:image')
    ? instance.qr_code
    : `data:image/png;base64,${instance.qr_code}`;
  const expired = secondsLeft === 0;

  return (
    <Card>
      <div className="flex flex-col items-center text-center">
        <h3 className="text-base font-semibold text-gray-900 mb-1">Escaneie o QR Code</h3>
        <p className="text-sm text-gray-500 mb-5">
          Abra o WhatsApp no seu celular, toque em <strong>Dispositivos vinculados</strong> e escaneie o código.
        </p>
        <div className="relative w-56 h-56 bg-white border border-gray-100 rounded-2xl flex items-center justify-center mb-4 p-2">
          <img
            src={qrSrc}
            alt="QR Code"
            className={`w-full h-full rounded-xl object-contain transition ${expired ? 'opacity-30 blur-sm' : ''}`}
            onError={onImageError}
          />
          {expired && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs font-semibold text-gray-600 bg-white/90 px-3 py-1.5 rounded-full border border-gray-200">
                QR expirado
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mb-4">
          <div className={`w-2 h-2 rounded-full ${expired ? 'bg-gray-300' : 'bg-amber-400 animate-pulse'}`} />
          <span className="text-xs font-medium text-gray-600">
            {expired
              ? 'Gerando novo código...'
              : `Aguardando leitura... expira em ${secondsLeft}s`}
          </span>
        </div>
        {lastError && (
          <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs px-3 py-2 rounded-xl mb-4 w-full text-left">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{lastError}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onRefresh} loading={refreshing}>
            <RefreshCw size={14} />
            Novo QR
          </Button>
          <Button variant="secondary" size="sm" onClick={onForceReset} loading={refreshing}>
            <RotateCcw size={14} />
            Forçar nova conexão
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DisconnectedState({
  onConnect,
  loading,
  error,
}: {
  onConnect: () => void;
  loading: boolean;
  error: string;
}) {
  return (
    <Card>
      <div className="flex flex-col items-center text-center py-6">
        <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
          <Smartphone size={28} className="text-gray-400" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Instância desconectada</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-xs">
          Clique no botão abaixo para gerar um QR Code e vincular o WhatsApp.
        </p>
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex items-start gap-2 bg-red-50 text-red-600 text-sm px-4 py-2 rounded-xl mb-4 w-full text-left"
            >
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <Button onClick={onConnect} loading={loading} size="lg">
          <QrCode size={16} />
          Gerar QR Code
        </Button>
      </div>
    </Card>
  );
}
