import { Mic } from 'lucide-react';

export type PresenceState = 'available' | 'composing' | 'recording' | 'paused';

interface Props {
  state: PresenceState;
  tone?: 'light' | 'muted';
  compact?: boolean;
}

export function PresenceIndicator({ state, tone = 'light', compact = false }: Props) {
  if (state !== 'composing' && state !== 'recording') return null;

  const isRecording = state === 'recording';
  const color = tone === 'muted' ? 'text-emerald-600' : 'text-emerald-600';
  const label = isRecording ? 'gravando áudio' : 'digitando';

  return (
    <span className={`inline-flex items-center gap-1.5 ${color} ${compact ? 'text-[11px]' : 'text-xs'} font-medium`}>
      {isRecording ? (
        <>
          <Mic size={compact ? 11 : 12} className="animate-pulse" />
          <span className="flex items-end gap-0.5 h-3">
            <span className="w-0.5 bg-emerald-500 rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ height: '40%', animationDelay: '0ms' }} />
            <span className="w-0.5 bg-emerald-500 rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ height: '70%', animationDelay: '150ms' }} />
            <span className="w-0.5 bg-emerald-500 rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ height: '100%', animationDelay: '300ms' }} />
            <span className="w-0.5 bg-emerald-500 rounded-full animate-[wave_1s_ease-in-out_infinite]" style={{ height: '60%', animationDelay: '450ms' }} />
          </span>
        </>
      ) : (
        <span className="flex items-center gap-0.5">
          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      )}
      <span>{label}</span>
    </span>
  );
}
