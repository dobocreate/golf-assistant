import { PlayLayoutClient } from '@/features/play/components/play-layout-client';

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <PlayLayoutClient>{children}</PlayLayoutClient>;
}
