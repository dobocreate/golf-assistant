'use client';

import { PlayRoundProvider } from '../context/play-round-context';
import { PlayBottomNav } from '@/components/layout/play-bottom-nav';

export function PlayLayoutClient({ children }: { children: React.ReactNode }) {
  return (
    <PlayRoundProvider>
      <div className="min-h-screen bg-gray-950 text-white touch-manipulation">
        <main className="pb-[var(--play-nav-height)] px-4 py-4 overflow-x-hidden">
          {children}
        </main>
        <PlayBottomNav />
      </div>
    </PlayRoundProvider>
  );
}
