'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flag, MessageSquare, BarChart3, Home } from 'lucide-react';

const playNavItems = [
  { href: '/play', label: 'プレー', icon: Flag, exact: true },
  { href: '/play/advice', label: 'アドバイス', icon: MessageSquare, exact: false },
  { href: '/play/score', label: 'スコア', icon: BarChart3, exact: false },
  { href: '/', label: '戻る', icon: Home, exact: true },
];

export function PlayBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-700 z-50"
      aria-label="プレー中ナビゲーション"
    >
      <div className="flex justify-around">
        {playNavItems.map((item) => {
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
