import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  // TODO (Phase 5): Section 8.1.1 Layer 2 — WRITE_FREEZE_ACTIVE=true 中は
  //   mutating method (POST/PUT/PATCH/DELETE) を 503 で blocking する。
  //   詳細実装は Phase 5 で Clerk middleware と統合時に追加する。
  return await updateSession(request);
}

export const config = {
  // matcher から /api/diag/* と /api/webhooks/* を除外 (Section 8.1.5 / 11.1)
  // 理由:
  //   - /api/diag/*: cutover 検証用 (admin token 必須、middleware 経由しない)
  //   - /api/webhooks/*: Clerk webhook (svix 署名で代替認証、middleware 不要)
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/diag/|api/webhooks/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
