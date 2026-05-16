import { SignUp } from '@clerk/nextjs';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'サインアップ (Clerk) | Golf Assistant',
};

// Phase 7 cutover 準備用の Clerk サインアップページ (`/clerk-sign-in` ペア)。
// Clerk dashboard で email OTP 等の認証手段を有効化済みであれば、このページから
// 新規登録できる。kishida 既存ユーザは「Clerk で同じメールでサインアップ →
// profiles.clerk_user_id を手動更新で内部 UUID と紐付け」の流れで移行する。
export default function ClerkSignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <SignUp
        path="/clerk-sign-up"
        routing="path"
        signInUrl="/clerk-sign-in"
        fallbackRedirectUrl="/"
      />
    </main>
  );
}
