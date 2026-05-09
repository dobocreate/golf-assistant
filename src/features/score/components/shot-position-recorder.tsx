'use client';

import { useRef, useState } from 'react';
import { MapPin, Check, AlertCircle, Loader2 } from 'lucide-react';
import { useGeolocation } from '@/lib/geolocation/use-geolocation';
import { lieToJapanese, metersToYards } from '@/lib/geolocation/lie-detection';
import { computeShotPosition } from '@/actions/shot-position';
import type { ShotFormState, AutoLieConfidence } from '@/features/score/types';
import type { ShotFormAction } from '@/features/score/hooks/use-shot-recorder';

interface Props {
  index: number;
  form: ShotFormState;
  dispatch: React.Dispatch<ShotFormAction>;
  /** Sprint 5 PR5: lie 自動判定 + 残距離計算用 */
  roundId: string;
  holeNumber: number;
}

/**
 * 「📍 位置を記録」ボタン UI
 *
 * - useGeolocation で GPS 取得 → computeShotPosition で lie/残距離を判定
 *   → form state に lat/lng/accuracy/capturedAt + auto_lie/confidence/remaining_to_green_m を反映
 * - 取得済みの場合は精度・推定ライ・残距離（ヤード換算）を表示
 * - エラー時は permission_denied / position_unavailable / timeout / unsupported を区別表示
 *
 * Sprint 5 PR4 (S-3a) で最小 UI、Sprint 5 PR5 (S-5b) で lie 自動判定と残距離を追加。
 */
export function ShotPositionRecorder({ index, form, dispatch, roundId, holeNumber }: Props) {
  const { loading: gpsLoading, error: gpsError, capture, clear } = useGeolocation();
  const [computing, setComputing] = useState(false);
  // 取得操作ごとに発番するトークン。clear や再取得で increment し、
  // 進行中の computeShotPosition 結果が古い場合は dispatch しない（race 防止）
  const captureTokenRef = useRef(0);

  const hasPosition = form.latitude != null && form.longitude != null;
  const accuracyText =
    form.gpsAccuracyM != null ? `精度 ${form.gpsAccuracyM.toFixed(1)}m` : '精度不明';

  const lieLabel = form.autoLie ? lieToJapanese(form.autoLie) : null;
  const remainingY =
    form.remainingToGreenM != null ? metersToYards(form.remainingToGreenM) : null;
  const confidenceLabel = (() => {
    switch (form.autoLieConfidence as AutoLieConfidence | null) {
      case 'high': return null; // high の場合は信頼度表示を省略（UI ノイズ削減）
      case 'medium': return '（推定）';
      case 'low': return '（精度低）';
      default: return null;
    }
  })();

  const handleCapture = async () => {
    const token = ++captureTokenRef.current;
    const result = await capture();
    if (!result) return;
    if (token !== captureTokenRef.current) return; // クリアまたは再取得が走った

    // まず GPS 値だけを form に格納
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

    // 続いて lie / 残距離を計算（失敗してもサイレント — GPS 値は既に保存済み）
    setComputing(true);
    try {
      const { result: pos, error: posError } = await computeShotPosition({
        roundId,
        holeNumber,
        latitude: result.latitude,
        longitude: result.longitude,
        accuracyM: result.accuracyM,
      });
      if (posError) {
        // 認証切れ・所有権エラー等。UI には出さないが debugability のためログ
        console.warn('computeShotPosition returned error:', posError);
      }
      // race ガード: クリア or 再取得が間に挟まれた場合は dispatch しない
      if (pos && token === captureTokenRef.current) {
        dispatch({
          type: 'UPDATE_FIELD',
          index,
          updater: (f) => {
            // 二重防御: form の lat/lng が null になっていれば書き戻さない
            if (f.latitude == null || f.longitude == null) return f;
            return {
              ...f,
              autoLie: pos.autoLie,
              autoLieConfidence: pos.autoLieConfidence,
              remainingToGreenM: pos.remainingToGreenM,
              autoLieCalculatedAt: new Date().toISOString(),
            };
          },
        });
      }
    } catch (err) {
      // 計算失敗は致命的ではない（lie 自動判定だけスキップ）
      console.error('computeShotPosition failed:', err);
    } finally {
      if (token === captureTokenRef.current) {
        setComputing(false);
      }
    }
  };

  const handleClear = () => {
    captureTokenRef.current++; // 進行中の computeShotPosition の結果を破棄
    setComputing(false);
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
        autoLie: null,
        autoLieConfidence: null,
        remainingToGreenM: null,
        autoLieCalculatedAt: null,
      }),
    });
  };

  // 注: computing=true の時点で hasPosition=true（capture 完了後）のため、
  // ボタンは表示されず、buttonLabel の computing 分岐は不要
  const buttonLabel = gpsLoading ? '位置を取得中…' : '📍 位置を記録';

  return (
    <div className="space-y-1">
      <label className="block text-xs text-gray-400">位置情報</label>
      {hasPosition ? (
        <div className="rounded-lg border border-emerald-700 bg-emerald-950/40 px-3 py-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
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
          {(lieLabel || remainingY != null) && (
            <div className="flex items-center gap-2 text-sm text-emerald-200 pl-6">
              {lieLabel && (
                <span>
                  {lieLabel}
                  {confidenceLabel && (
                    <span className="text-emerald-400/70 text-xs ml-0.5">{confidenceLabel}</span>
                  )}
                </span>
              )}
              {lieLabel && remainingY != null && <span className="text-emerald-700">·</span>}
              {remainingY != null && <span>グリーンまで {remainingY}y</span>}
            </div>
          )}
          {computing && (
            <div className="flex items-center gap-1 text-xs text-emerald-400/70 pl-6">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              位置を判定中…
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleCapture}
          disabled={gpsLoading || computing}
          className="w-full min-h-[48px] flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="現在地の GPS を取得して位置を記録"
        >
          <MapPin className="h-4 w-4" aria-hidden="true" />
          {buttonLabel}
        </button>
      )}
      {gpsError && (
        <div
          className="flex items-start gap-2 rounded-lg border border-rose-700 bg-rose-950/40 px-3 py-2 text-sm text-rose-300"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>{gpsError.message}</span>
        </div>
      )}
    </div>
  );
}
