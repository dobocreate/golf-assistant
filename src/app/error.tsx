'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
      <p className="text-5xl font-bold text-red-300 dark:text-red-600">Error</p>
      <h1 className="text-xl font-bold">エラーが発生しました</h1>
      <p className="text-gray-500 text-center text-sm max-w-md">
        予期しないエラーが発生しました。もう一度お試しください。
        {error.digest && (
          <span className="block text-xs text-gray-400 mt-1">エラーID: {error.digest}</span>
        )}
      </p>
      <button
        onClick={reset}
        className="mt-4 rounded-lg bg-primary px-6 py-3 text-primary-foreground font-medium hover:opacity-90 transition-colors"
      >
        もう一度試す
      </button>
    </div>
  );
}
