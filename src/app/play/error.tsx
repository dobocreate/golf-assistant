'use client';

import Link from 'next/link';

export default function PlayError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
      <p className="text-5xl font-bold text-red-500">Error</p>
      <h1 className="text-xl font-bold text-white">エラーが発生しました</h1>
      <p className="text-gray-400 text-center text-sm max-w-md">
        予期しないエラーが発生しました。
        {error.digest && (
          <span className="block text-xs text-gray-500 mt-1">エラーID: {error.digest}</span>
        )}
      </p>
      <div className="flex gap-3 mt-4">
        <button
          onClick={reset}
          className="rounded-lg bg-green-600 px-6 py-3 text-white font-medium hover:bg-green-500 transition-colors"
        >
          もう一度試す
        </button>
        <Link
          href="/play"
          className="rounded-lg bg-gray-700 px-6 py-3 text-gray-200 font-medium hover:bg-gray-600 transition-colors"
        >
          プレー画面に戻る
        </Link>
      </div>
    </div>
  );
}
