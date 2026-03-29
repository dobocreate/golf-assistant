'use client';

import { useCallback } from 'react';
import { useStreamFetch } from './use-stream-fetch';

export interface UsePracticeStreamReturn {
  text: string;
  isStreaming: boolean;
  error: string | null;
  requestSuggestion: (roundId: string) => Promise<void>;
  cancel: () => void;
}

export function usePracticeStream(options?: {
  onComplete?: (text: string) => void;
}): UsePracticeStreamReturn {
  const { text, isStreaming, error, request, cancel } = useStreamFetch(options);

  const requestSuggestion = useCallback(
    (roundId: string) => request('/api/practice-suggestion/stream', { roundId }),
    [request],
  );

  return { text, isStreaming, error, requestSuggestion, cancel };
}
