import { useCallback, useEffect, useRef, useState } from 'react';

interface RangeSliderProps {
  min: number;
  max: number;
  valueMin: number;
  valueMax: number;
  step?: number;
  minGap?: number;
  onChange: (min: number, max: number) => void;
  formatLabel?: (value: number) => string;
}

export function RangeSlider({
  min,
  max,
  valueMin,
  valueMax,
  step = 1,
  minGap,
  onChange,
  formatLabel,
}: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'min' | 'max' | null>(null);

  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  const snapToStep = (raw: number) => {
    const snapped = Math.round((raw - min) / step) * step + min;
    return Math.min(max, Math.max(min, snapped));
  };

  const valueFromEvent = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return min;
      const rect = track.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      return snapToStep(min + ratio * (max - min));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [min, max, step],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging) return;
      const raw = valueFromEvent(e.clientX);
      const gap = minGap ?? 0;
      if (dragging === 'min') {
        const clamped = Math.min(raw, valueMax - gap);
        onChange(clamped, valueMax);
      } else {
        const clamped = Math.max(raw, valueMin + gap);
        onChange(valueMin, clamped);
      }
    },
    [dragging, valueFromEvent, valueMin, valueMax, minGap, onChange],
  );

  const handleMouseUp = useCallback(() => setDragging(null), []);

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, handleMouseMove, handleMouseUp]);

  // Touch support
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!dragging) return;
      const raw = valueFromEvent(e.touches[0].clientX);
      const gap = minGap ?? 0;
      if (dragging === 'min') {
        onChange(Math.min(raw, valueMax - gap), valueMax);
      } else {
        onChange(valueMin, Math.max(raw, valueMin + gap));
      }
    },
    [dragging, valueFromEvent, valueMin, valueMax, minGap, onChange],
  );

  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('touchmove', handleTouchMove);
    window.addEventListener('touchend', handleMouseUp);
    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUp);
    };
  }, [dragging, handleTouchMove, handleMouseUp]);

  const fmt = formatLabel ?? ((v: number) => String(v));

  return (
    <div className="select-none">
      {/* Track */}
      <div ref={trackRef} className="relative h-2 mx-3 my-4">
        {/* Base track */}
        <div className="absolute inset-0 rounded-full bg-gray-200" />
        {/* Active range */}
        <div
          className="absolute top-0 bottom-0 rounded-full bg-gray-900"
          style={{ left: `${pct(valueMin)}%`, right: `${100 - pct(valueMax)}%` }}
        />

        {/* Min thumb */}
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setDragging('min'); }}
          onTouchStart={(e) => { e.preventDefault(); setDragging('min'); }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-2 border-gray-900 shadow cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-gray-900/30 transition-shadow"
          style={{ left: `${pct(valueMin)}%` }}
          aria-label="Intervalo mínimo"
        />

        {/* Max thumb */}
        <button
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setDragging('max'); }}
          onTouchStart={(e) => { e.preventDefault(); setDragging('max'); }}
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-white border-2 border-gray-900 shadow cursor-grab active:cursor-grabbing focus:outline-none focus:ring-2 focus:ring-gray-900/30 transition-shadow"
          style={{ left: `${pct(valueMax)}%` }}
          aria-label="Intervalo máximo"
        />
      </div>

      {/* Labels below thumbs */}
      <div className="relative h-6">
        <span
          className="absolute -translate-x-1/2 text-xs font-semibold text-gray-700"
          style={{ left: `${pct(valueMin)}%` }}
        >
          {fmt(valueMin)}
        </span>
        <span
          className="absolute -translate-x-1/2 text-xs font-semibold text-gray-700"
          style={{ left: `${pct(valueMax)}%` }}
        >
          {fmt(valueMax)}
        </span>
      </div>
    </div>
  );
}
