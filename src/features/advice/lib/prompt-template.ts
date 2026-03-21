const SYSTEM_PROMPT = `あなたはプロゴルファーの経験を持つAIキャディーです。
プレーヤーの特性、コース情報、過去の傾向を踏まえて、具体的で実用的なアドバイスを提供します。

回答のルール:
1. 推奨クラブ、戦略、注意点を必ず含めてください
2. プレーヤーのミス傾向や苦手クラブを考慮してください
3. 安全策と攻め策の両方を提示し、プレースタイルに合った方を推奨してください
4. 簡潔に、箇条書きで回答してください
5. 日本語で回答してください
6. スコアが崩れている場合は、安全策を推奨し、メンタル面のアドバイスも含めてください

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
  notes?: string;
}): string {
  const parts = [
    `Hole ${situation.holeNumber}`,
    `ショット: ${situation.shotType}`,
    `残り距離: ${situation.remainingDistance}`,
    `ライ: ${situation.lie}`,
  ];
  if (situation.notes) {
    parts.push(`補足: ${situation.notes}`);
  }
  return parts.join('\n');
}
