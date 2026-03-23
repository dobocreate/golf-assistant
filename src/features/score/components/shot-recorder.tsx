'use client';

import { useReducer, useState, useEffect, useTransition, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { recordShot, getShots, updateShot } from '@/actions/shot';
import { LIE_OPTIONS, SLOPE_FB_OPTIONS, SLOPE_LR_OPTIONS, SHOT_TYPE_OPTIONS, SHOT_NOTE_MAX_LENGTH } from '@/lib/golf-constants';
import { LIE_DB_TO_LABEL, SHOT_TYPE_DB_TO_LABEL } from '@/lib/golf-constants';
import { AdvicePanel } from '@/features/score/components/advice-panel';
import type { Shot, ShotResult, DirectionLR, DirectionFB, ShotSlopeFB, ShotSlopeLR, ShotLanding, ShotType, ShotFormState } from '@/features/score/types';

interface ClubOption {
  name: string;
}

interface ShotRecorderProps {
  roundId: string;
  holeNumber: number;
  clubs: ClubOption[];
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
    note: null,
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
    note: shot.note,
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
    form.remainingDistance !== shot.remaining_distance ||
    form.note !== shot.note
  );
}

// --- useReducer ---

type FormsAction =
  | { type: 'INIT'; shots: Shot[] }
  | { type: 'UPDATE_FIELD'; index: number; updater: (prev: ShotFormState) => ShotFormState }
  | { type: 'CLEAR_INDEX'; index: number }
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

    case 'CLEAR_ALL':
      return { forms: new Map(), shots: state.shots };
  }
}

// --- Slot type for accordion list ---

interface ShotSlot {
  index: number;
  shotNumber: number;
  isNew: boolean;
  shot: Shot | null;
  club: string | null;
  shotTypeLabel: string | null;
  distance: number | null;
  lieLabel: string | null;
  hasAdvice: boolean;
  isSkipped: boolean;
}

export function ShotRecorder({ roundId, holeNumber, clubs }: ShotRecorderProps) {
  const [state, dispatch] = useReducer(formsReducer, { forms: new Map(), shots: [] });
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const { shots } = state;

  // Fetch shots on hole change
  useEffect(() => {
    let cancelled = false;
    setError(null);
    getShots(roundId, holeNumber).then(data => {
      if (!cancelled) {
        dispatch({ type: 'INIT', shots: data });
        // Default expand: new shot slot (index = data.length)
        setExpandedIndex(data.length);
      }
    }).catch(() => {
      if (!cancelled) setError('ショット記録の取得に失敗しました。');
    });
    return () => { cancelled = true; };
  }, [roundId, holeNumber]);

  const nextShotNumber = shots.length > 0
    ? Math.max(...shots.map(s => s.shot_number)) + 1
    : 1;

  // Build allSlots: existing shots + new shot slot
  const allSlots: ShotSlot[] = [
    ...shots.map((shot, i) => ({
      index: i,
      shotNumber: shot.shot_number,
      isNew: false,
      shot,
      club: shot.club,
      shotTypeLabel: shot.shot_type ? (SHOT_TYPE_DB_TO_LABEL[shot.shot_type] ?? null) : null,
      distance: shot.remaining_distance,
      lieLabel: shot.lie ? (LIE_DB_TO_LABEL[shot.lie] ?? null) : null,
      hasAdvice: !!shot.advice_text,
      isSkipped: shot.result === null && shot.club === null,
    })),
    {
      index: shots.length,
      shotNumber: nextShotNumber,
      isNew: true,
      shot: null,
      club: null,
      shotTypeLabel: null,
      distance: null,
      lieLabel: null,
      hasAdvice: false,
      isSkipped: false,
    },
  ];

  // Display in reverse order (newest first)
  const displaySlots = [...allSlots].reverse();

  // Get form for a given slot index
  const getForm = useCallback((index: number): ShotFormState => {
    return state.forms.get(index)
      ?? (index < shots.length ? shotToForm(shots[index]) : emptyShotForm());
  }, [state.forms, shots]);

  // Add shot handler: expand new slot
  const handleAddShot = useCallback(() => {
    setExpandedIndex(shots.length);
  }, [shots.length]);

  // Record new shot
  const handleRecordShot = useCallback((slotIndex: number, shotNumber: number) => {
    const form = getForm(slotIndex);
    if (form.result === null) return;
    const showMiss = form.result === 'fair' || form.result === 'poor';

    startTransition(async () => {
      const result = await recordShot({
        roundId,
        holeNumber,
        shotNumber,
        club: form.club,
        result: form.result,
        missType: showMiss ? form.missType : null,
        directionLr: form.directionLr,
        directionFb: form.directionFb,
        lie: form.lie,
        slopeFb: form.slopeFb,
        slopeLr: form.slopeLr,
        landing: form.landing,
        shotType: form.shotType,
        remainingDistance: form.remainingDistance,
        note: form.note,
      });
      if (result.error) {
        setError(result.error);
      } else if (result.shot) {
        setError(null);
        dispatch({ type: 'INIT', shots: [...shots, result.shot] });
        // Expand the new empty slot
        setExpandedIndex(shots.length + 1);
      }
    });
  }, [roundId, holeNumber, shots, getForm]);

  // Skip shot (record with all fields null)
  const handleSkipShot = useCallback((shotNumber: number) => {
    startTransition(async () => {
      const result = await recordShot({
        roundId,
        holeNumber,
        shotNumber,
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
        note: null,
      });
      if (result.error) {
        setError(result.error);
      } else if (result.shot) {
        setError(null);
        dispatch({ type: 'INIT', shots: [...shots, result.shot] });
        setExpandedIndex(shots.length + 1);
      }
    });
  }, [roundId, holeNumber, shots]);

  // Update existing shot
  const handleUpdateShot = useCallback((slotIndex: number, shot: Shot) => {
    const form = getForm(slotIndex);
    const showMiss = form.result === 'fair' || form.result === 'poor';

    startTransition(async () => {
      const result = await updateShot({
        shotId: shot.id,
        roundId,
        club: form.club,
        result: form.result,
        missType: showMiss ? form.missType : null,
        directionLr: form.directionLr,
        directionFb: form.directionFb,
        lie: form.lie,
        slopeFb: form.slopeFb,
        slopeLr: form.slopeLr,
        landing: form.landing,
        shotType: form.shotType,
        remainingDistance: form.remainingDistance,
        note: form.note,
      });
      if (result.error) {
        setError(result.error);
      } else if (result.shot) {
        setError(null);
        const newShots = shots.map(s => s.id === shot.id ? result.shot! : s);
        dispatch({ type: 'INIT', shots: newShots });
      }
    });
  }, [roundId, shots, getForm]);

  return (
    <div className="space-y-3">
      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <label className="block text-sm font-bold text-gray-200">ショット記録</label>
        <button
          onClick={handleAddShot}
          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg bg-gray-800 text-green-400 hover:bg-gray-700 transition-colors"
          aria-label="ショットを追加"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {/* Shot list (newest first) */}
      {displaySlots.map((slot) => {
        const isExpanded = expandedIndex === slot.index;
        const form = getForm(slot.index);
        const showMissType = form.result === 'fair' || form.result === 'poor';
        const isChanged = slot.shot ? hasFormChanged(form, slot.shot) : false;

        return (
          <div key={slot.index} className="rounded-lg border border-gray-700 overflow-hidden">
            {/* Summary header (tap to expand/collapse) */}
            <button
              onClick={() => setExpandedIndex(isExpanded ? null : slot.index)}
              className="w-full flex items-center justify-between p-3 bg-gray-800 text-left"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="font-bold text-gray-200">
                  {slot.isNew ? `新規（第${slot.shotNumber}打）` : `第${slot.shotNumber}打`}
                </span>
                {slot.club && <span className="text-gray-400">{slot.club}</span>}
                {slot.shotTypeLabel && <span className="text-gray-400">{slot.shotTypeLabel}</span>}
                {slot.distance != null && <span className="text-gray-400">{slot.distance}y</span>}
                {slot.lieLabel && <span className="text-gray-400">{slot.lieLabel}</span>}
                {slot.isSkipped && <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">スキップ</span>}
                {slot.hasAdvice && <span className="text-blue-400 text-xs">AI</span>}
              </div>
              <span className="text-gray-500">{isExpanded ? '\u25B2' : '\u25BC'}</span>
            </button>

            {/* Expanded form */}
            {isExpanded && (
              <div className="p-3 space-y-3 bg-gray-900">
                {/* Skipped shot hint */}
                {slot.isSkipped && (
                  <p className="text-xs text-gray-500 bg-gray-800 rounded px-3 py-2">
                    このショットはスキップされました。入力して更新すると記録できます。
                  </p>
                )}
                {/* Club selection */}
                {clubs.length > 0 && (
                  <div className="space-y-1">
                    <label className="block text-xs text-gray-400">クラブ</label>
                    <select
                      value={form.club ?? ''}
                      onChange={e => dispatch({ type: 'UPDATE_FIELD', index: slot.index, updater: f => ({ ...f, club: e.target.value || null }) })}
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
                  <div className="grid grid-cols-3 gap-1">
                    {SHOT_TYPE_OPTIONS.map(st => (
                      <button
                        key={st.value}
                        onClick={() => dispatch({
                          type: 'UPDATE_FIELD',
                          index: slot.index,
                          updater: f => ({ ...f, shotType: f.shotType === st.value ? null : st.value }),
                        })}
                        className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                          form.shotType === st.value
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
                    value={form.remainingDistance ?? ''}
                    onChange={e => {
                      const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
                      dispatch({
                        type: 'UPDATE_FIELD',
                        index: slot.index,
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
                          index: slot.index,
                          updater: f => ({ ...f, lie: f.lie === l.value ? null : l.value }),
                        })}
                        className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                          form.lie === l.value
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                        }`}
                      >
                        {l.shortLabel}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slope */}
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
                              index: slot.index,
                              updater: f => ({
                                ...f,
                                slopeFb: f.slopeFb === s.value ? null : s.value,
                              }),
                            })}
                            className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                              form.slopeFb === s.value
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
                              index: slot.index,
                              updater: f => ({
                                ...f,
                                slopeLr: f.slopeLr === s.value ? null : s.value,
                              }),
                            })}
                            className={`min-h-[48px] rounded-lg text-xs font-bold transition-colors ${
                              form.slopeLr === s.value
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
                            index: slot.index,
                            updater: f => {
                              const newResult = opt.value;
                              const newMissType = (newResult !== 'fair' && newResult !== 'poor') ? null : f.missType;
                              return { ...f, result: newResult, missType: newMissType };
                            },
                          });
                        }}
                        className={`min-h-[48px] rounded-lg text-lg font-bold transition-colors ${
                          form.result === opt.value ? opt.activeColor : opt.color
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Miss type */}
                {showMissType && (
                  <div className="space-y-1">
                    <label className="block text-xs text-gray-400">ミスタイプ</label>
                    <div className="grid grid-cols-3 gap-2">
                      {MISS_TYPES.map(mt => (
                        <button
                          key={mt}
                          onClick={() => dispatch({
                            type: 'UPDATE_FIELD',
                            index: slot.index,
                            updater: f => ({ ...f, missType: f.missType === mt ? null : mt }),
                          })}
                          className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                            form.missType === mt
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

                {/* Direction 3x3 grid + Landing */}
                <div className="space-y-2">
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">方向</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {DIRECTION_GRID.map(({ lr, fb, label }) => {
                          const isSelected = form.directionLr === lr && form.directionFb === fb;
                          return (
                            <button
                              key={`${lr}-${fb}`}
                              onClick={() => dispatch({
                                type: 'UPDATE_FIELD',
                                index: slot.index,
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

                    <div className="w-px bg-gray-700 self-stretch mt-5" />

                    <div className="w-20">
                      <label className="block text-xs text-gray-500 mb-1">着地</label>
                      <div className="grid grid-cols-1 gap-1.5">
                        {LANDINGS.map(({ value, label }) => {
                          const isSelected = form.landing === value;
                          return (
                            <button
                              key={value}
                              onClick={() => dispatch({
                                type: 'UPDATE_FIELD',
                                index: slot.index,
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

                {/* AdvicePanel */}
                <AdvicePanel
                  roundId={roundId}
                  holeNumber={holeNumber}
                  shotNumber={slot.shotNumber}
                  currentShot={slot.shot}
                  lie={form.lie}
                  slopeFb={form.slopeFb}
                  slopeLr={form.slopeLr}
                  shotType={form.shotType}
                  remainingDistance={form.remainingDistance}
                />

                {/* Shot note */}
                <div className="space-y-1">
                  <label className="block text-xs text-gray-400">メモ</label>
                  <textarea
                    value={form.note ?? ''}
                    onChange={e => dispatch({ type: 'UPDATE_FIELD', index: slot.index, updater: f => ({ ...f, note: e.target.value || null }) })}
                    placeholder="気づき・反省点など"
                    maxLength={SHOT_NOTE_MAX_LENGTH}
                    rows={2}
                    className="w-full min-h-[48px] rounded-lg bg-gray-800 text-gray-200 px-3 py-2 text-base border-0 focus:ring-2 focus:ring-green-600 resize-none"
                  />
                </div>

                {/* Record/Update button */}
                <div className="space-y-2">
                  {slot.isNew ? (
                    <>
                      <button
                        onClick={() => handleRecordShot(slot.index, slot.shotNumber)}
                        disabled={form.result === null || isPending}
                        className="w-full min-h-[48px] flex items-center justify-center rounded-lg bg-green-600 px-3 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isPending ? '記録中...' : '記録'}
                      </button>
                      <button
                        onClick={() => handleSkipShot(slot.shotNumber)}
                        disabled={isPending}
                        className="w-full min-h-[48px] flex items-center justify-center rounded-lg border border-gray-600 px-3 py-3 text-sm font-bold text-gray-400 hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isPending ? 'スキップ中...' : 'スキップ'}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleUpdateShot(slot.index, slot.shot!)}
                      disabled={!isChanged || isPending}
                      className="w-full min-h-[48px] flex items-center justify-center rounded-lg bg-green-600 px-3 py-3 text-sm font-bold text-white hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isPending ? '更新中...' : '更新'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Error */}
      {error && (
        <p className="text-center text-sm text-red-400">{error}</p>
      )}
    </div>
  );
}
