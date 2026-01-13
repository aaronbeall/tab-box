import React from 'react';
import { MdExpandMore } from 'react-icons/md';

interface CollapsableHeaderProps {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  count: number;
}

export const CollapsableHeader: React.FC<CollapsableHeaderProps> = ({ title, isOpen, onToggle, count }) => {
  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 pt-2 select-none">
      <div className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
      <div
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800/60"
      >
        <MdExpandMore size={12} className={`transition-transform ${isOpen ? '' : '-rotate-90'}`} />
        <span className="font-semibold">{title} ({count})</span>
      </div>
      <div className="h-px flex-1 bg-gray-200 dark:bg-zinc-800" />
    </div>
  );
};
