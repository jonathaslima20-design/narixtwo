import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Smartphone,
  AlertCircle,
  RefreshCw,
  Wifi,
  WifiOff,
  QrCode,
  RotateCcw,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
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
    body: body ? JSON.stringify(body) : undefined,
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

export function ConnectWhatsApp({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [limit, setLimit] = useState<number>(1);
  const [loading, setLoading] = useState(true);
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadInstances = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    setInstances((data as WhatsAppInstance[]) ?? []);

    const { data: limitRpc } = await supabase.rpc('resolve_whatsapp_instance_limit', {
      p_user_id: user.id,
    });
    if (typeof limitRpc === 'number') setLimit(limitRpc);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    loadInstances();
  }, [loadInstances]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`whatsapp-instances-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadInstances();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadInstances]);

  async function handleCreateInstance() {
    if (!newName.trim()) {
      setError('Informe um nome para a instância.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const result = await callEdge<{ instance: WhatsAppInstance }>('whatsapp-connect', {
        display_name: newName.trim(),
      });
      setShowAddModal(false);
      setNewName('');
      setActiveInstanceId(result.instance.id);
      await loadInstances();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Erro ao criar instância');
    } finally {
      setCreating(false);
    }
  }

  async function handleReconnect(instance: WhatsAppInstance, reset = false) {
    setError('');
    try {
      const result = await callEdge<{ instance: WhatsAppInstance }>('whatsapp-connect', {
        instance_id: instance.id,
        reset,
      });
      setActiveInstanceId(result.instance.id);
      await loadInstances();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Erro ao reconectar');
    }
  }

  async function handleDisconnect(instance: WhatsAppInstance) {
    try {
      await callEdge('whatsapp-disconnect', { instance_id: instance.id });
      await loadInstances();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Erro ao desconectar');
    }
  }

  async function handleRemove(instance: WhatsAppInstance) {
    if (!confirm(`Remover a instância "${instance.display_name || instance.phone_number || instance.instance_name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await callEdge('whatsapp-disconnect', { instance_id: instance.id, remove: true });
      if (activeInstanceId === instance.id) setActiveInstanceId(null);
      await loadInstances();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Erro ao remover');
    }
  }

  const activeInstance = instances.find((i) => i.id === activeInstanceId) ?? null;
  const canAdd = limit < 0 || instances.length < limit;
  const limitLabel = limit < 0 ? 'Ilimitado' : `${instances.length}/${limit}`;

  const content = (
    <div className="max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {loading ? (
          <Card>
            <div className="flex flex-col items-center py-8 gap-3">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
              <p className="text-sm text-gray-400">Carregando instâncias...</p>
            </div>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Instâncias conectadas</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Uso: <span className="font-medium text-gray-700">{limitLabel}</span>
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setNewName('');
                  setError('');
                  setShowAddModal(true);
                }}
                disabled={!canAdd}
                title={!canAdd ? 'Limite atingido. Contate o suporte para aumentar.' : ''}
              >
                <Plus size={14} />
                Nova instância
              </Button>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs px-3 py-2 rounded-xl mb-3">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {instances.length === 0 ? (
              <Card>
                <div className="flex flex-col items-center text-center py-8">
                  <div className="w-14 h-14 bg-gray-50 rounded-2xl flex items-center justify-center mb-4">
                    <Smartphone size={26} className="text-gray-400" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-1">Nenhuma instância</h3>
                  <p className="text-sm text-gray-500 mb-5 max-w-xs">
                    Adicione sua primeira instância para começar a receber e enviar mensagens.
                  </p>
                  <Button onClick={() => setShowAddModal(true)} disabled={!canAdd}>
                    <QrCode size={16} />
                    Adicionar primeira instância
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {instances.map((inst) => (
                  <InstanceCard
                    key={inst.id}
                    instance={inst}
                    onOpenQr={() => setActiveInstanceId(inst.id)}
                    onReconnect={() => handleReconnect(inst, true)}
                    onDisconnect={() => handleDisconnect(inst)}
                    onRemove={() => handleRemove(inst)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </motion.div>

      {showAddModal && (
        <AddInstanceModal
          name={newName}
          onChange={setNewName}
          onClose={() => setShowAddModal(false)}
          onCreate={handleCreateInstance}
          loading={creating}
          error={error}
        />
      )}

      {activeInstance && activeInstance.status === 'connecting' && isValidQr(activeInstance.qr_code) && (
        <QrModal
          instance={activeInstance}
          onClose={() => setActiveInstanceId(null)}
          onRefresh={() => handleReconnect(activeInstance, false)}
          onForceReset={() => handleReconnect(activeInstance, true)}
        />
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Conectar WhatsApp</h1>
        <p className="text-sm text-gray-500 mt-1">
          Gerencie seus números conectados. O limite é definido pelo administrador.
        </p>
      </div>
      {content}
    </div>
  );
}

function InstanceCard({
  instance,
  onOpenQr,
  onReconnect,
  onDisconnect,
  onRemove,
}: {
  instance: WhatsAppInstance;
  onOpenQr: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
  onRemove: () => void;
}) {
  const title = instance.display_name?.trim() || instance.phone_number || 'Sem apelido';
  const subtitle = instance.phone_number || instance.instance_name;
  const status = instance.status;
  const statusMap: Record<string, { label: string; color: string; icon: typeof Wifi }> = {
    connected: { label: 'Conectado', color: 'text-emerald-600 bg-emerald-50', icon: Wifi },
    connecting: { label: 'Aguardando QR', color: 'text-amber-600 bg-amber-50', icon: QrCode },
    disconnected: { label: 'Desconectado', color: 'text-gray-500 bg-gray-100', icon: WifiOff },
    error: { label: 'Erro', color: 'text-red-600 bg-red-50', icon: AlertCircle },
  };
  const s = statusMap[status] || statusMap.disconnected;
  const Icon = s.icon;

  return (
    <Card>
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 bg-gray-50 rounded-xl flex items-center justify-center shrink-0">
          <Smartphone size={18} className="text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{title}</p>
          <p className="text-xs text-gray-500 truncate">{subtitle}</p>
          <div className="flex items-center gap-1.5 mt-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${s.color}`}>
              <Icon size={10} />
              {s.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {status === 'connecting' && (
            <Button size="sm" variant="ghost" onClick={onOpenQr}>
              <QrCode size={13} />
              QR
            </Button>
          )}
          {status === 'connected' && (
            <Button size="sm" variant="secondary" onClick={onDisconnect}>
              <WifiOff size={13} />
              Desconectar
            </Button>
          )}
          {status !== 'connected' && (
            <Button size="sm" variant="ghost" onClick={onReconnect}>
              <RotateCcw size={13} />
              Reconectar
            </Button>
          )}
          <button
            onClick={onRemove}
            className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
            title="Remover instância"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </Card>
  );
}

function AddInstanceModal({
  name,
  onChange,
  onClose,
  onCreate,
  loading,
  error,
}: {
  name: string;
  onChange: (v: string) => void;
  onClose: () => void;
  onCreate: () => void;
  loading: boolean;
  error: string;
}) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Nova instância</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
            >
              <X size={16} />
            </button>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">
                Apelido (ex: Vendas, Suporte)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => onChange(e.target.value)}
                placeholder="Apelido da instância"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10"
              />
            </div>
            {error && (
              <div className="flex items-start gap-2 bg-red-50 text-red-700 text-xs px-3 py-2 rounded-xl">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button size="sm" variant="ghost" onClick={onClose} disabled={loading}>
                Cancelar
              </Button>
              <Button size="sm" onClick={onCreate} loading={loading}>
                <QrCode size={14} />
                Gerar QR Code
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function QrModal({
  instance,
  onClose,
  onRefresh,
  onForceReset,
}: {
  instance: WhatsAppInstance;
  onClose: () => void;
  onRefresh: () => void;
  onForceReset: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(QR_LIFETIME_SECONDS);
  const autoRefreshRef = useRef(false);

  useEffect(() => {
    autoRefreshRef.current = false;
    function tick() {
      if (!instance.qr_updated_at) return;
      const issuedAt = new Date(instance.qr_updated_at).getTime();
      const elapsed = Math.floor((Date.now() - issuedAt) / 1000);
      const remaining = Math.max(0, QR_LIFETIME_SECONDS - elapsed);
      setSecondsLeft(remaining);
      if (remaining === 0 && !autoRefreshRef.current) {
        autoRefreshRef.current = true;
        onRefresh();
      }
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [instance.qr_updated_at, onRefresh]);

  useEffect(() => {
    if (instance.status === 'connected') {
      onClose();
    }
  }, [instance.status, onClose]);

  const qrSrc = instance.qr_code.startsWith('data:image')
    ? instance.qr_code
    : `data:image/png;base64,${instance.qr_code}`;
  const expired = secondsLeft === 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-white rounded-2xl shadow-xl w-full max-w-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Escaneie o QR Code</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
              <X size={16} />
            </button>
          </div>
          <div className="p-5 flex flex-col items-center text-center">
            {instance.display_name && (
              <p className="text-xs text-gray-500 mb-3">
                Instância: <span className="font-semibold text-gray-700">{instance.display_name}</span>
              </p>
            )}
            <div className="relative w-56 h-56 bg-white border border-gray-100 rounded-2xl flex items-center justify-center mb-4 p-2">
              <img
                src={qrSrc}
                alt="QR Code"
                className={`w-full h-full rounded-xl object-contain transition ${expired ? 'opacity-30 blur-sm' : ''}`}
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
                {expired ? 'Gerando novo código...' : `Aguardando leitura... expira em ${secondsLeft}s`}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onRefresh}>
                <RefreshCw size={14} />
                Novo QR
              </Button>
              <Button variant="secondary" size="sm" onClick={onForceReset}>
                <RotateCcw size={14} />
                Reiniciar
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

