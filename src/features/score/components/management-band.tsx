'use client';

import { useState, useMemo } from 'react';
import { AlertTriangle, ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';
import type { GamePlan } from '@/features/game-plan/types';
import { RISK_LEVEL_LABELS } from '@/features/game-plan/types';
import type { Score } from '@/features/score/types';

export interface ManagementBandContext {
  planText: string | null;
  alertText: string | null;
  tone: Tone | null;
  toneLabel: string | null;
}

interface ManagementBandProps {
  gamePlans: GamePlan[];
  currentHole: number;
  scores: Map<number, Score>;
  targetScore: number | null;
  holeOrder: number[];
  scoreLevel?: string | null;
  handicap?: number | null;
  totalOBCount?: number;
}

type Tone = 'normal' | 'attack' | 'defense';

const OB_WARNING_THRESHOLD = 2;

interface ToneInfo {
  tone: Tone;
  label: string;
  diff: number;
  remainingHoles: number;
  paceText: string;
}

function calculateTone(
  scores: Map<number, Score>,
  gamePlans: GamePlan[],
  targetScore: number | null,
  currentHole: number,
  holeOrder: number[],
  scoreLevel?: string | null,
): ToneInfo | null {
  if (!targetScore) return null;

  const currentIdx = holeOrder.indexOf(currentHole);
  if (currentIdx === -1) return null;

  const previousHoles = holeOrder.slice(0, currentIdx);
  let actualTotal = 0;
  let targetTotal = 0;
  let scoredHoles = 0;
  const planMap = new Map(gamePlans.map(p => [p.hole_number, p]));

  for (const h of previousHoles) {
    const s = scores.get(h);
    if (!s?.strokes) continue; // スコア未入力のホールはスキップ
    scoredHoles++;
    actualTotal += s.strokes;
    const plan = planMap.get(h);
    if (plan?.target_strokes) {
      targetTotal += plan.target_strokes;
    } else {
      targetTotal += s.strokes; // 目標未設定はイーブン扱い
    }
  }

  if (scoredHoles === 0) return null; // スコア入力なしではトーン非表示

  const diff = actualTotal - targetTotal;
  const remainingHoles = holeOrder.length - scoredHoles;
  const remainingTarget = targetScore - actualTotal;
  const paceText = `残り${remainingHoles}Hで${remainingTarget}打`;

  let tone: Tone;
  let label: string;
  if (diff <= -1) {
    const absDiff = Math.abs(diff);
    switch (scoreLevel) {
      case 'beginner':
      case 'intermediate':
        tone = 'normal';
        label = `好調維持（目標より${absDiff}打良い）。このペースを守りましょう`;
        break;
      case 'advanced':
        if (diff <= -2) {
          tone = 'attack';
          label = `攻めチャンス（目標より${absDiff}打良い）`;
        } else {
          tone = 'normal';
          label = `好調（目標より${absDiff}打良い）`;
        }
        break;
      case 'expert':
        tone = 'attack';
        label = `攻めチャンス（目標より${absDiff}打良い）`;
        break;
      default:
        // 未設定: 安全側に倒す
        tone = 'normal';
        label = `好調（目標より${absDiff}打良い）`;
        break;
    }
  } else if (diff >= 2) {
    tone = 'defense';
    label = `守り重視（目標より+${diff}打）`;
  } else {
    tone = 'normal';
    label = diff === 0 ? '通常（目標ペース）' : `通常（目標より${diff > 0 ? '+' : ''}${diff}打）`;
  }

  return { tone, label, diff, remainingHoles, paceText };
}

const TONE_STYLES: Record<Tone, { bg: string; text: string; icon: string }> = {
  normal: { bg: 'bg-emerald-900/30', text: 'text-emerald-300', icon: '🟢' },
  attack: { bg: 'bg-amber-900/30', text: 'text-amber-300', icon: '🟡' },
  defense: { bg: 'bg-rose-900/30', text: 'text-rose-300', icon: '🔴' },
};

export function ManagementBand({
  gamePlans,
  currentHole,
  scores,
  targetScore,
  holeOrder,
  scoreLevel,
  handicap,
  totalOBCount = 0,
}: ManagementBandProps) {
  const [collapsed, setCollapsed] = useState(false);

  const plan = useMemo(
    () => gamePlans.find(p => p.hole_number === currentHole),
    [gamePlans, currentHole],
  );

  const toneInfo = useMemo(
    () => calculateTone(scores, gamePlans, targetScore, currentHole, holeOrder, scoreLevel),
    [scores, gamePlans, targetScore, currentHole, holeOrder, scoreLevel],
  );

  // 平均パーの計算（HC / 18 でホール当たりの追加打数を算出）
  const avgPar = useMemo(() => {
    if (!handicap || handicap <= 0) return null;
    if (!plan?.target_strokes) return null;
    const hcPerHole = handicap / 18;
    return (plan.target_strokes + hcPerHole).toFixed(1);
  }, [handicap, plan]);

  if (!plan) return null;

  const riskTone: Tone = plan.risk_level === 'high' ? 'defense' : plan.risk_level === 'medium' ? 'attack' : 'normal';
  const riskStyle = TONE_STYLES[riskTone];
  const toneStyle = toneInfo ? TONE_STYLES[toneInfo.tone] : null;

  return (
    <div
      className={`rounded-lg border border-gray-700 p-3 space-y-1.5 transition-colors duration-300 ${toneStyle?.bg ?? riskStyle.bg}`}
      role="status"
      aria-live="polite"
    >
      {/* トーン行（常に表示、タップで開閉） */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between"
      >
        <p className={`text-sm font-semibold ${toneStyle?.text ?? riskStyle.text}`}>
          {toneInfo && toneStyle ? `${toneStyle.icon} ${toneInfo.label}` : plan.alert_text?.slice(0, 25) ?? 'プラン'}
        </p>
        <div className="flex items-center gap-2">
          {toneInfo && <span className="text-xs text-gray-400">{toneInfo.paceText}</span>}
          {collapsed ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronUp className="h-4 w-4 text-gray-400" />}
        </div>
      </button>

      {/* 詳細（展開時のみ） */}
      {!collapsed && (
        <>
          {/* 弱点アラート */}
          {plan.alert_text && (
            <div className="flex items-start gap-2">
              <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${riskStyle.text}`} />
              <p className="text-base font-bold text-gray-100 leading-snug">
                {plan.alert_text}
                {plan.risk_level && (
                  <span className={`ml-2 text-xs font-normal ${riskStyle.text}`}>
                    ({RISK_LEVEL_LABELS[plan.risk_level]})
                  </span>
                )}
              </p>
            </div>
          )}

          {/* ゲームプラン */}
          {plan.plan_text && (
            <div className="flex items-start gap-2">
              <ClipboardList className="h-4 w-4 mt-0.5 shrink-0 text-gray-400" />
              <p className="text-sm text-gray-300 leading-snug">{plan.plan_text}</p>
            </div>
          )}

          {/* 平均パー表示 */}
          {avgPar && (
            <p className="text-xs text-gray-500 pl-6">HC換算目安: {avgPar}打</p>
          )}
        </>
      )}

      {/* OB累積警告 */}
      {totalOBCount >= OB_WARNING_THRESHOLD && (
        <p className="text-xs font-medium text-rose-400 px-1 pt-1">
          ⚠️ 本日OB {totalOBCount}回。フェアウェイキープを最優先
        </p>
      )}
    </div>
  );
}
