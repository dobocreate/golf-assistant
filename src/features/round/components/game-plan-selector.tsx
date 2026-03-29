'use client';

import { useState, useTransition } from 'react';
import { Target } from 'lucide-react';
import { applyGamePlanSetToRound } from '@/actions/game-plan-set';
import type { GamePlanSet } from '@/features/game-plan/types';

interface GamePlanSelectorProps {
  roundId: string;
  plans: GamePlanSet[];
  currentPlanName: string | null;
}

export function GamePlanSelector({ roundId, plans, currentPlanName }: GamePlanSelectorProps) {
  const [appliedName, setAppliedName] = useState<string | null>(currentPlanName);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    if (!id) return;
    setError(null);

    const plan = plans.find(p => p.id === id);
    if (!plan) return;

    startTransition(async () => {
      const result = await applyGamePlanSetToRound({ setId: id, roundId });
      if (result.error) {
        setError(result.error);
      } else {
        setAppliedName(plan.name);
      }
    });
  };

  if (plans.length === 0) return null;

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-sm font-bold text-gray-200">
        <Target className="h-4 w-4" />
        ゲームプラン
      </label>
      <select
        onChange={handleChange}
        disabled={isPending}
        defaultValue=""
        className="w-full min-h-[48px] rounded-lg bg-gray-800 border border-gray-700 px-3 py-2.5 text-sm text-white disabled:opacity-50"
      >
        <option value="">{appliedName ? `${appliedName}（適用中）` : '選択してください'}</option>
        {plans.filter(plan => plan.name !== appliedName).map(plan => (
          <option key={plan.id} value={plan.id}>
            {plan.name}{plan.target_score ? ` (目標${plan.target_score})` : ''}
          </option>
        ))}
      </select>
      {isPending && <p className="text-xs text-gray-400">適用中...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
