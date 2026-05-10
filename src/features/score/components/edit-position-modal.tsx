'use client';

import { useEffect, useRef, useState } from 'react';
import { X, MapPin, Check, RotateCcw, Loader2 } from 'lucide-react';
import { latLngToPixel, pixelToLatLng, type AerialImageMetadata, type HoleArea } from '@/lib/geo';
import { AerialAreaOverlay } from '@/features/course/components/aerial-area-overlay';
import { useGeolocation } from '@/lib/geolocation/use-geolocation';
import type { GpsSource } from '@/features/score/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /**
   * 確定時のコールバック。
   * - source: 'manual_edit' (ドラッグ後の確定) / 'gps' (再 GPS 取得後の確定)
   * - accuracyM: 'gps' 時のみ実値、'manual_edit' は null
   * - 戻り値で成功/失敗を返す。{ ok: false, error } の場合はモーダル内で警告表示し閉じない
   */
  onSave: (data: { latitude: number; longitude: number; source: GpsSource; accuracyM: number | null }) => Promise<{ ok: true } | { ok: false; error: 'conflict' | 'failed' }>;
  /** 初期マーカー位置（編集前の現在位置） */
  initialPosition: { lat: number; lng: number; source?: GpsSource };
  aerialImageUrl: string;
  metadata: AerialImageMetadata;
  areas: HoleArea[];
}

/**
 * 既存ショットの位置を編集するモーダル
 *
 * Sprint 5 PR7 (S-5c) — ラウンド中の位置補正フロー。
 * - 初期マーカーを表示し、ドラッグで移動可能（pointer events）
 * - 「現在地から取り直す」ボタンで再 GPS 取得
 * - 「確定」で onSave 呼び出し → 親が updateShotPosition を実行
 * - 「キャンセル」で破棄
 *
 * UX:
 *   - フルスクリーン地図（背景画像 + hole_areas オーバーレイ）
 *   - マーカーは大きめ（半径 12px、ドラッグハンドル感）
 *   - ドラッグ中はマーカーがポインタ追従、確定までは draft 扱い
 *   - 再 GPS 取得時は既存 useGeolocation を再利用（permission/error も同じ UI）
 */
export function EditPositionModal({
  open,
  onClose,
  onSave,
  initialPosition,
  aerialImageUrl,
  metadata,
  areas,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // draft = ドラッグ中・再 GPS 取得後の位置（未確定）。null なら initialPosition を表示
  const [draft, setDraft] = useState<{ lat: number; lng: number; source: GpsSource; accuracyM: number | null } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  // onSave 失敗時の UI フィードバック (conflict / failed)
  const [saveError, setSaveError] = useState<'conflict' | 'failed' | null>(null);

  const { loading: gpsLoading, error: gpsError, capture, clear: clearGeolocationState } = useGeolocation();

  // マウント時に draft をリセット
  useEffect(() => {
    if (!open) {
      setDraft(null);
      setIsDragging(false);
      setSaveError(null);
    }
  }, [open]);

  // initialPosition が外部から変更された場合（conflict 時に latestShot で同期されたケース等）、
  // 古い draft が残ったままだと「ユーザーは新位置を見たつもりが古い draft を保存」してしまう。
  // 検知して draft をリセット（saveError バナーは維持してユーザーに状況を伝える）
  const initialPosKey = `${initialPosition.lat},${initialPosition.lng}`;
  useEffect(() => {
    if (open) {
      setDraft(null);
      setIsDragging(false);
    }
    // open は意図的に依存に含めない（open=true への遷移時は上の effect でクリア済み、
    // ここでは「open のままで initialPosition が変化した」だけを検知したい）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPosKey]);

  // Escape で閉じる（親モーダルへの bubble 防止）
  // ManualPinModal と同じパターン: onClose を依存配列に含め stale closure を回避
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setDraft(null);
        setSaveError(null);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const finalWidth = metadata.final_width ?? metadata.rotated_width;
  const finalHeight = metadata.final_height ?? metadata.rotated_height;

  // 表示する位置（draft があれば draft、なければ initial）
  const displayPos = draft ?? {
    lat: initialPosition.lat,
    lng: initialPosition.lng,
    source: initialPosition.source ?? 'gps',
    accuracyM: null,
  };
  const markerPixel = latLngToPixel(displayPos.lat, displayPos.lng, metadata);

  /**
   * コンテナ座標 → 画像内ピクセル座標 → lat/lng
   * （ManualPinModal と同じロジック、object-contain レターボックス対応）
   */
  const eventToLatLng = (clientX: number, clientY: number): { lat: number; lng: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const containerW = rect.width;
    const containerH = rect.height;
    const scale = Math.min(containerW / finalWidth, containerH / finalHeight);
    const displayedW = finalWidth * scale;
    const displayedH = finalHeight * scale;
    const offsetX = (containerW - displayedW) / 2;
    const offsetY = (containerH - displayedH) / 2;

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < offsetX || x > offsetX + displayedW) return null;
    if (y < offsetY || y > offsetY + displayedH) return null;

    const imagePxX = (x - offsetX) / scale;
    const imagePxY = (y - offsetY) / scale;
    return pixelToLatLng(imagePxX, imagePxY, metadata);
  };

  // pointer events: マーカー上でドラッグ開始 / 画像上でも tap でジャンプ
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // primary button (touch / left mouse) のみ
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const latLng = eventToLatLng(e.clientX, e.clientY);
    if (!latLng) return;
    // ドラッグ開始時に GPS エラー（前回の取り直し失敗）と保存エラーをクリア
    clearGeolocationState();
    setSaveError(null);
    setIsDragging(true);
    setDraft({ lat: latLng.lat, lng: latLng.lng, source: 'manual_edit', accuracyM: null });
    // pointer capture でコンテナ外への移動も追える
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const latLng = eventToLatLng(e.clientX, e.clientY);
    if (!latLng) return;
    setDraft({ lat: latLng.lat, lng: latLng.lng, source: 'manual_edit', accuracyM: null });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };

  const handleRecaptureGps = async () => {
    setSaveError(null); // 前回の保存エラー表示があれば消す
    const result = await capture();
    if (!result) return; // useGeolocation がエラー state を持つ
    setDraft({
      lat: result.latitude,
      lng: result.longitude,
      source: 'gps',
      accuracyM: result.accuracyM,
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await onSave({
        latitude: draft.lat,
        longitude: draft.lng,
        source: draft.source,
        accuracyM: draft.accuracyM,
      });
      if (result.ok) {
        // 成功: モーダルクローズは親が制御（onSave 内で setEditPositionOpen(false)）
        setDraft(null);
      } else {
        // 失敗: モーダルは開いたままエラー表示。親側はクローズしない約束
        setSaveError(result.error);
      }
    } catch (err) {
      console.error('EditPositionModal save failed:', err);
      setSaveError('failed');
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setDraft(null);
    onClose();
  };

  const isManualEdit = displayPos.source === 'manual_edit' || displayPos.source === 'manual_pin';
  const hasChanges = draft != null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label="位置を編集"
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/95 border-b border-gray-700 flex-shrink-0">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          位置を編集
        </h2>
        <button
          type="button"
          className="text-white bg-gray-700 hover:bg-gray-600 rounded-full p-1.5"
          onClick={handleClose}
          aria-label="キャンセル"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ヒントバー */}
      <div className="px-4 py-2 bg-gray-800/70 text-sm text-gray-200 border-b border-gray-700 flex-shrink-0">
        {hasChanges
          ? '✅ 位置を変更しました。確定または別の場所をタップ／ドラッグでやり直し。'
          : '👆 地図をタップ／ドラッグで位置を変更してください'}
      </div>

      {/* マップ本体 */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-gray-900 cursor-crosshair touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={aerialImageUrl}
          alt=""
          className="w-full h-full object-contain pointer-events-none select-none"
          draggable={false}
        />
        {areas.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            <AerialAreaOverlay areas={areas} metadata={metadata} />
          </div>
        )}
        {markerPixel && isFinite(markerPixel.px) && isFinite(markerPixel.py) && (
          <svg
            viewBox={`0 0 ${finalWidth} ${finalHeight}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden="true"
          >
            <circle
              cx={markerPixel.px}
              cy={markerPixel.py}
              r={12}
              fill="#10b981"
              stroke="#ffffff"
              strokeWidth={2.5}
              strokeDasharray={isManualEdit ? '3 2' : undefined}
              opacity={isDragging ? 0.7 : 1}
            />
            {/* 中央ドット（ドラッグ可視性向上） */}
            <circle cx={markerPixel.px} cy={markerPixel.py} r={2.5} fill="#ffffff" />
          </svg>
        )}
      </div>

      {/* 再 GPS 取得エリア（エラー含む） */}
      {gpsError && (
        <div className="px-4 py-2 bg-rose-950/40 text-sm text-rose-300 border-t border-rose-800 flex-shrink-0">
          {gpsError.message}
        </div>
      )}
      {saveError && (
        <div className="px-4 py-2 bg-rose-950/60 text-sm text-rose-200 border-t border-rose-800 flex-shrink-0" role="alert">
          {saveError === 'conflict'
            ? '⚠️ 他のデバイスで位置が編集されました。最新の位置を反映しましたので、必要であれば再度編集して確定してください。'
            : '⚠️ 位置の更新に失敗しました。通信状況を確認して再度お試しください。'}
        </div>
      )}

      {/* フッター */}
      <div className="px-4 py-3 bg-gray-900/95 border-t border-gray-700 flex-shrink-0 space-y-2 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        <button
          type="button"
          onClick={handleRecaptureGps}
          disabled={gpsLoading || saving}
          className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-emerald-300 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {gpsLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> 位置を取得中…
            </>
          ) : (
            <>
              <RotateCcw className="h-4 w-4" /> 現在地から取り直す
            </>
          )}
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="flex-1 min-h-[48px] rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || saving}
            className="flex-1 min-h-[48px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            確定
          </button>
        </div>
      </div>
    </div>
  );
}
