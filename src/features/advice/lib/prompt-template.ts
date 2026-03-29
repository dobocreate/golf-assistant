import { LIE_DB_TO_LABEL, SLOPE_FB_DB_TO_LABEL, SLOPE_LR_DB_TO_LABEL, SHOT_TYPE_DB_TO_LABEL } from '@/lib/golf-constants';
import { WIND_DIRECTION_LABELS, WIND_STRENGTH_LABELS, WEATHER_LABELS } from '@/features/round/types';
import type { WindDirection, WindStrength, Weather } from '@/features/round/types';

export const MAX_ADVICE_CHARACTERS = 1000;
export const MAX_ADVICE_TOKENS = 1024;

const SYSTEM_PROMPT = `あなたはプロゴルファーの経験を持つAIキャディーです。
プレーヤーの特性、コース情報、過去の傾向を踏まえて、具体的で実用的なアドバイスを提供します。

回答のルール:
1. 推奨クラブ、戦略、注意点を必ず含めてください
2. プレーヤーのミス傾向や苦手クラブを考慮してください
3. 安全策と攻め策の両方を提示し、プレースタイルに合った方を推奨してください
4. 簡潔に、箇条書きで回答してください
5. 日本語で回答してください
6. スコアが崩れている場合は、安全策を推奨し、メンタル面のアドバイスも含めてください
7. 回答は${MAX_ADVICE_CHARACTERS}文字以内に収めてください

回答形式:
🏌️ 推奨クラブ: [クラブ名]
📋 戦略: [1-2文で]
⚠️ 注意: [ミス傾向に基づく注意点]`;

export function createSystemPrompt(context: string): string {
  return `${SYSTEM_PROMPT}\n\n---\n\n${context}`;
}

export function createUserPrompt(situation: {
  holeNumber: number;
  shotType: string;
  remainingDistance: string;
  lie: string;
  slopeFB?: string | null;
  slopeLR?: string | null;
  notes?: string;
  windDirection?: string | null;
  windStrength?: string | null;
  weather?: string | null;
}): string {
  const lieLabel = LIE_DB_TO_LABEL[situation.lie] ?? situation.lie;
  const shotTypeLabel = SHOT_TYPE_DB_TO_LABEL[situation.shotType] ?? situation.shotType;

  const parts = [
    `Hole ${situation.holeNumber}`,
    `ショット: ${shotTypeLabel}`,
    `残り距離: ${situation.remainingDistance}`,
    `ライ: ${lieLabel}`,
  ];

  const slopes: string[] = [];
  if (situation.slopeFB) {
    const label = SLOPE_FB_DB_TO_LABEL[situation.slopeFB];
    if (label) slopes.push(label);
  }
  if (situation.slopeLR) {
    const label = SLOPE_LR_DB_TO_LABEL[situation.slopeLR];
    if (label) slopes.push(label);
  }
  if (slopes.length > 0) parts.push(`傾斜: ${slopes.join('・')}`);

  // 風
  const windParts: string[] = [];
  if (situation.windDirection) {
    const label = WIND_DIRECTION_LABELS[situation.windDirection as WindDirection];
    if (label) windParts.push(label);
  }
  if (situation.windStrength) {
    const label = WIND_STRENGTH_LABELS[situation.windStrength as WindStrength];
    if (label) windParts.push(label);
  }
  if (windParts.length > 0) parts.push(`風: ${windParts.join('・')}`);

  // 天候
  if (situation.weather) {
    const label = WEATHER_LABELS[situation.weather as Weather];
    if (label) parts.push(`天候: ${label}`);
  }

  if (situation.notes) {
    parts.push(`補足: ${situation.notes}`);
  }
  return parts.join('\n');
}
