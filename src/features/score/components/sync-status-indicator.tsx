'use client';

import { RefreshCw, Check, AlertCircle, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SyncStatusIndicatorProps {
  syncStatus: 'idle' | 'syncing' | 'offline' | 'error';
  pendingCount: number;
  isOnline: boolean;
  isProcessing?: boolean;
  idbAvailable?: boolean;
  /** true when there are unsaved local changes (hides "保存済み" badge) */
  isDirty?: boolean;
  onRetry?: () => void;
  compact?: boolean;
  className?: string;
}

/**
 * Derives the visual display state from the combined sync/online/idb props.
 *
 * Priority (highest first):
 *  1. IndexedDB unavailable          -> 'idb-unavailable'
 *  2. Sync error (max retries)       -> 'error'
 *  3. Online + syncing / processing  -> 'syncing'
 *  4. Offline + pending > 0          -> 'offline-pending'
 *  5. Offline + pending == 0         -> 'offline-saved'
 *  6. Online + idle                  -> 'idle' (hidden)
 */
type DisplayState =
  | 'idle'
  | 'synced'
  | 'syncing'
  | 'offline-saved'
  | 'offline-pending'
  | 'error'
  | 'idb-unavailable';

function deriveDisplayState(
  syncStatus: SyncStatusIndicatorProps['syncStatus'],
  pendingCount: number,
  isOnline: boolean,
  isProcessing: boolean,
  idbAvailable: boolean,
  isDirty: boolean,
): DisplayState {
  if (!idbAvailable) return 'idb-unavailable';
  if (syncStatus === 'error') return 'error';
  if (syncStatus === 'syncing' || isProcessing) return 'syncing';
  if (!isOnline || syncStatus === 'offline') {
    return pendingCount > 0 ? 'offline-pending' : 'offline-saved';
  }
  if (pendingCount > 0) return 'offline-pending';
  // Online + idle + no pending: show "synced" badge unless dirty
  if (!isDirty) return 'synced';
  return 'idle';
}

export function SyncStatusIndicator({
  syncStatus,
  pendingCount,
  isOnline,
  isProcessing = false,
  idbAvailable = true,
  isDirty = false,
  onRetry,
  compact = false,
  className,
}: SyncStatusIndicatorProps) {
  const state = deriveDisplayState(
    syncStatus,
    pendingCount,
    isOnline,
    isProcessing,
    idbAvailable,
    isDirty,
  );

  // Dirty + online + idle: nothing to show
  if (state === 'idle') return null;

  const iconSize = compact ? 'h-3 w-3' : 'h-3.5 w-3.5';
  const textSize = compact ? 'text-[10px]' : 'text-xs';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 transition-all duration-300',
        className,
      )}
    >
      {state === 'synced' && (
        <>
          <Check className={cn(iconSize, 'text-emerald-400')} />
          <span className={cn(textSize, 'text-emerald-400 font-medium')}>
            保存済み
          </span>
        </>
      )}

      {state === 'syncing' && (
        <RefreshCw
          className={cn(iconSize, 'animate-spin text-blue-400')}
          aria-label="同期中"
        />
      )}

      {state === 'offline-saved' && (
        <>
          <Check className={cn(iconSize, 'text-emerald-400')} />
          <span className={cn(textSize, 'text-emerald-400 font-medium')}>
            端末に保存済み
          </span>
        </>
      )}

      {state === 'offline-pending' && (
        <>
          <WifiOff className={cn(iconSize, 'text-amber-400')} />
          <span className={cn(textSize, 'text-amber-400')}>
            {pendingCount}件の変更を同期待ち
          </span>
        </>
      )}

      {state === 'error' && (
        <>
          <AlertCircle className={cn(iconSize, 'text-rose-400')} />
          <span className={cn(textSize, 'text-rose-400')}>
            同期に失敗しました
          </span>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={cn(
                textSize,
                'ml-0.5 text-rose-400 underline hover:text-rose-300 transition-colors',
              )}
            >
              再試行
            </button>
          )}
        </>
      )}

      {state === 'idb-unavailable' && (
        <>
          <Loader2 className={cn(iconSize, 'text-amber-400')} />
          <span className={cn(textSize, 'text-amber-400')}>
            一時保存モード
          </span>
        </>
      )}
    </span>
  );
}
