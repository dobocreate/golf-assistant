'use client';

import { useState, useMemo } from 'react';
import { HoleNavigation } from '@/components/ui/hole-navigation';
import { AdvicePanel } from '@/features/score/components/advice-panel';
import type { Score, HoleInfo } from '@/features/score/types';
import type { GamePlan } from '@/features/game-plan/types';

interface AdvicePageProps {
  roundId: string;
  courseName: string;
  holes: HoleInfo[];
  scores: Score[];
  startingCourse: 'out' | 'in';
  weather?: string | null;
  gamePlans?: GamePlan[];
  targetScore?: number | null;
}

function getHoleOrder(startingCourse: 'out' | 'in'): number[] {
  if (startingCourse === 'in') {
    return [...Array.from({ length: 9 }, (_, i) => i + 10), ...Array.from({ length: 9 }, (_, i) => i + 1)];
  }
  return Array.from({ length: 18 }, (_, i) => i + 1);
}

export function AdvicePage({ roundId, courseName, holes, scores, startingCourse, weather, gamePlans = [], targetScore }: AdvicePageProps) {
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

      {/* AIアドバイス */}
      <AdvicePanel
        roundId={roundId}
        holeNumber={currentHole}
        shotNumber={null}
        lie="tee"
        slopeFb={null}
        slopeLr={null}
        shotType="tee_shot"
        remainingDistance={hole.distance}
        windDirection={null}
        windStrength={null}
        weather={weather}
        elevation={null}
        gamePlanContext={
          (() => {
            const plan = gamePlans.find(p => p.hole_number === currentHole);
            if (!plan) return null;
            const parts: string[] = [];
            if (plan.alert_text) parts.push(`【弱点アラート】${plan.alert_text}`);
            if (plan.plan_text) parts.push(`【ゲームプラン】${plan.plan_text}`);
            return parts.join('\n') || null;
          })()
        }
      />

      {/* スペーサー */}
      <div className="h-28" />
    </div>
  );
}
