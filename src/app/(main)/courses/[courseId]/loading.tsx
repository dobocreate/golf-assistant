import { Skeleton, SkeletonListItem } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-6">
      {/* 戻るリンク */}
      <Skeleton className="h-4 w-24" />

      {/* コースヘッダー */}
      <div className="flex items-start gap-4">
        <Skeleton className="h-[120px] w-[160px] rounded-lg shrink-0" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>

      {/* ホール情報 */}
      <div>
        <Skeleton className="h-7 w-32 mb-4" />
        <Skeleton className="h-10 w-full rounded-lg mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 9 }, (_, i) => (
            <SkeletonListItem key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
