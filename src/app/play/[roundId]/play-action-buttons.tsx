import Link from 'next/link';
import { Pencil, ClipboardList, CheckCircle, Pause } from 'lucide-react';

export function PlayActionButtons({ roundId }: { roundId: string }) {
  return (
    <div className="space-y-3">
      <Link
        href={`/play/${roundId}/score`}
        className="flex items-center gap-3 w-full min-h-[56px] rounded-lg bg-green-600 px-5 py-4 text-lg font-bold text-white hover:bg-green-500 transition-colors"
      >
        <Pencil className="h-5 w-5 flex-shrink-0" />
        スコア入力
      </Link>
      <Link
        href={`/play/${roundId}/scorecard`}
        className="flex items-center gap-3 w-full min-h-[56px] rounded-lg bg-gray-700 px-5 py-4 text-lg font-bold text-white hover:bg-gray-600 transition-colors"
      >
        <ClipboardList className="h-5 w-5 flex-shrink-0" />
        スコアカード
      </Link>
      <Link
        href="/"
        className="flex items-center gap-3 w-full min-h-[56px] rounded-lg bg-gray-800 border border-gray-600 px-5 py-4 text-lg font-bold text-gray-300 hover:bg-gray-700 transition-colors"
      >
        <Pause className="h-5 w-5 flex-shrink-0" />
        ラウンド中断
      </Link>
      <Link
        href={`/play/${roundId}/complete`}
        className="flex items-center gap-3 w-full min-h-[56px] rounded-lg bg-gray-800 border border-gray-600 px-5 py-4 text-lg font-bold text-gray-300 hover:bg-gray-700 transition-colors"
      >
        <CheckCircle className="h-5 w-5 flex-shrink-0" />
        ラウンド完了
      </Link>
    </div>
  );
}
