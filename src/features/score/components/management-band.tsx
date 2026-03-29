'use client';

import { useState, useMemo } from 'react';
import { AlertTriangle, ClipboardList, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
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
  onAdviceTap?: (context: ManagementBandContext) => void;
}

type Tone = 'normal' | 'attack' | 'defense';

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
): ToneInfo | null {
  if (!targetScore) return null;

  const currentIdx = holeOrder.indexOf(currentHole);
  if (currentIdx === -1) return null;

  const completedHoles = holeOrder.slice(0, currentIdx);
  let actualTotal = 0;
  let targetTotal = 0;
  const planMap = new Map(gamePlans.map(p => [p.hole_number, p]));

  for (const h of completedHoles) {
    const s = scores.get(h);
    if (s?.strokes) actualTotal += s.strokes;
    const plan = planMap.get(h);
    if (plan?.target_strokes) {
      targetTotal += plan.target_strokes;
    } else {
      // 目標打数未設定のホールはスキップ（差分計算に含めない）
      const s2 = scores.get(h);
      if (s2?.strokes) targetTotal += s2.strokes;
    }
  }

  const diff = actualTotal - targetTotal;
  const remainingHoles = holeOrder.length - currentIdx;
  const remainingTarget = targetScore - actualTotal;
  const paceText = `残り${remainingHoles}Hで${remainingTarget}打`;

  let tone: Tone;
  let label: string;
  if (diff <= -1) {
    tone = 'attack';
    label = `攻めチャンス（目標より${Math.abs(diff)}打良い）`;
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
  onAdviceTap,
}: ManagementBandProps) {
  const [collapsed, setCollapsed] = useState(false);

  const plan = useMemo(
    () => gamePlans.find(p => p.hole_number === currentHole),
    [gamePlans, currentHole],
  );

  const toneInfo = useMemo(
    () => calculateTone(scores, gamePlans, targetScore, currentHole, holeOrder),
    [scores, gamePlans, targetScore, currentHole, holeOrder],
  );

  if (!plan) return null;

  const riskTone: Tone = plan.risk_level === 'high' ? 'defense' : plan.risk_level === 'medium' ? 'attack' : 'normal';
  const riskStyle = TONE_STYLES[riskTone];
  const toneStyle = toneInfo ? TONE_STYLES[toneInfo.tone] : null;

  const handleAdviceTap = () => {
    onAdviceTap?.({
      planText: plan.plan_text,
      alertText: plan.alert_text,
      tone: toneInfo?.tone ?? null,
      toneLabel: toneInfo?.label ?? null,
    });
  };

  // 折りたたみ時: トーン色帯のみ表示
  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className={`w-full rounded-lg border border-gray-700 px-3 py-2 flex items-center justify-between transition-all duration-200 ${toneStyle?.bg ?? riskStyle.bg}`}
        aria-label="マネジメントバンドを展開"
      >
        <p className={`text-sm font-semibold ${toneStyle?.text ?? riskStyle.text}`}>
          {toneInfo ? `${toneStyle!.icon} ${toneInfo.label}` : plan.alert_text?.slice(0, 20) ?? 'プラン'}
        </p>
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>
    );
  }

  return (
    <div
      className={`rounded-lg border border-gray-700 p-3 space-y-1.5 transition-colors duration-300 ${toneStyle?.bg ?? riskStyle.bg}`}
      role="status"
      aria-live="polite"
    >
      {/* 折りたたみボタン */}
      <button
        onClick={() => setCollapsed(true)}
        className="w-full flex items-center justify-end"
        aria-label="マネジメントバンドを折りたたむ"
      >
        <ChevronUp className="h-4 w-4 text-gray-400" />
      </button>

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

      {/* 動的トーン + ペース */}
      {toneInfo && toneStyle && (
        <div className="flex items-center justify-between">
          <p className={`text-sm font-semibold ${toneStyle.text}`}>
            {toneStyle.icon} {toneInfo.label}
          </p>
          <p className="text-xs text-gray-400">{toneInfo.paceText}</p>
        </div>
      )}

      {/* AIに相談ボタン */}
      <button
        onClick={handleAdviceTap}
        className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg bg-gray-800/60 hover:bg-gray-700/60 text-sm text-gray-300 hover:text-white transition-colors"
      >
        <MessageCircle className="h-4 w-4" />
        AIに相談
      </button>
    </div>
  );
}
