'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface HoleMapCopyButtonProps {
  text: string;
}

export function HoleMapCopyButton({ text }: HoleMapCopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available — silently ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors min-h-[32px] px-1"
      aria-label="GPS距離テキストをコピー"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-green-500" />
          <span className="text-green-500">コピー済み</span>
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          <span>テキストをコピー</span>
        </>
      )}
    </button>
  );
}
