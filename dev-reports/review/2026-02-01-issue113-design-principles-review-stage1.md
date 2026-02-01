# Issue #113 設計原則レビュー (Stage 1)

**レビュー日**: 2026-02-01
**レビュー種別**: 通常レビュー
**フォーカス領域**: 設計原則 (SOLID, KISS, YAGNI, DRY)
**対象設計書**: `dev-reports/design/issue-113-server-build-design-policy.md`

---

## 1. レビュー概要

Issue #113「server.ts ビルド済みJS変換」の設計方針書に対して、設計原則（SOLID, KISS, YAGNI, DRY）の観点からレビューを実施した。

### 分析対象ファイル

| ファイル | 確認内容 |
|---------|---------|
| `server.ts` | 依存関係、@/パス使用状況 |
| `src/lib/env.ts` | @/パス使用状況 - なし |
| `src/lib/worktrees.ts` | @/パス使用状況 - `@/types/models` |
| `src/lib/db.ts` | @/パス使用状況 - `@/types/models`, `@/lib/cli-tools/types` |
| `src/lib/response-poller.ts` | @/パス使用状況 - なし（相対パス使用） |
| `tsconfig.cli.json` | 既存CLI設定との比較 |
| `tsconfig.json` | パスエイリアス設定確認 |
| `package.json` | 現在のスクリプト構成 |

---

## 2. 指摘事項サマリー

| 分類 | 件数 | 内容 |
|------|------|------|
| Must Fix | 3 | DRY違反、KISS違反、SRP不明確 |
| Should Fix | 4 | YAGNI、DRY、OCP、KISS関連 |
| Nice to Have | 3 | DIP、ISP、文書化改善 |

---

## 3. Must Fix (必須対応)

### MF-001: tsconfig設定の重複 (DRY)

**問題**:
`tsconfig.server.json`の提案内容が`tsconfig.cli.json`と大部分重複している。以下の設定が2つのファイルで重複する:

- `target: "ES2022"`
- `module: "commonjs"`
- `moduleResolution: "node"`
- `esModuleInterop: true`
- `strict: true`
- `skipLibCheck: true`

**推奨対応**:
`tsconfig.base.json`を新規作成し、共通設定を集約する。

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true
  }
}

// tsconfig.server.json
{
  "extends": "./tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist/server",
    "rootDir": ".",
    "declaration": false,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["server.ts", "src/**/*.ts"],
  "exclude": ["node_modules", "tests", "src/cli/**", "src/app/**"]
}
```

---

### MF-002: 不要なファイルのコンパイル対象化 (KISS)

**問題**:
設計書の`tsconfig.server.json`案では`include: ["server.ts", "src/**/*.ts"]`を指定しているが、`srcディレクトリ`配下全体を含めると、以下の不要なコードもコンパイル対象となる:

- `src/cli/` - CLI専用コード（既にtsconfig.cli.jsonで管理）
- `src/app/` - Next.js App Router（Next.jsビルドで管理）

`exclude`で除外しているが、includeを絞る方がシンプル。

**推奨対応**:
必要なファイルのみを明示的にincludeする:

```json
{
  "include": [
    "server.ts",
    "src/lib/**/*.ts",
    "src/types/**/*.ts",
    "src/config/**/*.ts",
    "src/contexts/**/*.ts",
    "src/hooks/**/*.ts"
  ]
}
```

または、server.ts依存分析結果に基づき最小限のパスを指定する。

---

### MF-003: package.json filesフィールドの意図不明確 (SRP)

**問題**:
設計書では`package.json`の`files`フィールドに`.next/`と`src/`を追加する提案があるが:

1. **src/**: ビルド済み`dist/`があれば本番実行には不要。ソースコード公開の意図が不明。
2. **.next/**: standaloneモードでない場合の必要性が不明確。

パッケージサイズ増大とのトレードオフ説明が欠けている。

**推奨対応**:
filesフィールドの変更意図を明確化する。具体的には:

1. `src/`が本当に必要か再検討（ビルド済みJSのみで動作するなら不要）
2. `.next/`の必要性をstandaloneモードとの関連で確認
3. 判断根拠を設計書に追記

---

## 4. Should Fix (推奨対応)

### SF-001: standaloneモード検討トリガー不明確 (YAGNI)

**問題**:
設計書セクション3.6でNext.js standaloneモードを「検討事項」として言及しているが、検討の具体的なトリガー条件が不明確。

**推奨対応**:
検討トリガーを明確化する。例:
- パッケージサイズが50MBを超えた場合
- 特定の依存解決エラーが発生した場合
- 初期スコープ外として明示的に除外

---

### SF-002: CI/CDワークフローの重複 (DRY)

**問題**:
`ci-pr.yml`と`publish.yml`の両方に同一の`build:server`ステップを追加する記載がある。

**推奨対応**:
- 現状のプロジェクト規模では許容範囲
- コメントで重複を認識した上で進めることを推奨
- 将来的にはComposite ActionまたはReusable Workflowを検討

---

### SF-003: 依存関係変更時の設定更新リスク (OCP)

**問題**:
server.tsに新しい`@/`パスモジュールが追加された場合、`tsconfig.server.json`の更新が必要になる可能性がある。

**推奨対応**:
- 依存関係の変更に対する設定更新手順を文書化
- 将来的には依存チェック自動化を検討

---

### SF-004: tsc-alias vs 相対パスの選択根拠不足 (KISS)

**問題**:
tsc-aliasの導入は追加の依存関係とビルドステップを増やす。現在の`@/`パス使用箇所は限定的（3ファイル）。相対パスへの置換という代替案も設計書で言及されているが、選択理由が不十分。

**現状の@/パス使用箇所**:
| ファイル | 使用箇所 |
|---------|---------|
| `src/lib/worktrees.ts` | `import type { Worktree } from '@/types/models'` |
| `src/lib/db.ts` | `import type { Worktree, ... } from '@/types/models'`<br>`import type { CLIToolType } from '@/lib/cli-tools/types'` |
| `src/lib/response-poller.ts` | なし（相対パス使用済み） |

**推奨対応**:
tsc-alias導入 vs 相対パス化のトレードオフを明確に文書化する:

| 観点 | tsc-alias | 相対パス化 |
|------|-----------|-----------|
| 依存追加 | あり（+1 devDep） | なし |
| ビルド複雑度 | やや増加 | 変化なし |
| 保守性 | @/パス維持 | 相対パスに統一 |
| 既存コードへの影響 | なし | 2ファイル変更 |

---

## 5. Nice to Have (将来的な改善)

### NTH-001: 依存性注入の検討 (DIP)

`server.ts`が直接具体的なモジュールに依存している。将来的にテスタビリティ向上のためDIパターンを検討する余地がある。

**現状**: 対応不要
**推奨**: バックログに記録

---

### NTH-002: db.tsのモジュール分割 (ISP)

`db.ts`は50以上の関数をエクスポートしているが、`server.ts`が必要とするのはごく一部（`upsertWorktree`など）。

**現状**: 対応不要
**推奨**: 別Issueとしてリファクタリング検討

---

### NTH-003: 依存チェーン分析の自動化

設計書セクション2.3の依存チェーン分析は手動と思われ、変更時の更新漏れリスクがある。

**現状**: 対応不要
**推奨**: madge等のツール導入を将来的に検討

---

## 6. 総合評価

設計方針は概ね妥当であり、Issue #113の目的（tsx依存除去によるグローバルインストール改善）を達成できる見込み。

### 実装可否判断

| 判定 | 条件 |
|------|------|
| **実装可** | Must Fix 3件を解消すれば実装に進めて問題ない |

### 優先対応事項

1. **MF-001**: tsconfig.base.json導入による設定重複解消
2. **MF-002**: includeリストの最適化
3. **MF-003**: filesフィールド変更の意図明確化

---

## 7. レビュー結果ファイル

詳細なJSON形式のレビュー結果:
`/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/dev-reports/issue/113/multi-stage-design-review/stage1-review-result.json`

---

*Reviewed by: Architecture Review Agent*
*Date: 2026-02-01*
