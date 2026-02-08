# Issue #190 レビューレポート（Stage 1）

**レビュー日**: 2026-02-08
**フォーカス**: 通常レビュー（整合性・正確性）
**ステージ**: 1回目
**前提**: 仮説検証レポートにて全4仮説がConfirmed済み

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 2 |
| Should Fix | 3 |
| Nice to Have | 2 |

Issue #190の根本原因分析（処理フローT1-T3、既存警告の不十分さ）は正確であり、仮説検証の結果とも一致している。一方、対策案については設計判断が未確定の箇所があり、実装前に解決すべき点がある。

---

## Must Fix（必須対応）

### MF-1: excluded_repositoriesテーブルとrepositories.enabledカラムの関係が未整理

**カテゴリ**: 技術的妥当性
**場所**: 対策案 セクション

**問題**:
対策案では `excluded_repositories` テーブルの新設を提案しているが、既に `repositories` テーブル（Migration #14, Issue #71）に `enabled` カラム（`INTEGER NOT NULL DEFAULT 1`）が存在する。さらに `db-repository.ts` の `updateRepository()` 関数で `enabled` の更新APIも実装済みである。

しかし、この `enabled` カラムは `syncWorktreesToDB()` で一切参照されておらず、現在はクローン機能専用となっている。対策案では既存の `enabled` カラムとの使い分けや競合について言及がなく、実装時に混乱が生じる可能性がある。

**証拠**:
- `src/lib/db-migrations.ts` Migration #14 (line 566-644): `repositories` テーブルに `enabled INTEGER NOT NULL DEFAULT 1`
- `src/lib/db-repository.ts` (line 249-251): `updateRepository()` で `enabled` 更新が可能
- `src/lib/worktrees.ts` `syncWorktreesToDB()` (line 262-305): `repositories` テーブルを参照していない
- `src/app/api/repositories/sync/route.ts`: `repositories` テーブルを参照していない

**推奨対応**:
以下のいずれかの方針を明確化した上でIssueに記載すべき:

**(A) repositories.enabledカラム活用方式**:
- `syncWorktreesToDB()` に `repositories` テーブルの `enabled=false` チェックを追加
- DELETE時に `repositories` テーブルの `enabled` を `false` に更新
- 追加マイグレーション不要（既存スキーマ活用）
- ただし、環境変数ベースのsyncフローと `repositories` テーブル（クローン機能由来）の連携設計が必要

**(B) excluded_repositoriesテーブル新設方式**:
- `repositories.enabled` カラムとのセマンティクスの違いを明記
- `enabled` はクローンリポジトリの有効/無効、`excluded` は環境変数syncからの除外、と定義

**(C) 統合方式**:
- 環境変数ベースのリポジトリも `repositories` テーブルに登録し、`enabled` カラムで管理を統一

---

### MF-2: 除外リスト解除（復活）のユーザーフローが未定義

**カテゴリ**: 完全性
**場所**: 対策案 セクション / 受入条件 セクション

**問題**:
除外リスト方式を導入した場合、ユーザーが誤ってリポジトリを削除した場合や、除外を取り消したい場合の操作方法が一切定義されていない。実装タスクには「追加・取得・削除」のDB操作関数が記載されているが、UIからどのように除外を解除するかのフローが欠落している。

除外が一方通行（不可逆）の場合、ユーザーは環境変数を変更してリポジトリパスを再追加する以外に手段がなく、UXが著しく低下する。

**証拠**:
- 実装タスクに「除外リスト操作関数（追加・取得・削除）」は記載あり
- しかし受入条件に「除外を解除できること」が含まれていない
- UIフローの定義も欠落

**推奨対応**:
1. 除外リスト解除のUIフローを定義（例: Sync All画面に「除外リポジトリ」セクションを追加し、「再登録」ボタンを設置）
2. 受入条件に「除外したリポジトリを再度登録できること」を追加
3. 実装タスクにUI側の変更を追加

---

## Should Fix（推奨対応）

### SF-1: DELETE /api/repositories とrepositories テーブルの操作方針が未定義

**カテゴリ**: 整合性
**場所**: 実装タスク セクション

**問題**:
現在の `DELETE /api/repositories` は `deleteRepositoryWorktrees()` で `worktrees` テーブルのみ物理削除し、`repositories` テーブルには操作を行わない。対策案で除外リスト記録を追加する場合、`repositories` テーブルのレコードも合わせてどう扱うかが未定義である。

特に、クローン経由で登録されたリポジトリ（`clone_source='https'/'ssh'`）と環境変数経由のリポジトリで挙動を分けるべきかも検討が必要。

**証拠**:
- `src/app/api/repositories/route.ts` (line 110): `deleteRepositoryWorktrees(db, repositoryPath)` のみ呼び出し
- `repositories` テーブルのレコード操作なし

**推奨対応**:
DELETE /api/repositories の修正詳細として以下を明記:
1. `repositories` テーブルのレコードは削除するか、`enabled=false` に更新するか
2. クローン経由と環境変数経由で挙動を分けるかどうか

---

### SF-2: 対策案の設計方式が二者択一のまま未確定

**カテゴリ**: 明確性
**場所**: 対策案 セクション 1番目の項目

**問題**:
対策案の最初の項目が「excluded_repositories テーブル新設（または worktrees テーブルにフラグ追加）」と記載されており、設計判断が未確定のまま二者択一で提示されている。このまま実装に入ると方針のブレが生じる。

仮説検証レポートでも「repositories.enabled カラムが sync 時に未使用であることは、対策案の設計に影響する可能性がある（既存カラム活用 vs 新テーブル追加の選択肢）」と指摘されており、実際には三者以上の選択肢がある。

**証拠**:
- Issue本文: 「excluded_repositories テーブル新設（または worktrees テーブルにフラグ追加）」
- 仮説検証レポート: 「既存カラム活用の可能性」

**推奨対応**:
設計方針を一つに確定した上でIssueを更新すべき。選択肢の比較表を作成し、トレードオフを明示した上で判断すると良い。

---

### SF-3: WorktreeList.tsxの警告メッセージ更新が実装タスクに未記載

**カテゴリ**: 完全性
**場所**: 影響範囲 - 関連コンポーネント セクション

**問題**:
影響範囲の関連コンポーネントには「既存の警告メッセージ更新の可能性」と曖昧に記載されているが、実装タスクのチェックリストには含まれていない。除外リスト実装後は、現在の「It will be re-registered when you run Sync All」という警告メッセージが事実と異なるものになるため、更新は「可能性」ではなく必須の変更である。

**証拠**:
- `src/components/worktree/WorktreeList.tsx` (line 229-234): 現在の警告メッセージ
- 実装タスクのチェックリストにWorktreeList.tsxの変更が含まれていない

**推奨対応**:
実装タスクに以下を追加:
- `src/components/worktree/WorktreeList.tsx`: 削除確認ダイアログの警告メッセージを更新（「このリポジトリは除外リストに追加されます。Sync Allで復活しません。」等）

---

## Nice to Have（あれば良い）

### NTH-1: CM_ROOT_DIR設定時の再現についての記載追加

**カテゴリ**: 完全性
**場所**: 再現手順 セクション

**問題**:
再現手順では `WORKTREE_REPOS` 環境変数に複数リポジトリパスを設定するケースのみ記載されているが、`CM_ROOT_DIR` 経由（単一リポジトリ設定）の場合も同じ問題が発生する。

**証拠**:
- `src/lib/worktrees.ts` (line 132-136): `getRepositoryPaths()` は `CM_ROOT_DIR` フォールバックも返す

**推奨対応**:
再現手順または注記に「CM_ROOT_DIR設定時も同様の問題が発生する」旨を追記。

---

### NTH-2: マイグレーションバージョン番号の明記

**カテゴリ**: 完全性
**場所**: 実装タスク セクション 1番目の項目

**問題**:
現在の `CURRENT_SCHEMA_VERSION = 16` であり、新規マイグレーションは version 17 となるべきだが、Issueに明記されていない。

**証拠**:
- `src/lib/db-migrations.ts` (line 14): `CURRENT_SCHEMA_VERSION = 16`

**推奨対応**:
DBマイグレーションのバージョン番号（Migration #17）を実装タスクに明記。

---

## 参照ファイル

### コード

| ファイル | 関連箇所 |
|---------|---------|
| `src/lib/worktrees.ts` (line 122-139, 225-243, 262-305) | getRepositoryPaths(), scanMultipleRepositories(), syncWorktreesToDB() |
| `src/app/api/repositories/route.ts` (line 55-160) | DELETE /api/repositories ハンドラ |
| `src/app/api/repositories/sync/route.ts` (line 10-50) | Sync All API |
| `src/lib/db-repository.ts` (line 13-24, 129-177, 230-273) | Repository model, createRepository(), updateRepository() |
| `src/lib/db-migrations.ts` (line 14, 563-644) | CURRENT_SCHEMA_VERSION=16, repositories テーブル定義 |
| `src/lib/db.ts` (line 1255-1265) | deleteRepositoryWorktrees() |
| `src/components/worktree/WorktreeList.tsx` (line 216-244) | 削除確認ダイアログ |
| `src/lib/__tests__/worktrees-sync.test.ts` | 既存syncテスト |

### ドキュメント

| ファイル | 関連 |
|---------|------|
| `CLAUDE.md` | プロジェクト構成、DB操作モジュール一覧 |
| `dev-reports/issue/190/issue-review/hypothesis-verification.md` | 全4仮説Confirmed、repositories.enabledカラム未使用の指摘 |
