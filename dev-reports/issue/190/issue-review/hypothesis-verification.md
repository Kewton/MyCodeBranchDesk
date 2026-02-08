# Issue #190 仮説検証レポート

## 検証日時
- 2026-02-08

## 検証結果サマリー

| # | 仮説/主張 | 判定 | 根拠 |
|---|----------|------|------|
| 1 | `syncWorktreesToDB()`は環境変数で設定されたパスを毎回スキャンしupsertする | Confirmed | worktrees.ts:262-305で確認 |
| 2 | 削除されたリポジトリを記録・除外する仕組みがない | Confirmed | DB/コード全体を検索し除外機構なし |
| 3 | `WorktreeList.tsx`に環境変数設定リポジトリの削除時警告がある | Confirmed | WorktreeList.tsx:216-244で確認 |
| 4 | 削除時にDBからworktreesが物理削除される | Confirmed | db.ts:1255-1265 `DELETE FROM worktrees WHERE repository_path = ?` |

## 詳細検証

### 仮説 1: syncWorktreesToDB()は環境変数パスを毎回スキャン・upsertする

**Issue内の記述**: 「`syncWorktreesToDB()`は環境変数（`WORKTREE_REPOS`/`CM_ROOT_DIR`）で設定されたパスを毎回スキャンし、見つかったworktreeをDBにupsertする」

**検証手順**:
1. `src/lib/worktrees.ts` の `getRepositoryPaths()` (lines 122-139) を確認
2. `src/lib/worktrees.ts` の `syncWorktreesToDB()` (lines 262-305) を確認
3. `src/app/api/repositories/sync/route.ts` の POST ハンドラを確認

**判定**: Confirmed

**根拠**:
- `getRepositoryPaths()` は `WORKTREE_REPOS`（カンマ区切り）→ `CM_ROOT_DIR`/`MCBD_ROOT_DIR`（フォールバック）の優先順位で環境変数を取得
- `syncWorktreesToDB()` はリポジトリ単位でグループ化→既存IDリスト取得→差分削除→全worktreeをupsert
- Sync All API は `getRepositoryPaths()` → `scanMultipleRepositories()` → `syncWorktreesToDB()` の順で毎回フルスキャン

**Issueへの影響**: 記述は正確。修正不要。

---

### 仮説 2: 削除されたリポジトリを記録・除外する仕組みがない

**Issue内の記述**: 「削除されたリポジトリを記録・除外する仕組みがないため、ディスク上に存在する限り再登録される」

**検証手順**:
1. `src/lib/db.ts` で excluded/ignore 関連のカラム・テーブルを検索
2. `src/lib/db-migrations.ts` で全マイグレーション（v1〜v16）を確認
3. `src/lib/db-repository.ts` で repositories テーブルの enabled フィールドの使用状況を確認

**判定**: Confirmed

**根拠**:
- DB全体に excluded/ignored 関連のカラム・テーブルは存在しない（CURRENT_SCHEMA_VERSION = 16）
- `repositories` テーブルに `enabled` カラムは存在するが、`syncWorktreesToDB()` で参照されていない
- worktrees テーブルにも除外フラグは存在しない

**Issueへの影響**: 記述は正確。修正不要。

**補足**: `repositories.enabled` カラムがsync時に未使用であることは、対策案の設計に影響する可能性がある（既存カラム活用 vs 新テーブル追加の選択肢）

---

### 仮説 3: WorktreeList.tsxに環境変数設定リポジトリの削除時に警告表示がある

**Issue内の記述**: 「`WorktreeList.tsx`に環境変数設定リポジトリの削除時に警告表示があるが、復活を防ぐメカニズムは未実装」

**検証手順**:
1. `src/components/worktree/WorktreeList.tsx` の削除確認ダイアログを確認

**判定**: Confirmed

**根拠**:
- WorktreeList.tsx lines 216-244 に以下の警告メッセージが確認された:
  ```
  WARNING: This repository is configured in environment variable (WORKTREE_REPOS).
  It will be re-registered when you run "Sync All".
  To permanently remove it, also update the environment variable.
  ```
- `isInEnvVar(repositoryPath)` で `NEXT_PUBLIC_WORKTREE_REPOS` 環境変数にパスが含まれているか判定
- 警告は表示のみで、復活を防止する仕組みは実装されていない

**Issueへの影響**: 記述は正確。修正不要。

---

### 仮説 4: 削除時にDBからworktreesが物理削除される

**Issue内の記述**: 「ユーザーがUIからrepo1を削除 → DBからrepo1のworktreesが物理削除される」

**検証手順**:
1. `src/app/api/repositories/route.ts` の DELETE ハンドラを確認
2. `src/lib/db.ts` の `deleteRepositoryWorktrees()` を確認

**判定**: Confirmed

**根拠**:
- `deleteRepositoryWorktrees(db, repositoryPath)` は `DELETE FROM worktrees WHERE repository_path = ?` を実行（物理削除）
- CASCADE により関連データ（chat_messages, session_states, worktree_memos）も物理削除
- 論理削除（soft delete）の仕組みは実装されていない

**Issueへの影響**: 記述は正確。修正不要。

---

## Stage 1レビューへの申し送り事項

- 全4仮説がConfirmedであり、Issue記載の根本原因分析は正確
- `repositories.enabled` カラムが sync 時に未使用である点は、対策案の設計検討時に考慮すべき（既存カラム活用の可能性）
- Issueの対策案は `excluded_repositories` テーブル新設を提案しているが、`repositories` テーブルの `enabled` カラムとの関係が未整理
- 処理フローの記述（T1〜T3）は正確
