import type { CourseSource, CourseSearchResult, CourseDetail } from './types';

// TODO: Sprint 1 で実装
export function createRakutenGoraSource(_appId: string): CourseSource {
  return {
    async search(_query: string, _prefecture?: string): Promise<CourseSearchResult[]> {
      throw new Error('Not implemented: Sprint 1 で実装予定');
    },
    async getDetail(_courseId: string): Promise<CourseDetail | null> {
      throw new Error('Not implemented: Sprint 1 で実装予定');
    },
  };
}
