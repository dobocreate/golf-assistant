import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
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
    </main>
  );
}
