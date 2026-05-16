import { db } from '@/lib/db/neon';

/**
 * ラウンド後の練習提案用コンテキストを構築する。
 *
 * 呼び出し側で `requireUser()` のコンテキストが必要 (db.userRead が
 * `current_user_id()::uuid` を期待する RLS 経路を通るため)。
 */
export async function buildPracticeContext(roundId: string): Promise<string | null> {
  return db.userRead(async (client) => {
    const roundR = await client.query<{
      course_id: string;
      played_at: string;
      total_score: number | null;
      weather: string | null;
      wind: string | null;
      review_note: string | null;
      course_name: string | null;
    }>(
      `SELECT r.course_id, r.played_at, r.total_score, r.weather, r.wind, r.review_note,
              c.name AS course_name
         FROM rounds r
         LEFT JOIN courses c ON c.id = r.course_id
        WHERE r.id = $1
          AND r.user_id = current_user_id()::uuid
          AND r.status = 'completed'`,
      [roundId],
    );
    const round = roundR.rows[0];
    if (!round) return null;

    const [profileR, scoresR, shotsR, memosR, holesR, knowledgeR] = await Promise.all([
      client.query<{
        handicap: number | null;
        play_style: string | null;
        miss_tendency: string | null;
      }>(
        `SELECT handicap, play_style, miss_tendency
           FROM profiles
          WHERE user_id = current_user_id()::uuid`,
      ),
      client.query<{
        hole_number: number;
        strokes: number;
        putts: number | null;
        fairway_hit: boolean | null;
        green_in_reg: boolean | null;
        first_putt_distance_m: number | null;
      }>(
        `SELECT hole_number, strokes, putts, fairway_hit, green_in_reg, first_putt_distance_m
           FROM scores
          WHERE round_id = $1
          ORDER BY hole_number`,
        [roundId],
      ),
      client.query<{
        hole_number: number;
        club: string | null;
        result: string | null;
        miss_type: string | null;
        direction_lr: string | null;
      }>(
        `SELECT hole_number, club, result, miss_type, direction_lr
           FROM shots
          WHERE round_id = $1
          ORDER BY hole_number`,
        [roundId],
      ),
      client.query<{ hole_number: number; content: string }>(
        `SELECT hole_number, content
           FROM memos
          WHERE round_id = $1
          ORDER BY hole_number`,
        [roundId],
      ),
      client.query<{ hole_number: number; par: number }>(
        `SELECT hole_number, par FROM holes WHERE course_id = $1 ORDER BY hole_number`,
        [round.course_id],
      ),
      client.query<{
        title: string;
        content: string | null;
        category: string | null;
        tags: string[] | null;
        source_url: string | null;
      }>(
        `SELECT title, content, category, tags, source_url
           FROM knowledge
          WHERE user_id = current_user_id()::uuid
            AND category = '練習法'
          ORDER BY updated_at DESC
          LIMIT 10`,
      ),
    ]);

    const profile = profileR.rows[0];
    const scores = scoresR.rows;
    const shots = shotsR.rows;
    const memos = memosR.rows;
    const holes = holesR.rows;
    const knowledge = knowledgeR.rows;
    const parMap = new Map(holes.map((h) => [h.hole_number, h.par]));

    const sections: string[] = [];

    if (profile) {
      const lines = ['## プレーヤー情報'];
      if (profile.handicap) lines.push(`- ハンディキャップ: ${profile.handicap}`);
      if (profile.play_style) lines.push(`- プレースタイル: ${profile.play_style}`);
      if (profile.miss_tendency) lines.push(`- ミス傾向: ${profile.miss_tendency}`);
      sections.push(lines.join('\n'));
    }

    const courseName = round.course_name ?? '不明';
    const lines = ['## ラウンド情報'];
    lines.push(`- コース: ${courseName}`);
    lines.push(`- プレー日: ${round.played_at}`);
    if (round.total_score) lines.push(`- 合計スコア: ${round.total_score}`);
    if (round.weather) lines.push(`- 天候: ${round.weather}`);
    if (round.wind) lines.push(`- 風: ${round.wind}`);
    sections.push(lines.join('\n'));

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
      const fwHits = scores.filter((s) => s.fairway_hit === true).length;
      const fwTotal = scores.filter((s) => s.fairway_hit !== null).length;
      const girHits = scores.filter((s) => s.green_in_reg === true).length;
      const girTotal = scores.filter((s) => s.green_in_reg !== null).length;
      const totalPutts = scores.reduce((sum, s) => sum + (s.putts ?? 0), 0);
      const puttsCount = scores.filter((s) => s.putts !== null).length;

      scoreLines.push('');
      scoreLines.push('### 統計サマリー');
      scoreLines.push(
        `- 合計: ${totalStrokes}打 (${totalStrokes - totalPar >= 0 ? '+' : ''}${totalStrokes - totalPar})`,
      );
      if (fwTotal > 0) scoreLines.push(`- FWキープ率: ${Math.round((fwHits / fwTotal) * 100)}% (${fwHits}/${fwTotal})`);
      if (girTotal > 0) scoreLines.push(`- パーオン率: ${Math.round((girHits / girTotal) * 100)}% (${girHits}/${girTotal})`);
      if (puttsCount > 0) scoreLines.push(`- 平均パット: ${(totalPutts / puttsCount).toFixed(1)} (計${totalPutts})`);

      const doubleBogeys = scores.filter((s) => {
        const par = parMap.get(s.hole_number) ?? 0;
        return par > 0 && s.strokes >= par + 2;
      });
      if (doubleBogeys.length > 0) {
        scoreLines.push(`- ダブルボギー以上: ${doubleBogeys.map((s) => `Hole${s.hole_number}`).join(', ')}`);
      }

      const threePutts = scores.filter((s) => (s.putts ?? 0) >= 3);
      if (threePutts.length > 0) {
        scoreLines.push(`- 3パット以上: ${threePutts.map((s) => `Hole${s.hole_number}`).join(', ')}`);
      }

      sections.push(scoreLines.join('\n'));
    }

    if (shots.length > 0) {
      const shotLines = ['## ショット記録（ミス傾向）'];
      const missTypes: Record<string, number> = {};
      const directionCounts: Record<string, number> = {};
      for (const s of shots) {
        if (s.miss_type) missTypes[s.miss_type] = (missTypes[s.miss_type] ?? 0) + 1;
        if (s.direction_lr) directionCounts[s.direction_lr] = (directionCounts[s.direction_lr] ?? 0) + 1;
      }
      if (Object.keys(missTypes).length > 0) {
        shotLines.push(
          '- ミスタイプ: ' + Object.entries(missTypes).map(([k, v]) => `${k}(${v}回)`).join(', '),
        );
      }
      if (Object.keys(directionCounts).length > 0) {
        shotLines.push(
          '- 方向: ' + Object.entries(directionCounts).map(([k, v]) => `${k}(${v}回)`).join(', '),
        );
      }
      sections.push(shotLines.join('\n'));
    }

    if (memos.length > 0) {
      const memoLines = ['## ホール別メモ'];
      for (const m of memos) {
        memoLines.push(`- Hole ${m.hole_number}: ${m.content}`);
      }
      sections.push(memoLines.join('\n'));
    }

    if (round.review_note) {
      sections.push(`## プレーヤーの総括（課題感）\n${round.review_note}`);
    }

    if (knowledge.length > 0) {
      const knLines = ['## 練習法ナレッジ（プレーヤーが登録した練習メニュー）'];
      for (const k of knowledge) {
        const content = String(k.content ?? '');
        const truncated = content.length > 800 ? content.substring(0, 800) + '…' : content;
        let line = `### ${k.title}`;
        if (k.tags && k.tags.length > 0) line += ` [${k.tags.join(', ')}]`;
        if (k.source_url) line += `\n参考動画: ${k.source_url}`;
        line += `\n${truncated}`;
        knLines.push(line);
      }
      sections.push(knLines.join('\n\n'));
    }

    return sections.join('\n\n');
  });
}
