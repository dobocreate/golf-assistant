import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-md mx-auto space-y-4">
      {/* ホールヘッダー (戻る / Hole X / 次へ) */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="text-center space-y-1">
          <Skeleton className="h-6 w-20 mx-auto" />
          <Skeleton className="h-3 w-28 mx-auto" />
        </div>
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>

      {/* 打数ボタングリッド */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-12" />
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      </div>

      {/* パットボタン */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-12" />
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      </div>

      {/* ティーショット方向 */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        <div className="grid grid-cols-3 gap-2 max-w-[180px] mx-auto">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-10 rounded-lg" />
          ))}
        </div>
      </div>

      {/* FW / GIR トグル */}
      <div className="flex gap-3">
        <Skeleton className="h-12 flex-1 rounded-lg" />
        <Skeleton className="h-12 flex-1 rounded-lg" />
      </div>

      {/* 保存ボタン */}
      <Skeleton className="h-14 w-full rounded-lg" />
    </div>
  );
}
