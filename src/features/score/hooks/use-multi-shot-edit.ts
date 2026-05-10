'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { Shot, GpsSource } from '@/features/score/types';

/**
 * 未確定の draft 位置
 */
export interface DraftPosition {
  lat: number;
  lng: number;
  source: GpsSource;
  accuracyM: number | null;
  /** 元 DB 値の position_revision (conflict 検知用) */
  baseRevision: number;
}

/**
 * commit 結果型。callback 経由で inject される saveShotPosition の戻り値型に合わせる
 */
export type CommitResult =
  | { ok: true; latestShot?: Shot | null }
  | { ok: false; error: 'conflict' | 'failed'; latestShot?: Shot | null };

/**
 * useMultiShotEdit に inject する位置保存 callback
 *
 * - 保存済みショット (`shotId !== ''`): updateShotPosition を直接呼び出すラッパ
 * - 未保存ショット (`shotId === ''`): ScoreInput 側で form state に dispatch する経路（PR3 で実装）
 *
 * **Strict Mode 安全規約**: callback は 1 回の呼び出しで side effect が 1 回のみ起きる pure な
 * インターフェース。useMultiShotEdit 側で重複呼び出しを防ぐ inflight ガードあり。
 */
export type SaveShotPosition = (input: {
  shot: Shot;
  draft: DraftPosition;
}) => Promise<CommitResult>;

/**
 * useMultiShotEdit に inject する revert callback
 */
export type RevertShotPosition = (shot: Shot) => Promise<CommitResult>;

interface UseMultiShotEditArgs {
  shots: Shot[];
  saveShotPosition: SaveShotPosition;
  revertShotPosition: RevertShotPosition;
}

interface UseMultiShotEditResult {
  /** 現在の shots (commit 成功で更新される最新値) */
  shots: Shot[];
  /** Draft (未確定編集) の Map */
  drafts: Map<string, DraftPosition>;
  /** 選択中ショットの ID。null なら一覧モード */
  selectedShotId: string | null;
  /** commit 進行中のショット ID 集合 */
  savingShotIds: Set<string>;
  /** 直近 commit 失敗時の error ('conflict' / 'failed')。null なら正常 */
  saveError: 'conflict' | 'failed' | null;
  /** マーカータップ: shotId を選択（同じ ID なら解除） */
  select: (shotId: string | null) => void;
  /** ドラッグ中: draft 位置を更新 */
  dragTo: (shotId: string, lat: number, lng: number) => void;
  /** 確定: 当該 shotId の draft を saveShotPosition で永続化 */
  commit: (shotId: string) => Promise<void>;
  /** 全 draft を順次 commit */
  commitAll: () => Promise<void>;
  /** 当該 shotId の draft を破棄（selection は維持） */
  discardDraft: (shotId: string) => void;
  /** 全 draft を破棄（モーダルクローズ時の confirm 後など） */
  discardAllDrafts: () => void;
  /** 元に戻す: revertShotPosition を呼ぶ */
  revert: (shotId: string) => Promise<void>;
  /** 親から shots props 変更が来たときに最新 shots で同期（commit 後の最新値取得用） */
  syncShot: (updated: Shot) => void;
}

/**
 * マルチショット位置編集の state machine。
 *
 * Sprint 6 PR1 (S-6e/F-1) — `MultiShotPositionEditor` モーダルで使う中核ロジック。
 *
 * 設計参照: `_bmad-output/planning-artifacts/sprint6-multi-shot-position-editor.md`
 *   Section 2.3 / 3 / 4
 *
 * **責務**:
 * - shots / drafts / selection / saving の state machine
 * - commit の race / 重複呼び出しガード（inflight ref）
 * - conflict 時の最新値同期 + draft 破棄
 *
 * **責務外**（呼び出し側で対応）:
 * - SVG 描画（`MultiShotOverlay`）
 * - pointer event → lat/lng 変換（`MultiShotPositionEditor`）
 * - モーダル open/close（`MultiShotPositionEditor`）
 * - 未保存ショット (`shotId === ''`) の form state 連携（PR3 で inject 経由）
 */
export function useMultiShotEdit({
  shots: initialShots,
  saveShotPosition,
  revertShotPosition,
}: UseMultiShotEditArgs): UseMultiShotEditResult {
  // shots は props 変更で初期化（モーダル open のたびに新値が来る前提）
  const [shots, setShots] = useState<Shot[]>(initialShots);

  // drafts は useRef で保持して updater 重複実行を回避（Strict Mode 安全）
  const draftsRef = useRef<Map<string, DraftPosition>>(new Map());
  const [, forceRerender] = useReducer((x: number) => x + 1, 0);

  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [savingShotIds, setSavingShotIds] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<'conflict' | 'failed' | null>(null);

  // inflight ref: 同一 shotId への commit を重複実行させない
  const inflightRef = useRef<Map<string, Promise<void>>>(new Map());

  // 親 props の shots 変化を検知して内部 state を同期
  // ホール切替時に props.shots が変わったら、drafts / selection もリセット（M2 防御層）
  // null = 未初期化、初回 mount の no-op を区別する
  const prevShotsKeyRef = useRef<string | null>(null);
  useEffect(() => {
    // hole_number を含めることで、別ホールの shot_number 重複（new:1 が複数ホールで衝突）を防ぐ
    const key = initialShots.map((s) => `${s.hole_number}:${s.id || `new:${s.shot_number}`}`).join('|');
    if (key === prevShotsKeyRef.current) return;
    const isFirstRun = prevShotsKeyRef.current === null;
    prevShotsKeyRef.current = key;
    setShots(initialShots);
    if (!isFirstRun) {
      // ホール跨ぎでの shotId 衝突対策（M2 防御）: shots set が変わったら drafts を全クリア
      draftsRef.current = new Map();
      forceRerender();
      setSelectedShotId(null);
      setSaveError(null);
    }
  }, [initialShots]);

  const select = useCallback((shotId: string | null) => {
    setSelectedShotId((prev) => {
      // 同じ ID を再タップで解除（toggle）
      if (prev === shotId) return null;
      return shotId;
    });
    setSaveError(null);
  }, []);

  const dragTo = useCallback((shotId: string, lat: number, lng: number) => {
    const shot = shotsRef.current.find((s) => s.id === shotId);
    if (!shot) return;
    draftsRef.current = new Map(draftsRef.current).set(shotId, {
      lat,
      lng,
      source: 'manual_edit',
      accuracyM: null,
      baseRevision: shot.position_revision,
    });
    forceRerender();
  }, []);

  const discardDraft = useCallback((shotId: string) => {
    if (!draftsRef.current.has(shotId)) return;
    const next = new Map(draftsRef.current);
    next.delete(shotId);
    draftsRef.current = next;
    forceRerender();
  }, []);

  const discardAllDrafts = useCallback(() => {
    if (draftsRef.current.size === 0) return;
    draftsRef.current = new Map();
    forceRerender();
  }, []);

  const syncShot = useCallback((updated: Shot) => {
    setShots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  // shotsRef: callback 内で参照する最新 shots（useState の closure を回避）
  const shotsRef = useRef(shots);
  useEffect(() => {
    shotsRef.current = shots;
  }, [shots]);

  const commit = useCallback(
    async (shotId: string) => {
      // 重複ガード
      const existing = inflightRef.current.get(shotId);
      if (existing) return existing;

      const draft = draftsRef.current.get(shotId);
      const shot = shotsRef.current.find((s) => s.id === shotId);
      if (!draft || !shot) return;

      const promise = (async () => {
        setSavingShotIds((prev) => new Set(prev).add(shotId));
        // saveError は select() / 次の確定操作でクリアされる。
        // ここで null リセットすると commitAll の途中 conflict が後続成功で消えてしまうため触らない。
        try {
          const result = await saveShotPosition({ shot, draft });
          if (result.ok) {
            // 成功: draft 破棄、shots を最新値で更新
            const nextDrafts = new Map(draftsRef.current);
            nextDrafts.delete(shotId);
            draftsRef.current = nextDrafts;
            if (result.latestShot) {
              setShots((prev) => prev.map((s) => (s.id === shotId ? result.latestShot! : s)));
            }
            forceRerender();
          } else {
            setSaveError(result.error);
            // conflict 時: latestShot で同期、draft は破棄して最新位置を見せる
            if (result.error === 'conflict' && result.latestShot) {
              setShots((prev) => prev.map((s) => (s.id === shotId ? result.latestShot! : s)));
              const nextDrafts = new Map(draftsRef.current);
              nextDrafts.delete(shotId);
              draftsRef.current = nextDrafts;
              forceRerender();
            }
            // selection は維持（ユーザーが「位置がずれた」状況を確認できるように）
          }
        } catch (err) {
          console.error('useMultiShotEdit commit failed:', err);
          setSaveError('failed');
        } finally {
          setSavingShotIds((prev) => {
            const next = new Set(prev);
            next.delete(shotId);
            return next;
          });
          inflightRef.current.delete(shotId);
        }
      })();
      inflightRef.current.set(shotId, promise);
      return promise;
    },
    [saveShotPosition],
  );

  const commitAll = useCallback(async () => {
    // 全 draft を順次 commit。並列ではなく逐次にすることで、position_revision の整合性を保つ
    const ids = Array.from(draftsRef.current.keys());
    for (const id of ids) {
      await commit(id);
    }
  }, [commit]);

  const revert = useCallback(
    async (shotId: string) => {
      const existing = inflightRef.current.get(shotId);
      if (existing) return existing;

      const shot = shotsRef.current.find((s) => s.id === shotId);
      if (!shot) return;
      if (shot.original_latitude == null || shot.original_longitude == null) return;

      const promise = (async () => {
        setSavingShotIds((prev) => new Set(prev).add(shotId));
        // saveError は select() でクリアされる方針 (commit と同様)
        try {
          const result = await revertShotPosition(shot);
          if (result.ok) {
            // revert 成功: draft があれば破棄、shots を最新値で同期
            const nextDrafts = new Map(draftsRef.current);
            nextDrafts.delete(shotId);
            draftsRef.current = nextDrafts;
            if (result.latestShot) {
              setShots((prev) => prev.map((s) => (s.id === shotId ? result.latestShot! : s)));
            }
            forceRerender();
          } else {
            setSaveError(result.error);
            if (result.error === 'conflict' && result.latestShot) {
              setShots((prev) => prev.map((s) => (s.id === shotId ? result.latestShot! : s)));
            }
          }
        } catch (err) {
          console.error('useMultiShotEdit revert failed:', err);
          setSaveError('failed');
        } finally {
          setSavingShotIds((prev) => {
            const next = new Set(prev);
            next.delete(shotId);
            return next;
          });
          inflightRef.current.delete(shotId);
        }
      })();
      inflightRef.current.set(shotId, promise);
      return promise;
    },
    [revertShotPosition],
  );

  return {
    shots,
    drafts: draftsRef.current,
    selectedShotId,
    savingShotIds,
    saveError,
    select,
    dragTo,
    commit,
    commitAll,
    discardDraft,
    discardAllDrafts,
    revert,
    syncShot,
  };
}
