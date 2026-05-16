// ============================================================================
// /api/freeze-probe (Phase 1 D-3 で骨組み、Section 8.1.5 (3))
//
// 役割: middleware が POST を 503 で blocking しているかだけを観測する probe。
//       route handler 自体は何もしない (204 を返す)。
//
// 期待動作:
//   freeze 中  → middleware が 503 返却 (handler 到達せず)
//   freeze 解除 → handler が 204 返却
//
// middleware の matcher は `/api/freeze-probe` を含む通常 path として扱う
// (除外しない)。これにより freeze 状態の判定が外から検証可能。
// ============================================================================

export async function POST() {
  return new Response(null, { status: 204 });
}

export async function GET() {
  // GET は POST と異なり middleware の 503 対象外。常に 204 返却 (path 存在確認用)
  return new Response(null, { status: 204 });
}
