import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { MessageSquare, Users, Upload, ArrowLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { Lead, SendMode, WhatsAppInstance, Message } from '../../lib/types';
import { ConversationList } from '../../components/chat/ConversationList';
import { ChatPanel } from '../../components/chat/ChatPanel';
import { LeadDetailsDrawer } from '../../components/chat/LeadDetailsDrawer';
import { IncomingMessageToastStack, ToastItem } from '../../components/chat/IncomingMessageToast';
import { BulkImportLeadsModal } from '../../components/leads/BulkImportLeadsModal';

type ListFilter = 'all' | 'unread' | 'archived';
type LeadPatch = Partial<Lead> & { id: string };

function leadSortKey(l: Lead): number {
  const t = l.last_activity_at || l.updated_at || '';
  return t ? new Date(t).getTime() : 0;
}

function sortLeads(list: Lead[]): Lead[] {
  return [...list].sort((a, b) => leadSortKey(b) - leadSortKey(a));
}

function upsertLead(list: Lead[], incoming: Lead, mergeStrategy: 'replace' | 'merge' = 'merge'): Lead[] {
  const idx = list.findIndex((x) => x.id === incoming.id);
  if (idx === -1) {
    const dupIdx = list.findIndex((x) => x.user_id === incoming.user_id && x.phone === incoming.phone);
    if (dupIdx !== -1) {
      const next = [...list];
      next[dupIdx] = mergeStrategy === 'merge' ? { ...list[dupIdx], ...incoming } : incoming;
      return sortLeads(next);
    }
    return sortLeads([incoming, ...list]);
  }
  const current = list[idx];
  const merged: Lead =
    mergeStrategy === 'merge'
      ? {
          ...current,
          ...incoming,
          last_activity_at:
            leadSortKey({ ...current, ...incoming } as Lead) >= leadSortKey(current)
              ? (incoming.last_activity_at ?? current.last_activity_at)
              : current.last_activity_at,
        }
      : incoming;
  const next = [...list];
  next[idx] = merged;
  return sortLeads(next);
}

function patchLead(list: Lead[], patch: LeadPatch): Lead[] {
  const idx = list.findIndex((x) => x.id === patch.id);
  if (idx === -1) return list;
  const current = list[idx];
  const merged: Lead = { ...current, ...patch };
  const next = [...list];
  next[idx] = merged;
  return sortLeads(next);
}

export function Leads() {
  const { user } = useAuth();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ListFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sendMode, setSendMode] = useState<SendMode>('manual');
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const selectedIdRef = useRef<string | null>(null);
  const leadsRef = useRef<Lead[]>([]);

  useEffect(() => {
    leadsRef.current = leads;
  }, [leads]);

  function pushToast(item: ToastItem) {
    setToasts((prev) => [item, ...prev].slice(0, 4));
  }

  function dismissToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    let cancelled = false;
    let leadsChannel: ReturnType<typeof supabase.channel> | null = null;
    let messagesChannel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let leadsSubscribed = false;
    let messagesSubscribed = false;

    async function fetchLeads() {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', user!.id)
        .order('last_activity_at', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false });
      if (cancelled) return;
      if (data) setLeads(sortLeads(data as Lead[]));
    }

    async function load() {
      setLoading(true);
      await fetchLeads();

      const { data: inst } = await supabase
        .from('whatsapp_instances')
        .select('send_mode')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (cancelled) return;
      if (inst && (inst as WhatsAppInstance).send_mode) {
        setSendMode((inst as WhatsAppInstance).send_mode as SendMode);
      }

      setLoading(false);
    }

    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(() => {
        if (!leadsSubscribed || !messagesSubscribed) fetchLeads();
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
        if (!cancelled) subscribeAll();
      }, 2500);
    }

    load();

    function subscribeAll() {
      if (cancelled) return;
      if (leadsChannel) {
        supabase.removeChannel(leadsChannel);
        leadsChannel = null;
      }
      if (messagesChannel) {
        supabase.removeChannel(messagesChannel);
        messagesChannel = null;
      }

      const channelSuffix = Math.random().toString(36).slice(2, 8);

      leadsChannel = supabase
        .channel(`leads-list-${channelSuffix}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `user_id=eq.${user!.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const incoming = payload.new as Lead;
            setLeads((l) => upsertLead(l, incoming, 'merge'));
          } else if (payload.eventType === 'UPDATE') {
            const incoming = payload.new as Lead;
            setLeads((l) => {
              const idx = l.findIndex((x) => x.id === incoming.id);
              if (idx === -1) return upsertLead(l, incoming, 'merge');
              const current = l[idx];
              const currentTs = leadSortKey(current);
              const incomingTs = leadSortKey(incoming);
              const merged: Lead = {
                ...current,
                ...incoming,
                last_message:
                  incomingTs >= currentTs ? incoming.last_message ?? current.last_message : current.last_message,
                last_activity_at:
                  incomingTs >= currentTs ? incoming.last_activity_at ?? current.last_activity_at : current.last_activity_at,
                unread_count:
                  selectedIdRef.current === incoming.id && document.visibilityState === 'visible'
                    ? 0
                    : incoming.unread_count ?? current.unread_count,
              };
              const next = [...l];
              next[idx] = merged;
              return sortLeads(next);
            });
          } else if (payload.eventType === 'DELETE') {
            setLeads((l) => l.filter((x) => x.id !== (payload.old as Lead).id));
          }
        }
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          leadsSubscribed = true;
          if (leadsSubscribed && messagesSubscribed) stopPolling();
          fetchLeads();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          leadsSubscribed = false;
          startPolling();
          scheduleReconnect();
        }
      });

      messagesChannel = supabase
        .channel(`leads-messages-${channelSuffix}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `user_id=eq.${user!.id}` },
        (payload) => {
          const msg = payload.new as Message;
          setLeads((l) => {
            const idx = l.findIndex((x) => x.id === msg.lead_id);
            if (idx === -1) return l;
            const current = l[idx];
            const isOpen = selectedIdRef.current === msg.lead_id && document.visibilityState === 'visible';
            const preview = msg.content || (msg.media_type === 'audio' ? 'Mensagem de voz' : current.last_message);
            const updated: Lead = {
              ...current,
              last_message: preview,
              last_activity_at: msg.created_at,
              message_count: (current.message_count || 0) + 1,
              unread_count:
                msg.direction === 'in' && !isOpen ? (current.unread_count ?? 0) + 1 : current.unread_count ?? 0,
            };
            const next = [...l];
            next[idx] = updated;
            return sortLeads(next);
          });

          if (selectedIdRef.current === msg.lead_id && msg.direction === 'in' && document.visibilityState === 'visible') {
            supabase.from('leads').update({ unread_count: 0 }).eq('id', msg.lead_id).then(() => {});
          }

          if (msg.direction === 'in') {
            const isOpen = selectedIdRef.current === msg.lead_id && document.visibilityState === 'visible';
            if (!isOpen) {
              const lead = leadsRef.current.find((x) => x.id === msg.lead_id);
              if (lead) {
                const preview =
                  msg.content ||
                  (msg.media_type === 'audio'
                    ? 'Mensagem de voz'
                    : msg.media_type
                    ? 'Anexo'
                    : 'Nova mensagem');
                pushToast({
                  id: msg.id || `${msg.lead_id}-${Date.now()}`,
                  leadId: lead.id,
                  name: lead.name,
                  phone: lead.phone,
                  preview,
                  avatarUrl: lead.profile_picture_url,
                });
              }
            }
          }
        },
      )
      .subscribe((status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          messagesSubscribed = true;
          if (leadsSubscribed && messagesSubscribed) stopPolling();
          fetchLeads();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          messagesSubscribed = false;
          startPolling();
          scheduleReconnect();
        }
      });
    }

    subscribeAll();

    function handleVisibility() {
      if (document.visibilityState === 'visible') {
        fetchLeads();
        if (!leadsSubscribed || !messagesSubscribed) subscribeAll();
      }
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    window.addEventListener('online', handleVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
      window.removeEventListener('online', handleVisibility);
      stopPolling();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (leadsChannel) supabase.removeChannel(leadsChannel);
      if (messagesChannel) supabase.removeChannel(messagesChannel);
    };
  }, [user]);

  const filtered = useMemo(() => {
    return leads
      .filter((l) => {
        if (filter === 'unread') return (l.unread_count ?? 0) > 0 && !l.is_archived;
        if (filter === 'archived') return l.is_archived;
        return !l.is_archived;
      })
      .filter((l) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          (l.name || '').toLowerCase().includes(q) ||
          l.phone.includes(search) ||
          (l.last_message || '').toLowerCase().includes(q)
        );
      });
  }, [leads, filter, search]);

  const selected = leads.find((l) => l.id === selectedId) || null;

  function handleLeadUpdated(patch: LeadPatch) {
    setLeads((l) => patchLead(l, patch));
  }

  function handleLeadDeleted(id: string) {
    setLeads((l) => l.filter((x) => x.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  const totalUnread = leads.reduce((sum, l) => sum + (l.unread_count ?? 0), 0);

  useEffect(() => {
    const base = 'Chat';
    document.title = totalUnread > 0 ? `(${totalUnread}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [totalUnread]);

  function handleToastOpen(leadId: string) {
    setSelectedId(leadId);
    supabase.from('leads').update({ unread_count: 0 }).eq('id', leadId).then(() => {});
  }

  const mobileShowChat = selectedId !== null;

  return (
    <div className="h-[calc(100dvh-53px)] lg:h-screen flex flex-col bg-gray-50">
      {/* Header -- hidden on mobile when chat is open */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className={`px-4 sm:px-6 py-3 sm:py-4 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 ${mobileShowChat ? 'hidden md:flex' : 'flex'}`}
      >
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
            Chat
            {totalUnread > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 bg-emerald-500 text-white rounded-full">
                {totalUnread} novas
              </span>
            )}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            {leads.length} contatos · modo de envio: <span className="font-medium capitalize">{sendMode === 'auto' ? 'automático' : sendMode === 'approval' ? 'com aprovação' : 'manual'}</span>
          </p>
        </div>
        <button
          onClick={() => setShowBulkImport(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-2xl bg-gray-100 text-gray-900 hover:bg-gray-200 transition-colors"
        >
          <Upload size={14} /> <span className="hidden sm:inline">Importar leads</span>
        </button>
      </motion.div>

      <BulkImportLeadsModal
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Conversation list: full-width on mobile, fixed 320px on md+ */}
        <div className={`${mobileShowChat ? 'hidden md:block' : 'w-full'} md:w-80 shrink-0`}>
          {loading ? (
            <div className="p-4 space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-14 bg-white rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : (
            <ConversationList
              leads={filtered}
              selectedId={selectedId}
              search={search}
              onSearchChange={setSearch}
              onSelect={(l) => setSelectedId(l.id)}
              filter={filter}
              onFilterChange={setFilter}
            />
          )}
        </div>

        {/* Chat area: full-width on mobile when selected, flex-1 on md+ */}
        <div className={`${mobileShowChat ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col`}>
          {selected && user ? (
            <div className="flex-1 flex flex-col">
              {/* Mobile back button */}
              <div className="md:hidden flex items-center gap-2 px-3 py-2 bg-white border-b border-gray-100">
                <button
                  onClick={() => setSelectedId(null)}
                  className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
                >
                  <ArrowLeft size={18} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{selected.name || selected.phone}</p>
                  <p className="text-xs text-gray-400 truncate">{selected.phone}</p>
                </div>
              </div>
              <div className="flex-1">
                <ChatPanel
                  lead={selected}
                  userId={user.id}
                  sendMode={sendMode}
                  onOpenDetails={() => setDrawerOpen(true)}
                  onLeadUpdated={handleLeadUpdated}
                  onLeadDeleted={handleLeadDeleted}
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-center p-4 sm:p-8 bg-gradient-to-b from-gray-50 to-gray-100">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                {leads.length === 0 ? (
                  <Users size={24} className="text-gray-300" />
                ) : (
                  <MessageSquare size={24} className="text-emerald-500" />
                )}
              </div>
              <p className="text-sm font-medium text-gray-700">
                {leads.length === 0 ? 'Nenhum lead ainda' : 'Selecione uma conversa'}
              </p>
              <p className="text-xs text-gray-400 mt-1 max-w-xs">
                {leads.length === 0
                  ? 'Conecte seu WhatsApp ou adicione leads manualmente para começar.'
                  : 'Escolha um contato à esquerda para ver o histórico e responder.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {user && (
        <LeadDetailsDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          lead={selected}
          userId={user.id}
          onLeadUpdated={handleLeadUpdated}
          onLeadDeleted={handleLeadDeleted}
        />
      )}

      <IncomingMessageToastStack
        toasts={toasts}
        onOpen={handleToastOpen}
        onDismiss={dismissToast}
      />
    </div>
  );
}
