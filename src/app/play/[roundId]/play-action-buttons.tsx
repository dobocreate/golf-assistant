'use client';

import Link from 'next/link';
import { Pencil, ClipboardList, CheckCircle, Pause } from 'lucide-react';

export function PlayActionButtons({ roundId }: { roundId: string }) {
  return (
    <>
      {/* FABカラム（右側固定） */}
      <div className="fixed right-4 z-40 bottom-[var(--play-nav-height)] mb-3 flex flex-col gap-3 items-end">
        <Link
          href={`/play/${roundId}/score`}
          className="flex items-center justify-center h-12 w-12 rounded-full shadow-lg bg-green-600 text-white hover:bg-green-500 active:bg-green-700 transition-colors"
          aria-label="スコア入力"
        >
          <Pencil className="h-5 w-5" />
        </Link>
        <Link
          href={`/play/${roundId}/scorecard`}
          className="flex items-center justify-center h-12 w-12 rounded-full shadow-lg bg-blue-600 text-white hover:bg-blue-500 active:bg-blue-700 transition-colors"
          aria-label="スコアカード"
        >
          <ClipboardList className="h-5 w-5" />
        </Link>
        <Link
          href="/"
          className="flex items-center justify-center h-12 w-12 rounded-full shadow-lg bg-gray-700 text-white hover:bg-gray-600 active:bg-gray-800 transition-colors"
          aria-label="ラウンド中断"
        >
          <Pause className="h-5 w-5" />
        </Link>
        <Link
          href={`/play/${roundId}/complete`}
          className="flex items-center justify-center h-12 w-12 rounded-full shadow-lg bg-red-600 text-white hover:bg-red-500 active:bg-red-700 transition-colors"
          aria-label="ラウンド完了"
        >
          <CheckCircle className="h-5 w-5" />
        </Link>
      </div>

      {/* スペーサー */}
      <div className="h-32" />
    </>
  );
}
