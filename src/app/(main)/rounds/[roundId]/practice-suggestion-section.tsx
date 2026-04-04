'use client';

import { useState, useTransition, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { usePracticeStream } from '@/hooks/use-practice-stream';
import { savePracticeSuggestion } from '@/actions/round';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw, Loader2, ChevronRight } from 'lucide-react';
import type { Components } from 'react-markdown';

const mdComponents: Components = {
  a: (props) => <a target="_blank" rel="noopener noreferrer" {...props} />,
};
const mdPlugins = [remarkGfm];

interface PracticeSuggestionSectionProps {
  roundId: string;
  initialSuggestion: string | null;
  hasReviewNote: boolean;
}

export function PracticeSuggestionSection({
  roundId,
  initialSuggestion,
  hasReviewNote,
}: PracticeSuggestionSectionProps) {
  const [savedSuggestion, setSavedSuggestion] = useState(initialSuggestion);
  const [isSaving, startTransition] = useTransition();
  const [showConfirm, setShowConfirm] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const onComplete = useCallback((text: string) => {
    setSaveError(null);
    startTransition(async () => {
      const result = await savePracticeSuggestion(roundId, text);
      if (result.error) {
        setSaveError(result.error);
      } else {
        setSavedSuggestion(text);
      }
    });
  }, [roundId]);

  const { text, isStreaming, error, requestSuggestion } = usePracticeStream({ onComplete });

  const handleRequest = () => {
    if (savedSuggestion && !showConfirm) {
      setShowConfirm(true);
      return;
    }
    setShowConfirm(false);
    requestSuggestion(roundId);
  };

  const displayText = isStreaming ? text : (savedSuggestion ?? '');

  // 提案テキストの先頭部分をサマリーとして抽出
  const summaryText = displayText
    ? displayText.split('\n').filter(l => l.trim()).slice(0, 2).join(' ').slice(0, 80) + '...'
    : '';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">AI練習提案</h2>
        {hasReviewNote && !isStreaming && (
          <button
            type="button"
            onClick={handleRequest}
            disabled={isSaving}
            className="inline-flex items-center gap-1 min-h-[48px] text-sm text-emerald-600 hover:text-emerald-500 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 rounded"
          >
            {savedSuggestion ? (
              <>
                <RefreshCw className="h-4 w-4" />
                再生成
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                練習提案を受ける
              </>
            )}
          </button>
        )}
      </div>

      {showConfirm && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 p-3">
          <p className="text-sm text-amber-800 dark:text-amber-200">現在の提案を上書きして再生成しますか？</p>
          <div className="flex gap-2 mt-2">
            <Button
              variant="outline"
              onClick={() => setShowConfirm(false)}
            >
              キャンセル
            </Button>
            <Button
              onClick={handleRequest}
              className="bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700"
            >
              再生成する
            </Button>
          </div>
        </div>
      )}

      {isStreaming && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
            <span className="text-sm text-gray-500">分析中...</span>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={mdPlugins} components={mdComponents}>{text}</ReactMarkdown>
          </div>
        </div>
      )}

      {isSaving && !isStreaming && (
        <p className="text-sm text-gray-500">保存中...</p>
      )}

      {!isStreaming && displayText && !showConfirm && (
        <details className="group">
          <summary className="flex items-center gap-2 cursor-pointer list-none text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-600 rounded">
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
            <span className="group-open:hidden">{summaryText}</span>
            <span className="hidden group-open:inline">提案を閉じる</span>
          </summary>
          <div className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-800 p-4">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown>{displayText}</ReactMarkdown>
            </div>
          </div>
        </details>
      )}

      {(error || saveError) && (
        <p className="text-sm text-red-600">{error || saveError}</p>
      )}

      {!hasReviewNote && !savedSuggestion && (
        <p className="text-sm text-gray-500">総括を記入すると、AIによる練習提案を受けられます</p>
      )}
    </div>
  );
}
