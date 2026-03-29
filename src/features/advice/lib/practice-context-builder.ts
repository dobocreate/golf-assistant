import { createClient } from '@/lib/supabase/server';

/**
 * ラウンド後の練習提案用コンテキストを構築する
 * - ラウンド基本情報、スコア、ショット記録、メモ、プロファイル
 * - ナレッジは「練習法」カテゴリのみ取得
 */
export async function buildPracticeContext(
  roundId: string,
  userId: string,
): Promise<string | null> {
  const supabase = await createClient();

  // ラウンド基本情報（course_idも取得）
  const { data: round } = await supabase
    .from('rounds')
    .select('course_id, played_at, total_score, weather, wind, review_note, courses(name, prefecture)')
    .eq('id', roundId)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .single();

  if (!round) return null;

  // プロファイル取得
  const { data: profile } = await supabase
    .from('profiles')
    .select('handicap, play_style, miss_tendency')
    .eq('user_id', userId)
    .single();

  // 残りを並列取得
  const [scoresResult, shotsResult, memosResult, holesResult, knowledgeResult] = await Promise.all([
    supabase
      .from('scores')
      .select('hole_number, strokes, putts, fairway_hit, green_in_reg, first_putt_distance_m')
      .eq('round_id', roundId)
      .order('hole_number'),
    supabase
      .from('shots')
      .select('hole_number, club, result, miss_type, direction_lr')
      .eq('round_id', roundId)
      .order('hole_number'),
    supabase
      .from('memos')
      .select('hole_number, content')
      .eq('round_id', roundId)
      .order('hole_number'),
    supabase
      .from('holes')
      .select('hole_number, par')
      .eq('course_id', round.course_id)
      .order('hole_number'),
    // ナレッジ（練習法カテゴリのみ）
    supabase
      .from('knowledge')
      .select('title, content, category, tags')
      .eq('user_id', userId)
      .eq('category', '練習法')
      .order('updated_at', { ascending: false })
      .limit(10),
  ]);

  const holes = holesResult.data ?? [];

  const scores = scoresResult.data ?? [];
  const shots = shotsResult.data ?? [];
  const memos = memosResult.data ?? [];
  const knowledge = knowledgeResult.data ?? [];
  const parMap = new Map(holes.map(h => [h.hole_number, h.par]));

  const sections: string[] = [];

  // プレーヤー情報
  if (profile) {
    const lines = ['## プレーヤー情報'];
    if (profile.handicap) lines.push(`- ハンディキャップ: ${profile.handicap}`);
    if (profile.play_style) lines.push(`- プレースタイル: ${profile.play_style}`);
    if (profile.miss_tendency) lines.push(`- ミス傾向: ${profile.miss_tendency}`);
    sections.push(lines.join('\n'));
  }

  // ラウンド情報
  const courseName = (round.courses as unknown as { name: string } | null)?.name ?? '不明';
  const lines = ['## ラウンド情報'];
  lines.push(`- コース: ${courseName}`);
  lines.push(`- プレー日: ${round.played_at}`);
  if (round.total_score) lines.push(`- 合計スコア: ${round.total_score}`);
  if (round.weather) lines.push(`- 天候: ${round.weather}`);
  if (round.wind) lines.push(`- 風: ${round.wind}`);
  sections.push(lines.join('\n'));

  // スコア詳細
  if (scores.length > 0) {
    const scoreLines = ['## スコア詳細'];
    let totalStrokes = 0;
    let totalPar = 0;
    for (const s of scores) {
      const par = parMap.get(s.hole_number) ?? 0;
      const diff = s.strokes - par;
      const diffStr = diff > 0 ? `+${diff}` : diff === 0 ? 'E' : `${diff}`;
      let line = `- Hole ${s.hole_number}: ${s.strokes}打 (Par${par}, ${diffStr})`;
      if (s.putts !== null) line += ` パット${s.putts}`;
      if (s.fairway_hit !== null) line += ` FW:${s.fairway_hit ? 'o' : 'x'}`;
      if (s.green_in_reg !== null) line += ` GIR:${s.green_in_reg ? 'o' : 'x'}`;
      scoreLines.push(line);
      totalStrokes += s.strokes;
      totalPar += par;
    }
    // 統計
    const fwHits = scores.filter(s => s.fairway_hit === true).length;
    const fwTotal = scores.filter(s => s.fairway_hit !== null).length;
    const girHits = scores.filter(s => s.green_in_reg === true).length;
    const girTotal = scores.filter(s => s.green_in_reg !== null).length;
    const totalPutts = scores.reduce((sum, s) => sum + (s.putts ?? 0), 0);
    const puttsCount = scores.filter(s => s.putts !== null).length;

    scoreLines.push('');
    scoreLines.push('### 統計サマリー');
    scoreLines.push(`- 合計: ${totalStrokes}打 (${totalStrokes - totalPar >= 0 ? '+' : ''}${totalStrokes - totalPar})`);
    if (fwTotal > 0) scoreLines.push(`- FWキープ率: ${Math.round((fwHits / fwTotal) * 100)}% (${fwHits}/${fwTotal})`);
    if (girTotal > 0) scoreLines.push(`- パーオン率: ${Math.round((girHits / girTotal) * 100)}% (${girHits}/${girTotal})`);
    if (puttsCount > 0) scoreLines.push(`- 平均パット: ${(totalPutts / puttsCount).toFixed(1)} (計${totalPutts})`);

    // ダブルボギー以上のホール
    const doubleBogeys = scores.filter(s => {
      const par = parMap.get(s.hole_number) ?? 0;
      return par > 0 && s.strokes >= par + 2;
    });
    if (doubleBogeys.length > 0) {
      scoreLines.push(`- ダブルボギー以上: ${doubleBogeys.map(s => `Hole${s.hole_number}`).join(', ')}`);
    }

    // 3パット
    const threePutts = scores.filter(s => (s.putts ?? 0) >= 3);
    if (threePutts.length > 0) {
      scoreLines.push(`- 3パット以上: ${threePutts.map(s => `Hole${s.hole_number}`).join(', ')}`);
    }

    sections.push(scoreLines.join('\n'));
  }

  // ショット記録（ミス傾向集計）
  if (shots.length > 0) {
    const shotLines = ['## ショット記録（ミス傾向）'];
    const missTypes: Record<string, number> = {};
    const directionCounts: Record<string, number> = {};
    for (const s of shots) {
      if (s.miss_type) missTypes[s.miss_type] = (missTypes[s.miss_type] ?? 0) + 1;
      if (s.direction_lr) directionCounts[s.direction_lr] = (directionCounts[s.direction_lr] ?? 0) + 1;
    }
    if (Object.keys(missTypes).length > 0) {
      shotLines.push('- ミスタイプ: ' + Object.entries(missTypes).map(([k, v]) => `${k}(${v}回)`).join(', '));
    }
    if (Object.keys(directionCounts).length > 0) {
      shotLines.push('- 方向: ' + Object.entries(directionCounts).map(([k, v]) => `${k}(${v}回)`).join(', '));
    }
    sections.push(shotLines.join('\n'));
  }

  // メモ
  if (memos.length > 0) {
    const memoLines = ['## ホール別メモ'];
    for (const m of memos) {
      memoLines.push(`- Hole ${m.hole_number}: ${m.content}`);
    }
    sections.push(memoLines.join('\n'));
  }

  // 総括（ユーザーの課題感）
  if (round.review_note) {
    sections.push(`## プレーヤーの総括（課題感）\n${round.review_note}`);
  }

  // 練習法ナレッジ
  if (knowledge.length > 0) {
    const knLines = ['## 練習法ナレッジ（プレーヤーが登録した練習メニュー）'];
    for (const k of knowledge) {
      const content = String(k.content ?? '');
      const truncated = content.length > 800 ? content.substring(0, 800) + '…' : content;
      let line = `### ${k.title}`;
      if (k.tags && (k.tags as string[]).length > 0) line += ` [${(k.tags as string[]).join(', ')}]`;
      line += `\n${truncated}`;
      knLines.push(line);
    }
    sections.push(knLines.join('\n\n'));
  }

  return sections.join('\n\n');
}
