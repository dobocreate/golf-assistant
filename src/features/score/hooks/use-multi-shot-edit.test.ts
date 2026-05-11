import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { StrictMode } from 'react';
import { useMultiShotEdit, shotKey } from './use-multi-shot-edit';
import type { CommitResult, SaveShotPosition, RevertShotPosition } from './use-multi-shot-edit';
import type { Shot } from '@/features/score/types';

/**
 * テスト用 Shot factory。すべての必須フィールドにデフォルト値を入れる。
 */
function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    id: 'shot-1',
    round_id: 'round-1',
    hole_number: 1,
    shot_number: 1,
    club: '7I',
    result: null,
    miss_type: null,
    direction_lr: null,
    direction_fb: null,
    lie: null,
    slope_fb: null,
    slope_lr: null,
    landing: null,
    shot_type: null,
    remaining_distance: null,
    advice_text: null,
    note: null,
    wind_direction: null,
    wind_strength: null,
    elevation: null,
    latitude: 35.0,
    longitude: 135.0,
    gps_accuracy_m: 5,
    captured_at: '2026-05-11T00:00:00Z',
    auto_lie: 'fairway',
    remaining_to_green_m: 100,
    gps_source: 'gps',
    original_latitude: null,
    original_longitude: null,
    edited_at: null,
    auto_lie_confidence: 'high',
    position_revision: 1,
    auto_lie_calculated_at: '2026-05-11T00:00:00Z',
    ...overrides,
  };
}

describe('useMultiShotEdit', () => {
  describe('select', () => {
    it('shotId を渡すと selectedShotId にセットされる', () => {
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a' }), makeShot({ id: 'b', shot_number: 2 })],
          saveShotPosition: vi.fn(),
          revertShotPosition: vi.fn(),
        }),
      );
      expect(result.current.selectedShotId).toBe(null);
      act(() => result.current.select('a'));
      expect(result.current.selectedShotId).toBe('a');
    });

    it('同じ shotId を再度渡すと選択解除 (toggle)', () => {
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a' })],
          saveShotPosition: vi.fn(),
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => result.current.select('a'));
      expect(result.current.selectedShotId).toBe('a');
      act(() => result.current.select('a'));
      expect(result.current.selectedShotId).toBe(null);
    });

    it('null を渡すと選択解除 + saveError リセット', () => {
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a' })],
          saveShotPosition: vi.fn(),
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => result.current.select('a'));
      act(() => result.current.select(null));
      expect(result.current.selectedShotId).toBe(null);
    });
  });

  describe('dragTo / drafts', () => {
    it('dragTo で当該 shotId の draft が登録される', () => {
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a', position_revision: 7 })],
          saveShotPosition: vi.fn(),
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => result.current.dragTo('a', 35.5, 135.5));
      const draft = result.current.drafts.get('a');
      expect(draft).toEqual({
        lat: 35.5,
        lng: 135.5,
        source: 'manual_edit',
        accuracyM: null,
        baseRevision: 7,
      });
    });

    it('存在しない shotId への dragTo は無視される', () => {
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a' })],
          saveShotPosition: vi.fn(),
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => result.current.dragTo('nonexistent', 35.5, 135.5));
      expect(result.current.drafts.size).toBe(0);
    });

    it('discardDraft で個別 draft 破棄', () => {
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a' }), makeShot({ id: 'b', shot_number: 2 })],
          saveShotPosition: vi.fn(),
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => {
        result.current.dragTo('a', 1, 1);
        result.current.dragTo('b', 2, 2);
      });
      expect(result.current.drafts.size).toBe(2);
      act(() => result.current.discardDraft('a'));
      expect(result.current.drafts.size).toBe(1);
      expect(result.current.drafts.has('b')).toBe(true);
    });

    it('同一 shotId への 2 回目の dragTo は draft を上書きする (n6)', () => {
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a', position_revision: 7 })],
          saveShotPosition: vi.fn(),
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => result.current.dragTo('a', 35.0, 135.0));
      act(() => result.current.dragTo('a', 35.5, 135.5));
      const draft = result.current.drafts.get('a');
      expect(draft?.lat).toBe(35.5);
      expect(draft?.lng).toBe(135.5);
      // baseRevision は shotsRef.current から都度読まれるが、shots は変わっていないので 7
      expect(draft?.baseRevision).toBe(7);
      expect(result.current.drafts.size).toBe(1);
    });

    it('discardAllDrafts で全 draft クリア', () => {
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a' }), makeShot({ id: 'b', shot_number: 2 })],
          saveShotPosition: vi.fn(),
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => {
        result.current.dragTo('a', 1, 1);
        result.current.dragTo('b', 2, 2);
      });
      act(() => result.current.discardAllDrafts());
      expect(result.current.drafts.size).toBe(0);
    });
  });

  describe('commit', () => {
    it('成功時: drafts から削除 + shots を latestShot で同期', async () => {
      const updated = makeShot({ id: 'a', latitude: 36.0, longitude: 136.0, position_revision: 2 });
      const saveShotPosition: SaveShotPosition = vi.fn(async (): Promise<CommitResult> => ({
        ok: true,
        latestShot: updated,
      }));
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a', position_revision: 1 })],
          saveShotPosition,
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => result.current.dragTo('a', 36.0, 136.0));
      await act(async () => {
        await result.current.commit('a');
      });
      expect(saveShotPosition).toHaveBeenCalledTimes(1);
      expect(result.current.drafts.size).toBe(0);
      expect(result.current.shots[0].latitude).toBe(36.0);
      expect(result.current.shots[0].position_revision).toBe(2);
      expect(result.current.saveError).toBe(null);
    });

    it('conflict 時: latestShot で同期、draft 破棄、saveError=conflict', async () => {
      const latestShot = makeShot({ id: 'a', latitude: 37.0, longitude: 137.0, position_revision: 5 });
      const saveShotPosition: SaveShotPosition = vi.fn(async (): Promise<CommitResult> => ({
        ok: false,
        error: 'conflict',
        latestShot,
      }));
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a', position_revision: 1 })],
          saveShotPosition,
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => {
        result.current.select('a');
        result.current.dragTo('a', 36.0, 136.0);
      });
      await act(async () => {
        await result.current.commit('a');
      });
      expect(result.current.saveError).toBe('conflict');
      expect(result.current.drafts.size).toBe(0);
      expect(result.current.shots[0].latitude).toBe(37.0);
      // selection は維持（ユーザーが状況確認できるよう）
      expect(result.current.selectedShotId).toBe('a');
    });

    it('failed 時: saveError=failed、draft は維持', async () => {
      const saveShotPosition: SaveShotPosition = vi.fn(async (): Promise<CommitResult> => ({
        ok: false,
        error: 'failed',
      }));
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a', position_revision: 1 })],
          saveShotPosition,
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => result.current.dragTo('a', 36.0, 136.0));
      await act(async () => {
        await result.current.commit('a');
      });
      expect(result.current.saveError).toBe('failed');
      expect(result.current.drafts.size).toBe(1); // draft 維持
    });

    it('saveShotPosition が throw した場合も saveError=failed で終了', async () => {
      const saveShotPosition: SaveShotPosition = vi.fn(async (): Promise<CommitResult> => {
        throw new Error('boom');
      });
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a' })],
          saveShotPosition,
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => result.current.dragTo('a', 36.0, 136.0));
      await act(async () => {
        await result.current.commit('a');
      });
      expect(result.current.saveError).toBe('failed');
    });

    it('draft なしの shotId への commit は no-op', async () => {
      const saveShotPosition: SaveShotPosition = vi.fn(async (): Promise<CommitResult> => ({ ok: true }));
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a' })],
          saveShotPosition,
          revertShotPosition: vi.fn(),
        }),
      );
      await act(async () => {
        await result.current.commit('a');
      });
      expect(saveShotPosition).not.toHaveBeenCalled();
    });

    it('inflight ガード: 同一 shotId への並行 commit は 1 回しか走らない', async () => {
      let resolveSave: ((value: CommitResult) => void) | null = null;
      const saveShotPosition: SaveShotPosition = vi.fn(
        () =>
          new Promise<CommitResult>((resolve) => {
            resolveSave = resolve;
          }),
      );
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a' })],
          saveShotPosition,
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => result.current.dragTo('a', 36.0, 136.0));

      // 並行 commit: 2 回呼んでも saveShotPosition は 1 回のみ
      const p1 = result.current.commit('a');
      const p2 = result.current.commit('a');
      expect(saveShotPosition).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveSave!({ ok: true });
        await Promise.all([p1, p2]);
      });
      expect(saveShotPosition).toHaveBeenCalledTimes(1);
    });
  });

  describe('commitAll', () => {
    it('全 draft を順次 commit する', async () => {
      const saveShotPosition: SaveShotPosition = vi.fn(async (): Promise<CommitResult> => ({ ok: true }));
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [
            makeShot({ id: 'a' }),
            makeShot({ id: 'b', shot_number: 2 }),
            makeShot({ id: 'c', shot_number: 3 }),
          ],
          saveShotPosition,
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => {
        result.current.dragTo('a', 1, 1);
        result.current.dragTo('b', 2, 2);
        result.current.dragTo('c', 3, 3);
      });
      await act(async () => {
        await result.current.commitAll();
      });
      expect(saveShotPosition).toHaveBeenCalledTimes(3);
    });

    it('部分失敗時: 後続 commit はスキップされず順次実行される (n5)', async () => {
      // 2 番目だけ conflict、他は成功 → 3 回呼ばれて最後の saveError が conflict
      const saveShotPosition: SaveShotPosition = vi.fn(async ({ shot }): Promise<CommitResult> => {
        if (shot.id === 'b') return { ok: false, error: 'conflict' as const, latestShot: shot };
        return { ok: true };
      });
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [
            makeShot({ id: 'a' }),
            makeShot({ id: 'b', shot_number: 2 }),
            makeShot({ id: 'c', shot_number: 3 }),
          ],
          saveShotPosition,
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => {
        result.current.dragTo('a', 1, 1);
        result.current.dragTo('b', 2, 2);
        result.current.dragTo('c', 3, 3);
      });
      await act(async () => {
        await result.current.commitAll();
      });
      expect(saveShotPosition).toHaveBeenCalledTimes(3);
      expect(result.current.saveError).toBe('conflict');
      // 成功した a / c の draft は破棄、conflict の b も破棄 (latestShot 同期のため)
      expect(result.current.drafts.size).toBe(0);
    });
  });

  describe('revert', () => {
    it('original_latitude/longitude がないショットへの revert は no-op', async () => {
      const revertShotPosition: RevertShotPosition = vi.fn(async (): Promise<CommitResult> => ({ ok: true }));
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a', original_latitude: null, original_longitude: null })],
          saveShotPosition: vi.fn(),
          revertShotPosition,
        }),
      );
      await act(async () => {
        await result.current.revert('a');
      });
      expect(revertShotPosition).not.toHaveBeenCalled();
    });

    it('成功時: 当該 shot の draft 破棄 + shots に最新値反映', async () => {
      const latestShot = makeShot({ id: 'a', latitude: 30.0, longitude: 130.0, position_revision: 5 });
      const revertShotPosition: RevertShotPosition = vi.fn(async (): Promise<CommitResult> => ({
        ok: true,
        latestShot,
      }));
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [
            makeShot({
              id: 'a',
              original_latitude: 30.0,
              original_longitude: 130.0,
              latitude: 35.0,
              longitude: 135.0,
            }),
          ],
          saveShotPosition: vi.fn(),
          revertShotPosition,
        }),
      );
      act(() => result.current.dragTo('a', 36.0, 136.0));
      await act(async () => {
        await result.current.revert('a');
      });
      expect(revertShotPosition).toHaveBeenCalledTimes(1);
      expect(result.current.drafts.size).toBe(0);
      expect(result.current.shots[0].latitude).toBe(30.0);
    });
  });

  describe('shots props 同期', () => {
    it('props.shots 変化で内部 shots を再初期化 + drafts/selection をクリア', () => {
      const { result, rerender } = renderHook(
        ({ shots }) =>
          useMultiShotEdit({
            shots,
            saveShotPosition: vi.fn(),
            revertShotPosition: vi.fn(),
          }),
        { initialProps: { shots: [makeShot({ id: 'a' })] } },
      );
      act(() => {
        result.current.select('a');
        result.current.dragTo('a', 1, 1);
      });
      expect(result.current.drafts.size).toBe(1);
      expect(result.current.selectedShotId).toBe('a');

      // shots set を変更（ホール切替シミュレーション）
      rerender({ shots: [makeShot({ id: 'b', shot_number: 1 })] });

      expect(result.current.drafts.size).toBe(0);
      expect(result.current.selectedShotId).toBe(null);
      expect(result.current.shots[0].id).toBe('b');
    });

    it('syncShot で個別 shot を最新値に同期', () => {
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [makeShot({ id: 'a', latitude: 35.0 })],
          saveShotPosition: vi.fn(),
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => {
        result.current.syncShot(makeShot({ id: 'a', latitude: 40.0, position_revision: 9 }));
      });
      expect(result.current.shots[0].latitude).toBe(40.0);
      expect(result.current.shots[0].position_revision).toBe(9);
    });
  });

  describe('未保存ショットの shotKey 衝突回避 (PR3 C1)', () => {
    it('shotKey: 保存済みは shot.id、未保存は new:hole:shot_number を返す', () => {
      expect(shotKey(makeShot({ id: 'abc', hole_number: 1, shot_number: 1 }))).toBe('abc');
      expect(shotKey(makeShot({ id: '', hole_number: 5, shot_number: 3 }))).toBe('new:5:3');
    });

    it('同一ホールに未保存ショットが複数あっても select/dragTo/commit が独立に動く', async () => {
      const saveShotPosition: SaveShotPosition = vi.fn(async ({ shot, draft }): Promise<CommitResult> => ({
        ok: true,
        // 未保存ショットの form 経路は合成 latestShot を返す前提
        latestShot: { ...shot, latitude: draft.lat, longitude: draft.lng, gps_source: draft.source },
      }));
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [
            makeShot({ id: '', hole_number: 1, shot_number: 1 }),
            makeShot({ id: '', hole_number: 1, shot_number: 2 }),
            makeShot({ id: '', hole_number: 1, shot_number: 3 }),
          ],
          saveShotPosition,
          revertShotPosition: vi.fn(),
        }),
      );
      // 各未保存ショットに個別の draft を設定
      act(() => {
        result.current.dragTo('new:1:1', 10, 10);
        result.current.dragTo('new:1:2', 20, 20);
        result.current.dragTo('new:1:3', 30, 30);
      });
      expect(result.current.drafts.size).toBe(3);
      expect(result.current.drafts.get('new:1:1')?.lat).toBe(10);
      expect(result.current.drafts.get('new:1:2')?.lat).toBe(20);
      expect(result.current.drafts.get('new:1:3')?.lat).toBe(30);

      // 2 番目だけ commit
      await act(async () => {
        await result.current.commit('new:1:2');
      });
      // 2 番目だけ saveShotPosition 呼ばれて draft が消える、他は維持
      expect(saveShotPosition).toHaveBeenCalledTimes(1);
      expect(saveShotPosition).toHaveBeenCalledWith(expect.objectContaining({
        shot: expect.objectContaining({ shot_number: 2 }),
        draft: expect.objectContaining({ lat: 20, lng: 20 }),
      }));
      expect(result.current.drafts.has('new:1:2')).toBe(false);
      expect(result.current.drafts.size).toBe(2);
      // commit 成功で内部 shots の対応ショットが更新される
      const shot2 = result.current.shots.find((s) => s.shot_number === 2);
      expect(shot2?.latitude).toBe(20);
      expect(shot2?.longitude).toBe(20);
    });

    it('select の toggle が shotKey 単位で独立 (未保存ショット 3 件)', () => {
      const { result } = renderHook(() =>
        useMultiShotEdit({
          shots: [
            makeShot({ id: '', hole_number: 1, shot_number: 1 }),
            makeShot({ id: '', hole_number: 1, shot_number: 2 }),
          ],
          saveShotPosition: vi.fn(),
          revertShotPosition: vi.fn(),
        }),
      );
      act(() => result.current.select('new:1:1'));
      expect(result.current.selectedShotId).toBe('new:1:1');
      act(() => result.current.select('new:1:2'));
      expect(result.current.selectedShotId).toBe('new:1:2');
      // 同じ key を再選択で解除
      act(() => result.current.select('new:1:2'));
      expect(result.current.selectedShotId).toBe(null);
    });
  });

  describe('Strict Mode 安全性', () => {
    it('Strict Mode 下で dragTo を 1 回呼んでも draft は 1 件のみ', () => {
      const { result } = renderHook(
        () =>
          useMultiShotEdit({
            shots: [makeShot({ id: 'a' })],
            saveShotPosition: vi.fn(),
            revertShotPosition: vi.fn(),
          }),
        { wrapper: StrictMode },
      );
      act(() => result.current.dragTo('a', 1, 1));
      expect(result.current.drafts.size).toBe(1);
      const draft = result.current.drafts.get('a');
      expect(draft?.lat).toBe(1);
    });

    it('Strict Mode 下で commit を呼んでも saveShotPosition は 1 回のみ', async () => {
      const saveShotPosition: SaveShotPosition = vi.fn(async (): Promise<CommitResult> => ({ ok: true }));
      const { result } = renderHook(
        () =>
          useMultiShotEdit({
            shots: [makeShot({ id: 'a' })],
            saveShotPosition,
            revertShotPosition: vi.fn(),
          }),
        { wrapper: StrictMode },
      );
      act(() => result.current.dragTo('a', 1, 1));
      await act(async () => {
        await result.current.commit('a');
      });
      expect(saveShotPosition).toHaveBeenCalledTimes(1);
    });
  });
});
