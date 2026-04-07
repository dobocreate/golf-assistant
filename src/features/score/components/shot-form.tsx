'use client';

import { LIE_OPTIONS, SLOPE_FB_OPTIONS, SLOPE_LR_OPTIONS, SHOT_TYPE_OPTIONS, SHOT_NOTE_MAX_LENGTH } from '@/lib/golf-constants';
import { RESULT_OPTIONS, MISS_TYPES, LANDINGS, ELEVATIONS, DIRECTION_GRID, landingColor } from '@/features/score/shot-constants';
import { AdvicePanel } from '@/features/score/components/advice-panel';
import type { Shot, ShotFormState, ShotType, ShotLie, ShotSlopeFB, ShotSlopeLR, ShotLanding, ShotElevation } from '@/features/score/types';
import { distanceToCategory } from '@/features/score/types';
import type { ShotFormAction } from '@/features/score/hooks/use-shot-recorder';
import type { ClubOption } from '@/features/score/shot-constants';
import { ToggleButtonGrid } from '@/components/ui/toggle-button-grid';
import { SectionHeader } from '@/components/ui/section-header';

// --- ToggleButtonGrid用のオプション変換（型安全） ---
const SHOT_TYPE_TOGGLE = SHOT_TYPE_OPTIONS.map(st => ({ value: st.value as ShotType, label: st.label }));
const LIE_TOGGLE = LIE_OPTIONS.map(l => ({ value: l.value as ShotLie, label: l.shortLabel }));
const SLOPE_FB_TOGGLE = SLOPE_FB_OPTIONS.map(s => ({ value: s.value as ShotSlopeFB, label: s.shortLabel }));
const SLOPE_LR_TOGGLE = SLOPE_LR_OPTIONS.map(s => ({ value: s.value as ShotSlopeLR, label: s.shortLabel }));
const MISS_TYPE_TOGGLE = MISS_TYPES.map(mt => ({ value: mt, label: mt }));
const LANDING_TOGGLE = LANDINGS.map(l => ({ value: l.value as ShotLanding, label: l.label, activeColor: landingColor(l.value) }));
const ELEVATION_TOGGLE = ELEVATIONS.map(e => ({ value: e.value as ShotElevation, label: e.shortLabel }));

interface ShotFormProps {
  slot: {
    index: number;
    shotNumber: number;
    isNew: boolean;
    shot: Shot | null;
    isSkipped: boolean;
  };
  form: ShotFormState;
  dispatch: React.Dispatch<ShotFormAction>;
  clubs: ClubOption[];
  roundId: string;
  holeNumber: number;
  windDirection?: string | null;
  windStrength?: string | null;
  weather?: string | null;
  onAdviceReceived: (index: number, text: string) => void;
  gamePlanContext?: string | null;
}

export function ShotForm({ slot, form, dispatch, clubs, roundId, holeNumber, windDirection, windStrength, weather, onAdviceReceived, gamePlanContext }: ShotFormProps) {
  const showMissType = form.result === 'fair' || form.result === 'poor';
  const isPutt = form.shotType === 'putt';

  // --- dispatchアダプター ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fieldUpdater = (key: keyof ShotFormState) =>
    (value: any) => dispatch({ type: 'UPDATE_FIELD', index: slot.index, updater: f => ({ ...f, [key]: value }) });

  const handleResultChange = (value: string | null) =>
    dispatch({ type: 'UPDATE_FIELD', index: slot.index, updater: f => ({
      ...f,
      result: value as ShotFormState['result'],
      missType: (value === 'fair' || value === 'poor') ? f.missType : null,
    })});

  // パット用簡略化フォーム
  if (isPutt) {
    return (
      <div className="p-3 space-y-3 bg-gray-900">
        <SectionHeader>状況</SectionHeader>

        {/* ショット種別（パットから他への切替用） */}
        <div className="space-y-1">
          <label className="block text-xs text-gray-400">ショット</label>
          <ToggleButtonGrid
            options={SHOT_TYPE_TOGGLE}
            value={form.shotType}
            onChange={fieldUpdater('shotType')}
            columns={3}
            className="gap-1"
          />
        </div>

        <SectionHeader>パット状況</SectionHeader>

        {/* ファーストパット距離（数値入力 + プリセット） ※number型のためToggleButtonGrid対象外 */}
        <div className="space-y-2">
          <label className="block text-xs text-gray-400">パット距離 (m)</label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={50}
            step={1}
            placeholder="距離を入力"
            value={form.puttDistanceMeters ?? ''}
            onChange={e => {
              const parsed = parseInt(e.target.value, 10);
              const val = e.target.value === '' || Number.isNaN(parsed) ? null : Math.min(Math.max(parsed, 0), 50);
              dispatch({
                type: 'UPDATE_FIELD',
                index: slot.index,
                updater: f => ({
                  ...f,
                  puttDistanceMeters: val,
                  puttDistanceCategory: val !== null ? distanceToCategory(val) : null,
                }),
              });
            }}
            className="w-full min-h-[48px] rounded-lg bg-gray-800 text-gray-200 px-3 text-base border-0 focus:ring-2 focus:ring-green-600"
          />
          <div className="grid grid-cols-6 gap-1.5">
            {[1, 3, 5, 7, 10, 15].map(preset => (
              <button
                key={preset}
                onClick={() => dispatch({
                  type: 'UPDATE_FIELD',
                  index: slot.index,
                  updater: f => {
                    const newVal = f.puttDistanceMeters === preset ? null : preset;
                    return {
                      ...f,
                      puttDistanceMeters: newVal,
                      puttDistanceCategory: newVal !== null ? distanceToCategory(newVal) : null,
                    };
                  },
                })}
                className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                  form.puttDistanceMeters === preset
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                }`}
              >
                {preset}m
              </button>
            ))}
          </div>
        </div>

        {/* パットアドバイス（折りたたみ） */}
        <details className="group">
          <summary className="min-h-[48px] flex items-center gap-1 text-sm text-green-400 cursor-pointer hover:text-green-300 list-none [&::-webkit-details-marker]:hidden">
            <span className="group-open:rotate-90 transition-transform" aria-hidden="true">▶</span>
            AIアドバイス
          </summary>
          <div className="mt-2">
            <AdvicePanel
              roundId={roundId}
              holeNumber={holeNumber}
              shotNumber={slot.shotNumber}
              lie="green"
              slopeFb={null}
              slopeLr={null}
              shotType="putt"
              remainingDistance={form.puttDistanceMeters}
              windDirection={windDirection}
              windStrength={windStrength}
              weather={weather}
              savedAdviceText={slot.shot?.advice_text}
              onAdviceReceived={(text) => onAdviceReceived(slot.index, text)}
              gamePlanContext={gamePlanContext}
            />
          </div>
        </details>

        <div className="border-t border-gray-700 my-1" />

        <SectionHeader>結果</SectionHeader>

        {/* 結果ボタン ※独自activeColorのためToggleButtonGrid使用 */}
        <div className="grid grid-cols-4 gap-2">
          {RESULT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleResultChange(opt.value === form.result ? null : opt.value)}
              className={`min-h-[48px] rounded-lg text-lg font-bold transition-colors ${
                form.result === opt.value ? opt.activeColor : opt.color
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* 方向グリッド ※複合値(lr+fb)のためToggleButtonGrid対象外 */}
        <div className="space-y-1">
          <label className="block text-xs text-gray-400">方向</label>
          <div className="grid grid-cols-3 gap-1.5 max-w-[180px] mx-auto">
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
                    isSelected ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                  }`}
                >
                  {label}
                </button>
              );
            })}
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

  // 通常ショットフォーム
  return (
    <div className="p-3 space-y-3 bg-gray-900">
      {slot.isSkipped && (
        <p className="text-xs text-gray-400 bg-gray-800 rounded px-3 py-2">
          このショットはスキップされました。入力すると次の保存時に記録されます。
        </p>
      )}

      <SectionHeader>状況</SectionHeader>

      {/* ショット種別 */}
      <div className="space-y-1">
        <label className="block text-xs text-gray-400">ショット</label>
        <ToggleButtonGrid
          options={SHOT_TYPE_TOGGLE}
          value={form.shotType}
          onChange={fieldUpdater('shotType')}
          columns={3}
          className="gap-1"
        />
      </div>

      {/* 目標距離 */}
      <div className="space-y-1">
        <label className="block text-xs text-gray-400">目標距離 (yd)</label>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={700}
          step={1}
          placeholder="目標距離"
          value={form.remainingDistance ?? ''}
          onChange={e => {
            const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
            dispatch({ type: 'UPDATE_FIELD', index: slot.index, updater: f => ({ ...f, remainingDistance: val }) });
          }}
          className="w-full min-h-[48px] rounded-lg bg-gray-800 text-gray-200 px-3 text-sm border-0 focus:ring-2 focus:ring-green-600"
        />
      </div>

      {/* ライ */}
      <div className="space-y-1">
        <label className="block text-xs text-gray-400">ライ</label>
        <ToggleButtonGrid
          options={LIE_TOGGLE}
          value={form.lie}
          onChange={fieldUpdater('lie')}
          columns={5}
          className="gap-1"
        />
      </div>

      {/* 傾斜 */}
      <div className="space-y-1">
        <label className="block text-xs text-gray-400">傾斜（任意）</label>
        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <p className="text-xs text-gray-400">高低差</p>
            <ToggleButtonGrid
              options={ELEVATION_TOGGLE}
              value={form.elevation}
              onChange={fieldUpdater('elevation')}
              columns={3}
              className="gap-1"
            />
          </div>
        </div>
        <div className="flex gap-3 mt-1">
          <div className="flex-1 space-y-1">
            <p className="text-xs text-gray-400">前後</p>
            <ToggleButtonGrid
              options={SLOPE_FB_TOGGLE}
              value={form.slopeFb}
              onChange={fieldUpdater('slopeFb')}
              columns={2}
              className="gap-1"
            />
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-xs text-gray-400">左右</p>
            <ToggleButtonGrid
              options={SLOPE_LR_TOGGLE}
              value={form.slopeLr}
              onChange={fieldUpdater('slopeLr')}
              columns={2}
              className="gap-1"
            />
          </div>
        </div>
      </div>

      {/* AIアドバイス（折りたたみ） */}
      <details className="group">
        <summary className="min-h-[48px] flex items-center gap-1 text-sm text-green-400 cursor-pointer hover:text-green-300 list-none [&::-webkit-details-marker]:hidden">
          <span className="group-open:rotate-90 transition-transform" aria-hidden="true">▶</span>
          AIアドバイス
        </summary>
        <div className="mt-2">
          <AdvicePanel
            roundId={roundId}
            holeNumber={holeNumber}
            shotNumber={slot.shotNumber}
            lie={form.lie}
            slopeFb={form.slopeFb}
            savedAdviceText={slot.shot?.advice_text}
            slopeLr={form.slopeLr}
            shotType={form.shotType}
            remainingDistance={form.remainingDistance}
            windDirection={windDirection}
            windStrength={windStrength}
            weather={weather}
            elevation={form.elevation}
            onAdviceReceived={(text) => onAdviceReceived(slot.index, text)}
            gamePlanContext={gamePlanContext}
          />
        </div>
      </details>

      <div className="border-t border-gray-700 my-1" />

      <SectionHeader>結果</SectionHeader>

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

      {/* 結果 ※副作用(missTypeクリア)ありのためToggleButtonGrid不使用 */}
      <div className="space-y-1">
        <label className="block text-xs text-gray-400">結果</label>
        <div className="grid grid-cols-4 gap-2">
          {RESULT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => handleResultChange(opt.value === form.result ? null : opt.value)}
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
          <ToggleButtonGrid
            options={MISS_TYPE_TOGGLE}
            value={form.missType}
            onChange={fieldUpdater('missType')}
            columns={3}
            itemClassName="bg-gray-800 text-gray-200"
          />
        </div>
      )}

      {/* 方向 + 着地 ※方向は複合値のため既存維持、着地はToggleButtonGrid */}
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
                      isSelected ? 'bg-green-600 text-white' : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
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
            <ToggleButtonGrid
              options={LANDING_TOGGLE}
              value={form.landing}
              onChange={fieldUpdater('landing')}
              columns={1}
            />
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
