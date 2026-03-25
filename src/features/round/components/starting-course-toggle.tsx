'use client';

import { useState, useTransition } from 'react';
import { updateStartingCourse } from '@/actions/round';

interface StartingCourseToggleProps {
  roundId: string;
  initialValue: 'out' | 'in';
}

export function StartingCourseToggle({ roundId, initialValue }: StartingCourseToggleProps) {
  const [value, setValue] = useState(initialValue);
  const [isPending, startTransition] = useTransition();

  const handleToggle = (newValue: 'out' | 'in') => {
    if (newValue === value) return;
    setValue(newValue);
    startTransition(async () => {
      const result = await updateStartingCourse(roundId, newValue);
      if (result.error) {
        setValue(value); // ロールバック
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-300">スタート</span>
      <div className="flex rounded-lg overflow-hidden border border-gray-600">
        <button
          onClick={() => handleToggle('out')}
          disabled={isPending}
          className={`min-h-[40px] px-4 text-sm font-bold transition-colors ${
            value === 'out'
              ? 'bg-green-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          OUT
        </button>
        <button
          onClick={() => handleToggle('in')}
          disabled={isPending}
          className={`min-h-[40px] px-4 text-sm font-bold transition-colors ${
            value === 'in'
              ? 'bg-green-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
          }`}
        >
          IN
        </button>
      </div>
    </div>
  );
}
