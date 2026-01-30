# Issue #100 Stage 3 レビューレポート

**レビュー日**: 2026-01-30
**フォーカス**: 影響範囲レビュー
**ステージ**: 3（影響範囲レビュー 1回目）

---

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 1 |
| Should Fix | 4 |
| Nice to Have | 3 |

---

## Must Fix（必須対応）

### MF-001: mermaidライブラリのSSR非互換性への対応が不十分

**カテゴリ**: 依存関係への影響
**場所**: 非機能要件セクション

**問題**:
Issue本文ではSSR環境でのプレースホルダー表示を記載しているが、具体的な実装方針が不足している。mermaidはDOMに依存するため、`next/dynamic`の`ssr: false`オプションまたは`useEffect`での遅延レンダリングが必要。rehype-mermaidやremark-mermaidsの利用時にも同様の考慮が必要である。

**証拠**:
- 現在のMarkdownEditor.tsxは`'use client'`ディレクティブでクライアントコンポーネントとして実装
- mermaidは`document`オブジェクトを使用するためSSRで実行不可
- Issue本文の非機能要件は「SSR環境ではプレースホルダー表示」と記載されているが、実装方法が不明確

**影響**:
SSR時のビルドエラーまたはハイドレーションミスマッチが発生する可能性がある。

**推奨対応**:
非機能要件に以下のいずれかの具体的な実装方針を追記する:
1. `next/dynamic`で`ssr: false`を使用した遅延読み込み
2. `useEffect`でのクライアントサイドレンダリング
3. `typeof window !== 'undefined'`チェックでの条件付きレンダリング

---

## Should Fix（推奨対応）

### SF-001: バンドルサイズ増加に対する具体的な軽減策が不足

**カテゴリ**: パフォーマンスへの影響
**場所**: 技術検討事項 > バンドルサイズへの影響

**問題**:
mermaidは約500KB以上のサイズで、現在のreact-markdown関連パッケージ（約50KB）と比較して10倍以上。Issue本文でdynamic importの検討を記載しているが、code splitting戦略やchunk分割の具体案がない。

**現在のパッケージサイズ参考**:
```
react-markdown@10.1.0
rehype-highlight@7.0.2
rehype-sanitize@6.0.0
remark-gfm@4.0.1
```

**影響**:
初期バンドルサイズの大幅増加（+500KB以上）により、ページロード時間が悪化する可能性がある。

**推奨対応**:
技術検討事項に以下を追記:
1. `next/dynamic`での遅延読み込み実装例
2. mermaidコードブロックがない場合はロードしない条件付き読み込み
3. バンドルサイズ測定方法（`npm run build`後のサイズ確認）

---

### SF-002: テスト戦略にrehype-sanitize互換性テストが含まれていない

**カテゴリ**: テストカバレッジ
**場所**: 受け入れ条件 AC-04

**問題**:
AC-04でテストケースの例（flowchart, sequenceDiagram描画）が追加されたが、rehype-sanitizeとの互換性テストが含まれていない。mermaid生成SVGがサニタイズによりブロックされないことを確認するテストが必要。

**現在のテスト構成**:
- `tests/unit/components/MarkdownEditor.test.tsx` - 792行
- XSS対策テスト（SEC-MF-001）は既存
- mermaid関連テストは未実装

**影響**:
セキュリティ設定とmermaid機能の両立が検証されず、本番環境で問題が発生する可能性がある。

**推奨対応**:
AC-04に以下のテストケースを追加:
- 「rehype-sanitizeとの互換性: mermaid生成SVGが正常に表示されること」
- 「securityLevel='strict'でのXSS対策が有効であること」

---

### SF-003: CI/CDパイプラインへの影響（ビルド時間・メモリ使用量）が未考慮

**カテゴリ**: CI/CDへの影響
**場所**: 技術検討事項

**問題**:
mermaid追加によりnpm installとビルド時間が増加する可能性がある。現在のCI/CD（`.github/workflows/ci-pr.yml`）ではbuild, lint, type-check, test-unitが実行されている。

**現在のCI/CDワークフロー**:
```yaml
jobs:
  lint: (continue-on-error: true)
  type-check: (continue-on-error: true)
  test-unit:
  build:
```

**影響**:
PRごとのCI実行時間が増加し、開発効率が低下する可能性がある。

**推奨対応**:
技術検討事項に「CI/CDへの影響」を追記:
- npm install時間: +10-20秒
- ビルド時間への影響: 軽微（遅延読み込みのため初期バンドルに含まれない場合）
- バンドルサイズチェックの追加検討

---

### SF-004: 既存マークダウンプレビュー機能への非破壊性保証が明示されていない

**カテゴリ**: 後方互換性
**場所**: 受け入れ条件 AC-03

**問題**:
AC-03に「既存のマークダウンプレビュー機能に影響がない」と記載されているが、rehypePluginsの順序変更やスキーマ変更による副作用の検証方法が不明確。

**現在のrehypePlugins構成** (MarkdownEditor.tsx):
```typescript
rehypePlugins={[
  rehypeSanitize,  // [SEC-MF-001] XSS protection
  rehypeHighlight,
]}
```

**影響**:
既存のマークダウンレンダリング（GFMテーブル、コードハイライト等）が意図せず変更される可能性がある。

**推奨対応**:
AC-03に以下の回帰テスト項目を追記:
- 既存のGFMテーブル、リスト、コードブロック（mermaid以外）のレンダリングが変更されないことを確認
- コードハイライト機能（highlight.js）が引き続き動作することを確認

---

## Nice to Have（あれば良い）

### NTH-001: アプローチ選定の推奨案が明示されていない

**カテゴリ**: ドキュメント
**場所**: 技術検討事項 > 実装アプローチ候補

**問題**:
技術検討事項で3つのアプローチが列挙されているが、推奨案や選定基準が示されていない。

| アプローチ | 複雑度 |
|-----------|--------|
| A. カスタムコンポーネント | 中 |
| B. rehype-mermaidプラグイン | 低 |
| C. 動的スクリプト読み込み | 低〜中 |

**推奨対応**:
各アプローチの比較表に「推奨度」列を追加し、推奨案を明示する。
例: 「アプローチB（rehype-mermaid）を推奨。理由: 既存のrehype-sanitize, rehype-highlightとの統合が容易、メンテナンスが活発」

---

### NTH-002: 将来のダイアグラム拡張（PlantUML等）への考慮がない

**カテゴリ**: 将来の拡張性
**場所**: 技術検討事項

**問題**:
mermaid対応後、他のダイアグラム記法（PlantUML, Graphviz等）への要望が出る可能性がある。抽象化設計がないと、各記法ごとに別実装が必要になる。

**推奨対応**:
将来の拡張ポイントとして「ダイアグラムレンダラーの抽象化（DiagramRenderer interface）」を検討事項に追加する。

---

### NTH-003: mermaidバージョンの固定方針が未記載

**カテゴリ**: ドキュメント
**場所**: 技術検討事項

**問題**:
mermaidライブラリはバージョン間で構文変更やセキュリティ修正が行われる。バージョン固定またはsemver範囲の方針が記載されていない。

**現在のmermaid最新バージョン**: 11.12.2

**推奨対応**:
技術検討事項に「mermaidバージョンはマイナーバージョンで固定（^11.12.x）、セキュリティアップデートは定期的に確認」を追記する。

---

## 影響分析

### 影響ファイル一覧

| パス | 変更種別 | リスクレベル | 説明 |
|-----|---------|-------------|------|
| `src/components/worktree/MarkdownEditor.tsx` | 修正 | 中 | rehypePluginsまたはcomponents prop追加 |
| `package.json` | 修正 | 低 | mermaid依存追加 |
| `tests/unit/components/MarkdownEditor.test.tsx` | 修正 | 中 | mermaidテスト追加（+50-100行） |
| スタイルファイル（オプション） | 作成/修正 | 低 | mermaidカスタムスタイル |

### 依存関係への影響

**新規依存パッケージ**:
| パッケージ | バージョン | サイズ |
|-----------|----------|--------|
| mermaid | ^11.12.x | ~500KB |
| （または）rehype-mermaid | ^3.0.0 | ~50KB + mermaid |
| （または）remark-mermaidjs | ^7.0.0 | ~30KB + mermaid |

**既存依存への影響**:
- `react-markdown`: components propまたはrehypePlugins順序変更
- `rehype-sanitize`: サニタイズスキーマのカスタマイズが必要な可能性

### パフォーマンス影響

| 項目 | 影響 | 軽減策 |
|-----|------|-------|
| バンドルサイズ | +500KB（mermaid直接使用）または+50-100KB（rehype-mermaid + 遅延読み込み） | next/dynamic ssr:false |
| ランタイム | 50-200msの描画遅延（ダイアグラム複雑度による） | 遅延レンダリング |
| メモリ | 軽微（ダイアグラム表示時のみ） | - |

### 後方互換性

- **破壊的変更**: なし
- **非破壊的変更**: mermaidコードブロックのレンダリング追加
- **マイグレーション**: 不要

### CI/CDへの影響

- **ビルド時間**: +10-20秒（npm install）
- **テスト時間**: +5-10秒（新規テストケース）
- **バンドルサイズチェック**: 現在未実装、追加検討を推奨

---

## 参照ファイル

### コード
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/src/components/worktree/MarkdownEditor.tsx`: 変更対象（793行）
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/src/types/markdown-editor.ts`: 型定義（257行）
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/package.json`: 依存追加対象

### テスト
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/tests/unit/components/MarkdownEditor.test.tsx`: テスト拡張対象（792行）

### CI/CD
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/.github/workflows/ci-pr.yml`: 影響確認対象

### ドキュメント
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/dev-reports/design/issue-49-markdown-editor-design-policy.md`: マークダウンエディタ設計書（参考）

### 過去のレビュー
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/dev-reports/issue/100/issue-review/stage1-review-result.json`: Stage 1通常レビュー結果
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/dev-reports/issue/100/issue-review/stage2-apply-result.json`: Stage 2指摘反映結果

---

## 総合評価

**総合リスク**: 低〜中
**信頼度**: 高

Issue #100は機能追加（mermaidダイアグラム描画）であり、既存機能への破壊的変更はない。主な懸念事項は：

1. **SSR対応の具体化**（MF-001）: mermaidのDOM依存性への対応方針が不明確
2. **バンドルサイズ**（SF-001）: 500KB以上の依存追加に対する軽減策の詳細化
3. **テストカバレッジ**（SF-002）: rehype-sanitize互換性テストの追加

これらの指摘事項を反映することで、より堅牢な実装計画となる。

---

## 推奨事項

1. **must_fix項目（MF-001）を必須で反映**: SSR対応の具体的な実装方針を明記
2. **should_fix項目（SF-001-SF-004）の反映を推奨**: 特にテスト戦略（SF-002）とバンドルサイズ軽減策（SF-001）
3. **nice_to_have項目は実装フェーズで検討**: アプローチ選定（NTH-001）は設計時に決定

---

## 更新履歴

| 日付 | バージョン | 内容 |
|------|----------|------|
| 2026-01-30 | 1.0 | Stage 3影響範囲レビュー初版作成 |
