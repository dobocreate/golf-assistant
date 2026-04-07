'use client';

import { useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
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
  /** 親に saveCurrentHole / hasPendingShots / getLandingCounts を公開するコールバック */
  onShotActionsReady?: (actions: { saveCurrentHole: () => void; hasPendingShots: () => boolean; getLandingCounts: () => { ob: number; bunker: number } }) => void;
}

export function ShotRecorder({ roundId, holeNumber, clubs, windDirection, windStrength, weather, gamePlanContext, onShotActionsReady }: ShotRecorderProps) {
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
  } = useShotRecorder(roundId, holeNumber);

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
    onShotActionsReady?.({ saveCurrentHole, hasPendingShots, getLandingCounts });
  }, [saveCurrentHole, hasPendingShots, getLandingCounts, onShotActionsReady]);

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
    <div className="space-y-3">
      {/* ヘッダー + 保存状態 */}
      <div className="flex items-center gap-2">
        <label className="block text-sm font-bold text-gray-200">ショット記録</label>
        <SaveStatusIndicator status={saveStatus} compact showLabel={false} />
      </div>

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
                <span className="font-bold text-gray-200">
                  {slot.isNew ? `新規（第${slot.shotNumber}打）` : `第${slot.shotNumber}打`}
                </span>
                {slot.club && <span className="text-gray-400">{slot.club}</span>}
                {slot.shotTypeLabel && <span className="text-gray-400">{slot.shotTypeLabel}</span>}
                {slot.distance != null && <span className="text-gray-400">{slot.distance}y</span>}
                {slot.lieLabel && <span className="text-gray-400">{slot.lieLabel}</span>}
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

      {/* ショット追加FAB */}
      <button
        onClick={handleAddShot}
        className="fixed left-4 z-40 bottom-[var(--play-nav-height)] mb-3 flex items-center gap-2 rounded-full shadow-lg px-4 py-2.5 text-sm font-bold bg-green-600 text-white hover:bg-green-500 active:bg-green-700 transition-colors"
        aria-label="ショットを追加"
      >
        <Plus className="h-4 w-4" />
        ショット追加
      </button>

      {/* エラー */}
      {error && (
        <p className="text-center text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
