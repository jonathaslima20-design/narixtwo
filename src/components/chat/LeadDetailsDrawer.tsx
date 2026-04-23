import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Building2, Briefcase, Star, Archive, Ban, Sparkles, Clock, FileText, Tag as TagIcon, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Lead, LeadNote, LeadActivity } from '../../lib/types';
import { leadDisplayName, leadPhoneLabel } from '../../lib/leadDisplay';
import { useLeadCategories } from '../../lib/useLeadCategories';
import { resolveIcon } from '../../lib/iconMap';

interface Props {
  open: boolean;
  onClose: () => void;
  lead: Lead | null;
  userId: string;
  onLeadUpdated: (patch: Partial<Lead> & { id: string }) => void;
  onLeadDeleted: (id: string) => void;
}

type Tab = 'details' | 'notes' | 'activity' | 'ai';

export function LeadDetailsDrawer({ open, onClose, lead, userId, onLeadUpdated, onLeadDeleted }: Props) {
  const { categories } = useLeadCategories();
  const [tab, setTab] = useState<Tab>('details');
  const [form, setForm] = useState<Partial<Lead>>({});
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [newNote, setNewNote] = useState('');
  const [newTag, setNewTag] = useState('');

  useEffect(() => {
    if (lead) {
      setForm({
        name: lead.name,
        phone: lead.phone,
        email: lead.email || '',
        company: lead.company || '',
        role_title: lead.role_title || '',
      });
    }
  }, [lead]);

  useEffect(() => {
    if (!lead || !open) return;
    if (tab === 'notes') {
      supabase
        .from('lead_notes')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .then(({ data }) => setNotes((data as LeadNote[]) || []));
    }
    if (tab === 'activity') {
      supabase
        .from('lead_activities')
        .select('*')
        .eq('lead_id', lead.id)
        .order('created_at', { ascending: false })
        .limit(50)
        .then(({ data }) => setActivities((data as LeadActivity[]) || []));
    }
  }, [lead, tab, open]);

  if (!lead) return null;

  async function update(patch: Partial<Lead>) {
    if (!lead) return;
    const { data } = await supabase.from('leads').update(patch).eq('id', lead.id).select().maybeSingle();
    if (data) onLeadUpdated(data as Lead);
  }

  async function saveDetails() {
    await update(form);
  }

  async function setCategory(key: string) {
    await update({ category: key } as Partial<Lead>);
    await supabase.from('lead_activities').insert({
      user_id: userId,
      lead_id: lead!.id,
      action: 'category_changed',
      meta: { category: key },
    });
  }

  async function addTag() {
    if (!newTag.trim() || !lead) return;
    const tags = [...new Set([...(lead.tags || []), newTag.trim()])];
    await update({ tags });
    setNewTag('');
  }

  async function removeTag(t: string) {
    if (!lead) return;
    await update({ tags: (lead.tags || []).filter((x) => x !== t) });
  }

  async function addNote() {
    if (!newNote.trim() || !lead) return;
    const { data } = await supabase
      .from('lead_notes')
      .insert({ user_id: userId, lead_id: lead.id, body: newNote.trim() })
      .select()
      .maybeSingle();
    if (data) setNotes((n) => [data as LeadNote, ...n]);
    setNewNote('');
  }

  async function deleteNote(id: string) {
    await supabase.from('lead_notes').delete().eq('id', id);
    setNotes((n) => n.filter((x) => x.id !== id));
  }

  async function deleteLead() {
    if (!lead) return;
    if (!confirm('Remover este lead e todas as mensagens?')) return;
    await supabase.from('leads').delete().eq('id', lead.id);
    onLeadDeleted(lead.id);
    onClose();
  }

  const tabs: { key: Tab; label: string; icon: typeof Mail }[] = [
    { key: 'details', label: 'Detalhes', icon: Mail },
    { key: 'notes', label: 'Notas', icon: FileText },
    { key: 'activity', label: 'Atividade', icon: Clock },
    { key: 'ai', label: 'IA', icon: Sparkles },
  ];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/30 z-40"
          />
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 shadow-xl flex flex-col"
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center text-sm font-bold text-gray-700">
                  {leadDisplayName(lead).charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{leadDisplayName(lead)}</p>
                  <p className="text-xs text-gray-500">{leadPhoneLabel(lead)}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>

            <div className="flex border-b border-gray-100">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-all ${
                    tab === t.key
                      ? 'text-gray-900 border-b-2 border-gray-900'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <t.icon size={13} /> {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {tab === 'details' && (
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => update({ is_favorite: !lead.is_favorite })}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium border transition-colors ${
                        lead.is_favorite ? 'bg-amber-50 border-amber-200 text-amber-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Star size={12} className={lead.is_favorite ? 'fill-amber-400' : ''} /> Favorito
                    </button>
                    <button
                      onClick={() => update({ is_archived: !lead.is_archived })}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium border transition-colors ${
                        lead.is_archived ? 'bg-gray-100 border-gray-300 text-gray-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Archive size={12} /> Arquivar
                    </button>
                    <button
                      onClick={() => update({ is_blocked: !lead.is_blocked })}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium border transition-colors ${
                        lead.is_blocked ? 'bg-red-50 border-red-200 text-red-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <Ban size={12} /> Bloquear
                    </button>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Categoria</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {categories.map((c) => {
                        const active = lead.category === c.key;
                        const CatIcon = resolveIcon(c.icon);
                        return (
                          <button
                            key={c.key}
                            onClick={() => setCategory(c.key)}
                            className={`px-2 py-1.5 rounded-lg text-[11px] font-medium transition-all flex items-center justify-center gap-1 ${
                              active ? `${c.color} ring-2 ring-gray-900` : `${c.color} opacity-60 hover:opacity-100`
                            }`}
                          >
                            <CatIcon size={11} />
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Field label="Nome" value={form.name || ''} onChange={(v) => setForm({ ...form, name: v })} />
                    <Field label="Telefone" value={form.phone || ''} onChange={(v) => setForm({ ...form, phone: v })} />
                    <Field label="Email" icon={Mail} value={form.email || ''} onChange={(v) => setForm({ ...form, email: v })} />
                    <Field label="Empresa" icon={Building2} value={form.company || ''} onChange={(v) => setForm({ ...form, company: v })} />
                    <Field label="Cargo" icon={Briefcase} value={form.role_title || ''} onChange={(v) => setForm({ ...form, role_title: v })} />
                  </div>
                  <button
                    onClick={saveDetails}
                    className="w-full py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700 transition-colors"
                  >
                    Salvar alteracoes
                  </button>

                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                      <TagIcon size={11} /> Tags
                    </p>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {(lead.tags || []).map((t) => (
                        <span key={t} className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-lg">
                          {t}
                          <button onClick={() => removeTag(t)}><X size={10} /></button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addTag()}
                        placeholder="Nova tag"
                        className="flex-1 px-2.5 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-gray-900"
                      />
                      <button onClick={addTag} className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded-lg hover:bg-gray-700">
                        Adicionar
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={deleteLead}
                    className="w-full flex items-center justify-center gap-1.5 py-2 text-red-500 text-xs font-medium hover:bg-red-50 rounded-xl transition-colors"
                  >
                    <Trash2 size={12} /> Remover lead
                  </button>
                </div>
              )}

              {tab === 'notes' && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <textarea
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="Adicionar nota interna..."
                      rows={2}
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                  <button onClick={addNote} className="w-full py-2 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-700">
                    Salvar nota
                  </button>
                  <div className="space-y-2">
                    {notes.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">Nenhuma nota ainda</p>
                    ) : (
                      notes.map((n) => (
                        <div key={n.id} className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">{n.body}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-[10px] text-gray-500">{new Date(n.created_at).toLocaleString('pt-BR')}</span>
                            <button onClick={() => deleteNote(n.id)} className="text-[10px] text-red-400 hover:text-red-600">Remover</button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {tab === 'activity' && (
                <div className="space-y-2">
                  {activities.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-6">Nenhuma atividade ainda</p>
                  ) : (
                    activities.map((a) => (
                      <div key={a.id} className="flex items-start gap-3 p-2.5 border-l-2 border-gray-200">
                        <div className="flex-1">
                          <p className="text-xs font-medium text-gray-700">{humanizeAction(a.action)}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{new Date(a.created_at).toLocaleString('pt-BR')}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === 'ai' && (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Sparkles size={12} className="text-emerald-600" />
                      <p className="text-xs font-semibold text-emerald-700">Resumo</p>
                    </div>
                    <p className="text-sm text-gray-700">
                      {lead.ai_summary || 'Nenhum resumo gerado ainda. A IA ira atualizar conforme novas mensagens chegarem.'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Score" value={`${lead.score ?? 0}/100`} />
                    <Stat label="Sentimento" value={lead.sentiment || 'neutro'} />
                    <Stat label="Intencao" value={lead.intent || '--'} />
                    <Stat label="Origem" value={lead.source || 'whatsapp'} />
                  </div>

                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Progresso de qualificacao</p>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
                        style={{ width: `${lead.score ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Field({ label, value, onChange, icon: Icon }: { label: string; value: string; onChange: (v: string) => void; icon?: typeof Mail }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-500 flex items-center gap-1 mb-1">
        {Icon && <Icon size={11} />} {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-2.5 bg-gray-50 rounded-xl">
      <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm text-gray-800 font-semibold capitalize">{value}</p>
    </div>
  );
}

function humanizeAction(action: string) {
  const map: Record<string, string> = {
    message_sent: 'Mensagem enviada',
    message_received: 'Mensagem recebida',
    stage_changed: 'Categoria alterada',
    category_changed: 'Categoria alterada',
    temperature_changed: 'Categoria alterada',
    note_added: 'Nota adicionada',
    tag_added: 'Tag adicionada',
    created: 'Lead criado',
  };
  return map[action] || action;
}
