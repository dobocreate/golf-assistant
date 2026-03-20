'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { mainNavItems } from './nav-items';

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 z-50"
      aria-label="モバイルナビゲーション"
    >
      <div className="flex justify-around">
        {mainNavItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center justify-center min-h-[48px] min-w-[48px] py-2 px-3 text-xs font-medium transition-colors ${
                isActive
                  ? 'text-primary'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <Icon className="h-5 w-5 mb-0.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
