import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* コース名 + 保存状態 */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-32" />
      </div>

      {/* ホールナビゲーション */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-12 w-12 rounded-lg" />
        <div className="text-center space-y-1">
          <Skeleton className="h-8 w-24 mx-auto" />
          <Skeleton className="h-5 w-20 mx-auto" />
        </div>
        <Skeleton className="h-12 w-12 rounded-lg" />
      </div>

      {/* スコアサマリー */}
      <Skeleton className="h-16 w-full rounded-lg" />

      {/* 総打数ステッパー */}
      <div className="space-y-1">
        <Skeleton className="h-4 w-12 mx-auto" />
        <div className="flex items-center justify-center gap-3">
          <Skeleton className="h-14 w-14 rounded-lg" />
          <Skeleton className="h-10 w-12" />
          <Skeleton className="h-14 w-14 rounded-lg" />
        </div>
      </div>

      {/* パットステッパー */}
      <div className="space-y-1">
        <Skeleton className="h-4 w-10 mx-auto" />
        <div className="flex items-center justify-center gap-3">
          <Skeleton className="h-14 w-14 rounded-lg" />
          <Skeleton className="h-10 w-12" />
          <Skeleton className="h-14 w-14 rounded-lg" />
        </div>
      </div>

      {/* ショット記録アコーディオン */}
      <Skeleton className="h-12 w-full rounded-lg" />

      {/* ミニスコアカード */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <div className="grid grid-cols-9 gap-1">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
        <div className="grid grid-cols-9 gap-1">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
      </div>
    </div>
  );
}
