'use client';

import { Loader2, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SaveStatusIndicatorProps {
  status: 'idle' | 'saving' | 'saved' | 'error';
  tone?: 'light' | 'dark';
  onRetry?: () => void;
  compact?: boolean;
  showLabel?: boolean;
  errorLabel?: string;
  retryLabel?: string;
  className?: string;
}

const toneColors = {
  light: { saving: 'text-gray-500', saved: 'text-green-600', error: 'text-red-600', errorHover: 'hover:text-red-500' },
  dark: { saving: 'text-gray-400', saved: 'text-green-400', error: 'text-red-400', errorHover: 'hover:text-red-300' },
} as const;

export function SaveStatusIndicator({
  status,
  tone = 'dark',
  onRetry,
  compact = false,
  showLabel = true,
  errorLabel = '保存失敗',
  retryLabel = 'タップで再試行',
  className,
}: SaveStatusIndicatorProps) {
  if (status === 'idle') return null;

  const iconSize = compact ? 'h-3 w-3' : 'h-4 w-4';
  const colors = toneColors[tone];

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {status === 'saving' && (
        <>
          <Loader2 className={cn(iconSize, 'animate-spin', colors.saving)} />
          {showLabel && <span className={cn('text-xs', colors.saving)}>保存中</span>}
        </>
      )}
      {status === 'saved' && (
        <>
          <Check className={cn(iconSize, colors.saved)} />
          {showLabel && <span className={cn('text-xs', colors.saved)}>保存済み</span>}
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className={cn(iconSize, colors.error)} />
          {showLabel && (
            onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={cn('text-xs underline', colors.error, colors.errorHover)}
              >
                {errorLabel} - {retryLabel}
              </button>
            ) : (
              <span className={cn('text-xs', colors.error)}>{errorLabel}</span>
            )
          )}
        </>
      )}
    </span>
  );
}
