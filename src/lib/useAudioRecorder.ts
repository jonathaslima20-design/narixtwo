import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderState = 'idle' | 'requesting' | 'recording' | 'processing';

export interface RecordingResult {
  blob: Blob;
  mimeType: string;
  durationSeconds: number;
}

function pickMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) {
      return c;
    }
  }
  return 'audio/webm';
}

export function useAudioRecorder() {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startTimeRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const resolveRef = useRef<((r: RecordingResult | null) => void) | null>(null);

  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (tickRef.current != null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupStream();
    };
  }, [cleanupStream]);

  const start = useCallback(async () => {
    setError(null);
    if (state !== 'idle') return false;
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Gravação não suportada neste navegador');
      return false;
    }
    try {
      setState('requesting');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const durationSeconds = Math.max(
          1,
          Math.round((performance.now() - startTimeRef.current) / 1000),
        );
        const blob = new Blob(chunksRef.current, { type: mimeType });
        cleanupStream();
        setState('idle');
        setElapsed(0);
        const resolve = resolveRef.current;
        resolveRef.current = null;
        if (resolve) resolve({ blob, mimeType, durationSeconds });
      };
      mediaRecorderRef.current = recorder;
      startTimeRef.current = performance.now();
      recorder.start();
      setState('recording');
      setElapsed(0);
      tickRef.current = window.setInterval(() => {
        setElapsed(Math.floor((performance.now() - startTimeRef.current) / 1000));
      }, 250);
      return true;
    } catch (err) {
      cleanupStream();
      setState('idle');
      setError(err instanceof Error ? err.message : 'Permissão negada');
      return false;
    }
  }, [cleanupStream, state]);

  const stop = useCallback((): Promise<RecordingResult | null> => {
    return new Promise((resolve) => {
      const rec = mediaRecorderRef.current;
      if (!rec || rec.state === 'inactive') {
        resolve(null);
        return;
      }
      resolveRef.current = resolve;
      setState('processing');
      rec.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    const rec = mediaRecorderRef.current;
    resolveRef.current = null;
    if (rec && rec.state !== 'inactive') {
      rec.onstop = () => {
        cleanupStream();
        setState('idle');
        setElapsed(0);
      };
      rec.stop();
    } else {
      cleanupStream();
      setState('idle');
      setElapsed(0);
    }
  }, [cleanupStream]);

  return { state, elapsed, error, start, stop, cancel };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}
