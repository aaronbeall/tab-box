import React from 'react';
import { FiChevronDown, FiChevronRight, FiTrash2 } from 'react-icons/fi';
import { GroupLabel } from './GroupLabel';
import { EditableName } from './EditableName';
import type { GroupItem, WindowItem } from '../types';

interface WindowItemViewProps {
  window: WindowItem;
  isExpanded: boolean;
  onToggleExpand: (key: string) => void;
  onWindowClick: (w: WindowItem) => void;
  onGroupClick: (g: GroupItem, w: WindowItem) => void;
  onDeleteWindow: (e: React.MouseEvent, w: WindowItem) => void;
  onEditWindowName: (w: WindowItem) => void;
  children?: React.ReactNode;
}

export const WindowItemView: React.FC<WindowItemViewProps> = ({
  window,
  isExpanded,
  onToggleExpand,
  onWindowClick,
  onGroupClick,
  onDeleteWindow,
  onEditWindowName,
  children,
}) => {
  const isClosed = window.id === null;

  return (
    <div className={`border border-gray-200 dark:border-zinc-800 rounded-md ${isClosed ? 'opacity-50 bg-gray-50 dark:bg-zinc-900/30' : ''}`}>
      <div
        className="flex items-start justify-between cursor-pointer select-none px-2 py-1 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800/60"
        onClick={() => onToggleExpand(window.key)}
      >
        <div className="flex items-start gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(window.key) }}
            className="mt-0.5 w-5 h-5 border border-gray-400 dark:border-zinc-600 rounded text-xs text-gray-600 dark:text-gray-300 grid place-items-center shrink-0 bg-white dark:bg-zinc-900"
          >
            {isExpanded ? <FiChevronDown size={12} /> : <FiChevronRight size={12} />}
          </button>
          {isExpanded ? (
            <EditableName
              name={window.name}
              countLabel={`${window.groups.length} ${window.groups.length === 1 ? 'group' : 'groups'}`}
              onEdit={() => onEditWindowName(window)}
            />
          ) : (
            <div className="flex flex-wrap gap-1.5 min-w-0">
              {window.name && (
                <span
                  className="inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold min-w-[1.25rem] min-h-[1.25rem] bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
                  onClick={e => { e.stopPropagation(); onWindowClick(window) }}
                >
                  {window.name}
                </span>
              )}
              {window.groups.map((g) => {
                const isGroupClosed = !isClosed && g.id === null;
                return (
                  <GroupLabel
                    key={g.key}
                    group={g}
                    onClick={(e) => { e.stopPropagation(); onGroupClick(g, window) }}
                    className={`hover:opacity-80 ${isGroupClosed ? 'opacity-50' : ''}`}
                  />
                );
              })}
            </div>
          )}
        </div>
        {isClosed && (
          <button
            onClick={(e) => onDeleteWindow(e, window)}
            className="mt-0.5 w-5 h-5 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center shrink-0"
          >
            <FiTrash2 size={16} />
          </button>
        )}
      </div>
      {isExpanded && (
        <div className="border-t border-gray-200 dark:border-zinc-800 space-y-2 px-2 py-2">
          {children}
        </div>
      )}
    </div>
  );
};
