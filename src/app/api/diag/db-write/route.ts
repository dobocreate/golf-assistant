// ============================================================================
// /api/diag/db-write (Phase 1 D-3 で骨組み、Section 8.1.5 (4))
//
// 役割: middleware を bypass して、Server Action 経路で db.transaction の
//       1 行 INSERT → ROLLBACK が実際に動くかを確認する診断 route。
//
// 3 段階防御:
//   1. flag 制御: DIAG_DB_WRITE_ENABLED=true の間だけ有効、それ以外は 404
//   2. middleware exempt: matcher で /api/diag/ を除外 (middleware.ts で実装)
//   3. admin token 必須: x-admin-token を ADMIN_DIAG_TOKEN と照合
//
// 期待レスポンス:
//   freeze 中  → 200 + body=freeze_active (Layer 1 で WriteFreezeActiveError)
//   または     → 200 + body=db_permission_denied (Layer 3 で DB が REVOKE)
//   freeze 解除 → 200 + body=write_ok_rolled_back
//
// Phase 7 cutover 前に Enable、検証完了後に Disable (Round 7 Major 4 で短期化)。
// Phase 8 終了時に endpoint 自体を削除する選択肢もあり。
// ============================================================================

import {
  db,
  withResolvedUser,
  WriteFreezeActiveError,
} from '@/lib/db/neon';

export async function POST(req: Request) {
  // (1) flag 制御 (Round 7 Major 4)
  if (process.env.DIAG_DB_WRITE_ENABLED !== 'true') {
    return new Response('not found', { status: 404 });
  }

  // (2) admin token
  if (req.headers.get('x-admin-token') !== process.env.ADMIN_DIAG_TOKEN) {
    return new Response('forbidden', { status: 403 });
  }

  // (3) diag 用に固定 internalUserId を context にセットして write を試行
  //
  // **Phase 5 で要対応 (Major M-6)**:
  //   現状 `withResolvedUser(clerkUserId, fn)` は `lookupProfileUserId(clerkUserId)`
  //   で DB lookup を走らせるが、`clerkUserId='diag'` の行は `profiles` に存在しない
  //   ため `ProfileNotFoundError` で 500 になる。
  //   解決策: `neon.ts` に `withInternalUserId(internalUserId, fn)` バリアントを追加し、
  //         lookup を bypass して直接 internalUserId を context にセットする。
  //         または diag 専用の `profiles` 行を seed (clerk_user_id='diag', user_id=$DIAG_INTERNAL_USER_ID)。
  const diagClerkUserId = 'diag';
  const diagInternalUserId = process.env.DIAG_INTERNAL_USER_ID;
  if (!diagInternalUserId) {
    return new Response('DIAG_INTERNAL_USER_ID env missing', { status: 500 });
  }

  return withResolvedUser(diagClerkUserId, async () => {
    try {
      await db.transaction(async (client) => {
        await client.query(
          "INSERT INTO memos (user_id, body) VALUES (current_user_id()::UUID, '__diag_probe__')",
        );
        throw new Error('intentional rollback');
      });
      return new Response('unexpected commit', { status: 500 });
    } catch (err) {
      if (err instanceof WriteFreezeActiveError) {
        return new Response('freeze_active', { status: 200 });
      }
      if (err instanceof Error && err.message === 'intentional rollback') {
        return new Response('write_ok_rolled_back', { status: 200 });
      }
      if (err instanceof Error && /permission denied/.test(err.message)) {
        return new Response('db_permission_denied', { status: 200 });
      }
      return new Response(`unknown:${(err as Error).message}`, { status: 500 });
    }
  });
}
