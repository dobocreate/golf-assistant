import type { Viewport } from 'next';
import { PlayLayoutClient } from '@/features/play/components/play-layout-client';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <PlayLayoutClient>{children}</PlayLayoutClient>;
}
