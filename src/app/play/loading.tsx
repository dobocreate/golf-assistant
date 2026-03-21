import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6">
      {/* アイコン */}
      <Skeleton className="h-16 w-16 rounded-lg" />

      {/* タイトル */}
      <Skeleton className="h-8 w-32" />

      {/* ボタン */}
      <div className="w-full max-w-md space-y-4">
        <Skeleton className="h-4 w-3/4 mx-auto" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    </div>
  );
}
