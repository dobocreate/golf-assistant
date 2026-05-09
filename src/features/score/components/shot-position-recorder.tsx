'use client';

import { MapPin, Check, AlertCircle } from 'lucide-react';
import { useGeolocation } from '@/lib/geolocation/use-geolocation';
import type { ShotFormState } from '@/features/score/types';
import type { ShotFormAction } from '@/features/score/hooks/use-shot-recorder';

interface Props {
  index: number;
  form: ShotFormState;
  dispatch: React.Dispatch<ShotFormAction>;
}

/**
 * 「📍 位置を記録」ボタン UI
 *
 * - 既存 ShotForm の「状況」セクション直下に配置
 * - useGeolocation フックで GPS 取得し、form state に lat/lng/accuracy/capturedAt を反映
 * - 取得済みの場合は精度表示 + クリアボタン
 * - エラー時は permission_denied / position_unavailable / timeout を区別表示
 *
 * Sprint 5 PR4 (S-3a) — 最小 UI。lie 自動判定や AI コンテキスト連携は PR5/PR6 で。
 */
export function ShotPositionRecorder({ index, form, dispatch }: Props) {
  const { loading, error, capture, clear } = useGeolocation();

  const hasPosition = form.latitude != null && form.longitude != null;
  const accuracyText =
    form.gpsAccuracyM != null ? `精度 ${form.gpsAccuracyM.toFixed(1)}m` : '精度不明';

  const handleCapture = async () => {
    const result = await capture();
    if (!result) return;
    dispatch({
      type: 'UPDATE_FIELD',
      index,
      updater: (f) => ({
        ...f,
        latitude: result.latitude,
        longitude: result.longitude,
        gpsAccuracyM: result.accuracyM,
        capturedAt: result.capturedAt,
        gpsSource: 'gps',
      }),
    });
  };

  const handleClear = () => {
    clear();
    dispatch({
      type: 'UPDATE_FIELD',
      index,
      updater: (f) => ({
        ...f,
        latitude: null,
        longitude: null,
        gpsAccuracyM: null,
        capturedAt: null,
        gpsSource: null,
      }),
    });
  };

  return (
    <div className="space-y-1">
      <label className="block text-xs text-gray-400">位置情報</label>
      {hasPosition ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-700 bg-emerald-950/40 px-3 py-2">
          <div className="flex items-center gap-2 text-sm text-emerald-300 min-w-0">
            <Check className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">位置記録済み（{accuracyText}）</span>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2 min-h-[32px] px-1"
          >
            クリア
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleCapture}
          disabled={loading}
          className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="現在地の GPS を取得して位置を記録"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {loading ? '位置を取得中…' : '📍 位置を記録'}
        </button>
      )}
      {error && (
        <div
          className="flex items-start gap-2 rounded-lg border border-rose-700 bg-rose-950/40 px-3 py-2 text-sm text-rose-300"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error.message}</span>
        </div>
      )}
    </div>
  );
}
