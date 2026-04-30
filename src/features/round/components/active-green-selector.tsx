'use client';

import { useState, useTransition } from 'react';
import { updateActiveGreen } from '@/actions/round';

interface ActiveGreenSelectorProps {
  roundId: string;
  initialValue: 'A' | 'B' | null;
}

export function ActiveGreenSelector({ roundId, initialValue }: ActiveGreenSelectorProps) {
  const [value, setValue] = useState<'A' | 'B' | null>(initialValue);
  const [isPending, startTransition] = useTransition();

  const handleChange = (newValue: 'A' | 'B') => {
    if (newValue === value) return;
    const prev = value;
    setValue(newValue);
    startTransition(async () => {
      const result = await updateActiveGreen(roundId, newValue);
      if (result.error) {
        setValue(prev); // ロールバック
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-300">使用グリーン</span>
      <div className="flex rounded-lg overflow-hidden border border-gray-600">
        <button
          onClick={() => handleChange('A')}
          disabled={isPending}
          className={`min-h-[40px] px-4 text-sm font-bold transition-colors ${
            value === 'A'
              ? 'bg-green-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Aグリーン
        </button>
        <button
          onClick={() => handleChange('B')}
          disabled={isPending}
          className={`min-h-[40px] px-4 text-sm font-bold transition-colors ${
            value === 'B'
              ? 'bg-green-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          Bグリーン
        </button>
      </div>
    </div>
  );
}
