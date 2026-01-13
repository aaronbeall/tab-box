import React from 'react';
import { FiChevronDown, FiChevronRight, FiTrash2 } from 'react-icons/fi';
import { GroupLabel } from './GroupLabel';
import { EditableName } from './EditableName';
import { CollapsableHeader } from './CollapsableHeader';
import type { GroupItem, WindowItem } from '../types';

interface WindowItemViewProps {
  window: WindowItem;
  isExpanded: boolean;
  onToggleExpand: (key: string) => void;
  onWindowClick: (w: WindowItem) => void;
  onGroupClick: (g: GroupItem, w: WindowItem) => void;
  onDeleteWindow: (e: React.MouseEvent, w: WindowItem) => void;
  onEditWindowName: (w: WindowItem) => void;
  closedGroupsOpen: boolean;
  onToggleClosedGroups: () => void;
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
  closedGroupsOpen,
  onToggleClosedGroups,
  children,
}) => {
  const isClosed = window.id === null;

  const openGroups = window.groups.filter(g => g.id !== null);
  const closedGroups = window.groups.filter(g => g.id === null);

  return (
    <div
      className={`border border-gray-200 dark:border-zinc-800 rounded-md ${isClosed ? 'opacity-50 bg-gray-50 dark:bg-zinc-900/30' : ''}`}
    >
      <div
        className="flex items-start justify-between cursor-pointer select-none px-2 py-1 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800/60"
        onClick={() => onToggleExpand(window.key)}
      >
        <div className="flex items-start gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleExpand(window.key) }}
            className="mt-0.5 w-5 h-5 border border-gray-400 dark:border-zinc-600 rounded text-xs text-gray-600 dark:text-gray-300 grid place-items-center shrink-0 bg-white dark:bg-zinc-900"
          >
            <FiChevronDown size={12} className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
          </button>
          {isExpanded ? (
            <EditableName
              name={window.name}
              countLabel={`${window.groups.length} ${window.groups.length === 1 ? 'group' : 'groups'}`}
              onEdit={() => onEditWindowName(window)}
            />
          ) : (
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex flex-wrap gap-1.5 min-w-0">
                {window.name && (
                  <span
                    className="inline-flex items-center justify-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold min-w-[1.25rem] min-h-[1.25rem] bg-gray-200 dark:bg-zinc-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-zinc-600 transition-colors"
                    onClick={e => { e.stopPropagation(); onWindowClick(window) }}
                  >
                    {window.name}
                  </span>
                )}
                {openGroups.map((g) => (
                  <GroupLabel
                    key={g.key}
                    group={g}
                    onClick={(e) => { e.stopPropagation(); onGroupClick(g, window) }}
                    className="hover:opacity-80"
                  />
                ))}
                {!closedGroupsOpen && closedGroups.length > 0 && (
                  <span
                    className="inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-semibold min-w-[1.5rem] min-h-[1.5rem] bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer hover:opacity-80"
                    onClick={(e) => { e.stopPropagation(); onToggleClosedGroups() }}
                  >
                    {closedGroups.length} closed…
                  </span>
                )}
              </div>
              {closedGroups.length > 0 && closedGroupsOpen && (
                <>
                  <div onClick={(e) => e.stopPropagation()}>
                    <CollapsableHeader
                      title="Closed Groups"
                      isOpen={closedGroupsOpen}
                      onToggle={onToggleClosedGroups}
                      count={closedGroups.length}
                    />
                  </div>
                  {closedGroupsOpen && (
                    <div className="flex flex-wrap gap-1.5 min-w-0">
                      {closedGroups.map((g) => (
                        <GroupLabel
                          key={g.key}
                          group={g}
                          onClick={(e) => { e.stopPropagation(); onGroupClick(g, window) }}
                          className="hover:opacity-80 opacity-50"
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
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
