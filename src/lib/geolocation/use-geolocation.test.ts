import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGeolocation } from './use-geolocation';

/**
 * navigator.geolocation のモック
 *
 * happy-dom には navigator.geolocation が存在しないため、各テストで明示的に注入する。
 * Vitest 4 では globalThis.navigator はそのまま使える。
 */
function mockGeolocation(impl: Partial<Geolocation>) {
  const original = (globalThis.navigator as unknown as { geolocation?: Geolocation }).geolocation;
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: impl as Geolocation,
  });
  return () => {
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      value: original,
    });
  };
}

describe('useGeolocation', () => {
  let restore: () => void = () => {};

  beforeEach(() => {
    // 各テストでモックを差し替えやすいように、デフォルトはクリア状態
    restore = () => {};
  });

  afterEach(() => {
    restore();
    vi.restoreAllMocks();
  });

  it('returns success result on successful capture', async () => {
    restore = mockGeolocation({
      getCurrentPosition: (success) => {
        success({
          coords: {
            latitude: 34.0438,
            longitude: 131.9649,
            accuracy: 8.5,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.UTC(2026, 4, 9, 0, 0, 0),
          toJSON: () => ({}),
        } as GeolocationPosition);
      },
    });

    const { result } = renderHook(() => useGeolocation());
    let captured: Awaited<ReturnType<typeof result.current.capture>> = null;
    await act(async () => {
      captured = await result.current.capture();
    });

    expect(captured).not.toBeNull();
    expect(captured!.latitude).toBe(34.0438);
    expect(captured!.longitude).toBe(131.9649);
    expect(captured!.accuracyM).toBe(8.5);
    expect(captured!.capturedAt).toBe('2026-05-09T00:00:00.000Z');

    expect(result.current.position).toEqual(captured);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns permission_denied error when user denies permission', async () => {
    restore = mockGeolocation({
      getCurrentPosition: (_success, errorCb) => {
        errorCb?.({
          code: 1,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: 'User denied Geolocation',
        } as GeolocationPositionError);
      },
    });

    const { result } = renderHook(() => useGeolocation());
    let captured: Awaited<ReturnType<typeof result.current.capture>> = null;
    await act(async () => {
      captured = await result.current.capture();
    });

    expect(captured).toBeNull();
    expect(result.current.error?.code).toBe('permission_denied');
    expect(result.current.error?.message).toMatch(/拒否|permission/i);
    expect(result.current.position).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('returns position_unavailable error when GPS cannot fix', async () => {
    restore = mockGeolocation({
      getCurrentPosition: (_success, errorCb) => {
        errorCb?.({
          code: 2,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: 'Position unavailable',
        } as GeolocationPositionError);
      },
    });

    const { result } = renderHook(() => useGeolocation());
    await act(async () => {
      await result.current.capture();
    });

    expect(result.current.error?.code).toBe('position_unavailable');
  });

  it('returns timeout error when capture times out', async () => {
    restore = mockGeolocation({
      getCurrentPosition: (_success, errorCb) => {
        errorCb?.({
          code: 3,
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
          message: 'Timeout',
        } as GeolocationPositionError);
      },
    });

    const { result } = renderHook(() => useGeolocation());
    await act(async () => {
      await result.current.capture();
    });

    expect(result.current.error?.code).toBe('timeout');
  });

  it('returns unsupported error when navigator.geolocation is missing', async () => {
    restore = mockGeolocation(undefined as unknown as Geolocation);
    // 上の defineProperty は value: undefined を設定するが、'in' チェックが false になるよう削除
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      configurable: true,
      get: () => undefined,
    });

    const { result } = renderHook(() => useGeolocation());
    let captured: Awaited<ReturnType<typeof result.current.capture>> = null;
    await act(async () => {
      captured = await result.current.capture();
    });

    expect(captured).toBeNull();
    expect(result.current.error?.code).toBe('unsupported');
  });

  it('clear() resets position and error', async () => {
    restore = mockGeolocation({
      getCurrentPosition: (success) => {
        success({
          coords: {
            latitude: 34, longitude: 131, accuracy: 5,
            altitude: null, altitudeAccuracy: null, heading: null, speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        } as GeolocationPosition);
      },
    });

    const { result } = renderHook(() => useGeolocation());
    await act(async () => {
      await result.current.capture();
    });
    expect(result.current.position).not.toBeNull();

    act(() => {
      result.current.clear();
    });

    expect(result.current.position).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
