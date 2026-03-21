'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { completeRound } from '@/actions/round';

interface CompleteRoundFormProps {
  roundId: string;
}

export function CompleteRoundForm({ roundId }: CompleteRoundFormProps) {
  const [state, formAction, isPending] = useActionState(completeRound, null);

  return (
    <div className="space-y-3">
      {state?.error && (
        <div className="rounded-lg bg-red-900/50 border border-red-700 p-4 text-red-200">
          {state.error}
        </div>
      )}

      <form action={formAction}>
        <input type="hidden" name="roundId" value={roundId} />
        <button
          type="submit"
          disabled={isPending}
          className="w-full min-h-[56px] flex items-center justify-center gap-3 rounded-lg bg-green-600 px-6 py-4 text-xl font-bold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <CheckCircle className="h-6 w-6" />
          {isPending ? '処理中...' : 'ラウンド完了'}
        </button>
      </form>

      <Link
        href={`/play/${roundId}/score`}
        className="w-full min-h-[48px] flex items-center justify-center gap-3 rounded-lg bg-gray-700 px-6 py-3 text-lg font-bold text-gray-200 hover:bg-gray-600 transition-colors"
      >
        <ArrowLeft className="h-5 w-5" />
        スコア入力に戻る
      </Link>
    </div>
  );
}
