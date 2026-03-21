import {
  Skeleton,
  SkeletonStatCard,
  SkeletonTableRow,
} from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 戻るリンク */}
      <Skeleton className="h-4 w-28" />

      {/* ヘッダー */}
      <div className="flex items-start gap-3">
        <Skeleton className="h-6 w-6 rounded mt-1" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-12 rounded" />
        </div>
      </div>

      {/* 統計カード4列 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
        <SkeletonStatCard />
      </div>

      {/* コピーボタン */}
      <Skeleton className="h-10 w-full rounded-lg" />

      {/* スコアテーブル */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-28" />
        {/* OUT */}
        <div className="overflow-x-auto">
          <SkeletonTableRow cols={11} />
          <SkeletonTableRow cols={11} />
          <SkeletonTableRow cols={11} />
        </div>
        {/* IN */}
        <div className="overflow-x-auto">
          <SkeletonTableRow cols={11} />
          <SkeletonTableRow cols={11} />
          <SkeletonTableRow cols={11} />
        </div>
      </div>
    </div>
  );
}
