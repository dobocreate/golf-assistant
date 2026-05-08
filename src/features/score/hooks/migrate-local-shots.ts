'use client';

import { entries } from 'idb-keyval';
import {
  dataStore,
  syncStore,
  setToDataStore,
  LOCAL_SHOT_SCHEMA_VERSION,
  type LocalShot,
} from '@/lib/offline-store';
import { syncQueue, type SyncQueueItem } from '@/lib/sync-queue';

/**
 * LocalShot の schemaVersion 整合性確保用ランタイム migration
 *
 * Sprint 5 PR2 で LocalShot に GPS 関連 13 列を追加したため、
 * 旧 LocalShot が IndexedDB に残っている場合は null 補完して書き戻す。
 *
 * idb-keyval は Dexie のような version bump 機構を持たないため、
 * 起動時に明示的に呼び出して migration を行う必要がある。
 *
 * Sync queue の旧 payload（GPS 列を持たない `replaceShotsForHole`）は
 * 破棄する。次回 use-recovery が IDB から再構築して再 enqueue する。
 *
 * ※ idempotent — 何度呼び出しても既に最新版なら何もしない
 */
export async function migrateLocalShotsToCurrentSchema(): Promise<{
  migratedRoundCount: number;
  droppedQueueItemCount: number;
}> {
  let migratedRoundCount = 0;
  let droppedQueueItemCount = 0;

  // (1) shots:* キーを走査して LocalShot[] を更新
  const shotsEntries = await entries<string, Map<number, LocalShot[]>>(dataStore);
  for (const [key, holeMap] of shotsEntries) {
    if (typeof key !== 'string' || !key.startsWith('shots:')) continue;
    if (!(holeMap instanceof Map)) continue;

    let needsWriteBack = false;
    const migrated = new Map<number, LocalShot[]>();

    for (const [holeNumber, shots] of holeMap) {
      const updated = shots.map((s) => {
        if (s.schemaVersion === LOCAL_SHOT_SCHEMA_VERSION) return s;
        needsWriteBack = true;
        return {
          ...s,
          // GPS 関連列の null 補完（型に存在するが値がない場合のみ）
          latitude: s.latitude ?? null,
          longitude: s.longitude ?? null,
          gps_accuracy_m: s.gps_accuracy_m ?? null,
          captured_at: s.captured_at ?? null,
          auto_lie: s.auto_lie ?? null,
          remaining_to_green_m: s.remaining_to_green_m ?? null,
          gps_source: s.gps_source ?? null,
          original_latitude: s.original_latitude ?? null,
          original_longitude: s.original_longitude ?? null,
          edited_at: s.edited_at ?? null,
          auto_lie_confidence: s.auto_lie_confidence ?? null,
          position_revision: s.position_revision ?? 0,
          auto_lie_calculated_at: s.auto_lie_calculated_at ?? null,
          schemaVersion: LOCAL_SHOT_SCHEMA_VERSION,
        } as LocalShot;
      });
      migrated.set(holeNumber, updated);
    }

    if (needsWriteBack) {
      await setToDataStore(key as `shots:${string}`, migrated);
      migratedRoundCount++;
    }
  }

  // (2) Sync queue の旧 payload（replaceShotsForHole で GPS キーがないもの）を破棄
  // 次回 use-recovery で IDB から最新版を再構築・再 enqueue する
  const queueEntries = await entries<string, SyncQueueItem>(syncStore);
  for (const [, item] of queueEntries) {
    if (item.action !== 'replaceShotsForHole') continue;

    const payload = item.payload as { shots?: Array<Record<string, unknown>> } | undefined;
    const firstShot = payload?.shots?.[0];

    // 旧 payload は GPS 関連キーが存在しない（undefined）
    // GPS が記録されていない新しいショットでも latitude/longitude が null として明示的に存在する
    // latitude / longitude のどちらかが欠けていれば legacy または壊れた payload と判定
    if (firstShot && (!('latitude' in firstShot) || !('longitude' in firstShot))) {
      await syncQueue.remove(item.id);
      droppedQueueItemCount++;
    }
  }

  return { migratedRoundCount, droppedQueueItemCount };
}
