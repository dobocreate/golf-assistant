'use client';

import { useEffect, useRef } from 'react';
import { Users, X } from 'lucide-react';
import { Stepper } from '@/components/ui/stepper';
import type { Companion, CompanionScore } from '@/features/score/types';

export interface CompanionHoleInput {
  companionId: string;
  strokes: number | null;
  putts: number | null;
}

interface CompanionScoreModalProps {
  open: boolean;
  onClose: () => void;
  companions: Companion[];
  holeNumber: number;
  /** 現在のホールの同伴者スコア入力値 */
  inputs: CompanionHoleInput[];
  onInputChange: (companionId: string, field: 'strokes' | 'putts', value: number | null) => void;
}

export function CompanionScoreModal({
  open,
  onClose,
  companions,
  holeNumber,
  inputs,
  onInputChange,
}: CompanionScoreModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="companion-score-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="w-full max-w-md max-h-[85vh] rounded-t-2xl bg-gray-800 border-t border-gray-600 p-5 pb-[calc(env(safe-area-inset-bottom,0px)+2rem)] space-y-4 animate-in slide-in-from-bottom duration-200 overflow-y-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" />
            <h2 id="companion-score-title" className="text-lg font-bold text-white">
              同伴者スコア — Hole {holeNumber}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 同伴者ごとの入力 */}
        <div className="space-y-3">
          {companions.map((companion) => {
            const input = inputs.find(i => i.companionId === companion.id);
            const strokes = input?.strokes ?? null;
            const putts = input?.putts ?? null;

            return (
              <div key={companion.id} className="rounded-lg bg-gray-900 border border-gray-700 p-3">
                <p className="text-sm font-bold text-gray-300 mb-2">{companion.name}</p>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1">
                    <label className="block text-xs text-gray-400 text-center">打数</label>
                    <Stepper
                      value={strokes}
                      min={1}
                      max={20}
                      fallbackDisplay="-"
                      label="打数"
                      compact
                      onChange={(v) => {
                        onInputChange(companion.id, 'strokes', v);
                        if (putts !== null && v !== null && putts > v) {
                          onInputChange(companion.id, 'putts', v);
                        }
                      }}
                    />
                  </div>
                  <div className="w-px bg-gray-700 self-stretch mt-5" />
                  <div className="flex-1 space-y-1">
                    <label className="block text-xs text-gray-400 text-center">パット</label>
                    <Stepper
                      value={putts}
                      min={0}
                      max={Math.min(strokes ?? 10, 10)}
                      fallbackDisplay="-"
                      label="パット"
                      compact
                      onChange={(v) => onInputChange(companion.id, 'putts', v)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}

/** 同伴者スコアデータから現在ホールの入力値を生成 */
export function getCompanionInputsForHole(
  companions: Companion[],
  companionScoresMap: Map<string, Map<number, CompanionScore>>,
  holeNumber: number,
): CompanionHoleInput[] {
  return companions.map(c => {
    const score = companionScoresMap.get(c.id)?.get(holeNumber);
    return {
      companionId: c.id,
      strokes: score?.strokes ?? null,
      putts: score?.putts ?? null,
    };
  });
}
