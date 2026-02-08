# Architecture Review Report: Issue #190 - Stage 1 (通常レビュー)

| 項目 | 内容 |
|------|------|
| **Issue** | #190 リポジトリ削除後のSync All復活防止 |
| **フォーカスエリア** | 設計原則 (SOLID / KISS / YAGNI / DRY) |
| **ステージ** | Stage 1 - 通常レビュー |
| **レビュー日** | 2026-02-08 |
| **ステータス** | Conditionally Approved |
| **スコア** | 4 / 5 |

---

## Executive Summary

Issue #190 の設計方針書は、既存の `repositories.enabled` カラムを活用してリポジトリ除外機能を実現する堅実な設計である。新規マイグレーション不要、既存API互換性維持、不採用パターンの明確な理由付けなど、KISS/YAGNI原則への準拠度は高い。

一方で、SRP (単一責任原則) とDRY (重複排除) の観点から改善余地がある。具体的には、環境変数リポジトリ自動登録ロジックとリポジトリ除外処理がAPIルートに直接記述されており、ビジネスロジック層への分離が望ましい。また、パス正規化 (`path.resolve()`) の呼び出しが複数箇所に分散しており、正規化忘れによるバグのリスクがある。

全体として設計品質は高く、条件付き承認とする。

---

## 設計原則チェックリスト

### SOLID原則

| 原則 | 判定 | 詳細 |
|------|------|------|
| **SRP (単一責任)** | Partial | sync/route.ts に自動登録ロジック混入、DELETE route.ts にrepositories操作混入 |
| **OCP (開放閉鎖)** | Partial | 除外フィルタリングがAPIルートに直接埋め込まれている |
| **LSP (リスコフ置換)** | Pass | Repository型の既存契約に準拠 |
| **ISP (インターフェース分離)** | Pass | 必要最小限のインターフェース |
| **DIP (依存性逆転)** | Acceptable | 直接依存だがプロジェクト規模に適切 |

### その他の原則

| 原則 | 判定 | 詳細 |
|------|------|------|
| **KISS** | Pass | 既存カラム活用は最もシンプルなアプローチ |
| **YAGNI** | Pass | スコープが明確に限定されている |
| **DRY** | Partial | path.resolve() が複数箇所に分散 |

---

## 詳細所見

### 必須改善項目 (Must Fix): 1件

#### MF-001: sync/route.ts に環境変数リポジトリ自動登録ロジックを直接配置 [SRP]

**問題**: 設計書のセクション4.2 (POST /api/repositories/sync) では、sync/route.ts 内に以下のビジネスロジックを直接記述している。

```typescript
// 設計書のコード例（sync/route.ts 内）
for (const repoPath of repositoryPaths) {
  const resolvedPath = path.resolve(repoPath);
  const existing = getRepositoryByPath(db, resolvedPath);
  if (!existing) {
    createRepository(db, {
      name: path.basename(resolvedPath),
      path: resolvedPath,
      cloneSource: 'local',
      isEnvManaged: true,
      enabled: true,
    });
  }
}
```

現在の `sync/route.ts` (11行) は非常にシンプルで、`getRepositoryPaths()` -> `scanMultipleRepositories()` -> `syncWorktreesToDB()` の3ステップのみ。ここに自動登録ループ、除外パス取得、フィルタリングの3つのロジックが追加されると、APIルートの責務が「リクエスト処理」から「ビジネスロジック実行」に大きく逸脱する。

**推奨**: 以下のように worktrees.ts または db-repository.ts にビジネスロジックを切り出す。

```
// worktrees.ts に追加
export function ensureEnvRepositoriesRegistered(db, repositoryPaths): void
export function filterExcludedPaths(db, repositoryPaths): string[]

// sync/route.ts は呼び出すだけ
const paths = getRepositoryPaths();
ensureEnvRepositoriesRegistered(db, paths);
const filtered = filterExcludedPaths(db, paths);
const worktrees = await scanMultipleRepositories(filtered);
syncWorktreesToDB(db, worktrees);
```

**重要度**: Medium - 機能的には動作するが、テスタビリティと保守性に影響する。

---

### 推奨改善項目 (Should Fix): 4件

#### SF-001: path.resolve() によるパス正規化が複数箇所に分散 [DRY]

**問題**: 設計書のセクション7 (パス正規化方針) で方針を定めているが、実際のコードでは以下の箇所で個別に `path.resolve()` を呼び出す設計になっている:

- DELETE route: `path.resolve(repositoryPath)` (セクション4.1)
- sync route: `path.resolve(repoPath)` (セクション4.2)
- フィルタリング: `path.resolve(p)` (セクション4.2)

正規化忘れは `repositories.path` の UNIQUE 制約違反や除外フィルタリングの失敗に直結する。

**推奨**: `getRepositoryByPath()` の内部で `path.resolve()` を適用するか、`normalizeRepositoryPath()` ヘルパーを用意して入口で一度正規化する。

#### SF-002: DELETE route の repositories テーブル操作が route.ts に直接記述 [SRP]

**問題**: 設計書セクション4.1 では DELETE route.ts に以下のロジックを追加する。

```typescript
const repo = getRepositoryByPath(db, resolvedPath);
if (repo) {
  updateRepository(db, repo.id, { enabled: false });
} else {
  createRepository(db, { ... enabled: false });
}
```

既存の `route.ts` (161行) はセッションクリーンアップ -> WebSocketクリーンアップ -> DB削除 -> ブロードキャストという明確なフローを持つ。ここにリポジトリ除外ロジック (get -> 分岐 -> update/create) を追加すると、1つのAPIルートが2つのドメイン (worktrees削除 + repositories除外) を扱うことになる。

**推奨**: `disableRepository(db, repositoryPath)` 関数を `db-repository.ts` に追加し、内部で「既存ならenabled=0更新、未登録ならenabled=0で新規登録」を処理する。route.ts からは1行の関数呼び出しにする。

#### SF-003: 除外判定ロジックの拡張性 [OCP]

**問題**: 除外フィルタリングが `sync/route.ts` 内の `Array.filter + includes` で行われている。

```typescript
const filteredPaths = repositoryPaths.filter(p =>
  !excludedPaths.includes(path.resolve(p))
);
```

将来、パターンベース除外や一時的除外など、除外条件が増えた場合にこのAPIルートを直接変更する必要がある。

**推奨**: `filterExcludedPaths(db, repositoryPaths)` を worktrees.ts に配置し、除外判定ロジックをカプセル化する。

#### SF-004: 復活API内での自動sync実行の複雑性 [KISS]

**問題**: `PUT /api/repositories/restore` が `enabled=1` 更新に加えて `scanWorktrees()` + `syncWorktreesToDB()` も自動実行する。設計書セクション13のトレードオフ表で「API応答が遅くなる可能性」を自認している。

**検討**: restore と sync を分離すればよりシンプルになるが、ユーザーが復活後に手動で Sync All を実行する必要が生じるためUXが低下する。現設計もUXを考慮した合理的な判断であり、許容範囲内。

---

### 検討事項 (Consider): 3件

#### C-001: getExcludedRepositoryPaths() と getExcludedRepositories() の2関数 [YAGNI]

`getExcludedRepositories()` から `.map(r => r.path)` でパスを取得可能であり、2関数は必ずしも必要ない。ただし、sync/route.ts のフィルタリングでは全カラム不要でパスだけ取得する方が効率的であるため、現設計のまま2関数を維持しても問題ない。

#### C-002: sync/route.ts から db-repository.ts への直接依存 [DIP]

プロジェクト規模から直接依存は適切。大規模化時にインターフェース導入を検討する。

#### C-003: scan/route.ts のスコープ外判断 [YAGNI]

`scan/route.ts` 経由のリポジトリ登録をスコープ外としている点は適切。フォローアップIssue候補として記録されている点も良い判断。

---

## リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| 技術的リスク | path.resolve() 正規化忘れによるフィルタリング失敗 | Medium | Low | P2 |
| 技術的リスク | sync/route.ts の複雑化による保守性低下 | Low | Medium | P3 |
| セキュリティ | なし（既存のバリデーションパターン踏襲） | Low | Low | - |
| 運用リスク | 除外レコードの蓄積（物理削除しないため） | Low | Low | P3 |

---

## 設計の良い点

1. **既存スキーマ活用 (KISS/YAGNI)**: `repositories.enabled` カラムが Migration #14 で既に存在しており、新規マイグレーション不要。これは設計判断として非常に優れている。

2. **不採用パターンの明確な理由付け**: Observer パターンと Strategy パターンを不採用とした理由が明確に記載されている (セクション10)。

3. **トレードオフの明示**: セクション13でトレードオフを5項目にわたって明示しており、設計判断の根拠が追跡可能。

4. **エラーハンドリングの網羅性**: セクション9で復活APIとDELETE APIのエラーケースを一覧化しており、特に「リポジトリパスがディスク上に不存在」時の200+warning対応は実用的。

5. **後方互換性維持**: DELETE API のリクエスト/レスポンスフォーマットは変更なし。

6. **テスト方針の具体性**: セクション12のユニットテスト12件、統合テスト3件が具体的に列挙されている。

---

## 既存コードとの整合性確認

| 確認項目 | 結果 |
|---------|------|
| `createRepository()` の `enabled` パラメータ | 既存シグネチャで `enabled?: boolean` をサポート済み (db-repository.ts line 138) |
| `updateRepository()` の `enabled` 更新 | 既存実装で `enabled` 更新をサポート済み (db-repository.ts line 249-251) |
| `getRepositoryByPath()` の存在 | 既存実装あり (db-repository.ts line 214-225) |
| `mapRepositoryRow()` の `enabled` マッピング | 既存実装で `row.enabled === 1` の boolean変換済み (db-repository.ts line 90) |
| `repositories` テーブルの `enabled` カラム | Migration #14 で定義済み (db-migrations.ts line 574) |
| `repositories` テーブルの `is_env_managed` カラム | Migration #14 で定義済み (db-migrations.ts line 578) |
| `session-cleanup.ts` の Facade パターン | DELETE route が `cleanupMultipleWorktrees()` を使用しており、設計書の「従来通り」に合致 |
| `WorktreeList.tsx` の `isInEnvVar()` | 設計書でメッセージ変更対象として明記、現在の実装箇所を確認 (WorktreeList.tsx line 19-25) |
| `repositoryApi` の既存メソッド | `delete`, `scan`, `sync`, `clone`, `getCloneStatus` が存在、設計書の `getExcluded()`, `restore()` 追加は整合的 |

---

## 承認条件

以下の MF-001 が対応されれば承認とする:

- **MF-001**: sync/route.ts から環境変数リポジトリ自動登録ロジックをビジネスロジック層に分離する

SF (推奨改善) 項目は実装時に対応することが望ましいが、必須ではない。

---

## レビュー対象ファイル

| ファイル | パス |
|---------|------|
| 設計方針書 | `dev-reports/design/issue-190-repository-exclusion-on-sync-design-policy.md` |
| db-repository.ts | `src/lib/db-repository.ts` |
| repositories route.ts | `src/app/api/repositories/route.ts` |
| sync route.ts | `src/app/api/repositories/sync/route.ts` |
| scan route.ts | `src/app/api/repositories/scan/route.ts` |
| worktrees.ts | `src/lib/worktrees.ts` |
| session-cleanup.ts | `src/lib/session-cleanup.ts` |
| WorktreeList.tsx | `src/components/worktree/WorktreeList.tsx` |
| api-client.ts | `src/lib/api-client.ts` |
| db-migrations.ts | `src/lib/db-migrations.ts` |
