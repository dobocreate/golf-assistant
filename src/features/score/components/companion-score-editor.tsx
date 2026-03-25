'use client';

import { useState, useEffect, useTransition } from 'react';
import { Save, Check, AlertCircle } from 'lucide-react';
import { upsertCompanionScoresBatch } from '@/actions/companion';
import { usePlayRoundOptional } from '@/features/play/context/play-round-context';
import type { CompanionWithScores } from '@/features/score/types';

interface CompanionScoreEditorProps {
  companionData: CompanionWithScores[];
  roundId: string;
  onSaved?: (holeNumber: number, scores: Array<{ companionId: string; strokes: number | null; putts: number | null }>) => void;
}

export function CompanionScoreEditor({ companionData, roundId, onSaved }: CompanionScoreEditorProps) {
  const playRound = usePlayRoundOptional();
  const currentHole = playRound?.currentHole ?? 1;
  const [isPending, startTransition] = useTransition();
  const [saveResult, setSaveResult] = useState<'idle' | 'saved' | 'error'>('idle');

  // 各同伴者の打数・パット入力値
  const [inputs, setInputs] = useState<Map<string, { strokes: string; putts: string }>>(new Map());

  // currentHole 変更時に DB 値で入力値をリセット
  useEffect(() => {
    const newInputs = new Map<string, { strokes: string; putts: string }>();
    for (const { companion, scores } of companionData) {
      const s = scores.find(sc => sc.hole_number === currentHole);
      newInputs.set(companion.id, {
        strokes: s?.strokes?.toString() ?? '',
        putts: s?.putts?.toString() ?? '',
      });
    }
    setInputs(newInputs);
    setSaveResult('idle');
  }, [currentHole, companionData]);

  if (companionData.length === 0) return null;

  const handleSave = () => {
    const scoreData = companionData.map(({ companion }) => {
      const input = inputs.get(companion.id) ?? { strokes: '', putts: '' };
      const strokes = input.strokes === '' ? null : parseInt(input.strokes, 10);
      const putts = input.putts === '' ? null : parseInt(input.putts, 10);
      return {
        companionId: companion.id,
        strokes: strokes !== null && !isNaN(strokes) ? strokes : null,
        putts: putts !== null && !isNaN(putts) ? putts : null,
      };
    });

    startTransition(async () => {
      const result = await upsertCompanionScoresBatch({
        roundId,
        holeNumber: currentHole,
        scores: scoreData,
      });
      if (result.error) {
        setSaveResult('error');
      } else {
        setSaveResult('saved');
        onSaved?.(currentHole, scoreData);
        setTimeout(() => setSaveResult('idle'), 3000);
      }
    });
  };

  return (
    <div className="rounded-lg border border-gray-700 overflow-hidden">
      <div className="bg-gray-800 px-3 py-2 flex items-center justify-between">
        <span className="text-sm font-bold text-gray-200">
          Hole {currentHole} 同伴者スコア
        </span>
        {saveResult === 'saved' && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <Check className="h-3 w-3" />
            保存済み
          </span>
        )}
        {saveResult === 'error' && (
          <span className="flex items-center gap-1 text-xs text-red-400">
            <AlertCircle className="h-3 w-3" />
            保存失敗
          </span>
        )}
      </div>

      <div className="p-3 space-y-3 bg-gray-900">
        {companionData.map(({ companion }) => {
          const input = inputs.get(companion.id) ?? { strokes: '', putts: '' };
          return (
            <div key={companion.id} className="flex items-center gap-3">
              <span className="text-sm font-bold text-gray-300 w-16 truncate">{companion.name}</span>
              <div className="flex items-center gap-1">
                <label className="text-xs text-gray-400">打数</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  value={input.strokes}
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    setInputs(prev => {
                      const next = new Map(prev);
                      next.set(companion.id, { ...input, strokes: e.target.value });
                      return next;
                    });
                    setSaveResult('idle');
                  }}
                  className="w-14 min-h-[48px] rounded-lg bg-gray-800 text-gray-200 text-center text-base font-bold border-0 focus:ring-2 focus:ring-green-600"
                />
              </div>
              <div className="flex items-center gap-1">
                <label className="text-xs text-gray-400">パット</label>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={10}
                  value={input.putts}
                  onFocus={e => e.target.select()}
                  onChange={e => {
                    setInputs(prev => {
                      const next = new Map(prev);
                      next.set(companion.id, { ...input, putts: e.target.value });
                      return next;
                    });
                    setSaveResult('idle');
                  }}
                  className="w-14 min-h-[48px] rounded-lg bg-gray-800 text-gray-200 text-center text-base font-bold border-0 focus:ring-2 focus:ring-green-600"
                />
              </div>
            </div>
          );
        })}

      </div>

      {/* フローティング保存ボタン */}
      <div className="fixed bottom-[var(--play-nav-height)] right-4 z-40 mb-3">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="min-h-[48px] flex items-center justify-center gap-2 rounded-full bg-green-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Save className="h-4 w-4" />
          {isPending ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}
