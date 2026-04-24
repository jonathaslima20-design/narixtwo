import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Type,
  Image,
  Mic,
  FileText,
  Upload,
  X,
  Check,
  Users,
  Calendar,
  Clock,
  Send,
  Search,
  Megaphone,
  Smartphone,
  Trash2,
  Play,
  Square,
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useLeadCategories } from '../../lib/useLeadCategories';
import { resolveIcon } from '../../lib/iconMap';
import { supabase } from '../../lib/supabase';
import { Lead, CampaignMessageType } from '../../lib/types';
import { Button } from '../../components/ui/Button';
import { leadDisplayName } from '../../lib/leadDisplay';
import { useAudioRecorder, formatDuration } from '../../lib/useAudioRecorder';
import { AudioPlayer } from '../../components/chat/AudioPlayer';
import { useSubscriptionCtx } from '../../lib/SubscriptionContext';
import { PricingModal } from '../../components/ui/PricingModal';

const STEPS = ['Mensagem', 'Destinatários', 'Agendamento', 'Revisão'];

interface CampaignForm {
  name: string;
  message_type: CampaignMessageType;
  content: string;
  caption: string;
  mediaFile: File | null;
  mediaPreview: string;
  audioObjectUrl: string;
  audioDurationSeconds: number;
  filter_tags: string[];
  filter_category: string;
  exclude_recent_days: number;
  excludedLeadIds: Set<string>;
  schedule_mode: 'now' | 'later';
  scheduled_date: string;
  scheduled_time: string;
  send_window_start: string;
  send_window_end: string;
  delay_ms: number;
}

const INITIAL_FORM: CampaignForm = {
  name: '',
  message_type: 'text',
  content: '',
  caption: '',
  mediaFile: null,
  mediaPreview: '',
  audioObjectUrl: '',
  audioDurationSeconds: 0,
  filter_tags: [],
  filter_category: '',
  exclude_recent_days: 0,
  excludedLeadIds: new Set(),
  schedule_mode: 'now',
  scheduled_date: '',
  scheduled_time: '09:00',
  send_window_start: '',
  send_window_end: '',
  delay_ms: 3000,
};

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
      el.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(1);
      };
      el.src = url;
    } catch {
      resolve(1);
    }
  });
}

export function CampaignBuilder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { categories } = useLeadCategories();
  const { isBlocked } = useSubscriptionCtx();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CampaignForm>(INITIAL_FORM);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorder = useAudioRecorder();
  const isRecording = recorder.state === 'recording' || recorder.state === 'requesting';

  useEffect(() => {
    return () => {
      if (form.audioObjectUrl) URL.revokeObjectURL(form.audioObjectUrl);
    };
  }, []);

  // Fetch all leads for audience selector
  const fetchLeads = useCallback(async () => {
    if (!user) return;
    setLeadsLoading(true);
    const { data } = await supabase
      .from('leads')
      .select('id, name, phone, category, tags, is_blocked, is_archived')
      .eq('user_id', user.id)
      .eq('is_blocked', false)
      .eq('is_archived', false)
      .order('name', { ascending: true });
    if (data) {
      setLeads(data as Lead[]);
      const tags = new Set<string>();
      data.forEach((l: { tags?: string[] }) => l.tags?.forEach((t: string) => tags.add(t)));
      setAllTags(Array.from(tags).sort());
    }
    setLeadsLoading(false);
  }, [user]);

  useEffect(() => { fetchLeads(); }, [fetchLeads]);

  // Filter leads based on selected criteria
  const filteredLeads = leads.filter((l) => {
    if (form.filter_category && l.category !== form.filter_category) return false;
    if (form.filter_tags.length > 0 && !form.filter_tags.some((t) => l.tags?.includes(t))) return false;
    if (form.excludedLeadIds.has(l.id)) return false;
    return true;
  });

  const searchedLeads = filteredLeads.filter((l) => {
    if (!leadSearch) return true;
    const q = leadSearch.toLowerCase();
    return (
      (l.name || '').toLowerCase().includes(q) ||
      (l.phone || '').includes(q)
    );
  });

  function updateForm(patch: Partial<CampaignForm>) {
    setForm((f) => ({ ...f, ...patch }));
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (form.audioObjectUrl) URL.revokeObjectURL(form.audioObjectUrl);

    if (file.type.startsWith('image/')) {
      updateForm({ mediaFile: file, mediaPreview: URL.createObjectURL(file), audioObjectUrl: '', audioDurationSeconds: 0 });
    } else if (file.type.startsWith('audio/')) {
      const duration = await readAudioDuration(file);
      const objectUrl = URL.createObjectURL(file);
      updateForm({ mediaFile: file, mediaPreview: '', audioObjectUrl: objectUrl, audioDurationSeconds: duration });
    } else {
      updateForm({ mediaFile: file, mediaPreview: '', audioObjectUrl: '', audioDurationSeconds: 0 });
    }
  }

  function clearMedia() {
    if (form.audioObjectUrl) URL.revokeObjectURL(form.audioObjectUrl);
    if (form.mediaPreview) URL.revokeObjectURL(form.mediaPreview);
    updateForm({ mediaFile: null, mediaPreview: '', audioObjectUrl: '', audioDurationSeconds: 0 });
  }

  async function startCampaignRecording() {
    clearMedia();
    await recorder.start();
  }

  async function confirmCampaignRecording() {
    const result = await recorder.stop();
    if (!result || result.durationSeconds < 1) return;
    const ext = result.mimeType.includes('ogg') ? 'ogg' : result.mimeType.includes('mp4') ? 'm4a' : 'webm';
    const file = new File([result.blob], `voice-note.${ext}`, { type: result.mimeType });
    const objectUrl = URL.createObjectURL(result.blob);
    updateForm({ mediaFile: file, audioObjectUrl: objectUrl, audioDurationSeconds: result.durationSeconds, mediaPreview: '' });
  }

  function cancelCampaignRecording() {
    recorder.cancel();
  }

  function insertVariable(variable: string) {
    updateForm({ content: form.content + variable });
  }

  function toggleTag(tag: string) {
    const tags = form.filter_tags.includes(tag)
      ? form.filter_tags.filter((t) => t !== tag)
      : [...form.filter_tags, tag];
    updateForm({ filter_tags: tags });
  }

  function toggleExclude(leadId: string) {
    const next = new Set(form.excludedLeadIds);
    if (next.has(leadId)) next.delete(leadId);
    else next.add(leadId);
    updateForm({ excludedLeadIds: next });
  }

  function canProceed(): boolean {
    if (step === 0) {
      if (!form.name.trim()) return false;
      if (form.message_type === 'text' && !form.content.trim()) return false;
      if (form.message_type === 'audio' && !form.mediaFile) return false;
      if (form.message_type !== 'text' && form.message_type !== 'audio' && !form.mediaFile) return false;
      return true;
    }
    if (step === 1) return filteredLeads.length > 0;
    if (step === 2) {
      if (form.schedule_mode === 'later' && (!form.scheduled_date || !form.scheduled_time)) return false;
      return true;
    }
    return true;
  }

  async function handleSubmit() {
    if (isBlocked) { setShowPaywall(true); return; }
    if (!user || submitting) return;
    setSubmitting(true);

    try {
      // Upload media if needed
      let mediaUrl = '';
      let mediaType = '';
      let mediaFilename = '';

      if (form.mediaFile) {
        const ext = form.mediaFile.name.split('.').pop() || 'bin';
        const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('campaign-media')
          .upload(path, form.mediaFile);
        if (uploadErr) throw new Error('Falha ao fazer upload do arquivo');
        mediaUrl = path;
        mediaType = form.mediaFile.type;
        mediaFilename = form.mediaFile.name;
      }

      // Build scheduled_at
      let scheduledAt: string | null = null;
      if (form.schedule_mode === 'later' && form.scheduled_date && form.scheduled_time) {
        scheduledAt = new Date(`${form.scheduled_date}T${form.scheduled_time}:00`).toISOString();
      }

      const status = form.schedule_mode === 'later' ? 'scheduled' : 'draft';

      // Create campaign
      const { data: campaign, error: campErr } = await supabase
        .from('campaigns')
        .insert({
          user_id: user.id,
          name: form.name,
          status,
          message_type: form.message_type,
          content: form.content,
          media_url: mediaUrl,
          media_type: mediaType,
          media_filename: mediaFilename,
          caption: form.caption,
          scheduled_at: scheduledAt,
          total_recipients: filteredLeads.length,
          delay_ms: form.delay_ms,
          send_window_start: form.send_window_start,
          send_window_end: form.send_window_end,
          filter_tags: form.filter_tags,
          filter_category: form.filter_category,
          exclude_recent_days: form.exclude_recent_days,
        })
        .select()
        .maybeSingle();

      if (campErr || !campaign) throw new Error('Falha ao criar campanha');

      // Create recipients
      const recipientRows = filteredLeads.map((l) => ({
        campaign_id: campaign.id,
        lead_id: l.id,
        phone: l.phone,
        lead_name: leadDisplayName(l) || null,
        status: 'pending',
      }));

      // Insert in batches of 100
      for (let i = 0; i < recipientRows.length; i += 100) {
        const batch = recipientRows.slice(i, i + 100);
        await supabase.from('campaign_recipients').insert(batch);
      }

      navigate(`/dashboard/campaigns/${campaign.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  const estimatedSeconds = filteredLeads.length * (form.delay_ms / 1000);
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60);

  return (
    <div className="flex-1 overflow-auto bg-gray-50/50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <button
            onClick={() => navigate('/dashboard/campaigns')}
            className="p-2 rounded-xl hover:bg-white hover:shadow-sm transition-all text-gray-500"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-gray-900">Nova Campanha</h1>
            <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">Crie e envie mensagens em massa para seus leads</p>
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-1.5 sm:gap-2 mb-6 sm:mb-8 overflow-x-auto pb-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={`flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  i === step
                    ? 'bg-gray-900 text-white'
                    : i < step
                      ? 'bg-emerald-50 text-emerald-700 cursor-pointer hover:bg-emerald-100'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                }`}
              >
                {i < step ? <Check size={14} /> : <span className="w-5 h-5 rounded-full bg-current/10 flex items-center justify-center text-xs">{i + 1}</span>}
                <span className="hidden sm:inline">{s}</span>
              </button>
              {i < STEPS.length - 1 && <div className="w-4 sm:w-8 h-px bg-gray-200" />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 0: Message */}
          {step === 0 && (
            <motion.div key="step-0" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 space-y-5">
                  {/* Campaign name */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Nome da campanha</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => updateForm({ name: e.target.value })}
                      placeholder="Ex: Promoção de Natal 2026"
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                    />
                  </div>

                  {/* Message type */}
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <label className="block text-sm font-medium text-gray-700 mb-3">Tipo de mensagem</label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {([
                        { type: 'text' as const, icon: Type, label: 'Texto' },
                        { type: 'image' as const, icon: Image, label: 'Imagem' },
                        { type: 'audio' as const, icon: Mic, label: 'Áudio' },
                        { type: 'document' as const, icon: FileText, label: 'Documento' },
                      ]).map(({ type, icon: Icon, label }) => (
                        <button
                          key={type}
                          onClick={() => {
                            if (form.audioObjectUrl) URL.revokeObjectURL(form.audioObjectUrl);
                            if (form.mediaPreview) URL.revokeObjectURL(form.mediaPreview);
                            if (isRecording) recorder.cancel();
                            updateForm({ message_type: type, mediaFile: null, mediaPreview: '', audioObjectUrl: '', audioDurationSeconds: 0 });
                          }}
                          className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                            form.message_type === type
                              ? 'border-gray-900 bg-gray-900/5'
                              : 'border-gray-100 hover:border-gray-300'
                          }`}
                        >
                          <Icon size={20} className={form.message_type === type ? 'text-gray-900' : 'text-gray-400'} />
                          <span className={`text-xs font-medium ${form.message_type === type ? 'text-gray-900' : 'text-gray-500'}`}>{label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Content -- hidden for audio since voice notes have no caption */}
                  {form.message_type !== 'audio' && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {form.message_type === 'text' ? 'Mensagem' : form.message_type === 'image' ? 'Legenda (opcional)' : 'Texto da mensagem'}
                    </label>
                    <textarea
                      value={form.message_type === 'image' || form.message_type === 'document' ? form.caption : form.content}
                      onChange={(e) =>
                        form.message_type === 'image' || form.message_type === 'document'
                          ? updateForm({ caption: e.target.value })
                          : updateForm({ content: e.target.value })
                      }
                      placeholder={form.message_type === 'text' ? 'Olá {nome}, temos uma oferta especial para você!' : 'Legenda para a mídia...'}
                      rows={5}
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs text-gray-400">Variáveis:</span>
                      {['{nome}', '{telefone}'].map((v) => (
                        <button
                          key={v}
                          onClick={() => insertVariable(v)}
                          className="px-2 py-0.5 rounded-md bg-gray-100 text-xs text-gray-600 hover:bg-gray-200 transition-colors font-mono"
                        >
                          {v}
                        </button>
                      ))}
                      <span className="ml-auto text-xs text-gray-400">
                        {(form.message_type === 'image' || form.message_type === 'document' ? form.caption : form.content).length} caracteres
                      </span>
                    </div>
                  </div>
                  )}

                  {/* Media upload */}
                  {form.message_type !== 'text' && (
                    <div className="bg-white rounded-2xl border border-gray-100 p-5">
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        {form.message_type === 'image' ? 'Imagem' : form.message_type === 'audio' ? 'Nota de Voz' : 'Documento'}
                      </label>

                      {/* Audio: recording state */}
                      {form.message_type === 'audio' && isRecording && (
                        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                          <button
                            onClick={cancelCampaignRecording}
                            className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors shrink-0"
                            title="Cancelar"
                            type="button"
                          >
                            <Trash2 size={18} />
                          </button>
                          <span className="relative flex h-2.5 w-2.5 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                          </span>
                          <span className="text-sm font-semibold text-red-700 tabular-nums">
                            {formatDuration(recorder.elapsed)}
                          </span>
                          <div className="flex-1 flex items-center gap-0.5 overflow-hidden">
                            {Array.from({ length: 28 }).map((_, i) => (
                              <span
                                key={i}
                                className="inline-block w-0.5 bg-red-400/70 rounded-full animate-pulse"
                                style={{
                                  height: `${6 + ((i * 7 + recorder.elapsed * 3) % 14)}px`,
                                  animationDelay: `${i * 40}ms`,
                                }}
                              />
                            ))}
                          </div>
                          <button
                            onClick={confirmCampaignRecording}
                            disabled={recorder.state !== 'recording'}
                            className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors shrink-0"
                            type="button"
                            title="Finalizar gravacao"
                          >
                            <Square size={14} />
                          </button>
                        </div>
                      )}

                      {/* Audio: has file with AudioPlayer preview */}
                      {form.message_type === 'audio' && form.mediaFile && !isRecording && (
                        <div className="space-y-3">
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                            <div className="flex items-center gap-1.5 mb-3">
                              <Mic size={13} className="text-emerald-600" />
                              <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                                Nota de voz
                              </span>
                              <span className="text-[11px] text-emerald-600 ml-auto">
                                {formatDuration(form.audioDurationSeconds)}
                              </span>
                            </div>
                            <AudioPlayer
                              src={form.audioObjectUrl}
                              durationSeconds={form.audioDurationSeconds}
                              variant="in"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-gray-600 truncate">{form.mediaFile.name}</p>
                              <p className="text-[11px] text-gray-400">{(form.mediaFile.size / 1024 / 1024).toFixed(2)} MB</p>
                            </div>
                            <button
                              onClick={clearMedia}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                              title="Remover audio"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Audio: empty state with record + upload options */}
                      {form.message_type === 'audio' && !form.mediaFile && !isRecording && (
                        <div className="space-y-3">
                          <button
                            onClick={startCampaignRecording}
                            className="w-full flex items-center justify-center gap-3 border-2 border-dashed border-emerald-300 rounded-xl p-6 text-center hover:border-emerald-500 hover:bg-emerald-50/50 transition-all group"
                          >
                            <div className="w-12 h-12 rounded-full bg-emerald-100 group-hover:bg-emerald-200 flex items-center justify-center transition-colors">
                              <Mic size={22} className="text-emerald-600" />
                            </div>
                            <div className="text-left">
                              <p className="text-sm font-semibold text-gray-900">Gravar nota de voz</p>
                              <p className="text-xs text-gray-500">Clique para iniciar a gravacao</p>
                            </div>
                          </button>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-gray-200" />
                            <span className="text-[11px] font-medium text-gray-400 uppercase">ou</span>
                            <div className="flex-1 h-px bg-gray-200" />
                          </div>
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full flex items-center justify-center gap-3 border-2 border-dashed border-gray-200 rounded-xl p-4 text-center hover:border-gray-400 hover:bg-gray-50 transition-all"
                          >
                            <Upload size={18} className="text-gray-400" />
                            <div className="text-left">
                              <p className="text-sm font-medium text-gray-600">Fazer upload de arquivo</p>
                              <p className="text-xs text-gray-400">OGG, MP3, WAV, M4A (max 16 MB)</p>
                            </div>
                          </button>
                          {recorder.error && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                              {recorder.error}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Image/Document: existing file preview */}
                      {form.message_type !== 'audio' && form.mediaFile && (
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                          {form.mediaPreview && (
                            <img src={form.mediaPreview} alt="" className="w-16 h-16 rounded-lg object-cover" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{form.mediaFile.name}</p>
                            <p className="text-xs text-gray-500">{(form.mediaFile.size / 1024 / 1024).toFixed(2)} MB</p>
                          </div>
                          <button
                            onClick={clearMedia}
                            className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}

                      {/* Image/Document: upload button */}
                      {form.message_type !== 'audio' && !form.mediaFile && (
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="w-full border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-gray-400 hover:bg-gray-50 transition-all"
                        >
                          <Upload size={24} className="mx-auto mb-2 text-gray-400" />
                          <p className="text-sm text-gray-600 font-medium">Clique para fazer upload</p>
                          <p className="text-xs text-gray-400 mt-1">
                            {form.message_type === 'image' ? 'PNG, JPG, WEBP (max 16 MB)' : 'PDF, DOCX, XLSX (max 16 MB)'}
                          </p>
                        </button>
                      )}

                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept={
                          form.message_type === 'image' ? 'image/*' : form.message_type === 'audio' ? 'audio/*' : '.pdf,.docx,.xlsx,.doc,.xls,.csv,.txt'
                        }
                        onChange={handleFileSelect}
                      />
                    </div>
                  )}
                </div>

                {/* Phone preview */}
                <div className="hidden lg:block lg:col-span-2">
                  <div className="sticky top-8">
                    <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Pré-visualização</p>
                    <div className="bg-gray-900 rounded-[2rem] p-3 shadow-2xl">
                      <div className="bg-[#e5ddd5] rounded-[1.5rem] overflow-hidden">
                        {/* WhatsApp header */}
                        <div className="bg-[#075e54] px-4 py-3 flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                            <Smartphone size={14} className="text-white/70" />
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">Destinatário</p>
                            <p className="text-white/60 text-[10px]">online</p>
                          </div>
                        </div>
                        {/* Message area */}
                        <div className="p-4 min-h-[300px] flex flex-col justify-end">
                          <div className="max-w-[85%] ml-auto">
                            {form.mediaPreview && form.message_type === 'image' && (
                              <img src={form.mediaPreview} alt="" className="w-full rounded-lg mb-1" />
                            )}
                            {form.message_type === 'audio' && form.mediaFile && (
                              <div className="bg-[#dcf8c6] rounded-lg p-2.5 mb-1">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-[#075e54] flex items-center justify-center shrink-0">
                                    <Play size={12} className="text-white ml-0.5" />
                                  </div>
                                  <div className="flex-1 flex items-center gap-0.5">
                                    {Array.from({ length: 20 }).map((_, i) => {
                                      const heights = [5, 8, 11, 7, 13, 9, 6, 12, 10, 8, 14, 7, 9, 12, 6, 11, 8, 13, 9, 7];
                                      return (
                                        <span
                                          key={i}
                                          className="inline-block w-[3px] rounded-full bg-[#075e54]/40"
                                          style={{ height: `${heights[i]}px` }}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                                <div className="flex items-center justify-between mt-1 pl-10">
                                  <span className="text-[10px] text-gray-500 tabular-nums">
                                    {formatDuration(form.audioDurationSeconds)}
                                  </span>
                                  <Mic size={10} className="text-[#075e54]/60" />
                                </div>
                              </div>
                            )}
                            {form.message_type === 'document' && form.mediaFile && (
                              <div className="bg-[#dcf8c6] rounded-lg p-3 mb-1 flex items-center gap-2">
                                <FileText size={18} className="text-[#075e54]" />
                                <span className="text-xs text-gray-700 truncate">{form.mediaFile.name}</span>
                              </div>
                            )}
                            {(form.content || form.caption) && (
                              <div className="bg-[#dcf8c6] rounded-lg px-3 py-2">
                                <p className="text-[13px] text-gray-800 whitespace-pre-wrap break-words">
                                  {(form.message_type === 'image' || form.message_type === 'document' ? form.caption : form.content)
                                    .replace(/\{nome\}/gi, 'João')
                                    .replace(/\{telefone\}/gi, '(11) 99999-0000') || (
                                    <span className="text-gray-400 italic">Sua mensagem aqui...</span>
                                  )}
                                </p>
                                <p className="text-[10px] text-gray-500 text-right mt-0.5">12:00</p>
                              </div>
                            )}
                            {!form.content && !form.caption && form.message_type === 'text' && (
                              <div className="bg-[#dcf8c6] rounded-lg px-3 py-2">
                                <p className="text-[13px] text-gray-400 italic">Sua mensagem aqui...</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 1: Recipients */}
          {step === 1 && (
            <motion.div key="step-1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <div className="space-y-5">
                {/* Filters */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Users size={16} className="text-gray-500" />
                    Filtrar destinatários
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    {/* Category */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">Categoria</label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => updateForm({ filter_category: '' })}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            !form.filter_category
                              ? 'bg-gray-900 text-white'
                              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          <Users size={12} />
                          Todos
                        </button>
                        {categories.map((cat) => {
                          const Icon = resolveIcon(cat.icon);
                          return (
                            <button
                              key={cat.key}
                              onClick={() => updateForm({ filter_category: cat.key })}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                form.filter_category === cat.key
                                  ? 'bg-gray-900 text-white'
                                  : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              <Icon size={12} />
                              {cat.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Exclude recent */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-2">Excluir recentes</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={90}
                          value={form.exclude_recent_days || ''}
                          onChange={(e) => updateForm({ exclude_recent_days: Number(e.target.value) || 0 })}
                          placeholder="0"
                          className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                        />
                        <span className="text-xs text-gray-500">dias desde última campanha</span>
                      </div>
                    </div>
                  </div>

                  {/* Tags */}
                  {allTags.length > 0 && (
                    <div className="mt-4">
                      <label className="block text-xs font-medium text-gray-500 mb-2">Tags</label>
                      <div className="flex flex-wrap gap-2">
                        {allTags.map((tag) => (
                          <button
                            key={tag}
                            onClick={() => toggleTag(tag)}
                            className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                              form.filter_tags.includes(tag)
                                ? 'bg-gray-900 text-white'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {tag}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Recipient count badge */}
                <div className="bg-gray-900 rounded-2xl px-5 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                      <Users size={18} className="text-white" />
                    </div>
                    <div>
                      <p className="text-white font-semibold">{filteredLeads.length} leads selecionados</p>
                      <p className="text-gray-400 text-xs">
                        {form.excludedLeadIds.size > 0 && `${form.excludedLeadIds.size} excluídos manualmente`}
                        {form.excludedLeadIds.size === 0 && `de ${leads.length} leads no total`}
                      </p>
                    </div>
                  </div>
                  {filteredLeads.length > 0 && (
                    <p className="text-emerald-400 text-sm font-medium flex items-center gap-1">
                      <Check size={14} />
                      Pronto para envio
                    </p>
                  )}
                </div>

                {/* Recipient list */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <h3 className="text-sm font-semibold text-gray-900">Lista de destinatários</h3>
                    <div className="relative w-full sm:w-60">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Buscar lead..."
                        value={leadSearch}
                        onChange={(e) => setLeadSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                      />
                    </div>
                  </div>
                  {leadsLoading ? (
                    <div className="flex justify-center py-8">
                      <div className="w-5 h-5 border-2 border-gray-200 border-t-gray-600 rounded-full animate-spin" />
                    </div>
                  ) : (
                    <div className="max-h-72 overflow-auto rounded-xl border border-gray-100">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0 bg-gray-50">
                          <tr className="text-left text-xs text-gray-500 font-medium">
                            <th className="px-3 py-2 w-8" />
                            <th className="px-3 py-2">Nome</th>
                            <th className="px-3 py-2">Telefone</th>
                            <th className="px-3 py-2">Categoria</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {searchedLeads.slice(0, 100).map((l) => {
                            const excluded = form.excludedLeadIds.has(l.id);
                            return (
                              <tr key={l.id} className={`${excluded ? 'opacity-40' : ''} hover:bg-gray-50 transition-colors`}>
                                <td className="px-3 py-2">
                                  <input
                                    type="checkbox"
                                    checked={!excluded}
                                    onChange={() => toggleExclude(l.id)}
                                    className="rounded border-gray-300"
                                  />
                                </td>
                                <td className="px-3 py-2 font-medium text-gray-900">{leadDisplayName(l) || '-'}</td>
                                <td className="px-3 py-2 text-gray-500">{l.phone}</td>
                                <td className="px-3 py-2">
                                  {(() => {
                                    const cat = categories.find((c) => c.key === l.category);
                                    if (!cat) return <span className="text-xs text-gray-400">-</span>;
                                    const CatIcon = resolveIcon(cat.icon);
                                    return (
                                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cat.color}`}>
                                        <CatIcon size={11} />
                                        {cat.label}
                                      </span>
                                    );
                                  })()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {searchedLeads.length > 100 && (
                        <p className="text-center text-xs text-gray-400 py-2">
                          Exibindo 100 de {searchedLeads.length} leads
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 2: Scheduling */}
          {step === 2 && (
            <motion.div key="step-2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <div className="max-w-2xl space-y-5">
                {/* Schedule mode */}
                <div className="grid grid-cols-2 gap-4">
                  {([
                    { mode: 'now' as const, icon: Send, title: 'Enviar agora', desc: 'A campanha será iniciada imediatamente após a criação' },
                    { mode: 'later' as const, icon: Calendar, title: 'Agendar para depois', desc: 'Defina uma data e horário específicos para o envio' },
                  ]).map(({ mode, icon: Icon, title, desc }) => (
                    <button
                      key={mode}
                      onClick={() => updateForm({ schedule_mode: mode })}
                      className={`p-5 rounded-2xl border-2 text-left transition-all ${
                        form.schedule_mode === mode
                          ? 'border-gray-900 bg-gray-900/5'
                          : 'border-gray-100 bg-white hover:border-gray-300'
                      }`}
                    >
                      <Icon size={22} className={form.schedule_mode === mode ? 'text-gray-900 mb-3' : 'text-gray-400 mb-3'} />
                      <p className={`font-semibold text-sm ${form.schedule_mode === mode ? 'text-gray-900' : 'text-gray-600'}`}>{title}</p>
                      <p className="text-xs text-gray-500 mt-1">{desc}</p>
                    </button>
                  ))}
                </div>

                {/* Date/time picker */}
                {form.schedule_mode === 'later' && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-5">
                    <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Calendar size={16} className="text-gray-500" />
                      Data e horário
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Data</label>
                        <input
                          type="date"
                          value={form.scheduled_date}
                          onChange={(e) => updateForm({ scheduled_date: e.target.value })}
                          min={new Date().toISOString().split('T')[0]}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1.5">Horário</label>
                        <input
                          type="time"
                          value={form.scheduled_time}
                          onChange={(e) => updateForm({ scheduled_time: e.target.value })}
                          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Send window */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    <Clock size={16} className="text-gray-500" />
                    Janela de envio (opcional)
                  </h3>
                  <p className="text-xs text-gray-500 mb-4">Enviar apenas dentro de um horário comercial específico</p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Início</label>
                      <input
                        type="time"
                        value={form.send_window_start}
                        onChange={(e) => updateForm({ send_window_start: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1.5">Fim</label>
                      <input
                        type="time"
                        value={form.send_window_end}
                        onChange={(e) => updateForm({ send_window_end: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                      />
                    </div>
                  </div>
                </div>

                {/* Delay */}
                <div className="bg-white rounded-2xl border border-gray-100 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">Intervalo entre mensagens</h3>
                  <p className="text-xs text-gray-500 mb-4">
                    Intervalos maiores ajudam a evitar bloqueios pelo WhatsApp. Recomendamos pelo menos 3 segundos.
                  </p>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={1000}
                      max={15000}
                      step={500}
                      value={form.delay_ms}
                      onChange={(e) => updateForm({ delay_ms: Number(e.target.value) })}
                      className="flex-1 accent-gray-900"
                    />
                    <span className="text-sm font-semibold text-gray-900 w-16 text-right">
                      {(form.delay_ms / 1000).toFixed(1)}s
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-0.5">
                    <span>1s (rápido)</span>
                    <span>15s (seguro)</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <motion.div key="step-3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <div className="max-w-2xl space-y-5">
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-5 flex items-center gap-2">
                    <Megaphone size={20} className="text-gray-500" />
                    Resumo da campanha
                  </h3>

                  <div className="space-y-4">
                    <div className="flex justify-between py-3 border-b border-gray-50">
                      <span className="text-sm text-gray-500">Nome</span>
                      <span className="text-sm font-medium text-gray-900">{form.name}</span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-gray-50">
                      <span className="text-sm text-gray-500">Tipo de mensagem</span>
                      <span className="text-sm font-medium text-gray-900 capitalize">{form.message_type === 'text' ? 'Texto' : form.message_type === 'image' ? 'Imagem' : form.message_type === 'audio' ? 'Áudio' : 'Documento'}</span>
                    </div>
                    {form.mediaFile && form.message_type === 'audio' && (
                      <div className="py-3 border-b border-gray-50">
                        <div className="flex justify-between mb-3">
                          <span className="text-sm text-gray-500">Nota de voz</span>
                          <span className="text-sm font-medium text-gray-900">{formatDuration(form.audioDurationSeconds)}</span>
                        </div>
                        {form.audioObjectUrl && (
                          <div className="bg-emerald-50 rounded-xl p-3">
                            <AudioPlayer
                              src={form.audioObjectUrl}
                              durationSeconds={form.audioDurationSeconds}
                              variant="in"
                            />
                          </div>
                        )}
                      </div>
                    )}
                    {form.mediaFile && form.message_type !== 'audio' && (
                      <div className="flex justify-between py-3 border-b border-gray-50">
                        <span className="text-sm text-gray-500">Arquivo</span>
                        <span className="text-sm font-medium text-gray-900">{form.mediaFile.name}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-3 border-b border-gray-50">
                      <span className="text-sm text-gray-500">Destinatários</span>
                      <span className="text-sm font-semibold text-gray-900">{filteredLeads.length} leads</span>
                    </div>
                    <div className="flex justify-between py-3 border-b border-gray-50">
                      <span className="text-sm text-gray-500">Agendamento</span>
                      <span className="text-sm font-medium text-gray-900">
                        {form.schedule_mode === 'now' ? 'Envio imediato' : `${form.scheduled_date} às ${form.scheduled_time}`}
                      </span>
                    </div>
                    {form.send_window_start && form.send_window_end && (
                      <div className="flex justify-between py-3 border-b border-gray-50">
                        <span className="text-sm text-gray-500">Janela de envio</span>
                        <span className="text-sm font-medium text-gray-900">{form.send_window_start} - {form.send_window_end}</span>
                      </div>
                    )}
                    <div className="flex justify-between py-3 border-b border-gray-50">
                      <span className="text-sm text-gray-500">Intervalo</span>
                      <span className="text-sm font-medium text-gray-900">{(form.delay_ms / 1000).toFixed(1)}s entre msgs</span>
                    </div>
                    <div className="flex justify-between py-3">
                      <span className="text-sm text-gray-500">Tempo estimado</span>
                      <span className="text-sm font-semibold text-gray-900">~{estimatedMinutes} min</span>
                    </div>
                  </div>
                </div>

                {/* Message preview */}
                <div className="bg-white rounded-2xl border border-gray-100 p-6">
                  <h4 className="text-sm font-semibold text-gray-900 mb-3">Prévia da mensagem</h4>
                  <div className="bg-[#e5ddd5] rounded-xl p-4">
                    <div className="max-w-[80%] ml-auto">
                      {form.mediaPreview && (
                        <img src={form.mediaPreview} alt="" className="w-full rounded-lg mb-1" />
                      )}
                      {form.message_type === 'audio' && form.audioObjectUrl ? (
                        <div className="bg-[#dcf8c6] rounded-lg p-2.5">
                          <div className="flex items-center gap-2">
                            <div className="w-9 h-9 rounded-full bg-[#075e54] flex items-center justify-center shrink-0">
                              <Play size={14} className="text-white ml-0.5" />
                            </div>
                            <div className="flex-1 flex items-center gap-0.5">
                              {Array.from({ length: 22 }).map((_, i) => {
                                const heights = [5, 8, 11, 7, 13, 9, 6, 12, 10, 8, 14, 7, 9, 12, 6, 11, 8, 13, 9, 7, 10, 6];
                                return (
                                  <span
                                    key={i}
                                    className="inline-block w-[3px] rounded-full bg-[#075e54]/40"
                                    style={{ height: `${heights[i]}px` }}
                                  />
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex items-center justify-between mt-1 pl-11">
                            <span className="text-[10px] text-gray-500 tabular-nums">
                              {formatDuration(form.audioDurationSeconds)}
                            </span>
                            <span className="text-[10px] text-gray-500">12:00</span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-[#dcf8c6] rounded-lg px-3 py-2">
                          <p className="text-sm text-gray-800 whitespace-pre-wrap">
                            {(form.message_type === 'image' || form.message_type === 'document' ? form.caption : form.content)
                              .replace(/\{nome\}/gi, 'João Silva')
                              .replace(/\{telefone\}/gi, '(11) 99999-0000')}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Warning */}
                {filteredLeads.length > 100 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3">
                    <Clock size={18} className="text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Envio para muitos destinatários</p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Campanhas com mais de 100 destinatários levam mais tempo e podem ser pausadas automaticamente pelo WhatsApp. Recomendamos enviar em lotes menores.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-6 sm:mt-8 pt-4 sm:pt-6 border-t border-gray-100">
          <Button
            variant="ghost"
            onClick={() => (step === 0 ? navigate('/dashboard/campaigns') : setStep(step - 1))}
          >
            <ArrowLeft size={16} />
            {step === 0 ? 'Cancelar' : 'Voltar'}
          </Button>
          <div className="flex gap-3">
            {step === 3 && (
              <Button variant="secondary" onClick={handleSubmit} loading={submitting}>
                <FileText size={16} />
                <span className="hidden sm:inline">Salvar rascunho</span>
                <span className="sm:hidden">Rascunho</span>
              </Button>
            )}
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} disabled={!canProceed()} fullWidth>
                Próximo
                <ArrowRight size={16} />
              </Button>
            ) : (
              <Button onClick={handleSubmit} loading={submitting} fullWidth>
                {form.schedule_mode === 'now' ? (
                  <>
                    <Send size={16} />
                    <span className="hidden sm:inline">Criar e enviar campanha</span>
                    <span className="sm:hidden">Enviar</span>
                  </>
                ) : (
                  <>
                    <Calendar size={16} />
                    <span className="hidden sm:inline">Agendar campanha</span>
                    <span className="sm:hidden">Agendar</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
      <PricingModal open={showPaywall} onClose={() => setShowPaywall(false)} />
    </div>
  );
}
