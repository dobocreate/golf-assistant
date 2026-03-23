import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
      <p className="text-6xl font-bold text-gray-300 dark:text-gray-600">404</p>
      <h1 className="text-xl font-bold">ページが見つかりません</h1>
      <p className="text-gray-500 text-center">
        お探しのページは存在しないか、移動した可能性があります。
      </p>
      <Link
        href="/"
        className="mt-4 rounded-lg bg-primary px-6 py-3 text-primary-foreground font-medium hover:opacity-90 transition-colors"
      >
        ホームに戻る
      </Link>
    </div>
  );
}
