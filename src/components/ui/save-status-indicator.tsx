'use client';

import { Loader2, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SaveStatusIndicatorProps {
  status: 'idle' | 'saving' | 'saved' | 'error';
  onRetry?: () => void;
  compact?: boolean;
  showLabel?: boolean;
  errorLabel?: string;
  retryLabel?: string;
  className?: string;
}

export function SaveStatusIndicator({
  status,
  onRetry,
  compact = false,
  showLabel = true,
  errorLabel = '保存失敗',
  retryLabel = 'タップで再試行',
  className,
}: SaveStatusIndicatorProps) {
  if (status === 'idle') return null;

  const iconSize = compact ? 'h-3 w-3' : 'h-4 w-4';

  return (
    <span className={cn('inline-flex items-center gap-1', className)}>
      {status === 'saving' && (
        <>
          <Loader2 className={cn(iconSize, 'animate-spin text-gray-400')} />
          {showLabel && <span className="text-xs text-gray-400">保存中</span>}
        </>
      )}
      {status === 'saved' && (
        <>
          <Check className={cn(iconSize, 'text-green-400')} />
          {showLabel && <span className="text-xs text-green-400">保存済み</span>}
        </>
      )}
      {status === 'error' && (
        <>
          <AlertCircle className={cn(iconSize, 'text-red-400')} />
          {showLabel && (
            onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className="text-xs text-red-400 hover:text-red-300 underline"
              >
                {errorLabel} - {retryLabel}
              </button>
            ) : (
              <span className="text-xs text-red-400">{errorLabel}</span>
            )
          )}
        </>
      )}
    </span>
  );
}
