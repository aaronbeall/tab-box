import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  label: string;
}

export const Switch: React.FC<SwitchProps> = ({ checked, onChange, label }) => {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
      <div className="relative inline-flex w-10 h-5 bg-gray-300 dark:bg-gray-700 rounded-full transition-colors" style={{ backgroundColor: checked ? '#3b82f6' : undefined }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="sr-only"
        />
        <span className={`absolute top-0.5 left-0.5 inline-block w-4 h-4 bg-white rounded-full transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
      <span>{label}</span>
    </label>
  );
};
