import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ヘッダー + 新規ボタン */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-12 w-24 rounded-lg" />
      </div>

      {/* カテゴリタブ */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-full" />
        ))}
      </div>

      {/* ナレッジリスト */}
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2"
          >
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-5 w-12 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
