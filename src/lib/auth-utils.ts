import { requireUser, getCurrentInternalUserId } from '@/lib/db/neon';

/**
 * 認証されたユーザーの内部 user_id (UUID) を返す。
 *
 * 解決経路:
 *   1. Clerk セッションが存在 → `profiles.clerk_user_id` から内部 user_id を lookup
 *   2. (Phase 7 cutover まで) Supabase Auth セッションが存在 → `auth.users.id` を返す
 *   3. どちらも無い → null
 *
 * 既存呼び出し側 (pages) は `if (!user) redirect('/auth/login')` の auth gate
 * 用途で `.id` のみ参照するため、shape は `{ id: string } | null`。
 *
 * 過去シグネチャ (Supabase User オブジェクト) との後方互換のために `id` だけ
 * を返す薄いラッパに集約 (`getAuthenticatedProfileId` は未使用のため削除)。
 */
export async function getAuthenticatedUser(): Promise<{ id: string } | null> {
  try {
    return await requireUser(async () => ({ id: getCurrentInternalUserId() }));
  } catch {
    return null;
  }
}
