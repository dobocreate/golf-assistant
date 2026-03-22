'use client';

import { useState, useCallback, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import { SHOT_TYPE_OPTIONS, DISTANCES, LIE_OPTIONS, VALID_LIES, SHOT_TYPE_DB_TO_LABEL, VALID_SHOT_TYPES } from '@/lib/golf-constants';
import type { ShotLie } from '@/features/score/types';
import type { Situation, SlopeFB, SlopeLR } from '../types';

interface SituationInputProps {
  holeNumber: number;
  onSubmit: (situation: Situation) => void;
  isLoading: boolean;
  initialLie?: ShotLie | string;
  initialSlopeFB?: string;
  initialSlopeLR?: string;
  initialShotType?: string;
  initialDistance?: number;
}

function parseLie(value: string | undefined): ShotLie | null {
  if (!value) return null;
  return (VALID_LIES as readonly string[]).includes(value) ? (value as ShotLie) : null;
}

function parseShotType(value: string | undefined): string | null {
  if (!value) return null;
  // DB値（tee_shot等）ならそのまま返す
  if ((VALID_SHOT_TYPES as readonly string[]).includes(value)) return value;
  // 日本語ラベル（ティーショット等）ならDB値に変換
  const found = SHOT_TYPE_OPTIONS.find(s => s.label === value);
  return found ? found.value : null;
}

export function SituationInput({ holeNumber, onSubmit, isLoading, initialLie, initialSlopeFB, initialSlopeLR, initialShotType, initialDistance }: SituationInputProps) {
  const [shotType, setShotType] = useState<string | null>(() => parseShotType(initialShotType));
  const [distance, setDistance] = useState<string | null>(null);
  const [distanceNum, setDistanceNum] = useState<number | null>(() => initialDistance ?? null);
  const [lie, setLie] = useState<ShotLie | null>(() => parseLie(initialLie));
  const [slopeFB, setSlopeFB] = useState<SlopeFB | null>(() => {
    return (initialSlopeFB === 'toe_up' || initialSlopeFB === 'toe_down') ? initialSlopeFB : null;
  });
  const [slopeLR, setSlopeLR] = useState<SlopeLR | null>(() => {
    return (initialSlopeLR === 'left_up' || initialSlopeLR === 'left_down') ? initialSlopeLR : null;
  });

  // props の初期値が変化した場合に state を同期（ページ遷移でコンポーネントが再利用されるケース）
  useEffect(() => {
    setLie(parseLie(initialLie));
  }, [initialLie]);

  useEffect(() => {
    if (initialSlopeFB === 'toe_up' || initialSlopeFB === 'toe_down') setSlopeFB(initialSlopeFB);
    else setSlopeFB(null);
  }, [initialSlopeFB]);

  useEffect(() => {
    if (initialSlopeLR === 'left_up' || initialSlopeLR === 'left_down') setSlopeLR(initialSlopeLR);
    else setSlopeLR(null);
  }, [initialSlopeLR]);

  // initialShotType が変化した場合に state を同期
  useEffect(() => {
    setShotType(parseShotType(initialShotType));
  }, [initialShotType]);

  // initialDistance が変化した場合に state を同期
  useEffect(() => {
    if (initialDistance != null) {
      setDistanceNum(initialDistance);
      setDistance(null); // 数値入力が優先
    }
  }, [initialDistance]);

  const handleSubmit = useCallback(() => {
    // 数値入力があればそれを距離文字列として使用
    const effectiveDistance = distanceNum != null ? `${distanceNum}y` : distance;
    const shotTypeLabel = shotType ? (SHOT_TYPE_DB_TO_LABEL[shotType] ?? shotType) : null;
    if (!shotTypeLabel || !effectiveDistance || !lie) return;
    onSubmit({
      holeNumber,
      shotType: shotTypeLabel,
      remainingDistance: effectiveDistance,
      lie,
      slopeFB,
      slopeLR,
    });
  }, [holeNumber, shotType, distance, distanceNum, lie, slopeFB, slopeLR, onSubmit]);

  const hasDistance = distanceNum != null || distance != null;
  const canSubmit = shotType && hasDistance && lie && !isLoading;

  return (
    <div className="space-y-4">
      {/* ショット種別 */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">ショット</label>
        <div className="grid grid-cols-2 gap-2">
          {SHOT_TYPE_OPTIONS.map(st => (
            <button
              key={st.value}
              onClick={() => setShotType(st.value)}
              className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                shotType === st.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* 残り距離 */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">残り距離</label>
        <div className="grid grid-cols-2 gap-2">
          {DISTANCES.map(d => (
            <button
              key={d}
              onClick={() => { setDistance(d); setDistanceNum(null); }}
              className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                distance === d && distanceNum == null
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <input
          type="number"
          min={0}
          max={700}
          placeholder="数値で入力 (yd)"
          value={distanceNum ?? ''}
          onChange={e => {
            const val = e.target.value === '' ? null : parseInt(e.target.value, 10);
            setDistanceNum(val);
            if (val != null) setDistance(null);
          }}
          className="w-full min-h-[48px] rounded-lg bg-gray-800 text-gray-200 px-3 text-sm border-0 focus:ring-2 focus:ring-blue-600"
        />
      </div>

      {/* ライ・状況 */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">ライ・状況</label>
        <div className="grid grid-cols-3 gap-2">
          {LIE_OPTIONS.map(l => (
            <button
              key={l.value}
              onClick={() => setLie(l.value)}
              className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                lie === l.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* 傾斜（任意） */}
      <div className="space-y-2">
        <label className="block text-sm font-bold text-gray-300">傾斜（任意）</label>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 min-w-[32px]">前後</span>
            <div className="grid grid-cols-2 gap-2 flex-1">
              <button
                onClick={() => setSlopeFB(prev => prev === 'toe_up' ? null : 'toe_up')}
                className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                  slopeFB === 'toe_up'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                つま先上がり
              </button>
              <button
                onClick={() => setSlopeFB(prev => prev === 'toe_down' ? null : 'toe_down')}
                className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                  slopeFB === 'toe_down'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                つま先下がり
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 min-w-[32px]">左右</span>
            <div className="grid grid-cols-2 gap-2 flex-1">
              <button
                onClick={() => setSlopeLR(prev => prev === 'left_up' ? null : 'left_up')}
                className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                  slopeLR === 'left_up'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                左足上がり
              </button>
              <button
                onClick={() => setSlopeLR(prev => prev === 'left_down' ? null : 'left_down')}
                className={`min-h-[48px] rounded-lg text-sm font-bold transition-colors ${
                  slopeLR === 'left_down'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-200 hover:bg-gray-700'
                }`}
              >
                左足下がり
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* アドバイスボタン */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full min-h-[56px] flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-4 text-xl font-bold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <MessageSquare className="h-5 w-5" />
        {isLoading ? 'アドバイス取得中...' : 'アドバイス'}
      </button>
    </div>
  );
}
