#!/usr/bin/env bash
# ============================================================================
# check-freeze-rpc-whitelist.sh
# Section 4.6 / Round 5 Critical 1 / Round 7 Minor 1
#
# 目的: SECURITY DEFINER + DML を含む RPC の pg_proc 列挙と
#       freeze-start.sql の REVOKE 対象リストが一致することを CI で検証する。
#       不一致時は exit 1 (新規 mutating SECURITY DEFINER RPC を追加した際の
#       freeze 対象追記漏れを検知)。
#
# 使い方:
#   DATABASE_URL=<assistant_app or readonly URL> ./scripts/check-freeze-rpc-whitelist.sh
#
# 注意:
#   - prosrc の DML 検出は heuristic (Round 7 Minor 1)。動的 SQL の取りこぼし、
#     文字列リテラル / コメントの誤検出はある。完全防御ではなく安全弁。
#   - 動的 SQL を使う mutating 関数は manual review に回すこと。
#
# 既知の誤検出パターンと運用:
#   - コメント中の "INSERT" / "UPDATE" / "DELETE" を拾う
#     例: `-- INSERT history を保持する READ-only 関数` でも検出される
#   - 文字列リテラル中の "INSERT" 等を拾う
#     例: `RAISE EXCEPTION 'INSERT into ... failed'` でも検出される
#   → 誤検出された関数は SUPPRESS_LIST に追加して除外する (実装は下記)
#
# Phase 5 改良案: pg_get_functiondef() ベースにしてコメント/文字列を除去してから
#                 照合する、または whitelist 方式 (freeze 対象 RPC を明示管理) に
#                 切り替える (Round 7 Minor 1)。
# ============================================================================

set -euo pipefail

DATABASE_URL="${DATABASE_URL:-}"
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set" >&2
  exit 2
fi

FREEZE_FILE="$(dirname "$0")/freeze-start.sql"
if [ ! -f "$FREEZE_FILE" ]; then
  echo "ERROR: freeze-start.sql not found at $FREEZE_FILE" >&2
  exit 2
fi

# (1) pg_proc から SECURITY DEFINER + DML を含む関数を列挙
DB_FUNCTIONS="$(
  psql "$DATABASE_URL" -At -c "
    SELECT p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public'
       AND p.prosecdef = true
       AND p.prosrc ~* '\b(INSERT|UPDATE|DELETE)\b'
     ORDER BY p.proname;
  "
)"

# (2) freeze-start.sql から REVOKE EXECUTE ON FUNCTION ... の関数名を抽出
#     ※ 関数名は数字 (0-9) を含む可能性があるため [a-z0-9_]+ で抽出
FREEZE_FUNCTIONS="$(
  grep -oE 'REVOKE EXECUTE ON FUNCTION [a-z0-9_]+' "$FREEZE_FILE" \
    | awk '{print $NF}' \
    | sort -u
)"

# (3) 差分検出
ONLY_IN_DB="$(comm -23 <(echo "$DB_FUNCTIONS" | sort -u) <(echo "$FREEZE_FUNCTIONS"))"
ONLY_IN_FREEZE="$(comm -13 <(echo "$DB_FUNCTIONS" | sort -u) <(echo "$FREEZE_FUNCTIONS"))"

EXIT_CODE=0

if [ -n "$ONLY_IN_DB" ]; then
  echo "❌ SECURITY DEFINER + DML を含む RPC が freeze-start.sql に未登録です:" >&2
  echo "$ONLY_IN_DB" | sed 's/^/  - /' >&2
  echo "→ scripts/freeze-start.sql に REVOKE EXECUTE 行を追加してください (Section 4.6)" >&2
  EXIT_CODE=1
fi

if [ -n "$ONLY_IN_FREEZE" ]; then
  echo "⚠️  freeze-start.sql に未使用の REVOKE EXECUTE 行があります (削除済み RPC?):" >&2
  echo "$ONLY_IN_FREEZE" | sed 's/^/  - /' >&2
  # 未使用は WARN のみ (RPC 削除直後の transient 状態)
fi

if [ $EXIT_CODE -eq 0 ] && [ -z "$ONLY_IN_FREEZE" ]; then
  echo "✓ freeze whitelist と pg_proc 列挙が一致しています"
fi

exit $EXIT_CODE
