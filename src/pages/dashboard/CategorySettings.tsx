import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, RotateCcw, Check, GripVertical, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { useLeadCategories, LeadCategoryRow } from '../../lib/useLeadCategories';
import { resolveIcon, ICON_OPTIONS } from '../../lib/iconMap';

const COLOR_PRESETS: { label: string; value: string }[] = [
  { label: 'Cinza', value: 'bg-gray-100 text-gray-700' },
  { label: 'Azul', value: 'bg-sky-100 text-sky-700' },
  { label: 'Amarelo', value: 'bg-amber-100 text-amber-700' },
  { label: 'Verde', value: 'bg-emerald-100 text-emerald-700' },
  { label: 'Laranja', value: 'bg-orange-100 text-orange-700' },
  { label: 'Teal', value: 'bg-teal-100 text-teal-700' },
  { label: 'Vermelho', value: 'bg-red-100 text-red-700' },
  { label: 'Rosa', value: 'bg-pink-100 text-pink-700' },
  { label: 'Cyan', value: 'bg-cyan-100 text-cyan-700' },
];

function colorDot(colorClass: string) {
  const bg = colorClass.split(' ')[0] || 'bg-gray-100';
  return bg.replace('-100', '-400');
}

function CategoryRow({
  cat,
  totalCategories,
  onLabelChange,
  onColorChange,
  onIconChange,
  onDelete,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragOver,
}: {
  cat: LeadCategoryRow;
  totalCategories: number;
  onLabelChange: (key: string, label: string) => void;
  onColorChange: (key: string, color: string) => void;
  onIconChange: (key: string, icon: string) => void;
  onDelete: (cat: LeadCategoryRow) => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
  isDragOver: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cat.label);
  const [showColors, setShowColors] = useState(false);
  const [showIcons, setShowIcons] = useState(false);
  const [saved, setSaved] = useState(false);

  const Icon = resolveIcon(cat.icon);

  function commitLabel() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== cat.label) {
      onLabelChange(cat.key, trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } else {
      setDraft(cat.label);
    }
    setEditing(false);
  }

  return (
    <motion.div
      layout
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={`flex items-center gap-4 px-5 py-4 border-b border-gray-50 last:border-b-0 group transition-colors ${
        isDragOver ? 'bg-gray-50 border-t-2 border-t-gray-900' : ''
      }`}
    >
      <GripVertical size={16} className="text-gray-300 shrink-0 cursor-grab active:cursor-grabbing" />

      {/* Icon picker */}
      <div className="relative">
        <button
          onClick={() => setShowIcons(!showIcons)}
          className={`w-9 h-9 rounded-xl ${cat.color} flex items-center justify-center transition-transform hover:scale-110`}
          title="Alterar icone"
        >
          <Icon size={16} />
        </button>

        <AnimatePresence>
          {showIcons && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowIcons(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                className="absolute left-0 top-full mt-2 z-20 bg-white border border-gray-100 rounded-2xl shadow-lg p-3 grid grid-cols-5 gap-1.5 w-56"
              >
                {ICON_OPTIONS.map((opt) => {
                  const Ic = opt.component;
                  return (
                    <button
                      key={opt.name}
                      onClick={() => {
                        onIconChange(cat.key, opt.name);
                        setShowIcons(false);
                      }}
                      className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-gray-50 ${
                        opt.name === cat.icon ? 'ring-2 ring-gray-900 ring-offset-1 bg-gray-50' : ''
                      }`}
                      title={opt.name}
                    >
                      <Ic size={16} className="text-gray-700" />
                    </button>
                  );
                })}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Color picker */}
      <div className="relative">
        <button
          onClick={() => setShowColors(!showColors)}
          className={`w-5 h-5 rounded-full ${colorDot(cat.color)} border-2 border-white shadow-sm transition-transform hover:scale-125`}
          title="Alterar cor"
        />

        <AnimatePresence>
          {showColors && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColors(false)} />
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: -4 }}
                className="absolute left-0 top-full mt-2 z-20 bg-white border border-gray-100 rounded-2xl shadow-lg p-3 grid grid-cols-3 gap-2 w-48"
              >
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    onClick={() => {
                      onColorChange(cat.key, preset.value);
                      setShowColors(false);
                    }}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-gray-50 ${
                      preset.value === cat.color ? 'ring-2 ring-gray-900 ring-offset-1' : ''
                    }`}
                  >
                    <span className={`w-3 h-3 rounded-full ${colorDot(preset.value)}`} />
                    {preset.label}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitLabel();
              if (e.key === 'Escape') { setDraft(cat.label); setEditing(false); }
            }}
            maxLength={30}
            className="w-full text-sm font-medium text-gray-900 bg-gray-50 border border-gray-200 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
          />
        ) : (
          <button
            onClick={() => { setDraft(cat.label); setEditing(true); }}
            className="text-sm font-medium text-gray-900 hover:text-gray-600 transition-colors text-left"
          >
            {cat.label}
          </button>
        )}
      </div>

      {/* Preview badge */}
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cat.color}`}>
        <Icon size={12} />
        {cat.label}
      </span>

      <AnimatePresence>
        {saved && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="text-emerald-500 shrink-0"
          >
            <Check size={16} />
          </motion.span>
        )}
      </AnimatePresence>

      <span className="text-xs text-gray-300 font-mono shrink-0 w-16 text-right">{cat.key}</span>

      <button
        onClick={() => onDelete(cat)}
        disabled={totalCategories <= 2}
        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-0 disabled:cursor-not-allowed"
        title="Excluir categoria"
      >
        <Trash2 size={14} />
      </button>
    </motion.div>
  );
}

export function CategorySettings({ embedded = false }: { embedded?: boolean } = {}) {
  const {
    categories,
    loading,
    updateCategoryLabel,
    updateCategoryColor,
    updateCategoryIcon,
    addCategory,
    deleteCategory,
    reorderCategories,
    resetToDefaults,
  } = useLeadCategories();

  const [resetting, setResetting] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ label: '', color: COLOR_PRESETS[1].value, icon: 'CircleDot' });
  const [addSaving, setAddSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LeadCategoryRow | null>(null);
  const [migrateTo, setMigrateTo] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  async function handleReset() {
    setResetting(true);
    await resetToDefaults();
    setResetting(false);
  }

  async function handleAdd() {
    if (!addForm.label.trim()) return;
    setAddSaving(true);
    await addCategory(addForm.label.trim(), addForm.color, addForm.icon);
    setAddForm({ label: '', color: COLOR_PRESETS[1].value, icon: 'CircleDot' });
    setShowAdd(false);
    setAddSaving(false);
  }

  function openDelete(cat: LeadCategoryRow) {
    const others = categories.filter((c) => c.key !== cat.key);
    setDeleteTarget(cat);
    setMigrateTo(others[0]?.key ?? '');
  }

  async function handleDelete() {
    if (!deleteTarget || !migrateTo) return;
    setDeleting(true);
    await deleteCategory(deleteTarget.key, migrateTo);
    setDeleteTarget(null);
    setMigrateTo('');
    setDeleting(false);
  }

  function handleDrop(e: React.DragEvent, dropIdx: number) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) return;
    const reordered = [...categories];
    const [moved] = reordered.splice(dragIdx, 1);
    reordered.splice(dropIdx, 0, moved);
    reorderCategories(reordered);
    setDragIdx(null);
    setDragOverIdx(null);
  }

  const othersForDelete = deleteTarget
    ? categories.filter((c) => c.key !== deleteTarget.key)
    : [];

  const AddIcon = resolveIcon(addForm.icon);

  const content = (
    <>
      <Card padding="none">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Categorias de Leads</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Arraste para reordenar. Clique no nome para editar. Clique no icone ou na cor para alterar.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="ghost" size="sm" onClick={handleReset} loading={resetting}>
                  <RotateCcw size={14} /> Restaurar
                </Button>
                <Button size="sm" onClick={() => setShowAdd(true)}>
                  <Plus size={14} /> Nova categoria
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="p-5 space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-10 bg-gray-50 rounded-xl animate-pulse" />
                ))}
              </div>
            ) : (
              <div>
                {categories.map((cat, idx) => (
                  <CategoryRow
                    key={cat.key}
                    cat={cat}
                    totalCategories={categories.length}
                    onLabelChange={updateCategoryLabel}
                    onColorChange={updateCategoryColor}
                    onIconChange={updateCategoryIcon}
                    onDelete={openDelete}
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== idx) setDragOverIdx(idx); }}
                    onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
                    onDrop={(e) => handleDrop(e, idx)}
                    isDragOver={dragOverIdx === idx}
                  />
                ))}
              </div>
            )}

            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {categories.length} categoria{categories.length !== 1 ? 's' : ''} configurada{categories.length !== 1 ? 's' : ''}
              </p>
              <p className="text-xs text-gray-300">As alteracoes sao salvas automaticamente.</p>
            </div>
          </Card>

      <div className="mt-4 p-4 bg-blue-50 rounded-2xl">
        <p className="text-xs text-blue-600 font-medium mb-1">Como funciona</p>
        <p className="text-xs text-blue-500">
          As categorias organizam seus leads no Kanban e nos detalhes de cada contato.
          A primeira categoria da lista sera usada como padrao para novos leads.
          Ao excluir uma categoria, todos os leads nela serao movidos para a que voce escolher.
        </p>
      </div>

      {/* Add Category Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Nova categoria" maxWidth="sm">
        <div className="space-y-4">
          <Input
            label="Nome da categoria"
            placeholder="Ex: Negociacao, Follow-up..."
            value={addForm.label}
            onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
            maxLength={30}
          />

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Icone</label>
            <div className="grid grid-cols-5 gap-1.5">
              {ICON_OPTIONS.map((opt) => {
                const Ic = opt.component;
                return (
                  <button
                    key={opt.name}
                    type="button"
                    onClick={() => setAddForm((f) => ({ ...f, icon: opt.name }))}
                    className={`w-10 h-10 flex items-center justify-center rounded-xl border-2 transition ${
                      addForm.icon === opt.name
                        ? 'border-gray-900 bg-gray-50'
                        : 'border-gray-100 hover:border-gray-200'
                    }`}
                    title={opt.name}
                  >
                    <Ic size={18} className="text-gray-700" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Cor</label>
            <div className="grid grid-cols-3 gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setAddForm((f) => ({ ...f, color: preset.value }))}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-xs font-medium transition ${
                    addForm.color === preset.value
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full ${colorDot(preset.value)}`} />
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
            <span className="text-xs text-gray-500">Preview:</span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${addForm.color}`}>
              <AddIcon size={12} />
              {addForm.label || 'Nova categoria'}
            </span>
          </div>

          <Button fullWidth onClick={handleAdd} loading={addSaving} disabled={!addForm.label.trim()}>
            Adicionar categoria
          </Button>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => { setDeleteTarget(null); setMigrateTo(''); }}
        title="Excluir categoria"
        maxWidth="sm"
      >
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
              <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Excluir a categoria "{deleteTarget.label}"?
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Todos os leads nessa categoria serao movidos para a categoria selecionada abaixo. Esta acao nao pode ser desfeita.
                </p>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700 block mb-2">Mover leads para:</label>
              <div className="space-y-2">
                {othersForDelete.map((c) => {
                  const Ic = resolveIcon(c.icon);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setMigrateTo(c.key)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border-2 text-left transition ${
                        migrateTo === c.key
                          ? 'border-gray-900 bg-gray-50'
                          : 'border-gray-100 hover:border-gray-200'
                      }`}
                    >
                      <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${c.color}`}>
                        <Ic size={14} />
                      </span>
                      <span className="text-sm font-medium text-gray-900">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" fullWidth onClick={() => { setDeleteTarget(null); setMigrateTo(''); }}>
                Cancelar
              </Button>
              <Button variant="danger" fullWidth onClick={handleDelete} loading={deleting} disabled={!migrateTo}>
                <Trash2 size={14} /> Excluir
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );

  if (embedded) return content;

  return (
    <div className="p-8">
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-1">
              <Layers size={20} className="text-gray-400" />
              <h1 className="text-2xl font-bold text-gray-900">Categorias</h1>
            </div>
            <p className="text-sm text-gray-500">
              Crie, edite, reordene e exclua as categorias do seu funil de vendas.
            </p>
          </div>
          {content}
        </motion.div>
      </div>
    </div>
  );
}
