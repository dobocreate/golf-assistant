// ============================================================================
// src/lib/db/__tests__/neon.test.ts
// Phase 1 D-3 で骨組み作成、Phase 3-4 で実装 (Section 9.2 / 9.3)
//
// 目的 (Round 4 Major 2 反映): db helper の誤用検知を機械化する。
//
// 必要なテストケース:
//   1. db.read 内で UPDATE → `permission denied for table xxx` で失敗 (assertion)
//   2. db.userRead 内で INSERT → `cannot execute INSERT in a read-only transaction`
//      で失敗 (assertion)
//   3. db.transaction 経由でも WRITE_FREEZE_ACTIVE=true なら WriteFreezeActiveError
//   4. withResolvedUser を経由せずに db.userRead / db.transaction を呼ぶと
//      UserContextMissingError
//   5. Clerk userId → profiles.user_id lookup の正常系 (Section 4.0)
//   6. Clerk userId 不在時に ProfileNotFoundError
//
// 実行環境: Neon の staging branch (D-5) に接続。CI で並列実行可能なように
// transaction wrap でテスト分離する。
//
// Phase 1 では import 関係のみ scaffolding し、実装は Phase 5 で行う。
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  db,
  withResolvedUser,
  WriteFreezeActiveError,
  UserContextMissingError,
  ProfileNotFoundError,
} from '../neon';

describe.skip('db helpers (Phase 5 で実装)', () => {
  describe('db.read', () => {
    it('SELECT only — UPDATE attempt fails with permission denied', async () => {
      // TODO (Phase 5): db.read 内で UPDATE clubs SET ... を試行し、
      //                 permission denied for table clubs を assert
    });
  });

  describe('db.userRead', () => {
    it('rejects writes with read-only transaction error', async () => {
      // TODO (Phase 5): withResolvedUser(...) 配下で INSERT を試行し、
      //                 cannot execute INSERT in a read-only transaction を assert
    });

    it('throws UserContextMissingError when called without withResolvedUser', async () => {
      // TODO (Phase 5)
    });
  });

  describe('db.transaction', () => {
    it('throws WriteFreezeActiveError when WRITE_FREEZE_ACTIVE=true', async () => {
      // TODO (Phase 5): process.env.WRITE_FREEZE_ACTIVE = 'true' を set し、
      //                 db.transaction(...) が WriteFreezeActiveError を throw すること
    });

    it('throws UserContextMissingError when called without withResolvedUser', async () => {
      // TODO (Phase 5)
    });

    it('sets app.current_user_id and commits when user context resolves', async () => {
      // TODO (Phase 5)
    });
  });

  describe('withResolvedUser (Section 4.0)', () => {
    it('resolves clerk_user_id → profiles.user_id via lookupProfileUserId', async () => {
      // TODO (Phase 5)
    });

    it('throws ProfileNotFoundError for unknown clerk_user_id', async () => {
      // TODO (Phase 5)
    });
  });
});
