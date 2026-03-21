import { Skeleton, SkeletonTableRow } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* 戻るリンク */}
      <Skeleton className="h-4 w-28" />

      {/* タイトル */}
      <Skeleton className="h-8 w-36" />

      {/* スコア推移テーブル */}
      <section className="space-y-3">
        <Skeleton className="h-6 w-28" />
        <div>
          <SkeletonTableRow cols={4} />
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonTableRow key={i} cols={4} />
          ))}
        </div>
      </section>

      {/* 前半/後半比較 */}
      <section className="space-y-3">
        <Skeleton className="h-6 w-36" />
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center space-y-2">
            <Skeleton className="h-3 w-16 mx-auto" />
            <Skeleton className="h-9 w-16 mx-auto" />
            <Skeleton className="h-3 w-full rounded-full" />
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center space-y-2">
            <Skeleton className="h-3 w-16 mx-auto" />
            <Skeleton className="h-9 w-16 mx-auto" />
            <Skeleton className="h-3 w-full rounded-full" />
          </div>
        </div>
      </section>

      {/* Par別平均 */}
      <section className="space-y-3">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-2"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-24" />
            </div>
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </section>
    </div>
  );
}
