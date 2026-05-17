'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { latLngToPixel, type AerialImageMetadata, type HoleArea } from '@/lib/geo';
import { AerialAreaOverlay } from '@/features/course/components/aerial-area-overlay';
import type { GpsSource } from '@/features/score/types';

interface Position {
  lat: number;
  lng: number;
  accuracyM?: number;
  /** マーカーの種別。デフォルトは 'gps'（emerald 単色）/ 'manual_pin' は破線リング */
  source?: GpsSource;
}

interface Props {
  aerialImageUrl: string;
  metadata: AerialImageMetadata;
  areas: HoleArea[];
  /** 表示する現在地。未指定なら hole_areas のみ表示 */
  position?: Position | null;
  /** 表示サイズ（正方形）。デフォルト 200px */
  size?: number;
  /** タップ時のハンドラ。指定があれば cursor-zoom-in、なければクリック不可 */
  onClick?: () => void;
  /** ARIA ラベル */
  ariaLabel?: string;
}

/**
 * 衛星画像 + hole_areas + 現在地マーカーを SVG で重ねるプレビューコンポーネント
 *
 * Sprint 5 PR6 (S-5a) — ShotPositionRecorder にインライン表示し、ユーザーが
 * GPS 取得結果を視覚確認できるようにする。タップで lightbox 拡大。
 *
 * 描画レイヤ（z 順、後ろ→前）:
 *   1. 衛星画像（aerial_image_url）
 *   2. AerialAreaOverlay（hole_areas SVG）
 *   3. 現在地マーカー（精度円付き emerald 円 + 中央ドット）
 */
export function HoleMapPreview({
  aerialImageUrl,
  metadata,
  areas,
  position,
  size = 200,
  onClick,
  ariaLabel,
}: Props) {
  const finalWidth = metadata.final_width ?? metadata.rotated_width;
  const finalHeight = metadata.final_height ?? metadata.rotated_height;
  if (finalWidth <= 0 || finalHeight <= 0) return null;

  const positionPixel = position
    ? latLngToPixel(position.lat, position.lng, metadata)
    : null;

  const interactive = typeof onClick === 'function';

  // 精度円: 簡易スケール（accuracy m × 0.5、上限 30px）。実スケールでない旨は
  // ShotMarkersOverlay と同じ扱い（PR4 のコメント参照）。
  const accuracyRadiusPx =
    position?.accuracyM != null ? Math.min(position.accuracyM * 0.5, 30) : null;
  const isManualPin = position?.source === 'manual_pin';

  return (
    <div
      className={`relative rounded-lg overflow-hidden bg-gray-900 border border-gray-700 ${interactive ? 'cursor-zoom-in' : ''}`}
      style={{ width: size, height: size, aspectRatio: `${finalWidth} / ${finalHeight}` }}
      onClick={interactive ? onClick : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      role={interactive ? 'button' : 'img'}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel ?? '衛星画像プレビュー'}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={aerialImageUrl}
        alt=""
        className="w-full h-full object-contain"
        loading="lazy"
      />
      {areas.length > 0 && <AerialAreaOverlay areas={areas} metadata={metadata} />}
      {positionPixel && isFinite(positionPixel.px) && isFinite(positionPixel.py) && (
        <svg
          viewBox={`0 0 ${finalWidth} ${finalHeight}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 w-full h-full pointer-events-none"
          aria-hidden="true"
        >
          {accuracyRadiusPx != null && !isManualPin && (
            <circle
              cx={positionPixel.px}
              cy={positionPixel.py}
              r={accuracyRadiusPx}
              fill="rgba(16,185,129,0.15)"
              stroke="rgba(16,185,129,0.4)"
              strokeWidth={0.8}
            />
          )}
          <circle
            cx={positionPixel.px}
            cy={positionPixel.py}
            r={6}
            fill="#10b981"
            stroke="#ffffff"
            strokeWidth={2}
            strokeDasharray={isManualPin ? '3 2' : undefined}
          />
        </svg>
      )}
    </div>
  );
}

/**
 * HoleMapPreview を lightbox（フルスクリーン）で表示するモーダル
 *
 * onPin が指定されていれば、画像クリックで pixelToLatLng（暗黙: latLngToPixel の
 * inverse は本コンポーネントでは使わず、単にクリック座標を渡すだけ）。
 * 実装は ManualPinModal 側で行う想定（本コンポーネントは表示専用）。
 */
function computeLightboxSize(): number {
  if (typeof window === 'undefined') return 600;
  return Math.min(window.innerWidth - 32, window.innerHeight - 96, 800);
}

export function HoleMapLightbox({
  open,
  onClose,
  ...previewProps
}: Props & { open: boolean; onClose: () => void }) {
  // viewport リサイズ・デバイス回転に追従するため state で管理
  const [size, setSize] = useState(() => computeLightboxSize());
  const [lastOpen, setLastOpen] = useState(open);

  // open になった瞬間に最新サイズを取得 (render 中の adjusting state パターン)
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setSize(computeLightboxSize());
  }

  useEffect(() => {
    if (!open) return;
    const onResize = () => setSize(computeLightboxSize());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    // Escape で閉じる
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute top-4 right-4 text-white bg-black/60 rounded-full p-2 hover:bg-black/80 z-10"
        onClick={onClose}
        aria-label="閉じる"
      >
        <X className="h-5 w-5" />
      </button>
      <div onClick={(e) => e.stopPropagation()}>
        <HoleMapPreview {...previewProps} size={size} />
      </div>
    </div>
  );
}

