'use client';

import { useState, useTransition } from 'react';
import { Save, Loader2, Check, Trash2 } from 'lucide-react';
import { updateGamePlanSet, upsertGamePlanHolesBatch } from '@/actions/game-plan-set';
import type { GamePlanSetWithHoles, GamePlanHole, RiskLevel } from '@/features/game-plan/types';
import { RISK_LEVEL_VALUES, RISK_LEVEL_LABELS } from '@/features/game-plan/types';

interface HolePlanState {
  planText: string;
  alertText: string;
  riskLevel: RiskLevel | '';
  targetStrokes: string;
}

function initHolePlan(hole?: GamePlanHole): HolePlanState {
  return {
    planText: hole?.plan_text ?? '',
    alertText: hole?.alert_text ?? '',
    riskLevel: hole?.risk_level ?? '',
    targetStrokes: hole?.target_strokes?.toString() ?? '',
  };
}

export function GamePlanSetEditor({ planSet }: { planSet: GamePlanSetWithHoles }) {
  const holeMap = new Map(planSet.holes.map(h => [h.hole_number, h]));

  const [name, setName] = useState(planSet.name);
  const [targetScore, setTargetScore] = useState(planSet.target_score?.toString() ?? '');
  const [holePlans, setHolePlans] = useState<Map<number, HolePlanState>>(() => {
    const map = new Map<number, HolePlanState>();
    for (let i = 1; i <= 18; i++) {
      map.set(i, initHolePlan(holeMap.get(i)));
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
      next.set(hole, { ...next.get(hole)!, [field]: value });
      return next;
    });
  };

  const handleSaveAll = () => {
    startTransition(async () => {
      setSaveStatus('saving');
      setErrorMsg('');

      // 名前・目標スコア更新
      const ts = targetScore ? parseInt(targetScore, 10) : null;
      if (ts !== null && (isNaN(ts) || ts < 50 || ts > 200)) {
        setSaveStatus('error');
        setErrorMsg('目標スコアは50〜200の整数を入力してください。');
        return;
      }

      const setResult = await updateGamePlanSet({
        setId: planSet.id,
        name: name.trim(),
        targetScore: ts,
      });
      if (setResult.error) {
        setSaveStatus('error');
        setErrorMsg(setResult.error);
        return;
      }

      // ホールデータ一括保存
      const holes: Array<{
        holeNumber: number;
        planText: string | null;
        alertText: string | null;
        riskLevel: RiskLevel | null;
        targetStrokes: number | null;
      }> = [];

      for (const [hole, state] of holePlans) {
        if (state.planText || state.alertText || state.riskLevel || state.targetStrokes) {
          holes.push({
            holeNumber: hole,
            planText: state.planText || null,
            alertText: state.alertText || null,
            riskLevel: (state.riskLevel as RiskLevel) || null,
            targetStrokes: state.targetStrokes ? parseInt(state.targetStrokes, 10) : null,
          });
        }
      }

      if (holes.length > 0) {
        const holesResult = await upsertGamePlanHolesBatch({ setId: planSet.id, holes });
        if (holesResult.error) {
          setSaveStatus('error');
          setErrorMsg(holesResult.error);
          return;
        }
      }

      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    });
  };

  const hasData = (state: HolePlanState) =>
    !!(state.planText || state.alertText || state.riskLevel || state.targetStrokes);
  const filledCount = Array.from(holePlans.values()).filter(hasData).length;

  return (
    <div className="space-y-4">
      {/* プラン名 + 目標スコア */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">プラン名</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={100}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-lg font-bold"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-500 mb-1">目標スコア</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={50}
              max={200}
              value={targetScore}
              onChange={e => setTargetScore(e.target.value)}
              placeholder="例: 92"
              className="w-24 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-center text-lg font-bold"
            />
            <span className="text-sm text-gray-500">（50〜200）</span>
          </div>
        </div>
      </div>

      {/* ホール一覧 */}
      <p className="text-sm text-gray-500">{filledCount}/18 ホール登録済み</p>

      <h3 className="text-sm font-bold text-gray-500">OUT（1-9）</h3>
      {Array.from({ length: 9 }, (_, i) => i + 1).map(hole => (
        <HoleCard
          key={hole}
          hole={hole}
          state={holePlans.get(hole)!}
          isExpanded={expandedHole === hole}
          onToggle={() => setExpandedHole(expandedHole === hole ? null : hole)}
          onChange={(field, value) => updateHolePlan(hole, field, value)}
        />
      ))}

      <h3 className="text-sm font-bold text-gray-500">IN（10-18）</h3>
      {Array.from({ length: 9 }, (_, i) => i + 10).map(hole => (
        <HoleCard
          key={hole}
          hole={hole}
          state={holePlans.get(hole)!}
          isExpanded={expandedHole === hole}
          onToggle={() => setExpandedHole(expandedHole === hole ? null : hole)}
          onChange={(field, value) => updateHolePlan(hole, field, value)}
        />
      ))}

      {errorMsg && <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>}

      <button
        onClick={handleSaveAll}
        disabled={isPending || !name.trim()}
        className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-green-600 px-6 py-3 text-lg font-bold text-white hover:bg-green-500 disabled:opacity-50 transition-colors"
      >
        {saveStatus === 'saving' ? (
          <><Loader2 className="h-5 w-5 animate-spin" />保存中...</>
        ) : saveStatus === 'saved' ? (
          <><Check className="h-5 w-5" />保存しました</>
        ) : (
          <><Save className="h-5 w-5" />すべて保存</>
        )}
      </button>
    </div>
  );
}

function HoleCard({
  hole,
  state,
  isExpanded,
  onToggle,
  onChange,
}: {
  hole: number;
  state: HolePlanState;
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (field: keyof HolePlanState, value: string) => void;
}) {
  const filled = !!(state.planText || state.alertText || state.riskLevel || state.targetStrokes);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full min-h-[48px] flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold min-w-[48px]">Hole {hole}</span>
          {filled && <span className="text-xs text-green-600 dark:text-green-400">登録済み</span>}
          {state.alertText && <span className="text-xs text-gray-500 truncate max-w-[200px]">{state.alertText}</span>}
        </div>
        <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">弱点アラート</label>
            <input
              type="text"
              value={state.alertText}
              onChange={e => onChange('alertText', e.target.value)}
              placeholder="例: 右OB注意（過去2/2回）"
              maxLength={1000}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">ゲームプラン</label>
            <textarea
              value={state.planText}
              onChange={e => onChange('planText', e.target.value)}
              placeholder="例: 5IでFW左狙い。ボギーOK"
              maxLength={2000}
              rows={2}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm resize-none"
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-500 mb-1">リスクレベル</label>
              <div className="flex gap-1">
                {RISK_LEVEL_VALUES.map(level => (
                  <button
                    key={level}
                    onClick={() => onChange('riskLevel', state.riskLevel === level ? '' : level)}
                    className={`flex-1 py-1.5 rounded text-xs font-bold transition-colors ${
                      state.riskLevel === level
                        ? level === 'low' ? 'bg-emerald-600 text-white'
                        : level === 'medium' ? 'bg-amber-600 text-white'
                        : 'bg-rose-600 text-white'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {RISK_LEVEL_LABELS[level]}
                  </button>
                ))}
              </div>
            </div>
            <div className="w-24">
              <label className="block text-xs font-bold text-gray-500 mb-1">目標打数</label>
              <input
                type="number"
                min={1}
                max={20}
                value={state.targetStrokes}
                onChange={e => onChange('targetStrokes', e.target.value)}
                placeholder="例: 5"
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1.5 text-sm text-center"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
