# Issue #190 影響範囲レビューレポート

**レビュー日**: 2026-02-08
**フォーカス**: 影響範囲レビュー
**ステージ**: 3（影響範囲レビュー 1回目）
**前提**: Stage 1（通常レビュー）、Stage 2（指摘反映）完了済み

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 2 |
| Should Fix | 3 |
| Nice to Have | 2 |

---

## Must Fix（必須対応）

### MF-1: sync/route.ts が変更対象ファイル一覧に含まれていない

**カテゴリ**: 影響ファイル
**場所**: ## 影響範囲 - 変更対象ファイル テーブル

**問題**:
変更対象ファイル一覧に `src/app/api/repositories/sync/route.ts` が含まれていない。Sync All API は `syncWorktreesToDB()` を呼び出す前に `getRepositoryPaths()` で取得したパスをそのまま `scanMultipleRepositories()` に渡しており、除外リポジトリのフィルタリングをどの層で行うかが未定義である。

対策案では `syncWorktreesToDB()` 内部での除外を記載しているが、環境変数ベースリポジトリの `repositories` テーブルへの自動登録（未登録の場合 `enabled=1` で登録）はスキャン前に実行する必要がある。この処理は `sync/route.ts` 側で行うのが自然であり、このファイルの変更は不可避。

**証拠**:
```typescript
// src/app/api/repositories/sync/route.ts (lines 13-27)
const repositoryPaths = getRepositoryPaths();
const allWorktrees = await scanMultipleRepositories(repositoryPaths);
const db = getDbInstance();
syncWorktreesToDB(db, allWorktrees);
```
`getRepositoryPaths()` の結果がフィルタリングされずにそのまま使用されている。

**推奨対応**:
`src/app/api/repositories/sync/route.ts` を変更対象ファイル一覧に追加し、以下を明記すべき:
1. 環境変数ベースリポジトリの `repositories` テーブルへの自動登録ロジック追加
2. `enabled=0` のリポジトリパスのスキャン除外ロジックの呼び出し位置（`sync/route.ts` で除外してから `scanMultipleRepositories()` に渡すか、`syncWorktreesToDB()` 内で除外するか）の設計判断

---

### MF-2: 復活UIと復活APIの変更対象ファイルが未特定

**カテゴリ**: 影響ファイル
**場所**: ## 影響範囲 - 変更対象ファイル テーブル / ## 実装タスク

**問題**:
実装タスクに「除外リポジトリ復活UI: 除外リポジトリ一覧表示 + 再登録ボタン」と記載されているが、以下が未特定:
- 具体的にどのコンポーネントに配置するのか（`WorktreeList.tsx` に追加か、新規コンポーネント作成か）
- `restoreRepository()` を呼び出すAPIエンドポイント（新規ルート作成か、既存ルートへの追加か）
- フロントエンド側のAPIクライアント関数（`repositoryApi.restore()` 等）

これらが影響範囲の変更対象ファイル一覧に記載されていない。

**証拠**:
変更対象ファイル一覧の `WorktreeList.tsx` の変更内容は「削除確認ダイアログの警告メッセージ更新」のみ。復活UI・復活API・APIクライアントの記載がない。

**推奨対応**:
復活UIの実装方針を決定し、以下を変更対象ファイル一覧に追加すべき:
- 復活UIコンポーネント（新規 or 既存拡張）
- 復活APIエンドポイント（例: `PUT /api/repositories/[id]/restore` or `PATCH /api/repositories/[id]`）
- `src/lib/api-client.ts`（`repositoryApi.restore()` メソッド追加）

---

## Should Fix（推奨対応）

### SF-1: worktrees.ts から db-repository.ts への新規依存追加

**カテゴリ**: 依存関係
**場所**: ## 対策案 - 実装方針 1番目

**問題**:
現在 `worktrees.ts` は `db.ts` のみに依存しており、`db-repository.ts` には依存していない。`syncWorktreesToDB()` で `getExcludedRepositoryPaths()` を呼び出すには `db-repository.ts` への新しい import が必要となり、モジュール間の依存関係が変化する。

**現在の依存方向**:
```
worktrees.ts --> db.ts
```

**変更後の依存方向**:
```
worktrees.ts --> db.ts
             --> db-repository.ts (NEW)
```

**証拠**:
```typescript
// src/lib/worktrees.ts (line 11) - 現在の import
import { upsertWorktree, getWorktreeIdsByRepository, deleteWorktreesByIds } from './db';
// db-repository.ts への import は存在しない
```

**推奨対応**:
影響範囲セクションの依存関係変更として明記すべき。循環依存にはならないが、ビルド・テスト影響を認識する必要がある。同様に `sync/route.ts` から `db-repository.ts` への新規依存も発生する。

---

### SF-2: テスト計画の不足

**カテゴリ**: テスト範囲
**場所**: ## 実装タスク - テスト関連項目

**問題**:
以下の重要なテストケースが実装タスクに含まれていない:

1. **自動登録の冪等性テスト**: 環境変数リポジトリが `repositories` テーブルに `enabled=1` で自動登録されること、及び既に登録済みの場合に重複登録されないこと
2. **パス正規化テスト**: `path.resolve()` による正規化後のパスで `repositories.path` とのマッチングが正常動作すること（末尾スラッシュの有無、シンボリックリンク解決後の差異）
3. **DELETE API 統合テスト**: `repositories.enabled` が 0 に更新されること
4. **復活 API テスト**: `restoreRepository()` が `enabled=1` に更新し、再 sync で復活すること
5. **CM_ROOT_DIR 設定時の除外テスト**: 受入条件に含まれているがテストタスクに未反映

**証拠**:
実装タスクのテスト項目は以下の3つのみ:
- 複数リポジトリ削除+Sync Allシナリオ
- 除外リポジトリ復活の動作検証
- worktrees-sync.test.ts に除外リスト連携テスト追加

**推奨対応**:
上記5つのテストケースを実装タスクに追加すべき。特にパス正規化テストは、`scanWorktrees()` が `path.resolve(rootDir)` で正規化したパスを `repositoryPath` に設定する（`worktrees.ts` line 166）一方、`repositories` テーブルの `path` カラムにどのような形式で格納されるかが実装次第であるため、不一致のリスクがある。

---

### SF-3: DELETE API の挙動変更が破壊的変更に該当する可能性

**カテゴリ**: 破壊的変更
**場所**: ## 影響範囲 セクション

**問題**:
DELETE `/api/repositories` の挙動が以下のように変化する:

| 項目 | 変更前 | 変更後 |
|------|--------|--------|
| worktrees削除 | 物理削除 | 物理削除（変更なし） |
| repositories操作 | なし | enabled=0に更新 |
| Sync All後の状態 | 復活する | 復活しない |
| 削除の意味 | 一時的（Sync Allで復活） | 永続的除外（復活UIで解除が必要） |

APIの外部インターフェース（リクエスト/レスポンス形式）は変わらないが、副作用の意味が変化する。

**証拠**:
```typescript
// src/app/api/repositories/route.ts (lines 132-141)
const response = {
  success: true,
  deletedWorktreeCount: deletedCount,
  deletedWorktreeIds: worktreeIds,
};
// 除外状態に関する情報は含まれていない
```

**推奨対応**:
影響範囲セクションに破壊的変更の分析を追加すべき:
1. DELETE API の副作用変更の明記
2. 既存ユーザーへの影響（削除後 Sync All で復活する動作を前提としたワークフローの破壊）
3. APIレスポンスに `excluded: true` 等のフラグを追加するかの検討

---

## Nice to Have（あれば良い）

### NTH-1: CLAUDE.md の更新が影響範囲に含まれていない

**カテゴリ**: ドキュメント更新
**場所**: ## 影響範囲 - 変更対象ファイル テーブル

**問題**:
Issue #190 の実装完了後、CLAUDE.md の「最近の実装機能」セクションに追記が必要だが、変更対象ファイル一覧に含まれていない。

**推奨対応**:
CLAUDE.md を変更対象ファイルまたは関連ドキュメントとして記載する。

---

### NTH-2: api-client.ts の型定義拡張の検討

**カテゴリ**: 影響ファイル
**場所**: ## 影響範囲 - 関連コンポーネント セクション

**問題**:
`src/lib/api-client.ts` の `repositoryApi.delete()` のレスポンス型 `DeleteRepositoryResponse` が、除外リスト方式への変更後もそのまま使用可能かの確認が影響範囲に含まれていない。復活UIを実装する場合には `repositoryApi` に `restore` メソッドの追加も必要。

**推奨対応**:
`src/lib/api-client.ts` を関連コンポーネントとして追記し、型定義拡張と新規メソッド追加の要否を検討事項として記載する。

---

## 影響範囲サマリー

### 変更対象ファイル 完全版

| ファイル | Issueに記載 | 変更内容 |
|---------|:----------:|---------|
| `src/lib/worktrees.ts` | Yes | `syncWorktreesToDB()` に除外リスト参照ロジック追加、db-repository.ts への新規import |
| `src/lib/db-repository.ts` | Yes | `getExcludedRepositoryPaths()`, `restoreRepository()` 追加 |
| `src/app/api/repositories/route.ts` | Yes | DELETE時に `repositories.enabled = 0` 更新追加 |
| `src/components/worktree/WorktreeList.tsx` | Yes | 削除確認ダイアログ警告メッセージ更新 + 復活UI追加（候補） |
| `src/lib/__tests__/worktrees-sync.test.ts` | Yes | 除外リスト連携テスト追加 |
| `src/app/api/repositories/sync/route.ts` | **No** | 環境変数リポジトリの自動登録、除外フィルタリング |
| 復活UIコンポーネント（新規/拡張） | **No** | 除外リポジトリ一覧 + 再登録ボタン |
| 復活APIエンドポイント（新規/拡張） | **No** | `restoreRepository()` 呼び出し |
| `src/lib/api-client.ts` | **No** | `repositoryApi.restore()` 追加、型定義拡張 |

### 依存関係の変化

```
[変更前]
worktrees.ts -----> db.ts
sync/route.ts ---> worktrees.ts

[変更後]
worktrees.ts -----> db.ts
             -----> db-repository.ts (NEW)
sync/route.ts ---> worktrees.ts
              ---> db-repository.ts (NEW)
```

### DBスキーマ影響

- 新規マイグレーション: **不要**（`repositories.enabled` カラムは Migration #14 で追加済み）
- `repositories` テーブル: クローン機能専用 -> sync フローでも使用されるように拡張
- `worktrees` テーブル: 変更なし

---

## 参照ファイル

### コード
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/app/api/repositories/sync/route.ts`: Sync All API（変更対象ファイル一覧に未記載）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/worktrees.ts`: getRepositoryPaths(), syncWorktreesToDB()
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/db-repository.ts`: Repository CRUD、enabledカラム操作
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/app/api/repositories/route.ts`: DELETE API
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/components/worktree/WorktreeList.tsx`: 削除確認ダイアログ
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/api-client.ts`: APIクライアント型定義
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/__tests__/worktrees-sync.test.ts`: 既存syncテスト
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/clone-manager.ts`: onCloneSuccess() での createRepository() 呼び出し
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/session-cleanup.ts`: セッションクリーンアップ（影響なし）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/db-migrations.ts`: Migration #14 repositoriesテーブル定義

### ドキュメント
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/CLAUDE.md`: プロジェクトガイドライン（更新対象）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/dev-reports/issue/190/issue-review/hypothesis-verification.md`: 仮説検証レポート
