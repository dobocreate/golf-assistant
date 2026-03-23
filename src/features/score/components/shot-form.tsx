'use client';

import { LIE_OPTIONS, SLOPE_FB_OPTIONS, SLOPE_LR_OPTIONS, SHOT_TYPE_OPTIONS, SHOT_NOTE_MAX_LENGTH } from '@/lib/golf-constants';
import { RESULT_OPTIONS, MISS_TYPES, LANDINGS, DIRECTION_GRID, landingColor } from '@/features/score/shot-constants';
import { AdvicePanel } from '@/features/score/components/advice-panel';
import type { Shot, ShotFormState } from '@/features/score/types';
import type { FormsAction } from '@/features/score/hooks/use-shot-recorder';
import type { ClubOption } from '@/features/score/shot-constants';

interface ShotFormProps {
  slot: {
    index: number;
    shotNumber: number;
    isNew: boolean;
    shot: Shot | null;
    isSkipped: boolean;
  };
  form: ShotFormState;
  dispatch: React.Dispatch<FormsAction>;
  clubs: ClubOption[];
  roundId: string;
  holeNumber: number;
  onAdviceReceived: (index: number, text: string) => void;
}

export function ShotForm({ slot, form, dispatch, clubs, roundId, holeNumber, onAdviceReceived }: ShotFormProps) {
  const showMissType = form.result === 'fair' || form.result === 'poor';

  return (
    <div className="p-3 space-y-3 bg-gray-900">
      {/* スキップヒント */}
      {slot.isSkipped && (
        <p className="text-xs text-gray-400 bg-gray-800 rounded px-3 py-2">
          このショットはスキップされました。入力すると次の保存時に記録されます。
        </p>
      )}

      {/* ===== 状況セクション ===== */}
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">状況</p>

      {/* ショット種別 */}
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

      {/* 残り距離 */}
      <div className="space-y-1">
        <label className="block text-xs text-gray-400">残り距離 (yd)</label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={700}
          step={1}
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

      {/* クラブ */}
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

      {/* ライ */}
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

      {/* 傾斜 */}
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
                    updater: f => ({ ...f, slopeFb: f.slopeFb === s.value ? null : s.value }),
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
                    updater: f => ({ ...f, slopeLr: f.slopeLr === s.value ? null : s.value }),
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

      {/* AIアドバイス */}
      <AdvicePanel
        roundId={roundId}
        holeNumber={holeNumber}
        shotNumber={slot.shotNumber}
        lie={form.lie}
        slopeFb={form.slopeFb}
        slopeLr={form.slopeLr}
        shotType={form.shotType}
        remainingDistance={form.remainingDistance}
        onAdviceReceived={(text) => onAdviceReceived(slot.index, text)}
      />

      {/* ===== 区切り線 ===== */}
      <div className="border-t border-gray-700 my-1" />

      {/* ===== 結果セクション ===== */}
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">結果</p>

      {/* 結果 */}
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

      {/* ミスタイプ */}
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

      {/* 方向 + 着地 */}
      <div className="space-y-2">
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-1">方向</label>
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
            <label className="block text-xs text-gray-400 mb-1">着地</label>
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

      {/* メモ */}
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
    </div>
  );
}
