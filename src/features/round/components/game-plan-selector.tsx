'use client';

import { useState, useTransition } from 'react';
import { Target, Check } from 'lucide-react';
import { applyGamePlanSetToRound } from '@/actions/game-plan-set';
import type { GamePlanSet } from '@/features/game-plan/types';

interface GamePlanSelectorProps {
  roundId: string;
  plans: GamePlanSet[];
  currentPlanName: string | null;
}

export function GamePlanSelector({ roundId, plans, currentPlanName }: GamePlanSelectorProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [appliedName, setAppliedName] = useState<string | null>(currentPlanName);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleApply = (plan: GamePlanSet) => {
    setError(null);
    setSelectedId(plan.id);
    startTransition(async () => {
      const result = await applyGamePlanSetToRound({ setId: plan.id, roundId });
      if (result.error) {
        setError(result.error);
        setSelectedId(null);
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
      {appliedName && (
        <div className="flex items-center gap-2 rounded-lg bg-green-900/30 border border-green-700 px-3 py-2">
          <Check className="h-4 w-4 text-green-400 shrink-0" />
          <p className="text-sm text-green-300">{appliedName} 適用中</p>
        </div>
      )}
      <div className="space-y-1">
        {plans.map(plan => {
          const isApplied = appliedName === plan.name;
          const isLoading = isPending && selectedId === plan.id;
          return (
            <button
              key={plan.id}
              onClick={() => handleApply(plan)}
              disabled={isPending}
              className={`w-full min-h-[48px] flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isApplied
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              } disabled:opacity-50`}
            >
              <span>{plan.name}</span>
              <span className="text-xs text-gray-400">
                {isLoading ? '適用中...' : plan.target_score ? `目標${plan.target_score}` : ''}
              </span>
            </button>
          );
        })}
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
