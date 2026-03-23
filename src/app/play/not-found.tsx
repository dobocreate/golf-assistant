import Link from 'next/link';

export default function PlayNotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4">
      <p className="text-6xl font-bold text-gray-600">404</p>
      <h1 className="text-xl font-bold text-white">ページが見つかりません</h1>
      <p className="text-gray-400 text-center">
        お探しのラウンドは存在しないか、削除された可能性があります。
      </p>
      <Link
        href="/play"
        className="mt-4 rounded-lg bg-green-600 px-6 py-3 text-white font-medium hover:bg-green-500 transition-colors"
      >
        プレー画面に戻る
      </Link>
    </div>
  );
}
