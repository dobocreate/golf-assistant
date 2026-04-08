'use client';

import { useEffect, useCallback } from 'react';
import { SaveStatusIndicator } from '@/components/ui/save-status-indicator';
import { useShotRecorder } from '@/features/score/hooks/use-shot-recorder';
import { ShotForm } from '@/features/score/components/shot-form';
import { hasFormChanged, type ClubOption } from '@/features/score/shot-constants';

interface ShotRecorderProps {
  roundId: string;
  holeNumber: number;
  clubs: ClubOption[];
  windDirection?: string | null;
  windStrength?: string | null;
  weather?: string | null;
  gamePlanContext?: string | null;
  holeDistance?: number | null;
  /** 親に saveCurrentHole / hasPendingShots / getLandingCounts / addShot を公開するコールバック */
  onShotActionsReady?: (actions: { saveCurrentHole: () => void; hasPendingShots: () => boolean; getLandingCounts: () => { ob: number; bunker: number }; addShot: () => void }) => void;
}

export function ShotRecorder({ roundId, holeNumber, clubs, windDirection, windStrength, weather, gamePlanContext, holeDistance, onShotActionsReady }: ShotRecorderProps) {
  const {
    displaySlots,
    expandedIndex,
    setExpandedIndex,
    getForm,
    dispatch,
    error,
    saveStatus,
    handleAdviceReceived,
    handleAddShot,
    shots,
    loading,
    saveCurrentHole,
    hasPendingShots,
  } = useShotRecorder(roundId, holeNumber, holeDistance);

  // ショットのlanding集計
  const getLandingCounts = useCallback(() => {
    let ob = 0;
    let bunker = 0;
    for (const shot of shots) {
      if (shot.landing === 'ob') ob++;
      if (shot.landing === 'bunker') bunker++;
    }
    return { ob, bunker };
  }, [shots]);

  // 親コンポーネントにショット保存関数を公開
  useEffect(() => {
    onShotActionsReady?.({ saveCurrentHole, hasPendingShots, getLandingCounts, addShot: handleAddShot });
  }, [saveCurrentHole, hasPendingShots, getLandingCounts, handleAddShot, onShotActionsReady]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-bold text-gray-200">ショット記録</label>
        </div>
        <div className="space-y-2">
          {[1, 2].map(i => (
            <div key={i} className="rounded-lg border border-gray-700 overflow-hidden">
              <div className="p-3 bg-gray-800 animate-pulse">
                <div className="h-5 bg-gray-700 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - var(--play-nav-height) - 4rem)' }}>
      {/* stickyヘッダー */}
      <div className="flex items-center gap-2 py-2 flex-shrink-0">
        <label className="block text-sm font-bold text-gray-200">ショット記録</label>
        <SaveStatusIndicator status={saveStatus} compact showLabel={false} />
      </div>

      {/* 内部スクロール領域 */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-4">
        {/* ショット一覧（最新順） */}
        {displaySlots.map((slot) => {
          const isExpanded = expandedIndex === slot.index;
          const form = getForm(slot.index);
          const isChanged = slot.shot ? hasFormChanged(form, slot.shot) : false;

          return (
            <div key={slot.index} className="rounded-lg border border-gray-700 overflow-hidden">
              {/* アコーディオンヘッダー */}
              <button
                onClick={() => setExpandedIndex(isExpanded ? null : slot.index)}
                aria-expanded={isExpanded}
                className="w-full flex items-center justify-between p-3 bg-gray-800 text-left"
              >
                <div className="flex items-center gap-2 text-base">
                  <span className="inline-flex items-center justify-center min-w-[36px] h-9 rounded-lg bg-green-600 text-white text-lg font-bold px-2">
                    {slot.shotNumber}
                  </span>
                  <span className="font-bold text-gray-200">
                    {slot.isNew ? '新規' : '打目'}
                  </span>
                  {slot.club && <span className="text-gray-400 text-sm">{slot.club}</span>}
                  {slot.shotTypeLabel && <span className="text-gray-400 text-sm">{slot.shotTypeLabel}</span>}
                  {slot.distance != null && <span className="text-gray-400 text-sm">{slot.distance}y</span>}
                  {slot.lieLabel && <span className="text-gray-400 text-sm">{slot.lieLabel}</span>}
                  {slot.isSkipped && <span className="text-xs text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded">スキップ</span>}
                  {slot.hasAdvice && <span className="text-blue-400 text-xs">AI</span>}
                  {isChanged && <span className="text-yellow-400 text-xs">編集中</span>}
                </div>
                <span className="text-gray-400">{isExpanded ? '\u25B2' : '\u25BC'}</span>
              </button>

              {/* 展開時のフォーム */}
              {isExpanded && (
                <ShotForm
                  slot={slot}
                  form={form}
                  dispatch={dispatch}
                  clubs={clubs}
                  roundId={roundId}
                  holeNumber={holeNumber}
                  windDirection={windDirection}
                  windStrength={windStrength}
                  weather={weather}
                  onAdviceReceived={handleAdviceReceived}
                  gamePlanContext={gamePlanContext}
                />
              )}
            </div>
          );
        })}

        {/* エラー */}
        {error && (
          <p className="text-center text-sm text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
