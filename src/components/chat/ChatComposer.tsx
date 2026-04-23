import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { Send, Sparkles, Smile, Paperclip, Check, X, CreditCard as Edit3, Mic, Trash2, FileAudio, Zap, Image as ImageIcon } from 'lucide-react';
import { AISuggestion, SendMode } from '../../lib/types';
import { useAudioRecorder, formatDuration, RecordingResult } from '../../lib/useAudioRecorder';
import { AudioPlayer } from './AudioPlayer';
import { QuickRepliesPopover } from './QuickRepliesPopover';

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;

interface PendingAudioFile {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
  objectUrl: string;
  fileName: string;
}

interface PendingImageFile {
  blob: Blob;
  objectUrl: string;
  caption: string;
}

async function readAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const el = document.createElement('audio');
      el.preload = 'metadata';
      const cleanup = () => {
        URL.revokeObjectURL(url);
      };
      el.onloadedmetadata = () => {
        const d = Number.isFinite(el.duration) ? Math.max(1, Math.round(el.duration)) : 1;
        cleanup();
        resolve(d);
      };
      el.onerror = () => {
        cleanup();
        resolve(1);
      };
      el.src = url;
    } catch {
      resolve(1);
    }
  });
}

interface Props {
  sendMode: SendMode;
  pendingSuggestion: AISuggestion | null;
  onSend: (text: string, aiGenerated?: boolean) => Promise<void>;
  onSendAudio: (result: RecordingResult) => Promise<void>;
  onSendImage: (blob: Blob, caption: string) => Promise<void>;
  onRequestSuggestion: () => Promise<void>;
  onApproveSuggestion: (suggestion: AISuggestion, editedText?: string) => Promise<void>;
  onRejectSuggestion: (suggestion: AISuggestion) => Promise<void>;
  disabled?: boolean;
}

export function ChatComposer({
  sendMode,
  pendingSuggestion,
  onSend,
  onSendAudio,
  onSendImage,
  onRequestSuggestion,
  onApproveSuggestion,
  onRejectSuggestion,
  disabled,
}: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [editingSuggestion, setEditingSuggestion] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');
  const [dispatchingAudio, setDispatchingAudio] = useState(false);
  const [dispatchingImage, setDispatchingImage] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [pendingAudio, setPendingAudio] = useState<PendingAudioFile | null>(null);
  const [pendingImage, setPendingImage] = useState<PendingImageFile | null>(null);
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (pendingAudio) URL.revokeObjectURL(pendingAudio.objectUrl);
    };
  }, [pendingAudio]);

  useEffect(() => {
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.objectUrl);
    };
  }, [pendingImage]);

  const recorder = useAudioRecorder();
  const isRecording = recorder.state === 'recording' || recorder.state === 'requesting';
  const isBusy = dispatchingAudio || dispatchingImage;

  async function handleSend() {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onSend(text.trim(), false);
      setText('');
    } finally {
      setSending(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function approve() {
    if (!pendingSuggestion) return;
    await onApproveSuggestion(pendingSuggestion, editingSuggestion ? suggestionText : undefined);
    setEditingSuggestion(false);
    setSuggestionText('');
  }

  async function startRecording() {
    dismissPendingAudio();
    await recorder.start();
  }

  async function confirmRecording() {
    const result = await recorder.stop();
    if (!result) return;
    if (result.durationSeconds < 1) return;
    setDispatchingAudio(true);
    try {
      await onSendAudio(result);
    } finally {
      setDispatchingAudio(false);
    }
  }

  function cancelRecording() {
    recorder.cancel();
  }

  function triggerAudioPicker() {
    setAttachError(null);
    audioInputRef.current?.click();
  }

  async function handleAudioFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      setAttachError('Selecione um arquivo de audio valido.');
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setAttachError('Arquivo de audio excede o limite de 16 MB.');
      return;
    }
    setAttachError(null);
    const durationSeconds = await readAudioDuration(file);
    const mimeType = file.type || 'audio/mpeg';
    const blob = file.slice(0, file.size, mimeType);
    const objectUrl = URL.createObjectURL(blob);
    setPendingAudio({ blob, mimeType, durationSeconds, objectUrl, fileName: file.name });
  }

  function dismissPendingAudio() {
    if (pendingAudio) URL.revokeObjectURL(pendingAudio.objectUrl);
    setPendingAudio(null);
  }

  async function confirmPendingAudio() {
    if (!pendingAudio) return;
    const { blob, mimeType, durationSeconds, objectUrl } = pendingAudio;
    setPendingAudio(null);
    setDispatchingAudio(true);
    try {
      await onSendAudio({ blob, mimeType, durationSeconds });
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Falha ao enviar audio');
    } finally {
      URL.revokeObjectURL(objectUrl);
      setDispatchingAudio(false);
    }
  }

  function dismissPendingImage() {
    if (pendingImage) URL.revokeObjectURL(pendingImage.objectUrl);
    setPendingImage(null);
  }

  async function confirmPendingImage() {
    if (!pendingImage) return;
    const { blob, caption, objectUrl } = pendingImage;
    setPendingImage(null);
    setDispatchingImage(true);
    try {
      await onSendImage(blob, caption);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : 'Falha ao enviar imagem');
    } finally {
      URL.revokeObjectURL(objectUrl);
      setDispatchingImage(false);
    }
  }

  function handleQuickReplyText(body: string) {
    setText((prev) => (prev ? prev + '\n' + body : body));
  }

  function handleQuickReplyImage(blob: Blob, caption: string) {
    const objectUrl = URL.createObjectURL(blob);
    setPendingImage({ blob, objectUrl, caption });
  }

  async function handleQuickReplyAudio(blob: Blob, mimeType: string, duration: number) {
    setDispatchingAudio(true);
    try {
      await onSendAudio({ blob, mimeType, durationSeconds: duration });
    } finally {
      setDispatchingAudio(false);
    }
  }

  return (
    <div className="border-t border-gray-100 bg-white relative">
      {pendingSuggestion && sendMode === 'approval' && (
        <div className="mx-4 mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={12} className="text-emerald-600" />
            <span className="text-xs font-semibold text-emerald-700">Sugestao da IA (aguardando aprovacao)</span>
          </div>
          {editingSuggestion ? (
            <textarea
              value={suggestionText}
              onChange={(e) => setSuggestionText(e.target.value)}
              className="w-full text-sm text-gray-800 bg-white border border-emerald-200 rounded-xl p-2 resize-none focus:outline-none focus:ring-2 focus:ring-emerald-400"
              rows={3}
            />
          ) : (
            <p className="text-sm text-gray-800 whitespace-pre-wrap">{pendingSuggestion.content}</p>
          )}
          <div className="flex items-center gap-2 mt-2.5">
            <button
              onClick={approve}
              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <Check size={12} /> Aprovar e enviar
            </button>
            <button
              onClick={() => {
                setEditingSuggestion(!editingSuggestion);
                setSuggestionText(pendingSuggestion.content);
              }}
              className="flex items-center gap-1 px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Edit3 size={12} /> {editingSuggestion ? 'Cancelar edicao' : 'Editar'}
            </button>
            <button
              onClick={() => onRejectSuggestion(pendingSuggestion)}
              className="flex items-center gap-1 px-3 py-1.5 text-gray-500 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X size={12} /> Descartar
            </button>
          </div>
        </div>
      )}

      {recorder.error && !isRecording && (
        <div className="mx-4 mt-2 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl">
          {recorder.error}
        </div>
      )}

      {attachError && (
        <div className="mx-4 mt-2 px-3 py-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl">
          {attachError}
        </div>
      )}

      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleAudioFileSelected}
      />

      {pendingAudio && (
        <div className="mx-3 mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 p-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-1 truncate">
                {pendingAudio.fileName}
              </p>
              <AudioPlayer
                src={pendingAudio.objectUrl}
                durationSeconds={pendingAudio.durationSeconds}
                variant="in"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={dismissPendingAudio}
                type="button"
                title="Descartar audio"
                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={confirmPendingAudio}
                disabled={isBusy}
                type="button"
                title="Enviar audio"
                className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingImage && (
        <div className="mx-3 mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 shadow-sm overflow-hidden">
          <div className="flex items-start gap-3 p-3">
            <div className="w-20 h-20 rounded-xl overflow-hidden bg-gray-100 shrink-0">
              <img src={pendingImage.objectUrl} alt="" className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <ImageIcon size={11} /> Imagem
              </p>
              <input
                type="text"
                value={pendingImage.caption}
                onChange={(e) => setPendingImage((prev) => prev ? { ...prev, caption: e.target.value } : null)}
                placeholder="Legenda (opcional)..."
                className="w-full px-2.5 py-1.5 text-xs bg-white border border-emerald-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={dismissPendingImage}
                type="button"
                title="Descartar imagem"
                className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-colors"
              >
                <Trash2 size={16} />
              </button>
              <button
                onClick={confirmPendingImage}
                disabled={isBusy}
                type="button"
                title="Enviar imagem"
                className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      <QuickRepliesPopover
        open={quickRepliesOpen}
        onClose={() => setQuickRepliesOpen(false)}
        onSelectText={handleQuickReplyText}
        onSelectImage={handleQuickReplyImage}
        onSelectAudio={handleQuickReplyAudio}
      />

      <div className="p-3 flex items-end gap-2">
        {isRecording ? (
          <div className="flex-1 flex items-center gap-2 bg-red-50 border border-red-200 rounded-2xl px-3 py-2">
            <button
              onClick={cancelRecording}
              className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
              title="Cancelar"
              type="button"
            >
              <Trash2 size={16} />
            </button>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-sm font-medium text-red-700 tabular-nums">
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
              onClick={confirmRecording}
              disabled={isBusy || recorder.state !== 'recording'}
              className="p-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              type="button"
              title="Enviar gravacao"
            >
              <Send size={14} />
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => setQuickRepliesOpen((v) => !v)}
              disabled={disabled || isBusy}
              className={`p-2 rounded-xl transition-colors ${
                quickRepliesOpen
                  ? 'text-emerald-600 bg-emerald-50'
                  : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
              } disabled:opacity-40`}
              title="Respostas rapidas"
              type="button"
            >
              <Zap size={18} />
            </button>
            <button
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              title="Emoji"
              type="button"
            >
              <Smile size={18} />
            </button>
            <button
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
              title="Anexo"
              type="button"
            >
              <Paperclip size={18} />
            </button>
            <button
              onClick={triggerAudioPicker}
              disabled={disabled || isBusy}
              className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors disabled:opacity-40"
              title="Enviar arquivo de audio como nota de voz"
              type="button"
            >
              <FileAudio size={18} />
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onKey}
              placeholder={
                sendMode === 'auto' ? 'IA responde automaticamente (voce pode intervir aqui)' : 'Digite uma mensagem'
              }
              disabled={disabled || isBusy}
              rows={1}
              className="flex-1 resize-none px-3 py-2 bg-gray-50 border border-gray-100 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent max-h-32"
            />
            {text.trim() ? (
              <button
                onClick={handleSend}
                disabled={!text.trim() || sending || disabled}
                className="p-2.5 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
                title="Enviar"
                type="button"
              >
                <Send size={16} />
              </button>
            ) : (
              <button
                onClick={startRecording}
                disabled={disabled || isBusy}
                className="p-2.5 bg-emerald-600 text-white rounded-2xl hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-400 transition-colors"
                title="Gravar mensagem de voz"
                type="button"
              >
                <Mic size={16} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
