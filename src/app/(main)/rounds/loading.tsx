import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* ヘッダー + 統計ボタン */}
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-12 w-20 rounded-lg" />
      </div>

      {/* ラウンドカードリスト */}
      <div className="space-y-3">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
          >
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-8 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
