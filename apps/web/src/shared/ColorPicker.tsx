import React, { useState } from 'react';

interface ColorPickerProps {
  value?: { r: number; g: number; b: number; threshold?: number };
  onChange: (value: { r: number; g: number; b: number; threshold?: number } | null) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [hexInput, setHexInput] = useState<string>(
    value ? rgbToHex(value.r, value.g, value.b) : ''
  );
  const [threshold, setThreshold] = useState<number>(value?.threshold ?? 60);

  function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map((x) => {
      const hex = Math.round(x).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  }

  function handleHexChange(newHex: string) {
    setHexInput(newHex);
    const rgb = hexToRgb(newHex);
    if (rgb) {
      onChange({ ...rgb, threshold });
    } else if (newHex === '') {
      onChange(null);
    }
  }

  function handleThresholdChange(newThreshold: number) {
    setThreshold(newThreshold);
    if (value) {
      onChange({ ...value, threshold: newThreshold });
    }
  }

  const currentRgb = value ? { r: value.r, g: value.g, b: value.b } : null;
  const displayColor = currentRgb ? rgbToHex(currentRgb.r, currentRgb.g, currentRgb.b) : '#000000';

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div
          className="h-10 w-10 rounded border border-gray-300 cursor-pointer"
          style={{ backgroundColor: displayColor }}
          onClick={() => {
            // Открываем нативный color‑picker браузера
            const input = document.createElement('input');
            input.type = 'color';
            input.value = displayColor;
            input.onchange = (e) => {
              const target = e.target as HTMLInputElement;
              handleHexChange(target.value);
            };
            input.click();
          }}
        />
        <div className="flex-1">
          <input
            type="text"
            value={hexInput}
            onChange={(e) => handleHexChange(e.target.value)}
            placeholder="#000000"
            className="w-full rounded-md border px-2 py-1 text-sm"
            pattern="^#[0-9A-Fa-f]{6}$"
          />
        </div>
      </div>
      {currentRgb && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-600">Порог сходства:</label>
          <input
            type="number"
            min="0"
            max="255"
            value={threshold}
            onChange={(e) => handleThresholdChange(Number(e.target.value))}
            className="w-20 rounded-md border px-2 py-1 text-sm"
          />
          <span className="text-xs text-gray-500">(0-255)</span>
        </div>
      )}
      {currentRgb && (
        <div className="text-xs text-gray-500">
          RGB: {currentRgb.r}, {currentRgb.g}, {currentRgb.b}
        </div>
      )}
    </div>
  );
}

