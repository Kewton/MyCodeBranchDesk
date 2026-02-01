# Issue #113 セキュリティレビュー (Stage 4)

| 項目 | 値 |
|------|-----|
| Issue | #113 server.ts ビルド済みJS変換 |
| レビュー日 | 2026-02-01 |
| ステージ | 4 (セキュリティレビュー) |
| 対象文書 | dev-reports/design/issue-113-server-build-design-policy.md |
| 全体リスクレベル | **Low** |

---

## 1. エグゼクティブサマリー

Issue #113のセキュリティレビューを実施しました。本変更は `server.ts` を事前にJavaScriptへコンパイルし、`tsx` ランタイム依存を解消するものです。

**結論**: 重大なセキュリティリスクは検出されませんでした。設計は安全に実装可能と評価します。

### 主な評価結果

- **Must Fix**: 0件
- **Should Fix**: 4件
- **Nice to Have**: 3件

---

## 2. OWASP Top 10 準拠評価

| カテゴリ | ステータス | 備考 |
|---------|-----------|------|
| A01: Broken Access Control | N/A | 本変更はアクセス制御に影響しない |
| A02: Cryptographic Failures | N/A | 暗号化機能への影響なし |
| A03: Injection | **Pass** | spawn()使用、引数は配列渡し |
| A04: Insecure Design | **Pass** | 依存チェーン分析、ロールバック手順を含む堅牢な設計 |
| A05: Security Misconfiguration | **Pass*** | files除外設計は適切、軽微な課題あり |
| A06: Vulnerable Components | **Pass*** | tsc-aliasは安全、既存依存に脆弱性あり（別Issue） |
| A07: Authentication Failures | N/A | 認証機能への影響なし |
| A08: Integrity Failures | **Pass*** | prepublishOnlyでビルド強制、バージョン固定推奨 |
| A09: Logging Failures | N/A | ロギング機能への影響なし |
| A10: SSRF | N/A | ネットワークリクエスト処理への影響なし |

*: 推奨事項あり

---

## 3. サプライチェーンセキュリティ

### 3.1 tsc-alias パッケージ評価

| 項目 | 評価 |
|------|------|
| パッケージ名 | tsc-alias |
| 最新バージョン | 1.8.16 |
| 週間ダウンロード | 200万+ |
| リポジトリ | github.com/justkey007/tsc-alias |
| 最終更新 | 2025-05-05 |
| 既知の脆弱性 | **なし** |
| リスク評価 | **Low** |

**依存関係**:
- chokidar (^3.5.3)
- commander (^9.0.0)
- get-tsconfig (^4.10.0)
- globby (^11.0.4)
- mylas (^2.1.9)
- normalize-path (^3.0.0)
- plimit-lit (^1.2.6)

**評価**: devDependenciesとしてのみ使用されるため、本番ランタイムには影響しません。広く使用されている安定したパッケージです。

### 3.2 npm publish セキュリティ

**現在の files フィールド**:
```json
{
  "files": [
    "bin/",
    "dist/",
    ".env.example"
  ]
}
```

**設計書で提案される追加**:
- `.next/` - Next.jsビルド成果物
- `public/` - 静的アセット

**除外確認済み**:
- `src/` - ソースコードは除外（パッケージサイズ削減、情報露出軽減）
- `.env` - 実際の環境設定は含まれない
- `node_modules/` - npm標準除外

---

## 4. ビルドセキュリティ

### 4.1 機密ファイル除外

| ファイル | 除外方法 | ステータス |
|---------|---------|-----------|
| .env | gitignore + filesに含まない | **OK** |
| .env.local | gitignore | **OK** |
| *.pem | gitignore | **OK** |
| db.sqlite | gitignore + /data/除外 | **OK** |
| node_modules/ | npm標準除外 | **OK** |

### 4.2 ハードコードされた機密情報

**検査対象**: server.ts, src/lib/env.ts, src/cli/

**結果**: ハードコードされた機密情報なし。全ての設定は環境変数経由で取得されています。

### 4.3 パッケージサイズ

| 状態 | サイズ |
|------|--------|
| 現在 | 21.2 kB (72.2 kB unpacked) |
| 変更後予想 | 30-50 MB (.next/ + public/ 追加時) |

---

## 5. ランタイムセキュリティ

### 5.1 環境変数処理

- **取得方法**: `getEnvByKey()` with fallback support
- **検証**:
  - CM_PORT: 数値検証 (1-65535)
  - CM_BIND: 許可値検証 (127.0.0.1, 0.0.0.0, localhost)
  - CM_AUTH_TOKEN: 0.0.0.0バインド時に必須チェック
- **機密情報**: AUTH_TOKENはlogger.tsでマスキング対象

### 5.2 ファイルシステムアクセス

- **db-instance.ts**: mkdirSync with recursive:true（ディレクトリ作成のみ）
- **worktrees.ts**: ファイルシステム操作はworktreeパス内に限定
- **pid-manager.ts**: O_EXCLによるアトミック書き込み（TOCTOU対策済み）
- **パストラバーサル保護**: isPathSafe()関数で検証

### 5.3 プロセス管理

- **spawn使用**: 引数配列使用でシェルインジェクション対策済み
- **PIDファイル**: O_EXCLによるアトミック操作（TOCTOU対策済み）
- **シグナル処理**: SIGTERM/SIGINTでgraceful shutdown

---

## 6. 指摘事項

### 6.1 Should Fix (4件)

#### SF-SEC-001: tsc-aliasのバージョン固定方針

| 項目 | 内容 |
|------|------|
| カテゴリ | Supply Chain Security |
| OWASP | A08:2021 - Software and Data Integrity Failures |
| リスク | Low |

**指摘**: tsc-aliasをdevDependenciesに追加する際のバージョン指定方針が未定義。

**推奨**: package.jsonに追加する際、`^`ではなく`~`（パッチバージョンのみ）または完全固定（例: `1.8.16`）を使用。

---

#### SF-SEC-002: src/ディレクトリ除外の二重保護

| 項目 | 内容 |
|------|------|
| カテゴリ | Build Security |
| OWASP | A05:2021 - Security Misconfiguration |
| リスク | Low |

**指摘**: 現在のpackage.jsonのfilesフィールドにはsrc/は含まれていないが、誤追加防止の明示的な除外がない。

**推奨**: `.npmignore`ファイルにsrc/を明示的に追加し、二重の保護を実施。

---

#### SF-SEC-003: db-instance.tsの環境変数取得の不整合

| 項目 | 内容 |
|------|------|
| カテゴリ | Runtime Security |
| OWASP | A05:2021 - Security Misconfiguration |
| リスク | Low |

**指摘**: server.tsは`getEnvByKey('CM_PORT')`を使用しているが、db-instance.tsは`process.env.DATABASE_PATH`を直接参照。

**推奨**: db-instance.tsで`getEnvByKey('CM_DB_PATH')`を使用するよう統一。（Stage 2 NTH-001として記録済み）

---

#### SF-SEC-004: 既存の依存関係に脆弱性あり

| 項目 | 内容 |
|------|------|
| カテゴリ | Existing Vulnerabilities |
| OWASP | A06:2021 - Vulnerable and Outdated Components |
| リスク | Medium |

**指摘**: npm auditの結果、以下の脆弱性が存在（本Issue #113のスコープ外）。

| パッケージ | 深刻度 | 概要 |
|-----------|--------|------|
| glob (via @next/eslint-plugin-next) | High | CLI コマンドインジェクション |
| eslint | Moderate | Stack Overflow |
| mermaid (via langium) | Moderate | 間接依存 |

**推奨**: 別Issueとして依存関係のアップデートを計画。

---

### 6.2 Nice to Have (3件)

#### NTH-SEC-001: ビルド成果物の整合性検証

CI/CDパイプライン内でのビルド成果物のchecksum計算と検証を追加することで、ビルド改ざん検出を強化。

#### NTH-SEC-002: dependabot/renovate の導入

依存関係の自動更新ツールを導入し、セキュリティ更新の迅速な適用を自動化。

#### NTH-SEC-003: パッケージサイズ増加の監視

npm pack --dry-runで公開されるファイルを確認するステップをCIに追加し、意図しないファイル包含を検出。

---

## 7. 結論

Issue #113の設計は、セキュリティの観点から安全に実装可能と評価します。

**主な評価ポイント**:

1. **tsc-alias は安全**: 広く使用されている安定パッケージ。npm advisory報告なし。devDependenciesとしてのみ使用。

2. **files フィールド設計は適切**: src/除外により情報露出リスクを軽減。機密ファイル（.env等）は適切に除外。

3. **既存のセキュリティ対策は維持**: spawn()によるコマンドインジェクション対策、O_EXCLによるTOCTOU対策、環境変数の検証ロジックは変更なし。

4. **推奨事項**: バージョン固定方針の明確化（SF-SEC-001）、db-instance.tsの環境変数取得統一（SF-SEC-003）を実装時に対応することを推奨。

---

## 8. 参照ファイル

| ファイル | パス |
|---------|------|
| 設計書 | `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/dev-reports/design/issue-113-server-build-design-policy.md` |
| レビュー結果JSON | `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/dev-reports/issue/113/multi-stage-design-review/stage4-review-result.json` |
| server.ts | `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/server.ts` |
| package.json | `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/package.json` |
| env.ts | `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/src/lib/env.ts` |
| .env.example | `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/.env.example` |

---

*レビュー実施: 2026-02-01*
*レビュアー: Architecture Review Agent*
