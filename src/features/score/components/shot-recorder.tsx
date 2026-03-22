'use client';

import { useState, useEffect, useTransition, useCallback, useRef } from 'react';
import { Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { recordShot, getShots, deleteShot, updateShot } from '@/actions/shot';
import type { Shot, ShotResult, DirectionLR, DirectionFB, ShotLie, ShotSlopeFB, ShotSlopeLR, ShotLanding } from '@/features/score/types';

interface ClubOption {
  name: string;
}

interface ShotRecorderProps {
  roundId: string;
  holeNumber: number;
  clubs: ClubOption[];
  onRequestAdvice?: (situation: { lie: string; slopeFB: string | null; slopeLR: string | null; shotNumber: number }) => void;
}

const RESULT_OPTIONS: { value: ShotResult; label: string; color: string; activeColor: string }[] = [
  { value: 'excellent', label: '\u25CE', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-yellow-600 text-white' },
  { value: 'good', label: '\u25CB', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-green-600 text-white' },
  { value: 'fair', label: '\u25B3', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-orange-600 text-white' },
  { value: 'poor', label: '\u2715', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-red-600 text-white' },
];

const MISS_TYPES = ['フック', 'スライス', 'ダフリ', 'トップ', 'シャンク'];

const LIES: { value: ShotLie; label: string }[] = [
  { value: 'tee', label: 'ティー' },
  { value: 'fairway', label: 'FW' },
  { value: 'rough', label: 'ラフ' },
  { value: 'bunker', label: 'バンカー' },
  { value: 'woods', label: '林' },
];

const LANDINGS: { value: ShotLanding; label: string }[] = [
  { value: 'ob', label: 'OB' },
  { value: 'water', label: '池' },
  { value: 'bunker', label: 'バンカー' },
];

function landingColor(value: ShotLanding): string {
  switch (value) {
    case 'ob': return 'bg-red-600 text-white';
    case 'water': return 'bg-blue-600 text-white';
    case 'bunker': return 'bg-yellow-600 text-white';
  }
}

const DIRECTION_GRID: { lr: DirectionLR; fb: DirectionFB; label: string }[] = [
  { lr: 'left', fb: 'long', label: '↖' },
  { lr: 'center', fb: 'long', label: '↑' },
  { lr: 'right', fb: 'long', label: '↗' },
  { lr: 'left', fb: 'center', label: '←' },
  { lr: 'center', fb: 'center', label: '○' },
  { lr: 'right', fb: 'center', label: '→' },
  { lr: 'left', fb: 'short', label: '↙' },
  { lr: 'center', fb: 'short', label: '↓' },
  { lr: 'right', fb: 'short', label: '↘' },
];

interface ShotFormState {
  club: string | null;
  result: ShotResult | null;
  missType: string | null;
  directionLr: DirectionLR | null;
  directionFb: DirectionFB | null;
  lie: ShotLie | null;
  slopeFb: ShotSlopeFB | null;
  slopeLr: ShotSlopeLR | null;
  landing: ShotLanding | null;
}

function emptyShotForm(): ShotFormState {
  return {
    club: null,
    result: null,
    missType: null,
    directionLr: null,
    directionFb: null,
    lie: null,
    slopeFb: null,
    slopeLr: null,
    landing: null,
  };
}

function shotToForm(shot: Shot): ShotFormState {
  return {
    club: shot.club,
    result: shot.result,
    missType: shot.miss_type,
    directionLr: shot.direction_lr,
    directionFb: shot.direction_fb,
    lie: shot.lie,
    slopeFb: shot.slope_fb,
    slopeLr: shot.slope_lr,
    landing: shot.landing,
  };
}

function hasFormChanged(form: ShotFormState, shot: Shot): boolean {
  return (
    form.club !== shot.club ||
    form.result !== shot.result ||
    form.missType !== shot.miss_type ||
    form.directionLr !== shot.direction_lr ||
    form.directionFb !== shot.direction_fb ||
    form.lie !== shot.lie ||
    form.slopeFb !== shot.slope_fb ||
    form.slopeLr !== shot.slope_lr ||
    form.landing !== shot.landing
  );
}

export function ShotRecorder({ roundId, holeNumber, clubs, onRequestAdvice }: ShotRecorderProps) {
  const [shots, setShots] = useState<Shot[]>([]);
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [forms, setForms] = useState<Map<number, ShotFormState>>(new Map());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Touch swipe refs
  const touchStartX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Total slots = existing shots + 1 new shot slot
  const totalSlots = shots.length + 1;
  const isNewShotSlot = currentShotIndex === shots.length;
  const currentShot = isNewShotSlot ? null : shots[currentShotIndex];

  // Get or initialize form state for current index
  const getForm = useCallback((index: number, shotsList: Shot[]): ShotFormState => {
    const existing = forms.get(index);
    if (existing) return existing;
    if (index < shotsList.length) {
      return shotToForm(shotsList[index]);
    }
    return emptyShotForm();
  }, [forms]);

  const currentForm = getForm(currentShotIndex, shots);

  const shotsRef = useRef(shots);
  useEffect(() => { shotsRef.current = shots; }, [shots]);

  const updateForm = useCallback((index: number, updater: (prev: ShotFormState) => ShotFormState) => {
    setForms(prev => {
      const next = new Map(prev);
      const s = shotsRef.current;
      const current = prev.get(index) ?? (index < s.length ? shotToForm(s[index]) : emptyShotForm());
      next.set(index, updater(current));
      return next;
    });
  }, []);

  // Fetch shots on hole change
  useEffect(() => {
    let cancelled = false;
    setError(null);
    getShots(roundId, holeNumber).then(data => {
      if (!cancelled) {
        setShots(data);
        setCurrentShotIndex(0);
        setForms(new Map());
      }
    }).catch(() => {
      if (!cancelled) setError('ショット記録の取得に失敗しました。');
    });
    return () => { cancelled = true; };
  }, [roundId, holeNumber]);

  const nextShotNumber = shots.length > 0
    ? Math.max(...shots.map(s => s.shot_number)) + 1
    : 1;

  const showMissType = currentForm.result === 'fair' || currentForm.result === 'poor';

  // Navigate carousel
  const goToSlot = useCallback((index: number) => {
    if (index >= 0 && index < totalSlots) {
      setCurrentShotIndex(index);
    }
  }, [totalSlots]);

  // Touch swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        // Swipe left -> next
        goToSlot(Math.min(currentShotIndex + 1, totalSlots - 1));
      } else {
        // Swipe right -> prev
        goToSlot(Math.max(currentShotIndex - 1, 0));
      }
    }
  }, [currentShotIndex, totalSlots, goToSlot]);

  // Record new shot
  const handleRecordShot = useCallback(() => {
    if (currentForm.result === null) return;

    startTransition(async () => {
      const result = await recordShot({
        roundId,
        holeNumber,
        shotNumber: nextShotNumber,
        club: currentForm.club,
        result: currentForm.result,
        missType: showMissType ? currentForm.missType : null,
        directionLr: currentForm.directionLr,
        directionFb: currentForm.directionFb,
        lie: currentForm.lie,
        slopeFb: currentForm.slopeFb,
        slopeLr: currentForm.slopeLr,
        landing: currentForm.landing,
      });
      if (result.error) {
        setError(result.error);
      } else if (result.shot) {
        setError(null);
        setShots(prev => [...prev, result.shot!]);
        setForms(prev => {
          const next = new Map(prev);
          next.delete(currentShotIndex);
          return next;
        });
        setCurrentShotIndex(prev => prev + 1);
      }
    });
  }, [roundId, holeNumber, nextShotNumber, currentForm, showMissType, currentShotIndex]);

  // Update existing shot
  const handleUpdateShot = useCallback(() => {
    if (!currentShot) return;

    startTransition(async () => {
      const result = await updateShot({
        shotId: currentShot.id,
        roundId,
        club: currentForm.club,
        result: currentForm.result,
        missType: showMissType ? currentForm.missType : null,
        directionLr: currentForm.directionLr,
        directionFb: currentForm.directionFb,
        lie: currentForm.lie,
        slopeFb: currentForm.slopeFb,
        slopeLr: currentForm.slopeLr,
        landing: currentForm.landing,
      });
      if (result.error) {
        setError(result.error);
      } else if (result.shot) {
        setError(null);
        setShots(prev => prev.map(s => s.id === currentShot.id ? result.shot! : s));
        setForms(prev => {
          const next = new Map(prev);
          next.delete(currentShotIndex);
          return next;
        });
      }
    });
  }, [currentShot, roundId, currentForm, showMissType, currentShotIndex]);

  // Delete shot
  const handleDelete = useCallback(() => {
    if (!currentShot) return;
    const deletedIndex = currentShotIndex;
    startTransition(async () => {
      const result = await deleteShot(currentShot.id, roundId);
      if (result.error) {
        setError(result.error);
      } else {
        setError(null);
        setShots(prev => prev.filter(s => s.id !== currentShot.id));
        // 削除インデックスより後のフォームキーを1つずらし、他の編集内容を保持
        setForms(prev => {
          const next = new Map<number, ShotFormState>();
          for (const [index, formState] of prev.entries()) {
            if (index < deletedIndex) {
              next.set(index, formState);
            } else if (index > deletedIndex) {
              next.set(index - 1, formState);
            }
          }
          return next;
        });
        setCurrentShotIndex(prev => Math.max(0, prev - 1));
      }
    });
  }, [currentShot, roundId, currentShotIndex]);

  const currentShotNumber = isNewShotSlot ? nextShotNumber : (currentShot?.shot_number ?? 1);
  const isChanged = currentShot ? hasFormChanged(currentForm, currentShot) : false;

  return (
    <div className="space-y-3">
      <label className="block text-sm font-bold text-gray-300">ショット記録</label>

      {/* Carousel container */}
      <div
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="overflow-hidden"
      >
        <div className="bg-gray-900 rounded-lg p-3 space-y-3">
          {/* Header: shot number + delete */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {isNewShotSlot
                ? `新規ショット（第${nextShotNumber}打）`
                : `ショット ${currentShotIndex + 1} / ${shots.length}打`}
            </p>
            {currentShot && (
              <button
                onClick={handleDelete}
                disabled={isPending}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center text-gray-500 hover:text-red-400 transition-colors"
                aria-label={`ショット${currentShotNumber}を削除`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Club selection */}
          {clubs.length > 0 && (
            <div className="space-y-1">
              <label className="block text-xs text-gray-500">クラブ</label>
              <select
                value={currentForm.club ?? ''}
                onChange={e => updateForm(currentShotIndex, f => ({ ...f, club: e.target.value || null }))}
                className="w-full min-h-[48px] rounded-lg bg-gray-800 text-gray-200 px-3 py-2 text-sm border-0 focus:ring-2 focus:ring-green-600"
              >
                <option value="">選択なし</option>
                {clubs.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Lie */}
          <div className="space-y-1">
            <label className="block text-xs text-gray-500">ライ</label>
            <div className="grid grid-cols-5 gap-1">
              {LIES.map(l => (
                <button
                  key={l.value}
                  onClick={() => updateForm(currentShotIndex, f => ({
                    ...f,
                    lie: f.lie === l.value ? null : l.value,
                  }))}
                  className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                    currentForm.lie === l.value
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Slope (optional) */}
          <div className="space-y-1">
            <label className="block text-xs text-gray-500">傾斜（任意）</label>
            <div className="flex gap-4">
              <div className="flex-1 space-y-1">
                <p className="text-xs text-gray-600">前後</p>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => updateForm(currentShotIndex, f => ({
                      ...f,
                      slopeFb: f.slopeFb === 'toe_up' ? null : 'toe_up' as ShotSlopeFB,
                    }))}
                    className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                      currentForm.slopeFb === 'toe_up'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    つま先↑
                  </button>
                  <button
                    onClick={() => updateForm(currentShotIndex, f => ({
                      ...f,
                      slopeFb: f.slopeFb === 'toe_down' ? null : 'toe_down' as ShotSlopeFB,
                    }))}
                    className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                      currentForm.slopeFb === 'toe_down'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    つま先↓
                  </button>
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs text-gray-600">左右</p>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    onClick={() => updateForm(currentShotIndex, f => ({
                      ...f,
                      slopeLr: f.slopeLr === 'left_up' ? null : 'left_up' as ShotSlopeLR,
                    }))}
                    className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                      currentForm.slopeLr === 'left_up'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    左足↑
                  </button>
                  <button
                    onClick={() => updateForm(currentShotIndex, f => ({
                      ...f,
                      slopeLr: f.slopeLr === 'left_down' ? null : 'left_down' as ShotSlopeLR,
                    }))}
                    className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                      currentForm.slopeLr === 'left_down'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    左足↓
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Result */}
          <div className="space-y-1">
            <label className="block text-xs text-gray-500">結果</label>
            <div className="grid grid-cols-4 gap-2">
              {RESULT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    updateForm(currentShotIndex, f => {
                      const newResult = opt.value;
                      const newMissType = (newResult !== 'fair' && newResult !== 'poor') ? null : f.missType;
                      return { ...f, result: newResult, missType: newMissType };
                    });
                  }}
                  className={`min-h-[48px] rounded-lg text-lg font-bold transition-colors ${
                    currentForm.result === opt.value ? opt.activeColor : opt.color
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Miss type (only when fair/poor) */}
          {showMissType && (
            <div className="space-y-1">
              <label className="block text-xs text-gray-500">ミスタイプ</label>
              <div className="grid grid-cols-3 gap-2">
                {MISS_TYPES.map(mt => (
                  <button
                    key={mt}
                    onClick={() => updateForm(currentShotIndex, f => ({
                      ...f,
                      missType: f.missType === mt ? null : mt,
                    }))}
                    className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                      currentForm.missType === mt
                        ? 'bg-orange-600 text-white'
                        : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                    }`}
                  >
                    {mt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Direction 3x3 grid + Landing buttons */}
          <div className="space-y-2">
            <div className="flex gap-3">
              {/* 方向 3×3 */}
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">方向</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {DIRECTION_GRID.map(({ lr, fb, label }) => {
                    const isSelected = currentForm.directionLr === lr && currentForm.directionFb === fb;
                    return (
                      <button
                        key={`${lr}-${fb}`}
                        onClick={() => updateForm(currentShotIndex, f => {
                          if (f.directionLr === lr && f.directionFb === fb) {
                            return { ...f, directionLr: null, directionFb: null };
                          }
                          return { ...f, directionLr: lr, directionFb: fb };
                        })}
                        className={`min-h-[48px] rounded-lg text-lg font-bold transition-colors ${
                          isSelected
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 区切り線 */}
              <div className="w-px bg-gray-700 self-stretch mt-5" />

              {/* 着地状況 */}
              <div className="w-20">
                <label className="block text-xs text-gray-500 mb-1">着地</label>
                <div className="grid grid-cols-1 gap-1.5">
                  {LANDINGS.map(({ value, label }) => {
                    const isSelected = currentForm.landing === value;
                    return (
                      <button
                        key={value}
                        onClick={() => updateForm(currentShotIndex, prev => ({
                          ...prev, landing: prev.landing === value ? null : value
                        }))}
                        className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                          isSelected ? landingColor(value) : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Advice + Record/Update buttons (横並び) */}
          <div className="grid grid-cols-2 gap-2">
            {onRequestAdvice && (
              <button
                onClick={() => {
                  console.log('[advice-btn] currentForm:', JSON.stringify({ lie: currentForm.lie, slopeFb: currentForm.slopeFb, slopeLr: currentForm.slopeLr }));
                  onRequestAdvice({
                    lie: currentForm.lie ?? 'fairway',
                    slopeFB: currentForm.slopeFb,
                    slopeLR: currentForm.slopeLr,
                    shotNumber: currentShotNumber,
                  });
                }}
                className="min-h-[48px] flex items-center justify-center rounded-lg bg-blue-600 px-3 py-3 text-sm font-bold text-white hover:bg-blue-500 transition-colors"
              >
                アドバイス
              </button>
            )}
            {isNewShotSlot ? (
              <button
                onClick={handleRecordShot}
                disabled={currentForm.result === null || isPending}
                className={`min-h-[48px] flex items-center justify-center rounded-lg bg-green-600 px-3 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${!onRequestAdvice ? 'col-span-2' : ''}`}
              >
                {isPending ? '記録中...' : '記録'}
              </button>
            ) : (
              <button
                onClick={handleUpdateShot}
                disabled={!isChanged || isPending}
                className={`min-h-[48px] flex items-center justify-center rounded-lg bg-green-600 px-3 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${!onRequestAdvice ? 'col-span-2' : ''}`}
              >
                {isPending ? '更新中...' : '更新'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation: left/right buttons + dot indicators */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => goToSlot(currentShotIndex - 1)}
          disabled={currentShotIndex <= 0}
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-gray-800 text-white disabled:opacity-30 transition-colors"
          aria-label="前のショット"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-1">
          {Array.from({ length: totalSlots }, (_, i) => (
            <button
              key={i}
              onClick={() => goToSlot(i)}
              className={`w-2.5 h-2.5 rounded-full transition-colors ${
                i === currentShotIndex ? 'bg-green-500' : 'bg-gray-600'
              }`}
              aria-label={`ショット${i + 1}に移動`}
            />
          ))}
        </div>

        <button
          onClick={() => goToSlot(currentShotIndex + 1)}
          disabled={currentShotIndex >= totalSlots - 1}
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-gray-800 text-white disabled:opacity-30 transition-colors"
          aria-label="次のショット"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* エラー表示 */}
      {error && (
        <p className="text-center text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
