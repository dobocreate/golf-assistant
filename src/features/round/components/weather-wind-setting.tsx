'use client';

import { useState, useTransition } from 'react';
import { updateWeather, updateWind } from '@/actions/round';
import type { Weather, WindStrength } from '@/features/round/types';
import { WEATHER_LABELS, WIND_STRENGTH_LABELS } from '@/features/round/types';

interface WeatherWindSettingProps {
  roundId: string;
  initialWeather: Weather | null;
  initialWind: WindStrength | null;
}

export function WeatherWindSetting({ roundId, initialWeather, initialWind }: WeatherWindSettingProps) {
  const [weather, setWeather] = useState<Weather | null>(initialWeather);
  const [wind, setWind] = useState<WindStrength | null>(initialWind);
  const [isPending, startTransition] = useTransition();

  const handleWeather = (val: Weather) => {
    const newVal = weather === val ? null : val;
    setWeather(newVal);
    startTransition(async () => {
      const result = await updateWeather(roundId, newVal);
      if (result.error) setWeather(weather); // ロールバック
    });
  };

  const handleWind = (val: WindStrength) => {
    const newVal = wind === val ? null : val;
    setWind(newVal);
    startTransition(async () => {
      const result = await updateWind(roundId, newVal);
      if (result.error) setWind(wind); // ロールバック
    });
  };

  return (
    <div className="space-y-3">
      {/* 天候 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-300 w-12">天候</span>
        <div className="flex gap-1 flex-1">
          {(Object.entries(WEATHER_LABELS) as [Weather, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => handleWeather(key)}
              disabled={isPending}
              className={`flex-1 min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                weather === key
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 風 */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-300 w-12">風</span>
        <div className="flex gap-1 flex-1">
          {(Object.entries(WIND_STRENGTH_LABELS) as [WindStrength, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => handleWind(key)}
              disabled={isPending}
              className={`flex-1 min-h-[40px] rounded-lg text-xs font-bold transition-colors ${
                wind === key
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
