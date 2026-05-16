import { SignIn } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'ログイン (Clerk) | Golf Assistant',
};

// Phase 7 cutover 準備用の Clerk サインインページ。
// 既存の Supabase ベース /auth/login と並走させて、kishida が Clerk アカウントを
// 作成・テストできるようにする。`[[...sign-in]]` はキャッチオール (Clerk の OAuth
// リダイレクトや 2FA 中継などサブパスを許容するため、Clerk 公式推奨)。
//
// 切替手順:
//   1. .env.local に NEXT_PUBLIC_CLERK_SIGN_IN_URL=/clerk-sign-in を設定
//   2. 必要なら NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/ を設定
//   3. このページから Clerk でサインアップ → profiles.clerk_user_id を手動更新で
//      既存ユーザに紐付け (計画書 Phase 1 B-2 / Section 4.0)
export default function ClerkSignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <SignIn
        path="/clerk-sign-in"
        routing="path"
        signUpUrl="/clerk-sign-up"
        fallbackRedirectUrl="/"
      />
    </main>
  );
}
