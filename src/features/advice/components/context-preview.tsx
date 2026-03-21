'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ContextPreviewProps {
  contextText: string;
}

export function ContextPreview({ contextText }: ContextPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!contextText) return null;

  return (
    <div className="rounded-lg bg-gray-800 border border-gray-700">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-h-[44px] flex items-center justify-between px-3 py-2 text-sm text-gray-400 hover:text-gray-300"
      >
        <span>コンテキスト情報</span>
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {isOpen && (
        <div className="px-3 pb-3 text-xs text-gray-500 whitespace-pre-wrap max-h-[300px] overflow-y-auto">
          {contextText}
        </div>
      )}
    </div>
  );
}
