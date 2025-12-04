# 作業計画: MyCodeBranchDesk ガードレール設定

**作成日**: 2025-12-05
**プロジェクト**: Kewton/MyCodeBranchDesk
**参考**: MySwiftAgent ガードレール設計

---

## 1. 現状分析

### プロジェクト情報
| 項目 | 状態 |
|------|------|
| **リポジトリ** | Kewton/MyCodeBranchDesk |
| **デフォルトブランチ** | main |
| **フレームワーク** | Next.js 14 + TypeScript |
| **テスト** | Vitest (unit/integration), Playwright (e2e) |
| **CLAUDE.md** | なし |
| **GitHub Actions** | なし |
| **Branch Protection** | なし |

### 現状の課題
1. **mainへの直push可能** - 本番品質リスク
2. **CI/CDワークフローなし** - 品質チェックの自動化なし
3. **ブランチ戦略未定義** - 開発フロー不明確
4. **CLAUDE.md未整備** - AIアシスタント向けガイドラインなし

---

## 2. ガードレール設計

### 2.1 ブランチ戦略

MySwiftAgentに倣い、以下のブランチ構成を採用:

```
main (本番環境) 🔒 Branch Protection
  │
staging (UAT環境) 🔒 Branch Protection ※オプション
  │
develop (開発統合) 🔓 開発速度優先
  │
feature/*, fix/*, hotfix/* (作業ブランチ)
```

**初期構成として推奨**:
- **Phase 1**: main + develop の2ブランチ構成（シンプル）
- **Phase 2**: 必要に応じて staging を追加

### 2.2 Branch Protection Rules

| 設定項目 | main | develop (参考) |
|---------|------|---------------|
| **Require PR before merging** | ✅ 必須 | - |
| **Require approvals** | 1名 | - |
| **Require status checks** | ✅ CI必須 | - |
| **Require up to date** | ✅ | - |
| **Do not allow bypassing** | ✅ | - |
| **Restrict direct push** | ✅ Admin only | - |

### 2.3 CI/CDワークフロー

```yaml
# .github/workflows/ci.yml - 必要なワークフロー
- lint: ESLint
- type-check: TypeScript
- test:unit: Vitest単体テスト
- test:integration: Vitest結合テスト
- build: Next.jsビルド
```

---

## 3. 作業フェーズ

### Phase 1: CLAUDE.md作成（推奨優先度: 高）
**目的**: プロジェクト方針とブランチ戦略を文書化

**作成内容**:
- プロジェクト概要
- ブランチ構成と命名規則
- 標準マージフロー
- コーディング規約
- 禁止事項

**成果物**: `CLAUDE.md`

---

### Phase 2: CI/CDワークフロー構築（推奨優先度: 高）
**目的**: 品質チェックの自動化

**作成ファイル**:
```
.github/
└── workflows/
    ├── ci-pr.yml       # PRトリガーの品質チェック
    └── ci-main.yml     # mainマージ時の最終チェック
```

**ci-pr.yml の内容**:
```yaml
name: CI - Pull Request
on:
  pull_request:
    branches: [main, develop]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  type-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npx tsc --noEmit

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run test:unit

  build:
    runs-on: ubuntu-latest
    needs: [lint, type-check, test-unit]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
```

---

### Phase 3: Branch Protection設定（推奨優先度: 中）
**目的**: mainブランチへの直push禁止

**前提条件**:
- Phase 2のCI/CDワークフローが動作していること

**設定コマンド**:
```bash
# mainブランチ保護設定
gh api repos/Kewton/MyCodeBranchDesk/branches/main/protection \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -f required_status_checks='{"strict":true,"contexts":["lint","type-check","test-unit","build"]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  -f restrictions=null
```

**検証手順**:
```bash
# 直push拒否を確認
git checkout main
echo "test" >> test.txt
git add test.txt
git commit -m "test: direct push"
git push origin main
# Expected: Error - branch protected
```

---

### Phase 4: developブランチ作成（推奨優先度: 低）
**目的**: 開発統合ブランチの設置

**手順**:
```bash
# developブランチ作成
git checkout main
git checkout -b develop
git push -u origin develop
```

---

## 4. 成果物一覧

| ファイル | 目的 | Phase |
|---------|------|-------|
| `CLAUDE.md` | プロジェクト方針 | 1 |
| `.github/workflows/ci-pr.yml` | PR品質チェック | 2 |
| `.github/workflows/ci-main.yml` | mainマージチェック | 2 |
| Branch Protection Rules | mainガード | 3 |
| `develop` ブランチ | 開発統合 | 4 |

---

## 5. ロールバック手順

### Branch Protection解除
```bash
gh api repos/Kewton/MyCodeBranchDesk/branches/main/protection -X DELETE
```

### ワークフロー削除
```bash
rm -rf .github/workflows/
git add -A && git commit -m "revert: remove CI workflows"
git push origin main
```

---

## 6. 期待される効果

### Before（現状）
| 項目 | 状態 |
|------|------|
| mainへの直push | ⚠️ 可能 |
| 品質チェック | ❌ 手動 |
| マージフロー | ❌ 未定義 |
| AIガイドライン | ❌ なし |

### After（実施後）
| 項目 | 状態 |
|------|------|
| mainへの直push | ✅ 禁止 |
| 品質チェック | ✅ 自動（CI/CD） |
| マージフロー | ✅ PR必須 |
| AIガイドライン | ✅ CLAUDE.md |

---

## 7. 推奨実施順序

```
1. CLAUDE.md作成 ← 最優先（ガイドライン定義）
   ↓
2. CI/CDワークフロー構築 ← 必須（品質チェック基盤）
   ↓
3. Branch Protection設定 ← CIが動作してから
   ↓
4. developブランチ作成 ← 必要に応じて
```

---

## 8. 次のアクション

承認後、以下の順序で実施:

1. **オプション A**: 全Phase実施（推奨）
2. **オプション B**: Phase 1-2のみ（基盤構築）
3. **オプション C**: Phase 1のみ（CLAUDE.md作成）

---

## 9. 参考資料

- [MySwiftAgent - design-policy.md](/Users/maenokota/share/work/github_kewton/MySwiftAgent/dev-reports/feature/branch-sync-and-guardrails/design-policy.md)
- [MySwiftAgent - work-plan.md](/Users/maenokota/share/work/github_kewton/MySwiftAgent/dev-reports/feature/branch-sync-and-guardrails/work-plan.md)
- [GitHub Branch Protection Rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
