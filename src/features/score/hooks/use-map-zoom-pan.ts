'use client';

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

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
export function useMapZoomPan(getContainerRect: () => DOMRect | null) {
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
  // pinch 用: 2 pointer 間の初期距離と初期 scale/中心点 (pivot 維持のため)
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
      const rect = getContainerRect();
      if (!rect) return { tx, ty };
      // (scale-1) × half_size までは中央から外れ可能 (端まで pan できる)
      const maxX = (rect.width * (scale - 1)) / 2;
      const maxY = (rect.height * (scale - 1)) / 2;
      return {
        tx: Math.max(-maxX, Math.min(maxX, tx)),
        ty: Math.max(-maxY, Math.min(maxY, ty)),
      };
    },
    [getContainerRect],
  );

  const setStateClamped = useCallback(
    (next: ZoomPanState) => {
      const scale = clampScale(next.scale);
      const { tx, ty } = clampTranslate(scale, next.translateX, next.translateY);
      setState({ scale, translateX: tx, translateY: ty });
    },
    [clampTranslate],
  );

  /**
   * 指定した画面座標 (pivotScreenX/Y) が transform 前後で同じ画像位置を指すように
   * scale 変更時の translate を補正する (zoom-to-cursor / zoom-to-pinch-center)。
   *
   * transform-origin: center center 前提。
   * pivot の container 中心からのオフセット = (pivotScreen - rect.center)
   * pivot の論理座標 (wrapper space, 中心=0) = (offset - oldTranslate) / oldScale
   * 同じ論理座標を維持するため newTranslate = offset - newScale * 論理座標
   */
  const zoomAroundPivot = useCallback(
    (newScale: number, pivotScreenX: number, pivotScreenY: number) => {
      const rect = getContainerRect();
      const s = stateRef.current;
      const clampedNewScale = clampScale(newScale);
      if (!rect) {
        setStateClamped({ ...s, scale: clampedNewScale });
        return;
      }
      const offsetX = pivotScreenX - rect.left - rect.width / 2;
      const offsetY = pivotScreenY - rect.top - rect.height / 2;
      const logicalX = (offsetX - s.translateX) / s.scale;
      const logicalY = (offsetY - s.translateY) / s.scale;
      const newTx = offsetX - clampedNewScale * logicalX;
      const newTy = offsetY - clampedNewScale * logicalY;
      setStateClamped({ scale: clampedNewScale, translateX: newTx, translateY: newTy });
    },
    [getContainerRect, setStateClamped],
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
        // pinch center を pivot として zoomAroundPivot 相当の補正をインラインで計算
        // (pinchStartRef.tx/ty/scale が初期、現中心 (centerX/Y) を維持する)
        const rect = getContainerRect();
        const newScale = clampScale(pinchStartRef.current.scale * ratio);
        if (rect) {
          const offsetX = pinchStartRef.current.centerX - rect.left - rect.width / 2;
          const offsetY = pinchStartRef.current.centerY - rect.top - rect.height / 2;
          const logicalX = (offsetX - pinchStartRef.current.tx) / pinchStartRef.current.scale;
          const logicalY = (offsetY - pinchStartRef.current.ty) / pinchStartRef.current.scale;
          setStateClamped({
            scale: newScale,
            translateX: offsetX - newScale * logicalX,
            translateY: offsetY - newScale * logicalY,
          });
        } else {
          setStateClamped({
            scale: newScale,
            translateX: pinchStartRef.current.tx,
            translateY: pinchStartRef.current.ty,
          });
        }
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
    [getContainerRect, setStateClamped],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size === 0) {
      pinchStartRef.current = null;
      panStartRef.current = null;
    } else if (pointersRef.current.size === 1) {
      // pinch → pan 移行: 残った 1 本指から panStartRef を初期化してスムーズに pan 継続
      pinchStartRef.current = null;
      const remaining = Array.from(pointersRef.current.values())[0];
      if (remaining && stateRef.current.scale > 1) {
        panStartRef.current = {
          tx: stateRef.current.translateX,
          ty: stateRef.current.translateY,
          px: remaining.x,
          py: remaining.y,
        };
      }
    }
  }, []);

  // pointerCancel は Android で長押し / システム interruption 等で発火する。
  // up/cancel どちらでも pointersRef から確実に削除し、orphan state を残さない。
  const onPointerCancel = onPointerUp;

  /**
   * ホイールイベントを {passive: false} で attach する helper (react SyntheticEvent では
   * preventDefault が passive 警告を出すケースがあるため、native listener で確実にブロック)。
   * 呼び出し側で `useEffect(() => attachWheelListener(ref), [])` のように使う。
   */
  const attachWheelListener = useCallback(
    (ref: RefObject<HTMLElement | null>) => {
      const el = ref.current;
      if (!el) return undefined;
      const handler = (e: WheelEvent) => {
        if (e.deltaY === 0) return;
        e.preventDefault();
        const s = stateRef.current;
        const next = s.scale * (1 - e.deltaY * WHEEL_SCALE_FACTOR);
        zoomAroundPivot(next, e.clientX, e.clientY);
      };
      el.addEventListener('wheel', handler, { passive: false });
      return () => el.removeEventListener('wheel', handler);
    },
    [zoomAroundPivot],
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
    attachWheelListener,
    canZoomIn: state.scale < MAX_SCALE,
    canZoomOut: state.scale > MIN_SCALE,
  };
}

export const ZOOM_PAN_LIMITS = { MIN_SCALE, MAX_SCALE };
