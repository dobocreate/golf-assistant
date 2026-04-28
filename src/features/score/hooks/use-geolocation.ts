'use client';

import { useState, useEffect, useRef } from 'react';

export interface GeoPosition {
  lat: number;
  lng: number;
}

export function useGeolocation(enabled: boolean) {
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !navigator.geolocation) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        // 位置情報取得失敗は無視（表示しないだけ）
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 },
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [enabled]);

  return position;
}
