'use client';

import { useState, useTransition } from 'react';
import { updateWeather, updateWind } from '@/actions/round';
import type { Weather, WindStrength } from '@/features/round/types';
import { WEATHER_LABELS, WIND_STRENGTH_LABELS } from '@/features/round/types';
import { ToggleButtonGrid, type ToggleOption } from '@/components/ui/toggle-button-grid';

const WEATHER_OPTIONS: ToggleOption<Weather>[] =
  (Object.entries(WEATHER_LABELS) as [Weather, string][]).map(([value, label]) => ({ value, label }));

const WIND_OPTIONS: ToggleOption<WindStrength>[] =
  (Object.entries(WIND_STRENGTH_LABELS) as [WindStrength, string][]).map(([value, label]) => ({ value, label }));

interface WeatherWindSettingProps {
  roundId: string;
  initialWeather: Weather | null;
  initialWind: WindStrength | null;
}

export function WeatherWindSetting({ roundId, initialWeather, initialWind }: WeatherWindSettingProps) {
  const [weather, setWeather] = useState<Weather | null>(initialWeather);
  const [wind, setWind] = useState<WindStrength | null>(initialWind);
  const [isPending, startTransition] = useTransition();

  const handleWeather = (val: Weather | null) => {
    const prev = weather;
    setWeather(val);
    startTransition(async () => {
      const result = await updateWeather(roundId, val);
      if (result.error) setWeather(prev); // ロールバック
    });
  };

  const handleWind = (val: WindStrength | null) => {
    const prev = wind;
    setWind(val);
    startTransition(async () => {
      const result = await updateWind(roundId, val);
      if (result.error) setWind(prev); // ロールバック
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-300 w-12">天候</span>
        <ToggleButtonGrid
          options={WEATHER_OPTIONS}
          value={weather}
          onChange={handleWeather}
          columns={4}
          disabled={isPending}
          className="flex-1"
          itemClassName="flex-1"
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-300 w-12">風</span>
        <ToggleButtonGrid
          options={WIND_OPTIONS}
          value={wind}
          onChange={handleWind}
          columns={4}
          disabled={isPending}
          className="flex-1"
          itemClassName="flex-1"
        />
      </div>
    </div>
  );
}
