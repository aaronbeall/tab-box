import React, { useState } from 'react';
import { FiChevronDown, FiChevronRight, FiTrash2, FiX } from 'react-icons/fi';
import { GroupLabel } from './GroupLabel';
import type { GroupItem, TabItem, WindowItem } from '../types';
import { colorToCss, readableTextColor, withAlpha } from '../utils';

interface GroupItemViewProps {
  group: GroupItem;
  window: WindowItem;
  isWindowClosed: boolean;
  isExpanded: boolean;
  onGroupClick: (g: GroupItem, w: WindowItem) => void;
  onTabClick: (t: TabItem, g: GroupItem, w: WindowItem) => void;
  onCloseGroup: (e: React.MouseEvent, groupId: number) => void;
  onDeleteGroup: (e: React.MouseEvent, w: WindowItem, g: GroupItem) => void;
  onDeleteTab: (e: React.MouseEvent, w: WindowItem, g: GroupItem, tabId: number | null) => void;
  onDeleteClosedTabs: (e: React.MouseEvent, w: WindowItem, g: GroupItem) => void;
}

export const GroupItemView: React.FC<GroupItemViewProps> = ({
  group,
  window,
  isWindowClosed,
  isExpanded,
  onGroupClick,
  onTabClick,
  onCloseGroup,
  onDeleteGroup,
  onDeleteTab,
  onDeleteClosedTabs,
}) => {
  const [expandedClosedTabs, setExpandedClosedTabs] = useState(false);
  
  const base = colorToCss(group.color);
  const headerBg = withAlpha(base, 0.18);
  const borderCol = withAlpha(base, 0.35);
  const tagText = readableTextColor(base);
  const isGroupClosedInOpenWindow = !isWindowClosed && group.id === null;

  const openTabs = group.tabs.filter(t => t.id !== null);
  const closedTabs = group.tabs.filter(t => t.id === null);

  return (
    <div
      className={`rounded-md border ${isGroupClosedInOpenWindow ? 'opacity-50' : ''}`}
      style={{ borderColor: borderCol }}
    >
      <div className="flex items-center justify-between px-2 py-1 rounded-t-md border-b" style={{ background: headerBg, borderColor: borderCol }}>
        <div
          className="inline-flex items-center cursor-pointer flex-1"
          onClick={() => onGroupClick(group, window)}
        >
          <GroupLabel group={group} />
        </div>
        {group.id !== null ? (
          <button
            onClick={(e) => onCloseGroup(e, group.id!)}
            className="w-5 h-5 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center shrink-0 -mr-1"
            title="Close group"
          >
            <FiX size={16} />
          </button>
        ) : (
          <button
            onClick={(e) => onDeleteGroup(e, window, group)}
            className="w-5 h-5 text-gray-600 dark:text-gray-300 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center shrink-0 -mr-1"
            title="Delete group"
          >
            <FiTrash2 size={16} />
          </button>
        )}
      </div>
      <div className="divide-y divide-gray-200 dark:divide-zinc-800">
        {openTabs.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/60 group"
            onClick={() => onTabClick(t, group, window)}
            title={`${t.title || ''} | ${t.url}`}
          >
            <img
              src={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(t.url)}&size=16`}
              alt=""
              className="w-4 h-4 rounded-sm shrink-0"
              referrerPolicy="no-referrer"
            />
            <span className="min-w-0 flex-1 truncate">{t.title}</span>
          </div>
        ))}
      </div>
      {closedTabs.length > 0 && (
        <div className="border-t border-gray-200 dark:border-zinc-800">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpandedClosedTabs(!expandedClosedTabs);
            }}
            className="w-full flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800/60"
          >
            {expandedClosedTabs ? (
              <FiChevronDown size={12} />
            ) : (
              <FiChevronRight size={12} />
            )}
            <span>History ({closedTabs.length})</span>
          </button>
          {expandedClosedTabs && (
            <div className="divide-y divide-gray-200 dark:divide-zinc-800 bg-gray-50 dark:bg-zinc-900/30">
              {closedTabs.map((t) => (
                <div
                  key={`closed-${t.url}`}
                  className="flex items-center gap-2 px-2 py-1 opacity-60 group cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800/40 hover:opacity-100 transition-all"
                  onClick={() => onTabClick(t, group, window)}
                  title={`${t.title || ''} | ${t.url}`}
                >
                  <img
                    src={`chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(t.url)}&size=16`}
                    alt=""
                    className="w-4 h-4 rounded-sm shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <button
                    onClick={(e) => onDeleteTab(e, window, group, t.id)}
                    className="w-4 h-4 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 flex items-center justify-center shrink-0 opacity-0 group-hover:opacity-100"
                    title="Delete tab"
                  >
                    <FiTrash2 size={12} />
                  </button>
                </div>
              ))}
              <div className="h-px bg-gray-200 dark:bg-zinc-800" />
              <div
                className="flex items-center gap-2 px-2 py-1 text-xs text-red-600 dark:text-red-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-zinc-800/40"
                onClick={(e) => onDeleteClosedTabs(e, window, group)}
                title="Clear all closed tabs"
              >
                <FiTrash2 size={12} />
                <span>Clear history</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
