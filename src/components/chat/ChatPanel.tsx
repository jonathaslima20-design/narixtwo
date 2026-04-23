import { useEffect, useRef, useState } from 'react';
import { Phone, MoreVertical, Sparkles, Info, WifiOff, Trash2 } from 'lucide-react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { supabase } from '../../lib/supabase';
import { Lead, Message, AISuggestion, SendMode } from '../../lib/types';
import { MessageBubble } from './MessageBubble';
import { ChatComposer } from './ChatComposer';
import { PresenceIndicator, PresenceState } from './PresenceIndicator';
import { RecordingResult } from '../../lib/useAudioRecorder';
import { leadDisplayName, leadPhoneLabel, isPrivateContact } from '../../lib/leadDisplay';
import { useSubscriptionCtx } from '../../lib/SubscriptionContext';
import { PricingModal } from '../ui/PricingModal';

type LeadPatch = Partial<Lead> & { id: string };

function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function sortMessages(list: Message[]): Message[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

function formatDaySeparator(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return 'Hoje';
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return 'Ontem';
  const diffDays = (today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 7) {
    return d.toLocaleDateString('pt-BR', { weekday: 'long' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

interface Props {
  lead: Lead;
  userId: string;
  sendMode: SendMode;
  onOpenDetails: () => void;
  onLeadUpdated: (patch: LeadPatch) => void;
  onLeadDeleted?: (id: string) => void;
}

type InstanceStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'unknown';

export function ChatPanel({ lead, userId, sendMode, onOpenDetails, onLeadUpdated, onLeadDeleted }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingSuggestion, setPendingSuggestion] = useState<AISuggestion | null>(null);
  const [instanceStatus, setInstanceStatus] = useState<InstanceStatus>('unknown');
  const [failureDetails, setFailureDetails] = useState<Record<string, string>>({});
  const [retryPayloads, setRetryPayloads] = useState<Record<string, () => Promise<void>>>({});
  const [presence, setPresence] = useState<{ state: PresenceState; updatedAt: number } | null>(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const headerMenuRef = useRef<HTMLDivElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const { isBlocked, incrementSendCount } = useSubscriptionCtx();

  useEffect(() => {
    if (!headerMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (headerMenuRef.current && !headerMenuRef.current.contains(e.target as Node)) {
        setHeaderMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [headerMenuOpen]);

  useEffect(() => {
    if (!lead.profile_picture_url) {
      supabase.functions
        .invoke('whatsapp-refresh-contact', { body: { lead_id: lead.id } })
        .catch(() => {
          /* best-effort */
        });
    }
  }, [lead.id, lead.profile_picture_url]);

  useEffect(() => {
    setMessages([]);
    setPendingSuggestion(null);

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let currentChannel: ReturnType<typeof supabase.channel> | null = null;
    let isSubscribed = false;
    const currentLeadId = lead.id;

    async function fetchMessages() {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('lead_id', currentLeadId)
        .order('created_at', { ascending: false })
        .limit(500);
      if (cancelled) return;
      const incoming = ((data as Message[]) || []).slice().reverse();
      setMessages((prev) => {
        const optimistic = prev.filter(
          (m) => m.id.startsWith('temp-') && (m as Message & { lead_id?: string }).lead_id === currentLeadId,
        );
        const serverIds = new Set(incoming.map((m) => m.id));
        const keepOptimistic = optimistic.filter((m) => !serverIds.has(m.id));
        return sortMessages([...incoming, ...keepOptimistic]);
      });
    }

    async function load() {
      setLoading(true);
      await fetchMessages();
      setLoading(false);

      const { data: sug } = await supabase
        .from('ai_suggestions')
        .select('*')
        .eq('lead_id', currentLeadId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      setPendingSuggestion((sug as AISuggestion) || null);

      if ((lead.unread_count ?? 0) > 0) {
        await supabase.from('leads').update({ unread_count: 0 }).eq('id', currentLeadId);
        if (!cancelled) onLeadUpdated({ id: currentLeadId, unread_count: 0 });
      }
    }

    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        if (!isSubscribed) fetchMessages();
      }, 7000);
    }

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    function scheduleReconnect() {
      if (reconnectTimer || cancelled) return;
      reconnectTimer = setTimeout(async () => {
        reconnectTimer = null;
        try {
          await supabase.auth.refreshSession();
        } catch (_) {
          // best-effort
        }
        if (!cancelled) subscribeChannel();
      }, 2500);
    }

    function subscribeChannel() {
      if (cancelled) return;
      if (currentChannel) {
        supabase.removeChannel(currentChannel);
        currentChannel = null;
      }

      const channelName = `chat-${currentLeadId}-${Math.random().toString(36).slice(2, 8)}`;
      const ch = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `lead_id=eq.${currentLeadId}` },
          (payload) => {
            if (cancelled) return;
            const row = payload.new as Message;
            if (row.lead_id !== currentLeadId) return;
            setMessages((m) => {
              if (m.some((x) => x.id === row.id)) return m;
              const withoutOptimisticMatch = m.filter(
                (x) =>
                  !(
                    x.id.startsWith('temp-') &&
                    x.direction === row.direction &&
                    x.content === row.content
                  ),
              );
              return sortMessages([...withoutOptimisticMatch, row]);
            });
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `lead_id=eq.${currentLeadId}` },
          (payload) => {
            if (cancelled) return;
            const row = payload.new as Message;
            if (row.lead_id !== currentLeadId) return;
            setMessages((m) => m.map((msg) => (msg.id === row.id ? row : msg)));
          },
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'messages', filter: `lead_id=eq.${currentLeadId}` },
          (payload) => {
            if (cancelled) return;
            const oldId = (payload.old as { id?: string })?.id;
            if (oldId) setMessages((m) => m.filter((msg) => msg.id !== oldId));
          },
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'ai_suggestions', filter: `lead_id=eq.${currentLeadId}` },
          (payload) => {
            const row = payload.new as AISuggestion;
            if (payload.eventType === 'DELETE') {
              setPendingSuggestion(null);
            } else if (row && row.status === 'pending') {
              setPendingSuggestion(row);
            } else {
              setPendingSuggestion((cur) => (cur && cur.id === row?.id ? null : cur));
            }
          },
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            isSubscribed = true;
            stopPolling();
            fetchMessages();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            isSubscribed = false;
            startPolling();
            scheduleReconnect();
          }
        });

      currentChannel = ch;
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        fetchMessages();
        if (!isSubscribed) subscribeChannel();
      }
    }

    function handleOnline() {
      fetchMessages();
      if (!isSubscribed) subscribeChannel();
    }

    load();
    subscribeChannel();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    window.addEventListener('online', handleOnline);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      window.removeEventListener('online', handleOnline);
      stopPolling();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (currentChannel) supabase.removeChannel(currentChannel);
    };
  }, [lead.id]);

  useEffect(() => {
    async function loadInstance() {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('status')
        .eq('user_id', userId)
        .maybeSingle();
      setInstanceStatus((data?.status as InstanceStatus) ?? 'unknown');
    }
    loadInstance();

    const channel = supabase
      .channel(`instance-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'whatsapp_instances', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { status?: InstanceStatus } | null;
          if (row?.status) setInstanceStatus(row.status);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    setPresence(null);
    let cancelled = false;

    async function loadInitial() {
      const { data } = await supabase
        .from('lead_presence')
        .select('state, updated_at')
        .eq('lead_id', lead.id)
        .maybeSingle();
      if (cancelled || !data) return;
      const state = data.state as PresenceState;
      const updatedAt = new Date(data.updated_at as string).getTime();
      if (Date.now() - updatedAt < 30_000 && (state === 'composing' || state === 'recording')) {
        setPresence({ state, updatedAt });
      }
    }

    loadInitial();

    const channel = supabase
      .channel(`presence-${lead.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lead_presence', filter: `lead_id=eq.${lead.id}` },
        (payload) => {
          const row = payload.new as { state?: string; updated_at?: string } | null;
          if (!row?.state || !row.updated_at) return;
          setPresence({
            state: row.state as PresenceState,
            updatedAt: new Date(row.updated_at).getTime(),
          });
        },
      )
      .subscribe();

    const expireTimer = setInterval(() => {
      setPresence((cur) => {
        if (!cur) return cur;
        if (Date.now() - cur.updatedAt > 20_000) return null;
        return cur;
      });
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(expireTimer);
      supabase.removeChannel(channel);
    };
  }, [lead.id]);

  function markFailed(tempId: string, detail: string, retry: () => Promise<void>) {
    setFailureDetails((prev) => ({ ...prev, [tempId]: detail }));
    setRetryPayloads((prev) => ({ ...prev, [tempId]: retry }));
  }

  function clearFailure(tempId: string) {
    setFailureDetails((prev) => {
      const next = { ...prev };
      delete next[tempId];
      return next;
    });
    setRetryPayloads((prev) => {
      const next = { ...prev };
      delete next[tempId];
      return next;
    });
  }

  async function sendMessage(content: string, aiGenerated = false) {
    if (isBlocked) { setShowPaywall(true); return; }
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const optimistic: Message = {
      id: tempId,
      user_id: userId,
      lead_id: lead.id,
      direction: 'out',
      content,
      media_url: '',
      media_type: '',
      whatsapp_message_id: '',
      status: 'pending',
      ai_generated: aiGenerated,
      approved_by_user: true,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    clearFailure(tempId);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const expiresAt = sessionData.session?.expires_at;
      const isExpired = !expiresAt || expiresAt * 1000 < Date.now() + 30_000;
      if (!sessionData.session?.access_token || isExpired) {
        const { error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr) {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === tempId ? { ...msg, status: 'failed' as const, content } : msg,
            ),
          );
          markFailed(tempId, 'Sessão expirada, faça login novamente', () => sendMessage(content, aiGenerated));
          return;
        }
      }
      if (sessionError) {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === tempId ? { ...msg, status: 'failed' as const, content } : msg,
          ),
        );
        markFailed(tempId, 'Sessão expirada, faça login novamente', () => sendMessage(content, aiGenerated));
        return;
      }

      const { data: payload, error: invokeError } = await supabase.functions.invoke(
        'whatsapp-send-message',
        {
          body: {
            lead_id: lead.id,
            content,
            ai_generated: aiGenerated,
          },
        },
      );

      if (invokeError) {
        let detail = invokeError.message || 'Falha no envio';
        let requiresReconnect = false;
        const ctx = (invokeError as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.text === 'function') {
          try {
            const raw = await ctx.text();
            try {
              const parsed = JSON.parse(raw);
              if (parsed?.requires_reconnect) requiresReconnect = true;
              if (typeof parsed?.error === 'string') detail = parsed.error;
            } catch {
              if (raw) detail = raw.slice(0, 200);
            }
          } catch {
            /* ignore */
          }
        }
        if (requiresReconnect) {
          detail = 'WhatsApp desconectado. Reconecte pelo QR Code em Conectar WhatsApp.';
        }
        setMessages((m) =>
          m.map((msg) =>
            msg.id === tempId ? { ...msg, status: 'failed' as const, content } : msg,
          ),
        );
        markFailed(tempId, detail, () => sendMessage(content, aiGenerated));
        return;
      }

      if (payload?.message) {
        setMessages((m) => m.map((msg) => (msg.id === tempId ? (payload.message as Message) : msg)));
        clearFailure(tempId);
      } else {
        setMessages((m) =>
          m.map((msg) =>
            msg.id === tempId ? { ...msg, status: 'failed' as const, content } : msg,
          ),
        );
        markFailed(tempId, 'Resposta inesperada do servidor', () => sendMessage(content, aiGenerated));
        return;
      }
      onLeadUpdated({
        id: lead.id,
        last_message: content,
        last_activity_at: new Date().toISOString(),
        message_count: (lead.message_count || 0) + 1,
      });
      incrementSendCount();
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Erro de rede';
      setMessages((m) =>
        m.map((msg) =>
          msg.id === tempId ? { ...msg, status: 'failed' as const, content } : msg,
        ),
      );
      markFailed(tempId, detail, () => sendMessage(content, aiGenerated));
    }
  }

  async function sendAudio(result: RecordingResult) {
    if (isBlocked) { setShowPaywall(true); return; }
    const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    if (result.blob.size > MAX_AUDIO_BYTES) {
      const failed: Message = {
        id: tempId,
        user_id: userId,
        lead_id: lead.id,
        direction: 'out',
        content: 'Áudio excede o limite de 16 MB',
        media_url: '',
        media_type: 'audio',
        whatsapp_message_id: '',
        status: 'failed',
        ai_generated: false,
        approved_by_user: true,
        audio_duration_seconds: result.durationSeconds,
        created_at: new Date().toISOString(),
      };
      setMessages((m) => [...m, failed]);
      markFailed(tempId, 'Áudio excede o limite de 16 MB', () => sendAudio(result));
      return;
    }
    const localBlobUrl = URL.createObjectURL(result.blob);
    const optimistic: Message = {
      id: tempId,
      user_id: userId,
      lead_id: lead.id,
      direction: 'out',
      content: '',
      media_url: localBlobUrl,
      media_type: 'audio',
      whatsapp_message_id: '',
      status: 'pending',
      ai_generated: false,
      approved_by_user: true,
      audio_duration_seconds: result.durationSeconds,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    clearFailure(tempId);

    try {
      const mt = result.mimeType.toLowerCase();
      const ext = mt.includes('ogg')
        ? 'ogg'
        : mt.includes('mpeg') || mt.includes('mp3')
        ? 'mp3'
        : mt.includes('wav')
        ? 'wav'
        : mt.includes('aac')
        ? 'aac'
        : mt.includes('mp4') || mt.includes('m4a')
        ? 'm4a'
        : 'webm';
      const path = `${userId}/${lead.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('lead-audio-messages')
        .upload(path, result.blob, { contentType: result.mimeType, upsert: false });

      if (upErr) {
        setMessages((m) => m.map((msg) => (msg.id === tempId ? { ...msg, status: 'failed' as const } : msg)));
        markFailed(tempId, upErr.message, () => sendAudio(result));
        return;
      }

      const { data: audioSessionData, error: audioSessionErr } = await supabase.auth.getSession();
      const audioExpiresAt = audioSessionData.session?.expires_at;
      const audioIsExpired = !audioExpiresAt || audioExpiresAt * 1000 < Date.now() + 30_000;
      if (!audioSessionData.session?.access_token || audioIsExpired) {
        const { error: refreshErr } = await supabase.auth.refreshSession();
        if (refreshErr || audioSessionErr) {
          setMessages((m) =>
            m.map((msg) => (msg.id === tempId ? { ...msg, status: 'failed' as const } : msg)),
          );
          markFailed(tempId, 'Sessão expirada, faça login novamente', () => sendAudio(result));
          return;
        }
      }

      const { data: payload, error: invokeError } = await supabase.functions.invoke(
        'whatsapp-send-audio',
        {
          body: {
            lead_id: lead.id,
            storage_path: path,
            duration_seconds: result.durationSeconds,
          },
        },
      );

      if (invokeError) {
        let detail = invokeError.message || 'Falha no envio';
        const ctx = (invokeError as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.text === 'function') {
          try {
            const raw = await ctx.text();
            try {
              const parsed = JSON.parse(raw);
              if (typeof parsed?.error === 'string') detail = parsed.error;
              else if (parsed?.evolutionResponse) detail = JSON.stringify(parsed.evolutionResponse).slice(0, 280);
              else if (raw) detail = raw.slice(0, 280);
            } catch {
              if (raw) detail = raw.slice(0, 280);
            }
          } catch {
            /* ignore */
          }
        }
        setMessages((m) =>
          m.map((msg) => (msg.id === tempId ? { ...msg, status: 'failed' as const } : msg)),
        );
        markFailed(tempId, detail, () => sendAudio(result));
        return;
      }

      if (payload?.message) {
        URL.revokeObjectURL(localBlobUrl);
        setMessages((m) => m.map((msg) => (msg.id === tempId ? (payload.message as Message) : msg)));
        clearFailure(tempId);
      }
      onLeadUpdated({
        id: lead.id,
        last_message: 'Mensagem de voz',
        last_activity_at: new Date().toISOString(),
        message_count: (lead.message_count || 0) + 1,
      });
      incrementSendCount();
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Erro de rede';
      setMessages((m) =>
        m.map((msg) => (msg.id === tempId ? { ...msg, status: 'failed' as const } : msg)),
      );
      markFailed(tempId, detail, () => sendAudio(result));
    }
  }

  async function sendImage(blob: Blob, caption: string) {
    if (isBlocked) { setShowPaywall(true); return; }
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const localBlobUrl = URL.createObjectURL(blob);
    const optimistic: Message = {
      id: tempId,
      user_id: userId,
      lead_id: lead.id,
      direction: 'out',
      content: caption,
      media_url: localBlobUrl,
      media_type: 'image',
      whatsapp_message_id: '',
      status: 'pending',
      ai_generated: false,
      approved_by_user: true,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, optimistic]);
    clearFailure(tempId);

    try {
      const ext = blob.type.split('/')[1]?.split(';')[0] || 'jpg';
      const path = `${userId}/${lead.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('lead-chat-media')
        .upload(path, blob, { contentType: blob.type || 'image/jpeg', upsert: false });

      if (upErr) {
        setMessages((m) => m.map((msg) => (msg.id === tempId ? { ...msg, status: 'failed' as const } : msg)));
        markFailed(tempId, upErr.message, () => sendImage(blob, caption));
        return;
      }

      const { data: payload, error: invokeError } = await supabase.functions.invoke(
        'whatsapp-send-image',
        { body: { lead_id: lead.id, storage_path: path, caption, storage_bucket: 'lead-chat-media' } },
      );

      if (invokeError) {
        let detail = invokeError.message || 'Falha no envio';
        const ctx = (invokeError as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.text === 'function') {
          try {
            const raw = await ctx.text();
            try { const parsed = JSON.parse(raw); if (typeof parsed?.error === 'string') detail = parsed.error; } catch { if (raw) detail = raw.slice(0, 200); }
          } catch { /* ignore */ }
        }
        setMessages((m) => m.map((msg) => (msg.id === tempId ? { ...msg, status: 'failed' as const } : msg)));
        markFailed(tempId, detail, () => sendImage(blob, caption));
        return;
      }

      if (payload?.message) {
        URL.revokeObjectURL(localBlobUrl);
        setMessages((m) => m.map((msg) => (msg.id === tempId ? (payload.message as Message) : msg)));
        clearFailure(tempId);
      }
      onLeadUpdated({
        id: lead.id,
        last_message: caption || 'Imagem',
        last_activity_at: new Date().toISOString(),
        message_count: (lead.message_count || 0) + 1,
      });
      incrementSendCount();
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Erro de rede';
      setMessages((m) => m.map((msg) => (msg.id === tempId ? { ...msg, status: 'failed' as const } : msg)));
      markFailed(tempId, detail, () => sendImage(blob, caption));
    }
  }

  async function requestSuggestion() {
    const last = [...messages].reverse().find((m) => m.direction === 'in');
    const base = last?.content || 'Olá!';
    const suggestion = `Olá ${lead.name || ''}! Obrigado pela sua mensagem: "${base.slice(0, 80)}". Podemos conversar sobre como posso ajudar?`;
    const { data } = await supabase
      .from('ai_suggestions')
      .insert({
        user_id: userId,
        lead_id: lead.id,
        content: suggestion,
        status: 'pending',
      })
      .select()
      .maybeSingle();
    if (data) setPendingSuggestion(data as AISuggestion);
  }

  async function approveSuggestion(s: AISuggestion, edited?: string) {
    const content = edited ?? s.content;
    await supabase.from('ai_suggestions').update({ status: 'sent' }).eq('id', s.id);
    setPendingSuggestion(null);
    await sendMessage(content, true);
  }

  async function rejectSuggestion(s: AISuggestion) {
    await supabase.from('ai_suggestions').update({ status: 'rejected' }).eq('id', s.id);
    setPendingSuggestion(null);
  }

  async function deleteMessage(messageId: string, scope: 'local' | 'whatsapp') {
    const confirmMsg =
      scope === 'whatsapp'
        ? 'Excluir esta mensagem também no WhatsApp? Esta ação não pode ser desfeita.'
        : 'Excluir esta mensagem apenas para você?';
    if (!window.confirm(confirmMsg)) return;

    const snapshot = messages;
    setMessages((m) => m.filter((msg) => msg.id !== messageId));

    if (scope === 'local') {
      const { error } = await supabase.from('messages').delete().eq('id', messageId);
      if (error) {
        setMessages(snapshot);
        window.alert(`Falha ao excluir: ${error.message}`);
      }
      return;
    }

    const { error: invokeError } = await supabase.functions.invoke('whatsapp-delete-message', {
      body: { message_id: messageId, also_on_whatsapp: true },
    });
    if (invokeError) {
      setMessages(snapshot);
      window.alert(`Falha ao excluir no WhatsApp: ${invokeError.message}`);
    }
  }

  async function deleteConversation() {
    if (!window.confirm(`Excluir a conversa com ${leadDisplayName(lead)}? Todas as mensagens serão removidas.`)) return;
    const { error } = await supabase.from('leads').delete().eq('id', lead.id);
    if (error) {
      window.alert(`Falha ao excluir conversa: ${error.message}`);
      return;
    }
    onLeadDeleted?.(lead.id);
  }

  const modeLabel: Record<SendMode, string> = {
    manual: 'Manual',
    auto: 'Auto IA',
    approval: 'IA c/ aprovação',
  };

  const isDisconnected = instanceStatus === 'disconnected' || instanceStatus === 'error';

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-gray-50 to-gray-100">
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          {lead.profile_picture_url ? (
            <img
              src={lead.profile_picture_url}
              alt={leadDisplayName(lead)}
              className="w-10 h-10 rounded-full object-cover bg-gray-100"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-700">
              {leadDisplayName(lead).charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
              {leadDisplayName(lead)}
              {isPrivateContact(lead) && (
                <span className="text-[9px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                  Privado
                </span>
              )}
            </p>
            {presence && (presence.state === 'composing' || presence.state === 'recording') ? (
              <PresenceIndicator state={presence.state} compact />
            ) : (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Phone size={10} /> {leadPhoneLabel(lead)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg flex items-center gap-1">
            <Sparkles size={10} /> {modeLabel[sendMode]}
          </span>
          <button
            onClick={onOpenDetails}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
          >
            <Info size={16} />
          </button>
          <div className="relative" ref={headerMenuRef}>
            <button
              onClick={() => setHeaderMenuOpen((v) => !v)}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              aria-label="Opções da conversa"
            >
              <MoreVertical size={16} />
            </button>
            {headerMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-100 rounded-xl shadow-lg py-1 text-xs z-20">
                <button
                  type="button"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    onOpenDetails();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700"
                >
                  <Info size={12} /> Detalhes do lead
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHeaderMenuOpen(false);
                    deleteConversation();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-600"
                >
                  <Trash2 size={12} /> Excluir conversa
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {isDisconnected && (
        <div className="mx-4 mt-3 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
          <WifiOff size={14} className="mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">WhatsApp desconectado</p>
            <p className="opacity-80">Reconecte sua instância pela página "Conexões" antes de enviar mensagens.</p>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        {loading ? (
          <div className="absolute inset-0 px-4 py-4 space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`flex ${i % 2 ? 'justify-end' : 'justify-start'}`}>
                <div className="h-10 w-48 bg-white/60 rounded-2xl animate-pulse" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
            <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center shadow-sm mb-3">
              <Sparkles size={20} className="text-emerald-500" />
            </div>
            <p className="text-sm font-medium text-gray-600">Nenhuma mensagem ainda</p>
            <p className="text-xs text-gray-400 mt-1">Inicie a conversa enviando uma mensagem abaixo</p>
          </div>
        ) : (
          <Virtuoso
            key={lead.id}
            ref={virtuosoRef}
            data={messages}
            className="absolute inset-0"
            initialTopMostItemIndex={Math.max(0, messages.length - 1)}
            followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
            atBottomThreshold={120}
            increaseViewportBy={{ top: 600, bottom: 200 }}
            components={{
              Header: () => <div className="h-2" />,
              Footer: () => <div className="h-2" />,
            }}
            itemContent={(idx, m) => {
              const prev = idx > 0 ? messages[idx - 1] : null;
              const showSeparator = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);
              return (
                <div className="px-4">
                  {showSeparator && (
                    <div className="flex justify-center my-3">
                      <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500 bg-white border border-gray-100 px-2.5 py-1 rounded-full shadow-sm">
                        {formatDaySeparator(m.created_at)}
                      </span>
                    </div>
                  )}
                  <MessageBubble
                    message={m}
                    errorDetail={failureDetails[m.id]}
                    onRetry={retryPayloads[m.id]}
                    onDelete={(scope) => deleteMessage(m.id, scope)}
                  />
                </div>
              );
            }}
          />
        )}
      </div>

      <ChatComposer
        sendMode={sendMode}
        pendingSuggestion={pendingSuggestion}
        onSend={sendMessage}
        onSendAudio={sendAudio}
        onSendImage={sendImage}
        onRequestSuggestion={requestSuggestion}
        onApproveSuggestion={approveSuggestion}
        onRejectSuggestion={rejectSuggestion}
        disabled={isDisconnected}
      />

      <PricingModal open={showPaywall} onClose={() => setShowPaywall(false)} />
    </div>
  );
}
