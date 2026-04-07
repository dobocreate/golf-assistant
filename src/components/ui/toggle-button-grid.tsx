'use client';

import { cn } from '@/lib/utils';

export interface ToggleOption<T extends string> {
  value: T;
  label: string;
  activeColor?: string;
  color?: string;
}

interface ToggleButtonGridProps<T extends string> {
  options: ToggleOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  columns?: number;
  allowDeselect?: boolean;
  disabled?: boolean;
  className?: string;
  itemClassName?: string;
  renderOption?: (option: ToggleOption<T>, isSelected: boolean) => React.ReactNode;
}

const DEFAULT_ACTIVE = 'bg-green-600 text-white';
const DEFAULT_INACTIVE = 'bg-gray-800 text-gray-200 hover:bg-gray-700';

const GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

export function ToggleButtonGrid<T extends string>({
  options,
  value,
  onChange,
  columns = 3,
  allowDeselect = true,
  disabled = false,
  className,
  itemClassName,
  renderOption,
}: ToggleButtonGridProps<T>) {
  return (
    <div className={cn('grid gap-1.5', GRID_COLS[columns] ?? 'grid-cols-3', className)}>
      {options.map(opt => {
        const isSelected = value === opt.value;
        const activeStyle = opt.activeColor ?? DEFAULT_ACTIVE;
        const inactiveStyle = opt.color ?? DEFAULT_INACTIVE;

        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => {
              if (isSelected && allowDeselect) {
                onChange(null);
              } else {
                onChange(opt.value);
              }
            }}
            className={cn(
              'min-h-[48px] rounded-lg text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
              itemClassName,
              isSelected ? activeStyle : inactiveStyle,
            )}
          >
            {renderOption ? renderOption(opt, isSelected) : opt.label}
          </button>
        );
      })}
    </div>
  );
}
