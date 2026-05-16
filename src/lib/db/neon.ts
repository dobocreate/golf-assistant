// ============================================================================
// src/lib/db/neon.ts
// Phase 2 で本実装、Phase 3 で middleware / Server Action 経路と統合
//
// この file は Section 4.0 / 4.2 (Round 6 Critical 1 / Round 7 Major 1) の
// 設計を反映した DB helper です。Phase 3 の Server Action 切替時に各 action から
// `requireUser(...)` または直接 `withResolvedUser(...)` で context を確立して使う。
//
// Phase 3 で必要な追加作業 (TODO):
//   - middleware で Clerk auth を取り、Server Action 入口で `requireUser()` を呼ぶ
//   - Supabase クライアント (`src/lib/supabase/*`) を呼ぶ Server Action を本 helper 経由に置換
//   - profiles.clerk_user_id への mapping を確立 (kishida を手動で Clerk 作成後)
// ============================================================================

import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, PoolClient } from 'pg';
import { auth } from '@clerk/nextjs/server';

// Re-export PoolClient type so Server Actions can reference query callback types
// without importing pg directly (forbidden by eslint no-restricted-imports).
export type { PoolClient } from 'pg';

// ----------------------------------------------------------------------------
// 接続プール (Section 4.2)
//
// Next.js dev mode の HMR で module 再評価が走ると Pool が累積し、Neon の
// connection limit を食い潰す。global singleton で persist させて防ぐ
// (Gemini review PR#236 指摘)。pool 自体は引き続き非 export
// (Codex Round 1 Major 1: raw pool は export しない)。
// ----------------------------------------------------------------------------

const globalForPools = global as unknown as {
  __neonReadPool: Pool | undefined;
  __neonWritePool: Pool | undefined;
};

/** Pooled (PgBouncer transaction mode、role=assistant_app_readonly、SELECT only) */
const readPool =
  globalForPools.__neonReadPool ??
  new Pool({
    connectionString: process.env.NEON_DATABASE_URL_POOLED,
    max: 20,
  });

/** Direct (session mode、role=assistant_app、RLS は SET LOCAL で強制) */
const writePool =
  globalForPools.__neonWritePool ??
  new Pool({
    connectionString: process.env.NEON_DATABASE_URL_DIRECT,
    max: 5,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPools.__neonReadPool = readPool;
  globalForPools.__neonWritePool = writePool;
}

// ----------------------------------------------------------------------------
// AsyncLocalStorage per-request context (Section 4.0 / Round 7 Major 1)
// ----------------------------------------------------------------------------

interface RequestUserContext {
  clerkUserId: string;
  internalUserId: string; // profiles.user_id (UUID 文字列)
}

const userContextStore = new AsyncLocalStorage<RequestUserContext>();

/** 認証境界 (middleware / Server Action 入口) で 1 回だけ呼ぶ */
export async function withResolvedUser<T>(
  clerkUserId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const internalUserId = await lookupProfileUserId(clerkUserId);
  return userContextStore.run({ clerkUserId, internalUserId }, fn);
}

async function lookupProfileUserId(clerkUserId: string): Promise<string> {
  const r = await readPool.query<{ user_id: string }>(
    'SELECT user_id FROM profiles WHERE clerk_user_id = $1',
    [clerkUserId],
  );
  if (r.rowCount === 0) throw new ProfileNotFoundError(clerkUserId);
  return r.rows[0].user_id;
}

export function getCurrentInternalUserId(): string {
  const ctx = userContextStore.getStore();
  if (!ctx) throw new UserContextMissingError();
  return ctx.internalUserId;
}

/**
 * Server Action / Route Handler 入口で auth を解決し context をセットするヘルパー。
 *
 * 使い方:
 * ```ts
 * 'use server';
 * import { requireUser, db } from '@/lib/db/neon';
 *
 * export async function updateRound(roundId: string, ...) {
 *   return requireUser(async () => {
 *     return db.transaction(async (client) => {
 *       await client.query('UPDATE rounds SET ... WHERE id = $1', [roundId]);
 *     });
 *   });
 * }
 * ```
 *
 * Phase 5 transition period:
 *   1. Clerk middleware が設定されていれば Clerk userId → profiles.clerk_user_id lookup
 *   2. 未設定なら Supabase Auth から user.id を取得して直接 profiles.user_id として使用
 *   両者の結果はどちらも `app.current_user_id` に同じ UUID 文字列をセットする。
 *
 * Phase 7 cutover 完了後、Supabase Auth フォールバックを削除する (TODO)。
 */
export async function requireUser<T>(fn: () => Promise<T>): Promise<T> {
  // (1) Clerk auth を優先
  try {
    const { userId: clerkUserId } = await auth();
    if (clerkUserId) {
      return await withResolvedUser(clerkUserId, fn);
    }
  } catch {
    // Clerk middleware 未設定時は auth() が throw する → Supabase に fallback
  }

  // (2) Supabase Auth フォールバック (Phase 5 transition、Phase 7 で削除)
  const { createClient } = await import('@/lib/supabase/server');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('unauthorized: no Clerk session and no Supabase session');
  }
  // Supabase user.id == auth.users.id == profiles.user_id (既存 schema での FK 関係)
  return userContextStore.run(
    { clerkUserId: `supabase:${user.id}`, internalUserId: user.id },
    fn,
  );
}

// ----------------------------------------------------------------------------
// 典型エラー (Section 4.0 / Round 7 Major 2)
// ----------------------------------------------------------------------------

export class WriteFreezeActiveError extends Error {
  constructor() {
    super('Write operations are currently frozen for migration. See WRITE_FREEZE_ACTIVE.');
    this.name = 'WriteFreezeActiveError';
  }
}

export class ProfileNotFoundError extends Error {
  constructor(public readonly clerkUserId: string) {
    super(`profile not found for clerk_user_id=${clerkUserId}`);
    this.name = 'ProfileNotFoundError';
  }
}

export class UserContextMissingError extends Error {
  constructor() {
    super('user context missing — call withResolvedUser at auth boundary');
    this.name = 'UserContextMissingError';
  }
}

export const isWriteFreezeActive = (): boolean =>
  process.env.WRITE_FREEZE_ACTIVE === 'true';

// ----------------------------------------------------------------------------
// db helper (Section 4.2)
//
// | helper        | 用途                              | user_id 必要 | RLS |
// |---------------|-----------------------------------|--------------|-----|
// | db.read       | 共有テーブル read                  | ×            | ×   |
// | db.userRead   | user-scoped read                  | ◯            | ◯   |
// | db.transaction| user-scoped write                 | ◯            | ◯   |
// | db.system     | webhook / cron / admin (非 user)   | ✗ (NULL)     | fail-closed |
// ----------------------------------------------------------------------------

export const db = {
  /**
   * read: pooled connection、共有テーブル (courses / holes / hole_areas 等) の SELECT
   * - role=assistant_app_readonly → DB レベルで write 拒否
   * - BEGIN READ ONLY → transaction レベルでも write 拒否 (2 重)
   */
  read: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await readPool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      try {
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      }
    } finally {
      client.release();
    }
  },

  /**
   * userRead: user-scoped read。direct + SET LOCAL で RLS、BEGIN READ ONLY で write 拒否
   */
  userRead: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    const internalUserId = getCurrentInternalUserId();
    const client = await writePool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query('SET LOCAL statement_timeout = 5000');
      await client.query('SET LOCAL idle_in_transaction_session_timeout = 10000');
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_user_id',
        internalUserId,
      ]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * transaction: 唯一の write 経路。freeze gate → user context → SET LOCAL → fn → COMMIT
   * - WRITE_FREEZE_ACTIVE=true の間は WriteFreezeActiveError を throw
   * - DB 側でも freeze-start.sql で DML/EXECUTE REVOKE 済み (2 重防御)
   */
  transaction: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    if (isWriteFreezeActive()) throw new WriteFreezeActiveError();
    const internalUserId = getCurrentInternalUserId();
    const client = await writePool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = 5000');
      await client.query('SET LOCAL idle_in_transaction_session_timeout = 10000');
      await client.query('SELECT set_config($1, $2, true)', [
        'app.current_user_id',
        internalUserId,
      ]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },

  /**
   * system: 匿名 route / webhook / cron 用 (非 user)
   * - app.current_user_id を SET しない → RLS は user_id 要求テーブルで fail-closed
   * - WRITE_FREEZE_ACTIVE 中は webhook も止める
   */
  system: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => {
    if (isWriteFreezeActive()) throw new WriteFreezeActiveError();
    const client = await writePool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL statement_timeout = 5000');
      await client.query('SET LOCAL idle_in_transaction_session_timeout = 10000');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },
};

// raw pool は export しない (Codex Round 1 Major 1)
