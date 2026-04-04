import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionHeader({ children, className }: SectionHeaderProps) {
  return (
    <p className={cn('text-xs font-bold text-gray-400 uppercase tracking-wider', className)}>
      {children}
    </p>
  );
}
