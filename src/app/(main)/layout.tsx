import { SidebarNav } from '@/components/layout/sidebar-nav';
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <SidebarNav />

      {/* メインコンテンツ: PC時はサイドバー分のマージン */}
      <main className="md:pl-[var(--sidebar-width)]">
        <div className="mx-auto max-w-4xl px-4 py-6">{children}</div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
