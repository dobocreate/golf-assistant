import type { PoolClient } from '@/lib/db/neon';
import { LIE_DB_TO_LABEL } from '@/lib/golf-constants';

export interface ShotPatternStat {
  lie: string;
  distance_bucket: string;
  club: string;
  sample_size: number;
  success_count: number;
  top_result: string | null;
  top_miss_type: string | null;
}

export const MIN_SAMPLE_SIZE = 3;
export const TOP_N = 10;

// CHECK 制約で excellent/good/fair/poor のみ。fallback は想定外値の graceful degradation
const RESULT_LABELS: Record<string, string> = {
  excellent: '◎',
  good: '○',
  fair: '△',
  poor: '×',
};

/**
 * 過去の自分のショットを lie × 距離バケット × クラブで集計し、
 * サンプル数 >= MIN_SAMPLE_SIZE のグループを上位 TOP_N 件返す。
 * AI コンテキスト統合用。db.userRead/db.transaction の callback 内でのみ呼ぶこと
 * (current_user_id() RLS context が必要)。
 */
export async function fetchShotPatternStats(client: PoolClient): Promise<ShotPatternStat[]> {
  const r = await client.query<ShotPatternStat>(
    `
    WITH classified AS (
      SELECT
        s.lie,
        CASE
          WHEN s.remaining_distance < 50 THEN '0-50y'
          WHEN s.remaining_distance < 100 THEN '50-100y'
          WHEN s.remaining_distance < 150 THEN '100-150y'
          WHEN s.remaining_distance < 200 THEN '150-200y'
          WHEN s.remaining_distance < 250 THEN '200-250y'
          ELSE '250y+'
        END AS distance_bucket,
        s.club,
        s.result,
        s.miss_type,
        CASE WHEN s.result IN ('excellent', 'good') THEN 1 ELSE 0 END AS is_success
      FROM shots s
      JOIN rounds r ON s.round_id = r.id
      WHERE r.user_id = current_user_id()::uuid
        AND s.lie IS NOT NULL
        AND s.club IS NOT NULL
        AND s.remaining_distance IS NOT NULL
        AND s.result IS NOT NULL
    )
    -- TODO(perf): kishida 261 行で <50ms。万行規模になったら shots(user_id, lie, club) 相当の
    -- partial index 追加か、window で集計対象を制限することを検討。
    -- 注: MODE() WITHIN GROUP は同点時 arbitrary (PG doc)。result tie 時は alphabetical 順
    -- (excellent < fair < good < poor) で「good vs fair」tie 時に fair が優先される可能性あり。
    -- ORDER BY CASE で意味順にしても MODE() の戻り値は sort_expression の型 (= int) になり
    -- top_result (text) が取れなくなる。決定性を完全に確保したい場合は DISTINCT ON で書き換え必要。
    -- 現状: tie 発生は稀 (グループあたり数件) + ラベル表示のみで実害小のため許容
    SELECT
      lie,
      distance_bucket,
      club,
      COUNT(*)::int AS sample_size,
      SUM(is_success)::int AS success_count,
      MODE() WITHIN GROUP (ORDER BY result) AS top_result,
      MODE() WITHIN GROUP (ORDER BY miss_type) FILTER (WHERE miss_type IS NOT NULL) AS top_miss_type
    FROM classified
    GROUP BY lie, distance_bucket, club
    HAVING COUNT(*) >= $1
    ORDER BY sample_size DESC, lie, distance_bucket, club
    LIMIT $2
    `,
    [MIN_SAMPLE_SIZE, TOP_N],
  );
  return r.rows;
}

/**
 * 集計結果を AI プロンプト用テキストに整形する。
 * 空配列の場合は空文字列を返す。
 */
export function formatShotStats(stats: ShotPatternStat[]): string {
  if (stats.length === 0) return '';
  const lines = [
    `## 過去ショット傾向（lie × 距離 × クラブ別、サンプル${MIN_SAMPLE_SIZE}件以上）`,
  ];
  for (const s of stats) {
    const lieLabel = LIE_DB_TO_LABEL[s.lie] ?? s.lie;
    let line = `- ${lieLabel} ${s.distance_bucket} / ${s.club}: ${s.sample_size}回中 ${s.success_count}回成功`;
    // 成功率 < 50% かつミスデータあり → 最頻ミス優先表示
    // 整数演算で 50% ちょうど (success*2 === sample) は「ミス優先しない」側に倒す
    // (浮動小数誤差なし。`<=` への変更は意味が変わるので注意)
    if (s.top_miss_type && s.success_count * 2 < s.sample_size) {
      // TODO(sprint8+): miss_type は text 自由入力。LIE_DB_TO_LABEL 同様の正規化を入れる場合は MISS_TYPE_DB_TO_LABEL を導入
      line += `（最頻ミス ${s.top_miss_type}）`;
    } else if (s.top_result) {
      const resultLabel = RESULT_LABELS[s.top_result] ?? s.top_result;
      line += `（最頻 ${resultLabel}）`;
    }
    lines.push(line);
  }
  return lines.join('\n');
}
