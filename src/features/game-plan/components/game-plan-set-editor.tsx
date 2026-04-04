'use client';

import { useState, useTransition } from 'react';
import { Save, Info } from 'lucide-react';
import { updateGamePlanSet, upsertGamePlanHolesBatch } from '@/actions/game-plan-set';
import type { GamePlanSetWithHoles, GamePlanHole, RiskLevel } from '@/features/game-plan/types';
import { RISK_LEVEL_VALUES, RISK_LEVEL_LABELS } from '@/features/game-plan/types';
import type { Hole } from '@/features/course/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SaveStatusIndicator } from '@/components/ui/save-status-indicator';

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

export function GamePlanSetEditor({ planSet, courseHoles = [] }: { planSet: GamePlanSetWithHoles; courseHoles?: Hole[] }) {
  const courseHoleMap = new Map(courseHoles.map(h => [h.hole_number, h]));
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
        <Input
          label="プラン名"
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={100}
          inputSize="sm"
          className="text-lg font-bold"
        />
        <div>
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
      </div>

      {/* ホール一覧 */}
      <p className="text-sm text-gray-500">{filledCount}/18 ホール登録済み</p>

      <h3 className="text-sm font-semibold text-gray-500">OUT（1-9）</h3>
      {Array.from({ length: 9 }, (_, i) => i + 1).map(hole => (
        <HoleCard
          key={hole}
          hole={hole}
          state={holePlans.get(hole)!}
          isExpanded={expandedHole === hole}
          onToggle={() => setExpandedHole(expandedHole === hole ? null : hole)}
          onChange={(field, value) => updateHolePlan(hole, field, value)}
          courseHole={courseHoleMap.get(hole)}
        />
      ))}

      <h3 className="text-sm font-semibold text-gray-500">IN（10-18）</h3>
      {Array.from({ length: 9 }, (_, i) => i + 10).map(hole => (
        <HoleCard
          key={hole}
          hole={hole}
          state={holePlans.get(hole)!}
          isExpanded={expandedHole === hole}
          onToggle={() => setExpandedHole(expandedHole === hole ? null : hole)}
          onChange={(field, value) => updateHolePlan(hole, field, value)}
          courseHole={courseHoleMap.get(hole)}
        />
      ))}

      {/* 保存ステータス + エラーメッセージ */}
      <div className="flex items-center gap-2">
        <SaveStatusIndicator status={saveStatus} tone="light" onRetry={saveStatus === 'error' ? handleSaveAll : undefined} />
        {errorMsg && <p className="text-sm text-red-600 dark:text-red-400">{errorMsg}</p>}
      </div>

      <Button
        onClick={handleSaveAll}
        disabled={isPending || !name.trim()}
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

const DOGLEG_LABELS: Record<string, string> = { straight: 'ストレート', left: '左DL', right: '右DL' };
const ELEVATION_LABELS: Record<string, string> = { flat: 'フラット', uphill: '打ち上げ', downhill: '打ち下ろし' };

function HoleCard({
  hole,
  state,
  isExpanded,
  onToggle,
  onChange,
  courseHole,
}: {
  hole: number;
  state: HolePlanState;
  isExpanded: boolean;
  onToggle: () => void;
  onChange: (field: keyof HolePlanState, value: string) => void;
  courseHole?: Hole;
}) {
  const filled = !!(state.planText || state.alertText || state.riskLevel || state.targetStrokes);

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full min-h-[48px] flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold min-w-[48px]">Hole {hole}</span>
          {courseHole && (
            <span className="text-xs text-gray-400">
              Par{courseHole.par}{courseHole.distance ? ` ・ ${courseHole.distance}y` : ''}
            </span>
          )}
          {filled && <span className="text-xs text-green-600 dark:text-green-400">登録済み</span>}
        </div>
        <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-200 dark:border-gray-700 pt-3">
          {/* コースホール情報 */}
          {courseHole && (
            <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2.5 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-bold">Par {courseHole.par}</span>
                {courseHole.distance && <span className="text-sm text-gray-500">{courseHole.distance}y</span>}
                {courseHole.hdcp && <span className="text-xs text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">HDCP {courseHole.hdcp}</span>}
                {courseHole.dogleg && courseHole.dogleg !== 'straight' && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">{DOGLEG_LABELS[courseHole.dogleg]}</span>
                )}
                {courseHole.elevation && courseHole.elevation !== 'flat' && (
                  <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded">{ELEVATION_LABELS[courseHole.elevation]}</span>
                )}
              </div>
              {(courseHole.hazard || courseHole.ob) && (
                <div className="flex gap-2 flex-wrap">
                  {courseHole.hazard && <span className="text-xs text-red-600 dark:text-red-400">ハザード: {courseHole.hazard}</span>}
                  {courseHole.ob && <span className="text-xs text-orange-600 dark:text-orange-400">OB: {courseHole.ob}</span>}
                </div>
              )}
              {courseHole.description && (
                <p className="text-xs text-gray-500">{courseHole.description}</p>
              )}
            </div>
          )}

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
              <label className="flex items-center gap-1 text-xs font-bold text-gray-500 mb-1">
                リスクレベル
                <span className="relative group">
                  <Info className="h-3.5 w-3.5 text-gray-400 cursor-help" />
                  <span className="absolute left-full bottom-full mb-1 ml-1 hidden group-hover:block w-52 rounded-lg bg-gray-900 dark:bg-gray-700 text-white text-xs font-normal p-2 shadow-lg z-10 leading-relaxed">
                    <span className="text-emerald-400">低</span>: 普通に打てばOK（広いFW等）<br />
                    <span className="text-amber-400">中</span>: 注意が必要（片側OB等）<br />
                    <span className="text-rose-400">高</span>: 要警戒（両側OB、過去大叩き等）
                  </span>
                </span>
              </label>
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
        </div>
      )}
    </div>
  );
}
