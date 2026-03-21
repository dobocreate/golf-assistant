import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* ラウンド情報カード */}
      <div className="rounded-lg bg-gray-800 border border-gray-700 p-3 space-y-1">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-6 w-48" />
      </div>

      {/* ホール選択 */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>

      {/* 状況入力フォーム */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>

      {/* 送信ボタン */}
      <Skeleton className="h-14 w-full rounded-lg" />
    </div>
  );
}
