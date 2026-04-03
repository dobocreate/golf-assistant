import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/auth-utils';
import type { AdviceContext } from '../types';
import type { StartingCourse } from '@/features/round/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * スナップショットからコンテキストテキストを取得、なければ構築してキャッシュする
 * 2回目以降のアドバイスリクエストでは1クエリで済む
 */
export async function getOrBuildContextSnapshot(
  roundId: string,
  userId: string,
): Promise<{ contextText: string; courseId: string } | null> {
  if (!UUID_RE.test(roundId)) return null;

  const supabase = await createClient();

  // snapshot + course_id + starting_course を1クエリで取得
  const { data: round } = await supabase
    .from('rounds')
    .select('course_id, context_snapshot, starting_course')
    .eq('id', roundId)
    .eq('user_id', userId)
    .single();

  if (!round) return null;

  // キャッシュヒット: snapshotがstring（フォーマット済みテキスト）ならそのまま返す
  if (typeof round.context_snapshot === 'string' && round.context_snapshot.length > 0) {
    return { contextText: round.context_snapshot, courseId: round.course_id };
  }

  // キャッシュミス: コンテキストを構築（course_id, starting_courseは取得済みなので渡す）
  const context = await buildAdviceContextInternal(roundId, userId, supabase, round.course_id, round.starting_course);
  if (!context) return null;

  const contextText = formatContextForPrompt(context);

  // snapshotに保存（失敗してもフォールバック）
  const { error } = await supabase
    .from('rounds')
    .update({ context_snapshot: contextText })
    .eq('id', roundId)
    .eq('user_id', userId);

  if (error) {
    console.error('context_snapshot save failed:', error.message);
  }

  return { contextText, courseId: round.course_id };
}

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
  return buildAdviceContextInternal(roundId, user.id, supabase);
}

async function buildAdviceContextInternal(
  roundId: string,
  userId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
  knownCourseId?: string,
  knownStartingCourse?: string,
): Promise<AdviceContext | null> {

  // course_idが未知の場合のみラウンド情報を取得
  let courseId = knownCourseId;
  let startingCourse: StartingCourse | null = (knownStartingCourse as StartingCourse) ?? null;
  if (!courseId) {
    const { data: round } = await supabase
      .from('rounds')
      .select('id, course_id, starting_course')
      .eq('id', roundId)
      .eq('user_id', userId)
      .single();

    if (!round) return null;
    courseId = round.course_id;
    startingCourse = round.starting_course as StartingCourse;
  }

  // まずプロファイルを取得（クラブ取得にprofile.idが必要）
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, handicap, play_style, miss_tendency, fatigue_note, favorite_shot, favorite_distance, situation_notes, shot_shape, score_level')
    .eq('user_id', userId)
    .single();

  // 残りを並列でデータ取得
  const [clubsResult, courseResult, holesResult, holeNotesResult, recentRoundsResult, knowledgeResult] = await Promise.all([
    // クラブ一覧
    profile?.id
      ? supabase
          .from('clubs')
          .select('name, distance, distance_half, success_rate, is_weak, confidence, note')
          .eq('profile_id', profile.id)
          .order('name')
      : Promise.resolve({ data: [], error: null }),

    // コース情報
    supabase
      .from('courses')
      .select('name, prefecture, address')
      .eq('id', courseId)
      .single(),

    // ホール情報
    supabase
      .from('holes')
      .select('hole_number, par, distance, hdcp, dogleg, elevation, hazard, ob, description')
      .eq('course_id', courseId)
      .order('hole_number'),

    // ホール別メモ（攻略法）
    supabase
      .from('hole_notes')
      .select('note, strategy, holes!inner(hole_number, course_id)')
      .eq('user_id', userId)
      .eq('holes.course_id', courseId),

    // 直近5ラウンドの傾向
    supabase
      .from('rounds')
      .select('played_at, total_score, courses(name)')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('played_at', { ascending: false })
      .limit(5),

    // ナレッジベース（最新20件に制限、練習法はプレー中除外）
    supabase
      .from('knowledge')
      .select('title, content, category, tags')
      .eq('user_id', userId)
      .or('category.is.null,category.neq.練習法')
      .order('updated_at', { ascending: false })
      .limit(20),
  ]);

  return {
    profile: profile ?? {},
    clubs: clubsResult.data ?? [],
    course: courseResult.data ?? {},
    holes: holesResult.data ?? [],
    hole_notes: holeNotesResult.data ?? [],
    recent_rounds: recentRoundsResult.data ?? [],
    knowledge: knowledgeResult.data ?? [],
    starting_course: startingCourse,
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
    if (p.shot_shape) {
      const shapeLabels: Record<string, string> = { straight: 'ストレート', draw: 'ドロー', fade: 'フェード' };
      lines.push(`- 持ち球: ${shapeLabels[p.shot_shape as string] ?? p.shot_shape}`);
    }
    if (p.score_level) {
      const levelLabels: Record<string, string> = { beginner: '120以上', intermediate: '100-119', advanced: '90-99', expert: '89以下' };
      lines.push(`- スコアレベル: ${levelLabels[p.score_level as string] ?? p.score_level}`);
    }
    sections.push(lines.join('\n'));
  }

  // クラブ
  if (context.clubs.length > 0) {
    const lines = ['## クラブ一覧'];
    for (const c of context.clubs as Record<string, unknown>[]) {
      const fullDist = Number(c.distance);
      const hasHalfDist = !!c.distance_half;
      const halfDist = hasHalfDist ? Number(c.distance_half) : (fullDist > 0 ? Math.round(fullDist * 0.7) : 0);
      const halfLabel = hasHalfDist ? `${halfDist}y` : `推定${halfDist}y`;
      let line = fullDist > 0
        ? `- ${c.name}: ${fullDist}y (6-7割: ${halfLabel})`
        : `- ${c.name}: 距離未設定`;
      if (c.success_rate !== null && c.success_rate !== undefined) line += ` 成功率${c.success_rate}/10`;
      if (c.is_weak) line += ' (苦手)';
      if (c.confidence && !c.success_rate) line += ` 自信度${c.confidence}/5`;
      if (c.note) line += ` — ${c.note}`;
      lines.push(line);
    }
    sections.push(lines.join('\n'));
  }

  // コース
  const course = context.course as Record<string, unknown>;
  if (course.name) {
    const STARTING_COURSE_LABELS: Record<string, string> = { out: 'OUTスタート', in: 'INスタート' };
    const startLabel = (context.starting_course && STARTING_COURSE_LABELS[context.starting_course]) ?? '';
    sections.push(`## コース\n${course.name}（${course.prefecture ?? ''}）${startLabel ? ` ${startLabel}` : ''}`);
  }

  // ホール情報
  if (context.holes.length > 0) {
    const lines = ['## ホール情報'];
    for (const h of context.holes as Record<string, unknown>[]) {
      let line = `- Hole ${h.hole_number}: Par${h.par}`;
      if (h.distance) line += ` ${h.distance}y`;
      if (h.hdcp) line += ` HDCP${h.hdcp}`;
      if (h.dogleg && h.dogleg !== 'straight') line += ` ${h.dogleg === 'left' ? '左ドッグレッグ' : '右ドッグレッグ'}`;
      if (h.elevation && h.elevation !== 'flat') line += ` ${h.elevation === 'uphill' ? '打ち上げ' : '打ち下ろし'}`;
      if (h.hazard) line += ` ハザード:${h.hazard}`;
      if (h.ob) line += ` OB:${h.ob}`;
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

  // ナレッジベース
  if (context.knowledge.length > 0) {
    const MAX_KNOWLEDGE_CONTENT = 500;
    const lines = ['## ナレッジベース（プレーヤーが蓄積した知識）'];
    for (const k of context.knowledge) {
      const tags = k.tags ?? [];
      const content = k.content ?? '';
      const truncated = content.length > MAX_KNOWLEDGE_CONTENT
        ? content.substring(0, MAX_KNOWLEDGE_CONTENT) + '…'
        : content;
      let line = `- ${k.title}`;
      if (k.category) line += `（${k.category}）`;
      if (tags.length > 0) line += ` [${tags.join(', ')}]`;
      line += `\n${truncated}`;
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
export async function buildScoreContext(roundId: string, userId?: string): Promise<string> {
  if (!UUID_RE.test(roundId)) return '';

  let resolvedUserId = userId;
  if (!resolvedUserId) {
    const user = await getAuthenticatedUser();
    if (!user) return '';
    resolvedUserId = user.id;
  }

  const supabase = await createClient();

  // ラウンドのコースIDを取得（所有権確認付き）
  const { data: round } = await supabase
    .from('rounds')
    .select('course_id')
    .eq('id', roundId)
    .eq('user_id', resolvedUserId)
    .single();

  if (!round) return '';

  // スコアとホール情報を並列取得
  const [scoresResult, holesResult] = await Promise.all([
    supabase
      .from('scores')
      .select('hole_number, strokes, putts, ob_count')
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

  // ダブルボギー以上の検出（メンタルリセット）
  let lastDoubleBogeyHole: number | null = null;
  for (const s of scores) {
    const par = parMap.get(s.hole_number) ?? 0;
    if (par > 0 && s.strokes >= par + 2) {
      lastDoubleBogeyHole = s.hole_number;
    }
  }

  // 直近3ホールのスコア傾向
  const recentScores = scores.slice(-3);
  let scoringTrend: 'struggling' | 'steady' | null = null;
  if (recentScores.length >= 3) {
    const recentAvgDiff = recentScores.reduce((sum, s) => {
      const par = parMap.get(s.hole_number) ?? 0;
      return sum + (s.strokes - par);
    }, 0) / recentScores.length;
    if (recentAvgDiff > 1) {
      scoringTrend = 'struggling';
    } else if (recentAvgDiff <= 0) {
      scoringTrend = 'steady';
    }
  }

  // 疲労・メンタル警告
  const warnings: string[] = [];
  if (lastHoleNumber >= 14) {
    warnings.push('終盤（14H以降）に入っています。疲労を考慮した安全なクラブ選択を推奨してください。');
  }
  if (consecutiveBogeys >= 2) {
    warnings.push(`直近${consecutiveBogeys}ホール連続でボギー以上です。メンタルリセットを促し、守りの戦略を推奨してください。`);
  }
  if (lastDoubleBogeyHole !== null && lastDoubleBogeyHole === lastHoleNumber) {
    warnings.push(`直前のHole ${lastDoubleBogeyHole}でダブルボギー以上でした。気持ちを切り替えて、次の一打に集中するようアドバイスしてください。`);
  }
  // OB累積検出
  const totalOB = scores.reduce((sum, s) => {
    const ob = (s as Record<string, unknown>).ob_count;
    return sum + (typeof ob === 'number' ? ob : 0);
  }, 0);
  if (totalOB >= 2) {
    warnings.push(`本日OB ${totalOB}回。OBはスコアに最も大きく響くため、確実にフェアウェイキープを最優先してください。番手を落としてでもOBを避ける戦略を推奨してください。`);
  }

  if (scoringTrend === 'struggling') {
    warnings.push('直近3ホールの平均がパー+1以上です。安全策を推奨し、スコアの立て直しを優先してください。');
  } else if (scoringTrend === 'steady') {
    warnings.push('直近3ホールはパー以下で安定しています。このリズムを維持することを最優先し、攻め過ぎを誘発しないでください。センター狙いの安定した戦略を推奨してください。');
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
