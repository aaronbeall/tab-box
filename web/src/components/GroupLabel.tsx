import React from 'react';
import { colorToCss, readableTextColor } from '../utils';
import type { StorageGroup } from '../types';

interface GroupLabelProps {
  group: StorageGroup;
  onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void;
  className?: string;
}

export const GroupLabel: React.FC<GroupLabelProps> = ({ group, onClick, className = '' }) => {
  const base = colorToCss(group.color);
  const tagText = readableTextColor(base);
  
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold min-w-[1.5rem] min-h-[1.5rem] cursor-pointer ${className}`}
      style={{ background: base, color: tagText }}
      onClick={onClick}
    >
      {group.title}
    </span>
  );
};
