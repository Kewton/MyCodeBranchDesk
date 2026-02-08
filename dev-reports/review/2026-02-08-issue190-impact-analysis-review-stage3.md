# Architecture Review: Issue #190 - Impact Analysis (Stage 3)

| 項目 | 内容 |
|------|------|
| Issue | #190 |
| レビュー対象 | リポジトリ削除後のSync All復活防止 - 設計方針書 |
| フォーカス | 影響範囲（変更の波及効果分析） |
| ステージ | Stage 3: 影響分析レビュー |
| 日付 | 2026-02-08 |
| ステータス | 条件付き承認 |
| スコア | 4/5 |

---

## Executive Summary

Issue #190 の設計方針書について、影響範囲（変更の波及効果）の観点からレビューを実施した。設計書は変更対象ファイル7件を明確に特定しており、依存関係の方向性（一方向）も正しく分析されている。ただし、以下の点で改善が必要である。

1. **既存テストファイルの更新漏れ** -- `tests/integration/api-repository-delete.test.ts` が変更対象から欠落している
2. **間接影響の記述不足** -- `RepositoryManager.tsx` と `scan/route.ts` への波及効果が未分析
3. **clone-manager.ts との相互作用テスト不足** -- UNIQUE 制約違反シナリオが未カバー

全体として設計の方向性は適切であり、必須改善項目を反映すれば実装に進める状態にある。

---

## 1. 変更対象ファイルの網羅性分析

### 1.1 設計書記載の変更対象ファイル（Section 11）

| ファイル | 変更種別 | 評価 |
|---------|---------|------|
| `src/lib/db-repository.ts` | 修正（7関数追加） | OK - 正確 |
| `src/app/api/repositories/route.ts` | 修正 | OK - 正確 |
| `src/app/api/repositories/sync/route.ts` | 修正 | OK - 正確 |
| `src/app/api/repositories/excluded/route.ts` | 新規 | OK - 正確 |
| `src/app/api/repositories/restore/route.ts` | 新規 | OK - 正確 |
| `src/components/worktree/WorktreeList.tsx` | 修正 | OK - 正確 |
| `src/lib/api-client.ts` | 修正 | OK - 正確 |

### 1.2 漏れているファイル

| ファイル | 漏れの種類 | 説明 |
|---------|-----------|------|
| `tests/integration/api-repository-delete.test.ts` | **テスト更新** | DELETE API の制御フロー変更（disableRepository が worktreeIds チェック前に実行される）により、既存テストの期待値が変わる。特に「should return 404 if repository has no worktrees」テストケースでは、404 レスポンスが返されつつも repositories テーブルに enabled=0 のレコードが残るという副作用が加わる。 |
| `tests/unit/db-repository-delete.test.ts` | **影響確認必要** | 間接的な影響は低いが、db-repository.ts に新関数が追加されるため、同ファイルのテストスイート構成との整合性を確認すべき。 |

### 1.3 間接影響ファイル（設計書に未記載）

| ファイル | 影響内容 | リスク |
|---------|---------|-------|
| `src/components/repository/RepositoryManager.tsx` | `repositoryApi.sync()` のレスポンス値（worktreeCount, repositoryCount）が除外分だけ減少する。Sync All ボタン押下後の成功メッセージに影響。 | 低 |
| `src/app/api/repositories/scan/route.ts` | scan 経由で追加された worktree が、同パスの enabled=0 リポジトリがある場合に次回 Sync All で消失するリスク。 | 中 |

---

## 2. 変更による既存機能への影響（回帰リスク）

### 2.1 DELETE /api/repositories の挙動変更

**変更前**: worktrees テーブルから物理削除のみ。Sync All で環境変数設定リポジトリが復活する。

**変更後**: `disableRepository()` が worktreeIds チェック前に呼ばれ、repositories テーブルに enabled=0 を設定。その後に worktrees テーブルから物理削除。

**回帰リスク分析**:

| シナリオ | 変更前の動作 | 変更後の動作 | リスク |
|---------|------------|------------|-------|
| worktreeIds > 0 のリポジトリ削除 | worktrees 物理削除、200 返却 | disableRepository + worktrees 物理削除、200 返却 | 低 - レスポンス同一 |
| worktreeIds = 0 のリポジトリ削除 | 404 返却、DB 変更なし | disableRepository (DB書込み) + 404 返却 | **中** - 副作用が追加される |
| 環境変数リポジトリ削除後の Sync All | リポジトリ復活 | リポジトリ復活しない（本Issue の目的） | 意図的変更 |

**既存テストへの影響**:

ファイル `tests/integration/api-repository-delete.test.ts` の以下のテストケースが影響を受ける:

```typescript
// Line 63-75: "should return 404 if repository has no worktrees"
// 変更後: 404 は返されるが、disableRepository() による DB 書き込みが先に発生する
// テスト自体はパスするが、repositories テーブルの状態検証が追加されるべき
```

### 2.2 POST /api/repositories/sync の挙動変更

**変更前**: `getRepositoryPaths()` の全パスに対して `scanMultipleRepositories()` を実行。

**変更後**: `ensureEnvRepositoriesRegistered()` で環境変数リポジトリを自動登録した後、`filterExcludedPaths()` で除外パスをフィルタリングしてからスキャン。

**回帰リスク分析**:

| シナリオ | 変更前の動作 | 変更後の動作 | リスク |
|---------|------------|------------|-------|
| 除外リポジトリなし（初回利用） | 全リポジトリスキャン | 自動登録 + 全リポジトリスキャン | 低 - 動作同一 |
| 除外リポジトリあり | 全リポジトリスキャン（復活する） | 除外リポジトリをスキップ | 意図的変更 |
| repositoryPaths が空 | 400 エラー | 400 エラー（ensureEnvRepositoriesRegistered は空配列で no-op） | 低 |

**レスポンスへの影響**: `worktreeCount` と `repositoryCount` が除外分だけ減少する。`RepositoryManager.tsx` の成功メッセージに反映される。

### 2.3 scan/route.ts との相互作用（スコープ外だが回帰リスクあり）

`scan/route.ts` は個別リポジトリを `worktrees` テーブルに追加するが、`repositories` テーブルには登録しない。以下のシナリオで問題が発生しうる:

1. ユーザーが `/path/to/repo` を DELETE で除外（repositories.enabled=0）
2. ユーザーが `/path/to/repo` を scan/route.ts で再追加（worktrees テーブルに登録される）
3. ユーザーが Sync All を実行
4. `filterExcludedPaths()` により `/path/to/repo` はスキップされる
5. `syncWorktreesToDB()` は除外パス分の worktrees を含まないため、ステップ2で追加された worktrees が **削除される**

設計書 Section 15 でスコープ外としているが、ユーザーの操作として十分起こりうるシナリオである。

---

## 3. 依存関係の変更による波及効果

### 3.1 新規依存関係

```
sync/route.ts ─── 新規import ──→ db-repository.ts
                                   (ensureEnvRepositoriesRegistered,
                                    filterExcludedPaths)

route.ts (DELETE) ── 新規import ──→ db-repository.ts
                                      (disableRepository)

excluded/route.ts ── 新規import ──→ db-repository.ts
(新規ファイル)                       (getExcludedRepositories)

restore/route.ts ─── 新規import ──→ db-repository.ts
(新規ファイル)                       (restoreRepository)
                 ─── 新規import ──→ worktrees.ts
                                     (scanWorktrees, syncWorktreesToDB)

api-client.ts ─── 新規メソッド ──→ /api/repositories/excluded
                                  /api/repositories/restore

WorktreeList.tsx ── 新規import ──→ api-client.ts
                                    (getExcluded, restore)
```

### 3.2 循環依存チェック

設計書の記述通り、全ての依存は一方向であり循環依存は発生しない。

- `route.ts` -> `db-repository.ts` (既存パターンと同じ方向)
- `sync/route.ts` -> `db-repository.ts` (新規だが同方向)
- `restore/route.ts` -> `db-repository.ts` + `worktrees.ts` (新規だが同方向)
- `WorktreeList.tsx` -> `api-client.ts` (既存パターン)

**評価**: 依存関係の設計は適切。

### 3.3 db-repository.ts への関数集中

db-repository.ts に7つの新関数が追加される。現在の関数数（既存12関数程度）と合わせると約19関数になる。ファイルサイズは増加するが、Repository/CloneJob という明確なドメイン境界内に収まっているため許容範囲である。

### 3.4 既存の `getRepositoryByPath()` への変更

設計書 Section 7 では `getRepositoryByPath()` 内部でも `resolveRepositoryPath()` を使用するとしている。この関数は現在 `clone-manager.ts` 等からは直接呼ばれていないが（grep で確認済み）、今後の利用を考慮すると内部正規化は適切な改善である。既存の呼び出し元がないため回帰リスクは低い。

---

## 4. テスト範囲の十分性

### 4.1 設計書記載のテスト（Section 12）

| テスト種別 | テストケース数 | カバレッジ評価 |
|-----------|-------------|-------------|
| ユニットテスト | 19ケース | 良好 - 新規関数の主要パスをカバー |
| 統合テスト | 4ケース | 概ね良好だが追加が必要 |

### 4.2 不足しているテストケース

| ID | テスト種別 | 不足テストケース | 優先度 |
|----|-----------|--------------|--------|
| T-I01 | 統合テスト | scan/route.ts で追加後、同パスが enabled=0 の場合の Sync All 挙動 | 中 |
| T-I02 | 統合テスト | clone-manager の onCloneSuccess() が enabled=0 の同パスレコード存在時の挙動 | 中 |
| T-I03 | 統合テスト | 既存テスト api-repository-delete.test.ts の更新（404 ケースで repositories テーブルの状態確認） | **高** |
| T-I04 | ユニットテスト | WorktreeList.tsx の除外リポジトリ一覧セクションの表示/非表示 | 低 |
| T-I05 | ユニットテスト | api-client.ts の getExcluded(), restore() メソッド | 低 |
| T-I06 | 統合テスト | Sync All のレスポンス値（worktreeCount, repositoryCount）が除外分だけ減少すること | 低 |

### 4.3 既存テストへの影響

| テストファイル | 影響 | 対応 |
|-------------|------|------|
| `tests/integration/api-repository-delete.test.ts` | **要更新** - disableRepository の追加により副作用が変わる | repositories テーブルの状態検証を追加 |
| `tests/unit/db-repository-delete.test.ts` | 影響なし | 既存テストはそのまま動作 |
| `tests/unit/db-repository-clone.test.ts` | 影響なし | 既存テストはそのまま動作 |
| `tests/unit/worktrees.test.ts` | 影響なし | getRepositoryPaths, scanWorktrees 等のシグネチャ変更なし |

---

## 5. 破壊的変更の影響分析の十分性

### 5.1 設計書の記述（Section 14）

設計書は1つの破壊的変更を明記している:

> DELETE /api/repositories: 「一時的な削除」 -> 「永続的な除外」

**評価**: 破壊的変更の特定は正確。これが Issue #190 の目的そのものであることも明記されている。

### 5.2 追加の破壊的変更分析

| 変更 | 影響 | 破壊的か | 設計書の記述 |
|------|------|---------|------------|
| DELETE API のレスポンス形式 | 変更なし | No | Section 4.1 で明記 |
| Sync All のレスポンス値 | worktreeCount, repositoryCount が減少しうる | **軽微** | 未記載 |
| worktreeIds=0 時の DELETE | 404 返却は維持だが DB 書き込み副作用が追加 | **軽微** | Section 9 で記述 |
| isInEnvVar() 関数の廃止 | 環境変数警告が表示されなくなる | **意図的変更** | Section 6.1 で記述 |

### 5.3 後方互換性

API のリクエスト/レスポンスの形式は全て後方互換性が維持される。新規 API エンドポイント（excluded, restore）の追加は既存クライアントに影響しない。`api-client.ts` への新メソッド追加も既存メソッドを変更しないため安全である。

---

## Risk Assessment

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| 技術的リスク | 既存テスト api-repository-delete.test.ts の更新漏れによるテスト不整合 | Medium | High | P1 |
| 技術的リスク | scan/route.ts 経由追加 + enabled=0 の回帰シナリオ | Medium | Medium | P2 |
| 技術的リスク | clone-manager.ts の UNIQUE 制約違反 | Medium | Low | P2 |
| 運用リスク | Sync All のレスポンス値変動によるユーザーの混乱 | Low | Medium | P3 |
| セキュリティリスク | 追加の攻撃面は限定的（新規エンドポイントは既存パターン踏襲） | Low | Low | P3 |

---

## Improvement Recommendations

### Must Fix (1 item)

| ID | 指摘内容 | 対象 |
|----|---------|------|
| MF-I01 | 既存テストファイル `tests/integration/api-repository-delete.test.ts` を変更対象ファイル一覧（Section 11）に追加し、テスト方針（Section 12）に更新内容を明記すべき。特に「should return 404 if repository has no worktrees」テストケースで、disableRepository() による repositories テーブルの状態変化を検証する必要がある。 | Section 11, 12 |

### Should Fix (5 items)

| ID | 指摘内容 | 対象 |
|----|---------|------|
| SF-I01 | `RepositoryManager.tsx` を間接影響ファイルとして Section 11 に記載し、Sync All 後の表示メッセージへの影響を明記すべき。 | Section 11 |
| SF-I02 | scan/route.ts 経由の追加と enabled=0 の相互作用を、フォローアップ Issue（Section 15）により具体的なシナリオとして記載すべき。現在の記述は抽象的すぎる。 | Section 15 |
| SF-I03 | clone-manager.ts の onCloneSuccess() との UNIQUE 制約違反シナリオのテストを、テスト方針に追加するか、フォローアップ Issue として明確に切り出すべき。 | Section 12, 15 |
| SF-I04 | worktrees.repositoryPath と repositories.path の整合性を確認するテストケースを追加すべき（パス正規化の一貫性検証）。 | Section 12 |
| SF-I05 | isInEnvVar() の現状の動作実態（NEXT_PUBLIC_WORKTREE_REPOS が next.config.js に未設定のため常に false を返す可能性）を確認し、C-C03 の判断根拠に追記すべき。 | Section 6.1 |

### Consider (3 items)

| ID | 指摘内容 |
|----|---------|
| C-I01 | repositories テーブルの enabled=0 レコード蓄積に対する将来的なクリーンアップ機能の検討 |
| C-I02 | 除外リポジトリ一覧の更新トリガー（WebSocket イベント連携）の実装時検討 |
| C-I03 | DELETE API の副作用変更（404 時でも DB 書き込み発生）を API ドキュメントに明記 |

---

## Approval Status

**条件付き承認 (Conditionally Approved)**

Must Fix 項目（MF-I01: 既存テストファイルの変更対象追記）を反映すれば実装可能。Should Fix 項目は品質向上のため推奨するが、実装着手のブロッカーではない。

設計書全体としては、変更対象ファイルの特定、依存関係の分析、破壊的変更の認識がよく整理されている。Stage 1（設計原則）、Stage 2（整合性）のレビュー指摘も適切に反映されている。影響範囲の観点での主な改善点は、間接影響ファイルの認識と既存テストの更新計画の明示である。
