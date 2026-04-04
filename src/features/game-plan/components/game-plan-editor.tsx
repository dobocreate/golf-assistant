'use client';

import { useState, useTransition } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { upsertGamePlansBatch, deleteGamePlan, updateTargetScore } from '@/actions/game-plan';
import type { GamePlan, RiskLevel } from '@/features/game-plan/types';
import { RISK_LEVEL_VALUES, RISK_LEVEL_LABELS } from '@/features/game-plan/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SaveStatusIndicator } from '@/components/ui/save-status-indicator';

interface GamePlanEditorProps {
  roundId: string;
  initialPlans: GamePlan[];
  initialTargetScore: number | null;
  holeCount?: number;
}

interface HolePlanState {
  planText: string;
  alertText: string;
  riskLevel: RiskLevel | '';
  targetStrokes: string;
}

function initHolePlan(plan?: GamePlan): HolePlanState {
  return {
    planText: plan?.plan_text ?? '',
    alertText: plan?.alert_text ?? '',
    riskLevel: plan?.risk_level ?? '',
    targetStrokes: plan?.target_strokes?.toString() ?? '',
  };
}

export function GamePlanEditor({ roundId, initialPlans, initialTargetScore, holeCount = 18 }: GamePlanEditorProps) {
  const planMap = new Map(initialPlans.map(p => [p.hole_number, p]));

  const [targetScore, setTargetScore] = useState(initialTargetScore?.toString() ?? '');
  const [holePlans, setHolePlans] = useState<Map<number, HolePlanState>>(() => {
    const map = new Map<number, HolePlanState>();
    for (let i = 1; i <= holeCount; i++) {
      map.set(i, initHolePlan(planMap.get(i)));
    }
    return map;
  });
  const [expandedHole, setExpandedHole] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const updateHolePlan = (hole: number, field: keyof HolePlanState, value: string) => {
    setHolePlans(prev => {
      const next = new Map(prev);
      const current = next.get(hole)!;
      next.set(hole, { ...current, [field]: value });
      return next;
    });
  };

  const handleSaveAll = () => {
    startTransition(async () => {
      setSaveStatus('saving');
      setErrorMsg('');

      // 目標スコア保存
      const ts = targetScore ? parseInt(targetScore, 10) : null;
      if (ts !== null && (isNaN(ts) || ts < 50 || ts > 200)) {
        setSaveStatus('error');
        setErrorMsg('目標スコアは50〜200の整数を入力してください。');
        return;
      }
      if (ts !== initialTargetScore) {
        const result = await updateTargetScore({ roundId, targetScore: ts });
        if (result.error) {
          setSaveStatus('error');
          setErrorMsg(result.error);
          return;
        }
      }

      // ゲームプラン一括保存（入力のあるホールのみ）
      const plans: Array<{
        holeNumber: number;
        planText: string | null;
        alertText: string | null;
        riskLevel: RiskLevel | null;
        targetStrokes: number | null;
      }> = [];

      for (const [hole, state] of holePlans) {
        if (state.planText || state.alertText || state.riskLevel || state.targetStrokes) {
          plans.push({
            holeNumber: hole,
            planText: state.planText || null,
            alertText: state.alertText || null,
            riskLevel: (state.riskLevel as RiskLevel) || null,
            targetStrokes: state.targetStrokes ? parseInt(state.targetStrokes, 10) : null,
          });
        }
      }

      if (plans.length > 0) {
        const result = await upsertGamePlansBatch({ roundId, plans });
        if (result.error) {
          setSaveStatus('error');
          setErrorMsg(result.error);
          return;
        }
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    });
  };

  const handleDeleteHole = (hole: number) => {
    startTransition(async () => {
      const result = await deleteGamePlan({ roundId, holeNumber: hole });
      if (result.error) {
        setErrorMsg(result.error);
        return;
      }
      setErrorMsg('');
      setHolePlans(prev => {
        const next = new Map(prev);
        next.set(hole, initHolePlan());
        return next;
      });
    });
  };

  const hasData = (state: HolePlanState) =>
    !!(state.planText || state.alertText || state.riskLevel || state.targetStrokes);

  const filledCount = Array.from(holePlans.values()).filter(hasData).length;

  return (
    <div className="space-y-4">
      {/* 目標スコア */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <Input
          label="目標スコア"
          type="number"
          min={50}
          max={200}
          value={targetScore}
          onChange={e => setTargetScore(e.target.value)}
          placeholder="例: 92"
          inputSize="sm"
          className="w-24 text-center text-lg font-bold"
        />
        <span className="mt-1 block text-sm text-gray-500">（50〜200）</span>
      </div>

      {/* ホール一覧 */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{filledCount}/{holeCount} ホール登録済み</p>
        </div>

        {/* OUT */}
        <h3 className="text-sm font-semibold text-gray-500 mt-3">OUT（1-9）</h3>
        {Array.from({ length: 9 }, (_, i) => i + 1).map(hole => (
          <HolePlanCard
            key={hole}
            hole={hole}
            state={holePlans.get(hole)!}
            isExpanded={expandedHole === hole}
            onToggle={() => setExpandedHole(expandedHole === hole ? null : hole)}
            onChange={(field, value) => updateHolePlan(hole, field, value)}
            onDelete={() => handleDeleteHole(hole)}
            hasExistingData={planMap.has(hole)}
          />
        ))}

        {/* IN */}
        <h3 className="text-sm font-semibold text-gray-500 mt-3">IN（10-18）</h3>
        {Array.from({ length: 9 }, (_, i) => i + 10).map(hole => (
          <HolePlanCard
            key={hole}
            hole={hole}
            state={holePlans.get(hole)!}
            isExpanded={expandedHole === hole}
            onToggle={() => setExpandedHole(expandedHole === hole ? null : hole)}
            onChange={(field, value) => updateHolePlan(hole, field, value)}
            onDelete={() => handleDeleteHole(hole)}
            hasExistingData={planMap.has(hole)}
          />
        ))}
      </div>

      {/* 保存ステータス + エラーメッセージ */}
      <div className="flex items-center gap-2">
        <SaveStatusIndicator status={saveStatus} tone="light" onRetry={saveStatus === 'error' ? handleSaveAll : undefined} />
        {errorMsg && (
          <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>
        )}
      </div>

      {/* 一括保存ボタン */}
      <Button
        onClick={handleSaveAll}
        disabled={isPending}
        variant="primary"
        size="lg"
        fullWidth
        isLoading={isPending}
        className="gap-2 text-lg font-bold"
      >
        <Save className="h-5 w-5" />
        すべて保存
      </Button>
    </div>
  );
}

function HolePlanCard({
  hole,
  state,
  isExpanded,
  onToggle,
  onChange,
  onDelete,
  hasExistingData,
}: {
  hole: number;
  state: HolePlanState;
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (field: keyof HolePlanState, value: string) => void;
  onDelete: () => void;
  hasExistingData: boolean;
}) {
  const filled = !!(state.planText || state.alertText || state.riskLevel || state.targetStrokes);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* ヘッダー（タップで展開） */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full min-h-[48px] flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold min-w-[48px]">Hole {hole}</span>
          {filled && (
            <span className="text-xs text-green-600 dark:text-green-400">登録済み</span>
          )}
          {state.alertText && (
            <span className="text-xs text-gray-500 truncate max-w-[200px]">{state.alertText}</span>
          )}
        </div>
        <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {/* 展開時のフォーム */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
          {/* 弱点アラート */}
          <Input
            label="弱点アラート"
            type="text"
            value={state.alertText}
            onChange={e => onChange('alertText', e.target.value)}
            placeholder="例: 右OB注意（過去2/2回）"
            maxLength={1000}
            inputSize="sm"
          />

          {/* ゲームプラン */}
          <Textarea
            label="ゲームプラン"
            value={state.planText}
            onChange={e => onChange('planText', e.target.value)}
            placeholder="例: 5IでFW左狙い。ボギーOK"
            maxLength={2000}
            rows={2}
          />

          {/* リスクレベル + 目標打数 */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 mb-1">リスクレベル</label>
              <div className="flex gap-1">
                {RISK_LEVEL_VALUES.map(level => (
                  <Button
                    key={level}
                    onClick={() => onChange('riskLevel', state.riskLevel === level ? '' : level)}
                    variant="ghost"
                    size="sm"
                    className={`flex-1 text-xs font-bold ${
                      state.riskLevel === level
                        ? level === 'low' ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                        : level === 'medium' ? 'bg-amber-600 text-white hover:bg-amber-700'
                        : 'bg-rose-600 text-white hover:bg-rose-700'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {RISK_LEVEL_LABELS[level]}
                  </Button>
                ))}
              </div>
            </div>
            <div className="w-24">
              <Input
                label="目標打数"
                type="number"
                min={1}
                max={20}
                value={state.targetStrokes}
                onChange={e => onChange('targetStrokes', e.target.value)}
                placeholder="例: 5"
                inputSize="sm"
                className="text-center"
              />
            </div>
          </div>

          {/* 削除ボタン */}
          {hasExistingData && (
            <Button
              onClick={onDelete}
              variant="ghost"
              size="sm"
              className="gap-1 min-h-[48px] text-xs text-red-500 hover:text-red-400"
            >
              <Trash2 className="h-3 w-3" />
              このホールのプランを削除
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
