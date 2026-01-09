import { FiEdit } from "react-icons/fi";

export function EditableName({ name, countLabel, onEdit }: { name?: string; countLabel: string; onEdit: () => void }) {
  const hasName = !!name
  return (
    <div className="inline-flex items-center gap-2 group/name">
      {hasName ? (
        <div className="flex items-center gap-1.5 mt-0.5 truncate">
          <span className="font-semibold">{name}</span>
          <span className="text-gray-600 dark:text-gray-400">({countLabel})</span>
        </div>
      ) : (
        <span className="font-semibold mt-0.5 text-gray-600 dark:text-gray-400 truncate">{countLabel}</span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="w-6 h-6 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center justify-center opacity-0 group-hover/name:opacity-100"
        title={hasName ? 'Edit window name' : 'Name window'}
      >
        <FiEdit size={14} />
      </button>
    </div>
  )
}