'use client';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }; // Next.js requires this prop
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 bg-white text-gray-900">
        <p className="text-5xl font-bold text-red-400">Error</p>
        <h1 className="text-xl font-bold">アプリケーションエラー</h1>
        <p className="text-gray-500 text-center text-sm">
          予期しないエラーが発生しました。ページを再読み込みしてください。
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-green-600 px-6 py-3 text-white font-medium hover:bg-green-500 transition-colors"
        >
          再読み込み
        </button>
      </body>
    </html>
  );
}
