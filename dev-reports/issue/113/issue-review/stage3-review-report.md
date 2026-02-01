# Issue #113 影響範囲レビューレポート

**レビュー日**: 2026-02-01
**フォーカス**: 影響範囲レビュー
**イテレーション**: 1回目（Stage 3）

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 1 |
| Should Fix | 3 |
| Nice to Have | 2 |

---

## Must Fix（必須対応）

### MF-1: server.tsが依存するモジュールにパスエイリアス使用ファイルが含まれる

**カテゴリ**: 依存関係
**場所**: ## 技術的な考慮事項 > パスエイリアス対応

**問題**:
server.tsの依存チェーンを完全に分析すると、現在のtsconfig.server.json案のinclude（`server.ts`, `src/lib/env.ts`）では不足していることが判明しました。

server.tsの直接import:
- `./src/lib/ws-server` - パスエイリアス未使用（変更不要）
- `./src/lib/worktrees` - **@/types/models使用**
- `./src/lib/db-instance` - db-migrations.ts経由でdb.tsに依存
- `./src/lib/response-poller` - 複数の@/パスimportあり
- `./src/lib/db-migrations` - db.tsをimport
- `./src/lib/env` - パスエイリアス未使用（変更不要）

間接依存で@/パスを使用しているファイル:
- `src/lib/worktrees.ts`: `import type { Worktree } from '@/types/models';`
- `src/lib/db.ts`: `import type { Worktree, ChatMessage, ... } from '@/types/models';`
- `src/lib/db.ts`: `import type { CLIToolType } from '@/lib/cli-tools/types';`

**証拠**:
```typescript
// src/lib/worktrees.ts:9
import type { Worktree } from '@/types/models';

// src/lib/db.ts:8-9
import type { Worktree, ChatMessage, WorktreeSessionState, WorktreeMemo } from '@/types/models';
import type { CLIToolType } from '@/lib/cli-tools/types';
```

**推奨対応**:
1. server.tsの依存チェーンを完全にマッピングし、@/パスを使用している全ファイルを特定
2. 以下のいずれかを選択:
   - **選択肢A（tsc-alias）**: `devDependencies`にtsc-aliasを追加し、build:serverで使用
   - **選択肢B（相対パス）**: 影響を受ける全ファイルで相対パスに書き換え（推奨範囲を明確化）
3. tsconfig.server.jsonのincludeを更新して必要な全ファイルを含める

---

## Should Fix（推奨対応）

### SF-1: CIパイプライン（ci-pr.yml）にbuild:serverステップが未追加

**カテゴリ**: ビルドプロセス
**場所**: ## 実装タスク

**問題**:
実装タスクに「CIパイプライン（GitHub Actions）でのbuild:server検証追加を検討」とあるが、具体的な変更内容が不明確です。現在のci-pr.ymlでは`npm run build`（Next.jsのみ）が実行されており、build:serverは検証されていません。

**証拠**:
```yaml
# .github/workflows/ci-pr.yml:88-90
- name: Build
  run: npm run build  # build:serverなし
```

**推奨対応**:
ci-pr.ymlのbuildジョブに以下を追加することを明確にタスク化:
```yaml
- name: Build CLI
  run: npm run build:cli

- name: Build Server
  run: npm run build:server
```

---

### SF-2: publish.ymlの更新が必要

**カテゴリ**: 後方互換性
**場所**: ## 実装タスク

**問題**:
publish.ymlでは現在`npm run build`と`npm run build:cli`のみ実行されています。prepublishOnlyをbuild:allに変更する場合でも、CIパイプラインでの明示的なbuild:server実行を追加することで、ビルド失敗を早期検出できます。

**証拠**:
```yaml
# .github/workflows/publish.yml:44-47
- name: Build
  run: npm run build

- name: Build CLI
  run: npm run build:cli
# build:serverは明示されていない
```

**推奨対応**:
1. publish.ymlにbuild:serverステップを追加
2. パッケージサイズ計測ステップの追加を検討（`npm pack --dry-run`）

---

### SF-3: グローバルインストール動作検証の自動化方法が未定義

**カテゴリ**: テスト範囲
**場所**: ## 受け入れ条件

**問題**:
受け入れ条件に「npm install -g commandmateでインストール後、commandmate startが正常に動作する」がありますが、これをどのように検証するかが不明確です。

**推奨対応**:
以下のいずれかを明確化:
1. CIでのE2E検証（npm pack → npm install -g ./package.tgz → commandmate start --help）
2. 手動テストチェックリストの作成
3. リリース前のスモークテスト手順の文書化

---

## Nice to Have（あれば良い）

### NTH-1: CLAUDE.mdの開発コマンドセクション更新が必要

**カテゴリ**: ドキュメント
**場所**: CLAUDE.md ## 開発コマンド

**問題**:
本変更完了後、CLAUDE.mdの開発コマンドセクションにbuild:serverコマンドの記載がありません。

**推奨対応**:
CLAUDE.mdに以下を追加:
```markdown
npm run build:server  # サーバービルド（dist/server/生成）
```

---

### NTH-2: README.mdのインストール手順確認

**カテゴリ**: ドキュメント
**場所**: README.md

**問題**:
本変更により「tsxランタイム不要」になることはユーザーにとってメリットですが、これがドキュメントに反映されていない可能性があります。

**推奨対応**:
README.mdを確認し、必要に応じてインストール手順を更新（tsxランタイム不要のメリット記載）。

---

## 影響範囲分析

### ファイル変更影響

#### 新規作成ファイル
| ファイル | 目的 |
|---------|------|
| `tsconfig.server.json` | server.tsビルド設定 |

#### 変更対象ファイル
| ファイル | 変更内容 | 影響範囲 |
|---------|---------|---------|
| `package.json` | scripts、files更新 | 全開発者・CI/CD |
| `.github/workflows/ci-pr.yml` | build:serverステップ追加 | PRマージ前検証 |
| `.github/workflows/publish.yml` | build:serverステップ追加 | npm publish前検証 |

#### 影響を受ける可能性のあるファイル（パスエイリアス対応）
| ファイル | 理由 |
|---------|------|
| `src/lib/worktrees.ts` | @/types/models使用 |
| `src/lib/db.ts` | @/types/models、@/lib/cli-tools/types使用 |
| `src/lib/db-migrations.ts` | db.tsをimport |
| `src/lib/db-instance.ts` | db-migrations.tsをimport |
| `src/lib/response-poller.ts` | 複数の@/パスimport |

### ビルドプロセス影響

| 項目 | 影響 | 対応 |
|------|------|------|
| ローカルビルド | build:serverコマンド追加 | npm run build:allで全ビルド |
| CI/CD | ci-pr.yml、publish.yml更新 | build:serverステップ追加 |
| パッケージサイズ | .next/、src/追加で大幅増加 | 事前計測が必要 |

### 後方互換性

| 項目 | 破壊的変更 | ユーザー影響 |
|------|----------|------------|
| startスクリプト | なし | ポジティブ（tsx不要） |
| devスクリプト | なし | 影響なし |
| CLI動作 | なし | 同一動作を維持 |

### テスト影響

| テスト種別 | 影響 | 対応 |
|-----------|------|------|
| ユニットテスト | なし | - |
| 統合テスト | なし | - |
| E2Eテスト | ビルド後サーバー起動で確認要 | 動作確認 |
| 新規テスト | build:server成功検証、グローバルインストール検証 | CI追加 |

---

## 参照ファイル

### コード
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/server.ts` - ビルド対象のメインエントリポイント
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/src/lib/worktrees.ts` - @/types/models使用
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/src/lib/db.ts` - @/パス多数使用
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/package.json` - scripts、files変更対象
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/tsconfig.cli.json` - 既存CLIビルド設定
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/.github/workflows/ci-pr.yml` - CI設定
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/.github/workflows/publish.yml` - publish設定

### ドキュメント
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/CLAUDE.md` - 開発コマンドセクション更新対象
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/dev-reports/design/issue-96-npm-cli-design-policy.md` - 関連Issue #96設計方針
