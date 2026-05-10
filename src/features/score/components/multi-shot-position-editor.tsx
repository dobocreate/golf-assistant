'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, MapPin, Check, Edit3, Undo2, AlertCircle, Loader2 } from 'lucide-react';
import { pixelToLatLng, type AerialImageMetadata, type HoleArea } from '@/lib/geo';
import { metersToYards } from '@/lib/geolocation/lie-detection';
import { AerialAreaOverlay } from '@/features/course/components/aerial-area-overlay';
import { MultiShotOverlay } from './multi-shot-overlay';
import { EditPositionModal } from './edit-position-modal';
import { useMultiShotEdit } from '@/features/score/hooks/use-multi-shot-edit';
import type {
  SaveShotPosition,
  RevertShotPosition,
  DraftPosition,
} from '@/features/score/hooks/use-multi-shot-edit';
import type { Shot, GpsSource } from '@/features/score/types';

/** tap vs drag 判定閾値 (px)。pointerDown→pointerUp の移動距離がこれ未満なら tap 扱い */
const TAP_THRESHOLD_PX = 4;

/** 選択中ショットの情報文字列 (ヒントバー表示用) */
function formatSelectedShotInfo(shot: Shot): string {
  const parts: string[] = [`${shot.shot_number}打目`];
  if (shot.club) parts.push(shot.club);
  if (shot.remaining_to_green_m != null) parts.push(`残${metersToYards(shot.remaining_to_green_m)}y`);
  return parts.join(' / ');
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 編集対象ショット (1 ホール分) */
  shots: Shot[];
  aerialImageUrl: string;
  metadata: AerialImageMetadata;
  areas: HoleArea[];
  /** 保存 callback (ScoreInput / ShotTrajectorySection で inject) */
  saveShotPosition: SaveShotPosition;
  /** revert callback (同上) */
  revertShotPosition: RevertShotPosition;
  /** ヘッダー表示用ホール番号 */
  holeNumber: number;
}

/**
 * マルチショット位置編集モーダル
 *
 * Sprint 6 PR1 (S-6e/F-1) — 1 ホール分の全ショット位置を 1 画面で編集する。
 *
 * 設計参照: `_bmad-output/planning-artifacts/sprint6-multi-shot-position-editor.md`
 *   Section 1 / 2 / 4 / 8
 *
 * **インタラクション (ハイブリッド方式)**:
 * - 初期状態: マーカー一覧モード (マーカータップで選択)
 * - 選択中モード: ドラッグで位置変更、フッターで確定/詳細編集/元に戻す/キャンセル
 * - tap vs drag 閾値: PointerDown→PointerUp 移動 < 4px なら tap (selection toggle)
 *
 * **クローズ時の安全策**:
 * - 未確定 draft があれば confirm「変更を破棄しますか？」
 * - キャンセルで close を中止、OK で全 draft 破棄して close
 *
 * **ネスト起動**:
 * - フッターの「詳細編集」で `EditPositionModal` を z-[70] で開く
 * - EditPositionModal の onSave 成功で当該ショットの最新値を syncShot で反映
 */
export function MultiShotPositionEditor({
  open,
  onClose,
  shots,
  aerialImageUrl,
  metadata,
  areas,
  saveShotPosition,
  revertShotPosition,
  holeNumber,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const {
    shots: liveShots,
    drafts,
    selectedShotId,
    savingShotIds,
    saveError,
    select,
    dragTo,
    commit,
    discardDraft,
    discardAllDrafts,
    revert,
    syncShot,
  } = useMultiShotEdit({ shots, saveShotPosition, revertShotPosition });

  // EditPositionModal (詳細編集) ネスト起動
  const [detailEditOpen, setDetailEditOpen] = useState(false);

  // ドラッグ状態管理 (tap vs drag 閾値)
  // pointerDown 時の座標を保持、pointerUp 時に閾値判定で tap か drag か決める
  const dragRef = useRef<{
    shotId: string;
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);

  // モーダルが閉じたら詳細編集も閉じる
  useEffect(() => {
    if (!open) {
      setDetailEditOpen(false);
      dragRef.current = null;
    }
  }, [open]);

  // フック類は条件分岐より前に必ず呼ぶ (react-hooks/rules-of-hooks)
  const finalWidth = metadata.final_width ?? metadata.rotated_width;
  const finalHeight = metadata.final_height ?? metadata.rotated_height;

  /**
   * コンテナ座標 → 画像内ピクセル座標 → lat/lng
   * (EditPositionModal と同じロジック、object-contain レターボックス対応)
   */
  const eventToLatLng = useCallback(
    (clientX: number, clientY: number): { lat: number; lng: number } | null => {
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
    },
    [finalWidth, finalHeight, metadata],
  );

  // Escape キーで閉じる (未確定 draft があれば confirm)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 選択中ショット (Hooks は条件分岐の前に必ず呼ぶ)
  const selectedShot = useMemo(
    () => (selectedShotId ? liveShots.find((s) => s.id === selectedShotId) ?? null : null),
    [liveShots, selectedShotId],
  );

  if (!open) return null;

  const hasDrafts = drafts.size > 0;

  // マーカータップ / ドラッグ開始
  const handleShotPointerDown = (shotId: string, e: React.PointerEvent<SVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 別マーカー (or 未選択) → 選択するだけ (drag は次回 pointerDown から、誤操作防止)
    if (selectedShotId !== shotId) {
      select(shotId);
      return;
    }
    // 選択中マーカーへの再 pointerDown はドラッグ開始扱い
    dragRef.current = {
      shotId,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
    // pointerCapture を SVG element に張る (コンテナ外にも追従)
    try {
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* noop */
    }
  };

  // コンテナ全体への pointerMove (選択中マーカードラッグ)
  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) >= TAP_THRESHOLD_PX) {
      drag.moved = true;
    }
    if (!drag.moved) return;
    // 閾値超え後はドラッグとして扱い、draft 更新
    const latLng = eventToLatLng(e.clientX, e.clientY);
    if (!latLng) return;
    dragTo(drag.shotId, latLng.lat, latLng.lng);
  };

  const handleContainerPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    // moved=false なら tap → 選択解除 (toggle)
    if (!drag.moved) {
      select(drag.shotId);
    }
    dragRef.current = null;
  };

  // pointercancel: タッチ中断 (電話・通知等)。moved 後の半端 draft は破棄、selection 誤 toggle も防止
  const handleContainerPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    if (drag.moved) {
      discardDraft(drag.shotId);
    }
    dragRef.current = null;
  };

  // フッターアクション
  const handleCommit = async () => {
    if (!selectedShotId) return;
    await commit(selectedShotId);
  };

  const handleRevert = async () => {
    if (!selectedShotId) return;
    if (drafts.has(selectedShotId)) {
      // S2 対応: draft ありの状態で revert は不可 (UI でも disable する)
      return;
    }
    const ok = window.confirm('元の位置に戻します。よろしいですか？');
    if (!ok) return;
    await revert(selectedShotId);
  };

  const handleClose = () => {
    if (hasDrafts) {
      const ok = window.confirm('未確定の変更があります。破棄して閉じますか？');
      if (!ok) return;
      discardAllDrafts();
    }
    select(null);
    onClose();
  };

  // 詳細編集 (EditPositionModal nested)
  const selectedDraft: DraftPosition | undefined = selectedShotId ? drafts.get(selectedShotId) : undefined;
  const detailInitialPosition = selectedShot
    ? {
        lat: selectedDraft?.lat ?? selectedShot.latitude ?? 0,
        lng: selectedDraft?.lng ?? selectedShot.longitude ?? 0,
        source: (selectedDraft?.source ?? selectedShot.gps_source ?? 'gps') as GpsSource,
      }
    : null;

  const handleDetailSave = async (data: {
    latitude: number;
    longitude: number;
    source: GpsSource;
    accuracyM: number | null;
  }): Promise<{ ok: true } | { ok: false; error: 'conflict' | 'failed' }> => {
    if (!selectedShot) return { ok: false, error: 'failed' };
    const draft: DraftPosition = {
      lat: data.latitude,
      lng: data.longitude,
      source: data.source,
      accuracyM: data.accuracyM,
      baseRevision: selectedShot.position_revision,
    };
    const result = await saveShotPosition({ shot: selectedShot, draft });
    if (result.ok) {
      // syncShot で最新値反映 + drag draft が残っていれば破棄（M1 対応）
      if (result.latestShot) syncShot(result.latestShot);
      discardDraft(selectedShot.id);
      setDetailEditOpen(false);
      return { ok: true };
    }
    if (result.latestShot) syncShot(result.latestShot);
    return { ok: false, error: result.error };
  };

  // マーカー描画モード
  const overlayMode = selectedShotId ? 'selected' : 'list';

  // 選択中ショットのフッター情報
  const selectedShotInfo = selectedShot ? formatSelectedShotInfo(selectedShot) : null;

  const isSavingSelected = selectedShotId ? savingShotIds.has(selectedShotId) : false;
  const hasSelectedDraft = selectedShotId ? drafts.has(selectedShotId) : false;
  const canRevert =
    selectedShot != null &&
    selectedShot.original_latitude != null &&
    selectedShot.original_longitude != null &&
    !hasSelectedDraft;

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/90"
      role="dialog"
      aria-modal="true"
      aria-label={`ホール ${holeNumber} の軌跡を編集`}
    >
      {/* ヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/95 border-b border-gray-700 flex-shrink-0">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <MapPin className="h-4 w-4" aria-hidden="true" />
          軌跡を編集 ・ ホール {holeNumber}
          {hasDrafts && (
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-200 border border-amber-500/50">
              未確定 {drafts.size}
            </span>
          )}
        </h2>
        <button
          type="button"
          className="text-white bg-gray-700 hover:bg-gray-600 rounded-full p-1.5"
          onClick={handleClose}
          aria-label="閉じる"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ヒントバー */}
      <div className="px-4 py-2 bg-gray-800/70 text-sm text-gray-200 border-b border-gray-700 flex-shrink-0">
        {selectedShotId == null
          ? '👆 マーカーをタップして編集対象のショットを選択'
          : hasSelectedDraft
            ? `🟡 ${selectedShotInfo} ・ 変更未確定: 「確定」または別マーカーで保存`
            : `✏️ ${selectedShotInfo} ・ ドラッグで位置変更、または下のアクションを選択`}
      </div>

      {/* マップ本体 */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-gray-900 select-none"
        style={{ touchAction: 'none' }}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerCancel={handleContainerPointerCancel}
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
        <MultiShotOverlay
          shots={liveShots}
          metadata={metadata}
          mode={overlayMode}
          drafts={drafts}
          selectedShotId={selectedShotId}
          onShotPointerDown={handleShotPointerDown}
        />
      </div>

      {/* エラーバー */}
      {saveError && (
        <div
          className="px-4 py-2 bg-rose-950/60 text-sm text-rose-200 border-t border-rose-800 flex-shrink-0 flex items-start gap-2"
          role="alert"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            {saveError === 'conflict'
              ? '他のデバイスで位置が編集されました。最新の位置を反映しましたので、必要であれば再度編集して確定してください。'
              : '位置の更新に失敗しました。通信状況を確認して再度お試しください。'}
          </span>
        </div>
      )}

      {/* フッター: selection 状態に応じて切替 */}
      <div className="px-4 py-3 bg-gray-900/95 border-t border-gray-700 flex-shrink-0 space-y-2 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        {selectedShotId == null ? (
          <button
            type="button"
            onClick={handleClose}
            className="w-full min-h-[48px] rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium"
          >
            閉じる
          </button>
        ) : (
          <>
            {/* 詳細編集 / 元に戻す (sub action 行) */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDetailEditOpen(true)}
                disabled={isSavingSelected}
                className="flex-1 min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-emerald-300 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Edit3 className="h-4 w-4" />
                詳細編集
              </button>
              <button
                type="button"
                onClick={handleRevert}
                disabled={!canRevert || isSavingSelected}
                className="flex-1 min-h-[44px] rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-700 text-amber-300 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
                title={
                  hasSelectedDraft
                    ? '先に変更を確定または破棄してください'
                    : !canRevert
                      ? '元の位置情報がありません'
                      : '元の GPS 位置に戻します'
                }
              >
                <Undo2 className="h-4 w-4" />
                元に戻す
              </button>
            </div>
            {/* 確定 / キャンセル選択 (main action 行) */}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => select(null)}
                disabled={isSavingSelected}
                className="flex-1 min-h-[48px] rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium disabled:opacity-50"
              >
                選択解除
              </button>
              <button
                type="button"
                onClick={handleCommit}
                disabled={!hasSelectedDraft || isSavingSelected}
                className="flex-1 min-h-[48px] rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSavingSelected ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                確定
              </button>
            </div>
          </>
        )}
      </div>

      {/* ネスト: 詳細編集モーダル */}
      {detailInitialPosition && (
        <EditPositionModal
          open={detailEditOpen}
          onClose={() => setDetailEditOpen(false)}
          onSave={handleDetailSave}
          initialPosition={detailInitialPosition}
          aerialImageUrl={aerialImageUrl}
          metadata={metadata}
          areas={areas}
          zIndexLevel="nested"
        />
      )}
    </div>
  );
}
