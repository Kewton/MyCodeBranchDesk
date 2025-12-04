# 設計方針: MyCodeBranchDesk ガードレール

**作成日**: 2025-12-05
**参考プロジェクト**: MySwiftAgent

---

## 1. 要求・要件

### ビジネス要求
- mainブランチを本番環境の品質で維持する
- 直push/直マージを防止し、PRベースのワークフローを徹底する
- CI/CDによる自動品質チェックを導入する

### 機能要件

| ID | 要件 |
|----|------|
| FR-1 | mainブランチへの直push禁止 |
| FR-2 | PRマージ時にCI/CD品質チェック必須 |
| FR-3 | PRマージ時に1名以上のレビュー承認必須（mainのみ） |
| FR-4 | CLAUDE.mdによるプロジェクト方針の文書化 |

### 非機能要件

| ID | 要件 |
|----|------|
| NFR-1 | ロールバック手順の確保 |
| NFR-2 | 開発速度への影響を最小化 |
| NFR-3 | GitHub標準機能のみを使用（外部依存なし） |

---

## 2. アーキテクチャ設計

### ブランチ構成

```
MyCodeBranchDesk Repository
│
├── Branches
│   ├── main (本番環境) 🔒 Branch Protection
│   ├── develop (開発統合) 🔓 Optional
│   ├── feature/* (機能追加)
│   ├── fix/* (バグ修正)
│   └── hotfix/* (緊急修正)
│
├── GitHub Branch Protection Rules
│   └── main: Require PR + Require Review (1) + Require CI
│
└── GitHub Actions Workflows
    ├── ci-pr.yml (PR時の品質チェック)
    └── ci-main.yml (mainマージ時の最終チェック)
```

### 技術選定

| 技術要素 | 選定 | 理由 |
|---------|------|------|
| ブランチ保護 | GitHub Branch Protection Rules | GitHub標準、API設定可能 |
| CI/CD | GitHub Actions | GitHub標準、無料枠あり |
| テスト | Vitest + Playwright | 既存プロジェクト設定を継続 |
| Lint | ESLint | 既存プロジェクト設定を継続 |

---

## 3. 設計判断

### 判断1: developブランチは初期構成で必須としない

**判断**: developブランチはオプションとし、必要に応じて追加

**理由**:
1. **シンプル優先**: 小規模チームでは2ブランチ（main + feature）で十分
2. **MySwiftAgentとの違い**: MyCodeBranchDeskは単一アプリケーション
3. **段階的導入**: 必要に応じて後から追加可能

### 判断2: mainのみレビュー必須

**判断**: mainブランチへのPRマージ時のみ、1名以上のレビュー承認を必須

**理由**:
1. **本番品質担保**: mainは本番環境のコードベース
2. **開発効率**: feature → mainの直接マージを許容（小規模時）
3. **柔軟性**: developを追加した場合、develop → mainでレビュー

### 判断3: CI/CDチェック項目

**判断**: 以下の4項目を必須チェックとする

| チェック項目 | 目的 |
|-------------|------|
| lint | コードスタイル統一 |
| type-check | TypeScript型安全性 |
| test:unit | 単体テスト合格 |
| build | ビルド成功確認 |

**除外**:
- `test:integration`: 実行時間が長い場合、オプションとする
- `test:e2e`: ローカル環境依存のため、手動実行を推奨

---

## 4. CLAUDE.md 設計

### 目的
AIアシスタント（Claude Code）がプロジェクトを理解し、適切なコード生成・修正を行うためのガイドライン

### 構成

```markdown
# CLAUDE.md

## プロジェクト概要
- プロジェクト名・目的
- 技術スタック

## ブランチ構成
- ブランチ戦略
- 命名規則

## 標準マージフロー
- feature → main のフロー
- PRルール

## コーディング規約
- TypeScript規約
- コンポーネント設計

## 禁止事項
- 直push禁止
- 例外対応フロー
```

---

## 5. リスク対策

### リスク1: CI設定ミスでマージブロック

**リスク**: CI設定が誤っていると正常なPRがマージできない

**対策**:
- CI/CDワークフローを先に動作確認してからBranch Protectionを設定
- ロールバック手順を文書化

### リスク2: レビュー承認者不足

**リスク**: 1人開発の場合、自己承認が必要になる

**対策**:
- GitHub設定で「Allow specified actors to bypass」を使用
- または一時的にレビュー要件を0にする

---

## 6. 成功指標

| 指標 | 目標 |
|------|------|
| 直push拒否率 | 100% |
| CI実行成功率 | 95%以上 |
| CLAUDE.md準拠率 | 100% |

---

## 7. 参照ドキュメント

- [MySwiftAgent - design-policy.md](/Users/maenokota/share/work/github_kewton/MySwiftAgent/dev-reports/feature/branch-sync-and-guardrails/design-policy.md)
- [GitHub Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
