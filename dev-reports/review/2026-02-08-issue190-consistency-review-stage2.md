# Issue #190: 整合性レビュー（Stage 2）

## レビュー概要

| 項目 | 値 |
|------|-----|
| Issue | #190 |
| レビュータイプ | 整合性（設計書 vs 既存コード） |
| ステージ | Stage 2 |
| 対象設計書 | `dev-reports/design/issue-190-repository-exclusion-on-sync-design-policy.md` |
| 判定 | 条件付き承認 (Conditionally Approved) |
| スコア | 4/5 |
| レビュー日 | 2026-02-08 |

---

## Executive Summary

Issue #190 の設計方針書は、既存コードベースとの整合性が概ね良好である。`repositories` テーブル（Migration #14）の既存スキーマを正確に参照しており、`createRepository()` / `updateRepository()` / `getRepositoryByPath()` の既存関数シグネチャとの互換性も確保されている。

主な課題は以下の3点:
1. **DELETE API の既存制御フロー** (`worktreeIds.length === 0` 時の早期リターン) と `disableRepository()` 呼び出しタイミングの不整合
2. **`createRepository()` の `enabled` デフォルト値ロジック** の直感的でない実装（`data.enabled !== false ? 1 : 0`）によるバグ混入リスク
3. **パス正規化方針** のシンボリックリンクケースに対する記載不足

---

## 詳細レビュー結果

### 1. コード構造の整合性

| 設計項目 | 設計書の記載 | 実装状況 | 判定 |
|---------|------------|---------|------|
| レイヤー構成 | API -> ビジネスロジック -> データアクセスの3層 | 既存コードは同パターン（route.ts -> worktrees.ts -> db.ts/db-repository.ts） | 一致 |
| db-repository.ts の責務 | repositories テーブル操作 + 新規ビジネスロジック関数 | 既存は Repository/CloneJob の CRUD 操作に特化 | 整合（責務拡張は妥当） |
| worktrees.ts の責務 | スキャン・同期ロジック | 既存は getRepositoryPaths / scanWorktrees / syncWorktreesToDB を含む | 一致 |
| api-client.ts の構造 | repositoryApi に getExcluded / restore を追加 | 既存は scan / sync / delete / clone / getCloneStatus を含む | 整合 |

**結論**: 設計書のレイヤー構成は既存コードのアーキテクチャパターンと完全に一致している。新規関数の配置先（db-repository.ts）も既存のモジュール責務に沿っている。

---

### 2. 関数シグネチャの整合性

#### 2.1 createRepository() -- 既存シグネチャとの互換性

**既存シグネチャ** (`src/lib/db-repository.ts` line 129-139):
```typescript
export function createRepository(
  db: Database.Database,
  data: {
    name: string;
    path: string;
    cloneUrl?: string;
    normalizedCloneUrl?: string;
    cloneSource: 'local' | 'https' | 'ssh';
    isEnvManaged?: boolean;
    enabled?: boolean;
  }
): Repository
```

**設計書での呼び出し** (Section 5, ensureEnvRepositoriesRegistered):
```typescript
createRepository(db, {
  name: path.basename(resolvedPath),
  path: resolvedPath,
  cloneSource: 'local',
  isEnvManaged: true,
  enabled: true,
});
```

**判定**: 型レベルで互換。ただし `enabled` のデフォルト値処理に注意が必要（MF-C01）。

#### 2.2 updateRepository() -- 既存シグネチャとの互換性

**既存シグネチャ** (`src/lib/db-repository.ts` line 230-238):
```typescript
export function updateRepository(
  db: Database.Database,
  id: string,
  updates: {
    name?: string;
    enabled?: boolean;
    cloneUrl?: string;
    normalizedCloneUrl?: string;
  }
): void
```

**設計書での呼び出し** (Section 5, disableRepository / restoreRepository):
```typescript
updateRepository(db, repo.id, { enabled: false });
updateRepository(db, repo.id, { enabled: true });
```

**判定**: 完全に一致。`enabled` は `updates` オブジェクトのオプショナルプロパティとして定義されており、設計書の呼び出しパターンと互換。

#### 2.3 getRepositoryByPath() -- 既存シグネチャとの互換性

**既存シグネチャ** (`src/lib/db-repository.ts` line 214-225):
```typescript
export function getRepositoryByPath(
  db: Database.Database,
  path: string
): Repository | null
```

**設計書での呼び出し** (Section 5, 複数箇所):
```typescript
const existing = getRepositoryByPath(db, resolvedPath);
const repo = getRepositoryByPath(db, resolvedPath);
```

**判定**: 完全に一致。

---

### 3. データモデルの整合性

#### 3.1 repositories テーブルスキーマ

**設計書 Section 3 の定義**:
```sql
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  clone_url TEXT,
  normalized_clone_url TEXT,
  clone_source TEXT CHECK(clone_source IN ('local', 'https', 'ssh')) DEFAULT 'local',
  is_env_managed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**既存 Migration #14** (`src/lib/db-migrations.ts` line 569-581):
```sql
CREATE TABLE IF NOT EXISTS repositories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,
  clone_url TEXT,
  normalized_clone_url TEXT,
  clone_source TEXT CHECK(clone_source IN ('local', 'https', 'ssh')) DEFAULT 'local',
  is_env_managed INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**判定**: 完全に一致。設計書のテーブル定義は Migration #14 の CREATE TABLE 文と一字一句同一。「新規マイグレーション不要」の判断は正しい。

#### 3.2 RepositoryRow / Repository 型

**既存定義** (`src/lib/db-repository.ts` line 13-24, 49-60):

Repository モデルの `enabled: boolean` と RepositoryRow の `enabled: number` のマッピングは `mapRepositoryRow()` で行われる（`enabled: row.enabled === 1`）。設計書 Section 5 の `getExcludedRepositories()` が `mapRepositoryRow` を使用するのは既存パターンに準拠。

**判定**: 一致。

---

### 4. API エンドポイントの整合性

#### 4.1 DELETE /api/repositories -- 既存フローとの統合

**既存フロー** (`src/app/api/repositories/route.ts`):
1. `repositoryPath` バリデーション
2. `getWorktreeIdsByRepository(db, repositoryPath)` -- **worktreeIds === 0 で 404 リターン**
3. `cleanupMultipleWorktrees()` -- セッションクリーンアップ
4. `cleanupRooms()` -- WebSocket クリーンアップ
5. `deleteRepositoryWorktrees()` -- DB 物理削除
6. `broadcastMessage()` -- 通知

**設計書の削除フロー** (Section 2):
1. セッションクリーンアップ（従来通り）
2. WebSocket ルームクリーンアップ（従来通り）
3. worktrees テーブルから物理削除（従来通り）
4. `disableRepository()` で除外登録 -- **新規追加**
5. broadcastMessage（従来通り）

**不整合点 (SF-C01)**: 既存の route.ts では Step 2 で `worktreeIds.length === 0` の場合に 404 を返して処理が終了する。この早期リターンがある場合、`disableRepository()` に到達しない。環境変数で設定されたリポジトリがまだ一度も Sync All されていない（worktrees テーブルにレコードが存在しない）ケースで問題となる。

#### 4.2 POST /api/repositories/sync -- 既存フローとの統合

**既存フロー** (`src/app/api/repositories/sync/route.ts`):
1. `getRepositoryPaths()` -- 環境変数からパス取得
2. `scanMultipleRepositories(repositoryPaths)` -- 全パスでスキャン
3. `syncWorktreesToDB(db, allWorktrees)` -- DB 同期

**設計書のフロー** (Section 4.1):
1. `getRepositoryPaths()` -- 環境変数からパス取得
2. `ensureEnvRepositoriesRegistered(db, repositoryPaths)` -- **新規追加**
3. `filterExcludedPaths(db, repositoryPaths)` -- **新規追加**
4. `scanMultipleRepositories(filteredPaths)` -- フィルタ済みパスでスキャン
5. `syncWorktreesToDB(db, allWorktrees)` -- DB 同期

**判定**: 既存フローへの新規ステップ追加として整合。既存の import パターン（`getDbInstance` from `db-instance`, `getRepositoryPaths` / `scanMultipleRepositories` / `syncWorktreesToDB` from `worktrees`）への新規 import 追加のみで対応可能。

#### 4.3 新規 API のパス構成

| 新規 API | パス | 既存パターンとの整合 |
|---------|------|-------------------|
| GET /api/repositories/excluded | `/api/repositories/excluded/route.ts` | `/api/repositories/scan/route.ts`, `/api/repositories/clone/route.ts` と同パターン |
| PUT /api/repositories/restore | `/api/repositories/restore/route.ts` | 同上 |

**判定**: ディレクトリ構成は既存パターンに準拠。

---

### 5. セクション間整合性

| セクション組み合わせ | 整合性 | 備考 |
|-------------------|--------|------|
| Section 2 (フロー) / Section 4 (API設計) | 概ね一致 | SF-C04: フロー図の粒度がコード例より粗い |
| Section 3 (データモデル) / Section 5 (関数設計) | 一致 | SQL クエリが repositories テーブルの正しいカラム名を使用 |
| Section 5 (関数設計) / Section 11 (変更対象) | 一致 | 全新規関数が db-repository.ts に配置される旨が一致 |
| Section 5 (関数設計) / Section 12 (テスト) | 一致 | 全新規関数のテストケースが網羅されている |
| Section 6 (UI) / Section 4 (API) | 一致 | api-client.ts の新規メソッドが新規 API エンドポイントに対応 |
| Section 7 (パス正規化) / Section 5 (関数設計) | 一致 | resolveRepositoryPath() の使用箇所が一致 |
| Section 9 (エラーハンドリング) / Section 4 (API) | 一致 | HTTP ステータスコードとエラーレスポンス形式が一致 |

---

## リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| 技術的リスク | DELETE API の早期リターンにより disableRepository() が呼ばれないケース | Medium | Medium | P2 |
| 技術的リスク | createRepository() の enabled デフォルト値ロジックによるバグ | Medium | Low | P2 |
| 技術的リスク | パス比較時のシンボリックリンク未解決 | Low | Low | P3 |
| セキュリティリスク | 入力バリデーションは既存パターン踏襲で十分 | Low | Low | - |
| 運用リスク | repositories テーブルのレコード蓄積（物理削除なし） | Medium | Medium | P3 |

---

## 改善勧告

### 必須改善項目 (Must Fix): 1件

#### MF-C01: createRepository() の enabled デフォルト値ロジックの明文化

**対象**: 設計書 Section 5 / `src/lib/db-repository.ts`

**問題**: 既存の `createRepository()` は `data.enabled !== false ? 1 : 0` でデフォルト値を処理する。この三項演算子は `enabled: undefined` の場合に `1`（有効）を返す。設計書の `disableRepository()` 内で `createRepository(db, { ..., enabled: false })` と呼ぶ場合は期待通り `0` になるが、このロジックは直感的でなく、実装者が `enabled` パラメータを省略した場合にバグとなるリスクがある。

**勧告**: 設計書 Section 5 の `disableRepository()` と `ensureEnvRepositoriesRegistered()` に、`enabled` パラメータが必ず明示的に渡される点をコードコメントで強調すること。

---

### 推奨改善項目 (Should Fix): 4件

#### SF-C01: DELETE API の制御フロー修正

**対象**: 設計書 Section 2, Section 4.1

**問題**: 既存の `route.ts` は `worktreeIds.length === 0` で 404 を返すが、この早期リターンの前に `disableRepository()` を呼ばないと、worktrees が存在しないリポジトリを除外登録できない。

**勧告**: 設計書の削除フローを修正し、`disableRepository()` を worktreeIds チェックの前に配置するか、worktreeIds === 0 でも除外登録は実行する分岐を明記すること。

#### SF-C02: パス正規化のシンボリックリンクケース

**対象**: 設計書 Section 7

**問題**: `path.resolve()` はシンボリックリンクを解決しない。環境変数にシンボリックリンクパスが設定されている場合、`repositories.path` との比較が失敗する可能性がある。

**勧告**: シンボリックリンクのケースについて設計書に明記すること。

#### SF-C03: PUT /api/repositories/restore のメソッド選択の根拠

**対象**: 設計書 Section 4.2, Section 13

**問題**: 既存プロジェクトでは部分更新に PATCH を使用するパターンが多いが、restore API は PUT を使用。

**勧告**: 設計書のトレードオフテーブルに HTTP メソッド選択の根拠を追記すること。

#### SF-C04: フロー図とコード例の粒度統一

**対象**: 設計書 Section 2, Section 4.1

**問題**: フロー図に `getDbInstance()` が含まれていない。

**勧告**: フロー図にDB接続取得ステップを追加するか、概念レベルの図である旨を注記すること。

---

### 検討事項 (Consider): 3件

#### C-C01: scan/route.ts の repositories テーブル未登録

scan/route.ts 経由で追加されたリポジトリは repositories テーブルに登録されない。設計書でスコープ外として認識されているが、フォローアップ Issue の優先度を明確化すること。

#### C-C02: clone リポジトリの enabled=0 時の挙動

clone_source が 'https'/'ssh' のリポジトリに対する enabled=0 の影響について一文追記すること。

#### C-C03: isInEnvVar() 関数の廃止可否

新しい削除確認メッセージが環境変数に依存しないため、`isInEnvVar()` の使用継続/廃止を明記すること。

---

## 承認判定

**条件付き承認 (Conditionally Approved)**

MF-C01 の対応（createRepository の enabled デフォルト値ロジックの明文化）と、SF-C01 の対応（DELETE API の制御フロー明確化）を設計書に反映した上で実装に進むことを推奨する。

設計書全体としては既存コードベースとの整合性が高く、Migration #14 の既存スキーマ活用、db-repository.ts への関数集約、API ルートの責務限定化など、既存パターンに沿った堅実な設計である。
