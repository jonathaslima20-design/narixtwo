import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Mic, Loader2 } from 'lucide-react';
import { formatDuration } from '../../lib/useAudioRecorder';

interface Props {
  src: string;
  durationSeconds?: number;
  variant: 'in' | 'out';
  uploading?: boolean;
}

export function AudioPlayer({ src, durationSeconds, variant, uploading }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(durationSeconds ?? 0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    function onTime() {
      if (!a) return;
      setCurrent(a.currentTime);
    }
    function onMeta() {
      if (!a) return;
      if (isFinite(a.duration) && a.duration > 0) setDuration(a.duration);
    }
    function onEnd() {
      setPlaying(false);
      setCurrent(0);
    }
    a.addEventListener('timeupdate', onTime);
    a.addEventListener('loadedmetadata', onMeta);
    a.addEventListener('ended', onEnd);
    return () => {
      a.removeEventListener('timeupdate', onTime);
      a.removeEventListener('loadedmetadata', onMeta);
      a.removeEventListener('ended', onEnd);
    };
  }, []);

  async function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      try {
        await a.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    }
  }

  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const isOut = variant === 'out';

  return (
    <div className={`flex items-center gap-2.5 min-w-[200px] ${isOut ? 'text-white' : 'text-gray-800'}`}>
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={toggle}
        type="button"
        className={`flex items-center justify-center w-9 h-9 rounded-full transition-colors ${
          isOut ? 'bg-white/20 hover:bg-white/30' : 'bg-emerald-600 text-white hover:bg-emerald-700'
        }`}
        aria-label={playing ? 'Pausar' : 'Reproduzir'}
      >
        {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex items-center gap-0.5 h-6">
          {Array.from({ length: 26 }).map((_, i) => {
            const filled = (i / 26) * 100 <= pct;
            const heights = [7, 10, 13, 9, 15, 11, 8, 14, 12, 10, 16, 9, 11, 14, 8, 13, 10, 15, 11, 9, 12, 14, 10, 8, 13, 11];
            const h = heights[i % heights.length];
            return (
              <span
                key={i}
                className={`inline-block w-0.5 rounded-full transition-colors ${
                  filled
                    ? isOut
                      ? 'bg-white'
                      : 'bg-emerald-600'
                    : isOut
                    ? 'bg-white/40'
                    : 'bg-gray-300'
                }`}
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>
        <div className={`flex items-center justify-between text-[10px] ${isOut ? 'text-white/70' : 'text-gray-500'}`}>
          <span className="tabular-nums">
            {formatDuration(playing || current > 0 ? current : duration)}
          </span>
          {uploading ? (
            <Loader2 size={10} className="opacity-70 animate-spin" />
          ) : (
            <Mic size={10} className="opacity-70" />
          )}
        </div>
      </div>
    </div>
  );
}
