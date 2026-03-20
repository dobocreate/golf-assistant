import type { LLMClient, LLMMessage, LLMResponse } from './types';

// TODO: Sprint 3 で実装
export function createGeminiClient(_apiKey: string): LLMClient {
  return {
    async chat(_messages: LLMMessage[]): Promise<LLMResponse> {
      throw new Error('Not implemented: Sprint 3 で実装予定');
    },
    async *chatStream(_messages: LLMMessage[]): AsyncIterable<string> {
      throw new Error('Not implemented: Sprint 3 で実装予定');
    },
  };
}
