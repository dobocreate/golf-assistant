'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * グローバルナビゲーションプログレスバー
 * ページ遷移中に画面上部に細いアニメーションバーを表示する
 */
export function NavProgress() {
  const pathname = usePathname();
  const [isNavigating, setIsNavigating] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // リンククリックで開始
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;
      const href = target.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      if (target.getAttribute('target') === '_blank') return;
      if (target.hasAttribute('download')) return;
      setIsNavigating(true);
    };

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  // pathname 変更で完了（Next.js App Router のクライアントナビゲーション検出）
  useEffect(() => {
    setIsNavigating(false);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, [pathname]);

  // 安全弁: 5秒経っても完了しない場合は非表示
  useEffect(() => {
    if (isNavigating) {
      timeoutRef.current = setTimeout(() => setIsNavigating(false), 5000);
      return () => clearTimeout(timeoutRef.current);
    }
  }, [isNavigating]);

  if (!isNavigating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] h-1" role="progressbar" aria-label="ページ読み込み中">
      <div className="h-full bg-green-500 animate-progress-bar" />
    </div>
  );
}
