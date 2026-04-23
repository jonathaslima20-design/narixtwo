import { useEffect, useRef, useState } from 'react';
import { Check, CheckCheck, Clock, AlertCircle, Sparkles, RotateCw, MoreVertical, Trash2 } from 'lucide-react';
import { Message } from '../../lib/types';
import { AudioPlayer } from './AudioPlayer';

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  message: Message;
  errorDetail?: string;
  onRetry?: () => void;
  onDelete?: (scope: 'local' | 'whatsapp') => void;
}

export function MessageBubble({ message, errorDetail, onRetry, onDelete }: Props) {
  const isOut = message.direction === 'out';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const statusIcon =
    message.status === 'pending' ? <Clock size={12} className="text-white/60" /> :
    message.status === 'sent' ? <Check size={12} className="text-white/60" /> :
    message.status === 'delivered' ? <CheckCheck size={12} className="text-white/60" /> :
    message.status === 'read' ? <CheckCheck size={12} className="text-sky-200" /> :
    message.status === 'failed' ? <AlertCircle size={12} className="text-red-200" /> : null;

  const isFailed = message.status === 'failed';
  const canDelete = Boolean(onDelete) && !message.id.startsWith('temp-');
  const hasWaId = Boolean(message.whatsapp_message_id);

  return (
    <div className={`group flex ${isOut ? 'justify-end' : 'justify-start'} mb-1.5`}>
      <div className={`flex items-start gap-1 max-w-[75%] ${isOut ? 'flex-row' : 'flex-row-reverse'}`}>
        {canDelete && (
          <div className="relative opacity-0 group-hover:opacity-100 transition-opacity" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="mt-2 p-1 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200"
              aria-label="Opções da mensagem"
            >
              <MoreVertical size={14} />
            </button>
            {menuOpen && (
              <div
                className={`absolute z-20 ${isOut ? 'right-full mr-1' : 'left-full ml-1'} top-0 w-56 bg-white border border-gray-100 rounded-xl shadow-lg py-1 text-xs`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete?.('local');
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-gray-700"
                >
                  <Trash2 size={12} /> Excluir apenas para mim
                </button>
                {isOut && hasWaId && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete?.('whatsapp');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50 text-red-600"
                  >
                    <Trash2 size={12} /> Excluir no WhatsApp também
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-col items-end flex-1 min-w-0">
          <div
            className={`rounded-2xl px-3.5 py-2 shadow-sm ${
              isOut
                ? isFailed
                  ? 'bg-red-500 text-white rounded-br-sm'
                  : 'bg-emerald-600 text-white rounded-br-sm'
                : 'bg-white text-gray-800 rounded-bl-sm border border-gray-100'
            }`}
            title={isFailed && errorDetail ? errorDetail : undefined}
          >
            {message.ai_generated && isOut && (
              <div className="flex items-center gap-1 mb-1 text-[10px] opacity-80">
                <Sparkles size={10} /> IA
              </div>
            )}
            {message.media_url && message.media_type.startsWith('image') && (
              <img src={message.media_url} alt="" className="rounded-xl mb-1.5 max-h-64 w-full object-cover" />
            )}
            {message.media_type === 'audio' && (
              <div className="mb-1">
                {message.media_url ? (
                  <AudioPlayer
                    src={message.media_url}
                    durationSeconds={message.audio_duration_seconds}
                    variant={isOut ? 'out' : 'in'}
                    uploading={message.status === 'pending'}
                  />
                ) : (
                  <div className={`text-xs flex items-center gap-1.5 ${isOut ? 'text-white/80' : 'text-gray-500'}`}>
                    <Sparkles size={10} /> Mensagem de voz
                  </div>
                )}
              </div>
            )}
            {message.content && (
              <p className="text-sm whitespace-pre-wrap break-words leading-snug">{message.content}</p>
            )}
            <div className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${isOut ? 'text-white/70' : 'text-gray-400'}`}>
              <span>{formatTime(message.created_at)}</span>
              {isOut && statusIcon}
            </div>
          </div>
          {isFailed && isOut && (
            <div className="flex items-center gap-2 mt-1 text-[11px] text-red-600">
              {errorDetail && <span className="max-w-[240px] truncate" title={errorDetail}>{errorDetail}</span>}
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 hover:bg-red-100 transition-colors font-medium"
                  type="button"
                >
                  <RotateCw size={10} /> Reenviar
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
