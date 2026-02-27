import React, { useState, useRef, useEffect } from 'react';

interface RangeSliderProps {
  min: number;
  max: number;
  value: [number | null, number | null];
  onChange: (value: [number | null, number | null]) => void;
  step?: number;
  label?: string;
  formatValue?: (value: number) => string;
}

export function RangeSlider({
  min,
  max,
  value,
  onChange,
  step = 1,
  label,
  formatValue = (v) => String(v),
}: RangeSliderProps) {
  // localValue используется только для позиции ползунков (в пределах [min, max])
  const [localValue, setLocalValue] = useState<[number, number]>([
    value[0] ?? min,
    value[1] ?? max,
  ]);
  const [isDragging, setIsDragging] = useState<'min' | 'max' | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const currentMin = value[0] ?? min;
    const currentMax = value[1] ?? max;
    const clampedMin = Math.max(min, Math.min(max, currentMin));
    const clampedMax = Math.max(min, Math.min(max, currentMax));
    setLocalValue([clampedMin, clampedMax]);
  }, [value, min, max]);

  const getPercentage = (val: number) => ((val - min) / (max - min)) * 100;

  const handleMouseDown = (type: 'min' | 'max') => {
    setIsDragging(type);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !sliderRef.current) return;

      const rect = sliderRef.current.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const newValue = Math.round((min + percentage * (max - min)) / step) * step;
      const clampedValue = Math.max(min, Math.min(max, newValue));

      if (isDragging === 'min') {
        const newMin = Math.min(clampedValue, localValue[1]);
        setLocalValue((prev) => [newMin, prev[1]]);
        onChange([newMin, value[1]]);
      } else {
        const newMax = Math.max(clampedValue, localValue[0]);
        setLocalValue((prev) => [prev[0], newMax]);
        onChange([value[0], newMax]);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, localValue, min, max, step, value, onChange]);

  const minPercentage = getPercentage(localValue[0]);
  const maxPercentage = getPercentage(localValue[1]);

  return (
    <div className="w-full">
      {label && (
        <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
          <span>{label}</span>
          <span>
            {formatValue(value[0] ?? min)} — {formatValue(value[1] ?? max)}
          </span>
        </div>
      )}
      <div
        ref={sliderRef}
        className="relative h-2 w-full rounded-md bg-gray-200"
        onMouseDown={(e) => {
          if (e.target === sliderRef.current) {
            const rect = sliderRef.current.getBoundingClientRect();
            const percentage = (e.clientX - rect.left) / rect.width;
            const newValue = Math.round((min + percentage * (max - min)) / step) * step;
            const clampedValue = Math.max(min, Math.min(max, newValue));
            
            const distanceToMin = Math.abs(clampedValue - localValue[0]);
            const distanceToMax = Math.abs(clampedValue - localValue[1]);
            
            if (distanceToMin < distanceToMax) {
              const newMin = Math.min(clampedValue, localValue[1]);
              setLocalValue([newMin, localValue[1]]);
              onChange([newMin, value[1]]);
            } else {
              const newMax = Math.max(clampedValue, localValue[0]);
              setLocalValue([localValue[0], newMax]);
              onChange([value[0], newMax]);
            }
          }
        }}
      >
        {/* Active range track */}
        <div
          className="absolute h-2 rounded-md bg-gray-900"
          style={{
            left: `${minPercentage}%`,
            width: `${maxPercentage - minPercentage}%`,
          }}
        />
        
        {/* Min thumb */}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-gray-900 bg-white shadow-md active:cursor-grabbing"
          style={{ left: `${minPercentage}%` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            handleMouseDown('min');
          }}
        />
        
        {/* Max thumb */}
        <div
          className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-2 border-gray-900 bg-white shadow-md active:cursor-grabbing"
          style={{ left: `${maxPercentage}%` }}
          onMouseDown={(e) => {
            e.stopPropagation();
            handleMouseDown('max');
          }}
        />
      </div>
      
      {/* Input fields for precise values */}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="number"
          // min/max оставляем только как подсказку для стрелок,
          // но не ограничиваем ввод вручную
          min={min}
          max={max}
          step={step}
          value={value[0] ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              // Очищаем нижнюю границу
              onChange([null, value[1] ?? null]);
              return;
            }
            const num = Number(raw);
            if (Number.isNaN(num)) return;
            onChange([num, value[1] ?? null]);
          }}
          className="flex-1 rounded-md border px-2 py-1 text-sm"
          placeholder="От"
        />
        <span className="text-gray-400">—</span>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value[1] ?? ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') {
              // Очищаем верхнюю границу
              onChange([value[0] ?? null, null]);
              return;
            }
            const num = Number(raw);
            if (Number.isNaN(num)) return;
            onChange([value[0] ?? null, num]);
          }}
          className="flex-1 rounded-md border px-2 py-1 text-sm"
          placeholder="До"
        />
      </div>
    </div>
  );
}

