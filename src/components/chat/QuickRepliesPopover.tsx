import { useState, useRef, useEffect, useCallback } from 'react';
import {
  X, Search, Plus, Type, Image, Link2, Mic, Trash2, Pencil, ArrowLeft, Send, Upload, ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageTemplate, TemplateMediaType } from '../../lib/types';
import { useQuickReplies, QuickReplyInput } from '../../lib/useQuickReplies';
import { supabase } from '../../lib/supabase';
import { AudioPlayer } from './AudioPlayer';

interface PickerProps {
  open: boolean;
  onClose: () => void;
  onSelectText: (text: string) => void;
  onSelectImage: (blob: Blob, caption: string) => void;
  onSelectAudio: (blob: Blob, mimeType: string, duration: number) => void;
}

const TYPE_TABS: { key: TemplateMediaType; label: string; icon: typeof Type }[] = [
  { key: 'text', label: 'Texto', icon: Type },
  { key: 'image', label: 'Imagem', icon: Image },
  { key: 'link', label: 'Link', icon: Link2 },
  { key: 'audio', label: 'Audio', icon: Mic },
];

function typeIcon(t: TemplateMediaType) {
  const match = TYPE_TABS.find((tab) => tab.key === t);
  if (!match) return Type;
  return match.icon;
}

function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const el = document.createElement('audio');
      el.preload = 'metadata';
      el.onloadedmetadata = () => {
        const d = Number.isFinite(el.duration) ? Math.max(1, Math.round(el.duration)) : 1;
        URL.revokeObjectURL(url);
        resolve(d);
      };
      el.onerror = () => { URL.revokeObjectURL(url); resolve(1); };
      el.src = url;
    } catch { resolve(1); }
  });
}

export function QuickRepliesPopover({ open, onClose, onSelectText, onSelectImage, onSelectAudio }: PickerProps) {
  const { templates, loading, create, update, remove, getSignedUrl } = useQuickReplies();
  const [view, setView] = useState<'picker' | 'form'>('picker');
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [formError, setFormError] = useState('');

  const [formTitle, setFormTitle] = useState('');
  const [formShortcut, setFormShortcut] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formType, setFormType] = useState<TemplateMediaType>('text');
  const [formFile, setFormFile] = useState<File | null>(null);
  const [formFilePreview, setFormFilePreview] = useState<string | null>(null);
  const [formAudioDuration, setFormAudioDuration] = useState(0);
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setView('picker');
      setSearch('');
      setEditId(null);
      setDeleteConfirm(null);
      setFormError('');
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (formFilePreview) URL.revokeObjectURL(formFilePreview);
    };
  }, [formFilePreview]);

  const resetForm = useCallback(() => {
    setFormTitle('');
    setFormShortcut('');
    setFormBody('');
    setFormType('text');
    setFormFile(null);
    if (formFilePreview) URL.revokeObjectURL(formFilePreview);
    setFormFilePreview(null);
    setFormAudioDuration(0);
    setEditId(null);
    setFormError('');
    setExistingMediaUrl(null);
  }, [formFilePreview]);

  function openCreateForm() {
    resetForm();
    setView('form');
  }

  async function openEditForm(t: MessageTemplate) {
    resetForm();
    setEditId(t.id);
    setFormTitle(t.title);
    setFormShortcut(t.shortcut);
    setFormBody(t.body);
    setFormType(t.media_type);
    setFormAudioDuration(t.audio_duration_seconds ?? 0);
    if (t.media_url && (t.media_type === 'image' || t.media_type === 'audio')) {
      try {
        const url = await getSignedUrl(t.media_url);
        setExistingMediaUrl(url);
      } catch { /* ignore */ }
    }
    setView('form');
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (formType === 'image' && !file.type.startsWith('image/')) {
      setFormError('Selecione um arquivo de imagem valido.');
      return;
    }
    if (formType === 'audio' && !file.type.startsWith('audio/')) {
      setFormError('Selecione um arquivo de audio valido.');
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      setFormError('Arquivo excede 16 MB.');
      return;
    }
    setFormError('');
    setFormFile(file);
    if (formFilePreview) URL.revokeObjectURL(formFilePreview);
    setFormFilePreview(URL.createObjectURL(file));
    setExistingMediaUrl(null);
    if (formType === 'audio') {
      const dur = await readAudioDuration(file);
      setFormAudioDuration(dur);
    }
  }

  async function handleSave() {
    if (!formTitle.trim()) { setFormError('Titulo obrigatorio'); return; }
    if ((formType === 'text' || formType === 'link') && !formBody.trim()) {
      setFormError(formType === 'link' ? 'URL obrigatoria' : 'Texto obrigatorio');
      return;
    }
    if ((formType === 'image' || formType === 'audio') && !formFile && !existingMediaUrl) {
      setFormError('Arquivo obrigatorio');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const input: QuickReplyInput = {
        title: formTitle,
        shortcut: formShortcut,
        body: formBody,
        media_type: formType,
        file: formFile,
        audio_duration_seconds: formType === 'audio' ? formAudioDuration : undefined,
      };
      if (editId) {
        await update(editId, input);
      } else {
        await create(input);
      }
      resetForm();
      setView('picker');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await remove(id);
      setDeleteConfirm(null);
    } catch { /* ignore */ }
  }

  async function handleSelect(t: MessageTemplate) {
    if (t.media_type === 'text' || t.media_type === 'link') {
      onSelectText(t.body);
      onClose();
      return;
    }
    if (!t.media_url) return;
    try {
      const { data: file, error } = await supabase.storage
        .from('quick-reply-media')
        .download(t.media_url);
      if (error || !file) return;

      if (t.media_type === 'image') {
        onSelectImage(file, t.body);
        onClose();
      } else if (t.media_type === 'audio') {
        onSelectAudio(file, file.type || 'audio/mpeg', t.audio_duration_seconds ?? 1);
        onClose();
      }
    } catch { /* ignore */ }
  }

  const filtered = templates.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.shortcut.toLowerCase().includes(q) ||
      t.body.toLowerCase().includes(q)
    );
  });

  if (!open) return null;

  return (
    <div ref={popoverRef} className="absolute bottom-full left-0 right-0 mb-1 z-30">
      <motion.div
        initial={{ opacity: 0, y: 8, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        className="mx-3 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
        style={{ maxHeight: '420px' }}
      >
        <AnimatePresence mode="wait">
          {view === 'picker' ? (
            <motion.div
              key="picker"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.12 }}
            >
              <PickerView
                templates={filtered}
                loading={loading}
                search={search}
                onSearchChange={setSearch}
                onSelect={handleSelect}
                onEdit={openEditForm}
                onDelete={(id) => setDeleteConfirm(id)}
                deleteConfirm={deleteConfirm}
                onConfirmDelete={handleDelete}
                onCancelDelete={() => setDeleteConfirm(null)}
                onCreate={openCreateForm}
                onClose={onClose}
              />
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.12 }}
            >
              <FormView
                editId={editId}
                formTitle={formTitle}
                formShortcut={formShortcut}
                formBody={formBody}
                formType={formType}
                formFile={formFile}
                formFilePreview={formFilePreview}
                formAudioDuration={formAudioDuration}
                existingMediaUrl={existingMediaUrl}
                formError={formError}
                saving={saving}
                fileInputRef={fileInputRef}
                onTitleChange={setFormTitle}
                onShortcutChange={setFormShortcut}
                onBodyChange={setFormBody}
                onTypeChange={(t) => { setFormType(t); setFormFile(null); if (formFilePreview) URL.revokeObjectURL(formFilePreview); setFormFilePreview(null); setExistingMediaUrl(null); }}
                onFileChange={handleFileChange}
                onSave={handleSave}
                onBack={() => { resetForm(); setView('picker'); }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

interface PickerViewProps {
  templates: MessageTemplate[];
  loading: boolean;
  search: string;
  onSearchChange: (v: string) => void;
  onSelect: (t: MessageTemplate) => void;
  onEdit: (t: MessageTemplate) => void;
  onDelete: (id: string) => void;
  deleteConfirm: string | null;
  onConfirmDelete: (id: string) => void;
  onCancelDelete: () => void;
  onCreate: () => void;
  onClose: () => void;
}

function PickerView({
  templates, loading, search, onSearchChange, onSelect, onEdit, onDelete,
  deleteConfirm, onConfirmDelete, onCancelDelete, onCreate, onClose,
}: PickerViewProps) {
  return (
    <div className="flex flex-col" style={{ maxHeight: '420px' }}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar resposta rapida..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            autoFocus
          />
        </div>
        <button
          onClick={onCreate}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors shrink-0"
        >
          <Plus size={12} /> Nova
        </button>
        <button
          onClick={onClose}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0" style={{ maxHeight: '360px' }}>
        {loading ? (
          <div className="p-6 text-center">
            <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin mx-auto" />
          </div>
        ) : templates.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-xs text-gray-500 mb-2">
              {search ? 'Nenhum resultado encontrado' : 'Nenhuma resposta rapida'}
            </p>
            {!search && (
              <button
                onClick={onCreate}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                Criar a primeira
              </button>
            )}
          </div>
        ) : (
          <div className="py-1">
            {templates.map((t) => {
              const Icon = typeIcon(t.media_type);
              const isDeleting = deleteConfirm === t.id;
              return (
                <div key={t.id} className="group relative">
                  {isDeleting ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 border-b border-red-100">
                      <span className="text-xs text-red-700 flex-1">Excluir "{t.title}"?</span>
                      <button
                        onClick={() => onConfirmDelete(t.id)}
                        className="px-2 py-1 text-[10px] font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600"
                      >
                        Excluir
                      </button>
                      <button
                        onClick={onCancelDelete}
                        className="px-2 py-1 text-[10px] font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onSelect(t)}
                      className="w-full flex items-start gap-2.5 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left"
                    >
                      <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                        <Icon size={13} className="text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-gray-900 truncate">{t.title}</span>
                          {t.shortcut && (
                            <span className="text-[9px] font-mono font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                              /{t.shortcut}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 truncate mt-0.5">
                          {t.media_type === 'image' ? (t.body || 'Imagem') : t.media_type === 'audio' ? 'Nota de voz' : t.body}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); onEdit(t); }}
                          className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md"
                          title="Editar"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDelete(t.id); }}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                          title="Excluir"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <ChevronRight size={12} className="text-gray-300 shrink-0 mt-1.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

interface FormViewProps {
  editId: string | null;
  formTitle: string;
  formShortcut: string;
  formBody: string;
  formType: TemplateMediaType;
  formFile: File | null;
  formFilePreview: string | null;
  formAudioDuration: number;
  existingMediaUrl: string | null;
  formError: string;
  saving: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onTitleChange: (v: string) => void;
  onShortcutChange: (v: string) => void;
  onBodyChange: (v: string) => void;
  onTypeChange: (t: TemplateMediaType) => void;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSave: () => void;
  onBack: () => void;
}

function FormView({
  editId, formTitle, formShortcut, formBody, formType, formFile, formFilePreview,
  formAudioDuration, existingMediaUrl, formError, saving, fileInputRef,
  onTitleChange, onShortcutChange, onBodyChange, onTypeChange, onFileChange, onSave, onBack,
}: FormViewProps) {
  const fileAccept = formType === 'image' ? 'image/*' : formType === 'audio' ? 'audio/*' : '';

  return (
    <div className="flex flex-col" style={{ maxHeight: '420px' }}>
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
        <button
          onClick={onBack}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-gray-900 flex-1">
          {editId ? 'Editar resposta rapida' : 'Nova resposta rapida'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ maxHeight: '360px' }}>
        {/* Type tabs */}
        <div className="flex gap-1 p-0.5 bg-gray-100 rounded-xl">
          {TYPE_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = formType === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => onTypeChange(tab.key)}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-semibold rounded-lg transition-all ${
                  active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={11} /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Title */}
        <div>
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Titulo</label>
          <input
            type="text"
            value={formTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            placeholder="Ex: Saudacao inicial"
            className="w-full mt-1 px-3 py-2 text-xs bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
          />
        </div>

        {/* Shortcut */}
        <div>
          <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Atalho (opcional)</label>
          <div className="relative mt-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">/</span>
            <input
              type="text"
              value={formShortcut}
              onChange={(e) => onShortcutChange(e.target.value.replace(/\s/g, '').toLowerCase())}
              placeholder="ola"
              className="w-full pl-6 pr-3 py-2 text-xs bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
            />
          </div>
        </div>

        {/* Body (for text and link types) */}
        {(formType === 'text' || formType === 'link') && (
          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              {formType === 'link' ? 'URL' : 'Mensagem'}
            </label>
            <textarea
              value={formBody}
              onChange={(e) => onBodyChange(e.target.value)}
              placeholder={formType === 'link' ? 'https://...' : 'Digite a mensagem...'}
              rows={3}
              className="w-full mt-1 px-3 py-2 text-xs bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
            />
          </div>
        )}

        {/* Caption for image */}
        {formType === 'image' && (
          <div>
            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
              Legenda (opcional)
            </label>
            <textarea
              value={formBody}
              onChange={(e) => onBodyChange(e.target.value)}
              placeholder="Legenda da imagem..."
              rows={2}
              className="w-full mt-1 px-3 py-2 text-xs bg-gray-50 border border-gray-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent resize-none"
            />
          </div>
        )}

        {/* File upload for image and audio */}
        {(formType === 'image' || formType === 'audio') && (
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept={fileAccept}
              className="hidden"
              onChange={onFileChange}
            />

            {formFilePreview && formType === 'image' && (
              <div className="mb-2 rounded-xl overflow-hidden border border-gray-100">
                <img src={formFilePreview} alt="Preview" className="w-full max-h-32 object-cover" />
              </div>
            )}

            {formFilePreview && formType === 'audio' && (
              <div className="mb-2 rounded-xl border border-gray-100 p-2">
                <AudioPlayer src={formFilePreview} durationSeconds={formAudioDuration} variant="in" />
              </div>
            )}

            {!formFilePreview && existingMediaUrl && formType === 'image' && (
              <div className="mb-2 rounded-xl overflow-hidden border border-gray-100">
                <img src={existingMediaUrl} alt="Atual" className="w-full max-h-32 object-cover" />
              </div>
            )}

            {!formFilePreview && existingMediaUrl && formType === 'audio' && (
              <div className="mb-2 rounded-xl border border-gray-100 p-2">
                <AudioPlayer src={existingMediaUrl} durationSeconds={formAudioDuration} variant="in" />
              </div>
            )}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium text-gray-600 bg-gray-50 border border-dashed border-gray-200 rounded-xl hover:bg-gray-100 hover:border-gray-300 transition-colors"
            >
              <Upload size={13} />
              {formFile ? formFile.name : existingMediaUrl ? 'Trocar arquivo' : formType === 'image' ? 'Selecionar imagem' : 'Selecionar audio'}
            </button>
          </div>
        )}

        {formError && (
          <p className="text-[11px] text-red-600 bg-red-50 px-3 py-1.5 rounded-lg">{formError}</p>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-gray-100">
        <button
          onClick={onBack}
          className="flex-1 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={onSave}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          {saving ? (
            <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Send size={11} />
          )}
          {editId ? 'Salvar' : 'Criar'}
        </button>
      </div>
    </div>
  );
}
