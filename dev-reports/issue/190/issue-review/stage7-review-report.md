# Issue #190 レビューレポート

**レビュー日**: 2026-02-08
**フォーカス**: 影響範囲レビュー（Impact Scope）
**イテレーション**: 2回目（Stage 7）
**前回レビュー**: Stage 3（影響範囲レビュー 1回目）

---

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 0 |
| Should Fix | 2 |
| Nice to Have | 3 |

### Stage 3 指摘事項の反映状況

| ID | カテゴリ | ステータス | 反映Stage |
|----|---------|-----------|-----------|
| MF-1 | sync/route.ts 未記載 | **解決済** | Stage 4 |
| MF-2 | 復活UI/API 未特定 | **解決済** | Stage 4 + 6 |
| SF-1 | 依存関係変更 未記載 | **解決済** | Stage 4 |
| SF-2 | テスト計画不十分 | **解決済** | Stage 4 + 6 |
| SF-3 | 破壊的変更 未分析 | **解決済** | Stage 4 |
| NTH-1 | CLAUDE.md 未記載 | **解決済** | Stage 4 |
| NTH-2 | api-client.ts 未記載 | **解決済** | Stage 4 + 6 |

**総評**: Stage 3 で指摘した 7 件全てが適切に反映されている。変更対象ファイル一覧は 5 ファイルから 9 ファイルに拡充され、テスト計画は 3 項目から 13 項目に大幅改善された。破壊的変更の分析、依存関係の変更、パス正規化方針などのセクションも新設されており、影響範囲の網羅性は大きく向上している。ただし、Stage 5-6 で追加された変更（パス正規化方針、復活API、除外リポジトリ一覧API）により新たな影響箇所が生じており、Should Fix 2件と Nice to Have 3件の追加指摘がある。

---

## Should Fix（推奨対応）

### SF-1: scan/route.ts が影響範囲に含まれていない

**カテゴリ**: 影響ファイル
**場所**: ## 影響範囲 - 変更対象ファイル テーブル / ## 関連コンポーネント

**問題**:
`src/app/api/repositories/scan/route.ts` が影響範囲の変更対象ファイル一覧にも関連コンポーネントにも記載されていない。scan/route.ts は `scanWorktrees()` と `syncWorktreesToDB()` を呼び出しており（lines 9, 39, 50）、`syncWorktreesToDB()` のシグネチャや動作が除外ロジック追加で変更される場合に影響を受ける。

特に以下の設計判断が未定義:
- scan API で個別に追加されたリポジトリが `repositories` テーブルに登録されるかどうか
- scan は環境変数ベースではなくユーザーが手動でパスを指定するフローであるため、環境変数リポジトリとは異なる管理方針が必要か

**証拠**:
`src/app/api/repositories/scan/route.ts` (lines 9, 39, 50):
```typescript
import { scanWorktrees, syncWorktreesToDB } from '@/lib/worktrees';
// ...
const worktrees = await scanWorktrees(normalizedPath);  // line 39
syncWorktreesToDB(db, worktrees);                        // line 50
```

scan/route.ts は `repositories` テーブルへの登録を行わず、`worktrees` テーブルのみに書き込む。Issue の対策案では sync/route.ts での自動登録のみ記載されており、scan/route.ts 経由のフローは未定義。

**推奨対応**:
scan/route.ts を少なくとも関連コンポーネントに追加し、以下の設計判断を技術的留意事項に追記すべき:
1. scan API 経由で追加されたリポジトリも `repositories` テーブルに登録するか（`is_env_managed=0`, `clone_source='local'` で登録）
2. scan API で追加したリポジトリを削除した場合の除外管理方針
3. `syncWorktreesToDB()` の除外ロジックが scan API 経由のフローにも影響するかどうか

---

### SF-2: 復活APIのエラーハンドリングテストが不足

**カテゴリ**: テスト範囲
**場所**: ## 実装タスク - テスト セクション

**問題**:
復活API（`PUT /api/repositories/restore`）内で `syncWorktreesToDB()` を自動実行する設計だが、この処理は非同期の `scanWorktrees()` を含む。復活API のエラーハンドリングに関するテストケースが実装タスクに含まれていない。

具体的な懸念:
1. 復活対象リポジトリのパスがディスク上に存在しない場合（リポジトリが物理削除された後に復活を試行するケース）
2. `scanWorktrees()` がタイムアウトする場合
3. `enabled=1` 更新は成功するが `syncWorktreesToDB()` で 0 件の worktree が見つかった場合の不整合

復活API は `enabled=1` 更新 + sync の2段階処理であり、sync 失敗時に `enabled` が 1 に戻ったまま worktrees が復元されない状態が生じる可能性がある。

**証拠**:
- 対策案の実装方針4: 「復活時は repositories.enabled = 1 に更新後、復活API内で自動的に syncWorktreesToDB() を実行」
- `syncWorktreesToDB()` (`worktrees.ts` line 267): `worktrees.length === 0` の場合 early return する設計
- `scanWorktrees()` (lines 155-211): ディレクトリが存在しない場合やgitリポジトリでない場合に空配列を返すか例外をスロー

**推奨対応**:
以下のエッジケーステストを実装タスクに追加すべき:
1. 復活対象リポジトリが物理的に存在しない場合のエラーハンドリング（`enabled=0` にロールバックするか warning を返すかの方針決定を含む）
2. `repositories` テーブルに該当パスが存在しない場合の 404/400 レスポンス
3. `enabled=1` 更新は成功するが `syncWorktreesToDB()` で 0 件の worktree が見つかった場合の挙動

---

## Nice to Have（あれば良い）

### NTH-1: clone-manager.ts への間接的影響

**カテゴリ**: 影響ファイル
**場所**: ## 影響範囲 - 関連コンポーネント

**問題**:
`clone-manager.ts` の `onCloneSuccess()` (line 461) が `createRepository()` を事前チェックなしで呼び出す。Issue #190 の変更で DELETE が物理削除から `enabled=0` 更新に変わることで、削除済みリポジトリと同一パスへの再クローン時に `repositories.path` の UNIQUE 制約違反でエラーが発生する可能性がある。

**証拠**:
```typescript
// src/lib/clone-manager.ts lines 461-467
const repo = createRepository(this.db, {
  name: path.basename(targetPath),
  path: targetPath,
  cloneUrl,
  normalizedCloneUrl: job.normalizedCloneUrl,
  cloneSource: cloneSource as 'local' | 'https' | 'ssh',
});
```
`getRepositoryByPath()` による事前チェックなし。`db-migrations.ts` line 573: `path TEXT NOT NULL UNIQUE` 制約。

**推奨対応**:
clone-manager.ts を関連コンポーネントに追加し、再クローン時の UNIQUE 制約違反リスクを技術的留意事項に追記すると良い。本Issue での対応は不要で、フォローアップIssue候補として認識にとどめる。

---

### NTH-2: sync/route.ts -> db-repository.ts の依存関係変更が未記載

**カテゴリ**: 依存関係
**場所**: ## 影響範囲 - 依存関係の変更 テーブル

**問題**:
sync/route.ts への変更（環境変数リポジトリの自動登録、`enabled=0` 除外フィルタリング）により、sync/route.ts が db-repository.ts に新規依存することになるが、「依存関係の変更」テーブルに `sync/route.ts -> db-repository.ts` の行が記載されていない。

**証拠**:
依存関係の変更テーブルには `worktrees.ts -> db-repository.ts` のみ記載。sync/route.ts の現在の import は `@/lib/worktrees` のみ（line 8）。

**推奨対応**:
sync/route.ts で db-repository.ts の関数を直接呼び出す場合は依存関係テーブルに追記する。worktrees.ts 経由で間接的に呼び出す方式の場合はその旨を技術的留意事項に明記する。

---

### NTH-3: E2Eテストの記載がない

**カテゴリ**: テスト範囲
**場所**: ## 実装タスク - テスト セクション

**問題**:
WorktreeList.tsx に除外リポジトリ一覧セクション（折りたたみ形式、「再登録」ボタン）が追加されるが、E2Eテストが実装タスクに含まれていない。現在のプロジェクトではUIコンポーネントのユニットテストは存在しない（Vitest でのユニット/統合テストが中心）ため、プロジェクトの慣習上UIテストを必須としない判断は妥当だが、E2Eテストでフルシナリオの検証があると影響範囲のカバレッジが向上する。

**推奨対応**:
テストセクションに「E2Eテスト: 削除→除外リポジトリ一覧表示→復活→Sync All で正常表示のフルシナリオ」を Nice to Have として追記する。

---

## Stage 3 からの改善点

Issue #190 は Stage 3 以降、以下の観点で大きく改善された:

1. **変更対象ファイルの網羅性**: 5 ファイル -> 9 ファイル（`sync/route.ts`, `excluded/route.ts` (新), `restore/route.ts` (新), `api-client.ts` 追加）
2. **依存関係の変更**: 新セクションとして追加。`worktrees.ts -> db-repository.ts` の新規依存が明記
3. **破壊的変更の分析**: 新セクションとして追加。DELETE API の動作変更が文書化され、意図的な破壊的変更であることが明記
4. **テスト計画**: 3 項目 -> 13 項目。自動登録、冪等性、パス正規化、エンドポイント統合テストなどが追加
5. **パス正規化方針**: 新セクションとして詳細に記載。`path.resolve()` による正規化統一、UNIQUE 制約対策
6. **復活API設計**: `PUT /api/repositories/[id]/restore` から `PUT /api/repositories/restore`（パスベース）に改善。既存 API 設計スタイルとの統一
7. **除外リポジトリ一覧API**: `GET /api/repositories/excluded` が新設。復活UIのデータソースが確保
8. **復活時の自動sync**: 復活API内で `syncWorktreesToDB()` を自動実行する方針が明記

---

## 参照ファイル

### コード
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/app/api/repositories/scan/route.ts`: scan API - syncWorktreesToDB() 呼び出しあり、影響範囲に未記載
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/app/api/repositories/sync/route.ts`: sync API - 環境変数リポジトリ自動登録と除外フィルタリング追加対象
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/clone-manager.ts`: clone-manager - createRepository() 呼び出し、UNIQUE 制約違反リスク
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/worktrees.ts`: worktrees - syncWorktreesToDB() 除外ロジック追加対象
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/db-repository.ts`: db-repository - enabled 管理の基盤
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/app/api/repositories/route.ts`: DELETE API - enabled=0 更新追加対象
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/components/worktree/WorktreeList.tsx`: 除外リポジトリ一覧セクション追加対象
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/api-client.ts`: repositoryApi 拡張対象
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/__tests__/worktrees-sync.test.ts`: 既存テスト - 除外リスト連携テスト追加対象
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/db-migrations.ts`: repositories テーブル定義（Migration #14）

### ドキュメント
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/CLAUDE.md`: 実装完了後のドキュメント更新対象
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/dev-reports/issue/190/issue-review/stage3-review-result.json`: Stage 3 影響範囲レビュー（1回目）結果
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/dev-reports/issue/190/issue-review/stage6-apply-result.json`: Stage 6 指摘反映結果
