import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="space-y-8">
      {/* プロファイルセクション */}
      <div>
        <Skeleton className="h-8 w-36 mb-6" />
        {/* フォーム枠 */}
        <div className="space-y-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          ))}
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
      </div>

      {/* クラブ一覧セクション */}
      <div>
        <Skeleton className="h-7 w-28 mb-4" />
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-gray-700 p-3"
            >
              <div className="space-y-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
