import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-md mx-auto space-y-6">
      {/* ラウンド情報ヘッダー */}
      <div className="rounded-lg bg-gray-800 border border-gray-700 p-4 space-y-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-24" />
      </div>

      {/* 3つのアクションボタン */}
      <div className="space-y-3">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}
