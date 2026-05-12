'use client';

import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { HoleMapData, HoleMapDataEntry } from '@/actions/hole-map';

/**
 * 値が `HoleMapData` = 取得成功 / `null` = 取得済みだが unavailable / `undefined` = 未取得
 */
type CacheState = Map<number, HoleMapData | null>;

interface HoleMapCacheContext {
  /** 同期 getter（hit 時の即値返却用） */
  get: (holeNumber: number) => HoleMapData | null | undefined;
  /** 該当ホールの取得を保証する。fetched なら即値、未 fetched なら fetcher を呼ぶ */
  ensure: (
    holeNumber: number,
    fetcher: () => Promise<HoleMapData | null>,
  ) => Promise<HoleMapData | null>;
}

const Ctx = createContext<HoleMapCacheContext | null>(null);

/**
 * Provider 未配置時に使う安定参照の no-op cache。
 * useHoleMapCache が毎レンダー新オブジェクトを返すと、consumer の useEffect 依存が壊れて
 * モーダルの誤クローズや無限再フェッチを引き起こすため、module-level で固定化。
 */
const NO_OP_CACHE: HoleMapCacheContext = {
  get: () => undefined,
  ensure: (_holeNumber, fetcher) => fetcher(),
};

/**
 * ラウンド開始時にプリフェッチした map data を Provider に注入し、
 * 配下の ShotPositionRecorder / ShotTrajectorySection 等が cache hit できるようにする
 *
 * Sprint 5 PR10 (S-5e) — ホール切替時の N+1 問題（毎回 4 query）を解消。
 *
 * - initialMapData で渡された map data をそのまま seed
 * - cache miss 時の遅延 fetch は ensure() に渡された fetcher を経由（後方互換）
 * - 同一ホールへの並行 fetch は inflight ref で 1 つに集約（race 防止）
 * - cache 本体は useRef 保持。consumer は ensure() の Promise からデータを受け取り、
 *   render body で get() の戻り値変化に依存しない設計（Provider 再レンダー通知は不要）
 */
export function HoleMapCacheProvider({
  initialMapData,
  children,
}: {
  initialMapData?: HoleMapDataEntry[];
  children: ReactNode;
}) {
  const cacheRef = useRef<CacheState>(new Map());
  const inflightRef = useRef<Map<number, Promise<HoleMapData | null>>>(new Map());

  // 初期 seed (mount 時 1 回のみ)。useState 初期化子と等価。
  // initialMapData が後から変わっても再 seed しない（read-once 設計）。
  // Sprint 7 PR1 (S-7a): centerline / refStart / refEnd も seed (自動軌跡用)
  if (cacheRef.current.size === 0 && initialMapData && initialMapData.length > 0) {
    for (const entry of initialMapData) {
      cacheRef.current.set(entry.holeNumber, {
        aerialImageUrl: entry.aerialImageUrl,
        metadata: entry.metadata,
        areas: entry.areas,
        centerlineA: entry.centerlineA,
        centerlineB: entry.centerlineB,
        refStart: entry.refStart,
        refEnd: entry.refEnd,
      });
    }
  }

  const get = useCallback(
    (holeNumber: number): HoleMapData | null | undefined => cacheRef.current.get(holeNumber),
    [],
  );

  const ensure = useCallback(
    async (
      holeNumber: number,
      fetcher: () => Promise<HoleMapData | null>,
    ): Promise<HoleMapData | null> => {
      if (cacheRef.current.has(holeNumber)) return cacheRef.current.get(holeNumber) ?? null;
      const inflight = inflightRef.current.get(holeNumber);
      if (inflight) return inflight;
      const promise = (async () => {
        try {
          const data = await fetcher();
          cacheRef.current.set(holeNumber, data);
          return data;
        } finally {
          inflightRef.current.delete(holeNumber);
        }
      })();
      inflightRef.current.set(holeNumber, promise);
      return promise;
    },
    [],
  );

  // get/ensure は安定参照なので value も実質安定。useMemo は dev での誤検知防止用。
  const value = useMemo<HoleMapCacheContext>(() => ({ get, ensure }), [get, ensure]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Provider 配下なら cache を参照、なければ no-op cache を返す（Provider 未配置でも壊れない）
 */
export function useHoleMapCache(): HoleMapCacheContext {
  return useContext(Ctx) ?? NO_OP_CACHE;
}
