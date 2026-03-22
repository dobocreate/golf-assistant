'use client';

import { createContext, useContext, useState, useCallback } from 'react';

interface PlayRoundContextValue {
  currentHole: number;
  setCurrentHole: (hole: number) => void;
}

const PlayRoundContext = createContext<PlayRoundContextValue | null>(null);

export function PlayRoundProvider({
  children,
  initialHole = 1,
}: {
  children: React.ReactNode;
  initialHole?: number;
}) {
  const [currentHole, setCurrentHoleState] = useState(initialHole);

  const setCurrentHole = useCallback((hole: number) => {
    if (hole >= 1 && hole <= 18) {
      setCurrentHoleState(hole);
    }
  }, []);

  return (
    <PlayRoundContext value={{ currentHole, setCurrentHole }}>
      {children}
    </PlayRoundContext>
  );
}

export function usePlayRound() {
  const ctx = useContext(PlayRoundContext);
  if (!ctx) throw new Error('usePlayRound must be used within PlayRoundProvider');
  return ctx;
}

/** Context がない場合も安全に使えるバージョン */
export function usePlayRoundOptional() {
  return useContext(PlayRoundContext);
}
