import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, CheckCircle2, AlertCircle, RefreshCw, Wifi, WifiOff, QrCode, RotateCcw, Trash2, ShieldAlert } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { WhatsAppInstance } from '../../lib/types';
import { WipeChatDialog } from '../../components/settings/WipeChatDialog';

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

async function callEdge<T>(
  path: string,
  method: 'GET' | 'POST' = 'POST',
  body?: unknown,
): Promise<T> {
  const token = await getFreshAccessToken();
  if (!token) {
    throw new Error('Sua sessão expirou. Faça login novamente.');
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${path}`, {
    method,
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
      (typeof obj.msg === 'string' && obj.msg) ||
      `Erro ${res.status}`;
    const details = typeof obj.details === 'string' && obj.details ? ` (${obj.details})` : '';
    throw new Error(`${message}${details}`);
  }
  return json as T;
}

export function ConnectWhatsApp({ embedded = false }: { embedded?: boolean } = {}) {
  const { user } = useAuth();
  const [instance, setInstance] = useState<WhatsAppInstance | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [imgError, setImgError] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(QR_LIFETIME_SECONDS);
  const pollingRef = useRef<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const autoRefreshTriggeredRef = useRef(false);

  const loadInstance = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();
    setInstance(data);
    setLoading(false);
  }, [user?.id]);

  const pollStatus = useCallback(async () => {
    try {
      const result = await callEdge<{ instance: WhatsAppInstance | null }>('whatsapp-status', 'POST');
      if (result.instance) setInstance(result.instance);
    } catch {
      // silent polling error
    }
  }, []);

  useEffect(() => {
    loadInstance();
  }, [loadInstance]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`whatsapp-instance-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'whatsapp_instances',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setInstance(null);
          } else if (payload.new) {
            setInstance(payload.new as WhatsAppInstance);
            setImgError(false);
            autoRefreshTriggeredRef.current = false;
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!instance) return;
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
  }, [instance, pollStatus]);

  async function generateQRCode(forceReset = false) {
    setGenerating(true);
    setError('');
    setImgError(false);
    autoRefreshTriggeredRef.current = false;
    try {
      const result = await callEdge<{ instance: WhatsAppInstance }>(
        'whatsapp-connect',
        'POST',
        forceReset ? { reset: true } : {},
      );
      setInstance(result.instance);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Erro ao gerar QR Code');
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (!instance || instance.status !== 'connecting' || !instance.qr_updated_at) {
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
        generateQRCode(false);
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
  }, [instance?.qr_updated_at, instance?.status]);

  async function disconnect() {
    try {
      await callEdge('whatsapp-disconnect', 'POST');
      await loadInstance();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Erro ao desconectar');
    }
  }

  const status = instance?.status;
  const hasValidQr = isValidQr(instance?.qr_code);
  const lastError = (instance?.last_error || '').trim();
  const [wipeOpen, setWipeOpen] = useState(false);

  const content = (
    <>
      <div className="max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>

          {loading ? (
            <Card>
              <div className="flex flex-col items-center py-8 gap-3">
                <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-900 rounded-full animate-spin" />
                <p className="text-sm text-gray-400">Verificando conexão...</p>
              </div>
            </Card>
          ) : status === 'connected' ? (
            <ConnectedState instance={instance!} onDisconnect={disconnect} />
          ) : status === 'connecting' && hasValidQr && !imgError ? (
            <QRCodeState
              instance={instance!}
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

          {user?.id && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-6"
            >
              <Card>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-red-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <ShieldAlert size={18} className="text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-gray-900">Limpar dados do BrainLead</h4>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      Apaga todas as conversas, mensagens e áudios salvos aqui no BrainLead. As mensagens originais no
                      WhatsApp não são afetadas e o histórico será re-importado automaticamente após a limpeza.
                    </p>
                    <div className="mt-3">
                      <Button variant="danger" size="sm" onClick={() => setWipeOpen(true)}>
                        <Trash2 size={14} /> Limpar todas as conversas
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </motion.div>
      </div>

      {user?.id && (
        <WipeChatDialog
          open={wipeOpen}
          userId={user.id}
          onClose={() => setWipeOpen(false)}
          onWiped={() => {
            loadInstance();
          }}
        />
      )}
    </>
  );

  if (embedded) return content;

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Conectar WhatsApp</h1>
        <p className="text-sm text-gray-500 mt-1">
          Conecte seu numero para comecar a capturar e qualificar leads automaticamente.
        </p>
      </div>
      {content}
    </div>
  );
}

function ConnectedState({ instance, onDisconnect }: { instance: WhatsAppInstance; onDisconnect: () => void }) {
  return (
    <div className="space-y-4">
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
    </div>
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
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Nenhum dispositivo conectado</h3>
        <p className="text-sm text-gray-500 mb-6 max-w-xs">
          Clique no botão abaixo para gerar um QR Code e vincular seu WhatsApp.
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
