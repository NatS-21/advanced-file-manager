import React, { useState } from 'react';

interface Props {
  value: string;
  onChange: (q: string) => void;
  onSearch: () => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, onSearch, placeholder = 'Поиск...' }: Props) {
  return (
    <div className="flex items-center gap-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSearch();
        }}
        placeholder={placeholder}
        className="w-full rounded-md border px-3 py-2 outline-none focus:ring"
      />
      <button
        onClick={onSearch}
        className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-black"
      >Искать</button>
    </div>
  );
}




