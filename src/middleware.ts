import { clerkMiddleware } from '@clerk/nextjs/server';
import { updateSession } from '@/lib/supabase/middleware';

// Phase 3: Clerk と Supabase の Auth を並走させる。
//
// なぜ並走か:
//   - Clerk が primary。auth() を Server Action / Route Handler で使えるよう
//     clerkMiddleware で外側を包む必要がある。
//   - cutover (Phase 7) まで Supabase Auth セッションも維持する。既存ユーザは
//     /auth/login (Supabase) で引き続きログイン可能、`requireUser()` 内で
//     Clerk → Supabase の順に fallback して内部 user_id を解決する
//     (`src/lib/db/neon.ts:requireUser`)。
//
// TODO (Phase 5): Section 8.1.1 Layer 2 — WRITE_FREEZE_ACTIVE=true 中は
//   mutating method (POST/PUT/PATCH/DELETE) を 503 で blocking する。
export default clerkMiddleware(async (_auth, request) => {
  return await updateSession(request);
});

export const config = {
  // matcher から /api/diag/* と /api/webhooks/* を除外 (Section 8.1.5 / 11.1)
  // 理由:
  //   - /api/diag/*: cutover 検証用 (admin token 必須、middleware 経由しない)
  //   - /api/webhooks/*: Clerk webhook (svix 署名で代替認証、middleware 不要)
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/diag/|api/webhooks/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
