'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const SCALE_STEP = 1.4; // ボタン押下時の倍率
const WHEEL_SCALE_FACTOR = 0.0015; // deltaY → scale 変化率

export interface ZoomPanState {
  scale: number;
  translateX: number;
  translateY: number;
}

const INITIAL: ZoomPanState = { scale: 1, translateX: 0, translateY: 0 };

interface Pointer {
  id: number;
  x: number;
  y: number;
}

/**
 * 衛星画像ビューワー用 CSS transform ベースの zoom/pan controller。
 *
 * 仕様:
 * - scale 範囲: 1〜4 (1 のときは pan も無効化)
 * - 1 本指ドラッグ (空き領域) → pan
 * - 2 本指ピンチ → zoom (距離比から倍率算出)
 * - ホイール → zoom (PC 用)
 * - +/- /reset ボタン
 *
 * マーカードラッグとの分離: 呼び出し側が「pointerDown はマーカーへの操作か」
 * を判定し、マーカーでない場合のみ `onBackgroundPointerDown` を呼ぶ。
 * pointerMove/Up はコンテナで一括して受け、内部状態で pan or pinch を分岐する。
 */
export function useMapZoomPan(getContainerSize: () => { width: number; height: number } | null) {
  const [state, setState] = useState<ZoomPanState>(INITIAL);
  // pointer event handlers から最新 state を読みたいので ref で同期 (render 中 mutate は不可なため effect 経由)
  const stateRef = useRef<ZoomPanState>(INITIAL);
  useEffect(() => {
    stateRef.current = state;
  });

  // active pointers (1 = pan, 2 = pinch)
  const pointersRef = useRef<Map<number, Pointer>>(new Map());
  // pan 用: pointerDown 時の state と pointer 座標
  const panStartRef = useRef<{ tx: number; ty: number; px: number; py: number } | null>(null);
  // pinch 用: 2 pointer 間の初期距離と初期 scale/中心点
  const pinchStartRef = useRef<{
    dist: number;
    scale: number;
    centerX: number;
    centerY: number;
    tx: number;
    ty: number;
  } | null>(null);

  const clampScale = (s: number) => Math.max(MIN_SCALE, Math.min(MAX_SCALE, s));

  // scale=1 では translate を強制 0 にして「縮小したら自動センタリング」
  // また、scale > 1 で translate が画像外まで行き過ぎないよう簡易クランプ
  const clampTranslate = useCallback(
    (scale: number, tx: number, ty: number): { tx: number; ty: number } => {
      if (scale <= 1) return { tx: 0, ty: 0 };
      const size = getContainerSize();
      if (!size) return { tx, ty };
      // (scale-1) × half_size までは中央から外れ可能 (端まで pan できる)
      const maxX = (size.width * (scale - 1)) / 2;
      const maxY = (size.height * (scale - 1)) / 2;
      return {
        tx: Math.max(-maxX, Math.min(maxX, tx)),
        ty: Math.max(-maxY, Math.min(maxY, ty)),
      };
    },
    [getContainerSize],
  );

  const setStateClamped = useCallback(
    (next: ZoomPanState) => {
      const scale = clampScale(next.scale);
      const { tx, ty } = clampTranslate(scale, next.translateX, next.translateY);
      setState({ scale, translateX: tx, translateY: ty });
    },
    [clampTranslate],
  );

  const zoomIn = useCallback(() => {
    const s = stateRef.current;
    setStateClamped({ ...s, scale: s.scale * SCALE_STEP });
  }, [setStateClamped]);

  const zoomOut = useCallback(() => {
    const s = stateRef.current;
    setStateClamped({ ...s, scale: s.scale / SCALE_STEP });
  }, [setStateClamped]);

  const reset = useCallback(() => setState(INITIAL), []);

  // 背景 (= 非マーカー領域) への pointerDown
  const onBackgroundPointerDown = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointersRef.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
    if (pointersRef.current.size === 1 && stateRef.current.scale > 1) {
      // pan 開始
      panStartRef.current = {
        tx: stateRef.current.translateX,
        ty: stateRef.current.translateY,
        px: e.clientX,
        py: e.clientY,
      };
    } else if (pointersRef.current.size === 2) {
      // pinch 開始: 2 pointer 間距離と中心 (画面座標) を記録
      const arr = Array.from(pointersRef.current.values());
      const [p1, p2] = arr;
      pinchStartRef.current = {
        dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
        scale: stateRef.current.scale,
        centerX: (p1.x + p2.x) / 2,
        centerY: (p1.y + p2.y) / 2,
        tx: stateRef.current.translateX,
        ty: stateRef.current.translateY,
      };
      // pinch 中は pan を中断
      panStartRef.current = null;
    }
  }, []);

  // pointerMove (背景 pan / pinch)
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const ptr = pointersRef.current.get(e.pointerId);
      if (!ptr) return;
      ptr.x = e.clientX;
      ptr.y = e.clientY;

      if (pointersRef.current.size === 2 && pinchStartRef.current) {
        const arr = Array.from(pointersRef.current.values());
        const [p1, p2] = arr;
        const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const ratio = dist / pinchStartRef.current.dist;
        setStateClamped({
          scale: pinchStartRef.current.scale * ratio,
          translateX: pinchStartRef.current.tx,
          translateY: pinchStartRef.current.ty,
        });
      } else if (panStartRef.current) {
        const dx = e.clientX - panStartRef.current.px;
        const dy = e.clientY - panStartRef.current.py;
        setStateClamped({
          scale: stateRef.current.scale,
          translateX: panStartRef.current.tx + dx,
          translateY: panStartRef.current.ty + dy,
        });
      }
    },
    [setStateClamped],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchStartRef.current = null;
    if (pointersRef.current.size === 0) panStartRef.current = null;
  }, []);

  // pointerCancel は Android で長押し / システム interruption 等で発火する。
  // up/cancel どちらでも pointersRef から確実に削除し、orphan state を残さない。
  const onPointerCancel = onPointerUp;

  // PC ホイールズーム
  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLElement>) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      const s = stateRef.current;
      const next = s.scale * (1 - e.deltaY * WHEEL_SCALE_FACTOR);
      setStateClamped({ ...s, scale: next });
    },
    [setStateClamped],
  );

  const transformStyle: React.CSSProperties = {
    transform: `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`,
    transformOrigin: 'center center',
    willChange: 'transform',
  };

  return {
    state,
    transformStyle,
    zoomIn,
    zoomOut,
    reset,
    onBackgroundPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onWheel,
    canZoomIn: state.scale < MAX_SCALE,
    canZoomOut: state.scale > MIN_SCALE,
  };
}

export const ZOOM_PAN_LIMITS = { MIN_SCALE, MAX_SCALE };
