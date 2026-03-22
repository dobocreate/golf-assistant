'use client';

import { useReducer, useState, useEffect, useTransition, useCallback, useRef } from 'react';
import { Trash2, ChevronLeft, ChevronRight } from 'lucide-react';
import { recordShot, getShots, deleteShot, updateShot } from '@/actions/shot';
import { LIE_OPTIONS, SLOPE_FB_OPTIONS, SLOPE_LR_OPTIONS, SHOT_TYPE_OPTIONS } from '@/lib/golf-constants';
import type { Shot, ShotResult, DirectionLR, DirectionFB, ShotSlopeFB, ShotSlopeLR, ShotLanding, ShotType, ShotFormState } from '@/features/score/types';

interface ClubOption {
  name: string;
}

interface ShotRecorderProps {
  roundId: string;
  holeNumber: number;
  clubs: ClubOption[];
  onFormChange?: (form: ShotFormState, shot: Shot | null, shotNumber: number) => void;
}

const RESULT_OPTIONS: { value: ShotResult; label: string; color: string; activeColor: string }[] = [
  { value: 'excellent', label: '\u25CE', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-yellow-600 text-white' },
  { value: 'good', label: '\u25CB', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-green-600 text-white' },
  { value: 'fair', label: '\u25B3', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-orange-600 text-white' },
  { value: 'poor', label: '\u2715', color: 'bg-gray-800 text-gray-200 hover:bg-gray-700', activeColor: 'bg-red-600 text-white' },
];

const MISS_TYPES = ['フック', 'スライス', 'ダフリ', 'トップ', 'シャンク'];

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
    shotType: null,
    remainingDistance: null,
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
    shotType: shot.shot_type,
    remainingDistance: shot.remaining_distance,
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
    form.landing !== shot.landing ||
    form.shotType !== shot.shot_type ||
    form.remainingDistance !== shot.remaining_distance
  );
}

// --- useReducer ---

type FormsAction =
  | { type: 'INIT'; shots: Shot[] }
  | { type: 'UPDATE_FIELD'; index: number; updater: (prev: ShotFormState) => ShotFormState }
  | { type: 'CLEAR_INDEX'; index: number }
  | { type: 'SHIFT_AFTER_DELETE'; deletedIndex: number }
  | { type: 'CLEAR_ALL' };

interface FormsState {
  forms: Map<number, ShotFormState>;
  shots: Shot[];
}

function formsReducer(state: FormsState, action: FormsAction): FormsState {
  switch (action.type) {
    case 'INIT':
      return { forms: new Map(), shots: action.shots };

    case 'UPDATE_FIELD': {
      const next = new Map(state.forms);
      const current = state.forms.get(action.index)
        ?? (action.index < state.shots.length ? shotToForm(state.shots[action.index]) : emptyShotForm());
      next.set(action.index, action.updater(current));
      return { ...state, forms: next };
    }

    case 'CLEAR_INDEX': {
      const next = new Map(state.forms);
      next.delete(action.index);
      return { ...state, forms: next };
    }

    case 'SHIFT_AFTER_DELETE': {
      const next = new Map<number, ShotFormState>();
      for (const [index, formState] of state.forms.entries()) {
        if (index < action.deletedIndex) {
          next.set(index, formState);
        } else if (index > action.deletedIndex) {
          next.set(index - 1, formState);
        }
      }
      return { ...state, forms: next };
    }

    case 'CLEAR_ALL':
      return { forms: new Map(), shots: state.shots };
  }
}

export function ShotRecorder({ roundId, holeNumber, clubs, onFormChange }: ShotRecorderProps) {
  const [state, dispatch] = useReducer(formsReducer, { forms: new Map(), shots: [] });
  const [currentShotIndex, setCurrentShotIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Touch swipe refs
  const touchStartX = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const { shots } = state;

  // Total slots = existing shots + 1 new shot slot
  const totalSlots = shots.length + 1;
  const isNewShotSlot = currentShotIndex === shots.length;
  const currentShot = isNewShotSlot ? null : shots[currentShotIndex];

  // Compute current form from reducer state
  const currentForm = state.forms.get(currentShotIndex)
    ?? (currentShotIndex < shots.length ? shotToForm(shots[currentShotIndex]) : emptyShotForm());

  // Fetch shots on hole change
  useEffect(() => {
    let cancelled = false;
    setError(null);
    getShots(roundId, holeNumber).then(data => {
      if (!cancelled) {
        dispatch({ type: 'INIT', shots: data });
        setCurrentShotIndex(0);
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
        shotType: currentForm.shotType,
        remainingDistance: currentForm.remainingDistance,
      });
      if (result.error) {
        setError(result.error);
      } else if (result.shot) {
        setError(null);
        dispatch({ type: 'INIT', shots: [...shots, result.shot] });
        setCurrentShotIndex(prev => prev + 1);
      }
    });
  }, [roundId, holeNumber, nextShotNumber, currentForm, showMissType, currentShotIndex, shots]);

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
        shotType: currentForm.shotType,
        remainingDistance: currentForm.remainingDistance,
      });
      if (result.error) {
        setError(result.error);
      } else if (result.shot) {
        setError(null);
        const newShots = shots.map(s => s.id === currentShot.id ? result.shot! : s);
        dispatch({ type: 'INIT', shots: newShots });
      }
    });
  }, [currentShot, roundId, currentForm, showMissType, currentShotIndex, shots]);

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
        const newShots = shots.filter(s => s.id !== currentShot.id);
        dispatch({ type: 'INIT', shots: newShots });
        dispatch({ type: 'SHIFT_AFTER_DELETE', deletedIndex });
        setCurrentShotIndex(prev => Math.max(0, prev - 1));
      }
    });
  }, [currentShot, roundId, currentShotIndex, shots]);

  const currentShotNumber = isNewShotSlot ? nextShotNumber : (currentShot?.shot_number ?? 1);
  const isChanged = currentShot ? hasFormChanged(currentForm, currentShot) : false;

  // Notify parent of form state changes
  useEffect(() => {
    onFormChange?.(currentForm, currentShot, currentShotNumber);
  }, [currentForm, currentShot, currentShotNumber, onFormChange]);

  return (
    <div className="space-y-3">
      <label className="block text-sm font-bold text-gray-300">ショット記録</label>

      {/* Carousel container */}
      <div
        ref={containerRef}
        className="overflow-hidden"
      >
        <div className="bg-gray-900 rounded-lg p-3 space-y-3">
          {/* Header: shot number + delete (swipeable) */}
          <div
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            className="flex items-center justify-between"
          >
            <p className="text-sm text-gray-200">
              {isNewShotSlot
                ? `新規ショット（第${nextShotNumber}打）`
                : `ショット ${currentShotIndex + 1} / ${shots.length}打`}
            </p>
            {currentShot && currentShotNumber > 1 && (
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
              <label className="block text-xs text-gray-400">クラブ</label>
              <select
                value={currentForm.club ?? ''}
                onChange={e => dispatch({ type: 'UPDATE_FIELD', index: currentShotIndex, updater: f => ({ ...f, club: e.target.value || null }) })}
                className="w-full min-h-[48px] rounded-lg bg-gray-800 text-gray-200 px-3 py-2 text-sm border-0 focus:ring-2 focus:ring-green-600"
              >
                <option value="">選択なし</option>
                {clubs.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Shot type */}
          <div className="space-y-1">
            <label className="block text-xs text-gray-400">ショット</label>
            <div className="grid grid-cols-4 gap-1">
              {SHOT_TYPE_OPTIONS.map(st => (
                <button
                  key={st.value}
                  onClick={() => dispatch({
                    type: 'UPDATE_FIELD',
                    index: currentShotIndex,
                    updater: f => ({ ...f, shotType: f.shotType === st.value ? null : st.value }),
                  })}
                  className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                    currentForm.shotType === st.value
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Remaining distance */}
          <div className="space-y-1">
            <label className="block text-xs text-gray-400">残り距離 (yd)</label>
            <input
              type="number"
              min={0}
              max={700}
              placeholder="残り距離"
              value={currentForm.remainingDistance ?? ''}
              onChange={e => {
                const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                dispatch({
                  type: 'UPDATE_FIELD',
                  index: currentShotIndex,
                  updater: f => ({ ...f, remainingDistance: val }),
                });
              }}
              className="w-full min-h-[48px] rounded-lg bg-gray-800 text-gray-200 px-3 text-sm border-0 focus:ring-2 focus:ring-green-600"
            />
          </div>

          {/* Lie */}
          <div className="space-y-1">
            <label className="block text-xs text-gray-400">ライ</label>
            <div className="grid grid-cols-5 gap-1">
              {LIE_OPTIONS.map(l => (
                <button
                  key={l.value}
                  onClick={() => dispatch({
                    type: 'UPDATE_FIELD',
                    index: currentShotIndex,
                    updater: f => ({ ...f, lie: f.lie === l.value ? null : l.value }),
                  })}
                  className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                    currentForm.lie === l.value
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  {l.shortLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Slope (optional) */}
          <div className="space-y-1">
            <label className="block text-xs text-gray-400">傾斜（任意）</label>
            <div className="flex gap-4">
              <div className="flex-1 space-y-1">
                <p className="text-xs text-gray-400">前後</p>
                <div className="grid grid-cols-2 gap-1">
                  {SLOPE_FB_OPTIONS.map(s => (
                    <button
                      key={s.value}
                      onClick={() => dispatch({
                        type: 'UPDATE_FIELD',
                        index: currentShotIndex,
                        updater: f => ({
                          ...f,
                          slopeFb: f.slopeFb === s.value ? null : s.value,
                        }),
                      })}
                      className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                        currentForm.slopeFb === s.value
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                      }`}
                    >
                      {s.shortLabel}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-xs text-gray-400">左右</p>
                <div className="grid grid-cols-2 gap-1">
                  {SLOPE_LR_OPTIONS.map(s => (
                    <button
                      key={s.value}
                      onClick={() => dispatch({
                        type: 'UPDATE_FIELD',
                        index: currentShotIndex,
                        updater: f => ({
                          ...f,
                          slopeLr: f.slopeLr === s.value ? null : s.value,
                        }),
                      })}
                      className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                        currentForm.slopeLr === s.value
                          ? 'bg-green-600 text-white'
                          : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                      }`}
                    >
                      {s.shortLabel}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Result */}
          <div className="space-y-1">
            <label className="block text-xs text-gray-400">結果</label>
            <div className="grid grid-cols-4 gap-2">
              {RESULT_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => {
                    dispatch({
                      type: 'UPDATE_FIELD',
                      index: currentShotIndex,
                      updater: f => {
                        const newResult = opt.value;
                        const newMissType = (newResult !== 'fair' && newResult !== 'poor') ? null : f.missType;
                        return { ...f, result: newResult, missType: newMissType };
                      },
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
              <label className="block text-xs text-gray-400">ミスタイプ</label>
              <div className="grid grid-cols-3 gap-2">
                {MISS_TYPES.map(mt => (
                  <button
                    key={mt}
                    onClick={() => dispatch({
                      type: 'UPDATE_FIELD',
                      index: currentShotIndex,
                      updater: f => ({ ...f, missType: f.missType === mt ? null : mt }),
                    })}
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
              {/* 方向 3x3 */}
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">方向</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {DIRECTION_GRID.map(({ lr, fb, label }) => {
                    const isSelected = currentForm.directionLr === lr && currentForm.directionFb === fb;
                    return (
                      <button
                        key={`${lr}-${fb}`}
                        onClick={() => dispatch({
                          type: 'UPDATE_FIELD',
                          index: currentShotIndex,
                          updater: f => {
                            if (f.directionLr === lr && f.directionFb === fb) {
                              return { ...f, directionLr: null, directionFb: null };
                            }
                            return { ...f, directionLr: lr, directionFb: fb };
                          },
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
                        onClick={() => dispatch({
                          type: 'UPDATE_FIELD',
                          index: currentShotIndex,
                          updater: prev => ({
                            ...prev, landing: prev.landing === value ? null : value
                          }),
                        })}
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

          {/* Record/Update button */}
          <div>
            {isNewShotSlot ? (
              <button
                onClick={handleRecordShot}
                disabled={currentForm.result === null || isPending}
                className="w-full min-h-[48px] flex items-center justify-center rounded-lg bg-green-600 px-3 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? '記録中...' : '記録'}
              </button>
            ) : (
              <button
                onClick={handleUpdateShot}
                disabled={!isChanged || isPending}
                className="w-full min-h-[48px] flex items-center justify-center rounded-lg bg-green-600 px-3 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? '更新中...' : '更新'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation: left/right buttons + dot indicators (swipeable) */}
      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="flex items-center justify-center gap-4"
      >
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
