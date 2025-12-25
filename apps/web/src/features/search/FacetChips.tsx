import React from 'react';

export interface FacetBucket { value: string; count: number }

interface Props {
  title: string;
  buckets: FacetBucket[];
  onToggle: (value: string) => void;
  selected: Set<string>;
}

export function FacetChips({ title, buckets, selected, onToggle }: Props) {
  return (
    <div>
      <div className="mb-2 text-sm font-medium">{title}</div>
      <div className="flex flex-wrap gap-2">
        {buckets.map((b) => (
          <button
            key={b.value}
            onClick={() => onToggle(b.value)}
            className={`rounded-full border px-3 py-1 text-sm ${selected.has(b.value) ? 'bg-gray-900 text-white' : 'bg-white'}`}
            title={`${b.value} (${b.count})`}
          >{b.value} <span className="opacity-60">{b.count}</span></button>
        ))}
      </div>
    </div>
  );
}




