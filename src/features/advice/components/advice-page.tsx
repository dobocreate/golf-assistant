'use client';

import { useState, useMemo } from 'react';
import { HoleNavigation } from '@/components/ui/hole-navigation';
import { ChatPanel } from '@/features/advice/components/chat-panel';
import type { HoleInfo } from '@/features/score/types';

interface AdvicePageProps {
  roundId: string;
  courseName: string;
  holes: HoleInfo[];
  startingCourse: 'out' | 'in';
}

function getHoleOrder(startingCourse: 'out' | 'in'): number[] {
  if (startingCourse === 'in') {
    return [...Array.from({ length: 9 }, (_, i) => i + 10), ...Array.from({ length: 9 }, (_, i) => i + 1)];
  }
  return Array.from({ length: 18 }, (_, i) => i + 1);
}

export function AdvicePage({ roundId, courseName, holes, startingCourse }: AdvicePageProps) {
  const holeOrder = useMemo(() => getHoleOrder(startingCourse), [startingCourse]);

  // 初期ホール: localStorageから復元
  const [currentHole, setCurrentHole] = useState(() => {
    const validHoles = new Set(holeOrder);
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`golf-last-hole-${roundId}`);
      if (saved) {
        const num = parseInt(saved, 10);
        if (validHoles.has(num)) return num;
      }
    }
    return holeOrder[0];
  });

  const holeMap = useMemo(() => new Map(holes.map(h => [h.hole_number, h])), [holes]);
  const hole = holeMap.get(currentHole) ?? { hole_number: currentHole, par: 4, distance: null };

  const currentIndex = holeOrder.indexOf(currentHole);
  const prevHole = currentIndex > 0 ? holeOrder[currentIndex - 1] : null;
  const nextHole = currentIndex < holeOrder.length - 1 ? holeOrder[currentIndex + 1] : null;

  const switchHole = (holeNum: number) => {
    setCurrentHole(holeNum);
    try { localStorage.setItem(`golf-last-hole-${roundId}`, String(holeNum)); } catch {}
  };

  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* ヘッダー */}
      <p className="text-sm text-gray-300 truncate">{courseName}</p>

      {/* ホールナビゲーション */}
      <HoleNavigation
        prevHole={prevHole}
        nextHole={nextHole}
        onNavigate={switchHole}
      >
        <div className="text-center">
          <p className="text-3xl font-bold">Hole {currentHole}</p>
          <p className="text-lg text-gray-300">
            Par {hole.par}
            {hole.distance && ` ・ ${hole.distance}y`}
          </p>
        </div>
      </HoleNavigation>

      {/* AIキャディーに質問 */}
      <ChatPanel
        roundId={roundId}
        holeNumber={currentHole}
      />

      {/* スペーサー */}
      <div className="h-28" />
    </div>
  );
}
