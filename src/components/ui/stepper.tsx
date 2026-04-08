'use client';

import { cn } from '@/lib/utils';

interface StepperProps {
  value: number | null;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  label?: string;
  fallbackDisplay?: string;
  className?: string;
  /** コンパクトモード（狭い画面用） */
  compact?: boolean;
}

export function Stepper({
  value,
  min = 0,
  max = 20,
  onChange,
  label,
  fallbackDisplay = '-',
  className,
  compact = false,
}: StepperProps) {
  const displayValue = value ?? fallbackDisplay;
  const canDecrement = value !== null && value > min;
  const canIncrement = value === null || value < max;

  const handleDecrement = () => {
    if (value === null) return;
    onChange(Math.max(min, value - 1));
  };

  const handleIncrement = () => {
    const next = value === null ? min : value + 1;
    onChange(Math.min(max, next));
  };

  const btnSize = compact ? 'min-h-[38px] min-w-[38px] text-lg' : 'min-h-[48px] min-w-[48px] text-xl';
  const valueSize = compact ? 'min-w-[36px] text-2xl' : 'min-w-[40px] text-3xl';
  const gapSize = compact ? 'gap-1' : 'gap-2';

  return (
    <div className={cn('flex items-center justify-center', gapSize, className)}>
      <button
        type="button"
        onClick={handleDecrement}
        disabled={!canDecrement}
        className={cn('rounded-lg bg-gray-800 text-white font-bold hover:bg-gray-700 disabled:opacity-30 transition-colors', btnSize)}
        aria-label={label ? `${label}を減らす` : '減らす'}
      >
        −
      </button>
      <span className={cn('text-center font-bold text-white', valueSize)} aria-live="polite">
        {displayValue}
      </span>
      <button
        type="button"
        onClick={handleIncrement}
        disabled={!canIncrement}
        className={cn('rounded-lg bg-gray-800 text-white font-bold hover:bg-gray-700 disabled:opacity-30 transition-colors', btnSize)}
        aria-label={label ? `${label}を増やす` : '増やす'}
      >
        +
      </button>
    </div>
  );
}
