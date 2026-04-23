import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Upload,
  FileText,
  X,
  ChevronRight,
  ChevronLeft,
  AlertTriangle,
  CheckCircle2,
  Users,
  Plus,
  Check,
  RefreshCw,
} from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { useLeadCategories, LeadCategoryRow } from '../../lib/useLeadCategories';
import { resolveIcon } from '../../lib/iconMap';
import { parseContacts, ParsedContact, RejectedLine } from '../../lib/parseContacts';
import { readContactsFile } from '../../lib/readContactsFile';

const COLOR_PRESETS = [
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

interface ExistingLead {
  phone: string;
  name: string;
  category: string;
}

type DuplicateMode = 'skip' | 'update' | 'pick';

interface Props {
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

export function BulkImportLeadsModal({ open, onClose, onComplete }: Props) {
  const { user } = useAuth();
  const {
    categories,
    addCategory,
    getLabelForKey,
  } = useLeadCategories();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [rawText, setRawText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatColor, setNewCatColor] = useState(COLOR_PRESETS[0].value);

  const [rejected, setRejected] = useState<RejectedLine[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [newContacts, setNewContacts] = useState<ParsedContact[]>([]);
  const [duplicates, setDuplicates] = useState<(ParsedContact & { existing: ExistingLead })[]>([]);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>('skip');
  const [pickedDuplicates, setPickedDuplicates] = useState<Set<string>>(new Set());
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);

  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultNew, setResultNew] = useState(0);
  const [resultUpdated, setResultUpdated] = useState(0);
  const [resultSkipped, setResultSkipped] = useState(0);
  const [resultErrors, setResultErrors] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveCategory = selectedCategory || categories[0]?.key || 'cold';

  const liveParseResult = useMemo(() => {
    if (!rawText.trim()) return { contacts: [], rejected: [], truncated: false };
    return parseContacts(rawText);
  }, [rawText]);

  function resetAll() {
    setStep(1);
    setRawText('');
    setFileName(null);
    setFileError(null);
    setSelectedCategory('');
    setShowNewCategory(false);
    setNewCatLabel('');
    setNewCatColor(COLOR_PRESETS[0].value);
    setRejected([]);
    setTruncated(false);
    setNewContacts([]);
    setDuplicates([]);
    setDuplicateMode('skip');
    setPickedDuplicates(new Set());
    setCheckingDuplicates(false);
    setImporting(false);
    setProgress(0);
    setResultNew(0);
    setResultUpdated(0);
    setResultSkipped(0);
    setResultErrors(0);
  }

  function handleClose() {
    resetAll();
    onClose();
  }

  async function handleFileSelected(file: File) {
    setFileError(null);
    try {
      const text = await readContactsFile(file);
      setRawText(text);
      setFileName(file.name);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Erro ao ler arquivo');
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handleFileSelected(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  }

  async function handleCreateCategory() {
    if (!newCatLabel.trim()) return;
    await addCategory(newCatLabel.trim(), newCatColor, 'CircleDot');
    const key = newCatLabel
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    setSelectedCategory(key);
    setShowNewCategory(false);
    setNewCatLabel('');
    setNewCatColor(COLOR_PRESETS[0].value);
  }

  async function goToStep2() {
    if (!user) return;
    const result = parseContacts(rawText);
    setRejected(result.rejected);
    setTruncated(result.truncated);

    if (result.contacts.length === 0) return;

    setCheckingDuplicates(true);
    setStep(2);

    const phones = result.contacts.map((c) => c.phone);
    const chunkSize = 200;
    const existingMap = new Map<string, ExistingLead>();

    for (let i = 0; i < phones.length; i += chunkSize) {
      const chunk = phones.slice(i, i + chunkSize);
      const { data } = await supabase
        .from('leads')
        .select('phone, name, category')
        .eq('user_id', user.id)
        .in('phone', chunk);
      if (data) {
        for (const row of data) {
          existingMap.set(row.phone, row as ExistingLead);
        }
      }
    }

    const fresh: ParsedContact[] = [];
    const dupes: (ParsedContact & { existing: ExistingLead })[] = [];

    for (const contact of result.contacts) {
      const existing = existingMap.get(contact.phone);
      if (existing) {
        dupes.push({ ...contact, existing });
      } else {
        fresh.push(contact);
      }
    }

    setNewContacts(fresh);
    setDuplicates(dupes);
    setPickedDuplicates(new Set());
    setDuplicateMode('skip');
    setCheckingDuplicates(false);
  }

  const togglePicked = useCallback((phone: string) => {
    setPickedDuplicates((prev) => {
      const next = new Set(prev);
      if (next.has(phone)) next.delete(phone);
      else next.add(phone);
      return next;
    });
  }, []);

  async function executeImport() {
    if (!user) return;
    setImporting(true);
    setProgress(0);

    const toInsert = newContacts.map((c) => ({
      user_id: user.id,
      phone: c.phone,
      name: c.name || '',
      temperature: 'cold' as const,
      category: effectiveCategory,
      pipeline_stage: 'new',
      source: 'import',
      last_activity_at: new Date().toISOString(),
    }));

    let toUpdate: typeof toInsert = [];
    if (duplicateMode === 'update') {
      toUpdate = duplicates.map((d) => ({
        user_id: user.id,
        phone: d.phone,
        name: d.name || d.existing.name || '',
        temperature: 'cold' as const,
        category: effectiveCategory,
        pipeline_stage: 'new',
        source: 'import',
        last_activity_at: new Date().toISOString(),
      }));
    } else if (duplicateMode === 'pick') {
      toUpdate = duplicates
        .filter((d) => pickedDuplicates.has(d.phone))
        .map((d) => ({
          user_id: user.id,
          phone: d.phone,
          name: d.name || d.existing.name || '',
          temperature: 'cold' as const,
          category: effectiveCategory,
          pipeline_stage: 'new',
          source: 'import',
          last_activity_at: new Date().toISOString(),
        }));
    }

    const totalOps = toInsert.length + toUpdate.length;
    let completed = 0;
    let insertedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    const batchSize = 100;

    for (let i = 0; i < toInsert.length; i += batchSize) {
      const batch = toInsert.slice(i, i + batchSize);
      const { error } = await supabase.from('leads').insert(batch);
      if (error) {
        errorCount += batch.length;
      } else {
        insertedCount += batch.length;
      }
      completed += batch.length;
      setProgress(Math.round((completed / totalOps) * 100));
    }

    for (let i = 0; i < toUpdate.length; i += batchSize) {
      const batch = toUpdate.slice(i, i + batchSize);
      const { error } = await supabase.from('leads').upsert(batch, {
        onConflict: 'user_id,phone',
        ignoreDuplicates: false,
      });
      if (error) {
        errorCount += batch.length;
      } else {
        updatedCount += batch.length;
      }
      completed += batch.length;
      setProgress(Math.round((completed / totalOps) * 100));
    }

    const skippedCount =
      duplicateMode === 'skip'
        ? duplicates.length
        : duplicateMode === 'pick'
        ? duplicates.length - pickedDuplicates.size
        : 0;

    setResultNew(insertedCount);
    setResultUpdated(updatedCount);
    setResultSkipped(skippedCount);
    setResultErrors(errorCount);
    setImporting(false);
    setStep(3);
    onComplete?.();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Importar leads em massa" maxWidth="xl">
      {step === 1 && (
        <StepInput
          rawText={rawText}
          onRawTextChange={setRawText}
          fileName={fileName}
          fileError={fileError}
          onClearFile={() => setFileName(null)}
          fileInputRef={fileInputRef}
          onFileInputChange={handleFileInputChange}
          onDrop={handleDrop}
          liveCount={liveParseResult.contacts.length}
          liveRejected={liveParseResult.rejected.length}
          liveTruncated={liveParseResult.truncated}
          categories={categories}
          selectedCategory={effectiveCategory}
          onCategoryChange={setSelectedCategory}
          showNewCategory={showNewCategory}
          onToggleNewCategory={() => setShowNewCategory((v) => !v)}
          newCatLabel={newCatLabel}
          onNewCatLabelChange={setNewCatLabel}
          newCatColor={newCatColor}
          onNewCatColorChange={setNewCatColor}
          onCreateCategory={handleCreateCategory}
          canProceed={liveParseResult.contacts.length > 0}
          onNext={goToStep2}
        />
      )}

      {step === 2 && (
        <StepReview
          newContacts={newContacts}
          duplicates={duplicates}
          rejected={rejected}
          truncated={truncated}
          loading={checkingDuplicates}
          duplicateMode={duplicateMode}
          onDuplicateModeChange={setDuplicateMode}
          pickedDuplicates={pickedDuplicates}
          onTogglePicked={togglePicked}
          categoryLabel={getLabelForKey(effectiveCategory)}
          importing={importing}
          progress={progress}
          onBack={() => setStep(1)}
          onImport={executeImport}
        />
      )}

      {step === 3 && (
        <StepResult
          resultNew={resultNew}
          resultUpdated={resultUpdated}
          resultSkipped={resultSkipped}
          resultErrors={resultErrors}
          onClose={handleClose}
        />
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 1 – Input                                                     */
/* ------------------------------------------------------------------ */

interface StepInputProps {
  rawText: string;
  onRawTextChange: (v: string) => void;
  fileName: string | null;
  fileError: string | null;
  onClearFile: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent) => void;
  liveCount: number;
  liveRejected: number;
  liveTruncated: boolean;
  categories: LeadCategoryRow[];
  selectedCategory: string;
  onCategoryChange: (key: string) => void;
  showNewCategory: boolean;
  onToggleNewCategory: () => void;
  newCatLabel: string;
  onNewCatLabelChange: (v: string) => void;
  newCatColor: string;
  onNewCatColorChange: (v: string) => void;
  onCreateCategory: () => void;
  canProceed: boolean;
  onNext: () => void;
}

function StepInput({
  rawText,
  onRawTextChange,
  fileName,
  fileError,
  onClearFile,
  fileInputRef,
  onFileInputChange,
  onDrop,
  liveCount,
  liveRejected,
  liveTruncated,
  categories,
  selectedCategory,
  onCategoryChange,
  showNewCategory,
  onToggleNewCategory,
  newCatLabel,
  onNewCatLabelChange,
  newCatColor,
  onNewCatColorChange,
  onCreateCategory,
  canProceed,
  onNext,
}: StepInputProps) {
  return (
    <div className="space-y-5">
      {/* Textarea */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">
          Contatos
        </label>
        <textarea
          value={rawText}
          onChange={(e) => onRawTextChange(e.target.value)}
          rows={8}
          placeholder={"5511999999999, Joao Silva\n5521988887777\n11977776666, Maria"}
          className="w-full px-4 py-3 text-sm text-gray-900 bg-white border border-gray-200 rounded-2xl outline-none transition-all placeholder:text-gray-400 focus:ring-2 focus:ring-gray-900 focus:border-transparent font-mono resize-none"
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-500">
            Um contato por linha. Formato: telefone, nome (ou apenas telefone).
            Separadores aceitos: virgula, ponto-e-virgula ou tab.
          </p>
        </div>
      </div>

      {/* Live stats */}
      {rawText.trim() && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
            <Users size={12} /> {liveCount} contato{liveCount !== 1 ? 's' : ''} valido{liveCount !== 1 ? 's' : ''}
          </span>
          {liveRejected > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
              <AlertTriangle size={12} /> {liveRejected} linha{liveRejected !== 1 ? 's' : ''} ignorada{liveRejected !== 1 ? 's' : ''}
            </span>
          )}
          {liveTruncated && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-red-50 text-red-700">
              <AlertTriangle size={12} /> Limite de 1000 contatos atingido
            </span>
          )}
        </div>
      )}

      {/* File upload */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="border-2 border-dashed border-gray-200 rounded-2xl p-4 text-center hover:border-gray-400 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.csv"
          className="hidden"
          onChange={onFileInputChange}
        />
        {fileName ? (
          <div className="flex items-center justify-center gap-2">
            <FileText size={16} className="text-emerald-600" />
            <span className="text-sm font-medium text-gray-700">{fileName}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClearFile();
              }}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload size={20} className="text-gray-400" />
            <p className="text-sm text-gray-500">
              Arraste um arquivo <span className="font-medium">.txt</span> ou <span className="font-medium">.csv</span> aqui, ou clique para selecionar
            </p>
          </div>
        )}
      </div>
      {fileError && (
        <p className="text-xs text-red-600 -mt-3">{fileError}</p>
      )}

      {/* Category selector */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1.5">
          Categoria para os novos leads
        </label>
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => {
            const Icon = resolveIcon(cat.icon);
            const isActive = selectedCategory === cat.key || (!selectedCategory && categories[0]?.key === cat.key);
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => onCategoryChange(cat.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-all ${
                  isActive
                    ? 'border-gray-900 bg-gray-900 text-white shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Icon size={12} /> {cat.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={onToggleNewCategory}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
            <Plus size={12} /> Nova categoria
          </button>
        </div>

        {showNewCategory && (
          <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
            <input
              value={newCatLabel}
              onChange={(e) => onNewCatLabelChange(e.target.value)}
              placeholder="Nome da categoria"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-gray-500 mr-1">Cor:</span>
              {COLOR_PRESETS.map((preset) => {
                const dotBg = preset.value.split(' ')[0] || 'bg-gray-100';
                const isSelected = newCatColor === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => onNewCatColorChange(preset.value)}
                    className={`w-6 h-6 rounded-full ${dotBg} transition-all ${
                      isSelected ? 'ring-2 ring-offset-1 ring-gray-900 scale-110' : 'hover:scale-110'
                    }`}
                    title={preset.label}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={onCreateCategory} disabled={!newCatLabel.trim()}>
                <Check size={12} /> Criar
              </Button>
              <Button size="sm" variant="ghost" onClick={onToggleNewCategory}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Action */}
      <div className="flex justify-end pt-2">
        <Button onClick={onNext} disabled={!canProceed}>
          Proximo <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 2 – Review & Conflict Resolution                              */
/* ------------------------------------------------------------------ */

interface StepReviewProps {
  newContacts: ParsedContact[];
  duplicates: (ParsedContact & { existing: ExistingLead })[];
  rejected: RejectedLine[];
  truncated: boolean;
  loading: boolean;
  duplicateMode: DuplicateMode;
  onDuplicateModeChange: (m: DuplicateMode) => void;
  pickedDuplicates: Set<string>;
  onTogglePicked: (phone: string) => void;
  categoryLabel: string;
  importing: boolean;
  progress: number;
  onBack: () => void;
  onImport: () => void;
}

function StepReview({
  newContacts,
  duplicates,
  rejected,
  truncated,
  loading,
  duplicateMode,
  onDuplicateModeChange,
  pickedDuplicates,
  onTogglePicked,
  categoryLabel,
  importing,
  progress,
  onBack,
  onImport,
}: StepReviewProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <RefreshCw size={24} className="text-gray-400 animate-spin" />
        <p className="text-sm text-gray-500">Verificando duplicados...</p>
      </div>
    );
  }

  const importCount =
    newContacts.length +
    (duplicateMode === 'update'
      ? duplicates.length
      : duplicateMode === 'pick'
      ? pickedDuplicates.size
      : 0);

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Novos contatos</p>
          <p className="text-2xl font-bold text-emerald-800 mt-0.5">{newContacts.length}</p>
          <p className="text-xs text-emerald-600 mt-0.5">Serao adicionados na categoria "{categoryLabel}"</p>
        </div>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">Duplicados encontrados</p>
          <p className="text-2xl font-bold text-amber-800 mt-0.5">{duplicates.length}</p>
          <p className="text-xs text-amber-600 mt-0.5">Ja existem na sua base</p>
        </div>
      </div>

      {rejected.length > 0 && (
        <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
          <p className="text-xs font-medium text-gray-600">
            {rejected.length} linha{rejected.length !== 1 ? 's' : ''} ignorada{rejected.length !== 1 ? 's' : ''} (formato invalido)
            {truncated && ' - limite de 1000 contatos atingido'}
          </p>
        </div>
      )}

      {/* Duplicate resolution */}
      {duplicates.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700">O que fazer com os duplicados?</p>
          <div className="flex flex-col gap-2">
            {([
              ['skip', 'Ignorar duplicados', 'Manter os contatos existentes como estao'],
              ['update', 'Atualizar todos', 'Sobrescrever nome e categoria dos duplicados'],
              ['pick', 'Escolher individualmente', 'Selecionar quais duplicados atualizar'],
            ] as [DuplicateMode, string, string][]).map(([mode, label, desc]) => (
              <label
                key={mode}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  duplicateMode === mode
                    ? 'border-gray-900 bg-gray-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="duplicateMode"
                  value={mode}
                  checked={duplicateMode === mode}
                  onChange={() => onDuplicateModeChange(mode)}
                  className="mt-0.5 accent-gray-900"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">{label}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Individual picker */}
      {duplicateMode === 'pick' && duplicates.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="w-8 px-3 py-2" />
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Telefone</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Nome (importado)</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Nome (existente)</th>
                <th className="text-left px-3 py-2 font-semibold text-gray-600">Cat. atual</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {duplicates.map((d) => (
                <tr
                  key={d.phone}
                  className={`transition-colors ${
                    pickedDuplicates.has(d.phone) ? 'bg-emerald-50/50' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={pickedDuplicates.has(d.phone)}
                      onChange={() => onTogglePicked(d.phone)}
                      className="accent-gray-900"
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-800 font-mono">{d.phone}</td>
                  <td className="px-3 py-2 text-gray-700">{d.name || '-'}</td>
                  <td className="px-3 py-2 text-gray-500">{d.existing.name || '-'}</td>
                  <td className="px-3 py-2 text-gray-500">{d.existing.category || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Progress bar during import */}
      {importing && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-600">
            <span>Importando...</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gray-900 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" onClick={onBack} disabled={importing}>
          <ChevronLeft size={14} /> Voltar
        </Button>
        <Button onClick={onImport} loading={importing} disabled={importing || importCount === 0}>
          Importar {importCount} lead{importCount !== 1 ? 's' : ''}
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Step 3 – Results                                                   */
/* ------------------------------------------------------------------ */

interface StepResultProps {
  resultNew: number;
  resultUpdated: number;
  resultSkipped: number;
  resultErrors: number;
  onClose: () => void;
}

function StepResult({ resultNew, resultUpdated, resultSkipped, resultErrors, onClose }: StepResultProps) {
  const total = resultNew + resultUpdated;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center py-6">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${
          resultErrors > 0 ? 'bg-amber-100' : 'bg-emerald-100'
        }`}>
          {resultErrors > 0 ? (
            <AlertTriangle size={24} className="text-amber-600" />
          ) : (
            <CheckCircle2 size={24} className="text-emerald-600" />
          )}
        </div>
        <h3 className="text-lg font-bold text-gray-900">
          {total > 0 ? 'Importacao concluida' : 'Nenhum lead importado'}
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {resultNew > 0 && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
            <p className="text-2xl font-bold text-emerald-800">{resultNew}</p>
            <p className="text-xs text-emerald-600">Novos leads adicionados</p>
          </div>
        )}
        {resultUpdated > 0 && (
          <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-center">
            <p className="text-2xl font-bold text-sky-800">{resultUpdated}</p>
            <p className="text-xs text-sky-600">Duplicados atualizados</p>
          </div>
        )}
        {resultSkipped > 0 && (
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-center">
            <p className="text-2xl font-bold text-gray-700">{resultSkipped}</p>
            <p className="text-xs text-gray-500">Duplicados ignorados</p>
          </div>
        )}
        {resultErrors > 0 && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-center">
            <p className="text-2xl font-bold text-red-700">{resultErrors}</p>
            <p className="text-xs text-red-600">Erros</p>
          </div>
        )}
      </div>

      <div className="flex justify-center pt-2">
        <Button onClick={onClose}>
          Fechar
        </Button>
      </div>
    </div>
  );
}
