import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { AdviceContext } from '../types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ラウンド開始時にAIアドバイス用コンテキストを構築する
 * - プロファイル（飛距離、ミス傾向等）
 * - クラブ一覧
 * - コース・ホール情報
 * - ホール別メモ（攻略法）
 * - 直近5ラウンドの傾向サマリー
 */
export async function buildAdviceContext(roundId: string): Promise<AdviceContext | null> {
  const user = await getAuthenticatedUser();
  if (!user || !UUID_RE.test(roundId)) return null;

  const supabase = await createClient();

  // ラウンド情報を取得
  const { data: round } = await supabase
    .from('rounds')
    .select('id, course_id')
    .eq('id', roundId)
    .eq('user_id', user.id)
    .single();

  if (!round) return null;

  // まずプロファイルを取得（クラブ取得にprofile.idが必要）
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, handicap, play_style, miss_tendency, fatigue_note, favorite_shot, favorite_distance, situation_notes')
    .eq('user_id', user.id)
    .single();

  // 残りを並列でデータ取得
  const [clubsResult, courseResult, holesResult, holeNotesResult, recentRoundsResult] = await Promise.all([
    // クラブ一覧
    profile?.id
      ? supabase
          .from('clubs')
          .select('name, distance, is_weak, confidence, note')
          .eq('profile_id', profile.id)
          .order('name')
      : Promise.resolve({ data: [], error: null }),

    // コース情報
    supabase
      .from('courses')
      .select('name, prefecture, address')
      .eq('id', round.course_id)
      .single(),

    // ホール情報
    supabase
      .from('holes')
      .select('hole_number, par, distance, description')
      .eq('course_id', round.course_id)
      .order('hole_number'),

    // ホール別メモ（攻略法）
    supabase
      .from('hole_notes')
      .select('note, strategy, holes!inner(hole_number, course_id)')
      .eq('user_id', user.id)
      .eq('holes.course_id', round.course_id),

    // 直近5ラウンドの傾向
    supabase
      .from('rounds')
      .select('played_at, total_score, courses(name)')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('played_at', { ascending: false })
      .limit(5),
  ]);

  return {
    profile: profile ?? {},
    clubs: clubsResult.data ?? [],
    course: courseResult.data ?? {},
    holes: holesResult.data ?? [],
    hole_notes: holeNotesResult.data ?? [],
    recent_rounds: recentRoundsResult.data ?? [],
  };
}

/**
 * コンテキストをトークン推定サイズ内に収める
 * 目安: 10,000トークン ≈ 約30,000文字（日本語）
 */
export function formatContextForPrompt(context: AdviceContext): string {
  const sections: string[] = [];

  // プロファイル
  const p = context.profile as Record<string, unknown>;
  if (Object.keys(p).length > 0) {
    const lines = ['## プレーヤー情報'];
    if (p.handicap) lines.push(`- ハンディキャップ: ${p.handicap}`);
    if (p.play_style) lines.push(`- プレースタイル: ${p.play_style}`);
    if (p.miss_tendency) lines.push(`- ミス傾向: ${p.miss_tendency}`);
    if (p.fatigue_note) lines.push(`- 疲労時の傾向: ${p.fatigue_note}`);
    if (p.favorite_shot) lines.push(`- 得意なショット: ${p.favorite_shot}`);
    if (p.favorite_distance) lines.push(`- 得意な距離帯: ${p.favorite_distance}`);
    if (p.situation_notes) lines.push(`- 状況別の傾向: ${p.situation_notes}`);
    sections.push(lines.join('\n'));
  }

  // クラブ
  if (context.clubs.length > 0) {
    const lines = ['## クラブ一覧'];
    for (const c of context.clubs as Record<string, unknown>[]) {
      let line = `- ${c.name}: ${c.distance}y`;
      if (c.is_weak) line += ' (苦手)';
      if (c.confidence) line += ` 自信度${c.confidence}/5`;
      if (c.note) line += ` — ${c.note}`;
      lines.push(line);
    }
    sections.push(lines.join('\n'));
  }

  // コース
  const course = context.course as Record<string, unknown>;
  if (course.name) {
    sections.push(`## コース\n${course.name}（${course.prefecture ?? ''}）`);
  }

  // ホール情報
  if (context.holes.length > 0) {
    const lines = ['## ホール情報'];
    for (const h of context.holes as Record<string, unknown>[]) {
      let line = `- Hole ${h.hole_number}: Par${h.par}`;
      if (h.distance) line += ` ${h.distance}y`;
      if (h.description) line += ` — ${h.description}`;
      lines.push(line);
    }
    sections.push(lines.join('\n'));
  }

  // ホール別メモ
  if (context.hole_notes.length > 0) {
    const lines = ['## ホール攻略メモ'];
    for (const hn of context.hole_notes as Record<string, unknown>[]) {
      const holes = hn.holes as Record<string, unknown>;
      let line = `- Hole ${holes.hole_number}:`;
      if (hn.strategy) line += ` 戦略: ${hn.strategy}`;
      if (hn.note) line += ` メモ: ${hn.note}`;
      lines.push(line);
    }
    sections.push(lines.join('\n'));
  }

  // 直近ラウンド
  if (context.recent_rounds.length > 0) {
    const lines = ['## 直近ラウンド'];
    for (const r of context.recent_rounds as Record<string, unknown>[]) {
      const courseName = ((r.courses as unknown) as { name: string } | null)?.name ?? '';
      lines.push(`- ${r.played_at} ${courseName}: ${r.total_score ?? '未完了'}`);
    }
    sections.push(lines.join('\n'));
  }

  const fullContext = sections.join('\n\n');

  // 約10,000トークンに相当
  const MAX_CONTEXT_LENGTH = 30000;
  if (fullContext.length > MAX_CONTEXT_LENGTH) {
    return fullContext.substring(0, MAX_CONTEXT_LENGTH) + '\n\n（コンテキストが長いため一部省略）';
  }
  return fullContext;
}

/**
 * 当日のスコア推移コンテキストを構築する
 * - 各ホールのスコアとパーとの差分
 * - 疲労・連続ボギー検出による警告ノート
 */
export async function buildScoreContext(roundId: string): Promise<string> {
  if (!UUID_RE.test(roundId)) return '';

  const supabase = await createClient();

  // ラウンドのコースIDを取得
  const { data: round } = await supabase
    .from('rounds')
    .select('course_id')
    .eq('id', roundId)
    .single();

  if (!round) return '';

  // スコアとホール情報を並列取得
  const [scoresResult, holesResult] = await Promise.all([
    supabase
      .from('scores')
      .select('hole_number, strokes, putts')
      .eq('round_id', roundId)
      .order('hole_number'),
    supabase
      .from('holes')
      .select('hole_number, par')
      .eq('course_id', round.course_id)
      .order('hole_number'),
  ]);

  const scores = scoresResult.data ?? [];
  const holes = holesResult.data ?? [];

  if (scores.length === 0) return '';

  const parMap = new Map(holes.map(h => [h.hole_number, h.par as number]));

  const lines = ['## 当日のスコア推移'];
  let totalStrokes = 0;
  let totalPar = 0;
  let consecutiveBogeys = 0;
  const lastHoleNumber = Math.max(...scores.map(s => s.hole_number));

  for (const s of scores) {
    const par = parMap.get(s.hole_number) ?? 0;
    const diff = s.strokes - par;
    const diffStr = diff > 0 ? `+${diff}` : diff === 0 ? 'E' : `${diff}`;
    let line = `- Hole ${s.hole_number}: ${s.strokes}打 (Par${par}, ${diffStr})`;
    if (s.putts !== null) line += ` パット${s.putts}`;
    lines.push(line);
    totalStrokes += s.strokes;
    totalPar += par;

    // 連続ボギー以上の検出
    if (diff >= 1) {
      consecutiveBogeys++;
    } else {
      consecutiveBogeys = 0;
    }
  }

  const totalDiff = totalStrokes - totalPar;
  const totalDiffStr = totalDiff > 0 ? `+${totalDiff}` : totalDiff === 0 ? 'E' : `${totalDiff}`;
  lines.push(`- 合計: ${totalStrokes}打 (${totalDiffStr}) / ${scores.length}ホール消化`);

  // 疲労・メンタル警告
  const warnings: string[] = [];
  if (lastHoleNumber >= 14) {
    warnings.push('終盤（14H以降）に入っています。疲労を考慮した安全なクラブ選択を推奨してください。');
  }
  if (consecutiveBogeys >= 2) {
    warnings.push(`直近${consecutiveBogeys}ホール連続でボギー以上です。メンタルリセットを促し、守りの戦略を推奨してください。`);
  }

  if (warnings.length > 0) {
    lines.push('');
    lines.push('### 注意事項');
    for (const w of warnings) {
      lines.push(`- ${w}`);
    }
  }

  return lines.join('\n');
}
