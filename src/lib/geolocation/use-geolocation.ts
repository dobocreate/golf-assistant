'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * GPS 位置取得の結果
 */
export interface GeolocationResult {
  latitude: number;
  longitude: number;
  accuracyM: number;
  capturedAt: string; // ISO 8601
}

/**
 * GPS 取得失敗時のエラーカテゴリ
 *
 * - permission_denied: ユーザーが permission prompt で拒否、またはブラウザ設定で禁止
 * - position_unavailable: 衛星捕捉できず（屋内など）
 * - timeout: タイムアウト（10s）
 * - unsupported: navigator.geolocation 自体が利用不可（旧ブラウザ・SSR 等）
 * - unknown: その他
 */
export type GeolocationErrorCode =
  | 'permission_denied'
  | 'position_unavailable'
  | 'timeout'
  | 'unsupported'
  | 'unknown';

export interface GeolocationError {
  code: GeolocationErrorCode;
  message: string;
}

export interface UseGeolocationReturn {
  /** 取得中フラグ */
  loading: boolean;
  /** 直近の取得結果（成功時のみ） */
  position: GeolocationResult | null;
  /** 直近のエラー（失敗時のみ） */
  error: GeolocationError | null;
  /** 現在地を取得する。成功時 position を更新し result を返す。失敗時は null */
  capture: () => Promise<GeolocationResult | null>;
  /** 位置情報をクリア（手動ピン留めに切り替えた場合など） */
  clear: () => void;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * navigator.geolocation を React hook 化したラッパ
 *
 * - getCurrentPosition を Promise 化
 * - permission denied / timeout / unsupported を構造化エラーで返す
 * - enableHighAccuracy: true で GPS を優先（精度〜10m を目指す）
 * - 取得結果は state として保持し、最後の値を再表示できる
 *
 * 用途: ShotForm の「📍 位置を記録」ボタン、Map ビューの再 GPS 取得
 */
export function useGeolocation(options?: { timeoutMs?: number }): UseGeolocationReturn {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const [loading, setLoading] = useState(false);
  const [position, setPosition] = useState<GeolocationResult | null>(null);
  const [error, setError] = useState<GeolocationError | null>(null);

  // unmount 後の setState を抑止（10s タイムアウト中に画面遷移されるケースを想定）
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const capture = useCallback(async (): Promise<GeolocationResult | null> => {
    // geolocation API そのものが利用不可（SSR / 旧ブラウザ / property だけ削除）
    if (typeof window === 'undefined' || !navigator.geolocation) {
      const err: GeolocationError = {
        code: 'unsupported',
        message: 'お使いのブラウザは位置情報取得に対応していません。',
      };
      if (mountedRef.current) setError(err);
      return null;
    }

    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const result: GeolocationResult = {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracyM: pos.coords.accuracy,
            capturedAt: new Date(pos.timestamp).toISOString(),
          };
          if (mountedRef.current) {
            setPosition(result);
            setError(null);
            setLoading(false);
          }
          resolve(result);
        },
        (geoErr) => {
          const code: GeolocationErrorCode =
            geoErr.code === geoErr.PERMISSION_DENIED ? 'permission_denied'
              : geoErr.code === geoErr.POSITION_UNAVAILABLE ? 'position_unavailable'
                : geoErr.code === geoErr.TIMEOUT ? 'timeout'
                  : 'unknown';
          const message =
            code === 'permission_denied' ? '位置情報の使用が拒否されました。ブラウザ設定をご確認ください。'
              : code === 'position_unavailable' ? '現在地を取得できませんでした。屋外で再度お試しください。'
                : code === 'timeout' ? '位置情報の取得がタイムアウトしました。'
                  : '位置情報の取得に失敗しました。';
          if (mountedRef.current) {
            setError({ code, message });
            setLoading(false);
          }
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0, // 常に新規取得（キャッシュは使わない）
        },
      );
    });
  }, [timeoutMs]);

  const clear = useCallback(() => {
    setPosition(null);
    setError(null);
  }, []);

  return { loading, position, error, capture, clear };
}
