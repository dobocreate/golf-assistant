// @ts-nocheck
/* eslint-disable */
//
// ============================================================================
// /api/webhooks/clerk (Phase 1 D-3 で骨組み、Section 11.1 / Round 7 Major 2)
//
// 役割: Clerk webhook (user.created 等) を受け、profiles 行を自動作成する。
//       これにより ProfileNotFoundError は backfill 失敗時のみに限定される。
//
// セキュリティ:
//   - svix で署名検証 (CLERK_WEBHOOK_SECRET)
//   - middleware の matcher で /api/webhooks/ を除外 (Clerk 認証 bypass)
//   - 非 user 経路なので db.system helper を使う (user-scoped helper は使わない)
//
// Phase 1 では route 骨組みのみ。Phase 5 で svix 検証 + INSERT 実装。
// Phase 5 までは Clerk Dashboard 側で Webhook endpoint を有効化しない (B-3 skip)。
//
// **Phase 5 着手前の前提条件 (重要)**:
//   現状 `profiles.user_id uuid REFERENCES auth.users(id) NOT NULL` の FK 制約が
//   残っていると、下記の `INSERT ... gen_random_uuid()` は FK 違反で失敗する。
//   Phase 2 で `auth.users` FK を DROP するマイグレーション (00043 想定) を
//   先に適用しておくこと (詳細は 00041 のヘッダコメント参照)。
// ============================================================================

import { db } from '@/lib/db/neon';
// import { Webhook } from 'svix'; // TODO (Phase 5): pnpm add svix

export async function POST(req: Request) {
  // (1) svix で Clerk webhook 署名検証 (Phase 5 で実装)
  // TODO (Phase 5):
  //   - svix.Webhook(CLERK_WEBHOOK_SECRET).verify(payload, headers)
  //   - 失敗時は 401 返却
  const event = await verifyClerkWebhook(req);
  // Phase 1: verifyClerkWebhook は常に null を返すため必ず 401。
  // Phase 5 で svix 実装後に署名検証ロジックを有効化する。
  if (!event) {
    return new Response('unauthorized', { status: 401 });
  }

  // (2) user.created → profiles INSERT (db.system 経由、Round 7 Major 2)
  if (event.type === 'user.created') {
    const clerkUserId = event.data.id;
    await db.system(async (client) => {
      await client.query(
        `INSERT INTO profiles (id, user_id, clerk_user_id)
         VALUES (gen_random_uuid(), gen_random_uuid(), $1)
         ON CONFLICT (clerk_user_id) DO NOTHING`,
        [clerkUserId],
      );
    });
  }

  return new Response('ok', { status: 200 });
}

// TODO (Phase 5): svix 実装で置き換え
async function verifyClerkWebhook(req: Request): Promise<{ type: string; data: { id: string } } | null> {
  // 仮実装: Phase 1 では常に null (= 401) 返却。Phase 5 で svix 検証ロジックに差し替え
  return null;
}
