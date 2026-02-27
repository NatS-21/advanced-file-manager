import React from 'react';

interface Props {
  children?: React.ReactNode;
}

export function FilterPanel({ children }: Props) {
  return (
    <aside className="w-72 shrink-0 rounded-md border bg-white p-4">
      {children}
    </aside>
  );
}




