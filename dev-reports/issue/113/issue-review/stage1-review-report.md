# Issue #113 レビューレポート

**レビュー日**: 2026-02-01
**フォーカス**: 通常レビュー（整合性・正確性）
**イテレーション**: 1回目（Stage 1）

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 2 |
| Should Fix | 4 |
| Nice to Have | 2 |

## Must Fix（必須対応）

### MF-1: tsconfig.server.jsonの設計案がパスエイリアス未対応

**カテゴリ**: 技術的正確性
**場所**: ## 技術的な考慮事項 > tsconfig.server.json（案）

**問題**:
現在のtsconfig.jsonでは`paths: { '@/*': ['./src/*'] }`が設定されています。提案されているtsconfig.server.jsonにはパスエイリアス設定が含まれていません。

TypeScriptのtsc単体ではパスエイリアス（`@/`形式）は解決されません。ビルド後のJavaScriptファイルでは`@/lib/env`のようなimportが解決されず、実行時エラーになります。

**証拠**:
- tsconfig.json: `"paths": { "@/*": ["./src/*"] }`
- tsconfig.server.json（案）: paths設定なし
- server.tsは相対パス（`./src/lib/env`）を使用しているが、src/lib/内のファイルが@/パスを使用している可能性

**推奨対応**:
以下のいずれかの対応が必要です：
1. `tsc-alias`パッケージを追加し、ビルド後にパスを解決する
2. tsconfig.server.jsonにpaths設定を追加し、パス解決ツールを使用
3. server.tsおよび依存ファイルすべてで相対パスを使用

---

### MF-2: module: NodeNextとpackage.json type設定の整合性未考慮

**カテゴリ**: 技術的正確性
**場所**: ## 技術的な考慮事項 > tsconfig.server.json（案）

**問題**:
tsconfig.server.jsonで`"module": "NodeNext"`を使用する場合、package.jsonに`"type": "module"`が必要です。現在のpackage.jsonにはtype指定がないため、デフォルトでCommonJSとして扱われます。

この不整合により、ESM形式でビルドされたファイルがCommonJS環境で読み込まれ、実行時エラーが発生します。

**証拠**:
- tsconfig.server.json（案）: `"module": "NodeNext"`
- tsconfig.cli.json（既存）: `"module": "commonjs"`
- package.json: type指定なし（デフォルトCommonJS）

**推奨対応**:
既存のtsconfig.cli.jsonに合わせて、tsconfig.server.jsonも以下のように設定することを推奨します：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    ...
  }
}
```

---

## Should Fix（推奨対応）

### SF-1: prepublishOnlyにbuild:serverが含まれていない

**カテゴリ**: 整合性
**場所**: ## 技術的な考慮事項 > package.json変更（案）

**問題**:
提案では`prepublishOnly: 'npm run build:all'`となっていますが、現在のprepublishOnlyは`npm run build:cli`のみです。また、現在のbuild:allにはNext.jsビルド（`npm run build`）とCLIビルド（`npm run build:cli`）のみが含まれています。

**証拠**:
- 現在のpackage.json: `"prepublishOnly": "npm run build:cli"`
- 現在のbuild:all: `"npm run build && npm run build:cli"`

**推奨対応**:
変更内容を以下のように明確に記載してください：
- build:allを`npm run build && npm run build:cli && npm run build:server`に更新
- prepublishOnlyを`npm run build:all`に更新（または現状維持でbuild:all経由）

---

### SF-2: Next.jsビルド成果物(.next/)の依存関係が未検証

**カテゴリ**: 完全性
**場所**: ## 課題 セクション

**問題**:
`.next/`ディレクトリをfilesに含める場合、そのサイズと依存関係について詳細な検証が必要です。Next.jsの`output: 'standalone'`モードを使用すれば、必要なnode_modulesも含まれた自己完結型のビルドが可能です。

**証拠**:
- next.config.js: output設定なし（デフォルト）
- 課題セクション: 「.next/ディレクトリをパッケージに含める必要があり、サイズが大幅に増加」

**推奨対応**:
以下の選択肢を検討し、判断根拠を記載してください：
1. standalone mode使用（自己完結型、サイズ増加）
2. 従来モード + node_modules依存（サイズ小、実行環境依存）

---

### SF-3: パッケージサイズ目標50MBの根拠が不明確

**カテゴリ**: 受け入れ条件
**場所**: ## 受け入れ条件

**問題**:
「パッケージサイズが許容範囲内（目安: 50MB以下）」という条件がありますが、50MBの根拠が不明確です。

**推奨対応**:
- 現在のパッケージサイズ（Before）を記載
- 50MBの根拠（npm推奨値、類似ツールとの比較など）を記載
- サイズ超過時の対応方針を記載

---

### SF-4: 開発モード（npm run dev）の動作維持が不明確

**カテゴリ**: 明確性
**場所**: ## 受け入れ条件

**問題**:
受け入れ条件に「開発モード（`npm run dev`）が引き続き動作する」とありますが、devスクリプトをどうするかの方針が不明確です。

**証拠**:
- 現在のdev script: `"dev": "tsx server.ts"`

**推奨対応**:
以下のいずれかを明記してください：
1. devスクリプトは`tsx server.ts`のまま維持（開発時のDX優先）
2. devスクリプトも`node dist/server/server.js`に変更（一貫性優先）

推奨は1.（開発時はホットリロードやソースマップが重要なため）

---

## Nice to Have（あれば良い）

### NTH-1: CIパイプラインの更新タスクが未記載

**カテゴリ**: 完全性
**場所**: ## 実装タスク

**問題**:
build:serverをGitHub Actionsのワークフローに追加するタスクが記載されていません。

**推奨対応**:
CIでビルド検証を行う場合は、ワークフロー更新タスクを追加してください。

---

### NTH-2: ロールバック手順の記載がない

**カテゴリ**: 完全性
**場所**: Issue本文

**問題**:
問題発生時のロールバック手順が明記されていません。

**推奨対応**:
暫定対応（tsxをdependenciesに移動）をロールバック手順として明示的に記載してください。

---

## 参照ファイル

### コード

| ファイル | 関連性 |
|---------|--------|
| `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/server.ts` | 変更対象のサーバーエントリポイント |
| `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/package.json` | scripts、files、dependencies変更対象 |
| `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/tsconfig.json` | パスエイリアス設定の参照元 |
| `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/tsconfig.cli.json` | 既存のCLIビルド設定（参考） |
| `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/src/cli/commands/start.ts` | startコマンドの実装 |
| `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/src/cli/utils/daemon.ts` | デーモン管理 |

### ドキュメント

| ファイル | 関連性 |
|---------|--------|
| `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/CLAUDE.md` | CLIモジュール設計ガイドライン |
| `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/dev-reports/design/issue-96-npm-cli-design-policy.md` | 関連Issue #96の設計方針書 |

---

## 総評

Issue #113は、npmグローバルインストール時の`tsx: command not found`問題を根本解決するための重要な改善です。技術的なアプローチは妥当ですが、以下の点で追加の検討が必要です：

1. **TypeScript設定の整合性**: 特にパスエイリアスとモジュール形式について、既存設定との整合性を確認してください（MF-1, MF-2）

2. **ビルド依存関係の明確化**: prepublishOnlyとbuild:allの関係、Next.jsビルド成果物の扱いを明確にしてください（SF-1, SF-2）

3. **受け入れ条件の具体化**: パッケージサイズの根拠、開発モードの維持方針を明確にしてください（SF-3, SF-4）

これらの指摘に対応することで、実装時の手戻りを防ぎ、品質の高い成果物を効率的に作成できます。
