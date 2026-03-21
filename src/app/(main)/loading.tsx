import {
  Skeleton,
  SkeletonCard,
  SkeletonButton,
} from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ヘッダー */}
      <Skeleton className="h-8 w-48" />

      {/* アクティブラウンドカード */}
      <SkeletonCard />

      {/* 2列アクションボタン */}
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24 rounded-lg" />
        <Skeleton className="h-24 rounded-lg" />
      </div>

      {/* 直近のラウンド */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-20" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}
