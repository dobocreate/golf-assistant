import { clerkMiddleware } from '@clerk/nextjs/server';
import { NextResponse, type NextRequest } from 'next/server';

// Phase 7 cutover (中間状態): middleware は Clerk のみで完結させる。
//
// 経緯 (2026-05-17):
//   - profiles.clerk_user_id を kishida 用に設定済 (requireUser の Clerk 経路成功)
//   - Supabase project は free tier 上限のため auto-pause 状態
//   - Supabase auth-js は fetch failed で 25 秒リトライするため、middleware 内で
//     Supabase 経路を試行するとリクエストが遅延する。
//   - 結論: middleware は Clerk のみで判定、Supabase Auth 経路は廃止。
//     (Phase 7 cutover 完了の最終形態と同等)
//
// 仕様:
//   - 認証済 (Clerk session あり) + auth page (/clerk-sign-in, /clerk-sign-up, /auth/*)
//     にいる場合は `/` にリダイレクト
//   - 未認証 + 認証必須 path (= auth page 以外かつ公開パス以外) は /clerk-sign-in に
//     リダイレクト
//   - それ以外はそのまま通過
//
// TODO (Phase 5 / Section 8.1.1 Layer 2): WRITE_FREEZE_ACTIVE=true 中は
//   mutating method (POST/PUT/PATCH/DELETE) を 503 で blocking する。

const AUTH_PATHS = ['/auth', '/clerk-sign-in', '/clerk-sign-up'];
const PUBLIC_PATHS = ['/'];

function isAuthPage(pathname: string): boolean {
  // 完全一致 or 直下のサブパス (`/auth/login`) のみ true。
  // `/author` `/authenticated` 等の誤検知を避ける (Gemini PR#242 High 指摘)。
  return AUTH_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'));
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname);
}

export default clerkMiddleware(async (auth, request: NextRequest) => {
  const { userId } = await auth();
  const pathname = request.nextUrl.pathname;
  const onAuthPage = isAuthPage(pathname);
  const onPublicPath = isPublicPath(pathname);

  // 旧 Supabase 時代の /auth/* ブックマーク救済 (PR #243 で実体ページは削除済)。
  // ページが無いので 404 になっていたのを Clerk 用ページにリダイレクトする。
  if (pathname === '/auth' || pathname.startsWith('/auth/')) {
    const url = request.nextUrl.clone();
    url.pathname = userId ? '/' : '/clerk-sign-in';
    return NextResponse.redirect(url);
  }

  // 認証済 + auth page にいる → ダッシュボードへ
  if (userId && onAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  // 未認証 + 認証必須ページ → /clerk-sign-in へ
  if (!userId && !onAuthPage && !onPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/clerk-sign-in';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
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
