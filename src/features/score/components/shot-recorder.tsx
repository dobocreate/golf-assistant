'use client';

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
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

  // モーダル表示中のスロットindex（null=閉じている）
  const [modalSlotIndex, setModalSlotIndex] = useState<number | null>(null);

  // ホール切替時にモーダルを閉じる
  useEffect(() => {
    setModalSlotIndex(null);
  }, [holeNumber]);

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

  // 新規ショット追加→即モーダル
  const handleAddAndOpen = useCallback(() => {
    const newIndex = handleAddShot();
    setModalSlotIndex(newIndex);
  }, [handleAddShot]);

  // 親コンポーネントにショット保存関数を公開
  useEffect(() => {
    onShotActionsReady?.({ saveCurrentHole, hasPendingShots, getLandingCounts, addShot: handleAddAndOpen });
  }, [saveCurrentHole, hasPendingShots, getLandingCounts, handleAddAndOpen, onShotActionsReady]);

  // モーダル用: 背景スクロール防止
  useEffect(() => {
    if (modalSlotIndex !== null) {
      const orig = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = orig; };
    }
  }, [modalSlotIndex]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
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

  // 既存ショットのみ表示（新規スロットは一覧に出さない）
  const existingSlots = displaySlots.filter(s => !s.isNew);

  // モーダル用のスロット情報
  const modalSlot = modalSlotIndex !== null
    ? displaySlots.find(s => s.index === modalSlotIndex) ?? null
    : null;

  return (
    <div className="space-y-3">
      {/* ヘッダー + 保存状態 */}
      <div className="flex items-center gap-2">
        <label className="block text-sm font-bold text-gray-200">ショット記録</label>
        <SaveStatusIndicator status={saveStatus} compact showLabel={false} />
      </div>

      {/* ショット一覧（既存のみ、タップでモーダル） */}
      {existingSlots.map((slot) => {
        const form = getForm(slot.index);
        const isChanged = slot.shot ? hasFormChanged(form, slot.shot) : false;

        return (
          <button
            key={slot.index}
            type="button"
            onClick={() => {
              setExpandedIndex(slot.index);
              setModalSlotIndex(slot.index);
            }}
            className="w-full rounded-lg border border-gray-700 p-3 bg-gray-800 text-left hover:bg-gray-750 transition-colors"
          >
            <div className="flex items-center gap-2 text-base">
              <span className="inline-flex items-center justify-center min-w-[36px] h-9 rounded-lg bg-green-600 text-white text-lg font-bold px-2">
                {slot.shotNumber}
              </span>
              <span className="font-bold text-gray-200">打目</span>
              {slot.club && <span className="text-gray-400 text-sm">{slot.club}</span>}
              {slot.shotTypeLabel && <span className="text-gray-400 text-sm">{slot.shotTypeLabel}</span>}
              {slot.distance != null && <span className="text-gray-400 text-sm">{slot.distance}y</span>}
              {slot.lieLabel && <span className="text-gray-400 text-sm">{slot.lieLabel}</span>}
              {slot.isSkipped && <span className="text-xs text-gray-400 bg-gray-700 px-1.5 py-0.5 rounded">スキップ</span>}
              {slot.hasAdvice && <span className="text-blue-400 text-xs">AI</span>}
              {isChanged && <span className="text-yellow-400 text-xs">編集中</span>}
            </div>
          </button>
        );
      })}

      {/* エラー */}
      {error && (
        <p className="text-center text-sm text-red-400">{error}</p>
      )}

      {/* ショットフォームモーダル */}
      {modalSlot && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shot-modal-title"
          tabIndex={-1}
          className="fixed inset-0 z-50 flex flex-col bg-gray-950"
          onKeyDown={(e) => { if (e.key === 'Escape') setModalSlotIndex(null); }}
        >
          {/* モーダルヘッダー */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 flex-shrink-0 max-w-md mx-auto w-full">
            <h2 id="shot-modal-title" className="text-lg font-bold text-white flex items-center gap-2">
              <span className="inline-flex items-center justify-center min-w-[36px] h-9 rounded-lg bg-green-600 text-white text-lg font-bold px-2">
                {modalSlot.shotNumber}
              </span>
              {modalSlot.isNew ? '新規ショット' : '打目'}
            </h2>
            <button
              type="button"
              autoFocus
              onClick={() => setModalSlotIndex(null)}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              aria-label="閉じる"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* モーダルコンテンツ（スクロール） */}
          <div className="flex-1 overflow-y-auto max-w-md mx-auto w-full pb-[calc(var(--play-nav-height,80px)*0.75+env(safe-area-inset-bottom,0px))]">
            <ShotForm
              slot={modalSlot}
              form={getForm(modalSlot.index)}
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
          </div>
        </div>
      )}

      {/* ナビバー + FAB分のスペーサー */}
      <div className="h-32" />
    </div>
  );
}
