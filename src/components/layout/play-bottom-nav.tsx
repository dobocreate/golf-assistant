'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flag, Pencil, Grid3x3, Home } from 'lucide-react';

export function PlayBottomNav() {
  const pathname = usePathname();

  // /play/[roundId] からroundIdを抽出
  const roundIdMatch = pathname.match(/^\/play\/([0-9a-f-]{36})/);
  const roundId = roundIdMatch?.[1];

  const navItems = roundId
    ? [
        { href: `/play/${roundId}`, label: '設定', icon: Flag, exact: true },
        { href: `/play/${roundId}/score`, label: 'スコア', icon: Pencil, exact: false },
        { href: `/play/${roundId}/scorecard`, label: 'カード', icon: Grid3x3, exact: false },
        { href: '/', label: '戻る', icon: Home, exact: true },
      ]
    : [
        { href: '/play', label: '設定', icon: Flag, exact: true },
        { href: '/', label: '戻る', icon: Home, exact: true },
      ];

  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-700 z-50 pb-[env(safe-area-inset-bottom)]"
      aria-label="プレー中ナビゲーション"
    >
      <div className="flex justify-around">
        {navItems.map((item) => {
          const isActive =
            item.href === '/'
              ? false
              : item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-h-[56px] min-w-[56px] py-2 px-3 text-xs font-bold transition-colors ${
                isActive
                  ? 'text-green-400'
                  : 'text-gray-300'
              }`}
            >
              <Icon className="h-6 w-6 mb-0.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
