'use client';

import { useState, useTransition } from 'react';
import { X, Save } from 'lucide-react';
import { upsertGamePlan } from '@/actions/game-plan';
import { RISK_LEVEL_LABELS, RISK_LEVEL_VALUES } from '@/features/game-plan/types';
import type { RiskLevel, GamePlan } from '@/features/game-plan/types';

interface GamePlanEditorModalProps {
  roundId: string;
  holeNumber: number;
  holePar: number;
  plan: GamePlan | null;
  onClose: () => void;
  onSaved: (plan: GamePlan) => void;
}

export function GamePlanEditorModal({ roundId, holeNumber, holePar, plan, onClose, onSaved }: GamePlanEditorModalProps) {
  const [planText, setPlanText] = useState(plan?.plan_text ?? '');
  const [alertText, setAlertText] = useState(plan?.alert_text ?? '');
  const [riskLevel, setRiskLevel] = useState<RiskLevel | null>(plan?.risk_level ?? null);
  const [targetStrokes, setTargetStrokes] = useState<number>(plan?.target_strokes ?? holePar);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    startTransition(async () => {
      const result = await upsertGamePlan({
        roundId,
        holeNumber,
        planText: planText || null,
        alertText: alertText || null,
        riskLevel,
        targetStrokes,
      });
      if (result.error) {
        setError(result.error);
      } else {
        onSaved({
          id: plan?.id ?? '',
          round_id: roundId,
          hole_number: holeNumber,
          plan_text: planText || null,
          alert_text: alertText || null,
          risk_level: riskLevel,
          target_strokes: targetStrokes,
        });
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md bg-gray-900 rounded-t-xl sm:rounded-xl p-4 space-y-3 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Hole {holeNumber} ゲームプラン</h3>
          <button onClick={onClose} className="min-h-[44px] min-w-[44px] flex items-center justify-center text-gray-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 目標打数 */}
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-1">目標打数</label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setTargetStrokes(Math.max(1, targetStrokes - 1))}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-gray-800 text-lg font-bold text-white hover:bg-gray-700"
            >−</button>
            <span className="text-2xl font-bold min-w-[40px] text-center">{targetStrokes}</span>
            <button
              onClick={() => setTargetStrokes(Math.min(20, targetStrokes + 1))}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-gray-800 text-lg font-bold text-white hover:bg-gray-700"
            >+</button>
          </div>
        </div>

        {/* リスクレベル */}
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-1">リスクレベル</label>
          <div className="flex gap-2">
            {RISK_LEVEL_VALUES.map(level => (
              <button
                key={level}
                onClick={() => setRiskLevel(riskLevel === level ? null : level)}
                className={`flex-1 min-h-[44px] rounded-lg text-sm font-bold transition-colors ${
                  riskLevel === level
                    ? level === 'low' ? 'bg-emerald-600 text-white' : level === 'medium' ? 'bg-amber-600 text-white' : 'bg-rose-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {RISK_LEVEL_LABELS[level]}
              </button>
            ))}
          </div>
        </div>

        {/* アラート */}
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-1">弱点アラート</label>
          <input
            type="text"
            value={alertText}
            onChange={e => setAlertText(e.target.value)}
            maxLength={1000}
            placeholder="注意点・弱点..."
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* プランテキスト */}
        <div>
          <label className="block text-xs font-bold text-gray-400 mb-1">攻略プラン</label>
          <textarea
            value={planText}
            onChange={e => setPlanText(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="攻略方法..."
            className="w-full rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={handleSave}
          disabled={isPending}
          className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-green-600 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
        >
          <Save className="h-4 w-4" />
          {isPending ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  );
}
