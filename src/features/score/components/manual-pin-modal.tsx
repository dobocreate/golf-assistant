'use client';

import { useEffect, useRef, useState } from 'react';
import { X, MapPin, Check } from 'lucide-react';
import { latLngToPixel, pixelToLatLng, type AerialImageMetadata, type HoleArea } from '@/lib/geo';
import { AerialAreaOverlay } from '@/features/course/components/aerial-area-overlay';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 確定時のコールバック。lat/lng はピクセルから逆変換した値 */
  onPin: (lat: number, lng: number) => void;
  aerialImageUrl: string;
  metadata: AerialImageMetadata;
  areas: HoleArea[];
}

/**
 * 手動ピン留めモーダル
 *
 * Sprint 5 PR6 (S-5d) — GPS が permission_denied / position_unavailable / timeout で
 * 取得できなかった場合のフォールバック。フルスクリーン地図でユーザーがタップした
 * 位置を pixelToLatLng で緯度経度に変換し、`gps_source = 'manual_pin'` として記録する。
 *
 * UX:
 *   1. 「地図上をタップして位置を指定してください」のヒント表示
 *   2. タップでマーカー配置（破線リング = manual_pin スタイル）
 *   3. 別箇所タップで再配置可能
 *   4. 「確定」ボタンで onPin(lat, lng) → 親が form state に格納
 *   5. 「キャンセル」or 背景タップで onClose（ピン破棄）
 */
export function ManualPinModal({
  open,
  onClose,
  onPin,
  aerialImageUrl,
  metadata,
  areas,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);

  // Escape キーで閉じる（親 ShotRecorder モーダルへの bubble を防ぐ）
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setPin(null);
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  const finalWidth = metadata.final_width ?? metadata.rotated_width;
  const finalHeight = metadata.final_height ?? metadata.rotated_height;

  // クリック位置（コンテナ座標）→ 画像内のピクセル座標 → 緯度経度
  // コンテナは object-contain でレターボックスされるため、
  // 表示サイズ・オフセットを計算して逆算する
  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const containerW = rect.width;
    const containerH = rect.height;

    // object-contain の表示倍率
    const scale = Math.min(containerW / finalWidth, containerH / finalHeight);
    const displayedW = finalWidth * scale;
    const displayedH = finalHeight * scale;
    const offsetX = (containerW - displayedW) / 2;
    const offsetY = (containerH - displayedH) / 2;

    // クリック位置（コンテナ内）
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    // レターボックス外のクリックは無視
    if (clickX < offsetX || clickX > offsetX + displayedW) return;
    if (clickY < offsetY || clickY > offsetY + displayedH) return;

    // 画像のピクセル座標（natural size 基準）
    const imagePxX = (clickX - offsetX) / scale;
    const imagePxY = (clickY - offsetY) / scale;

    const latLng = pixelToLatLng(imagePxX, imagePxY, metadata);
    if (latLng) setPin(latLng);
  };

  const handleConfirm = () => {
    if (!pin) return;
    onPin(pin.lat, pin.lng);
    setPin(null);
    onClose();
  };

  const handleClose = () => {
    setPin(null);
    onClose();
  };

  // 仮ピンの表示用ピクセル座標
  const pinPixel = pin ? latLngToPixel(pin.lat, pin.lng, metadata) : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label="手動で位置を指定"
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/95 border-b border-gray-700 flex-shrink-0">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          地図で位置を指定
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
        {pin ? '✅ 位置を指定しました。確定または別の場所をタップしてやり直し。' : '👆 地図上をタップして位置を指定してください'}
      </div>

      {/* マップ本体 */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-gray-900 cursor-crosshair"
        onClick={handleImageClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={aerialImageUrl}
          alt=""
          className="w-full h-full object-contain pointer-events-none select-none"
        />
        {areas.length > 0 && (
          <div className="absolute inset-0 pointer-events-none">
            <AerialAreaOverlay areas={areas} metadata={metadata} />
          </div>
        )}
        {pinPixel && isFinite(pinPixel.px) && isFinite(pinPixel.py) && (
          <svg
            viewBox={`0 0 ${finalWidth} ${finalHeight}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 w-full h-full pointer-events-none"
            aria-hidden="true"
          >
            <circle
              cx={pinPixel.px}
              cy={pinPixel.py}
              r={8}
              fill="#10b981"
              stroke="#ffffff"
              strokeWidth={2}
              strokeDasharray="3 2"
            />
          </svg>
        )}
      </div>

      {/* フッター（確定ボタン） */}
      <div className="px-4 py-3 bg-gray-900/95 border-t border-gray-700 flex-shrink-0 flex gap-2 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        <button
          type="button"
          onClick={handleClose}
          className="flex-1 min-h-[48px] rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!pin}
          className="flex-1 min-h-[48px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Check className="h-4 w-4" />
          確定
        </button>
      </div>
    </div>
  );
}
