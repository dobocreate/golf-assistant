import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { logout } from '@/actions/auth';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <section className="flex min-h-[80vh] flex-col items-center justify-center p-8">
        <h1 className="text-4xl font-bold mb-4">Golf Assistant</h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8">
          AIキャディーがあなたのプレーをサポート
        </p>
        <Link
          href="/auth/login"
          className="rounded-lg bg-primary px-6 py-3 text-primary-foreground font-medium hover:opacity-90 transition-opacity"
        >
          ログイン
        </Link>
      </section>
    );
  }

  return (
    <section className="flex min-h-[80vh] flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">Golf Assistant</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
        ようこそ、{user.email} さん
      </p>
      <form action={logout}>
        <button
          type="submit"
          className="rounded-lg border border-gray-300 dark:border-gray-700 px-6 py-2.5 font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        >
          ログアウト
        </button>
      </form>
    </section>
  );
}
