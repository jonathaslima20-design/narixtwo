import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Users, Plus, Download, Upload, Search, LayoutGrid, Rows2 as Rows, Star, Archive, Tag as TagIcon, MessageSquare, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Lead } from '../../lib/types';
import { LeadDetailsDrawer } from '../../components/chat/LeadDetailsDrawer';
import { leadDisplayName, leadPhoneLabel, isPrivateContact } from '../../lib/leadDisplay';
import { useLeadCategories } from '../../lib/useLeadCategories';
import { resolveIcon } from '../../lib/iconMap';
import { BulkImportLeadsModal } from '../../components/leads/BulkImportLeadsModal';

type View = 'kanban' | 'table';
type LeadPatch = Partial<Lead> & { id: string };

interface CategoryColumn {
  key: string;
  label: string;
  color: string;
  icon: string;
  accent: string;
}

function toBorderAccent(color: string): string {
  const bgMatch = color.match(/bg-(\w+)-\d+/);
  const textMatch = color.match(/text-(\w+)-\d+/);
  const palette = textMatch?.[1] || bgMatch?.[1] || 'gray';
  return `bg-${palette}-50 text-${palette}-700 border-${palette}-200`;
}

function formatRelative(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'ontem';
  if (days < 7) return `${days}d atras`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function sortLeads(list: Lead[]): Lead[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.last_activity_at || a.updated_at || 0).getTime();
    const tb = new Date(b.last_activity_at || b.updated_at || 0).getTime();
    return tb - ta;
  });
}

export function LeadManagement() {
  const { user } = useAuth();
  const { categories: catRows, loading: catsLoading } = useLeadCategories();
  const CATEGORIES = useMemo<CategoryColumn[]>(() => catRows.map((r) => ({
    key: r.key,
    label: r.label,
    color: r.color,
    icon: r.icon,
    accent: toBorderAccent(r.color),
  })), [catRows]);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('kanban');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCat, setDragOverCat] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkImport, setShowBulkImport] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from('leads')
        .select('*')
        .eq('user_id', user!.id)
        .order('last_activity_at', { ascending: false, nullsFirst: false });
      if (cancelled) return;
      setLeads((data as Lead[]) || []);
      setLoading(false);
    }
    load();

    const channel = supabase
      .channel(`leads-crm-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setLeads((prev) => {
            if (payload.eventType === 'DELETE') {
              return prev.filter((l) => l.id !== (payload.old as Lead).id);
            }
            const row = payload.new as Lead;
            const idx = prev.findIndex((l) => l.id === row.id);
            if (idx === -1) return sortLeads([row, ...prev]);
            const next = [...prev];
            next[idx] = { ...next[idx], ...row };
            return sortLeads(next);
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (!showArchived && l.is_archived) return false;
      if (onlyFavorites && !l.is_favorite) return false;
      if (!q) return true;
      return (
        (l.name || '').toLowerCase().includes(q) ||
        (l.phone || '').toLowerCase().includes(q) ||
        (l.tags || []).some((t) => t.toLowerCase().includes(q)) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.company || '').toLowerCase().includes(q)
      );
    });
  }, [leads, search, showArchived, onlyFavorites]);

  const stats = useMemo(() => {
    const byCat: Record<string, number> = {};
    for (const c of CATEGORIES) byCat[c.key] = 0;
    for (const l of filtered) {
      const key = l.category || (CATEGORIES[0]?.key ?? 'cold');
      if (key in byCat) byCat[key] += 1;
    }
    return { byCat, total: filtered.length };
  }, [filtered, CATEGORIES]);

  async function moveLeadToCategory(leadId: string, category: string) {
    const prev = leads.find((l) => l.id === leadId);
    if (!prev || prev.category === category) return;
    setLeads((list) => list.map((l) => (l.id === leadId ? { ...l, category } : l)));
    const { error } = await supabase
      .from('leads')
      .update({ category, updated_at: new Date().toISOString() })
      .eq('id', leadId);
    if (error) {
      setLeads((list) => list.map((l) => (l.id === leadId ? { ...l, category: prev.category } : l)));
      return;
    }
    await supabase.from('lead_activities').insert({
      user_id: user!.id,
      lead_id: leadId,
      action: 'category_changed',
      meta: { from: prev.category || 'cold', to: category },
    });
  }

  function handleLeadUpdated(patch: LeadPatch) {
    setLeads((list) => list.map((l) => (l.id === patch.id ? { ...l, ...patch } : l)));
  }

  function handleLeadDeleted(id: string) {
    setLeads((list) => list.filter((l) => l.id !== id));
    setDrawerOpen(false);
  }

  function openLead(lead: Lead) {
    setDrawerLead(lead);
    setDrawerOpen(true);
  }

  async function addLead() {
    if (!addForm.phone.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from('leads')
      .insert({
        name: addForm.name.trim(),
        phone: addForm.phone.trim(),
        temperature: 'cold',
        user_id: user!.id,
        category: CATEGORIES[0]?.key ?? 'cold',
        pipeline_stage: 'new',
        source: 'manual',
        last_activity_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();
    if (data) {
      setLeads((l) => sortLeads([data as Lead, ...l]));
    }
    setAddForm({ name: '', phone: '' });
    setShowAdd(false);
    setSaving(false);
  }

  async function bulkSetCategory(category: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    await supabase
      .from('leads')
      .update({ category, updated_at: new Date().toISOString() })
      .in('id', ids);
    setLeads((list) => list.map((l) => (ids.includes(l.id) ? { ...l, category } : l)));
    setSelected(new Set());
  }

  async function bulkArchive() {
    const ids = [...selected];
    if (ids.length === 0) return;
    await supabase.from('leads').update({ is_archived: true }).in('id', ids);
    setLeads((list) => list.map((l) => (ids.includes(l.id) ? { ...l, is_archived: true } : l)));
    setSelected(new Set());
  }

  function exportCSV() {
    const header = ['Nome', 'Telefone', 'Email', 'Empresa', 'Categoria', 'Score', 'Tags', 'Mensagens', 'Ultima atividade'];
    const catLabel = (key: string) => CATEGORIES.find((c) => c.key === key)?.label ?? key;
    const rows = filtered.map((l) => [
      leadDisplayName(l),
      leadPhoneLabel(l),
      l.email || '',
      l.company || '',
      catLabel(l.category || 'cold'),
      String(l.score ?? 0),
      (l.tags || []).join('|'),
      String(l.message_count ?? 0),
      l.last_activity_at || l.updated_at || '',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col bg-gray-50 min-h-screen">
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 sm:px-6 pt-4 sm:pt-6 pb-4 bg-white border-b border-gray-100"
      >
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
              <Users size={20} className="text-gray-500" /> Gestao de Leads
            </h1>
            <p className="text-xs text-gray-500 mt-1 hidden sm:block">
              Organize seus contatos por categorias e acompanhe o progresso de cada negociacao.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={exportCSV}>
              <Download size={14} /> <span className="hidden sm:inline">Exportar CSV</span><span className="sm:hidden">CSV</span>
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowBulkImport(true)}>
              <Upload size={14} /> <span className="hidden sm:inline">Importar leads</span><span className="sm:hidden">Importar</span>
            </Button>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus size={14} /> <span className="hidden sm:inline">Novo lead</span>
            </Button>
          </div>
        </div>

        <div className="flex gap-2 mt-4 sm:mt-5 flex-wrap overflow-x-auto pb-1">
          <StatPill label="Total" value={stats.total} iconName="Users" tone="gray" />
          {CATEGORIES.map((cat) => {
            const palette = cat.color.match(/text-(\w+)-/)?.[1] || 'gray';
            return (
              <StatPill
                key={cat.key}
                label={cat.label}
                value={stats.byCat[cat.key] || 0}
                iconName={cat.icon}
                tone={palette}
              />
            );
          })}
        </div>
      </motion.div>

      <div className="px-4 sm:px-6 py-3 bg-white border-b border-gray-100 flex items-center gap-2 sm:gap-3 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[220px] sm:max-w-md w-full sm:w-auto order-first sm:order-none">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, telefone, tag, empresa..."
            className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:bg-white"
          />
        </div>

        <button
          onClick={() => setOnlyFavorites((v) => !v)}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition border ${
            onlyFavorites
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Star size={12} className="inline mr-1" /> Favoritos
        </button>

        <button
          onClick={() => setShowArchived((v) => !v)}
          className={`px-2.5 py-1.5 rounded-xl text-xs font-medium transition border ${
            showArchived
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Archive size={12} className="inline mr-1" /> Arquivados
        </button>

        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl shrink-0">
          <button
            onClick={() => setView('kanban')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
              view === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <LayoutGrid size={13} /> <span className="hidden sm:inline">Kanban</span>
          </button>
          <button
            onClick={() => setView('table')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition ${
              view === 'table' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            <Rows size={13} /> <span className="hidden sm:inline">Tabela</span>
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="px-4 sm:px-6 py-2 bg-gray-900 text-white flex items-center gap-2 sm:gap-3 text-xs overflow-x-auto">
          <span className="font-semibold">{selected.size} selecionado(s)</span>
          <div className="h-4 w-px bg-white/20" />
          <span className="text-gray-300">Mover para:</span>
          {CATEGORIES.map((c) => (
            <button key={c.key} onClick={() => bulkSetCategory(c.key)} className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 transition">
              {c.label}
            </button>
          ))}
          <div className="h-4 w-px bg-white/20 ml-1" />
          <button onClick={bulkArchive} className="px-2 py-1 rounded-md bg-white/10 hover:bg-white/20 transition">
            <Archive size={11} className="inline mr-1" /> Arquivar
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto p-1 rounded hover:bg-white/10" aria-label="Limpar selecao">
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex-1 p-4 sm:p-6">
        {loading || catsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-72 bg-white rounded-2xl animate-pulse border border-gray-100" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasAny={leads.length > 0} onAdd={() => setShowAdd(true)} />
        ) : view === 'kanban' ? (
          <KanbanView
            leads={filtered}
            categories={CATEGORIES}
            draggingId={draggingId}
            dragOverCat={dragOverCat}
            setDraggingId={setDraggingId}
            setDragOverCat={setDragOverCat}
            onDrop={(cat, leadId) => moveLeadToCategory(leadId, cat)}
            onOpen={openLead}
          />
        ) : (
          <TableView
            leads={filtered}
            categories={CATEGORIES}
            selected={selected}
            setSelected={setSelected}
            onOpen={openLead}
            onCategoryChange={moveLeadToCategory}
          />
        )}
      </div>

      {user && (
        <LeadDetailsDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          lead={drawerLead}
          userId={user.id}
          onLeadUpdated={handleLeadUpdated}
          onLeadDeleted={handleLeadDeleted}
        />
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Adicionar lead" maxWidth="sm">
        <div className="space-y-4">
          <Input label="Nome" placeholder="Nome do contato" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
          <Input label="Telefone *" placeholder="+55 11 99999-9999" value={addForm.phone} onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))} required />
          <p className="text-xs text-gray-400">
            O lead sera adicionado na categoria "{CATEGORIES[0]?.label || 'Frio'}". Voce pode mover depois.
          </p>
          <Button fullWidth onClick={addLead} loading={saving}>
            Adicionar lead
          </Button>
        </div>
      </Modal>

      <BulkImportLeadsModal
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
      />
    </div>
  );
}

function StatPill({ label, value, iconName, tone }: { label: string; value: number; iconName: string; tone: string }) {
  const Icon = iconName === 'Users' ? Users : resolveIcon(iconName);
  const toneClasses: Record<string, string> = {
    gray: 'bg-gray-50 text-gray-600',
    red: 'bg-red-50 text-red-600',
    amber: 'bg-amber-50 text-amber-700',
    sky: 'bg-sky-50 text-sky-700',
    orange: 'bg-orange-50 text-orange-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    teal: 'bg-teal-50 text-teal-700',
    pink: 'bg-pink-50 text-pink-700',
    cyan: 'bg-cyan-50 text-cyan-700',
  };
  const cls = toneClasses[tone] || toneClasses.gray;

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 bg-white border border-gray-100 rounded-xl">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cls}`}>
        <Icon size={14} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">{label}</p>
        <p className="text-sm font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function EmptyState({ hasAny, onAdd }: { hasAny: boolean; onAdd: () => void }) {
  return (
    <div className="py-16 flex flex-col items-center justify-center text-center">
      <div className="w-16 h-16 bg-white border border-gray-100 rounded-2xl flex items-center justify-center mb-4">
        <Users size={24} className="text-gray-400" />
      </div>
      <p className="text-sm font-medium text-gray-700">
        {hasAny ? 'Nenhum lead com esses filtros' : 'Nenhum lead cadastrado ainda'}
      </p>
      <p className="text-xs text-gray-500 mt-1 max-w-sm">
        {hasAny
          ? 'Ajuste a busca ou desative os filtros para ver mais contatos.'
          : 'Conecte seu WhatsApp na pagina Conexoes para receber leads automaticamente, ou adicione manualmente abaixo.'}
      </p>
      <div className="mt-4">
        <Button size="sm" onClick={onAdd}>
          <Plus size={14} /> Adicionar lead
        </Button>
      </div>
    </div>
  );
}

function KanbanView({
  leads,
  categories,
  draggingId,
  dragOverCat,
  setDraggingId,
  setDragOverCat,
  onDrop,
  onOpen,
}: {
  leads: Lead[];
  categories: CategoryColumn[];
  draggingId: string | null;
  dragOverCat: string | null;
  setDraggingId: (id: string | null) => void;
  setDragOverCat: (s: string | null) => void;
  onDrop: (cat: string, leadId: string) => void;
  onOpen: (lead: Lead) => void;
}) {
  const byCat = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const c of categories) map[c.key] = [];
    for (const l of leads) {
      const key = l.category || (categories[0]?.key ?? 'cold');
      if (key in map) map[key].push(l);
      else if (categories[0]) map[categories[0].key].push(l);
    }
    return map;
  }, [leads, categories]);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:overflow-visible sm:pb-0" style={{ gridTemplateColumns: `repeat(${Math.min(categories.length, 6)}, minmax(0, 1fr))` }}>
      {categories.map((cat) => {
        const items = byCat[cat.key] || [];
        const over = dragOverCat === cat.key;
        const CatIcon = resolveIcon(cat.icon);
        return (
          <div
            key={cat.key}
            onDragOver={(e) => {
              e.preventDefault();
              if (dragOverCat !== cat.key) setDragOverCat(cat.key);
            }}
            onDragLeave={() => {
              if (dragOverCat === cat.key) setDragOverCat(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggingId) onDrop(cat.key, draggingId);
              setDraggingId(null);
              setDragOverCat(null);
            }}
            className={`bg-white border rounded-2xl flex flex-col min-h-[420px] min-w-[260px] sm:min-w-0 transition ${
              over ? 'border-gray-900 shadow-md' : 'border-gray-100'
            }`}
          >
            <div className="px-3 pt-3 pb-2 border-b border-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border ${cat.accent}`}>
                  <CatIcon size={11} />
                  {cat.label}
                </span>
              </div>
              <span className="text-[11px] font-semibold text-gray-500">{items.length}</span>
            </div>
            <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)]">
              {items.map((lead) => (
                <KanbanCard
                  key={lead.id}
                  lead={lead}
                  categories={categories}
                  dragging={draggingId === lead.id}
                  onDragStart={() => setDraggingId(lead.id)}
                  onDragEnd={() => { setDraggingId(null); setDragOverCat(null); }}
                  onOpen={() => onOpen(lead)}
                />
              ))}
              {items.length === 0 && (
                <div className="text-[11px] text-gray-400 text-center py-6 border border-dashed border-gray-200 rounded-xl">
                  Arraste um lead aqui
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  lead,
  categories,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
}: {
  lead: Lead;
  categories: CategoryColumn[];
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
}) {
  const cat = categories.find((c) => c.key === lead.category) || categories[0];
  const CatIcon = cat ? resolveIcon(cat.icon) : Users;
  const catColor = cat?.color.split(' ')[1] || 'text-gray-500';
  const unread = (lead.unread_count ?? 0) > 0;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      className={`group cursor-pointer bg-white rounded-xl border p-2.5 text-left hover:shadow-md transition ${
        dragging ? 'opacity-40 border-gray-900' : 'border-gray-100'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="relative w-8 h-8 shrink-0">
          {lead.profile_picture_url ? (
            <img
              src={lead.profile_picture_url}
              alt={leadDisplayName(lead)}
              className="w-8 h-8 rounded-full object-cover bg-gray-100"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-8 h-8 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center text-[11px] font-bold text-gray-700">
              {leadDisplayName(lead).charAt(0).toUpperCase()}
            </div>
          )}
          <CatIcon size={10} className={`absolute -bottom-0.5 -right-0.5 ${catColor} bg-white rounded-full`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="text-sm font-semibold text-gray-900 truncate">{leadDisplayName(lead)}</p>
            {lead.is_favorite && <Star size={10} className="text-amber-400 fill-amber-400 shrink-0" />}
          </div>
          <p className="text-[11px] text-gray-500 truncate flex items-center gap-1">
            {isPrivateContact(lead) && (
              <span className="text-[8px] font-semibold tracking-wide uppercase px-1 py-0.5 rounded bg-gray-100 text-gray-500">Privado</span>
            )}
            {leadPhoneLabel(lead)}
          </p>
        </div>
        {unread && (
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500 text-white shrink-0">{lead.unread_count}</span>
        )}
      </div>

      {lead.last_message && <p className="text-[11px] text-gray-500 line-clamp-2 mt-2">{lead.last_message}</p>}

      {(lead.tags || []).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {(lead.tags || []).slice(0, 3).map((t) => (
            <span key={t} className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-50 text-gray-600 border border-gray-100">{t}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
        <span className="text-[10px] text-gray-400 flex items-center gap-1">
          <MessageSquare size={9} /> {lead.message_count ?? 0}
        </span>
        <span className="text-[10px] text-gray-400">{formatRelative(lead.last_activity_at)}</span>
      </div>
    </div>
  );
}

function TableView({
  leads,
  categories,
  selected,
  setSelected,
  onOpen,
  onCategoryChange,
}: {
  leads: Lead[];
  categories: CategoryColumn[];
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  onOpen: (lead: Lead) => void;
  onCategoryChange: (id: string, category: string) => void;
}) {
  const allSelected = leads.length > 0 && leads.every((l) => selected.has(l.id));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(leads.map((l) => l.id)));
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-10 px-3 py-3">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} className="rounded border-gray-300 text-gray-900 focus:ring-gray-900" />
              </th>
              <th className="px-3 py-3 text-left font-semibold">Contato</th>
              <th className="px-3 py-3 text-left font-semibold">Telefone</th>
              <th className="px-3 py-3 text-left font-semibold">Categoria</th>
              <th className="px-3 py-3 text-left font-semibold">Tags</th>
              <th className="px-3 py-3 text-right font-semibold">Mensagens</th>
              <th className="px-3 py-3 text-right font-semibold">Ultima atividade</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {leads.map((lead) => {
              const isSel = selected.has(lead.id);
              return (
                <tr key={lead.id} className={`hover:bg-gray-50 transition ${isSel ? 'bg-gray-50' : ''}`}>
                  <td className="px-3 py-3">
                    <input type="checkbox" checked={isSel} onChange={() => toggle(lead.id)} className="rounded border-gray-300 text-gray-900 focus:ring-gray-900" />
                  </td>
                  <td className="px-3 py-3">
                    <button onClick={() => onOpen(lead)} className="flex items-center gap-2 text-left">
                      {lead.profile_picture_url ? (
                        <img src={lead.profile_picture_url} alt={leadDisplayName(lead)} className="w-8 h-8 rounded-full object-cover bg-gray-100" />
                      ) : (
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-[11px] font-semibold text-gray-600">
                          {leadDisplayName(lead).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{leadDisplayName(lead)}</p>
                        {lead.company && <p className="text-[11px] text-gray-500">{lead.company}</p>}
                      </div>
                    </button>
                  </td>
                  <td className="px-3 py-3 text-gray-600 text-xs">{leadPhoneLabel(lead)}</td>
                  <td className="px-3 py-3">
                    <select
                      value={lead.category || (categories[0]?.key ?? 'cold')}
                      onChange={(e) => onCategoryChange(lead.id, e.target.value)}
                      className="text-xs bg-white border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-900"
                    >
                      {categories.map((c) => (
                        <option key={c.key} value={c.key}>{c.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[180px]">
                      {(lead.tags || []).slice(0, 3).map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-gray-50 text-gray-600 border border-gray-100">
                          <TagIcon size={9} /> {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-xs text-gray-700 font-medium">{lead.message_count ?? 0}</td>
                  <td className="px-3 py-3 text-right text-xs text-gray-500">{formatRelative(lead.last_activity_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
