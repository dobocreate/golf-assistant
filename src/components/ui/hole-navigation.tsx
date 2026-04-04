'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HoleNavigationProps {
  prevHole: number | null;
  nextHole: number | null;
  onNavigate: (hole: number) => void;
  children?: React.ReactNode;
  className?: string;
}

export function HoleNavigation({
  prevHole,
  nextHole,
  onNavigate,
  children,
  className,
}: HoleNavigationProps) {
  return (
    <div className={cn('flex items-center justify-between', className)}>
      <button
        type="button"
        onClick={() => prevHole !== null && onNavigate(prevHole)}
        disabled={prevHole === null}
        className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-white disabled:opacity-30 transition-colors"
        aria-label="前のホール"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <div className="flex-1 text-center">{children}</div>
      <button
        type="button"
        onClick={() => nextHole !== null && onNavigate(nextHole)}
        disabled={nextHole === null}
        className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-white disabled:opacity-30 transition-colors"
        aria-label="次のホール"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
    </div>
  );
}
