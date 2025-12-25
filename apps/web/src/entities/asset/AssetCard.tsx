import React from 'react';

export interface AssetCardProps {
  title?: string | null;
  subtitle?: string | null;
  previewUrl?: string;
}

export function AssetCard({ title, subtitle, previewUrl }: AssetCardProps) {
  return (
    <div className="overflow-hidden rounded-md border bg-white">
      <div className="aspect-video bg-gray-100">
        {previewUrl ? (
          <img src={previewUrl} alt={title ?? ''} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">Нет превью</div>
        )}
      </div>
      <div className="p-3">
        <div className="truncate text-sm font-medium">{title ?? 'Без названия'}</div>
        {subtitle && <div className="truncate text-xs text-gray-500">{subtitle}</div>}
      </div>
    </div>
  );
}




