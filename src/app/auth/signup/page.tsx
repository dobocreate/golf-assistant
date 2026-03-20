'use client';

import { useState } from 'react';
import Link from 'next/link';
import { signup } from '@/actions/auth';

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    setSuccess(null);
    const result = await signup(formData);
    if (result?.error) {
      setError(result.error);
    } else if (result?.success) {
      setSuccess(result.success);
    }
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">サインアップ</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            新しいアカウントを作成
          </p>
        </div>

        {success ? (
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 p-4 text-center">
            <p role="status" className="text-sm text-green-700 dark:text-green-400">{success}</p>
          </div>
        ) : (
          <form action={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1">
                メールアドレス
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1">
                パスワード（8文字以上）
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                minLength={8}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base dark:border-gray-700 dark:bg-gray-900"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary py-2.5 text-primary-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {loading ? '作成中...' : 'アカウント作成'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-gray-600 dark:text-gray-400">
          既にアカウントをお持ちの方{' '}
          <Link href="/auth/login" className="text-primary hover:underline">
            ログイン
          </Link>
        </p>
      </div>
    </main>
  );
}
