import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* ヘッダーカード */}
      <div className="rounded-lg bg-gray-800 border border-gray-700 p-4 space-y-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-24" />
      </div>

      {/* スコアサマリーカード */}
      <div className="rounded-lg bg-gray-800 border border-gray-700 p-4 space-y-3">
        <Skeleton className="h-6 w-36" />
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-4 w-40" />
      </div>

      {/* 完了ボタン */}
      <Skeleton className="h-14 w-full rounded-lg" />
      <Skeleton className="h-12 w-full rounded-lg" />
    </div>
  );
}
