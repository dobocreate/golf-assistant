'use client';

import { useEffect, useRef, useState } from 'react';
import { MapPin, Check, AlertCircle, Loader2, Map as MapIcon } from 'lucide-react';
import { useGeolocation } from '@/lib/geolocation/use-geolocation';
import { lieToJapanese, metersToYards } from '@/lib/geolocation/lie-detection';
import { computeShotPosition, updateShotPosition } from '@/actions/shot-position';
import { getHoleMapDataForRoundHole } from '@/actions/hole-map';
import { useHoleMapCache } from '@/features/score/hooks/use-hole-map-cache';
import type { ShotFormState, AutoLieConfidence, GpsSource } from '@/features/score/types';
import type { ShotFormAction } from '@/features/score/hooks/use-shot-recorder';
import type { AerialImageMetadata, HoleArea } from '@/lib/geo';
import { HoleMapPreview, HoleMapLightbox } from './hole-map-preview';
import { ManualPinModal } from './manual-pin-modal';
import { EditPositionModal } from './edit-position-modal';

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
  /** Sprint 5 PR7: 既存 shot の id（保存済みなら有り、新規 shot は null） */
  shotId?: string | null;
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
export function ShotPositionRecorder({ index, form, dispatch, roundId, holeNumber, shotId }: Props) {
  const { loading: gpsLoading, error: gpsError, capture, clear } = useGeolocation();
  const [computing, setComputing] = useState(false);
  // 取得操作ごとに発番するトークン。clear や再取得で increment し、
  // 進行中の computeShotPosition 結果が古い場合は dispatch しない（race 防止）
  const captureTokenRef = useRef(0);

  // GPS-ready コースの map data（hole_view_configs.object_key → R2 URL + metadata + hole_areas）
  // ホール変更時にフェッチし直す。GPS-ready でないコースでは null
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [mapLightboxOpen, setMapLightboxOpen] = useState(false);
  const [manualPinOpen, setManualPinOpen] = useState(false);
  const [editPositionOpen, setEditPositionOpen] = useState(false);

  // Sprint 5 PR10: 親 (ScoreClientShell) でプリフェッチ済みなら cache hit、未配置時は lazy load fallback
  const mapCache = useHoleMapCache();

  useEffect(() => {
    // cache hit: 即同期 set（fetch しない、モーダル状態にも触らない）
    // 親の任意の再レンダーで cache 参照が変わってもモーダルが誤クローズしないよう、
    // 状態リセットは cache miss 時のみに限定。
    const cached = mapCache.get(holeNumber);
    if (cached !== undefined) {
      setMapData(cached);
      return;
    }

    let cancelled = false;
    // cache miss: ホール切替直後を想定し、古い mapData / モーダル状態をクリア
    // （fetch resolve 前に古い画像・metadata で手動ピンされるのを防ぐ）
    setMapData(null);
    setMapLightboxOpen(false);
    setManualPinOpen(false);
    setEditPositionOpen(false);

    (async () => {
      try {
        const data = await mapCache.ensure(holeNumber, () =>
          getHoleMapDataForRoundHole(roundId, holeNumber),
        );
        if (!cancelled) setMapData(data);
      } catch (err) {
        // ネットワークエラー等で fetch が失敗してもアプリは動作続行（プレビュー非表示のみ）
        console.error('Failed to fetch hole map data:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId, holeNumber, mapCache]);

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

  /**
   * 位置編集確定 (S-5c)
   *
   * - 既存 shot (shotId 有): updateShotPosition で DB を即時 PATCH（楽観的ロック付き）
   *   返却された shot から GPS 関連フィールドを form state に反映
   * - 新規 shot (shotId 無): computeShotPosition で lie/距離を再計算し form state のみ更新
   *   originalLatitude/Longitude も初回編集時のみ form に保存
   */
  const handleEditSave = async (data: {
    latitude: number;
    longitude: number;
    source: GpsSource;
    accuracyM: number | null;
  }): Promise<{ ok: true } | { ok: false; error: 'conflict' | 'failed' }> => {
    const token = ++captureTokenRef.current;

    // 初回編集時 (form.originalLatitude が null) は元の lat/lng を退避
    const previousLat = form.latitude;
    const previousLng = form.longitude;
    const shouldPreserveOriginal =
      data.source !== 'gps' &&
      form.originalLatitude == null &&
      previousLat != null &&
      previousLng != null;

    if (shotId) {
      // 既存 shot: updateShotPosition で即時 DB PATCH
      try {
        const { shot, error: updErr, latestShot } = await updateShotPosition({
          shotId,
          latitude: data.latitude,
          longitude: data.longitude,
          gpsSource: data.source,
          accuracyM: data.accuracyM,
          expectedRevision: form.positionRevision ?? undefined,
        });
        if (updErr) {
          console.warn('updateShotPosition failed:', updErr);
          // conflict 時: 最新 shot で cache/form を同期して、ユーザーが再編集できるようにする
          if (updErr === 'conflict' && latestShot && token === captureTokenRef.current) {
            dispatch({ type: 'UPDATE_CACHED_SHOT', index, updatedShot: latestShot });
            dispatch({
              type: 'UPDATE_FIELD',
              index,
              updater: (f) => ({
                ...f,
                latitude: latestShot.latitude,
                longitude: latestShot.longitude,
                gpsAccuracyM: latestShot.gps_accuracy_m,
                capturedAt: latestShot.captured_at,
                gpsSource: latestShot.gps_source,
                autoLie: latestShot.auto_lie,
                autoLieConfidence: latestShot.auto_lie_confidence,
                remainingToGreenM: latestShot.remaining_to_green_m,
                autoLieCalculatedAt: latestShot.auto_lie_calculated_at,
                originalLatitude: latestShot.original_latitude,
                originalLongitude: latestShot.original_longitude,
                editedAt: latestShot.edited_at,
                positionRevision: latestShot.position_revision,
              }),
            });
            return { ok: false as const, error: 'conflict' as const };
          }
          // それ以外（その他 DB エラー、または latestShot 取得失敗）
          return { ok: false as const, error: updErr === 'conflict' ? 'conflict' as const : 'failed' as const };
        }
        if (shot && token === captureTokenRef.current) {
          // (1) cache の shot を最新値で置き換え（form は触らない → club/result/note 等の未保存編集は保持）
          dispatch({ type: 'UPDATE_CACHED_SHOT', index, updatedShot: shot });
          // (2) form の GPS 関連フィールドだけ最新値に同期（hasFormChanged 比較で GPS 差分が消える）
          dispatch({
            type: 'UPDATE_FIELD',
            index,
            updater: (f) => ({
              ...f,
              latitude: shot.latitude,
              longitude: shot.longitude,
              gpsAccuracyM: shot.gps_accuracy_m,
              capturedAt: shot.captured_at,
              gpsSource: shot.gps_source,
              autoLie: shot.auto_lie,
              autoLieConfidence: shot.auto_lie_confidence,
              remainingToGreenM: shot.remaining_to_green_m,
              autoLieCalculatedAt: shot.auto_lie_calculated_at,
              originalLatitude: shot.original_latitude,
              originalLongitude: shot.original_longitude,
              editedAt: shot.edited_at,
              positionRevision: shot.position_revision,
            }),
          });
        }
        return { ok: true as const };
      } catch (err) {
        console.error('updateShotPosition threw:', err);
        return { ok: false as const, error: 'failed' as const };
      }
    }

    // 新規 shot: form state のみ更新 + computeShotPosition で lie 再計算
    const editedAt = new Date().toISOString();
    dispatch({
      type: 'UPDATE_FIELD',
      index,
      updater: (f) => ({
        ...f,
        latitude: data.latitude,
        longitude: data.longitude,
        gpsAccuracyM: data.accuracyM,
        capturedAt: data.source === 'gps' ? editedAt : f.capturedAt,
        gpsSource: data.source,
        // 再 GPS 取得は「手動編集」ではないため editedAt をリセット（null）
        editedAt: data.source === 'gps' ? null : editedAt,
        positionRevision: (f.positionRevision ?? 0) + 1,
        ...(shouldPreserveOriginal
          ? { originalLatitude: previousLat, originalLongitude: previousLng }
          : {}),
      }),
    });

    setComputing(true);
    try {
      const { result: pos, error: posError } = await computeShotPosition({
        roundId,
        holeNumber,
        latitude: data.latitude,
        longitude: data.longitude,
        accuracyM: data.accuracyM ?? 0,
      });
      if (posError) {
        console.warn('computeShotPosition (edit) returned error:', posError);
      }
      if (pos && token === captureTokenRef.current) {
        const calculatedAt = new Date().toISOString();
        dispatch({
          type: 'UPDATE_FIELD',
          index,
          updater: (f) => {
            if (f.latitude == null || f.longitude == null) return f;
            // gps_source ごとに confidence を上書き
            const conf =
              data.source === 'manual_edit'
                ? 'medium'
                : data.source === 'manual_pin'
                  ? 'low'
                  : pos.autoLieConfidence;
            return {
              ...f,
              autoLie: pos.autoLie,
              autoLieConfidence: conf,
              remainingToGreenM: pos.remainingToGreenM,
              autoLieCalculatedAt: calculatedAt,
            };
          },
        });
      }
    } catch (err) {
      console.error('computeShotPosition (edit) failed:', err);
    } finally {
      if (token === captureTokenRef.current) {
        setComputing(false);
      }
    }

    // 新規 shot 経路は form 更新で完了（DB 永続化は次の hole save に任せる）
    return { ok: true as const };
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
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* GPS-ready コースのみ「編集」リンクを表示（mapData が必要） */}
              {mapData && (
                <button
                  type="button"
                  onClick={() => setEditPositionOpen(true)}
                  className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2 min-h-[32px] px-1"
                >
                  編集
                </button>
              )}
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2 min-h-[32px] px-1"
              >
                クリア
              </button>
            </div>
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

      {/* 位置編集モーダル (Sprint 5 PR7 / S-5c) */}
      {mapData && form.latitude != null && form.longitude != null && (
        <EditPositionModal
          open={editPositionOpen}
          onClose={() => setEditPositionOpen(false)}
          onSave={async (data) => {
            const result = await handleEditSave(data);
            if (result.ok) {
              setEditPositionOpen(false);
            }
            // 失敗時はモーダル内で saveError を表示し、ユーザー判断でクローズ
            return result;
          }}
          initialPosition={{
            lat: form.latitude,
            lng: form.longitude,
            source: form.gpsSource ?? undefined,
          }}
          aerialImageUrl={mapData.aerialImageUrl}
          metadata={mapData.metadata}
          areas={mapData.areas}
        />
      )}
    </div>
  );
}
