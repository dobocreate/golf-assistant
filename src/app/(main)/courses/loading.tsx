import { Skeleton, SkeletonCard } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-8">
      {/* 検索セクション */}
      <div>
        <Skeleton className="h-8 w-36 mb-4" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>

      {/* 保存済みコース */}
      <div>
        <Skeleton className="h-7 w-40 mb-4" />
        <div className="grid gap-3 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );
}
