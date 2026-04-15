'use client';

import { useEffect, useRef, useState } from 'react';
import { Users, X, Check } from 'lucide-react';
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
  /** モーダル表示時点の同伴者スコア入力値（draft の初期値） */
  inputs: CompanionHoleInput[];
  /** OK 押下時に draft を親へ確定するコールバック */
  onCommit: (draft: CompanionHoleInput[]) => void;
}

export function CompanionScoreModal({
  open,
  onClose,
  companions,
  holeNumber,
  inputs,
  onCommit,
}: CompanionScoreModalProps) {
  const okButtonRef = useRef<HTMLButtonElement>(null);

  // モーダル内 draft state: open が false→true に遷移した時のみ inputs でシード
  // （open 中に親の inputs 参照が変わっても draft を上書きしないためガード）
  const [draft, setDraft] = useState<CompanionHoleInput[]>(inputs);
  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setDraft(inputs);
    }
    prevOpenRef.current = open;
  }, [open, inputs]);

  useEffect(() => {
    if (open) okButtonRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const updateDraft = (companionId: string, updates: Partial<CompanionHoleInput>) => {
    setDraft(prev => prev.map(i => i.companionId === companionId ? { ...i, ...updates } : i));
  };

  const handleCommit = () => {
    onCommit(draft);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="companion-score-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="w-full max-w-md max-h-[85vh] rounded-t-2xl bg-gray-800 border-t border-gray-600 p-5 pb-[calc(var(--play-nav-height,80px)*0.75+env(safe-area-inset-bottom,0px))] space-y-4 animate-in slide-in-from-bottom duration-200 overflow-y-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-400" />
            <h2 id="companion-score-title" className="text-lg font-bold text-white">
              同伴者スコア — Hole {holeNumber}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              ref={okButtonRef}
              type="button"
              onClick={handleCommit}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-green-400 hover:text-green-300 hover:bg-gray-700 transition-colors"
              aria-label="OK"
            >
              <Check className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
              aria-label="キャンセル"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 同伴者ごとの入力 */}
        <div className="space-y-3">
          {companions.map((companion) => {
            const input = draft.find(i => i.companionId === companion.id);
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
                        const updates: Partial<CompanionHoleInput> = { strokes: v };
                        if (putts !== null && v !== null && putts > v) updates.putts = v;
                        updateDraft(companion.id, updates);
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
                      onChange={(v) => updateDraft(companion.id, { putts: v })}
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
