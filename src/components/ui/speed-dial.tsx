'use client';

import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

type ActionVariant = 'primary' | 'secondary' | 'danger';

interface SpeedDialAction {
  /** ユニークキー */
  key: string;
  /** アイコン（lucide-react等） */
  icon: ReactNode;
  /** ラベル（ツールチップ的に左に表示） */
  label: string;
  /** クリック時の処理（hrefがあればリンク、なければボタン） */
  onClick?: () => void;
  href?: string;
  /** 無効状態 */
  disabled?: boolean;
  /** ボタンの色バリアント */
  variant?: ActionVariant;
}

interface SpeedDialProps {
  /** メインボタンのアイコン（開いてない時） */
  icon?: ReactNode;
  /** メインボタンのラベル（アクセシビリティ用） */
  label?: string;
  /** 展開時のアクション一覧（下から上に並ぶ） */
  actions: SpeedDialAction[];
  /** コンテナ位置の追加クラス */
  className?: string;
  /** PlayBottomNavの上に表示するか（play画面用） */
  aboveNav?: boolean;
}

const variantStyles: Record<ActionVariant, string> = {
  primary: 'bg-green-600 text-white hover:bg-green-500 active:bg-green-700',
  secondary: 'bg-gray-700 text-gray-200 hover:bg-gray-600 active:bg-gray-800',
  danger: 'bg-red-600 text-white hover:bg-red-500 active:bg-red-700',
};

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600';

export function SpeedDial({
  icon,
  label = 'メニューを開く',
  actions,
  className,
  aboveNav = false,
}: SpeedDialProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const toggle = useCallback(() => setOpen((prev) => !prev), []);

  // 外側タップで閉じる
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [open]);

  const positionClass = cn(
    'fixed right-4 z-40',
    aboveNav ? 'bottom-[var(--play-nav-height)] mb-3' : 'bottom-6',
    className,
  );

  // アクションが1つだけの場合はSpeed Dialにせず直接表示
  if (actions.length === 1) {
    const action = actions[0];
    const style = cn(
      'min-h-[48px] min-w-[48px] flex items-center justify-center rounded-full shadow-lg transition-colors',
      focusRing,
      variantStyles[action.variant ?? 'primary'],
      action.disabled && 'opacity-50 cursor-not-allowed',
    );
    const content = (
      <>
        {action.icon}
        <span className="sr-only">{action.label}</span>
      </>
    );

    return (
      <div className={positionClass}>
        {action.href ? (
          <Link href={action.href} className={style}>{content}</Link>
        ) : (
          <button onClick={action.onClick} disabled={action.disabled} className={style}>
            {content}
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={positionClass}>
      {/* オーバーレイ（展開時） */}
      {open && (
        <div
          className="fixed inset-0 bg-black/30 z-[-1]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* アクション一覧（下から上に展開） */}
      <div
        className={cn(
          'flex flex-col-reverse items-end gap-2 mb-2 transition-all duration-200',
          open
            ? 'opacity-100 translate-y-0 pointer-events-auto'
            : 'opacity-0 translate-y-4 pointer-events-none',
        )}
      >
        {actions.map((action) => {
          const style = cn(
            'flex items-center gap-2 rounded-full shadow-lg transition-colors px-4 py-2.5 text-sm font-bold whitespace-nowrap',
            focusRing,
            variantStyles[action.variant ?? 'primary'],
            action.disabled && 'opacity-50 cursor-not-allowed',
          );
          const content = (
            <>
              {action.icon}
              {action.label}
            </>
          );

          return action.href ? (
            <Link
              key={action.key}
              href={action.href}
              className={style}
              onClick={() => setOpen(false)}
            >
              {content}
            </Link>
          ) : (
            <button
              key={action.key}
              onClick={() => {
                action.onClick?.();
                setOpen(false);
              }}
              disabled={action.disabled}
              className={style}
            >
              {content}
            </button>
          );
        })}
      </div>

      {/* メインボタン */}
      <button
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          'ml-auto flex items-center justify-center h-14 w-14 rounded-full shadow-lg transition-all duration-200',
          focusRing,
          'bg-green-600 text-white hover:bg-green-500 active:bg-green-700',
        )}
      >
        <span
          className={cn(
            'transition-transform duration-200',
            open && 'rotate-45',
          )}
        >
          {icon ?? <Plus className="h-6 w-6" />}
        </span>
      </button>
    </div>
  );
}
