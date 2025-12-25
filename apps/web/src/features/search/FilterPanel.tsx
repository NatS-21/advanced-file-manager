import React from 'react';

interface Props {
  children?: React.ReactNode;
}

export function FilterPanel({ children }: Props) {
  return (
    <aside className="w-72 shrink-0 space-y-4 rounded-md border bg-white p-4">
      {children}
    </aside>
  );
}




