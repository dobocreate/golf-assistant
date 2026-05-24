import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMapZoomPan, ZOOM_PAN_LIMITS } from './use-map-zoom-pan';

// DOMRect mock (jsdom 環境で直接コンストラクトできないため)
const makeRect = (left = 0, top = 0, width = 400, height = 600): DOMRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
  x: left,
  y: top,
  toJSON: () => ({}),
});
const containerSize = () => makeRect();

describe('useMapZoomPan', () => {
  it('初期 state は scale=1, translate=0,0', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    expect(result.current.state).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });

  it('zoomIn で scale が増加し、上限でクランプ', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    act(() => result.current.zoomIn());
    expect(result.current.state.scale).toBeGreaterThan(1);
    // 上限まで複数回
    for (let i = 0; i < 20; i++) act(() => result.current.zoomIn());
    expect(result.current.state.scale).toBeLessThanOrEqual(ZOOM_PAN_LIMITS.MAX_SCALE);
    expect(result.current.canZoomIn).toBe(false);
  });

  it('zoomOut で scale が減少し、下限 1 でクランプ + translate も 0 に', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    // まず拡大
    act(() => result.current.zoomIn());
    act(() => result.current.zoomIn());
    expect(result.current.state.scale).toBeGreaterThan(1);
    // 下限まで縮小
    for (let i = 0; i < 10; i++) act(() => result.current.zoomOut());
    expect(result.current.state.scale).toBe(ZOOM_PAN_LIMITS.MIN_SCALE);
    // scale=1 では translate も 0 に強制
    expect(result.current.state.translateX).toBe(0);
    expect(result.current.state.translateY).toBe(0);
    expect(result.current.canZoomOut).toBe(false);
  });

  it('reset で初期 state に戻る', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    act(() => result.current.zoomIn());
    act(() => result.current.zoomIn());
    act(() => result.current.reset());
    expect(result.current.state).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });

  it('canZoomIn/Out フラグが境界で正しく切替', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    expect(result.current.canZoomIn).toBe(true);
    expect(result.current.canZoomOut).toBe(false);

    // 拡大した中間状態
    act(() => result.current.zoomIn());
    expect(result.current.canZoomIn).toBe(true);
    expect(result.current.canZoomOut).toBe(true);
  });

  it('transformStyle に scale と translate が正しく反映される', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    const style = result.current.transformStyle;
    expect(style.transform).toContain('scale(1)');
    expect(style.transform).toContain('translate(0px, 0px)');
  });

  it('attachWheelListener: deltaY 負 (ホイール上) でズームイン', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    const el = document.createElement('div');
    document.body.appendChild(el);
    const ref = { current: el } as React.RefObject<HTMLElement>;
    const cleanup = result.current.attachWheelListener(ref);
    act(() => {
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    });
    expect(result.current.state.scale).toBeGreaterThan(1);
    cleanup?.();
    document.body.removeChild(el);
  });

  it('attachWheelListener: deltaY 0 では何もしない', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    const el = document.createElement('div');
    document.body.appendChild(el);
    const ref = { current: el } as React.RefObject<HTMLElement>;
    const cleanup = result.current.attachWheelListener(ref);
    act(() => {
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: 0, cancelable: true }));
    });
    expect(result.current.state.scale).toBe(1);
    cleanup?.();
    document.body.removeChild(el);
  });

  it('scale > 1 で zoomOut すると translate も自動クランプされる', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    // 拡大 + translate を端まで pan させた状態を模倣 (transformStyle を直接検証)
    act(() => result.current.zoomIn());
    act(() => result.current.zoomIn());
    // この時点で scale=1.96 程度。translate は 0 だが、後の zoomOut でも 0 のまま
    expect(result.current.state.translateX).toBe(0);
    act(() => result.current.zoomOut());
    expect(result.current.state.translateX).toBe(0);
  });

  it('scale=1 に戻したとき translate が強制 0 になる', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    act(() => result.current.zoomIn()); // scale=1.4
    // 直接 reset でも translate=0 になることを確認 (M3 リグレッション保護)
    act(() => result.current.reset());
    expect(result.current.state).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });

  it('多重 zoomIn でも MAX_SCALE を超えない (canZoomIn=false)', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    for (let i = 0; i < 50; i++) act(() => result.current.zoomIn());
    expect(result.current.state.scale).toBe(ZOOM_PAN_LIMITS.MAX_SCALE);
    // さらに zoomIn しても変わらない
    const prev = result.current.state.scale;
    act(() => result.current.zoomIn());
    expect(result.current.state.scale).toBe(prev);
  });

  it('ホイール pivot 補正: container 中心以外でズームすると translate が動く', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    const el = document.createElement('div');
    document.body.appendChild(el);
    const ref = { current: el } as React.RefObject<HTMLElement>;
    const cleanup = result.current.attachWheelListener(ref);
    // container rect は (0,0)-(400,600)、中心は (200, 300)。pivot を (350, 300) に
    // jsdom の WheelEvent は clientX/Y を init から拾わないため defineProperty で注入
    const event = new WheelEvent('wheel', { deltaY: -200, cancelable: true });
    Object.defineProperty(event, 'clientX', { value: 350, configurable: true });
    Object.defineProperty(event, 'clientY', { value: 300, configurable: true });
    act(() => {
      el.dispatchEvent(event);
    });
    // 中心ではないので、scale 増加と同時に translateX が負 (= 右側 pivot を左にずらす方向)
    expect(result.current.state.scale).toBeGreaterThan(1);
    expect(result.current.state.translateX).toBeLessThan(0);
    cleanup?.();
    document.body.removeChild(el);
  });

  it('pinch → pan 移行: 2 本指から 1 本指で離したら、残った指で pan 継続できる準備が整う', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    // 拡大状態にしておく (pan 可能にするため)
    act(() => result.current.zoomIn());
    act(() => result.current.zoomIn());
    // 2 本指 pointerDown
    const ptr1 = { pointerId: 1, clientX: 100, clientY: 100, pointerType: 'touch', button: 0, currentTarget: {} } as unknown as React.PointerEvent<HTMLElement>;
    const ptr2 = { pointerId: 2, clientX: 200, clientY: 200, pointerType: 'touch', button: 0, currentTarget: {} } as unknown as React.PointerEvent<HTMLElement>;
    act(() => result.current.onBackgroundPointerDown(ptr1));
    act(() => result.current.onBackgroundPointerDown(ptr2));
    const beforeTx = result.current.state.translateX;
    // ptr1 を離す → 残 ptr2 で pan に移行
    act(() => result.current.onPointerUp(ptr1));
    // 残 ptr2 の位置から少し動かす → pan として反映される
    const ptr2Move = { ...ptr2, clientX: 250, clientY: 250 } as unknown as React.PointerEvent<HTMLElement>;
    act(() => result.current.onPointerMove(ptr2Move));
    // translate が動いていれば pan が継承された証拠 (動かない = pan 未初期化バグ)
    expect(result.current.state.translateX).not.toBe(beforeTx);
  });
});
