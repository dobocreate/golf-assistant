'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { upsertHole } from '@/actions/course';
import { useRouter } from 'next/navigation';
import type { Hole, HoleNote } from '@/features/course/types';
import { HoleNoteEditor } from './hole-note-editor';
import { HoleMapInfo } from './hole-map-info';
import type { HoleMapPoint, HoleViewConfig, HoleArea, AerialImageMetadata } from '@/lib/geo';
import { parseAerialImageMetadata } from '@/lib/geo';
import { AerialAreaOverlay } from './aerial-area-overlay';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

interface HoleListProps {
  courseId: string;
  holes: Hole[];
  holeNotes: HoleNote[];
  mapPoints?: HoleMapPoint[];
  viewConfigs?: Record<string, HoleViewConfig>;
  holeAreas?: HoleArea[];
}

interface LightboxImage {
  src: string;
  alt: string;
  areas?: HoleArea[];
  metadata?: AerialImageMetadata;
}

export function HoleList({ courseId, holes, holeNotes, mapPoints, viewConfigs, holeAreas }: HoleListProps) {
  const router = useRouter();
  const [showAddForm, setShowAddForm] = useState(false);

  const mapPointsByHoleId = useMemo(() => {
    const map = new Map<string, HoleMapPoint[]>();
    for (const p of mapPoints ?? []) {
      const arr = map.get(p.hole_id) ?? [];
      arr.push(p);
      map.set(p.hole_id, arr);
    }
    return map;
  }, [mapPoints]);

  const areasByHoleId = useMemo(() => {
    const map = new Map<string, HoleArea[]>();
    for (const a of holeAreas ?? []) {
      const arr = map.get(a.hole_id) ?? [];
      arr.push(a);
      map.set(a.hole_id, arr);
    }
    return map;
  }, [holeAreas]);
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!lightbox) return;
    previousFocusRef.current = document.activeElement as HTMLElement;
    closeButtonRef.current?.focus();
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null); };
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      previousFocusRef.current?.focus();
    };
  }, [lightbox]);

  function getNoteForHole(holeId: string): HoleNote | undefined {
    return holeNotes.find((n) => n.hole_id === holeId);
  }

  async function handleAddHole(formData: FormData) {
    setLoading(true);
    setError(null);
    formData.set('course_id', courseId);
    const result = await upsertHole(formData);
    if (result.error) {
      setError(result.error);
    } else {
      setShowAddForm(false);
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <>
      <div className="space-y-4">
        {holes.length > 0 ? (
          <div className="space-y-2">
            {holes.map((hole) => {
              const note = getNoteForHole(hole.id);
              return (
                <div
                  key={hole.id}
                  className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 flex gap-3"
                >
                  {/* Left: all hole info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-4 mb-1">
                      <span className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary font-bold text-sm flex-shrink-0">
                        {hole.hole_number}
                      </span>
                      <span className="font-medium">Par {hole.par}</span>
                      {hole.distance != null && (
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          {hole.distance}yd
                        </span>
                      )}
                      {hole.hdcp && (
                        <span className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded px-1.5 py-0.5">
                          HDCP {hole.hdcp}
                        </span>
                      )}
                    </div>

                    {/* Tag row: dogleg, elevation, hazard, OB */}
                    {(hole.dogleg || hole.elevation || hole.hazard || hole.ob || hole.description) && (
                      <div className="ml-12 mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                        {hole.dogleg && hole.dogleg !== 'straight' && (
                          <span className="bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded px-1.5 py-0.5">
                            {hole.dogleg === 'left' ? '左DL' : '右DL'}
                          </span>
                        )}
                        {hole.elevation && hole.elevation !== 'flat' && (
                          <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 rounded px-1.5 py-0.5">
                            {hole.elevation === 'uphill' ? '打ち上げ' : '打ち下ろし'}
                          </span>
                        )}
                        {hole.hazard && (
                          <span className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 rounded px-1.5 py-0.5">
                            {hole.hazard}
                          </span>
                        )}
                        {hole.ob && (
                          <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 rounded px-1.5 py-0.5">
                            OB: {hole.ob}
                          </span>
                        )}
                        {hole.description && (
                          <span className="text-gray-500 dark:text-gray-400">
                            {hole.description}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Tee distances */}
                    {(hole.distance_back != null || hole.distance_front != null || hole.distance_ladies != null) && (
                      <div className="ml-12 mb-1 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        {hole.distance_back != null && <span>Back {hole.distance_back}y</span>}
                        {hole.distance_front != null && <span>Front {hole.distance_front}y</span>}
                        {hole.distance_ladies != null && <span>Ladies {hole.distance_ladies}y</span>}
                      </div>
                    )}

                    {editingNote === hole.id ? (
                      <HoleNoteEditor
                        holeId={hole.id}
                        note={note}
                        onClose={() => { setEditingNote(null); router.refresh(); }}
                      />
                    ) : (
                      <div className="ml-12">
                        {note?.note || note?.strategy ? (
                          <div className="text-sm space-y-1">
                            {note.strategy && (
                              <p><span className="font-medium text-primary">攻略:</span> {note.strategy}</p>
                            )}
                            {note.note && (
                              <p><span className="font-medium">メモ:</span> {note.note}</p>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingNote(hole.id)}
                              className="min-h-[48px] text-xs text-primary hover:underline px-0"
                            >
                              編集
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditingNote(hole.id)}
                            className="min-h-[48px] text-xs text-gray-400 hover:text-primary px-0"
                          >
                            + メモを追加
                          </Button>
                        )}
                      </div>
                    )}
                    {/* GPS distance info */}
                    {(() => {
                      const holePoints = mapPointsByHoleId.get(hole.id) ?? [];
                      if (holePoints.length === 0) return null;
                      return <HoleMapInfo mapPoints={holePoints} />;
                    })()}
                  </div>

                  {/* Right: aerial image (preferred) or layout image (fallback) */}
                  {(() => {
                    const aerialUrl = viewConfigs?.[hole.id]?.cached_image_url ?? null;
                    const displayUrl = aerialUrl ?? hole.image_url;
                    if (!displayUrl) return null;
                    const isAerial = !!aerialUrl;
                    const areas = isAerial ? (areasByHoleId.get(hole.id) ?? []) : [];
                    const metadata = isAerial
                      ? parseAerialImageMetadata(viewConfigs?.[hole.id]?.metadata_json)
                      : null;
                    const altText = `${hole.hole_number}番ホール ${isAerial ? '航空写真' : 'レイアウト'}`;
                    const lightboxPayload = { src: displayUrl, alt: altText, areas: areas.length > 0 ? areas : undefined, metadata: metadata ?? undefined };
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <div
                        role="button"
                        tabIndex={0}
                        className="w-36 flex-shrink-0 self-center h-[200px] rounded-md overflow-hidden bg-gray-100 dark:bg-gray-800 cursor-zoom-in relative"
                        onClick={() => setLightbox(lightboxPayload)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setLightbox(lightboxPayload); } }}
                        aria-label={altText}
                      >
                        <img
                          src={displayUrl}
                          alt={altText}
                          className="w-full h-full object-contain"
                        />
                        {isAerial && metadata && areas.length > 0 && (
                          <AerialAreaOverlay areas={areas} metadata={metadata} />
                        )}
                        {isAerial && (
                          <span className="absolute bottom-1 left-1 text-[10px] bg-black/50 text-white rounded px-1 py-0.5 leading-none">
                            航空
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            ホール情報が登録されていません。
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {showAddForm ? (
          <form action={handleAddHole} className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="ホール番号"
                name="hole_number"
                type="number"
                min={1}
                max={18}
                required
                defaultValue={holes.length + 1}
              />
              <Select
                label="Par"
                name="par"
                required
                defaultValue="4"
              >
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </Select>
              <Input
                label="距離(yd)"
                name="distance"
                type="number"
                min={0}
                max={700}
              />
            </div>
            <Input
              label="特徴"
              name="description"
              type="text"
              placeholder="例: ドッグレッグ左、打ち下ろし"
            />
            <div className="flex gap-2">
              <Button
                type="submit"
                size="sm"
                isLoading={loading}
              >
                {loading ? '保存中...' : '追加'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddForm(false)}
              >
                キャンセル
              </Button>
            </div>
          </form>
        ) : null}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            ref={closeButtonRef}
            className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-1.5 hover:bg-black/80"
            onClick={() => setLightbox(null)}
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div className="relative rounded-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox.src}
              alt={lightbox.alt}
              className="max-w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)] block"
            />
            {lightbox.areas && lightbox.metadata && lightbox.areas.length > 0 && (
              <AerialAreaOverlay areas={lightbox.areas} metadata={lightbox.metadata} />
            )}
          </div>
        </div>
      )}
    </>
  );
}
