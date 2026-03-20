import { PlayBottomNav } from '@/components/layout/play-bottom-nav';

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* プレー中画面: 高コントラスト、大きなフォント、暗い背景 */}
      <main className="pb-20 px-4 py-4">
        {children}
      </main>

      <PlayBottomNav />
    </div>
  );
}
