import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

/** 汎用スケルトンブロック */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse rounded bg-gray-200 dark:bg-gray-800', className)} />
  );
}

/** テキスト行のスケルトン */
export function SkeletonText({ className }: SkeletonProps) {
  return <Skeleton className={cn('h-4 w-3/4', className)} />;
}

/** カード型スケルトン */
export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('rounded-lg border border-gray-200 dark:border-gray-800 p-4 space-y-3', className)}>
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

/** 統計カード型スケルトン */
export function SkeletonStatCard({ className }: SkeletonProps) {
  return (
    <div className={cn('rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-center space-y-2', className)}>
      <Skeleton className="h-3 w-16 mx-auto" />
      <Skeleton className="h-8 w-12 mx-auto" />
    </div>
  );
}

/** ボタン型スケルトン */
export function SkeletonButton({ className }: SkeletonProps) {
  return <Skeleton className={cn('h-12 w-full rounded-lg', className)} />;
}

/** テーブル行スケルトン */
export function SkeletonTableRow({ cols = 6, className }: SkeletonProps & { cols?: number }) {
  return (
    <div className={cn('flex gap-2 py-2', className)}>
      {Array.from({ length: cols }, (_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  );
}

/** リストアイテムスケルトン */
export function SkeletonListItem({ className }: SkeletonProps) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border border-gray-200 dark:border-gray-800 p-3', className)}>
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}
