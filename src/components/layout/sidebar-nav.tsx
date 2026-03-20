'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { logout } from '@/actions/auth';
import { mainNavItems } from './nav-items';

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex md:w-[var(--sidebar-width)] md:flex-col md:fixed md:inset-y-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950">
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center h-16 px-4 border-b border-gray-200 dark:border-gray-800">
          <Link href="/" className="text-lg font-bold text-primary">
            Golf Assistant
          </Link>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1" aria-label="メインナビゲーション">
          {mainNavItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Icon className="h-5 w-5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 dark:border-gray-800 p-2">
          <form action={logout}>
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <LogOut className="h-5 w-5 shrink-0" />
              ログアウト
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
