'use client';

import { useState, useTransition, useCallback } from 'react';
import { upsertCompanionScore } from '@/actions/companion';
import type { Companion, CompanionScore } from '@/features/score/types';

interface CompanionWithScores {
  companion: Companion;
  scores: CompanionScore[];
}

interface CompanionScoresProps {
  roundId: string;
  companions: CompanionWithScores[];
  currentHole: number;
  prevHole: number | null;
}

export function CompanionScoresPanel({ roundId, companions, currentHole, prevHole }: CompanionScoresProps) {
  const [expanded, setExpanded] = useState(false);
  const [localScores, setLocalScores] = useState<Map<string, Map<number, { strokes: number | null; putts: number | null }>>>(() => {
    const map = new Map<string, Map<number, { strokes: number | null; putts: number | null }>>();
    for (const { companion, scores } of companions) {
      const holeMap = new Map<number, { strokes: number | null; putts: number | null }>();
      for (const s of scores) {
        holeMap.set(s.hole_number, { strokes: s.strokes, putts: s.putts });
      }
      map.set(companion.id, holeMap);
    }
    return map;
  });
  const [isPending, startTransition] = useTransition();

  const getScore = useCallback((companionId: string, holeNumber: number) => {
    return localScores.get(companionId)?.get(holeNumber) ?? { strokes: null, putts: null };
  }, [localScores]);

  const updateScore = useCallback((companionId: string, holeNumber: number, field: 'strokes' | 'putts', value: number | null) => {
    setLocalScores(prev => {
      const next = new Map(prev);
      const holeMap = new Map(next.get(companionId) ?? new Map());
      const current = holeMap.get(holeNumber) ?? { strokes: null, putts: null };
      holeMap.set(holeNumber, { ...current, [field]: value });
      next.set(companionId, holeMap);
      return next;
    });

    const current = localScores.get(companionId)?.get(holeNumber) ?? { strokes: null, putts: null };
    const updated = { ...current, [field]: value };

    startTransition(async () => {
      await upsertCompanionScore({
        companionId,
        roundId,
        holeNumber,
        strokes: updated.strokes,
        putts: updated.putts,
      });
    });
  }, [roundId, localScores]);

  if (companions.length === 0) return null;

  // オナー判定: 前ホールの最少打数者（自分含まず、同伴者のみ）
  const honor = prevHole !== null ? (() => {
    let minStrokes = Infinity;
    let honorName: string | null = null;
    for (const { companion } of companions) {
      const s = getScore(companion.id, prevHole);
      if (s.strokes !== null && s.strokes < minStrokes) {
        minStrokes = s.strokes;
        honorName = companion.name;
      }
    }
    return honorName;
  })() : null;

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 bg-gray-800 text-left"
      >
        <span className="text-sm font-bold text-gray-200">
          同伴者スコア
        </span>
        <span className="text-gray-500">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="p-3 space-y-4 bg-gray-900">
          {companions.map(({ companion }) => {
            const score = getScore(companion.id, currentHole);
            return (
              <div key={companion.id} className="space-y-2">
                <span className="text-sm font-bold text-gray-300">{companion.name}</span>
                <div className="flex items-center gap-4">
                  {/* Strokes stepper */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 w-8">打数</span>
                    <button
                      onClick={() => updateScore(companion.id, currentHole, 'strokes', Math.max(1, (score.strokes ?? 4) - 1))}
                      disabled={isPending}
                      className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-lg font-bold text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      −
                    </button>
                    <span className="text-xl font-bold min-w-[32px] text-center text-gray-200">
                      {score.strokes ?? '-'}
                    </span>
                    <button
                      onClick={() => updateScore(companion.id, currentHole, 'strokes', Math.min(20, (score.strokes ?? 4) + 1))}
                      disabled={isPending}
                      className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-lg font-bold text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      +
                    </button>
                  </div>

                  <div className="h-8 w-px bg-gray-700" />

                  {/* Putts stepper */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 w-8">パット</span>
                    <button
                      onClick={() => updateScore(companion.id, currentHole, 'putts', Math.max(0, (score.putts ?? 2) - 1))}
                      disabled={isPending}
                      className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-lg font-bold text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      −
                    </button>
                    <span className="text-xl font-bold min-w-[32px] text-center text-gray-200">
                      {score.putts ?? '-'}
                    </span>
                    <button
                      onClick={() => updateScore(companion.id, currentHole, 'putts', Math.min(10, (score.putts ?? 2) + 1))}
                      disabled={isPending}
                      className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-lg bg-gray-800 text-lg font-bold text-white hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {/* オナー表示 */}
          {honor && (
            <div className="rounded-lg bg-yellow-900/30 border border-yellow-700/50 px-3 py-2 text-sm text-yellow-300">
              同伴者内オナー: {honor}（前ホール最少打数）
            </div>
          )}
        </div>
      )}
    </div>
  );
}
