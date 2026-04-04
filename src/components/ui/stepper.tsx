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
}

export function Stepper({
  value,
  min = 0,
  max = 20,
  onChange,
  label,
  fallbackDisplay = '-',
  className,
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

  return (
    <div className={cn('flex items-center justify-center gap-2', className)}>
      <button
        type="button"
        onClick={handleDecrement}
        disabled={!canDecrement}
        className="min-h-[48px] min-w-[48px] rounded-lg bg-gray-800 text-white text-xl font-bold hover:bg-gray-700 disabled:opacity-30 transition-colors"
        aria-label={label ? `${label}を減らす` : '減らす'}
      >
        −
      </button>
      <span className="min-w-[40px] text-center text-3xl font-bold text-white">
        {displayValue}
      </span>
      <button
        type="button"
        onClick={handleIncrement}
        disabled={!canIncrement}
        className="min-h-[48px] min-w-[48px] rounded-lg bg-gray-800 text-white text-xl font-bold hover:bg-gray-700 disabled:opacity-30 transition-colors"
        aria-label={label ? `${label}を増やす` : '増やす'}
      >
        +
      </button>
    </div>
  );
}
