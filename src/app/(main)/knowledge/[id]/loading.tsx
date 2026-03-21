import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 戻るリンク */}
      <Skeleton className="h-4 w-28" />

      {/* タイトル */}
      <Skeleton className="h-8 w-64" />

      {/* カテゴリ + タグ */}
      <div className="flex gap-2">
        <Skeleton className="h-5 w-20 rounded" />
        <Skeleton className="h-5 w-14 rounded" />
      </div>

      {/* コンテンツ */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>

      {/* ソースURL */}
      <Skeleton className="h-4 w-48" />

      {/* アクションボタン */}
      <div className="flex gap-3">
        <Skeleton className="h-10 w-24 rounded-lg" />
        <Skeleton className="h-10 w-24 rounded-lg" />
      </div>
    </div>
  );
}
