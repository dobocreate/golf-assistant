'use client';

import { useState, useCallback, useRef } from 'react';
import { ChevronDown, ChevronRight, MapPin, Pencil, Undo2, Route, AlertCircle, X } from 'lucide-react';
import { getHoleMapDataForCourseHole, type HoleMapDataEntry } from '@/actions/hole-map';
import { updateShotPosition, revertShotPositionToOriginal } from '@/actions/shot-position';
import { lieToJapanese, metersToYards } from '@/lib/geolocation/lie-detection';
import type { Shot } from '@/features/score/types';
import type { AerialImageMetadata, HoleArea } from '@/lib/geo';
import { EditPositionModal } from '@/features/score/components/edit-position-modal';
import { MultiShotPositionEditor } from '@/features/score/components/multi-shot-position-editor';
import type {
  SaveShotPosition,
  RevertShotPosition,
} from '@/features/score/hooks/use-multi-shot-edit';
import { ShotMarkersOverlay } from '@/features/course/components/shot-markers-overlay';

interface MapData {
  aerialImageUrl: string;
  metadata: AerialImageMetadata;
  areas: HoleArea[];
}

interface Props {
  courseId: string;
  /** server から渡される初期データ。client side で編集後は editedShots で上書きする */
  initialShotsByHole: Array<{ holeNumber: number; shots: Shot[] }>;
  /** Sprint 5 PR10 (S-5e): ラウンド開始時にプリフェッチした全ホール map data
   *  cache に seed することでアコーディオン展開時の lazy load が不要になる */
  initialMapDataByHole?: HoleMapDataEntry[];
}

/**
 * ラウンド詳細画面のショット軌跡セクション
 *
 * Sprint 5 PR8 (S-6a + S-6b) — ラウンド後にショット位置を補正する UI。
 *
 * - ホール別アコーディオン（ホール番号 + GPS 付きショット数のサマリ）
 * - 開いたホールは衛星画像 + 既存 ShotMarkersOverlay で軌跡表示
 *   - map data はホール開時に lazy load（getHoleMapDataForCourseHole）
 * - 各ショットに「編集」ボタン → EditPositionModal で位置補正
 *   - updateShotPosition を直接呼び、成功後はクライアント state を更新
 *
 * GPS タグ付きショットがないホールは表示しない。
 */
export function ShotTrajectorySection({ courseId, initialShotsByHole, initialMapDataByHole }: Props) {
  const [shotsByHole, setShotsByHole] = useState<Map<number, Shot[]>>(
    () => new Map(initialShotsByHole.map((g) => [g.holeNumber, g.shots])),
  );
  const [openHoles, setOpenHoles] = useState<Set<number>>(new Set());
  // value が MapData = 取得成功 / null = 取得済みだが unavailable (hole_view_configs なし)
  // has() による fetched 判定で、loading 表示と unavailable 表示を区別する
  // Sprint 5 PR10 (S-5e): server 側で全ホール一括取得した map data を初期値として seed
  const [mapDataByHole, setMapDataByHole] = useState<Map<number, MapData | null>>(
    () => new Map(
      (initialMapDataByHole ?? []).map((m) => [m.holeNumber, {
        aerialImageUrl: m.aerialImageUrl,
        metadata: m.metadata,
        areas: m.areas,
      }]),
    ),
  );
  const [editing, setEditing] = useState<{ shot: Shot; mapData: MapData } | null>(null);
  // Sprint 6 PR2: マルチショット軌跡編集モーダル (null なら閉じてる)
  const [multiEditing, setMultiEditing] = useState<{ holeNumber: number; mapData: MapData } | null>(null);
  // Sprint 6 PR2: revert / 共通操作の inline 警告 (window.alert 廃止 / Codex 観点 #10)
  const [actionAlert, setActionAlert] = useState<string | null>(null);
  // 進行中の fetch promise を hole_number ごとに保持（同一ホール並行 fetch を防止）
  const inflightRef = useRef<Map<number, Promise<MapData | null>>>(new Map());

  const ensureMapData = useCallback(
    async (holeNumber: number): Promise<MapData | null> => {
      // 既に fetch 完了（成功/失敗問わず）していれば cache を返す
      if (mapDataByHole.has(holeNumber)) return mapDataByHole.get(holeNumber) ?? null;
      const inflight = inflightRef.current.get(holeNumber);
      if (inflight) return inflight;
      const promise = (async () => {
        try {
          const data = await getHoleMapDataForCourseHole(courseId, holeNumber);
          // null も明示的に set して「fetched but unavailable」を表現
          setMapDataByHole((prev) => {
            const next = new Map(prev);
            next.set(holeNumber, data);
            return next;
          });
          return data;
        } finally {
          // 例外時も inflight を確実にクリアして次回 fetch を可能にする
          inflightRef.current.delete(holeNumber);
        }
      })();
      inflightRef.current.set(holeNumber, promise);
      return promise;
    },
    [courseId, mapDataByHole],
  );

  // 当該 shot を local state (shotsByHole) と editing.shot に最新値で同期する。
  // updater は副作用を含まない pure に保つ（StrictMode の二重実行対策）。
  // useCallback で stable 参照化 (Gemini PR #232 指摘対応: useCallback deps に含める前提のため)
  // setState setter のみ呼ぶので deps は空でよい
  const replaceShot = useCallback((updated: Shot) => {
    setShotsByHole((prev) => {
      const arr = (prev.get(updated.hole_number) ?? []).slice();
      const idx = arr.findIndex((s) => s.id === updated.id);
      if (idx < 0) return prev;
      arr[idx] = updated;
      const next = new Map(prev);
      next.set(updated.hole_number, arr);
      return next;
    });
    // editing 状態の shot も最新値に同期（再編集時に正しい revision を送るため）
    setEditing((prevEdit) =>
      prevEdit && prevEdit.shot.id === updated.id
        ? { shot: updated, mapData: prevEdit.mapData }
        : prevEdit,
    );
  }, []);

  const handleToggle = async (holeNumber: number) => {
    setOpenHoles((prev) => {
      const next = new Set(prev);
      if (next.has(holeNumber)) {
        next.delete(holeNumber);
      } else {
        next.add(holeNumber);
        // 初回開時に map data を lazy load
        void ensureMapData(holeNumber);
      }
      return next;
    });
  };

  const handleEditClick = async (shot: Shot) => {
    const mapData = await ensureMapData(shot.hole_number);
    if (!mapData) return;
    setActionAlert(null); // 新操作開始時に過去の警告を消す
    setEditing({ shot, mapData });
  };

  // TODO(Sprint 6+): saveShotPositionForMulti とロジックがほぼ同一。旧 EditPositionModal 経路
  // (各ショットの「編集」ボタン) を撤去するタイミングで両者を共通 helper に統合する。
  const handleSavePosition = async (data: {
    latitude: number;
    longitude: number;
    source: 'gps' | 'manual_edit' | 'manual_pin';
    accuracyM: number | null;
  }): Promise<{ ok: true } | { ok: false; error: 'conflict' | 'failed' }> => {
    if (!editing) return { ok: false, error: 'failed' };
    const { shot: targetShot } = editing;
    const { shot, error: updErr, latestShot } = await updateShotPosition({
      shotId: targetShot.id,
      latitude: data.latitude,
      longitude: data.longitude,
      gpsSource: data.source,
      accuracyM: data.accuracyM,
      expectedRevision: targetShot.position_revision,
    });
    if (updErr) {
      // conflict は通常フローなのでログ抑制。failed のみ warn
      if (updErr === 'conflict') {
        if (latestShot) {
          replaceShot(latestShot);
          return { ok: false, error: 'conflict' };
        }
        // latestShot 取得失敗 (削除済み等): 永久 conflict ループになるため failed として扱う
        // ユーザーには「再読み込みしてください」を促すメッセージが EditPositionModal で表示される
        console.warn('updateShotPosition conflict but latestShot unavailable — treating as failed');
        return { ok: false, error: 'failed' };
      }
      console.warn('updateShotPosition failed:', updErr);
      return { ok: false, error: 'failed' };
    }
    if (shot) {
      replaceShot(shot);
    }
    return { ok: true };
  };

  const handleRevert = async (shot: Shot) => {
    if (shot.original_latitude == null || shot.original_longitude == null) return;
    // 不可逆操作のため、破棄される情報と GPS 出自不確実性を明示
    const ok = window.confirm(
      '編集前の位置に戻します。\nこの操作で編集内容（座標と精度）は破棄され、元には戻せません。\nよろしいですか？',
    );
    if (!ok) return;
    const { shot: reverted, error, latestShot } = await revertShotPositionToOriginal(
      shot.id,
      shot.position_revision,
    );
    if (error) {
      // conflict: 並行編集が走ったため最新値で local state を同期
      if (error === 'conflict' && latestShot) {
        replaceShot(latestShot);
        setActionAlert(
          '他のデバイスで編集が入ったため、元に戻せませんでした。最新の状態を反映しましたので、必要であれば再度操作してください。',
        );
        return;
      }
      // conflict だが latestShot が取得できない (削除済み等): debug ログ
      if (error === 'conflict') {
        console.warn('revertShotPositionToOriginal conflict but latestShot unavailable');
      } else {
        console.warn('revertShotPositionToOriginal failed:', error);
      }
      setActionAlert('元の位置に戻せませんでした。通信状況を確認してください。');
      return;
    }
    if (reverted) {
      setActionAlert(null); // 成功時に過去の警告を消す
      replaceShot(reverted);
    }
  };

  // Sprint 6 PR2: 「軌跡を編集」ボタンクリック → MultiShotPositionEditor 起動
  const handleMultiEditClick = async (holeNumber: number) => {
    const mapData = await ensureMapData(holeNumber);
    if (!mapData) return;
    setActionAlert(null);
    setMultiEditing({ holeNumber, mapData });
  };

  // Sprint 6 PR2: MultiShotPositionEditor へ inject する saveShotPosition callback
  // updateShotPosition + replaceShot を 1 関数にまとめる
  // TODO(Sprint 6+): handleSavePosition (旧 EditPositionModal 経路) と挙動が等価。
  // 旧 UI (各ショットの「編集」ボタン) 撤去のタイミングで共通 helper に統合する。
  const saveShotPositionForMulti: SaveShotPosition = useCallback(
    async ({ shot: targetShot, draft }) => {
      const { shot, error: updErr, latestShot } = await updateShotPosition({
        shotId: targetShot.id,
        latitude: draft.lat,
        longitude: draft.lng,
        gpsSource: draft.source,
        accuracyM: draft.accuracyM,
        expectedRevision: targetShot.position_revision,
      });
      if (updErr) {
        if (updErr === 'conflict') {
          if (latestShot) {
            replaceShot(latestShot);
            return { ok: false, error: 'conflict', latestShot };
          }
          // latestShot 取得失敗: 永久 conflict ループ回避のため failed として扱う
          console.warn('updateShotPosition conflict but latestShot unavailable');
          return { ok: false, error: 'failed' };
        }
        console.warn('updateShotPosition failed:', updErr);
        return { ok: false, error: 'failed' };
      }
      if (shot) replaceShot(shot);
      return { ok: true, latestShot: shot };
    },
    [replaceShot],
  );

  // Sprint 6 PR2: MultiShotPositionEditor へ inject する revertShotPosition callback
  const revertShotPositionForMulti: RevertShotPosition = useCallback(async (shot) => {
    const { shot: reverted, error, latestShot } = await revertShotPositionToOriginal(
      shot.id,
      shot.position_revision,
    );
    if (error) {
      if (error === 'conflict' && latestShot) {
        replaceShot(latestShot);
        return { ok: false, error: 'conflict', latestShot };
      }
      console.warn('revertShotPositionToOriginal failed:', error);
      return { ok: false, error: 'failed' };
    }
    if (reverted) replaceShot(reverted);
    return { ok: true, latestShot: reverted };
  }, [replaceShot]);

  // GPS タグ付きショットがあるホールのみ表示（hole_number 昇順）
  const sortedHoles = Array.from(shotsByHole.entries())
    .filter(([, shots]) => shots.length > 0)
    .sort(([a], [b]) => a - b);

  // 注: 親 page.tsx 側で initialShotsByHole.length > 0 を条件にレンダーしているため、
  // sortedHoles が空のケースは通常到達しない。防御的に残しておく。
  if (sortedHoles.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <MapPin className="h-5 w-5" aria-hidden="true" />
        ショット軌跡
      </h2>
      {/* Sprint 6 PR2: revert / 軌跡編集の inline 警告バナー (window.alert 廃止) */}
      {actionAlert && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-800 dark:text-amber-200"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span className="flex-1">{actionAlert}</span>
          <button
            type="button"
            onClick={() => setActionAlert(null)}
            className="flex-shrink-0 rounded p-0.5 hover:bg-amber-100 dark:hover:bg-amber-900/30"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <div className="space-y-2">
        {sortedHoles.map(([holeNumber, shots]) => {
          const isOpen = openHoles.has(holeNumber);
          const mapData = mapDataByHole.get(holeNumber);
          return (
            <div
              key={holeNumber}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden"
            >
              <button
                type="button"
                onClick={() => handleToggle(holeNumber)}
                className="w-full flex items-center justify-between px-3 py-2 min-h-[48px] hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                aria-expanded={isOpen}
              >
                <div className="flex items-center gap-2">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" aria-hidden="true" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" aria-hidden="true" />
                  )}
                  <span className="font-bold">ホール {holeNumber}</span>
                  <span
                    className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded px-1.5 py-0.5"
                    aria-label={`GPS タグ付きショット ${shots.length} 件`}
                  >
                    📍 {shots.length}
                  </span>
                </div>
              </button>
              {isOpen && (() => {
                const hasFetched = mapDataByHole.has(holeNumber);
                return (
                  <div className="border-t border-gray-200 dark:border-gray-700 p-3 space-y-3">
                    {mapData ? (
                      <div className="flex flex-col items-center gap-2">
                        <div
                          className="relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
                          style={{
                            width: 280,
                            aspectRatio: `${mapData.metadata.final_width ?? mapData.metadata.rotated_width} / ${mapData.metadata.final_height ?? mapData.metadata.rotated_height}`,
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={mapData.aerialImageUrl}
                            alt={`ホール ${holeNumber} 衛星写真`}
                            className="w-full h-full object-contain"
                          />
                          <ShotMarkersOverlay shots={shots} metadata={mapData.metadata} />
                        </div>
                        {/* Sprint 6 PR2: 「軌跡を編集」ボタン → MultiShotPositionEditor 起動 */}
                        <button
                          type="button"
                          onClick={() => handleMultiEditClick(holeNumber)}
                          className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 rounded-lg px-3 py-1.5 min-h-[36px]"
                          aria-label={`ホール ${holeNumber} の軌跡をまとめて編集`}
                        >
                          <Route className="h-3.5 w-3.5" aria-hidden="true" />
                          軌跡を編集
                        </button>
                      </div>
                    ) : hasFetched ? (
                      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                        このホールは地図データが未整備のため、軌跡表示と編集はできません。
                      </p>
                    ) : (
                      <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                        地図を読み込み中…
                      </p>
                    )}

                  {/* ショット一覧
                      TODO(Sprint 6+): 各行の「編集/元に戻す」ボタンは新 MultiShotPositionEditor で
                      機能的に内包済み。実機検証で問題なければ後続スプリントで撤去予定。 */}
                  <ul className="space-y-1">
                    {shots.map((shot) => (
                      <li
                        key={shot.id}
                        className="flex items-center justify-between gap-2 text-sm px-2 py-1.5 rounded bg-gray-50 dark:bg-gray-800/50"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-emerald-700 dark:text-emerald-300 min-w-[24px]">
                            {shot.shot_number}
                          </span>
                          <span className="text-gray-700 dark:text-gray-300 truncate">
                            {shot.club ?? 'クラブ未指定'}
                            {shot.auto_lie && shot.auto_lie !== 'unknown' && (
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                · {lieToJapanese(shot.auto_lie)}
                              </span>
                            )}
                            {shot.remaining_to_green_m != null && (
                              <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                                · 残 {metersToYards(shot.remaining_to_green_m)}y
                              </span>
                            )}
                            {shot.gps_source && shot.gps_source !== 'gps' && (
                              <span className="text-xs text-amber-600 dark:text-amber-400 ml-1">
                                ✏️ {shot.gps_source === 'manual_pin' ? '手動配置' : '編集済'}
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* 編集済バッジと条件を揃える: original_* 有 かつ 現在 gps_source !== 'gps' */}
                          {/* (再 GPS 取得後は original_* が残っていてもバッジ非表示なため、ボタンも非表示が UX 整合) */}
                          {shot.original_latitude != null &&
                            shot.original_longitude != null &&
                            shot.gps_source !== 'gps' && (
                            <button
                              type="button"
                              onClick={() => handleRevert(shot)}
                              className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded px-2 py-1 min-h-[32px]"
                              aria-label={`ショット ${shot.shot_number} の編集を取り消して元のGPS位置に戻す`}
                              title="編集を取り消して元のGPS位置に戻す"
                            >
                              <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
                              元に戻す
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleEditClick(shot)}
                            disabled={!mapData}
                            className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded px-2 py-1 min-h-[32px] disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label={`ショット ${shot.shot_number} の位置を編集`}
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            編集
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {editing && (
        <EditPositionModal
          open={true}
          onClose={() => setEditing(null)}
          onSave={async (data) => {
            const result = await handleSavePosition(data);
            if (result.ok) setEditing(null);
            return result;
          }}
          initialPosition={{
            lat: editing.shot.latitude!,
            lng: editing.shot.longitude!,
            source: editing.shot.gps_source ?? undefined,
          }}
          aerialImageUrl={editing.mapData.aerialImageUrl}
          metadata={editing.mapData.metadata}
          areas={editing.mapData.areas}
        />
      )}

      {/* Sprint 6 PR2: マルチショット軌跡編集モーダル */}
      {multiEditing && (
        <MultiShotPositionEditor
          open={true}
          onClose={() => setMultiEditing(null)}
          shots={shotsByHole.get(multiEditing.holeNumber) ?? []}
          aerialImageUrl={multiEditing.mapData.aerialImageUrl}
          metadata={multiEditing.mapData.metadata}
          areas={multiEditing.mapData.areas}
          saveShotPosition={saveShotPositionForMulti}
          revertShotPosition={revertShotPositionForMulti}
          holeNumber={multiEditing.holeNumber}
        />
      )}
    </div>
  );
}
