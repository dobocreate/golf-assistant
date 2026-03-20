import Link from 'next/link';
import { Flag } from 'lucide-react';

export default function PlayPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-6">
      <Flag className="h-16 w-16 text-green-400" />
      <h1 className="text-2xl font-bold">ラウンド開始</h1>
      <p className="text-gray-300 text-center text-lg">
        コースを選択してプレーを開始しましょう
      </p>
      <Link
        href="/courses"
        className="min-h-[48px] min-w-[200px] flex items-center justify-center rounded-lg bg-green-600 px-8 py-3 text-lg font-bold text-white hover:bg-green-500 transition-colors"
      >
        コースを選択
      </Link>
    </div>
  );
}
