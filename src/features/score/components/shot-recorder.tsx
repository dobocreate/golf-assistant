'use client';

import { useEffect } from 'react';
import { Plus, Check, AlertCircle, Loader2 } from 'lucide-react';
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
  /** 親に saveCurrentHole / hasPendingShots を公開するコールバック */
  onShotActionsReady?: (actions: { saveCurrentHole: () => void; hasPendingShots: () => boolean }) => void;
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

  // 親コンポーネントにショット保存関数を公開
  useEffect(() => {
    onShotActionsReady?.({ saveCurrentHole, hasPendingShots });
  }, [saveCurrentHole, hasPendingShots, onShotActionsReady]);

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
      {/* ヘッダー + 追加ボタン + 保存状態 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <label className="block text-sm font-bold text-gray-200">ショット記録</label>
          {saveStatus === 'saving' && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <Loader2 className="h-3 w-3 animate-spin" />
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center gap-1 text-xs text-green-400">
              <Check className="h-3 w-3" />
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-xs text-red-400">
              <AlertCircle className="h-3 w-3" />
              保存失敗
            </span>
          )}
        </div>
        <button
          onClick={handleAddShot}
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-gray-800 text-green-400 hover:bg-gray-700 transition-colors"
          aria-label="ショットを追加"
        >
          <Plus className="h-5 w-5" />
        </button>
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
              <div className="flex items-center gap-2 text-sm">
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

      {/* エラー */}
      {error && (
        <p className="text-center text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
