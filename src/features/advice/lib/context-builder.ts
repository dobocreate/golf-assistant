import { db, type PoolClient } from '@/lib/db/neon';
import type { AdviceContext } from '../types';
import type { StartingCourse } from '@/features/round/types';
import { SHOT_SHAPES, SCORE_LEVELS } from '@/features/profile/types';
import type { HoleArea, HoleMapPoint } from '@/lib/geo';
import { calcDistanceToPolygon } from '@/lib/geo';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const shapeLabels = Object.fromEntries(SHOT_SHAPES.map(({ value, label }) => [value, label]));
const levelLabels = Object.fromEntries(SCORE_LEVELS.map(({ value, label }) => [value, label]));

/**
 * スナップショットからコンテキストテキストを取得、なければ構築してキャッシュする。
 * 2 回目以降のアドバイスリクエストでは 1 クエリで済む。
 *
 * 呼び出し側で `requireUser()` のコンテキストが必要。
 */
export async function getOrBuildContextSnapshot(
  roundId: string,
): Promise<{ contextText: string; courseId: string; startingCourse: string | null } | null> {
  if (!UUID_RE.test(roundId)) return null;

  // 読みは userRead、cache 書き込みのみ transaction
  const round = await db.userRead(async (client) => {
    const r = await client.query<{
      course_id: string;
      context_snapshot: unknown;
      starting_course: string | null;
      active_green: 'A' | 'B' | null;
    }>(
      `SELECT course_id, context_snapshot, starting_course, active_green
         FROM rounds
        WHERE id = $1 AND user_id = current_user_id()::uuid`,
      [roundId],
    );
    return r.rows[0] ?? null;
  });
  if (!round) return null;

  // キャッシュヒット
  if (typeof round.context_snapshot === 'string' && round.context_snapshot.length > 0) {
    return {
      contextText: round.context_snapshot,
      courseId: round.course_id,
      startingCourse: round.starting_course,
    };
  }

  // キャッシュミス: コンテキストを構築
  const context = await db.userRead(async (client) => {
    return buildAdviceContextInternal(
      client,
      roundId,
      round.course_id,
      round.starting_course,
      round.active_green,
    );
  });
  if (!context) return null;

  const contextText = formatContextForPrompt(context);

  // snapshot に保存 (失敗してもフォールバック)
  try {
    await db.transaction(async (client) => {
      await client.query(
        `UPDATE rounds SET context_snapshot = $2
          WHERE id = $1 AND user_id = current_user_id()::uuid`,
        [roundId, contextText],
      );
    });
  } catch (err) {
    console.error('context_snapshot save failed:', err);
  }

  return { contextText, courseId: round.course_id, startingCourse: round.starting_course };
}

/**
 * ラウンド開始時に AI アドバイス用コンテキストを構築する。
 *
 * 呼び出し側で `requireUser()` のコンテキストが必要。
 */
export async function buildAdviceContext(roundId: string): Promise<AdviceContext | null> {
  if (!UUID_RE.test(roundId)) return null;
  return db.userRead(async (client) => {
    return buildAdviceContextInternal(client, roundId);
  });
}

async function buildAdviceContextInternal(
  client: PoolClient,
  roundId: string,
  knownCourseId?: string,
  knownStartingCourse?: string | null,
  knownActiveGreen?: 'A' | 'B' | null,
): Promise<AdviceContext | null> {
  let courseId = knownCourseId;
  let startingCourse: StartingCourse | null = (knownStartingCourse as StartingCourse | null) ?? null;
  let activeGreen: 'A' | 'B' | null = knownActiveGreen ?? null;

  if (!courseId) {
    const r = await client.query<{
      course_id: string;
      starting_course: string | null;
      active_green: 'A' | 'B' | null;
    }>(
      `SELECT course_id, starting_course, active_green
         FROM rounds
        WHERE id = $1 AND user_id = current_user_id()::uuid`,
      [roundId],
    );
    if (r.rowCount === 0) return null;
    courseId = r.rows[0].course_id;
    startingCourse = (r.rows[0].starting_course as StartingCourse | null) ?? null;
    activeGreen = r.rows[0].active_green ?? null;
  }

  const profileR = await client.query<{
    id: string;
    handicap: number | null;
    play_style: string | null;
    miss_tendency: string | null;
    fatigue_note: string | null;
    favorite_shot: string | null;
    favorite_distance: string | null;
    situation_notes: string | null;
    shot_shape: string | null;
    score_level: string | null;
  }>(
    `SELECT id, handicap, play_style, miss_tendency, fatigue_note, favorite_shot,
            favorite_distance, situation_notes, shot_shape, score_level
       FROM profiles
      WHERE user_id = current_user_id()::uuid`,
  );
  const profile = profileR.rows[0];

  const [clubsR, courseR, holesR, holeNotesR, recentRoundsR, knowledgeR, holeAreasR, mapPointsR] =
    await Promise.all([
      profile?.id
        ? client.query(
            `SELECT name, distance, distance_half, success_rate, is_weak, confidence, note
               FROM clubs
              WHERE profile_id = $1
              ORDER BY name`,
            [profile.id],
          )
        : Promise.resolve({ rows: [] as Record<string, unknown>[] }),

      client.query(
        'SELECT name, prefecture, address FROM courses WHERE id = $1',
        [courseId],
      ),

      client.query(
        `SELECT id, hole_number, par, distance, hdcp, dogleg, elevation, hazard, ob, description
           FROM holes
          WHERE course_id = $1
          ORDER BY hole_number`,
        [courseId],
      ),

      client.query(
        `SELECT hn.note, hn.strategy, h.hole_number, h.course_id
           FROM hole_notes hn
           JOIN holes h ON h.id = hn.hole_id
          WHERE hn.user_id = current_user_id()::uuid
            AND h.course_id = $1`,
        [courseId],
      ),

      client.query(
        `SELECT r.played_at, r.total_score, c.name AS course_name
           FROM rounds r
           LEFT JOIN courses c ON c.id = r.course_id
          WHERE r.user_id = current_user_id()::uuid
            AND r.status = 'completed'
          ORDER BY r.played_at DESC
          LIMIT 5`,
      ),

      client.query(
        `SELECT title, content, category, tags
           FROM knowledge
          WHERE user_id = current_user_id()::uuid
          ORDER BY updated_at DESC
          LIMIT 100`,
      ),

      client.query<HoleArea>(
        `SELECT ha.*
           FROM hole_areas ha
           JOIN holes h ON h.id = ha.hole_id
          WHERE h.course_id = $1
          ORDER BY ha.sort_order`,
        [courseId],
      ),

      client.query<HoleMapPoint>(
        `SELECT mp.*
           FROM hole_map_points mp
           JOIN holes h ON h.id = mp.hole_id
          WHERE h.course_id = $1
          ORDER BY h.hole_number, mp.sort_order`,
        [courseId],
      ),
    ]);

  // hole_notes の元の shape (.holes.hole_number) に合わせて変換
  const holeNotes = holeNotesR.rows.map(
    (row: Record<string, unknown>) =>
      ({
        note: row.note,
        strategy: row.strategy,
        holes: { hole_number: row.hole_number, course_id: row.course_id },
      } as Record<string, unknown>),
  );

  // recent_rounds の shape (.courses.name) に合わせて変換
  const recentRounds = recentRoundsR.rows.map(
    (row: Record<string, unknown>) =>
      ({
        played_at: row.played_at,
        total_score: row.total_score,
        courses: { name: row.course_name },
      } as Record<string, unknown>),
  );

  return {
    profile: profile ?? {},
    clubs: clubsR.rows,
    course: courseR.rows[0] ?? {},
    holes: holesR.rows,
    hole_notes: holeNotes,
    recent_rounds: recentRounds,
    knowledge: knowledgeR.rows,
    starting_course: startingCourse,
    hole_areas: holeAreasR.rows,
    map_points: mapPointsR.rows,
    active_green: activeGreen,
  };
}

/**
 * ホールエリア情報をAIアドバイス用テキストに変換する。
 * ティーポイントが提供されている場合は各エリアまでの距離も付与する。
 * エリアデータが空の場合は空文字列を返す（graceful degradation）。
 */
export function buildAreaContext(
  areas: HoleArea[],
  teePoint: { lat: number; lng: number } | null,
  activeGreen: 'A' | 'B' | null,
): string {
  if (areas.length === 0) return '';
  const lines: string[] = [];
  const M_TO_Y = 1.09361;
  const toYards = (m: number) => Math.round(m * M_TO_Y);

  const greenType = activeGreen === 'B' ? 'green_b' : 'green_a';
  const greenArea = areas.find((a) => a.area_type === greenType);
  if (greenArea) {
    const label = activeGreen ? `${activeGreen}グリーン` : 'グリーン';
    if (teePoint) {
      const dist = calcDistanceToPolygon(teePoint, greenArea.coordinates);
      if (isFinite(dist)) {
        lines.push(`使用グリーン: ${label}（ティーから約${toYards(dist)}y）`);
      } else {
        lines.push(`使用グリーン: ${label}`);
      }
    } else {
      lines.push(`使用グリーン: ${label}`);
    }
  }

  const obLines = areas.filter((a) => a.area_type === 'ob_line');
  for (const ob of obLines) {
    const label = ob.name ?? 'OBライン';
    if (teePoint) {
      const dist = calcDistanceToPolygon(teePoint, ob.coordinates);
      if (isFinite(dist)) {
        lines.push(`${label}: 約${toYards(dist)}y`);
      } else {
        lines.push(label);
      }
    } else {
      lines.push(label);
    }
  }

  const bunkers = areas.filter((a) => a.area_type === 'bunker');
  if (bunkers.length > 0 && teePoint) {
    const dists = bunkers
      .map((b) => calcDistanceToPolygon(teePoint, b.coordinates))
      .filter(isFinite)
      .sort((a, b) => a - b);
    if (dists.length > 0) {
      lines.push(`バンカー: ${bunkers.length}箇所（最近接 約${toYards(dists[0])}y）`);
    } else {
      lines.push(`バンカー: ${bunkers.length}箇所`);
    }
  } else if (bunkers.length > 0) {
    lines.push(`バンカー: ${bunkers.length}箇所`);
  }

  const hazards = areas.filter((a) => a.area_type === 'hazard');
  if (hazards.length > 0 && teePoint) {
    const dists = hazards
      .map((h) => calcDistanceToPolygon(teePoint, h.coordinates))
      .filter(isFinite)
      .sort((a, b) => a - b);
    if (dists.length > 0) {
      lines.push(`ハザード（池・川等）: ${hazards.length}箇所（最近接 約${toYards(dists[0])}y）`);
    } else {
      lines.push(`ハザード（池・川等）: ${hazards.length}箇所`);
    }
  } else if (hazards.length > 0) {
    lines.push(`ハザード（池・川等）: ${hazards.length}箇所`);
  }

  return lines.join('\n');
}

/**
 * コンテキストをトークン推定サイズ内に収める
 * 目安: 10,000トークン ≈ 約30,000文字（日本語）
 */
export function formatContextForPrompt(context: AdviceContext): string {
  const sections: string[] = [];

  const holes = context.holes as Record<string, unknown>[];
  const holeOrder = context.starting_course === 'in'
    ? [...holes.filter(h => (h.hole_number as number) >= 10), ...holes.filter(h => (h.hole_number as number) < 10)]
    : holes;

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
      lines.push(`- 持ち球: ${shapeLabels[p.shot_shape as string] ?? p.shot_shape}`);
    }
    if (p.score_level) {
      lines.push(`- スコアレベル: ${levelLabels[p.score_level as string] ?? p.score_level}`);
    }
    sections.push(lines.join('\n'));
  }

  if (context.clubs.length > 0) {
    const lines = ['## クラブ一覧'];
    for (const c of context.clubs as Record<string, unknown>[]) {
      const fullDist = Number(c.distance);
      const hasHalfDist = !!c.distance_half;
      const halfLabel = hasHalfDist
        ? `${Number(c.distance_half)}y`
        : (fullDist > 0 ? `推定${Math.round(fullDist * 0.6)}〜${Math.round(fullDist * 0.7)}y` : '');
      let line = fullDist > 0
        ? `- ${c.name}: ${fullDist}y (6-7割: ${halfLabel})`
        : `- ${c.name}: 距離未設定`;
      if (c.success_rate != null) line += ` 成功率${c.success_rate}/10`;
      if (c.is_weak) line += ' (苦手)';
      if (c.confidence && !c.success_rate) line += ` 自信度${c.confidence}/5`;
      if (c.note) line += ` — ${c.note}`;
      lines.push(line);
    }
    sections.push(lines.join('\n'));
  }

  const course = context.course as Record<string, unknown>;
  if (course.name) {
    const STARTING_COURSE_LABELS: Record<string, string> = { out: 'OUTスタート', in: 'INスタート' };
    const startLabel = (context.starting_course && STARTING_COURSE_LABELS[context.starting_course]) ?? '';
    sections.push(`## コース\n${course.name}（${course.prefecture ?? ''}）${startLabel ? ` ${startLabel}` : ''}`);
  }

  if (context.holes.length > 0) {
    const lines = [`## ホール情報（${context.starting_course === 'in' ? 'INスタート: 10→18→1→9の順' : 'OUTスタート: 1→9→10→18の順'}）`];
    for (const [i, h] of holeOrder.entries()) {
      let line = `- [${i + 1}番目] Hole ${h.hole_number}: Par${h.par}`;
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

  if (context.hole_areas.length > 0 && context.holes.length > 0) {
    const teeByHoleId = new Map<string, { lat: number; lng: number }>();
    for (const mp of context.map_points) {
      if (mp.is_tee_reference && !teeByHoleId.has(mp.hole_id)) {
        teeByHoleId.set(mp.hole_id, { lat: mp.lat, lng: mp.lng });
      }
    }
    const areasByHoleId = new Map<string, typeof context.hole_areas>();
    for (const area of context.hole_areas) {
      const list = areasByHoleId.get(area.hole_id) ?? [];
      list.push(area);
      areasByHoleId.set(area.hole_id, list);
    }

    const areaLines: string[] = ['## ホールエリア情報（GPSマップデータ）'];
    for (const h of holeOrder) {
      const holeId = h.id as string;
      const holeNumber = h.hole_number as number;
      const holeAreas = areasByHoleId.get(holeId);
      if (!holeAreas || holeAreas.length === 0) continue;
      const teePoint = teeByHoleId.get(holeId) ?? null;
      const areaText = buildAreaContext(holeAreas, teePoint, context.active_green);
      if (!areaText) continue;
      areaLines.push(`- Hole ${holeNumber}:`);
      for (const line of areaText.split('\n')) {
        areaLines.push(`  ${line}`);
      }
    }
    if (areaLines.length > 1) {
      sections.push(areaLines.join('\n'));
    }
  }

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

  if (context.knowledge.length > 0) {
    const MAX_KNOWLEDGE_CONTENT = 1000;
    const MAX_KNOWLEDGE_SECTION = 15000;
    const lines = ['## ナレッジベース（プレーヤーが蓄積した知識）'];
    let sectionLength = 0;
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
      if (sectionLength + line.length > MAX_KNOWLEDGE_SECTION) {
        lines.push('（以降省略）');
        break;
      }
      lines.push(line);
      sectionLength += line.length;
    }
    sections.push(lines.join('\n'));
  }

  if (context.recent_rounds.length > 0) {
    const lines = ['## 直近ラウンド'];
    for (const r of context.recent_rounds as Record<string, unknown>[]) {
      const courseName = ((r.courses as unknown) as { name: string } | null)?.name ?? '';
      lines.push(`- ${r.played_at} ${courseName}: ${r.total_score ?? '未完了'}`);
    }
    sections.push(lines.join('\n'));
  }

  const fullContext = sections.join('\n\n');

  const MAX_CONTEXT_LENGTH = 30000;
  if (fullContext.length > MAX_CONTEXT_LENGTH) {
    return fullContext.substring(0, MAX_CONTEXT_LENGTH) + '\n\n（コンテキストが長いため一部省略）';
  }
  return fullContext;
}

/**
 * 当日のスコア推移コンテキストを構築する。
 *
 * 呼び出し側で `requireUser()` のコンテキストが必要。
 */
export async function buildScoreContext(
  roundId: string,
  startingCourse?: string | null,
  courseId?: string | null,
): Promise<string> {
  if (!UUID_RE.test(roundId)) return '';

  return db.userRead(async (client) => {
    let resolvedCourseId = courseId;
    if (!resolvedCourseId) {
      const r = await client.query<{ course_id: string }>(
        `SELECT course_id FROM rounds
          WHERE id = $1 AND user_id = current_user_id()::uuid`,
        [roundId],
      );
      if (r.rowCount === 0) return '';
      resolvedCourseId = r.rows[0].course_id;
    }

    const [scoresR, holesR] = await Promise.all([
      client.query<{
        hole_number: number;
        strokes: number;
        putts: number | null;
        ob_count: number | null;
      }>(
        `SELECT hole_number, strokes, putts, ob_count
           FROM scores
          WHERE round_id = $1
          ORDER BY hole_number`,
        [roundId],
      ),
      client.query<{ hole_number: number; par: number }>(
        `SELECT hole_number, par FROM holes WHERE course_id = $1 ORDER BY hole_number`,
        [resolvedCourseId],
      ),
    ]);

    const rawScores = scoresR.rows;
    const holes = holesR.rows;

    if (rawScores.length === 0) return '';

    const playOrder =
      startingCourse === 'in'
        ? [...Array.from({ length: 9 }, (_, i) => i + 10), ...Array.from({ length: 9 }, (_, i) => i + 1)]
        : Array.from({ length: 18 }, (_, i) => i + 1);
    const orderMap = new Map(playOrder.map((h, i) => [h, i]));
    const scores = [...rawScores].sort(
      (a, b) => (orderMap.get(a.hole_number) ?? 0) - (orderMap.get(b.hole_number) ?? 0),
    );

    const parMap = new Map(holes.map((h) => [h.hole_number, h.par]));

    const lines = ['## 当日のスコア推移（プレー順）'];
    let totalStrokes = 0;
    let totalPar = 0;
    let consecutiveBogeys = 0;
    const lastHoleNumber = scores[scores.length - 1].hole_number;

    for (const [idx, s] of scores.entries()) {
      const par = parMap.get(s.hole_number) ?? 0;
      const diff = s.strokes - par;
      const diffStr = diff > 0 ? `+${diff}` : diff === 0 ? 'E' : `${diff}`;
      let line = `- [${idx + 1}番目] Hole ${s.hole_number}: ${s.strokes}打 (Par${par}, ${diffStr})`;
      if (s.putts !== null) line += ` パット${s.putts}`;
      lines.push(line);
      totalStrokes += s.strokes;
      totalPar += par;

      if (diff >= 1) {
        consecutiveBogeys++;
      } else {
        consecutiveBogeys = 0;
      }
    }

    const totalDiff = totalStrokes - totalPar;
    const totalDiffStr = totalDiff > 0 ? `+${totalDiff}` : totalDiff === 0 ? 'E' : `${totalDiff}`;
    lines.push(`- 合計: ${totalStrokes}打 (${totalDiffStr}) / ${scores.length}ホール消化`);

    let lastDoubleBogeyHole: number | null = null;
    for (const s of scores) {
      const par = parMap.get(s.hole_number) ?? 0;
      if (par > 0 && s.strokes >= par + 2) {
        lastDoubleBogeyHole = s.hole_number;
      }
    }

    const recentScores = scores.slice(-3);
    let scoringTrend: 'struggling' | 'steady' | null = null;
    if (recentScores.length >= 3) {
      const recentAvgDiff =
        recentScores.reduce((sum, s) => {
          const par = parMap.get(s.hole_number) ?? 0;
          return sum + (s.strokes - par);
        }, 0) / recentScores.length;
      if (recentAvgDiff > 1) {
        scoringTrend = 'struggling';
      } else if (recentAvgDiff <= 0) {
        scoringTrend = 'steady';
      }
    }

    const warnings: string[] = [];
    if (scores.length >= 14) {
      warnings.push(
        `${scores.length}ホール消化し終盤に入っています。疲労を考慮した安全なクラブ選択を推奨してください。`,
      );
    }
    if (consecutiveBogeys >= 2) {
      warnings.push(
        `直近${consecutiveBogeys}ホール連続でボギー以上です。メンタルリセットを促し、守りの戦略を推奨してください。`,
      );
    }
    if (lastDoubleBogeyHole !== null && lastDoubleBogeyHole === lastHoleNumber) {
      warnings.push(
        `直前のHole ${lastDoubleBogeyHole}でダブルボギー以上でした。気持ちを切り替えて、次の一打に集中するようアドバイスしてください。`,
      );
    }
    const totalOB = scores.reduce((sum, s) => sum + (s.ob_count ?? 0), 0);
    if (totalOB >= 2) {
      warnings.push(
        `本日OB ${totalOB}回。OBはスコアに最も大きく響くため、確実にフェアウェイキープを最優先してください。番手を落としてでもOBを避ける戦略を推奨してください。`,
      );
    }

    if (scoringTrend === 'struggling') {
      warnings.push('直近3ホールの平均がパー+1以上です。安全策を推奨し、スコアの立て直しを優先してください。');
    } else if (scoringTrend === 'steady') {
      warnings.push(
        '直近3ホールはパー以下で安定しています。このリズムを維持することを最優先し、攻め過ぎを誘発しないでください。センター狙いの安定した戦略を推奨してください。',
      );
    }

    if (warnings.length > 0) {
      lines.push('');
      lines.push('### 注意事項');
      for (const w of warnings) {
        lines.push(`- ${w}`);
      }
    }

    return lines.join('\n');
  });
}
