# Issue #190: リポジトリ削除後のSync All復活防止 - 設計方針書

## 1. 概要

### 問題
トップ画面でUIからリポジトリを削除しても、Sync All実行時に環境変数（`WORKTREE_REPOS`/`CM_ROOT_DIR`）から再スキャンされ、DBにupsertされて復活してしまう。

### 解決方針
既存の `repositories` テーブルの `enabled` カラム（Migration #14で追加済み）を活用し、削除時に `enabled = 0` に設定。Sync All時に `enabled = 0` のリポジトリをスキャン対象から除外する。

### 設計判断の根拠
- `repositories.enabled` カラムが既に存在（`db-migrations.ts` line 574）
- `updateRepository()` で `enabled` 更新APIが実装済み（`db-repository.ts` line 249-251）
- 新テーブル追加よりも既存スキーマ活用が効率的
- 追加マイグレーション不要

---

## 2. アーキテクチャ設計

### 処理フロー（現在）

```
Sync All → getRepositoryPaths() → scanMultipleRepositories() → syncWorktreesToDB()
                                        ↓
                               全リポジトリをスキャン（除外なし）
```

### 処理フロー（変更後）

```
Sync All → getRepositoryPaths()
         → getDbInstance()
         → ensureEnvRepositoriesRegistered(db, repositoryPaths) [db-repository.ts]
         → filterExcludedPaths(db, repositoryPaths) [db-repository.ts] で除外パスフィルタリング
         → scanMultipleRepositories(filteredPaths)
         → syncWorktreesToDB(db, allWorktrees)
```

**設計原則**: sync/route.ts はオーケストレーション（関数呼び出し）のみを行い、ビジネスロジックは db-repository.ts に集約する（SRP準拠、MF-001対応）。

**間接影響（SF-I01対応）**: 上記フロー変更により、`sync/route.ts` のレスポンスに含まれる `repositoryCount` と `worktreeCount` は除外リポジトリ分だけ減少する。`RepositoryManager.tsx` の Sync All ボタンは `repositoryApi.sync()` を呼び出し、成功メッセージ「Successfully synced X worktree(s) from Y repository/repositories」を表示するが、この数値が変わる。機能的には正常動作（除外リポジトリがスキャンされないのは意図通り）であり、`RepositoryManager.tsx` のコード変更は不要。ただし、ユーザーが「リポジトリ数が減った」と混乱する可能性を認識しておくこと。

**注記（SF-C04）**: 上記フロー図は `getDbInstance()` を含む全ステップを明示している。Section 4.1 のコード例と粒度を一致させている。

### 削除フロー（変更後）

```
DELETE /api/repositories
  → リクエストバリデーション（repositoryPath の型・空文字チェック）
  → パストラバーサルバリデーション（null byte チェック + isSystemDirectory() チェック、SEC-MF-001対応）
  → disableRepository() [db-repository.ts] で除外登録（SF-002/SF-C01対応）
    ※ 既存レコード: enabled=0 に更新
    ※ 未登録: enabled=0 で新規登録
  → セッションクリーンアップ（従来通り）
  → WebSocketルームクリーンアップ（従来通り）
  → worktreesテーブルから物理削除（従来通り）
  → broadcastMessage（従来通り）
```

**重要（SF-C01対応）**: `disableRepository()` の呼び出しは `worktreeIds` チェック（404早期リターン）の **前** に配置する。これにより、環境変数で設定されたリポジトリがまだ一度も Sync All されていない場合（worktrees テーブルにレコードが無い場合）でも、除外登録が確実に実行される。`worktreeIds.length === 0` で404を返す既存動作は維持するが、その前に `disableRepository()` を実行することで、次回の Sync All での復活を防止する。

### 復活フロー

```
PUT /api/repositories/restore
  → リクエストバリデーション（repositoryPath の型・空文字チェック）
  → パストラバーサルバリデーション（null byte チェック + isSystemDirectory() チェック、SEC-MF-001対応）
  → repositoryPath で repositories テーブルを検索
  → enabled を 1 に更新
  → 対象リポジトリのみ scanWorktrees() + syncWorktreesToDB() で自動復元（TOCTOU リスク認識済み、SEC-SF-005対応）
```

**注記（SF-004）**: 復活APIでの自動sync実行はUX簡便性とのトレードオフ。API応答が遅くなる可能性を許容する設計判断。将来的にリポジトリ数増加でレスポンスが問題になる場合は、enabled=1更新のみに限定し手動Sync Allに委ねる方式、または非同期ジョブ方式への変更を検討する。

### レイヤー構成

| レイヤー | ファイル | 責務 |
|---------|---------|------|
| API（プレゼンテーション） | `sync/route.ts`, `route.ts`, `excluded/route.ts`, `restore/route.ts` | リクエスト処理、レスポンス構築、ビジネスロジック関数の呼び出し |
| ビジネスロジック | `worktrees.ts` | スキャン・同期ロジック |
| データアクセス / ビジネスロジック | `db-repository.ts` | repositories テーブル操作、環境変数リポジトリ自動登録、除外フィルタリング、除外登録 |
| UI | `WorktreeList.tsx` | 除外リポジトリ一覧、復活ボタン |
| APIクライアント | `api-client.ts` | フロントエンドAPI呼び出し |

**重要（MF-001/SF-002/SF-003）**: APIルート（route.ts）にはデータアクセスやビジネスロジックを直接記述しない。全てのビジネスロジックは `db-repository.ts` または `worktrees.ts` の関数として切り出し、APIルートからは1関数呼び出しで済むようにする。

---

## 3. データモデル設計

### 既存テーブル: repositories（Migration #14、変更なし）

```sql
CREATE TABLE repositories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL DEFAULT 1,       -- 0: 除外, 1: 有効
  clone_url TEXT,
  normalized_clone_url TEXT,
  clone_source TEXT CHECK(clone_source IN ('local', 'https', 'ssh')) DEFAULT 'local',
  is_env_managed INTEGER NOT NULL DEFAULT 0, -- 1: 環境変数管理
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

**新規マイグレーション不要**: 必要なカラム（`enabled`, `is_env_managed`）は全て既存。

### enabled カラムのデフォルト値挙動（MF-C01対応）

`createRepository()` における `enabled` パラメータの内部マッピングロジック:

```typescript
// db-repository.ts 内の既存ロジック
// data.enabled !== false ? 1 : 0
```

| 呼び出し時の enabled 値 | SQLite格納値 | 意味 |
|------------------------|-------------|------|
| `true` | `1` | 有効 |
| `false` | `0` | 除外 |
| `undefined`（省略時） | `1` | **有効**（`!== false` で判定されるため） |

**実装時の注意**: `enabled` を省略した場合は暗黙的に `1`（有効）になる。本設計では `ensureEnvRepositoriesRegistered()` で `enabled: true` を明示的に渡し、`disableRepository()` で `enabled: false` を明示的に渡すことで、意図を明確にしている。`undefined` に依存する暗黙的なデフォルト動作は使用しない。実装時にはこの挙動をコードコメントで明文化すること。

### repositories テーブルの活用方針

| ユースケース | enabled | is_env_managed | clone_source |
|-------------|---------|---------------|-------------|
| 環境変数リポジトリ（有効） | 1 | 1 | local |
| 環境変数リポジトリ（除外） | 0 | 1 | local |
| クローンリポジトリ（有効） | 1 | 0 | https/ssh |
| クローンリポジトリ（除外） | 0 | 0 | https/ssh |

### クローンリポジトリの enabled=0 時の挙動（C-C02対応）

`clone_jobs` テーブル経由で登録されたリポジトリ（`clone_source = 'https'` または `'ssh'`）の `enabled` を `0` に設定した場合:

- **Sync All時**: `filterExcludedPaths()` により除外される（環境変数リポジトリと同じ挙動）
- **クローン機能**: 現時点では `clone-manager.ts` の `onCloneSuccess()` や関連処理に `enabled` ベースのフィルタリングは実装されていない。そのため、同一URLの再クローンは `repositories.path` の UNIQUE 制約で阻止されるが、クローンジョブの作成自体は制限されない
- **将来の拡張時注意**: クローン機能に `enabled` フィルタを追加する場合、`enabled=0` のリポジトリに対する再クローン挙動を明確に定義する必要がある

---

## 4. API設計

### 4.1 既存API変更

#### DELETE /api/repositories（変更）

**変更内容**: worktrees物理削除に加え、`repositories.enabled = 0` に更新

**設計方針（SF-002対応）**: route.ts では `disableRepository()` を1回呼び出すのみ。内部ロジック（既存レコードの更新 or 新規登録）は `db-repository.ts` にカプセル化する。

**制御フロー（SF-C01対応）**: `disableRepository()` は `worktreeIds` チェック（404早期リターン）の **前** に呼び出す。

```typescript
// route.ts での制御フロー
const resolvedPath = resolveRepositoryPath(repositoryPath);

// 0. パストラバーサルバリデーション（SEC-MF-001対応）
if (repositoryPath.includes('\0')) {
  return NextResponse.json({ success: false, error: 'Invalid repository path' }, { status: 400 });
}
if (isSystemDirectory(resolvedPath)) {
  return NextResponse.json({ success: false, error: 'Invalid repository path' }, { status: 400 });
}

const db = getDbInstance();

// 1. 除外登録（worktreeIds チェックの前に実行）
disableRepository(db, repositoryPath);

// 2. worktreeIds 取得と後続処理（既存フロー）
const worktreeIds = getWorktreeIdsByRepository(db, repositoryPath);
if (worktreeIds.length === 0) {
  return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
}
// ... セッションクリーンアップ、物理削除、broadcastMessage
```

**リクエスト/レスポンス**: 変更なし（後方互換性維持）

#### POST /api/repositories/sync（変更）

**変更内容**: 除外フィルタリングと環境変数リポジトリ自動登録を追加

**設計方針（MF-001/SF-003対応）**: sync/route.ts はオーケストレーションのみ。各ステップのビジネスロジックは db-repository.ts の関数に委譲する。

```typescript
// sync/route.ts でのオーケストレーション
const repositoryPaths = getRepositoryPaths();
const db = getDbInstance();

// 1. 環境変数リポジトリの自動登録（db-repository.ts に委譲）
ensureEnvRepositoriesRegistered(db, repositoryPaths);

// 2. 除外パスフィルタリング（db-repository.ts に委譲）
const filteredPaths = filterExcludedPaths(db, repositoryPaths);

// 3. フィルタ済みパスでスキャン
const allWorktrees = await scanMultipleRepositories(filteredPaths);
syncWorktreesToDB(db, allWorktrees);
```

### 4.2 新規API

#### GET /api/repositories/excluded

**目的**: 除外リポジトリ一覧を取得

```typescript
// Response: 200
{
  success: true,
  repositories: Repository[] // enabled=0 のリポジトリ一覧
}
```

#### PUT /api/repositories/restore

**目的**: 除外リポジトリを復活

**HTTPメソッド選択の根拠（SF-C03対応）**: 既存プロジェクトでは単純なフラグ更新に PATCH を使用するパターンが多い（例: `PATCH /api/worktrees/:id`）。しかし、restore API は `enabled` フラグの更新に加えて `scanWorktrees()` + `syncWorktreesToDB()` という副作用（worktrees テーブルへの同期）を伴うため、リソースの完全な状態復元を表す PUT を選択した。PATCH は部分更新の意味が強く、副作用を伴う操作の意味を十分に伝えない。

```typescript
// Request body
{ repositoryPath: string }

// Response: 200 (成功)
{
  success: true,
  worktreeCount: number,
  message: string
}

// Response: 200 (物理パス不存在時)
{
  success: true,
  worktreeCount: 0,
  warning: "Repository path not found on disk. No worktrees were restored."
}

// Response: 404
{
  success: false,
  error: "Repository not found in exclusion list"
}

// Response: 500 (SEC-SF-003対応: error.message をそのまま返さず固定メッセージ)
{
  success: false,
  error: "Failed to restore repository"
}
```

### 4.3 API設計スタイル

既存の `DELETE /api/repositories` と同様にリクエストボディベースで統一：
- `DELETE /api/repositories` → body: `{ repositoryPath }`
- `PUT /api/repositories/restore` → body: `{ repositoryPath }`
- `GET /api/repositories/excluded` → パラメータなし

---

## 5. 新規関数設計（db-repository.ts）

### resolveRepositoryPath()（SF-001対応: DRY）

```typescript
/**
 * Resolve and normalize a repository path.
 * All path normalization is centralized here to prevent inconsistencies.
 *
 * NOTE: path.resolve() removes trailing slashes and resolves relative paths
 * but does NOT resolve symlinks. For symlink resolution, use fs.realpathSync().
 * See Section 7 for the symlink handling policy.
 */
export function resolveRepositoryPath(repoPath: string): string {
  return path.resolve(repoPath);
}
```

**設計方針**: `path.resolve()` 呼び出しを本関数に集約し、呼び出し側での正規化忘れを防止する。`getRepositoryByPath()`, `disableRepository()`, `ensureEnvRepositoriesRegistered()`, `filterExcludedPaths()` の内部で本関数を使用する。

### ensureEnvRepositoriesRegistered()（MF-001対応: SRP）

```typescript
/**
 * Register environment variable repositories to the repositories table.
 * Idempotent: already registered repositories are skipped.
 *
 * NOTE (MF-C01): createRepository() treats enabled as follows:
 *   - true  -> SQLite 1 (enabled)
 *   - false -> SQLite 0 (disabled)
 *   - undefined -> SQLite 1 (enabled, due to `data.enabled !== false ? 1 : 0` logic)
 * We explicitly pass enabled: true to avoid relying on the implicit default.
 */
export function ensureEnvRepositoriesRegistered(
  db: Database.Database,
  repositoryPaths: string[]
): void {
  for (const repoPath of repositoryPaths) {
    const resolvedPath = resolveRepositoryPath(repoPath);
    const existing = getRepositoryByPath(db, resolvedPath);
    if (!existing) {
      createRepository(db, {
        name: path.basename(resolvedPath),
        path: resolvedPath,
        cloneSource: 'local',
        isEnvManaged: true,
        enabled: true,  // Explicit: do not rely on undefined -> 1 default
      });
    }
  }
}
```

### filterExcludedPaths()（SF-003対応: OCP）

```typescript
/**
 * Filter out excluded repository paths.
 * Exclusion logic is encapsulated here, so changes to exclusion criteria
 * (e.g., pattern-based exclusion, temporary exclusion) only affect this function.
 *
 * NOTE (SEC-SF-002): Array.includes() performs case-sensitive string comparison.
 * On macOS (case-insensitive filesystem), paths with different casing would not match.
 * resolveRepositoryPath() normalization on both sides mitigates most cases.
 * On Linux (case-sensitive filesystem), the behavior is consistent.
 */
export function filterExcludedPaths(
  db: Database.Database,
  repositoryPaths: string[]
): string[] {
  const excludedPaths = getExcludedRepositoryPaths(db);
  return repositoryPaths.filter(p =>
    !excludedPaths.includes(resolveRepositoryPath(p))
  );
}
```

### disableRepository()（SF-002対応: SRP）

```typescript
/**
 * Disable a repository by setting enabled=0.
 * If the repository is not registered, create it with enabled=0.
 * All internal logic (lookup + update/create) is encapsulated.
 *
 * NOTE (MF-C01): Explicitly passes enabled: false to createRepository().
 * The internal mapping `data.enabled !== false ? 1 : 0` will correctly
 * store 0 in SQLite. Do NOT pass undefined for enabled.
 *
 * NOTE (SEC-SF-004): When creating a new record, checks the count of
 * disabled repositories against MAX_DISABLED_REPOSITORIES to prevent
 * unlimited record accumulation from malicious or buggy DELETE requests.
 */
const MAX_DISABLED_REPOSITORIES = 1000;

export function disableRepository(db: Database.Database, repositoryPath: string): void {
  const resolvedPath = resolveRepositoryPath(repositoryPath);
  const repo = getRepositoryByPath(db, resolvedPath);
  if (repo) {
    updateRepository(db, repo.id, { enabled: false });
  } else {
    // SEC-SF-004: Check disabled repository count limit before creating new record
    const disabledCount = db.prepare(
      'SELECT COUNT(*) as count FROM repositories WHERE enabled = 0'
    ).get() as { count: number };
    if (disabledCount.count >= MAX_DISABLED_REPOSITORIES) {
      throw new Error('Disabled repository limit exceeded');
    }
    createRepository(db, {
      name: path.basename(resolvedPath),
      path: resolvedPath,
      cloneSource: 'local',
      isEnvManaged: false,
      enabled: false,  // Explicit: do not rely on undefined -> 1 default
    });
  }
}
```

### getExcludedRepositoryPaths()

```typescript
/**
 * Get paths of excluded (enabled=0) repositories
 */
export function getExcludedRepositoryPaths(db: Database.Database): string[] {
  const stmt = db.prepare('SELECT path FROM repositories WHERE enabled = 0');
  const rows = stmt.all() as { path: string }[];
  return rows.map(r => r.path);
}
```

### getExcludedRepositories()

```typescript
/**
 * Get excluded repositories with full details
 */
export function getExcludedRepositories(db: Database.Database): Repository[] {
  const stmt = db.prepare('SELECT * FROM repositories WHERE enabled = 0 ORDER BY name ASC');
  const rows = stmt.all() as RepositoryRow[];
  return rows.map(mapRepositoryRow);
}
```

### restoreRepository()

```typescript
/**
 * Restore an excluded repository by setting enabled=1
 */
export function restoreRepository(db: Database.Database, repoPath: string): Repository | null {
  const resolvedPath = resolveRepositoryPath(repoPath);
  const repo = getRepositoryByPath(db, resolvedPath);
  if (!repo) return null;
  updateRepository(db, repo.id, { enabled: true });
  return { ...repo, enabled: true };
}
```

---

## 6. UI設計

### 6.1 WorktreeList.tsx 変更

#### 削除確認ダイアログの警告メッセージ更新

**現在のメッセージ**:
```
WARNING: This repository is configured in environment variable (WORKTREE_REPOS).
It will be re-registered when you run "Sync All".
To permanently remove it, also update the environment variable.
```

**更新後のメッセージ**:
```
This repository will be added to the exclusion list.
It will NOT be re-registered when you run "Sync All".
You can restore it from the excluded repositories list.
```

**注記**: 更新後のメッセージは環境変数の有無に依存しない統一メッセージとなるため、環境変数判定に基づく条件分岐は不要となる。

#### isInEnvVar() 関数の扱い（C-C03対応）

既存の `isInEnvVar()` ヘルパー関数は、現在の警告メッセージ表示の条件分岐に使用されている。更新後のメッセージは全リポジトリで統一されるため、`isInEnvVar()` による条件分岐は **不要** となる。

**方針**: `isInEnvVar()` 関数を **廃止** する。他の箇所で使用されていない場合はデッドコードとして削除する。使用箇所がある場合は本Issue のスコープ内で判断し、必要に応じてフォローアップIssueとする。

**Implementation Note（SF-I05）**: `isInEnvVar()` は `process.env.NEXT_PUBLIC_WORKTREE_REPOS` を参照しているが、`next.config.js` の `env` ブロックには `NEXT_PUBLIC_APP_VERSION` のみが設定されており、`NEXT_PUBLIC_WORKTREE_REPOS` は設定されていない。そのため、`isInEnvVar()` は現時点で既に常に `false` を返している可能性が高く、実質的に機能していない。この事実は本 Issue での廃止判断をより明確に裏付ける。実装時に `isInEnvVar()` の実際の動作を確認し、既に機能していないことを検証した上で廃止する。

#### 除外リポジトリ一覧セクション

WorktreeList.tsxに折りたたみ形式で除外リポジトリ一覧セクションを追加：
- デフォルトは折りたたみ状態
- 除外リポジトリ名と「再登録」ボタンを表示
- データソース: `GET /api/repositories/excluded`
- 「再登録」ボタン押下で `PUT /api/repositories/restore` を呼び出し

### 6.2 api-client.ts 変更

`repositoryApi` に以下を追加：

```typescript
async getExcluded(): Promise<{ success: boolean; repositories: Repository[] }> {
  return fetchApi('/api/repositories/excluded');
},

async restore(repositoryPath: string): Promise<{
  success: boolean;
  worktreeCount: number;
  message?: string;
  warning?: string;
}> {
  return fetchApi('/api/repositories/restore', {
    method: 'PUT',
    body: JSON.stringify({ repositoryPath }),
  });
},
```

---

## 7. パス正規化方針

### 問題
- `getRepositoryPaths()` は `.trim()` のみで `path.resolve()` を適用しない
- `scanWorktrees()` は `path.resolve(rootDir)` を適用する
- `repositories.path` には `UNIQUE` 制約がある

### 方針（SF-001対応: DRY）

**集約原則**: パス正規化は `resolveRepositoryPath()` ヘルパー関数に集約し、呼び出し側で個別に `path.resolve()` を記述しない。

- `db-repository.ts` に `resolveRepositoryPath()` を配置
- 以下の関数の内部で `resolveRepositoryPath()` を使用:
  - `ensureEnvRepositoriesRegistered()` - 環境変数リポジトリ自動登録時
  - `disableRepository()` - DELETE時の除外登録
  - `filterExcludedPaths()` - フィルタリング比較時
  - `restoreRepository()` - 復活時のパス検索
  - `getRepositoryByPath()` - 既存関数内でも正規化を適用（内部改善）
- `getExcludedRepositoryPaths()` の結果は既に正規化済み（DB登録時に正規化されるため）

**利点**: 正規化忘れによるバグを構造的に防止。新しい関数追加時も `resolveRepositoryPath()` を使う規約により一貫性を維持。

### シンボリックリンクの扱い（SF-C02対応）

`path.resolve()` は末尾スラッシュの除去と相対パスの絶対パス化を行うが、**シンボリックリンクの解決は行わない**。これにより以下のケースでパス不一致が発生しうる:

- 環境変数で指定されたパスがシンボリックリンク経由の場合（例: `/data/repos/myrepo` -> `/mnt/ssd/repos/myrepo`）
- `filterExcludedPaths()` の `Array.includes()` 比較でシンボリックリンクパスと実体パスが不一致になる

**現時点の方針**: `path.resolve()` のみで対応する。理由は以下の通り:

1. CommandMate の主要ユースケースでは、環境変数に直接パスを指定するケースが大半であり、シンボリックリンク経由での指定は稀である
2. `fs.realpathSync()` はファイルシステムI/Oを伴うため、パフォーマンスへの影響がある
3. 既存の `db-path-resolver.ts` や `env-setup.ts` では `fs.realpathSync()` を使用しているが、これらはセキュリティ目的（パストラバーサル防止）であり、本Issueの正規化目的とは異なる

**将来対応**: シンボリックリンクによるパス不一致の問題報告があった場合、`resolveRepositoryPath()` 内部に `fs.realpathSync()` を追加する（パスが存在する場合のみ、`try-catch` でフォールバック）。`resolveRepositoryPath()` に集約している設計により、変更は1箇所のみで済む。

### worktrees テーブルと repositories テーブルのパス整合性（SF-I04対応）

`scanWorktrees()` 内部で `path.resolve(rootDir)` を適用して `worktrees.repositoryPath` を生成し、`ensureEnvRepositoriesRegistered()` で `resolveRepositoryPath()` を適用して `repositories.path` を生成する。いずれも `path.resolve()` を使用するため、原理的にはパス表現が一致する。

ただし、以下のエッジケースで不一致が生じる可能性がある:
- 環境変数で末尾スラッシュ付きのパスが設定された場合（`path.resolve()` は末尾スラッシュを除去するが、`getRepositoryPaths()` の `.trim()` では除去されないため、処理パイプラインの経路次第で不一致が起こりうる）

**対策**: `resolveRepositoryPath()` による正規化で多くのケースは防がれる。実装時にパス整合性の確認テストを追加することで安全性を向上させる（Section 12「パス整合性テスト」参照）。

---

## 8. セキュリティ設計

### 入力バリデーション

#### 基本バリデーション
- `repositoryPath` は `typeof === 'string'` + 空文字チェック（既存）
- 復活API: 同様のバリデーション

#### パストラバーサル防御（SEC-MF-001対応）

**対象API**: `DELETE /api/repositories`、`PUT /api/repositories/restore`

`repositoryPath` に対して、`typeof === 'string'` と空文字チェックだけでは不十分。悪意のあるパス（例: `/etc/passwd`, `../../../../etc/passwd`）が `repositories` テーブルに `enabled=0` のレコードとして永続化され、`GET /api/repositories/excluded` API経由でパス情報が漏洩し、ディレクトリ構造の推測に利用される可能性がある。

**必須バリデーション（SEC-MF-001）**:
1. `resolveRepositoryPath()` でパスを正規化（`path.resolve()` を内部使用）
2. **null byte チェック**: `repositoryPath` に `\0`（null byte）が含まれていないことを確認。含まれている場合は 400 エラーを返す
3. **システムディレクトリチェック**: `path.resolve()` 後のパスが `isSystemDirectory()` でシステムディレクトリ（`/etc`, `/usr`, `/sys` 等）でないことを確認。該当する場合は 400 エラーを返す

**実装パターン**: `scan/route.ts` で既に実装されている `isPathSafe()` パターンを参考にする。`isSystemDirectory()` は `src/config/system-directories.ts` に定義済み。

```typescript
// route.ts (DELETE) / restore/route.ts でのバリデーション例
const resolvedPath = resolveRepositoryPath(repositoryPath);

// null byte チェック
if (repositoryPath.includes('\0')) {
  return NextResponse.json(
    { success: false, error: 'Invalid repository path' },
    { status: 400 }
  );
}

// システムディレクトリチェック
if (isSystemDirectory(resolvedPath)) {
  return NextResponse.json(
    { success: false, error: 'Invalid repository path' },
    { status: 400 }
  );
}
```

**注記**: バリデーションはAPIルート層（route.ts）で実施する。ビジネスロジック関数（`disableRepository()`, `restoreRepository()`）は、バリデーション済みのパスを受け取る前提とする。

### SQLインジェクション対策

- プリペアドステートメント使用（既存パターン踏襲）
- `getExcludedRepositoryPaths()` と `getExcludedRepositories()` はパラメータバインドなしの固定SQLのためSQLインジェクションリスクなし（SEC-SF-002確認済み）

#### パス比較のOS依存性（SEC-SF-002対応）

`filterExcludedPaths()` 内の `Array.includes()` によるパス比較はDB外での文字列比較であり、OS依存の挙動がある:
- **macOS**: ファイルシステムはcase-insensitive（HFS+/APFS デフォルト）だが、`Array.includes()` はcase-sensitiveな文字列比較を行う。そのため、同一ファイルシステムパスでも大文字小文字が異なると不一致と判定される
- **Linux**: ファイルシステムはcase-sensitiveであり、`Array.includes()` の動作と一致する

**対策**:
- `resolveRepositoryPath()` による正規化が両側（登録時とフィルタリング時）で確実に適用されていることで、多くのケースで一致が保証される
- 実装時にコードコメントでOS依存性を明記する
- 正規化が両側で確実に適用されていることを検証するテストを追加する（Section 12参照）

### エラーレスポンスの情報漏洩防止（SEC-SF-003対応）

新規作成する `restore/route.ts` と `excluded/route.ts` の500エラーレスポンスでは、`error.message` をそのまま返さない。内部例外メッセージ（DBエラー詳細、ファイルパス等）がクライアントに漏洩する可能性がある。

**方針**: 既存の `DELETE /api/repositories` route.ts のパターン（固定エラーメッセージ）を踏襲する。

| API | 500エラーメッセージ |
|-----|-------------------|
| `PUT /api/repositories/restore` | `"Failed to restore repository"` |
| `GET /api/repositories/excluded` | `"Failed to get excluded repositories"` |
| `DELETE /api/repositories` | `"Failed to delete repository"`（既存） |

**注記**: `error.message` はサーバーログ（`console.error`）にのみ出力し、クライアントには返さない。

### 権限

- 全APIはローカルアクセス前提（リバースプロキシ認証推奨、Issue #179）
- **GET /api/repositories/excluded のパス情報漏洩リスク（SEC-SF-001対応）**: このエンドポイントは除外リポジトリの完全なファイルシステムパス情報を返す。CommandMateはローカルアクセス前提（127.0.0.1バインド）のため通常は問題ないが、リバースプロキシ構成での外部公開時にサーバー上のディレクトリ構造が漏洩するリスクがある。リバースプロキシ使用時はこのエンドポイントへのアクセス制御を推奨する

### レコード蓄積の制限（SEC-SF-004対応）

`disableRepository()` は未登録パスに対しても `enabled=0` で新規レコードを作成する設計のため、攻撃者（またはバグ）がランダムなパスで繰り返し DELETE リクエストを送信した場合、`repositories` テーブルに大量のゴミレコードが蓄積され、SQLiteのパフォーマンス劣化やディスク容量消費につながる。

**対策**: `disableRepository()` で新規レコードを作成する場合、`repositories` テーブルの `enabled=0` レコード数に上限チェックを実装する。

```typescript
// disableRepository() 内での上限チェック例
const MAX_DISABLED_REPOSITORIES = 1000;

const disabledCount = db.prepare(
  'SELECT COUNT(*) as count FROM repositories WHERE enabled = 0'
).get() as { count: number };

if (disabledCount.count >= MAX_DISABLED_REPOSITORIES) {
  throw new Error('Disabled repository limit exceeded');
}
```

**上限超過時の挙動**: エラーをスローし、APIルートで500レスポンスとして返す。クライアントには固定メッセージ「Failed to delete repository」を返す（SEC-SF-003準拠）。

**補足**: Section 15 の C-I01「クリーンアップ機能」と連携し、長期運用時の蓄積レコード管理を実現する。SEC-SF-004対応により、クリーンアップ機能の優先度は「低」のまま維持可能（上限チェックが即時の防御を提供するため）。

### TOCTOU リスクの認識（SEC-SF-005対応）

`PUT /api/repositories/restore` API はリポジトリパスのディスク存在確認（`fs.existsSync()`）後に `scanWorktrees()` を実行する設計だが、存在確認と `scanWorktrees()` の間にディレクトリが削除/移動される TOCTOU（Time of Check to Time of Use）リスクがある。

**リスク評価**: 限定的。理由は以下の通り:
1. `scanWorktrees()` 内部で `path.resolve(rootDir)` が適用され、危険パスのフィルタリングも行われている（`worktrees.ts` line 181-193）
2. `scanWorktrees()` が `cwd` オプション経由でパスを渡しており、コマンド文字列にパスを埋め込んでいないため、コマンドインジェクションリスクはない
3. CommandMateはローカル環境での使用が前提

**方針**: 既存の `scanWorktrees()` 内の安全ガード（path.resolve、パスフィルタリング）に依存する。追加の TOCTOU 対策は実装しないが、リスクを認識した上での設計判断とする

---

## 9. エラーハンドリング

### 復活APIのエラーケース

| ケース | HTTP Status | 対応 |
|--------|------------|------|
| リポジトリが repositories テーブルに未登録 | 404 | エラーレスポンス |
| リポジトリパスがディスク上に不存在 | 200 + warning | enabled=1更新は実行、worktreeCount=0 |
| syncWorktreesToDB() が例外スロー | 500 | enabled=1は既にコミット済み。再実行で解決可能。エラーメッセージは固定文字列「Failed to restore repository」を返す（SEC-SF-003対応） |

### DELETE APIのエラーケース

| ケース | 対応 |
|--------|------|
| disableRepository() 成功、worktreeIds が0件 | 除外登録は完了、404レスポンス返却（SF-C01対応: 除外登録後に404を返す） |
| disableRepository() でDB更新失敗 | 500レスポンス（例外がスローされる） |
| worktreeIds が1件以上、後続処理失敗 | 500レスポンス（既存動作維持）。除外登録は既にコミット済み |

**注記（SF-C01）**: `worktreeIds.length === 0` の場合、既存の404レスポンスは維持するが、`disableRepository()` は先に実行済みのため除外登録は完了している。これにより、一度も Sync All されていないリポジトリを削除した場合でも、次回の Sync All で復活しない。

---

## 10. 設計パターン

### 採用パターン

| パターン | 適用箇所 | 理由 |
|---------|---------|------|
| Repository パターン | db-repository.ts | データアクセス抽象化（既存） |
| Facade パターン | `disableRepository()`, `ensureEnvRepositoriesRegistered()`, `filterExcludedPaths()` | 複合ロジックのカプセル化（SF-002/MF-001/SF-003対応） |

### 不採用パターン

| パターン | 理由 |
|---------|------|
| Observer パターン | 削除→除外の同期は単純なAPI呼び出しで十分 |
| Strategy パターン | 除外方式は1種類（enabled カラム）のみ |

### APIルートの責務原則（MF-001/SF-002対応）

APIルート（route.ts）の責務は以下に限定する:
1. リクエストパラメータの取得・バリデーション
2. ビジネスロジック関数の呼び出し（1関数呼び出しを原則とする）
3. レスポンスの構築・返却
4. エラーハンドリング

ビジネスロジック（データ操作、条件分岐、ループ処理等）はAPIルートに直接記述せず、`db-repository.ts` または `worktrees.ts` の関数に切り出す。

---

## 11. 変更対象ファイル一覧

| ファイル | 変更種別 | 変更内容 |
|---------|---------|---------|
| `src/lib/db-repository.ts` | 修正 | `resolveRepositoryPath()`, `ensureEnvRepositoriesRegistered()`, `filterExcludedPaths()`, `disableRepository()`, `getExcludedRepositoryPaths()`, `getExcludedRepositories()`, `restoreRepository()` 追加。`createRepository()` の enabled デフォルト値ロジックにコードコメント追加（MF-C01）。`filterExcludedPaths()` にOS依存パス比較の注記追加（SEC-SF-002）。`disableRepository()` に disabled レコード数上限チェック追加（SEC-SF-004） |
| `src/app/api/repositories/route.ts` | 修正 | DELETE時に `disableRepository()` 呼び出し追加（worktreeIdsチェックの前に配置、SF-C01対応）。`repositoryPath` のパストラバーサルバリデーション追加: null byte チェック + `isSystemDirectory()` チェック（SEC-MF-001対応） |
| `src/app/api/repositories/sync/route.ts` | 修正 | `ensureEnvRepositoriesRegistered()` + `filterExcludedPaths()` 呼び出し追加 |
| `src/app/api/repositories/excluded/route.ts` | 新規 | 除外リポジトリ一覧API。500エラーは固定メッセージ「Failed to get excluded repositories」を返す（SEC-SF-003対応） |
| `src/app/api/repositories/restore/route.ts` | 新規 | 復活API。`repositoryPath` のパストラバーサルバリデーション追加（SEC-MF-001対応）。500エラーは固定メッセージ「Failed to restore repository」を返す（SEC-SF-003対応） |
| `src/components/worktree/WorktreeList.tsx` | 修正 | 警告メッセージ更新、除外リポジトリ一覧セクション追加、`isInEnvVar()` の使用廃止検討（C-C03） |
| `src/lib/api-client.ts` | 修正 | `getExcluded()`, `restore()` メソッド追加 |
| `tests/integration/api-repository-delete.test.ts` | 修正 | DELETE API の制御フロー変更（`disableRepository()` 追加）に伴う既存テストケースの期待値更新（MF-I01対応） |

### 間接影響ファイル（SF-I01対応）

| ファイル | 影響内容 | リスク |
|---------|---------|-------|
| `src/components/repository/RepositoryManager.tsx` | Sync All 後の表示メッセージ「Successfully synced X worktree(s) from Y repository/repositories」の `repositoryCount` と `worktreeCount` が除外リポジトリ分だけ減少する。機能的には問題ないが、ユーザーの期待値に影響する可能性がある | 低 |
| `src/app/api/repositories/scan/route.ts` | scan 経由で追加された worktree が、同パスの `enabled=0` リポジトリがある場合に次回 Sync All で消失する可能性（SF-I02、フォローアップIssue候補） | 中 |
| `src/lib/clone-manager.ts` | `onCloneSuccess()` の `createRepository()` が `enabled=0` の同パスレコード存在時に UNIQUE 制約違反（SF-I03、フォローアップIssue候補） | 中 |
| `tests/unit/db-repository-delete.test.ts` | `getWorktreeIdsByRepository` 単体テストは影響なし（関数シグネチャ変更なし） | 低 |

### 依存関係の変更

| 変更元 | 変更先 | 種別 |
|--------|--------|------|
| `sync/route.ts` | `db-repository.ts` | 新規import（`ensureEnvRepositoriesRegistered`, `filterExcludedPaths`） |
| `route.ts` (DELETE) | `db-repository.ts` | 新規import（`disableRepository`） |
| `route.ts` (DELETE) | `system-directories.ts` | 新規import（`isSystemDirectory`、SEC-MF-001対応） |
| `restore/route.ts` | `system-directories.ts` | 新規import（`isSystemDirectory`、SEC-MF-001対応） |

循環依存は発生しない（一方向の依存）。

---

## 12. テスト方針

### ユニットテスト

| テスト対象 | テストケース |
|-----------|------------|
| `resolveRepositoryPath()` | 相対パスが絶対パスに解決されること |
| `resolveRepositoryPath()` | 末尾スラッシュが正規化されること |
| `ensureEnvRepositoriesRegistered()` | 未登録リポジトリが enabled=1, is_env_managed=1 で登録されること |
| `ensureEnvRepositoriesRegistered()` | 既登録リポジトリは重複登録されないこと（冪等性） |
| `filterExcludedPaths()` | enabled=0 のリポジトリパスが除外されること |
| `filterExcludedPaths()` | enabled=1 のリポジトリパスは残ること |
| `disableRepository()` | 既存レコードの enabled を 0 に更新すること |
| `disableRepository()` | 未登録の場合 enabled=0 で新規登録すること |
| `getExcludedRepositoryPaths()` | enabled=0のパスリストを返すこと |
| `getExcludedRepositories()` | enabled=0のリポジトリ一覧を返すこと |
| `restoreRepository()` | enabled=1に更新し、更新後のリポジトリを返すこと |
| `restoreRepository()` | 存在しないパスの場合nullを返すこと |
| パス正規化 | `resolveRepositoryPath()` 経由で一貫した正規化が行われること |
| `createRepository()` enabled デフォルト | `enabled: undefined` で呼び出した場合に `1` として格納されることを検証（MF-C01） |
| DELETE API | `disableRepository()` が worktreeIdsチェックの前に呼ばれること（SF-C01） |
| DELETE API（worktreeIds=0） | `disableRepository()` 呼び出し後、404レスポンスが返ること（SF-C01） |
| 復活API | enabled=1更新 + syncWorktreesToDB自動実行でworktrees復元 |
| 復活APIエラー | 404, warning付き200, 500の各ケース |
| CM_ROOT_DIR除外 | CM_ROOT_DIR設定時でも除外が有効であること |
| DELETE API パストラバーサル | null byte を含むパスで 400 エラーが返ること（SEC-MF-001） |
| DELETE API パストラバーサル | システムディレクトリパス（`/etc`, `/usr`）で 400 エラーが返ること（SEC-MF-001） |
| restore API パストラバーサル | null byte を含むパスで 400 エラーが返ること（SEC-MF-001） |
| restore API パストラバーサル | システムディレクトリパスで 400 エラーが返ること（SEC-MF-001） |
| `filterExcludedPaths()` パス正規化 | `resolveRepositoryPath()` 正規化が登録時とフィルタリング時の両側で適用されていること（SEC-SF-002） |
| 新規API 500エラーレスポンス | `restore/route.ts` の500エラーに内部エラー詳細が含まれないこと（SEC-SF-003） |
| 新規API 500エラーレスポンス | `excluded/route.ts` の500エラーに内部エラー詳細が含まれないこと（SEC-SF-003） |
| `disableRepository()` 上限チェック | `MAX_DISABLED_REPOSITORIES` 上限超過時にエラーがスローされること（SEC-SF-004） |

### 統合テスト

| テスト対象 | テストケース |
|-----------|------------|
| GET /api/repositories/excluded | 除外リポジトリ一覧の正常取得 |
| PUT /api/repositories/restore | 復活API の正常動作 |
| 複数リポジトリシナリオ | 一部削除→Sync All→未削除リポジトリは正常同期 |
| 未Sync削除シナリオ | 一度もSync Allされていないリポジトリを削除→Sync All→復活しないこと（SF-C01） |

### 既存テストファイルの更新（MF-I01対応）

| テストファイル | 更新内容 | 理由 |
|-------------|---------|------|
| `tests/integration/api-repository-delete.test.ts` | DELETE API の制御フロー変更に伴う期待値更新 | `disableRepository()` が `worktreeIds` チェック前に呼ばれるようになるため、404テストケースで `repositories` テーブルに `enabled=0` のレコードが残る副作用を検証する必要がある |

**具体的な確認ポイント**:
- 「should return 404 if repository has no worktrees」テストケースで、404レスポンスが返される前に `disableRepository()` が実行され、`repositories` テーブルに `enabled=0` のレコードが登録/更新されることを検証
- 既存のテストケースが `disableRepository()` の追加後も意図通りに動作することを確認
- `repositories` テーブルの状態をテスト後に確認するアサーションの追加

### パス整合性テスト（SF-I04対応）

| テスト対象 | テストケース |
|-----------|------------|
| パス整合性 | `resolveRepositoryPath()` で正規化したパスと `scanWorktrees()` 内部の `path.resolve(rootDir)` で生成されるパスが一致すること |
| パス整合性 | 末尾スラッシュ付きパスが環境変数に設定された場合、`worktrees.repositoryPath` と `repositories.path` が正規化後に一致すること |
| パス整合性 | `filterExcludedPaths()` の `Array.includes()` 比較で、正規化により一致するケース・不一致ケースが正しく判定されること |

---

## 13. 設計上の決定事項とトレードオフ

| 決定事項 | 理由 | トレードオフ |
|---------|------|-------------|
| `repositories.enabled` カラム活用 | 既存スキーマ活用、追加マイグレーション不要 | クローン機能との意味的共有（C-C02参照） |
| 除外フィルタリングを `filterExcludedPaths()` に集約（SF-003） | OCP準拠。除外条件変更時にAPIルートを修正不要 | 関数呼び出しの1レイヤー追加 |
| DELETE時のロジックを `disableRepository()` に集約（SF-002） | SRP準拠。route.ts の責務をリクエスト処理に限定 | 関数の粒度が細かくなる |
| 自動登録ロジックを `ensureEnvRepositoriesRegistered()` に集約（MF-001） | SRP準拠。APIルートにビジネスロジックを混入させない | db-repository.ts の関数数が増加 |
| パス正規化を `resolveRepositoryPath()` に集約（SF-001） | DRY準拠。正規化忘れを構造的に防止 | 軽微な関数呼び出しオーバーヘッド |
| DELETE時にrepositoriesレコード保持 | 除外状態を永続化 | レコードが蓄積される |
| 復活API内で自動sync（SF-004注記あり） | ユーザーの手動操作を削減 | API応答が遅くなる可能性。将来的に非同期化を検討 |
| ボディベースAPI設計 | 既存DELETE APIとの統一性 | REST原則からの逸脱 |
| 復活APIにPUTを採用（SF-C03対応） | `enabled` フラグ更新に加えて `scanWorktrees()` + `syncWorktreesToDB()` という副作用を伴うため、リソースの完全な状態復元を表す PUT が適切。PATCH は部分更新の意味が強い | 既存プロジェクトの PATCH パターン（例: `PATCH /api/worktrees/:id`）との不統一 |
| `disableRepository()` を worktreeIds チェックの前に配置（SF-C01対応） | 未Sync リポジトリでも除外登録を確実に実行 | 404レスポンス時でもDB書き込みが発生する |
| `enabled` パラメータを常に明示的に渡す（MF-C01対応） | `undefined` のデフォルト動作（`!== false` -> `1`）への暗黙依存を回避 | コード量が微増 |
| null byte + `isSystemDirectory()` チェック（SEC-MF-001対応） | パストラバーサルによる不正パスの DB 登録とパス情報漏洩を防止 | APIルートにバリデーションコードが追加される（ビジネスロジックではなく入力検証のため許容） |
| 新規APIの500エラーで固定メッセージ返却（SEC-SF-003対応） | 内部例外メッセージ（DBエラー詳細、ファイルパス等）のクライアント漏洩を防止 | デバッグ時にクライアント側から原因特定が困難（サーバーログで対応） |
| `MAX_DISABLED_REPOSITORIES=1000` 上限チェック（SEC-SF-004対応） | ランダムパスによる無制限レコード蓄積を防止 | 正当な大量削除操作が上限に達する可能性（1000件は十分に余裕がある想定） |
| restore API のTOCTOU 対策は既存安全ガード依存（SEC-SF-005対応） | 追加の対策コストを回避。ローカル環境前提でリスクは限定的 | 理論上のレースコンディションは残存 |

---

## 14. 破壊的変更

| 対象 | 変更内容 | 影響 |
|------|---------|------|
| DELETE /api/repositories | 「一時的な削除」→「永続的な除外」 | Sync Allで復活しなくなる（本Issueの目的） |

この変更は意図的な仕様変更であり、Issue #190の目的そのもの。

---

## 15. スコープ外事項

- `scan/route.ts` 経由のリポジトリの `repositories` テーブル登録（フォローアップIssue候補、**優先度: 中**。C-C01: scan 経由で登録されたリポジトリは `repositories` テーブルと不整合になる。ただし scan 経由のリポジトリは環境変数管理ではないため Sync All 復活問題の対象外。データ整合性の観点からフォローアップを推奨）
  - **回帰リスク（SF-I02対応）**: 過去に除外された（`enabled=0`）リポジトリと同じパスの worktree を `scan/route.ts` で追加した場合、次回の Sync All で除外フィルタにより削除される可能性がある。ユーザー操作のシナリオとして: (1) リポジトリAを削除（`enabled=0`に設定）、(2) scan 経由でリポジトリAの worktree を個別追加、(3) Sync All 実行でリポジトリAは除外対象のためスキャンされず、(2)で追加した worktree も同期されない。**対策案**: scan 経由の追加時に `repositories` テーブルの `enabled` 状態を確認し、`enabled=0` の場合は警告を返すか、自動的に `enabled=1` に復帰させる。フォローアップIssueで対応する
- `clone-manager.ts` の `onCloneSuccess()` での UNIQUE 制約違反対策（フォローアップIssue候補、**優先度: 中**（SF-I03対応で優先度明確化））
  - **具体的シナリオ**: (1) リポジトリAを削除（`enabled=0`、`repositories.path` にレコード残存）、(2) 同じパスへ再クローン試行、(3) `onCloneSuccess()` -> `createRepository()` で `repositories.path` の UNIQUE 制約違反で INSERT 失敗。**対策案**: `createRepository()` で UNIQUE 制約違反時に既存レコードの `enabled` を `1` に復帰させる `INSERT OR REPLACE` パターン、または `disableRepository()` の逆操作として `restoreRepository()` を呼び出すパターンを検討
- E2Eテスト（Nice to Have）
- `getExcludedRepositoryPaths()` と `getExcludedRepositories()` の統合（C-001: パフォーマンス要件がなければ後者のみにして `.map(r => r.path)` で対応可能。現設計でもオーバーヘッドは最小限のためそのまま維持）
- sync/route.ts から db-repository.ts への依存注入化（C-002: 現プロジェクト規模では直接依存で十分。大規模化時にリファクタリング検討）
- `repositories` テーブルの `enabled=0` レコードクリーンアップ機能（C-I01: 長期運用時のテーブルサイズ増加対策。一定期間以上 `enabled=0` のレコードを削除する機能を将来検討。SEC-SF-004対応で `MAX_DISABLED_REPOSITORIES=1000` の上限チェックを導入したため、クリーンアップ機能の優先度は「低」のまま維持可能）
- DELETE API の副作用ドキュメント化（C-I03: `worktreeIds=0` で 404 を返しつつも DB 書き込みが発生するセマンティクス変更。将来 API を公開する場合にドキュメントに副作用を明記する必要がある）
- CSRF対策（SEC-C-001: DELETE, PUT, POST の状態変更APIにCSRFトークン検証がない。ローカルアクセス前提のため現時点では問題ないが、リバースプロキシ経由での外部公開時にCSRF攻撃のリスクがある。本Issue固有の問題ではなくプロジェクト全体の課題。将来的に外部公開を想定する場合にフォローアップIssueを検討）
- 除外登録/復活操作の監査ログ（SEC-C-002: `disableRepository()` と `restoreRepository()` の呼び出しに対する監査ログが設計に含まれていない。CLIモジュールでは `security-logger.ts` を使用したセキュリティイベントログが実装されているが、本設計では `console.info` のみ。`console.info` レベルのログ出力は既存の DELETE route.ts パターンで確保されているため、最低限の追跡は可能。将来的にセキュリティログの統合を検討）
- `scanWorktrees()` の `exec()` から `execFile()` への移行（SEC-C-003: `scanWorktrees()` で使用されている `exec('git worktree list', { cwd: rootDir })` は、`cwd` オプション経由でパスを渡しておりコマンド文字列にパスを埋め込んでいないため直接的なインジェクションリスクはない。`git-utils.ts` では既に `execFile` 使用パターンが確立されており、将来的に統一することを検討）

---

## 16. レビュー履歴

| 日付 | ステージ | レビュー種別 | 結果 | スコア |
|------|---------|------------|------|--------|
| 2026-02-08 | Stage 1 | 設計原則レビュー（通常レビュー） | 条件付き承認 | 4/5 |
| 2026-02-08 | Stage 2 | 整合性レビュー | 条件付き承認 | 4/5 |
| 2026-02-08 | Stage 3 | 影響分析レビュー | 条件付き承認 | 4/5 |
| 2026-02-08 | Stage 4 | セキュリティレビュー（OWASP Top 10準拠確認） | 条件付き承認 | 4/5 |

---

## 17. レビュー指摘事項サマリー

### Stage 1: 設計原則レビュー（2026-02-08）

#### Must Fix

| ID | 原則 | 指摘内容 | 対応状況 | 対応セクション |
|----|------|---------|----------|--------------|
| MF-001 | SRP | sync/route.ts に環境変数リポジトリ自動登録ロジックを直接配置 | 反映済み | 2, 4.1, 5, 10, 11 |

#### Should Fix

| ID | 原則 | 指摘内容 | 対応状況 | 対応セクション |
|----|------|---------|----------|--------------|
| SF-001 | DRY | path.resolve() によるパス正規化が複数箇所に分散 | 反映済み | 5, 7 |
| SF-002 | SRP | DELETE route の repositories テーブル操作が route.ts に直接記述 | 反映済み | 2, 4.1, 5, 10 |
| SF-003 | OCP | 除外判定ロジックの拡張性 | 反映済み | 2, 4.1, 5, 13 |
| SF-004 | KISS | 復活API内での自動sync実行の複雑性 | 反映済み（注記追加） | 2, 13 |

#### Consider（将来検討）

| ID | 原則 | 指摘内容 | 対応 |
|----|------|---------|------|
| C-001 | YAGNI | getExcludedRepositoryPaths() と getExcludedRepositories() の2関数 | スコープ外事項に記載。現設計維持 |
| C-002 | DIP | sync/route.ts から db-repository.ts への直接依存 | スコープ外事項に記載。現規模では許容 |
| C-003 | YAGNI | scan/route.ts のスコープ外判断 | 現設計のスコープ判断を維持 |

### Stage 2: 整合性レビュー（2026-02-08）

#### Must Fix

| ID | カテゴリ | 指摘内容 | 対応状況 | 対応セクション |
|----|---------|---------|----------|--------------|
| MF-C01 | 関数シグネチャ整合性 | createRepository() の enabled デフォルト値ロジック（`data.enabled !== false ? 1 : 0`）が直感的でなく、バグ混入リスクがある | 反映済み | 3, 5, 12, 13, 18 |

#### Should Fix

| ID | カテゴリ | 指摘内容 | 対応状況 | 対応セクション |
|----|---------|---------|----------|--------------|
| SF-C01 | データフロー整合性 | DELETE /api/repositories の worktreeIds.length === 0 時の 404 早期リターンで disableRepository() が呼ばれない | 反映済み | 2, 4.1, 9, 12, 13, 18 |
| SF-C02 | パス正規化整合性 | resolveRepositoryPath() がシンボリックリンクを解決しない問題 | 反映済み | 5, 7 |
| SF-C03 | APIパターン整合性 | PUT /api/repositories/restore のHTTPメソッド選択がプロジェクトの既存PATCHパターンと不整合 | 反映済み | 4.2, 13 |
| SF-C04 | セクション間整合性 | Section 2 と Section 4.1 のフロー図/コード例の粒度差異（getDbInstance() の省略） | 反映済み | 2 |

#### Consider（将来検討）

| ID | カテゴリ | 指摘内容 | 対応 |
|----|---------|---------|------|
| C-C01 | 既存コード整合性 | scan/route.ts が repositories テーブルに登録しないことによるデータ不整合 | スコープ外事項に優先度を明確化して記載（Section 15） |
| C-C02 | データモデル整合性 | repositories.enabled がクローン機能と除外機能で意味的に共有される | Section 3 にクローンリポジトリ enabled=0 時の挙動を明記 |
| C-C03 | UI整合性 | isInEnvVar() 関数の使用継続/廃止が不明確 | Section 6.1 に廃止方針を明記、Section 11 に変更内容を追記 |

### Stage 3: 影響分析レビュー（2026-02-08）

#### Must Fix

| ID | カテゴリ | 指摘内容 | 対応状況 | 対応セクション |
|----|---------|---------|----------|--------------|
| MF-I01 | テストカバレッジ | 既存統合テスト `api-repository-delete.test.ts` の更新が設計書に記載されていない。`disableRepository()` の追加により既存テストの期待値が変わる可能性がある | 反映済み | 11, 12, 18 |

#### Should Fix

| ID | カテゴリ | 指摘内容 | 対応状況 | 対応セクション |
|----|---------|---------|----------|--------------|
| SF-I01 | 間接影響 | `RepositoryManager.tsx` の Sync All ボタンのレスポンス値（`repositoryCount`, `worktreeCount`）が除外分だけ減少する影響が未記載 | 反映済み | 2, 11 |
| SF-I02 | 間接影響 | `scan/route.ts` 経由で追加した worktree が、同パスの `enabled=0` リポジトリがある場合に次回 Sync All で消失する回帰リスク | 反映済み | 15 |
| SF-I03 | テストカバレッジ | `clone-manager.ts` の `onCloneSuccess()` で `enabled=0` の同パスレコード存在時に UNIQUE 制約違反となるシナリオのテストが不足 | 反映済み | 12, 15 |
| SF-I04 | パス不整合リスク | `worktrees.repositoryPath` と `repositories.path` の整合性確認テストが不足。`scanWorktrees()` 内部の `path.resolve(rootDir)` とのパス表現不一致リスク | 反映済み | 7, 12 |
| SF-I05 | UI影響 | `NEXT_PUBLIC_WORKTREE_REPOS` が `next.config.js` の env ブロックに未設定のため、`isInEnvVar()` が常に `false` を返す可能性が高い。C-C03 の廃止方針を裏付ける現状実態 | 反映済み | 6.1 |

#### Consider（将来検討）

| ID | カテゴリ | 指摘内容 | 対応 |
|----|---------|---------|------|
| C-I01 | 将来影響 | `disableRepository()` が存在しないパスでもレコードを蓄積する。長期運用時のテーブルサイズ増加リスク | 将来検討事項として記載（Section 15） |
| C-I02 | 将来影響 | 除外リポジトリ一覧セクション追加時の WebSocket `repository_deleted` イベント受信による再取得トリガーの検討 | 実装時に検討。将来検討事項として記載 |
| C-I03 | 後方互換性 | DELETE API の `worktreeIds=0` 時に 404 を返しつつ DB 書き込みが発生するセマンティクス変更。現時点では単一アプリケーションのため問題ない | 将来 API 公開時にドキュメント明記が必要 |

### Stage 4: セキュリティレビュー（2026-02-08）

#### Must Fix

| ID | カテゴリ（OWASP） | 指摘内容 | 対応状況 | 対応セクション |
|----|------------------|---------|----------|--------------|
| SEC-MF-001 | A03:2021 - Injection (Path Traversal) | `repositoryPath` 入力に対するパストラバーサル防御が不十分。`typeof === 'string'` と空文字チェックのみでは、悪意のあるパス（`/etc/passwd`, `../../../../etc/passwd`）が `repositories` テーブルに登録され、`GET /api/repositories/excluded` API経由でパス情報が漏洩する可能性がある | 反映済み | 8, 11, 18 |

#### Should Fix

| ID | カテゴリ（OWASP） | 指摘内容 | 対応状況 | 対応セクション |
|----|------------------|---------|----------|--------------|
| SEC-SF-001 | A01:2021 - Broken Access Control | `GET /api/repositories/excluded` APIが認証なしでファイルシステムパス情報を返す。リバースプロキシ構成での外部公開時にディレクトリ構造漏洩リスク | 反映済み | 8 |
| SEC-SF-002 | A03:2021 - Injection (SQL Injection) | `filterExcludedPaths()` の `Array.includes()` パス比較がOS依存（macOS: case-insensitive FS vs case-sensitive比較）。`resolveRepositoryPath()` 正規化の両側適用で緩和 | 反映済み | 5, 7, 8, 12, 18 |
| SEC-SF-003 | A05:2021 - Security Misconfiguration | 新規APIの500エラーレスポンスで `error.message` をそのまま返すと内部例外メッセージ（DBエラー詳細、ファイルパス等）が漏洩する。既存DELETE APIの固定メッセージパターンを踏襲すべき | 反映済み | 4.2, 8, 9, 11, 18 |
| SEC-SF-004 | A04:2021 - Insecure Design | `disableRepository()` による無制限レコード蓄積リスク。未登録パスに対する `enabled=0` 新規レコード作成が無制限 | 反映済み | 5, 8, 12, 15, 18 |
| SEC-SF-005 | A08:2021 - Software and Data Integrity Failures | 復活API（`PUT /api/repositories/restore`）でのファイルシステム存在確認と `scanWorktrees()` 間のTOCTOUリスク。既存の `scanWorktrees()` 内安全ガードで緩和 | 反映済み | 8 |

#### Consider（将来検討）

| ID | カテゴリ（OWASP） | 指摘内容 | 対応 |
|----|------------------|---------|------|
| SEC-C-001 | A01:2021 - Broken Access Control | DELETE, PUT, POST の状態変更APIにCSRFトークン検証がない。ローカルアクセス前提のため現時点では問題なし。プロジェクト全体の課題 | スコープ外事項に記載（Section 15） |
| SEC-C-002 | A09:2021 - Security Logging and Monitoring Failures | 除外登録/復活操作の監査ログ不足。`console.info` レベルは既存パターンで確保済み | スコープ外事項に記載（Section 15） |
| SEC-C-003 | A06:2021 - Vulnerable and Outdated Components | `scanWorktrees()` の `exec()` から `execFile()` への移行検討。現状のexec + cwdパターンは安全 | スコープ外事項に記載（Section 15） |

#### OWASP Top 10 準拠状況

| カテゴリ | 状態 | 備考 |
|---------|------|------|
| A01: Broken Access Control | pass (注記あり) | ローカルアクセス前提。SEC-SF-001対応済み（パス情報漏洩リスク明記） |
| A02: Cryptographic Failures | N/A | 本設計で暗号化対象データなし |
| A03: Injection | conditional pass | SQL: プリペアドステートメントで安全。Path Traversal: SEC-MF-001対応済み |
| A04: Insecure Design | pass (注記あり) | SEC-SF-004対応済み（レコード蓄積上限チェック追加） |
| A05: Security Misconfiguration | conditional pass | SEC-SF-003対応済み（固定エラーメッセージ採用） |
| A06: Vulnerable Components | pass | 新規依存関係追加なし。exec() 使用は既存パターン踏襲 |
| A07: Auth Failures | N/A | Issue #179で認証機構廃止済み。リバースプロキシ認証推奨 |
| A08: Software and Data Integrity | pass (注記あり) | SEC-SF-005対応済み（TOCTOUリスク認識、既存安全ガード依存） |
| A09: Logging and Monitoring | pass (注記あり) | console.infoレベルのログは既存パターンで確保。SEC-C-002は将来検討 |
| A10: SSRF | N/A | 本設計にサーバーサイドリクエスト発行処理なし |

### 整合性チェックリスト（Stage 2レビュー後）

| チェック項目 | 状態 | 備考 |
|------------|------|------|
| コード構造 | pass | レイヤー構成（API -> ビジネスロジック -> データアクセス）は既存パターンと一致 |
| 関数シグネチャ | pass | MF-C01対応済み。enabled デフォルト値の挙動を明文化 |
| データモデル | pass | 既存スキーマと完全一致。新規マイグレーション不要 |
| APIエンドポイント | pass | SF-C01対応済み。DELETE フローの制御順序を修正。SF-C03対応済み。PUTメソッド選択の根拠を明記 |
| セクション間整合性 | pass | SF-C04対応済み。フロー図とコード例の粒度を一致 |

### 設計原則チェックリスト（Stage 1レビュー後）

| 原則 | 状態 | 備考 |
|------|------|------|
| SRP | pass | MF-001/SF-002対応済み。APIルートの責務原則を明確化 |
| OCP | pass | SF-003対応済み。除外判定ロジックをカプセル化 |
| LSP | pass | 新規関数はRepository型の既存契約に従っている |
| ISP | pass | 不要なプロパティの追加なし |
| DIP | acceptable | 現プロジェクト規模では直接依存で十分（C-002） |
| KISS | pass | 既存enabledカラム活用。復活API自動syncはUXトレードオフ（SF-004注記） |
| YAGNI | pass | スコープ外事項が明確。必要最小限の機能 |
| DRY | pass | SF-001対応済み。resolveRepositoryPath()でパス正規化を集約 |

### 影響分析チェックリスト（Stage 3レビュー後）

| チェック項目 | 状態 | 備考 |
|------------|------|------|
| 既存テストへの影響 | pass | MF-I01対応済み。`api-repository-delete.test.ts` を変更対象ファイルとテスト方針に追加 |
| 間接影響（UI） | pass | SF-I01対応済み。`RepositoryManager.tsx` の Sync All メッセージへの影響を認識・記載 |
| 間接影響（scan/route.ts） | pass | SF-I02対応済み。回帰リスクをフォローアップIssueとして明示化 |
| テストカバレッジ（clone-manager） | pass | SF-I03対応済み。UNIQUE 制約違反シナリオをフォローアップIssueに明示化 |
| パス整合性 | pass | SF-I04対応済み。`worktrees.repositoryPath` と `repositories.path` の整合性テストを追加 |
| UI影響（isInEnvVar） | pass | SF-I05対応済み。`isInEnvVar()` が現時点で既に正常動作していない可能性を Implementation Note として追記 |

### セキュリティチェックリスト（Stage 4レビュー後）

| チェック項目 | 状態 | 備考 |
|------------|------|------|
| パストラバーサル防御 | pass | SEC-MF-001対応済み。null byte チェック + `isSystemDirectory()` チェックを Section 8 に明記 |
| ファイルパス情報漏洩 | pass | SEC-SF-001対応済み。リバースプロキシ使用時のアクセス制御推奨を Section 8 に明記 |
| パス比較のOS依存性 | pass | SEC-SF-002対応済み。`filterExcludedPaths()` の JSDoc と Section 8 にOS依存性を明記 |
| エラーレスポンス情報漏洩 | pass | SEC-SF-003対応済み。新規APIで固定エラーメッセージ採用を Section 4.2, 8, 9 に明記 |
| レコード蓄積制限 | pass | SEC-SF-004対応済み。`MAX_DISABLED_REPOSITORIES=1000` 上限チェックを Section 5, 8 に明記 |
| TOCTOU リスク | pass | SEC-SF-005対応済み。既存 `scanWorktrees()` の安全ガード依存を Section 8 に明記 |
| OWASP Top 10 準拠 | pass | 全10カテゴリの評価完了。N/A: 3件、pass: 3件、pass(注記あり): 2件、conditional pass: 2件 |

---

## 18. 実装チェックリスト

### 必須（Must Fix対応）

- [ ] **MF-001**: `ensureEnvRepositoriesRegistered(db, repositoryPaths)` を `db-repository.ts` に実装
- [ ] **MF-001**: `sync/route.ts` から自動登録ループを削除し、`ensureEnvRepositoriesRegistered()` の呼び出しに置換
- [ ] **MF-001**: `sync/route.ts` にビジネスロジック（for文、条件分岐等）が直接記述されていないことを確認
- [ ] **MF-C01**: `createRepository()` の `enabled` デフォルト値ロジック（`data.enabled !== false ? 1 : 0`）にコードコメントを追加し、`undefined` 時に `1`（有効）となる挙動を明文化
- [ ] **MF-C01**: `ensureEnvRepositoriesRegistered()` と `disableRepository()` で `enabled` パラメータを常に明示的に渡す（`true` / `false`、`undefined` に依存しない）
- [ ] **MF-I01**: `tests/integration/api-repository-delete.test.ts` の既存テストケースを更新し、`disableRepository()` 追加による制御フロー変更を反映。特に「should return 404 if repository has no worktrees」テストケースで `repositories` テーブルの `enabled=0` レコード残存を検証
- [ ] **SEC-MF-001**: `DELETE /api/repositories` の route.ts で `repositoryPath` に対する null byte チェック（`repositoryPath.includes('\0')`）を追加。該当時は 400 エラーを返す
- [ ] **SEC-MF-001**: `DELETE /api/repositories` の route.ts で `path.resolve()` 後のパスに対する `isSystemDirectory()` チェックを追加。該当時は 400 エラーを返す
- [ ] **SEC-MF-001**: `PUT /api/repositories/restore` の route.ts で同様の null byte チェック + `isSystemDirectory()` チェックを追加
- [ ] **SEC-MF-001**: `src/config/system-directories.ts` の `isSystemDirectory()` を import して使用（新規依存追加不要、既存モジュール活用）

### 推奨（Should Fix対応）

- [ ] **SF-001**: `resolveRepositoryPath()` を `db-repository.ts` に実装
- [ ] **SF-001**: 全てのパス正規化箇所で `resolveRepositoryPath()` を使用（直接 `path.resolve()` を呼ばない）
- [ ] **SF-002**: `disableRepository(db, repositoryPath)` を `db-repository.ts` に実装
- [ ] **SF-002**: `route.ts` (DELETE) から repositories テーブル操作ロジックを削除し、`disableRepository()` の呼び出しに置換
- [ ] **SF-003**: `filterExcludedPaths(db, repositoryPaths)` を `db-repository.ts` に実装
- [ ] **SF-003**: `sync/route.ts` のフィルタリングロジックを `filterExcludedPaths()` の呼び出しに置換
- [ ] **SF-004**: 復活フローのトレードオフ（API応答遅延の可能性）をコードコメントに記載
- [ ] **SF-C01**: `route.ts` (DELETE) で `disableRepository()` を `worktreeIds` チェック（404早期リターン）の **前** に配置
- [ ] **SF-C01**: `disableRepository()` が worktreeIds=0 でも実行されることのユニットテスト追加
- [ ] **SF-C02**: `resolveRepositoryPath()` の JSDoc にシンボリックリンク非解決の注記を記載
- [ ] **SF-C03**: `PUT /api/repositories/restore` の HTTPメソッド選択根拠をコードコメントまたは API ドキュメントに記載
- [ ] **SF-C04**: Section 2 のフロー図と Section 4.1 のコード例の粒度が一致していることを確認
- [ ] **SF-I01**: `RepositoryManager.tsx` の Sync All 後メッセージが除外リポジトリ分だけ減少することを認識（コード変更不要、動作確認のみ）
- [ ] **SF-I02**: `scan/route.ts` 経由で `enabled=0` リポジトリと同パスの worktree を追加した場合の回帰リスクをフォローアップIssueとして起票
- [ ] **SF-I03**: `clone-manager.ts` の UNIQUE 制約違反シナリオをフォローアップIssueとして起票
- [ ] **SF-I04**: パス整合性テスト追加（`worktrees.repositoryPath` と `repositories.path` の正規化後一致確認）
- [ ] **SF-I05**: `isInEnvVar()` が `NEXT_PUBLIC_WORKTREE_REPOS` 未設定により既に機能していないことを実装前に確認し、廃止を実行
- [ ] **SEC-SF-001**: `GET /api/repositories/excluded` がファイルパス情報を返すことを Section 8 に記載済みであることを確認。リバースプロキシ使用時のアクセス制御推奨をコードコメントに記載
- [ ] **SEC-SF-002**: `filterExcludedPaths()` の JSDoc にパス比較のOS依存性（macOS case-insensitive FS vs case-sensitive string comparison）を明記
- [ ] **SEC-SF-002**: `resolveRepositoryPath()` の正規化が登録時とフィルタリング時の両側で確実に適用されていることを検証するテストを追加
- [ ] **SEC-SF-003**: `restore/route.ts` の500エラーレスポンスで `error.message` を返さず、固定メッセージ「Failed to restore repository」を使用
- [ ] **SEC-SF-003**: `excluded/route.ts` の500エラーレスポンスで `error.message` を返さず、固定メッセージ「Failed to get excluded repositories」を使用
- [ ] **SEC-SF-003**: 各APIルートの catch ブロックで `console.error` にのみ `error.message` を出力し、クライアントには固定メッセージを返す
- [ ] **SEC-SF-004**: `disableRepository()` に `MAX_DISABLED_REPOSITORIES = 1000` の上限チェックを実装。新規レコード作成前に `enabled=0` レコード数をカウントし、上限超過時はエラーをスロー
- [ ] **SEC-SF-005**: `restore/route.ts` の実装時に TOCTOU リスクを認識した上で、既存の `scanWorktrees()` 内安全ガードに依存する旨をコードコメントに記載

### Consider対応

- [ ] **C-C03**: `WorktreeList.tsx` の `isInEnvVar()` 関数の使用箇所を確認し、不要であれば削除
- [ ] **C-I01**: 長期運用時の `repositories` テーブル `enabled=0` レコード蓄積を監視し、必要に応じてクリーンアップ機能を検討
- [ ] **C-I02**: 除外リポジトリ一覧セクション実装時に、WebSocket `repository_deleted` イベント受信時の除外リポジトリ一覧再取得トリガーを検討
- [ ] **C-I03**: 将来 API を公開する場合、DELETE API の副作用（404レスポンス時でも `disableRepository()` によるDB書き込みが発生する）をAPIドキュメントに明記
- [ ] **SEC-C-001**: 将来的に外部公開を想定する場合、CSRF対策のフォローアップIssueを検討
- [ ] **SEC-C-002**: 将来的にセキュリティログの統合を検討（`security-logger.ts` パターンの Web API への適用）
- [ ] **SEC-C-003**: `scanWorktrees()` の `exec()` から `execFile()` への移行を将来検討（`git-utils.ts` パターン参照）

### 新規関数

- [ ] `resolveRepositoryPath(repoPath)` - パス正規化ヘルパー
- [ ] `ensureEnvRepositoriesRegistered(db, repositoryPaths)` - 環境変数リポジトリ自動登録
- [ ] `filterExcludedPaths(db, repositoryPaths)` - 除外パスフィルタリング
- [ ] `disableRepository(db, repositoryPath)` - リポジトリ除外登録
- [ ] `getExcludedRepositoryPaths(db)` - 除外パスリスト取得
- [ ] `getExcludedRepositories(db)` - 除外リポジトリ詳細取得
- [ ] `restoreRepository(db, repoPath)` - リポジトリ復活

### APIルート

- [ ] `GET /api/repositories/excluded` - 新規作成
- [ ] `PUT /api/repositories/restore` - 新規作成（HTTPメソッド選択根拠: SF-C03対応）
- [ ] `DELETE /api/repositories` - `disableRepository()` 呼び出し追加（worktreeIdsチェックの前に配置: SF-C01対応）
- [ ] `POST /api/repositories/sync` - `ensureEnvRepositoriesRegistered()` + `filterExcludedPaths()` 呼び出し追加

### UI

- [ ] 削除確認ダイアログの警告メッセージ更新（環境変数非依存の統一メッセージ）
- [ ] `isInEnvVar()` 関数の使用廃止・デッドコード削除検討（C-C03対応）
- [ ] 除外リポジトリ一覧セクション追加（折りたたみ形式）
- [ ] `api-client.ts` に `getExcluded()`, `restore()` メソッド追加

### テスト

- [ ] `resolveRepositoryPath()` のユニットテスト
- [ ] `ensureEnvRepositoriesRegistered()` のユニットテスト（冪等性含む）
- [ ] `filterExcludedPaths()` のユニットテスト
- [ ] `disableRepository()` のユニットテスト（既存/未登録の両ケース）
- [ ] `getExcludedRepositoryPaths()` のユニットテスト
- [ ] `getExcludedRepositories()` のユニットテスト
- [ ] `restoreRepository()` のユニットテスト
- [ ] `createRepository()` の enabled デフォルト値テスト（MF-C01: `undefined` -> `1` の検証）
- [ ] DELETE API の `disableRepository()` 実行順序テスト（SF-C01: worktreeIds=0 でも除外登録完了）
- [ ] 統合テスト（除外→Sync All→復活のフルフロー）
- [ ] 統合テスト（未Syncリポジトリの削除→Sync All→復活しないことの検証、SF-C01）
- [ ] **MF-I01**: `tests/integration/api-repository-delete.test.ts` の既存テストケース更新（`disableRepository()` 追加による副作用の検証）
- [ ] **MF-I01**: DELETE API の404テストケースで `repositories` テーブルに `enabled=0` レコードが残ることを検証するアサーション追加
- [ ] **SF-I04**: パス整合性テスト（`worktrees.repositoryPath` と `repositories.path` の正規化後一致確認）
- [ ] **SF-I04**: 末尾スラッシュ付きパスでの正規化整合性テスト
- [ ] **SEC-MF-001**: DELETE API に null byte を含むパスを送信して 400 エラーが返ることを検証するテスト
- [ ] **SEC-MF-001**: DELETE API にシステムディレクトリパス（`/etc`, `/usr`）を送信して 400 エラーが返ることを検証するテスト
- [ ] **SEC-MF-001**: restore API に null byte を含むパスを送信して 400 エラーが返ることを検証するテスト
- [ ] **SEC-MF-001**: restore API にシステムディレクトリパスを送信して 400 エラーが返ることを検証するテスト
- [ ] **SEC-SF-002**: `resolveRepositoryPath()` 正規化が登録時とフィルタリング時の両側で適用されていることの検証テスト
- [ ] **SEC-SF-003**: 新規API（restore, excluded）の500エラーレスポンスに内部エラー詳細が含まれないことを検証するテスト
- [ ] **SEC-SF-004**: `disableRepository()` で `MAX_DISABLED_REPOSITORIES` 上限超過時にエラーがスローされることを検証するテスト

### 品質確認

- [ ] APIルート（route.ts）にビジネスロジック（for文、if-else分岐、DB直接操作）が含まれていないことを確認
- [ ] 全てのパス正規化が `resolveRepositoryPath()` 経由であることを確認
- [ ] `enabled` パラメータが `undefined` に依存せず明示的に渡されていることを確認（MF-C01）
- [ ] `DELETE /api/repositories` と `PUT /api/repositories/restore` で `repositoryPath` に対する null byte チェック + `isSystemDirectory()` チェックが実装されていることを確認（SEC-MF-001）
- [ ] 新規APIの500エラーレスポンスが固定メッセージであり、`error.message` がクライアントに返されていないことを確認（SEC-SF-003）
- [ ] `disableRepository()` に `MAX_DISABLED_REPOSITORIES` 上限チェックが実装されていることを確認（SEC-SF-004）
- [ ] `npm run lint` パス
- [ ] `npx tsc --noEmit` パス
- [ ] `npm run test:unit` パス
