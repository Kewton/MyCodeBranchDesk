# Issue #113 server.ts ビルド済みJS変換 設計方針書

## 1. 概要

### 1.1 目的
`npm install -g commandmate` でグローバルインストール後、`commandmate start` 実行時に `tsx: command not found` エラーが発生する問題の根本対策として、`server.ts`をビルド済みJavaScriptに変換する。

### 1.2 背景
- `package.json`の`start`スクリプトが`tsx server.ts`を使用
- `tsx`は`devDependencies`にあり、グローバルインストール時に含まれない
- 暫定対応としてtsxをdependenciesに移動する案があるが、本Issueは長期的な改善として対応

### 1.3 スコープ
- `server.ts`を事前にJavaScriptにコンパイルし、本番環境では`node dist/server/server.js`で実行
- CI/CDパイプラインの更新
- ドキュメントの更新

---

## 2. 現状分析

### 2.1 問題のあるコード

```bash
$ commandmate start
[INFO] Starting server in foreground (production mode)...

> commandmate@0.1.5 start
> NODE_ENV=production tsx server.ts

sh: tsx: command not found
```

### 2.2 原因分析

| 項目 | 現状 | 問題点 |
|------|------|--------|
| 実行方式 | `tsx server.ts`（TSランタイム） | tsxはdevDependencies |
| 起動速度 | やや遅い | TypeScriptの実行時コンパイル |
| 依存関係 | tsxランタイム必要 | グローバルインストールで利用不可 |
| 本番運用 | 非標準 | Node.js標準方式ではない |

### 2.3 server.tsの依存チェーン分析 [Stage 2 MF-001対応: 修正済み]

server.tsからの依存チェーンを分析した結果:

| ファイル | @/パス使用 | 対応方針 |
|---------|----------|---------|
| `server.ts` | なし | - |
| `src/lib/env.ts` | なし | - |
| `src/lib/ws-server.ts` | なし | - |
| `src/lib/worktrees.ts` | **あり** (`@/types/models`) | tsc-alias適用 |
| `src/lib/db-instance.ts` | なし | 間接依存あり |
| `src/lib/db-migrations.ts` | なし | db.tsをimport |
| `src/lib/db.ts` | **あり** (`@/types/models`, `@/lib/cli-tools/types`) | tsc-alias適用 |
| `src/lib/response-poller.ts` | **なし** (相対パスのみ使用) | - |
| `src/lib/cli-session.ts` | なし (response-pollerの依存) | - |
| `src/lib/prompt-detector.ts` | なし (response-pollerの依存) | - |
| `src/lib/conversation-logger.ts` | なし (response-pollerの依存) | - |
| `src/lib/claude-output.ts` | なし (response-pollerの依存) | - |
| `src/lib/cli-patterns.ts` | なし (response-pollerの依存) | - |
| `src/types/models.ts` | **あり** (`@/lib/cli-tools/types`) | tsc-alias適用 [SF-003参照] |

**注記**: response-poller.tsは以下の相対パスimportを使用しており、@/パスは使用していない:
- `./cli-session`
- `./db-instance`
- `./db`
- `./ws-server`
- `./prompt-detector`
- `./conversation-logger`
- `./cli-tools/types`
- `./claude-output`
- `./cli-patterns`

---

## 3. 設計方針

### 3.1 採用アプローチ

**tsc-alias導入方式**: `npm install -D tsc-alias`を追加し、ビルド後にパスエイリアスを解決する。

### 3.2 パスエイリアス対応

現在の`tsconfig.json`では`paths: { '@/*': ['./src/*'] }`が設定されている。TypeScriptの`tsc`単体ではパスエイリアスは解決されないため、`tsc-alias`を使用する。

```bash
npm install -D tsc-alias
# build:server: "tsc --project tsconfig.server.json && tsc-alias -p tsconfig.server.json"
```

#### 3.2.1 tsc-alias vs 相対パス化のトレードオフ分析 [SF-004対応]

| 観点 | tsc-alias導入 | 相対パス化 |
|------|--------------|-----------|
| **追加依存** | 1パッケージ追加 | なし |
| **ビルドステップ** | 追加ステップ必要 | 不要 |
| **保守性** | 既存コードの変更不要 | 3ファイル修正必要 |
| **一貫性** | Next.js側と同じ@/パスを維持 | パス形式が混在 |
| **将来性** | 新規モジュール追加時も対応不要 | 追加時に相対パス検討が必要 |

**選択理由**: tsc-aliasを採用

1. **変更量の最小化**: 現在@/パスを使用している3ファイル（worktrees.ts, db.ts, src/types/models.ts）を変更不要
2. **一貫性の維持**: プロジェクト全体で@/パスを統一的に使用し続けられる
3. **保守性**: 将来、新しいモジュールが追加されてもserver.tsビルドへの影響がない
4. **リスク**: tsc-aliasは広く使われている（npm週間ダウンロード200万+）安定したツール

**相対パス化を選択しなかった理由**:
- 3ファイルの修正が必要となり、Next.js側との差異が生じる
- 将来的にserver.tsの依存が増えた場合、継続的に相対パス対応が必要

#### 3.2.2 tsc-aliasのバージョン固定方針 [Stage 4 SF-SEC-001対応]

サプライチェーンセキュリティの観点から、tsc-aliasのバージョン指定方針を明確化する。

| 方式 | 指定例 | メリット | デメリット |
|------|--------|---------|-----------|
| **チルダ（~）** | `~1.8.16` | パッチバージョンのみ自動更新 | マイナー更新の恩恵なし |
| **完全固定** | `1.8.16` | 完全な再現性 | セキュリティパッチの手動更新が必要 |
| **キャレット（^）** | `^1.8.16` | マイナー更新も取得 | 意図しない変更リスク |

**推奨**: `~1.8.16`（チルダ方式）

**理由**:
1. パッチバージョン（バグ修正・セキュリティ修正）は自動取得
2. マイナーバージョン（機能追加）での破壊的変更を回避
3. package-lock.jsonと併用で実質的な固定を維持
4. OWASP A08:2021（ソフトウェアとデータの整合性障害）への対策

### 3.3 TypeScript設定の共通化（tsconfig.base.json） [MF-001対応]

`tsconfig.server.json`と`tsconfig.cli.json`のcompilerOptionsの重複を解消するため、共通設定を`tsconfig.base.json`に集約する。

#### tsconfig.base.json（新規作成）

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**メリット**:
- compilerOptionsの一元管理によりDRY原則を遵守
- 設定変更時の更新漏れ防止
- 将来的な新規tsconfig追加時も継承可能

#### 3.3.1 tsconfig.cli.jsonとの互換性 [Stage 2 SF-001対応]

現在の`tsconfig.cli.json`は`baseUrl`/`paths`を持っていない。`tsconfig.base.json`を継承する際の対応方針:

| 選択肢 | 説明 | 影響 |
|-------|------|------|
| **A) pathsオーバーライド** | `tsconfig.cli.json`で`paths: {}`に上書き | CLIビルドにパスエイリアスが適用されない |
| **B) tsc-alias適用** | CLIビルドにもtsc-aliasを適用 | ビルドスクリプト変更が必要 |
| **C) 継承しない** | `tsconfig.cli.json`は独立維持 | DRYの恩恵が限定的 |

**推奨**: 選択肢A（pathsオーバーライド）

```json
// tsconfig.cli.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist/cli",
    "rootDir": "./src",
    "paths": {}  // baseのpathsを無効化
  },
  "include": ["src/cli/**/*.ts"]
}
```

**理由**:
- CLIコードは現在@/パスを使用していないため、tsc-aliasは不要
- DRY原則の恩恵（target, module, strict等の共通設定）を維持しつつ、不要なパスエイリアスを回避

### 3.4 モジュール設定

既存の`tsconfig.cli.json`との整合性を保つため、`module: 'commonjs'`を使用する。

**理由**:
- 現在の`package.json`には`type: 'module'`指定がない（デフォルトはCommonJS）
- `tsconfig.cli.json`は`module: 'commonjs'`を使用しており、統一が望ましい
- ESM移行は別途検討課題とする

### 3.5 tsconfig.server.json（案） [MF-001, MF-002対応, Stage 2 MF-002対応: 更新済み]

```json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist/server",
    "rootDir": ".",
    "declaration": false
  },
  "include": [
    "server.ts",
    "src/lib/env.ts",
    "src/lib/ws-server.ts",
    "src/lib/worktrees.ts",
    "src/lib/db.ts",
    "src/lib/db-instance.ts",
    "src/lib/db-migrations.ts",
    "src/lib/response-poller.ts",
    "src/lib/cli-session.ts",
    "src/lib/prompt-detector.ts",
    "src/lib/conversation-logger.ts",
    "src/lib/claude-output.ts",
    "src/lib/cli-patterns.ts",
    "src/lib/cli-tools/**/*.ts",
    "src/types/**/*.ts"
  ]
}
```

**Stage 2 MF-002対応**: response-poller.tsの実際の依存ファイルを追加:
- `src/lib/cli-session.ts` - セッション管理
- `src/lib/prompt-detector.ts` - プロンプト検出
- `src/lib/conversation-logger.ts` - 会話ログ
- `src/lib/claude-output.ts` - Claude出力処理
- `src/lib/cli-patterns.ts` - CLIパターン定義

**MF-002対応**: `include: ["server.ts", "src/**/*.ts"]` から依存するファイルのみを明示的に列挙する方式に変更。これにより不要なファイル（CLI専用コードやNext.js App Router）がコンパイル対象に含まれない。

**MF-001対応**: `extends: "./tsconfig.base.json"` により共通設定を継承し、server固有設定のみを記述。

#### 3.5.1 src/types/models.tsの@/パス使用に関する注意 [Stage 2 SF-003対応]

`src/types/models.ts`は`@/lib/cli-tools/types`をimportしている:

```typescript
import type { CLIToolType } from '@/lib/cli-tools/types';
```

**確認事項**:
- tsc-aliasはtype-onlyのimportも正しく解決する（tsc-alias v1.8+で対応済み）
- TypeScriptの`declaration: false`設定により、型宣言ファイル生成時の問題を回避

**検証手順**:
1. `npm run build:server`実行後、`dist/server/src/types/models.js`を確認
2. importパスが相対パスに変換されていることを検証

### 3.6 package.json変更（案） [MF-003対応, Stage 2 MF-003対応: 明確化]

```json
{
  "scripts": {
    "build:server": "tsc --project tsconfig.server.json && tsc-alias -p tsconfig.server.json",
    "build:all": "npm run build && npm run build:cli && npm run build:server",
    "start": "NODE_ENV=production node dist/server/server.js",
    "prepublishOnly": "npm run build:all"
  },
  "files": [
    "bin/",
    "dist/",
    ".next/",
    "public/",
    ".env.example"
  ]
}
```

#### filesフィールドの変更意図 [MF-003対応, Stage 2 MF-003対応: 詳細理由追記, Stage 4 SF-SEC-002対応]

| フィールド | 必要性 | 理由 |
|-----------|--------|------|
| `bin/` | **必須** | CLIエントリポイント |
| `dist/` | **必須** | ビルド済みCLI・サーバーJS |
| `.next/` | **必須** | Next.jsビルド成果物（詳細下記） |
| `public/` | **必須** | 静的アセット（詳細下記） |
| `.env.example` | **推奨** | 設定テンプレート |
| ~~`src/`~~ | **除外** | ビルド済みJSがあれば不要。パッケージサイズ削減、ソースコード非公開 |

**src/除外の意図** [Stage 4 SF-SEC-002対応]:
- **目的**: ソースコードをnpmパッケージに含めない（ビルド済みJSで十分）
- **セキュリティ**: 内部実装の詳細を公開しない
- **サイズ**: パッケージサイズの削減
- **二重保護**: `.npmignore`ファイルにも`src/`を明示的に追加することを推奨

**.npmignore追加推奨内容**:
```
src/
tests/
*.ts
!*.d.ts
```

**.next/とpublic/の追加理由** [Stage 2 MF-003対応]:

グローバルインストール時のサーバー実行には以下が必要:

1. **`.next/`ディレクトリ**:
   - Next.jsの本番ビルド成果物（`npm run build`で生成）
   - `node dist/server/server.js`実行時、Next.jsサーバーがこのディレクトリを参照
   - 含まれる主要ファイル: `.next/server/`, `.next/static/`, `.next/BUILD_ID`
   - **不含の場合**: Next.jsがビルド成果物を見つけられず起動失敗

2. **`public/`ディレクトリ**:
   - 静的アセット（favicon、画像等）
   - Next.jsが`/public`へのリクエストをこのディレクトリから提供
   - **不含の場合**: 静的アセットが404エラー

**パッケージサイズへの影響**:
- `.next/`: 約10-30MB（プロジェクト規模による）
- `public/`: 約1-5MB（アセット量による）
- **対策**: standaloneモード移行でサイズ最適化可能（Section 3.7参照）

**決定**: `src/`は`files`フィールドから除外する。

**理由**:
1. ビルド済みJavaScript（`dist/`）があれば本番実行に不要
2. パッケージサイズの最小化（推定20-30%削減）
3. ソースコード公開のセキュリティ考慮（必要であればリポジトリを参照すべき）

#### 3.6.1 prepublishOnlyとpublish.ymlの重複検討 [Stage 2 SF-004対応]

**現状の問題**:
- `prepublishOnly: "npm run build:all"`を設定すると、ローカル`npm publish`時にビルドが実行される
- `publish.yml`でも`npm run build`、`npm run build:cli`、`npm run build:server`を実行
- `npm publish`時に二重ビルドとなる可能性

**設計判断**:

| 選択肢 | 説明 | メリット | デメリット |
|-------|------|---------|-----------|
| **A) prepublishOnly維持** | 両方でビルド | ローカルpublishの安全性 | CI時の重複 |
| **B) prepublishOnly削除** | CIのみでビルド | 効率的 | ローカルpublish時にビルド忘れリスク |
| **C) --ignore-scripts使用** | CI側でスキップ | 最適 | 設定の複雑化 |

**推奨**: 選択肢A（prepublishOnly維持）

**理由**:
1. ローカルからの直接`npm publish`時の安全性を確保
2. CI時の二重ビルドはキャッシュにより実質的な影響は軽微
3. 設定のシンプルさを優先

**代替案**: 将来的にビルド時間が問題になった場合、`publish.yml`で`npm publish --ignore-scripts`を使用

### 3.7 Next.js standaloneモード（検討事項） [SF-001対応]

初期実装では標準モードで進め、問題が発生した場合にstandaloneモードを検討する。

**メリット**:
- 必要な依存関係が自動的に含まれる
- デプロイサイズの最適化

**デメリット**:
- パッケージサイズが増加する可能性
- 既存の起動方式との互換性確認が必要

#### standaloneモード検討のトリガー条件 [SF-001対応]

以下のいずれかの条件を満たした場合、standaloneモードへの移行を検討する:

| トリガー | 閾値 | 確認方法 |
|---------|------|---------|
| パッケージサイズ | 100MB超過 | `npm pack --dry-run` |
| 依存解決エラー | グローバルインストール時にモジュール未解決エラー発生 | CI E2Eテスト |
| 起動時エラー | `.next/`内のファイル参照エラー | 手動検証 |

**現時点での判断**: 初期スコープ外。上記トリガー発生時に再検討する。

### 3.8 依存関係変更時の戦略 [SF-003対応]

server.tsに新しい依存が追加された場合の対応方針:

#### 対応プロセス

1. **依存追加時**: 新しいimport文を追加する際、そのファイルが`tsconfig.server.json`のincludeに含まれているか確認
2. **ビルドエラー発生時**: `npm run build:server`でコンパイルエラーが出た場合、不足ファイルをincludeに追加
3. **CI検出**: PRでのbuild:serverステップで早期に問題を検出

#### 自動化の検討（将来課題）

- `madge`等の依存分析ツールによるincludeリストの自動生成
- pre-commitフックでの依存チェーン検証

**現時点での方針**: 手動管理とし、ビルドエラー時に都度includeを更新する。CI/CDで早期検出されるため、大きな問題にはならない見込み。

### 3.9 bin/commandmate.jsとtsconfig.cli.jsonのパス整合性 [Stage 3 MF-001対応]

#### 現状

- `bin/commandmate.js`: `require('../dist/cli/index.js')` でCLIモジュールを参照
- `tsconfig.cli.json`: `outDir: './dist'` を使用（実際の出力は `dist/cli/`）

#### 整合性の検証ポイント

| 項目 | 現在の設定 | 依存関係 |
|------|-----------|---------|
| bin/commandmate.js | `../dist/cli/index.js` | tsconfig.cli.jsonのoutDirに依存 |
| tsconfig.cli.json | `outDir: './dist'`, `rootDir: './src'` | CLIコードが`src/cli/`にある前提 |
| 実際の出力先 | `dist/cli/index.js` | outDir + rootDir構造 |

#### 変更時の影響範囲

tsconfig.cli.jsonのoutDirを変更する場合:

1. **outDir: 'dist/cli'に変更した場合**:
   - 出力先: `dist/cli/cli/index.js`（二重構造）
   - bin/commandmate.jsのパスが壊れる

2. **rootDirを変更した場合**:
   - ディレクトリ構造が変わりパスが壊れる可能性

#### 検証方法

ビルド後に以下を確認:

```bash
# 1. CLIビルドが正常に完了
npm run build:cli

# 2. 期待するパスにファイルが存在
ls dist/cli/index.js

# 3. bin/commandmate.jsからの参照が有効
node -e "require('./bin/commandmate.js')" --help
```

#### 設計原則

- **bin/commandmate.jsは変更しない**: エントリポイントのパスを固定
- **tsconfig.cli.jsonのoutDirは変更しない**: 現在の`./dist`を維持
- **変更が必要な場合**: 両ファイルの整合性テストをCIに追加することを検討

---

## 4. 詳細設計

### 4.1 ビルドディレクトリ構成

```
dist/
├── cli/           # 既存CLIモジュール
│   ├── index.js
│   └── commands/
└── server/        # 新規サーバーモジュール
    ├── server.js
    └── src/
        └── lib/
            ├── env.js
            ├── ws-server.js
            ├── worktrees.js
            ├── db.js
            ├── db-instance.js
            ├── db-migrations.js
            ├── response-poller.js
            ├── cli-session.js
            ├── prompt-detector.js
            ├── conversation-logger.js
            ├── claude-output.js
            └── cli-patterns.js
```

### 4.2 CI/CD更新 [SF-002対応, Stage 2 SF-002対応: 詳細化]

#### CI/CD重複に関する設計判断

ci-pr.ymlとpublish.ymlの両方で`build:server`ステップを追加する。

**重複の認識**: 両ワークフローでほぼ同一のステップ追加となるが、以下の理由から現時点では共通化しない:

1. **プロジェクト規模**: 現在のCI/CD規模では共通化のオーバーヘッドが上回る
2. **独立性**: 各ワークフローの目的が異なる（PR検証 vs リリース）
3. **将来の共通化**: ビルドステップが3つ以上に増えた場合、Composite Actionへの移行を検討

#### ci-pr.yml更新 [Stage 2 SF-002対応: 具体的差分明記]

PRマージ前にbuild:serverの検証を行い、mainブランチでのビルド失敗を防止する。

**現在のbuildジョブ**:
```yaml
- name: Build
  run: npm run build
```

**変更後のbuildジョブ**:
```yaml
- name: Build Next.js
  run: npm run build

- name: Build CLI
  run: npm run build:cli

- name: Build server
  run: npm run build:server
```

**変更理由**: 各ビルドステップを分離することで、失敗時の原因特定が容易になる

#### publish.yml更新 [Stage 2 SF-002対応: 具体的差分明記]

npm publish前にbuild:serverを実行し、パッケージサイズを計測する。

**現在のビルドステップ**:
```yaml
- name: Build
  run: npm run build

- name: Build CLI
  run: npm run build:cli
```

**変更後のビルドステップ**:
```yaml
- name: Build Next.js
  run: npm run build

- name: Build CLI
  run: npm run build:cli

- name: Build server
  run: npm run build:server

- name: Check package size
  run: |
    npm pack --dry-run 2>&1 | tee pack-output.txt
    # サイズが100MBを超えた場合に警告
    SIZE=$(grep "total files" pack-output.txt | grep -oE '[0-9]+(\.[0-9]+)?\s*(MB|kB)' || echo "0 kB")
    echo "Package size: $SIZE"
```

**追加理由**: パッケージサイズの監視によりstandaloneモード移行の判断材料を提供

### 4.3 グローバルインストール動作検証

**CI自動検証案**:
```bash
# GitHub ActionsでのE2E的検証
npm pack
npm install -g commandmate-*.tgz
commandmate init --defaults
commandmate start --daemon
sleep 5
commandmate status
commandmate stop
```

**手動テストプロセス**:
1. `npm pack`でローカルにtarball作成
2. `npm install -g commandmate-*.tgz`でテストインストール
3. `commandmate init --defaults && commandmate start`で起動確認
4. 動作確認後`npm uninstall -g commandmate`でクリーンアップ

### 4.4 開発モード維持

`npm run dev`は引き続き`tsx server.ts`を使用（ホットリロード対応のため）。本変更は本番用`start`スクリプトのみに影響する。

### 4.5 ロールバック手順 [Stage 3 SF-004対応: 拡充]

問題が発生した場合の完全なロールバック手順:

#### 4.5.1 基本方針

tsxをdependenciesに戻すことで暫定状態に復旧可能。

#### 4.5.2 完全ロールバック手順

| ステップ | 対象ファイル | 復元内容 |
|---------|-------------|---------|
| 1 | `package.json` | `start`スクリプトを`tsx server.ts`に戻す |
| 2 | `package.json` | `build:server`スクリプトを削除 |
| 3 | `package.json` | `build:all`から`build:server`を削除 |
| 4 | `package.json` | `prepublishOnly`を元の設定に戻す |
| 5 | `package.json` | `files`フィールドから`.next/`, `public/`を削除、`src/`を追加 |
| 6 | `package.json` | `devDependencies`から`tsc-alias`を削除 |
| 7 | `package.json` | `dependencies`に`tsx`を追加（暫定対応） |
| 8 | `tsconfig.base.json` | ファイルを削除 |
| 9 | `tsconfig.server.json` | ファイルを削除 |
| 10 | `tsconfig.cli.json` | `extends`と`paths`オーバーライドを削除（元の設定に戻す） |
| 11 | `.github/workflows/ci-pr.yml` | `build:server`ステップを削除 |
| 12 | `.github/workflows/publish.yml` | `build:server`ステップとパッケージサイズ計測を削除 |
| 13 | `dist/server/` | ディレクトリを削除 |
| 14 | `CLAUDE.md` | `build:server`の記述を削除 |

#### 4.5.3 失敗シナリオ別の対応

| シナリオ | 緊急度 | 対応 | ロールバック範囲 |
|---------|--------|------|-----------------|
| build:serverがCIで失敗 | 低 | PRの修正またはクローズ | PRのみ（本番影響なし） |
| publish後にグローバルインストール失敗 | 高 | npm unpublish（24時間以内）または修正版リリース | 完全ロールバック |
| 部分的ビルド失敗 | 中 | 失敗原因の修正 | 原因に応じた部分対応 |
| 本番環境での起動失敗 | 高 | 前バージョンへの案内 + 修正版リリース | 完全ロールバック |

#### 4.5.4 ロールバック検証

ロールバック後の確認事項:

```bash
# 1. ビルドが正常に完了
npm run build && npm run build:cli

# 2. 開発モードが動作
npm run dev

# 3. グローバルインストールテスト
npm pack
npm install -g commandmate-*.tgz
commandmate start --daemon
commandmate status
commandmate stop
npm uninstall -g commandmate
```

### 4.6 dist/server/server.js不在時のエラーハンドリング [Stage 3 MF-002対応]

#### 問題のシナリオ

`npm install -g commandmate`後、`build:server`が実行されていない状態で`commandmate start`を実行した場合:

```bash
$ commandmate start
Error: Cannot find module '/path/to/dist/server/server.js'
```

#### 対応設計

**現状の動作**:
- `npm run start`が`node dist/server/server.js`を実行
- ファイルが存在しない場合、Node.jsの標準エラーメッセージが表示される

**改善案（将来課題）**:

1. **CLIコマンド側での事前チェック**:
   - `commandmate start`実行前に`dist/server/server.js`の存在を確認
   - 存在しない場合、明確なエラーメッセージとガイダンスを表示

2. **エラーメッセージ案**:
   ```
   Error: Server build not found at dist/server/server.js

   This may occur if:
   - The package was installed from source without building
   - The build process failed

   To fix:
   1. Run 'npm run build:server' to build the server
   2. Or reinstall: npm install -g commandmate
   ```

**本Issue対応範囲**:
- npm publishされるパッケージには`prepublishOnly`でビルド済みファイルが含まれる
- グローバルインストール時は問題が発生しない設計
- ローカル開発時は`npm run dev`を使用する想定

**CLIコマンド改善（将来課題）**:
- `src/cli/commands/start.ts`に存在チェックを追加
- 明確なエラーメッセージとリカバリー手順を提供

---

## 5. 影響範囲

### 5.1 直接変更対象

| ファイル | 変更内容 |
|---------|---------|
| `tsconfig.base.json` | 新規作成（共通設定集約） |
| `tsconfig.server.json` | 新規作成 |
| `tsconfig.cli.json` | extendsでtsconfig.base.jsonを継承、pathsオーバーライド追加 |
| `package.json` | scripts、files、devDependencies更新 |
| `.github/workflows/ci-pr.yml` | build:serverステップ追加 |
| `.github/workflows/publish.yml` | build:serverステップ追加 |
| `CLAUDE.md` | build:serverコマンド追記 |

### 5.2 確認・調整必要

| ファイル | 確認内容 |
|---------|---------|
| `README.md` | インストール手順に影響がないことを確認 |
| `server.ts` | ビルド後のパス解決が正しく動作することを検証 |
| `bin/commandmate.js` | tsconfig.cli.json変更時のrequireパス整合性を確認 [Stage 3 MF-001対応] |

### 5.3 テスト影響（要確認） [Stage 3 SF-001対応]

| ファイル | 確認理由 | 更新タイプ |
|---------|---------|-----------|
| `tests/unit/cli/commands/start.test.ts` | startコマンドがnpm run startを実行する際の振る舞いが変わる可能性 | potential |
| `tests/unit/cli/utils/daemon.test.ts` | daemonがnpm run startを実行する際の振る舞いが変わる可能性 | potential |

**確認ポイント**:
- npm runコマンドの実行結果に依存するテストがあるか
- モックされている場合は影響なし
- 実際にプロセスを起動するテストは動作確認が必要

### 5.4 影響なし

- `src/cli/` - 既存CLIモジュール（変更なし）
- `src/app/` - Next.js App Router（変更なし）
- `src/components/` - UIコンポーネント（変更なし）

---

## 6. 実装チェックリスト

### 6.1 機能要件

- [ ] `npm install -g commandmate` でインストール後、`commandmate start`が正常に動作する
- [ ] `tsx`が`devDependencies`のままで動作する
- [ ] 開発モード（`npm run dev`）が引き続き動作する
- [ ] 全テストがパスする
- [ ] パッケージサイズが許容範囲内（目安: 50MB以下）

### 6.2 実装タスク

#### TypeScript設定 [MF-001, MF-002対応, Stage 2 MF-001/MF-002対応]

- [ ] `tsconfig.base.json`を新規作成（共通設定集約）
- [ ] `tsconfig.server.json`を新規作成（依存ファイルのみを明示的にinclude）
  - [ ] response-poller.tsの依存ファイル5件を含める（cli-session, prompt-detector, conversation-logger, claude-output, cli-patterns）
- [ ] `tsconfig.cli.json`をextendsで継承、`paths: {}`でオーバーライド
- [ ] `tsc-alias`をdevDependenciesに追加（バージョン: `~1.8.16`推奨）[Stage 4 SF-SEC-001対応]

#### package.json更新 [MF-003対応, Stage 2 MF-003対応]

- [ ] `build:server`スクリプト追加
- [ ] `build:all`に`build:server`を追加
- [ ] `start`スクリプトを`node dist/server/server.js`に変更
- [ ] `prepublishOnly`を`npm run build:all`に変更
- [ ] `files`フィールド更新（.next/, public/追加、src/除外）
- [ ] `.npmignore`ファイル作成（src/の二重保護）[Stage 4 SF-SEC-002対応]

#### 検証タスク

- [ ] ビルド後のパス解決が正しく動作することを検証
- [ ] src/types/models.tsの@/パスがtsc-aliasで正しく解決されることを確認 [SF-003対応]
- [ ] グローバルインストールでの動作検証
- [ ] パッケージサイズの確認（50MB以下）
- [ ] bin/commandmate.jsからdist/cli/index.jsへの参照が有効であることを確認 [Stage 3 MF-001対応]
- [ ] 開発モード（npm run dev）がtsconfig.server.json追加後も正常に動作することを確認 [Stage 3 SF-003対応]
- [ ] `npm pack --dry-run`で公開ファイルにsrc/が含まれないことを確認 [Stage 4 SF-SEC-002対応]

#### テスト影響確認タスク [Stage 3 SF-001対応]

- [ ] `tests/unit/cli/commands/start.test.ts`がstartスクリプト変更の影響を受けるか確認
- [ ] `tests/unit/cli/utils/daemon.test.ts`がstartスクリプト変更の影響を受けるか確認
- [ ] 影響がある場合、テストの更新または新規テスト追加を検討

### 6.3 CI/CD [SF-002対応, Stage 2 SF-002対応]

- [ ] `ci-pr.yml`にbuild:serverステップを追加（既存buildステップを分離）
- [ ] `publish.yml`にbuild:serverステップを追加（パッケージサイズ計測含む）

### 6.4 ドキュメント

- [ ] CLAUDE.mdにbuild:serverコマンドを追記
- [ ] README.mdのインストール手順に影響がないことを確認

---

## 7. セキュリティ考慮事項 [Stage 4 セキュリティレビュー対応]

### 7.1 OWASP Top 10 コンプライアンスサマリー

本設計変更に対するOWASP Top 10 2021の評価結果:

| カテゴリ | ステータス | 備考 |
|---------|-----------|------|
| A01: Broken Access Control | 該当なし | アクセス制御への影響なし |
| A02: Cryptographic Failures | 該当なし | 暗号化機能への影響なし |
| A03: Injection | **Pass** | spawn()使用、execSync()不使用。引数配列方式でコマンドインジェクション対策済み |
| A04: Insecure Design | **Pass** | 依存チェーン分析、ロールバック手順、CI/CD検証を含む堅牢な設計 |
| A05: Security Misconfiguration | **Pass (推奨あり)** | files除外適切。db-instance.tsの環境変数取得不整合は軽微な課題 |
| A06: Vulnerable and Outdated Components | **Pass (推奨あり)** | tsc-aliasは安定パッケージ。既存依存関係の脆弱性は別Issue推奨 |
| A07: Identification and Authentication Failures | 該当なし | 認証機能への影響なし |
| A08: Software and Data Integrity Failures | **Pass (推奨あり)** | prepublishOnlyでビルド強制。バージョン固定方針明確化を推奨 |
| A09: Security Logging and Monitoring Failures | 該当なし | ロギング機能への影響なし。既存security-logger.ts維持 |
| A10: SSRF | 該当なし | ネットワークリクエスト処理への影響なし |

**全体評価**: **低リスク** - 本設計変更はセキュリティ上安全に実装可能

### 7.2 サプライチェーンセキュリティ

#### tsc-aliasパッケージ評価

| 評価項目 | 結果 |
|---------|------|
| パッケージ名 | tsc-alias |
| 最新バージョン | 1.8.16 |
| npm週間ダウンロード | 200万+ |
| リポジトリ | https://github.com/justkey007/tsc-alias |
| 最終更新 | 2025-05-05 |
| 既知の脆弱性 | なし |
| リスク評価 | **低** - devDependenciesとしてのみ使用、本番ランタイムには影響しない |

**依存関係**:
- chokidar (^3.5.3)
- commander (^9.0.0)
- get-tsconfig (^4.10.0)
- globby (^11.0.4)
- mylas (^2.1.9)
- normalize-path (^3.0.0)
- plimit-lit (^1.2.6)

**推奨事項**: バージョン指定は`~1.8.16`（チルダ方式）を使用し、パッチ更新のみ自動取得

#### npm publish セキュリティ

| 項目 | 設定 |
|------|------|
| files含有 | bin/, dist/, .next/, public/, .env.example |
| files除外 | src/, node_modules/, .env, .git/ |
| prepublish | `npm run build:all`でビルド強制 |
| リスク | **低** - 機密ファイルは除外されている |

### 7.3 ビルドセキュリティ

#### 機密ファイル除外の検証

| ファイル | 除外方法 | ステータス |
|---------|---------|-----------|
| `.env` | gitignore + filesフィールドに含まれない | **Pass** |
| `.env.local` | gitignore | **Pass** |
| `*.pem` | gitignore | **Pass** |
| `db.sqlite` | gitignore + /data/除外 | **Pass** |
| `node_modules/` | npm default exclusion | **Pass** |

#### 安全に含まれるファイル

| ファイル | 理由 |
|---------|------|
| `.env.example` | テンプレートのみ、実際の値なし |
| `bin/` | CLIエントリポイント |
| `dist/` | ビルド済みJS |

#### ハードコードシークレットチェック

- 対象ファイル: server.ts, src/lib/env.ts, src/cli/
- 結果: **Pass** - ハードコードされた機密情報なし。環境変数経由で設定を取得

### 7.4 ランタイムセキュリティ

#### 環境変数ハンドリング

| 変数 | 検証内容 |
|------|---------|
| CM_PORT | 数値検証 (1-65535) |
| CM_BIND | 許可値検証 (127.0.0.1, 0.0.0.0, localhost) |
| CM_AUTH_TOKEN | 0.0.0.0バインド時に必須チェック、logger.tsでマスキング |

#### ファイルシステムアクセス

- db-instance.ts: mkdirSync with recursive:true（ディレクトリ作成のみ）
- worktrees.ts: ファイルシステム操作はworktreeパス内に限定
- pid-manager.ts: O_EXCLによるアトミック書き込み（TOCTOU対策）
- パストラバーサル保護: isPathSafe()関数で検証

#### プロセス管理

- spawn()で引数配列使用（シェルインジェクション対策）
- PIDファイルはO_EXCLによるアトミック操作（TOCTOU対策）
- SIGTERM/SIGINTでgraceful shutdown

### 7.5 既存脆弱性の記録 [Stage 4 SF-SEC-004対応]

npm auditで検出された既存の脆弱性（本Issue #113のスコープ外）:

| パッケージ | 深刻度 | 内容 | 推奨対応 |
|-----------|--------|------|---------|
| eslint-config-next関連 | 高 | glob CLIコマンドインジェクション | v16.xへのメジャーアップデート |
| mermaid関連 | 中 | langium経由の脆弱性 | 依存関係の更新 |
| eslint | 中 | Stack Overflow | v9.xへのメジャーアップデート |

**対応方針**: 別Issueとして依存関係のアップデートを計画

### 7.6 将来のセキュリティ改善（Nice to Have）

| ID | カテゴリ | 内容 | 推奨対応 |
|----|---------|------|---------|
| NTH-SEC-001 | ビルドセキュリティ | ビルド成果物の整合性検証 | CI/CDでchecksum計算と検証を追加 |
| NTH-SEC-002 | サプライチェーン | 依存関係自動更新 | dependabotまたはrenovateの導入 |
| NTH-SEC-003 | 情報開示 | パッケージサイズ増加モニタリング | CIに`npm pack --dry-run`検証ステップ追加 |

---

## 8. 期待される効果

| 項目 | Before | After |
|------|--------|-------|
| 実行方式 | `tsx server.ts`（TSランタイム） | `node dist/server/server.js`（ビルド済みJS） |
| 起動速度 | やや遅い | 高速 |
| 依存関係 | tsxランタイム必要 | 不要 |
| 本番運用 | 非標準 | Node.js標準方式 |

---

## 9. 関連Issue

- Issue #96: npm CLIサポート
- 暫定対応: tsxをdependenciesに移動
- 依存関係脆弱性対応: 別Issue作成推奨（eslint-config-next, mermaid, eslint）[Stage 4 SF-SEC-004対応]

---

## 10. レビュー履歴

| 日付 | ステージ | レビュー種別 | 結果 |
|------|---------|-------------|------|
| 2026-02-01 | Stage 1 | 通常レビュー（設計原則） | Must Fix: 3件, Should Fix: 4件, Nice to Have: 3件 |
| 2026-02-01 | Stage 2 | 整合性レビュー | Must Fix: 3件, Should Fix: 4件, Nice to Have: 3件 |
| 2026-02-01 | Stage 3 | 影響分析レビュー | Must Fix: 2件, Should Fix: 4件, Nice to Have: 3件 |
| 2026-02-01 | Stage 4 | セキュリティレビュー | Must Fix: 0件, Should Fix: 4件, Nice to Have: 3件 |

---

## 11. レビュー指摘事項サマリー

### 11.1 Stage 1 通常レビュー（2026-02-01）

#### Must Fix（対応済み）

| ID | カテゴリ | 指摘内容 | 対応セクション |
|----|---------|---------|---------------|
| MF-001 | DRY | tsconfig.server.jsonとtsconfig.cli.jsonの設定重複 | 3.3, 3.5 |
| MF-002 | KISS | includeパターンが広すぎる | 3.5 |
| MF-003 | SRP | filesフィールドのsrc/追加の意図不明確 | 3.6 |

#### Should Fix（対応済み）

| ID | カテゴリ | 指摘内容 | 対応セクション |
|----|---------|---------|---------------|
| SF-001 | YAGNI | standaloneモード検討トリガーが不明確 | 3.7 |
| SF-002 | DRY | CI/CDでのbuild:serverステップ重複 | 4.2 |
| SF-003 | OCP | 依存関係変更時の対応方針が未定義 | 3.8 |
| SF-004 | KISS | tsc-alias vs 相対パスの選択根拠が不十分 | 3.2.1 |

#### Nice to Have（将来課題として記録）

| ID | カテゴリ | 指摘内容 | 対応方針 |
|----|---------|---------|---------|
| NTH-001 | DIP | server.tsの依存性注入パターン検討 | 将来のリファクタリング候補 |
| NTH-002 | ISP | db.tsのモジュール分割 | 別Issue（リファクタリング）で検討 |
| NTH-003 | Documentation | 依存チェーン分析の自動化 | madge等のツール導入を将来検討 |

### 11.2 Stage 2 整合性レビュー（2026-02-01）

#### Must Fix（対応済み）

| ID | カテゴリ | 指摘内容 | 対応セクション |
|----|---------|---------|---------------|
| MF-001 | 依存チェーン分析の不正確性 | response-poller.tsが@/パスを使用していると記載されていたが、実際は相対パスのみ使用 | 2.3 |
| MF-002 | tsconfig.server.json includeリストの不足 | response-poller.tsの依存ファイル（cli-session, prompt-detector, conversation-logger, claude-output, cli-patterns）が不足 | 3.5, 4.1, 6.2 |
| MF-003 | filesフィールドの整合性問題 | .next/とpublic/の追加理由が不明確 | 3.6 |

#### Should Fix（対応済み）

| ID | カテゴリ | 指摘内容 | 対応セクション |
|----|---------|---------|---------------|
| SF-001 | tsconfig.cli.jsonとの設定差異 | tsconfig.base.json継承時のpaths影響を明確化 | 3.3.1 |
| SF-002 | CI/CDステップ配置の正確性 | 具体的な変更差分を明記 | 4.2 |
| SF-003 | src/types内の@/パス使用 | models.tsの@/パス使用に関する注意事項を追記 | 3.5.1, 6.2 |
| SF-004 | prepublishOnlyスクリプトの変更 | publish.ymlとの重複を検討し、設計判断を明記 | 3.6.1 |

#### Nice to Have（将来課題として記録）

| ID | カテゴリ | 指摘内容 | 対応方針 |
|----|---------|---------|---------|
| NTH-001 | db-instance.tsのDATABASE_PATHフォールバック | env.tsのgetEnvByKey使用を検討 | 別Issue（一貫性改善）で検討 |
| NTH-002 | 依存分析ツールの自動化 | madge等の早期導入でMF-001/MF-002のような分析ミスを防止 | 将来のCI改善で検討 |
| NTH-003 | ビルドディレクトリ構成の詳細 | rootDir: '.'の設定でdist/server/src/lib/構成になるか検証が必要 | 実装時に検証 |

### 11.3 Stage 3 影響分析レビュー（2026-02-01）

#### Must Fix（対応済み）

| ID | カテゴリ | 指摘内容 | 対応セクション |
|----|---------|---------|---------------|
| MF-001 | 直接影響 | tsconfig.cli.jsonの出力先変更によるbin/commandmate.jsへの影響 | 3.9 |
| MF-002 | 間接影響 | daemon.tsとstart.tsのnpm scriptパス依存。dist/server/server.js不在時のエラーハンドリング未設計 | 4.6 |

#### Should Fix（対応済み）

| ID | カテゴリ | 指摘内容 | 対応セクション |
|----|---------|---------|---------------|
| SF-001 | テスト影響 | CLI関連テスト（start.test.ts, daemon.test.ts）の更新要件が未特定 | 5.3, 6.2 |
| SF-002 | デプロイ影響 | prepublishOnlyとpublish.ymlの実行順序による重複 | 3.6.1（設計判断済み） |
| SF-003 | 間接影響 | 開発時のnpm run devへの影響確認が必要 | 6.2 |
| SF-004 | ロールバック | 部分的失敗時のロールバック手順が不完全 | 4.5 |

#### Nice to Have（将来課題として記録）

| ID | カテゴリ | 指摘内容 | 対応方針 |
|----|---------|---------|---------|
| NTH-001 | テスト影響 | ビルド検証用E2Eテストの追加 | 将来的にE2Eテストでグローバルインストール検証を自動化 |
| NTH-002 | 直接影響 | tsc-aliasの依存関係バージョン固定 | 実装時にバージョン指定方針（^x.y.z vs ~x.y.z）を決定 |
| NTH-003 | デプロイ影響 | パッケージサイズ増加のモニタリング | 現在のパッケージサイズを計測し、変更前後の比較データを記録 |

### 11.4 Stage 4 セキュリティレビュー（2026-02-01）

#### Must Fix

なし - 重大なセキュリティリスクは検出されませんでした。

#### Should Fix（対応済み）

| ID | カテゴリ | 指摘内容 | 対応セクション |
|----|---------|---------|---------------|
| SF-SEC-001 | Supply Chain Security | tsc-aliasのバージョン固定方針が未定義 | 3.2.2, 6.2 |
| SF-SEC-002 | Build Security | src/除外の意図ドキュメント化、.npmignore二重保護 | 3.6, 6.2 |
| SF-SEC-003 | Runtime Security | db-instance.tsの環境変数取得不整合 | 7.1（Stage 2 NTH-001で既に記録済み） |
| SF-SEC-004 | Existing Vulnerabilities | 既存依存関係に中～高の脆弱性あり | 7.5, 9 |

#### Nice to Have（将来課題として記録）

| ID | カテゴリ | 指摘内容 | 対応方針 |
|----|---------|---------|---------|
| NTH-SEC-001 | Build Security | ビルド成果物の整合性検証（checksum） | CI/CDでビルド成果物のchecksum計算と検証を追加 |
| NTH-SEC-002 | Supply Chain Security | dependabotまたはrenovateの導入 | GitHubのdependabotを設定し、セキュリティ更新PRを自動生成 |
| NTH-SEC-003 | Information Disclosure | npm pack --dry-runでの公開ファイル検証 | CIに検証ステップを追加 |

---

*Created: 2026-02-01*
*Last Updated: 2026-02-01 (Stage 4 セキュリティレビュー反映)*
