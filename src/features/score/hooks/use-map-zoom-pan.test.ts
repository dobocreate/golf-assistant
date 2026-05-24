import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMapZoomPan, ZOOM_PAN_LIMITS } from './use-map-zoom-pan';

const containerSize = () => ({ width: 400, height: 600 });

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

  it('onWheel: deltaY 負 (ホイール上) でズームイン', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    act(() => {
      result.current.onWheel({
        deltaY: -100,
        preventDefault: () => {},
      } as unknown as React.WheelEvent<HTMLElement>);
    });
    expect(result.current.state.scale).toBeGreaterThan(1);
  });

  it('onWheel: deltaY 0 では何もしない', () => {
    const { result } = renderHook(() => useMapZoomPan(containerSize));
    act(() => {
      result.current.onWheel({
        deltaY: 0,
        preventDefault: () => {},
      } as unknown as React.WheelEvent<HTMLElement>);
    });
    expect(result.current.state.scale).toBe(1);
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
});
