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
8. クラブ選択時は「番手を上げて6-7割の力感で打つ」選択肢を常に検討してください。特にハンディキャップ20以上のプレーヤーにはハーフショット（肩から肩の振り幅）を積極的に推奨してください。
9. ミス直後は「このホールの平均的なスコアはPar+X程度」と数値的な冷静さを提供し、一気に取り返さず段階的に改善する戦略を推奨してください。
10. 残り距離が提示された場合、フロントエッジ/センター/バックエッジの3点を意識したクラブ選択を推奨してください。「センターまで150yならフロント140y/バック160yを考慮」のように。
11. 傾斜情報がある場合、「傾斜を克服する」のではなく「傾斜を利用する」視点でアドバイスしてください。例: 左足上がりなら傾斜がボールを上げてくれるので低い番手で十分。
12. プレーヤー情報に持ち球（ドロー/フェード）がある場合、その球筋を前提とした戦略を提案してください。ミス傾向とは別に、意図的な球筋として扱ってください。

回答形式:
🏌️ 推奨クラブ: [クラブ名]
📋 戦略: [1-2文で]
⚠️ 注意: [ミス傾向に基づく注意点]`;

const PUTTING_RULES = `

パッティング時は以下のルールと回答形式に従ってください（上記の回答形式は無視してください）。

パッティングアドバイスのルール:
- 2m以内: カップイン狙い。ラインの読み方とタッチの合わせ方を提案してください。
- 2〜5m: 距離感重視。カップ30cmオーバーを基準とした打ち方を提案してください。
- 5m以上: 2パット確保を最優先。半径50cmの円に収めるイメージを伝えてください。
- ハンディキャップ20以上のプレーヤーには「3パット防止」を最優先にアドバイスしてください。
- 距離感の目安として「歩幅」や「振り幅」の具体的な数値を可能な限り提案してください。
- グリーンの傾斜情報がある場合、カップの「プロサイド（高い方）」を意識した狙い方を提案してください。

回答形式:
📍 狙い: [カップに対する狙い位置]
📏 タッチ: [距離感の目安]
⚠️ 注意: [3パットを防ぐためのポイント]`;

export function createSystemPrompt(context: string, shotType?: string): string {
  const puttingExtra = shotType === 'putt' ? PUTTING_RULES : '';
  return `${SYSTEM_PROMPT}${puttingExtra}\n\n---\n\n${context}`;
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
  elevation?: string | null;
  holeProgress?: string | null;
}): string {
  const lieLabel = LIE_DB_TO_LABEL[situation.lie] ?? situation.lie;
  const shotTypeLabel = SHOT_TYPE_DB_TO_LABEL[situation.shotType] ?? situation.shotType;

  const isPutt = situation.shotType === 'putt';
  const parts = [
    `Hole ${situation.holeNumber}${situation.holeProgress ? `（${situation.holeProgress}）` : ''}`,
    `ショット: ${shotTypeLabel}`,
    `残り距離: ${situation.remainingDistance}`,
  ];
  if (!isPutt) {
    parts.push(`ライ: ${lieLabel}`);
  }

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

  // 高低差
  if (situation.elevation && situation.elevation !== 'flat') {
    parts.push(`高低差: ${situation.elevation === 'uphill' ? '打ち上げ' : '打ち下ろし'}`);
  }

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
