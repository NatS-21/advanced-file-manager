import React from 'react';
import { AssetCard } from './AssetCard';

interface AssetItem {
  id: number;
  title?: string | null;
  description?: string | null;
  previewUrl?: string;
}

interface Props {
  items: AssetItem[];
}

export function AssetGrid({ items }: Props) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {items.map((it) => (
        <AssetCard key={it.id} title={it.title} subtitle={it.description ?? undefined} previewUrl={it.previewUrl} />
      ))}
    </div>
  );
}




