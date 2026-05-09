'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Check, AlertCircle, Loader2, Map as MapIcon } from 'lucide-react';
import { useGeolocation } from '@/lib/geolocation/use-geolocation';
import { lieToJapanese, metersToYards } from '@/lib/geolocation/lie-detection';
import { computeShotPosition } from '@/actions/shot-position';
import { getHoleMapDataForRoundHole } from '@/actions/hole-map';
import type { ShotFormState, AutoLieConfidence } from '@/features/score/types';
import type { ShotFormAction } from '@/features/score/hooks/use-shot-recorder';
import type { AerialImageMetadata, HoleArea } from '@/lib/geo';
import { HoleMapPreview, HoleMapLightbox } from './hole-map-preview';
import { ManualPinModal } from './manual-pin-modal';

interface MapData {
  aerialImageUrl: string;
  metadata: AerialImageMetadata;
  areas: HoleArea[];
}

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

  // GPS-ready コースの map data（hole_view_configs.cached_image_url + metadata + hole_areas）
  // ホール変更時にフェッチし直す。GPS-ready でないコースでは null
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [mapLightboxOpen, setMapLightboxOpen] = useState(false);
  const [manualPinOpen, setManualPinOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // ホール切替時は古い mapData / モーダル状態を即座にクリア
    // （fetch resolve 前に古い画像・metadata で手動ピンされるのを防ぐ）
    setMapData(null);
    setMapLightboxOpen(false);
    setManualPinOpen(false);
    (async () => {
      try {
        const data = await getHoleMapDataForRoundHole(roundId, holeNumber);
        if (!cancelled) setMapData(data);
      } catch (err) {
        // ネットワークエラー等で fetch が失敗してもアプリは動作続行（プレビュー非表示のみ）
        console.error('Failed to fetch hole map data:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId, holeNumber]);

  const hasPosition = form.latitude != null && form.longitude != null;
  const accuracyText =
    form.gpsSource === 'manual_pin'
      ? '手動で指定'
      : form.gpsAccuracyM != null
        ? `精度 ${form.gpsAccuracyM.toFixed(1)}m`
        : '精度不明';

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
        // updater は純粋関数として保つため、副作用 (new Date) は外で評価
        const calculatedAt = new Date().toISOString();
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
              autoLieCalculatedAt: calculatedAt,
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

  /**
   * 手動ピン留め確定: ManualPinModal でユーザーが指定した lat/lng を form に格納し、
   * 続いて lie/距離を計算して反映する（GPS と同じパス、ただし accuracy=null かつ source='manual_pin'）
   */
  const handleManualPin = async (lat: number, lng: number) => {
    const token = ++captureTokenRef.current;

    // GPS 失敗エラーは「手動ピンで解消」したので消去（M1: エラー UI 残留対策）
    clear();

    // updater は純粋関数として保つため、副作用 (new Date) は外で評価
    const capturedAt = new Date().toISOString();
    dispatch({
      type: 'UPDATE_FIELD',
      index,
      updater: (f) => ({
        ...f,
        latitude: lat,
        longitude: lng,
        gpsAccuracyM: null,
        capturedAt,
        gpsSource: 'manual_pin',
      }),
    });

    setComputing(true);
    try {
      // accuracyM=0 で confidence は high になり得るが、source='manual_pin' のため
      // AI コンテキスト側で「手動配置」と区別される
      const { result: pos, error: posError } = await computeShotPosition({
        roundId,
        holeNumber,
        latitude: lat,
        longitude: lng,
        accuracyM: 0,
      });
      if (posError) {
        console.warn('computeShotPosition (manual_pin) returned error:', posError);
      }
      if (pos && token === captureTokenRef.current) {
        const calculatedAt = new Date().toISOString();
        dispatch({
          type: 'UPDATE_FIELD',
          index,
          updater: (f) => {
            if (f.latitude == null || f.longitude == null) return f;
            return {
              ...f,
              autoLie: pos.autoLie,
              // manual_pin は GPS 精度に基づく high/medium/low ではなく、low に固定
              // （手動配置は GPS と同等の精度保証ができないため）
              autoLieConfidence: 'low',
              remainingToGreenM: pos.remainingToGreenM,
              autoLieCalculatedAt: calculatedAt,
            };
          },
        });
      }
    } catch (err) {
      console.error('computeShotPosition (manual_pin) failed:', err);
    } finally {
      if (token === captureTokenRef.current) {
        setComputing(false);
      }
    }
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
          {/* インライン地図プレビュー（GPS-ready コースのみ） */}
          {mapData && form.latitude != null && form.longitude != null && (
            <div className="pt-2 flex justify-center">
              <HoleMapPreview
                aerialImageUrl={mapData.aerialImageUrl}
                metadata={mapData.metadata}
                areas={mapData.areas}
                position={{
                  lat: form.latitude,
                  lng: form.longitude,
                  accuracyM: form.gpsAccuracyM ?? undefined,
                  source: form.gpsSource ?? undefined,
                }}
                size={180}
                onClick={() => setMapLightboxOpen(true)}
                ariaLabel="記録した位置を地図で表示（タップで拡大）"
              />
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
        <div className="space-y-2">
          <div
            className="flex items-start gap-2 rounded-lg border border-rose-700 bg-rose-950/40 px-3 py-2 text-sm text-rose-300"
            role="alert"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{gpsError.message}</span>
          </div>
          {/* GPS-ready コースなら手動ピン留めを提示 */}
          {mapData && (
            <button
              type="button"
              onClick={() => setManualPinOpen(true)}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-emerald-300 text-sm font-medium transition-colors"
            >
              <MapIcon className="h-4 w-4" aria-hidden="true" />
              🗺️ 地図で位置を指定
            </button>
          )}
        </div>
      )}

      {/* lightbox: プレビュータップで衛星画像をフルスクリーン表示 */}
      {mapData && (
        <HoleMapLightbox
          open={mapLightboxOpen}
          onClose={() => setMapLightboxOpen(false)}
          aerialImageUrl={mapData.aerialImageUrl}
          metadata={mapData.metadata}
          areas={mapData.areas}
          position={
            form.latitude != null && form.longitude != null
              ? {
                  lat: form.latitude,
                  lng: form.longitude,
                  accuracyM: form.gpsAccuracyM ?? undefined,
                  source: form.gpsSource ?? undefined,
                }
              : null
          }
        />
      )}

      {/* 手動ピン留めモーダル */}
      {mapData && (
        <ManualPinModal
          open={manualPinOpen}
          onClose={() => setManualPinOpen(false)}
          onPin={handleManualPin}
          aerialImageUrl={mapData.aerialImageUrl}
          metadata={mapData.metadata}
          areas={mapData.areas}
        />
      )}
    </div>
  );
}
