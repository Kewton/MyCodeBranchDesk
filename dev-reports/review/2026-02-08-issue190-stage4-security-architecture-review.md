# Architecture Review Report: Issue #190 - Stage 4 Security Review

| Item | Value |
|------|-------|
| **Issue** | #190 - リポジトリ削除後のSync All復活防止 |
| **Stage** | 4 - セキュリティレビュー（OWASP Top 10準拠確認） |
| **Date** | 2026-02-08 |
| **Status** | 条件付き承認 (Conditionally Approved) |
| **Score** | 4/5 |
| **Reviewer** | Architecture Review Agent |

---

## 1. Executive Summary

Issue #190 の設計方針書に対するセキュリティレビュー（OWASP Top 10 準拠確認）を実施した。全体として、既存プロジェクトのセキュリティパターン（プリペアドステートメント、パスバリデーション、入力検証）を踏襲した堅実な設計であり、重大なセキュリティ脆弱性は検出されなかった。

ただし、1件の Must Fix 項目として、DELETE API および 復活API の `repositoryPath` パラメータに対するパストラバーサル防御の強化が必要である。現状の設計では `typeof === 'string'` と空文字チェックのみで、`resolveRepositoryPath()` による正規化はあるがバリデーション（許可パス範囲の制限）が不十分である。

---

## 2. Review Scope

### 対象設計書

- `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/dev-reports/design/issue-190-repository-exclusion-on-sync-design-policy.md`

### 確認した既存コード

| File | Purpose |
|------|---------|
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/db-repository.ts` | リポジトリDB操作（新規関数の追加先） |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/app/api/repositories/route.ts` | DELETE API（変更対象） |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/app/api/repositories/sync/route.ts` | Sync API（変更対象） |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/app/api/repositories/scan/route.ts` | Scan API（参考: isPathSafe使用パターン） |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/worktrees.ts` | Worktreeスキャン（exec使用、パスフィルタリング） |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/path-validator.ts` | パス安全性検証ユーティリティ |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/env.ts` | 環境変数管理 |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/db-path-resolver.ts` | DBパス検証（isSystemDirectory使用パターン） |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/clone-manager.ts` | クローン処理（createRepository使用箇所） |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/file-operations.ts` | ファイル操作（セキュリティパターン参考） |
| `/Users/maenokota/share/work/github_kewton/commandmate-issue-190/tests/integration/api-repository-delete.test.ts` | 既存統合テスト |

---

## 3. OWASP Top 10 Compliance Checklist

### A01:2021 - Broken Access Control

| Check Item | Status | Detail |
|-----------|--------|--------|
| Authentication | N/A | ローカルアクセス前提。Issue #179 で認証廃止、リバースプロキシ認証推奨 |
| Authorization | Pass (with note) | 全APIがローカルアクセス前提で一律公開。SEC-SF-001 でパス情報漏洩リスクあり |
| CSRF Protection | N/A (consider) | ローカルアクセス前提のため現時点では不要。将来的な外部公開時に検討（SEC-C-001） |

**結論**: Pass (with note)

### A02:2021 - Cryptographic Failures

| Check Item | Status | Detail |
|-----------|--------|--------|
| Sensitive data encryption | N/A | 本設計で暗号化対象データなし |
| Password/credential storage | N/A | 認証機構なし（Issue #179で廃止済み） |

**結論**: Not Applicable

### A03:2021 - Injection

| Check Item | Status | Detail |
|-----------|--------|--------|
| SQL Injection | Pass | 全SQL操作でプリペアドステートメント使用。`getExcludedRepositoryPaths()` の `SELECT path FROM repositories WHERE enabled = 0` は固定SQL |
| Command Injection | Pass | `scanWorktrees()` は `exec('git worktree list', { cwd: rootDir })` で cwd オプション経由のパス渡し。コマンド文字列への埋め込みなし |
| Path Traversal | **Conditional** | **SEC-MF-001**: DELETE/restore の `repositoryPath` に対するパストラバーサル防御が不十分 |
| Null Byte Injection | Partial | `scanWorktrees()` 内で null byte チェックあり。API入力レベルでは未検証 |

**結論**: Conditionally Pass -- SEC-MF-001 の対応が必要

### A04:2021 - Insecure Design

| Check Item | Status | Detail |
|-----------|--------|--------|
| Business logic abuse | Pass (with note) | `disableRepository()` の無制限レコード蓄積リスク（SEC-SF-004） |
| Rate limiting | N/A | ローカルアクセス前提のため現時点では不要 |

**結論**: Pass (with note)

### A05:2021 - Security Misconfiguration

| Check Item | Status | Detail |
|-----------|--------|--------|
| Error message exposure | **Conditional** | **SEC-SF-003**: 500エラーレスポンスでの内部情報漏洩リスク |
| Default configuration | Pass | デフォルトバインドアドレスが 127.0.0.1 で安全 |
| Debug information | Pass | 本番残留禁止のプロジェクト規約あり |

**結論**: Conditionally Pass -- SEC-SF-003 の対応が推奨

### A06:2021 - Vulnerable and Outdated Components

| Check Item | Status | Detail |
|-----------|--------|--------|
| New dependencies | Pass | 新規依存関係の追加なし |
| Known vulnerabilities | Pass | 既存コンポーネントのみ使用 |

**結論**: Pass

### A07:2021 - Identification and Authentication Failures

| Check Item | Status | Detail |
|-----------|--------|--------|
| Authentication mechanism | N/A | Issue #179 で認証廃止。リバースプロキシ認証推奨 |

**結論**: Not Applicable

### A08:2021 - Software and Data Integrity Failures

| Check Item | Status | Detail |
|-----------|--------|--------|
| Data integrity | Pass (with note) | restore API の TOCTOU リスク（SEC-SF-005）。`scanWorktrees()` 内の安全ガードで緩和 |
| Input validation | Pass | プリペアドステートメントによるDB操作の整合性確保 |

**結論**: Pass (with note)

### A09:2021 - Security Logging and Monitoring Failures

| Check Item | Status | Detail |
|-----------|--------|--------|
| Audit logging | Pass (with note) | console.info での基本ログは既存パターンで確保。専用監査ログ未実装（SEC-C-002） |
| Error logging | Pass | catch 節での console.error 出力 |

**結論**: Pass (with note)

### A10:2021 - Server-Side Request Forgery (SSRF)

| Check Item | Status | Detail |
|-----------|--------|--------|
| External request | N/A | サーバーサイドリクエスト発行処理なし |

**結論**: Not Applicable

---

## 4. Detailed Findings

### 4.1 Must Fix (1 item)

#### SEC-MF-001: repositoryPath入力に対するパストラバーサル防御が不十分

**Category**: A03:2021 - Injection (Path Traversal)
**Severity**: Medium
**Affected**: DELETE /api/repositories, PUT /api/repositories/restore

**Problem**:

設計書 Section 8 の入力バリデーションでは、`repositoryPath` に対して以下のみを規定している:

```
- repositoryPath は typeof === 'string' + 空文字チェック（既存）
- 復活API: 同様のバリデーション
- パストラバーサル: resolveRepositoryPath() で正規化（path.resolve() を内部使用）
```

しかし、`path.resolve()` は正規化のみを行い、パスが安全な範囲内にあるかの検証は行わない。既存の DELETE API (`/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/app/api/repositories/route.ts`) でも同様に `repositoryPath` のパスバリデーションは行われていない（line 61: `if (!repositoryPath || typeof repositoryPath !== 'string')` のみ）。

一方、`scan/route.ts` (`/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/app/api/repositories/scan/route.ts`) では `isPathSafe(repositoryPath, CM_ROOT_DIR)` によるパスバリデーションが実装されている（line 29）。

本設計で `disableRepository()` が未登録パスに対して `enabled=0` で新規レコードを作成する仕様のため、任意のパスが `repositories` テーブルに登録される。`GET /api/repositories/excluded` がこのパス情報を返却するため、攻撃者がディレクトリ構造を推測するためのプローブとして悪用できる（パスの存在確認そのものは行われないが、登録されたパスが一覧に表示される）。

**Comparison with existing patterns**:

| API | Path Validation | Pattern |
|-----|----------------|---------|
| `POST /api/repositories/scan` | `isPathSafe(repositoryPath, CM_ROOT_DIR)` | 安全 |
| `DELETE /api/repositories` (existing) | なし | 不足 |
| `DELETE /api/repositories` (proposed) | `resolveRepositoryPath()` のみ | 不足 |
| `PUT /api/repositories/restore` (new) | `resolveRepositoryPath()` のみ | 不足 |

**Recommendation**:

DELETE API と restore API の route.ts で以下のバリデーションを追加する:

```typescript
// 1. Null byte check
if (repositoryPath.includes('\x00')) {
  return NextResponse.json(
    { success: false, error: 'Invalid repository path' },
    { status: 400 }
  );
}

// 2. System directory check
import { isSystemDirectory } from '@/config/system-directories';
const resolvedPath = path.resolve(repositoryPath);
if (isSystemDirectory(resolvedPath)) {
  return NextResponse.json(
    { success: false, error: 'Invalid repository path' },
    { status: 400 }
  );
}
```

この対策は `db-path-resolver.ts` (`/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/lib/db-path-resolver.ts` line 92) で既に確立されている `isSystemDirectory()` パターンを踏襲する。

---

### 4.2 Should Fix (5 items)

#### SEC-SF-001: GET /api/repositories/excluded APIによるファイルシステムパス漏洩

**Category**: A01:2021 - Broken Access Control
**Severity**: Low

`GET /api/repositories/excluded` は `Repository[]` を返却し、これには `path` フィールド（完全なファイルシステムパス）が含まれる。CommandMateはローカルアクセス前提だが、`CM_BIND=0.0.0.0` でバインドした場合やリバースプロキシ構成で外部公開した場合に、サーバーのディレクトリ構造が漏洩する。

**Recommendation**: 設計書 Section 8 に、このAPIがパス情報を返すことを明記し、外部公開時のアクセス制御推奨を追加する。

#### SEC-SF-002: filterExcludedPaths() のパス比較のOS依存性

**Category**: A03:2021 - Injection
**Severity**: Low

`filterExcludedPaths()` は `Array.includes()` による文字列比較を使用する。macOS（case-insensitive filesystem）とLinux（case-sensitive filesystem）でパス比較の結果が異なる可能性がある。例えば、macOSで `/Users/name/Repo` と `/Users/name/repo` は同じパスだが、`Array.includes()` は一致しない。

**Recommendation**: コードコメントで OS 依存性を明記する。`resolveRepositoryPath()` による正規化が一貫して適用されていれば実際の問題は限定的だが、テストで検証する。

#### SEC-SF-003: エラーレスポンスからの内部情報漏洩リスク

**Category**: A05:2021 - Security Misconfiguration
**Severity**: Low

既存の `sync/route.ts` (`/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/app/api/repositories/sync/route.ts` line 44) では `error.message` をそのまま返却している:

```typescript
const errorMessage = error instanceof Error ? error.message : 'Failed to sync repositories';
```

一方、`DELETE route.ts` (`/Users/maenokota/share/work/github_kewton/commandmate-issue-190/src/app/api/repositories/route.ts` line 156) では固定メッセージを使用している:

```typescript
{ success: false, error: 'Failed to delete repository' }
```

新規APIでは後者の安全なパターンを踏襲すべきである。

**Recommendation**: `restore/route.ts` と `excluded/route.ts` の 500 エラーでは固定文字列を使用し、詳細は `console.error` でサーバーサイドにのみログ出力する。

#### SEC-SF-004: disableRepository() による無制限レコード蓄積

**Category**: A04:2021 - Insecure Design
**Severity**: Low

`disableRepository()` は未登録パスに対して `enabled=0` で新規レコードを作成する。バリデーション（SEC-MF-001）が追加されたとしても、有効なパス範囲内で大量のリクエストを送信することでレコード蓄積は可能。

**Recommendation**: 実装時に repositories テーブルの `enabled=0` レコード数に上限を設けるか、設計書 Section 15 の C-I01（クリーンアップ機能）の優先度を引き上げる。

#### SEC-SF-005: 復活APIのTOCTOUリスク

**Category**: A08:2021 - Software and Data Integrity Failures
**Severity**: Low

`restore/route.ts` でディスク存在確認後に `scanWorktrees()` を呼ぶ間に、ディレクトリが削除/変更される可能性がある。

**Recommendation**: `scanWorktrees()` 内部の安全ガード（危険パスフィルタリング、null byte チェック）で緩和されているため、設計書に明記するのみで実装変更は不要。

---

### 4.3 Consider (3 items)

#### SEC-C-001: CSRF対策の不在

プロジェクト全体の課題であり本Issue固有ではない。将来的な外部公開時に検討。

#### SEC-C-002: 除外登録/復活操作の監査ログ不足

`security-logger.ts` は CLI モジュールで使用されているが、APIルートでは `console.info` のみ。セキュリティ重要度は低いため将来検討。

#### SEC-C-003: exec() によるコマンド実行の安全性

`scanWorktrees()` の `exec('git worktree list', { cwd: rootDir })` は cwd 経由のパス渡しのため安全。`git-utils.ts` の `execFile` パターンへの統一は将来検討。

---

## 5. Security Design Assessment

### 5.1 Input Validation Analysis

| API Endpoint | Input | Current Validation | Proposed Validation | Gap |
|-------------|-------|-------------------|--------------------|----|
| DELETE /api/repositories | repositoryPath | typeof + empty check | typeof + empty check + resolveRepositoryPath() | **Null byte + system directory check missing** |
| POST /api/repositories/sync | (no user input) | N/A | N/A | None |
| GET /api/repositories/excluded | (no input) | N/A | N/A | None |
| PUT /api/repositories/restore | repositoryPath | (new) typeof + empty check | typeof + empty check + resolveRepositoryPath() | **Null byte + system directory check missing** |

### 5.2 SQL Injection Analysis

All proposed SQL operations use prepared statements:

| Function | SQL Pattern | Safe |
|----------|------------|------|
| `getExcludedRepositoryPaths()` | `SELECT path FROM repositories WHERE enabled = 0` (fixed, no params) | Yes |
| `getExcludedRepositories()` | `SELECT * FROM repositories WHERE enabled = 0 ORDER BY name ASC` (fixed, no params) | Yes |
| `disableRepository()` | Delegates to `getRepositoryByPath(db, resolvedPath)` -> `WHERE path = ?` | Yes |
| `disableRepository()` | Delegates to `updateRepository(db, repo.id, ...)` -> `WHERE id = ?` | Yes |
| `ensureEnvRepositoriesRegistered()` | Delegates to `getRepositoryByPath()` + `createRepository()` -> prepared | Yes |
| `filterExcludedPaths()` | Delegates to `getExcludedRepositoryPaths()` + JS `Array.includes()` | Yes (no SQL) |
| `restoreRepository()` | Delegates to `getRepositoryByPath()` + `updateRepository()` -> prepared | Yes |

### 5.3 Path Traversal Analysis

| Component | Path Source | Normalization | Validation | Risk |
|-----------|-----------|---------------|-----------|------|
| `resolveRepositoryPath()` | Various | `path.resolve()` | None (normalization only) | Medium -- only normalizes, does not restrict |
| `disableRepository()` | User input (via API) | `resolveRepositoryPath()` | None | **Medium -- arbitrary paths can be stored** |
| `filterExcludedPaths()` | DB + env vars | `resolveRepositoryPath()` | None | Low -- comparison only |
| `restoreRepository()` | User input (via API) | `resolveRepositoryPath()` | None | **Medium -- arbitrary paths can trigger scanWorktrees()** |
| `scanWorktrees()` | `restoreRepository()` result | `path.resolve(rootDir)` | Dangerous paths filter + null byte check | Low -- secondary defense |

---

## 6. Risk Assessment

| Risk Type | Level | Detail | Mitigation |
|-----------|-------|--------|-----------|
| Technical | Low | 既存パターンの踏襲。新規依存関係なし | Existing patterns proven in production |
| Security | Medium | パストラバーサル防御の不足（SEC-MF-001） | isSystemDirectory() + null byte check の追加で緩和 |
| Operational | Low | ローカルアクセス前提の設計は維持 | CM_BIND=127.0.0.1 デフォルト |

---

## 7. Recommendations Summary

### Must Fix (implementation blocker)

| ID | Title | Priority |
|----|-------|----------|
| SEC-MF-001 | repositoryPath入力に対するパストラバーサル防御の強化（null byte check + isSystemDirectory()） | P1 |

### Should Fix (quality improvement)

| ID | Title | Priority |
|----|-------|----------|
| SEC-SF-001 | GET /api/repositories/excluded のパス情報漏洩リスクを設計書に明記 | P2 |
| SEC-SF-002 | filterExcludedPaths() のOS依存パス比較をコメント明記 | P3 |
| SEC-SF-003 | 新規APIのエラーレスポンスで固定文字列を使用（内部情報漏洩防止） | P2 |
| SEC-SF-004 | disableRepository() のレコード蓄積上限検討 | P3 |
| SEC-SF-005 | restore APIのTOCTOUリスク認識を設計書に追記 | P3 |

### Consider (future improvement)

| ID | Title | Priority |
|----|-------|----------|
| SEC-C-001 | CSRF対策（プロジェクト全体課題） | P4 |
| SEC-C-002 | 除外/復活操作の監査ログ統合 | P4 |
| SEC-C-003 | exec() から execFile() への統一 | P4 |

---

## 8. Comparison with Existing Security Patterns

本プロジェクトで確立されている主要なセキュリティパターンとの整合性を確認した。

| Pattern | Existing Usage | Issue #190 Compliance |
|---------|---------------|----------------------|
| `isPathSafe()` | `scan/route.ts`, `file-operations.ts`, `clone-manager.ts` | **未使用** -- DELETE/restore API で不足 |
| `isSystemDirectory()` | `db-path-resolver.ts` | **未使用** -- SEC-MF-001 で追加推奨 |
| Prepared statements | `db-repository.ts`, `db.ts` 全般 | 準拠 |
| Null byte check | `path-validator.ts`, `worktrees.ts` | **API入力レベルで未実装** |
| Fixed error messages | `DELETE route.ts` (line 156) | 設計書に未明記 -- SEC-SF-003 |
| `exec` with cwd option | `worktrees.ts` | 準拠 |
| `execFile` | `git-utils.ts` | N/A（本設計では新規exec呼び出しなし） |

---

## 9. Approval Decision

**Status: Conditionally Approved**

SEC-MF-001（repositoryPathに対するパストラバーサル防御の強化）を設計書および実装に反映することを条件に承認する。具体的には:

1. 設計書 Section 8 の入力バリデーションに null byte check と `isSystemDirectory()` チェックを追加
2. `DELETE /api/repositories` と `PUT /api/repositories/restore` の route.ts にバリデーションロジックを追加
3. Section 12 のテスト方針にセキュリティバリデーションのテストケースを追加（悪意のあるパス入力に対する400レスポンスの検証）

Should Fix 項目は実装時の品質向上として推奨するが、セキュリティ上のブロッカーではない。

---

## 10. Review History

| Date | Stage | Review Type | Result | Score |
|------|-------|------------|--------|-------|
| 2026-02-08 | Stage 1 | 設計原則レビュー | 条件付き承認 | 4/5 |
| 2026-02-08 | Stage 2 | 整合性レビュー | 条件付き承認 | 4/5 |
| 2026-02-08 | Stage 3 | 影響分析レビュー | 条件付き承認 | 4/5 |
| 2026-02-08 | Stage 4 | セキュリティレビュー | 条件付き承認 | 4/5 |
