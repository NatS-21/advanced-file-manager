import React, { useState } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
}

export function SavedSearchModal({ open, onClose, onSave }: Props) {
  const [name, setName] = useState('');
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-md bg-white p-4 shadow">
        <div className="mb-3 text-base font-medium">Сохранить поиск</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название сохраненного поиска"
          className="mb-4 w-full rounded-md border px-3 py-2 outline-none focus:ring"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border px-3 py-2">Отмена</button>
          <button onClick={() => { onSave(name); onClose(); }} className="rounded-md bg-gray-900 px-3 py-2 text-white">Сохранить</button>
        </div>
      </div>
    </div>
  );
}




