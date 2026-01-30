# Issue #100 レビューレポート（Stage 5: 通常レビュー 2回目）

**レビュー日**: 2026-01-30
**フォーカス**: 通常レビュー（Consistency & Correctness）
**イテレーション**: 2回目
**Issue**: feat: マークダウンプレビューでmermaidダイアグラムを描画できるようにする

---

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 0 |
| Should Fix | 3 |
| Nice to Have | 3 |

**総合評価**: Stage 1レビューの全指摘事項が適切に対応されており、Issueの品質は大幅に向上している。設計フェーズに進む準備が整っている。

---

## Stage 1 指摘事項の対応状況

### Must Fix (1件) - 全て解決済み

| ID | タイトル | 状態 |
|----|---------|------|
| MF-001 | 背景情報の誤り（Issue #99の説明） | **解決済み** |

**MF-001 対応確認**:
背景セクションが以下のように正しく修正された:
> Issue #49 でマークダウンエディタを実装、Issue #99 で表示機能を改善（最大化、リサイズ等）

---

### Should Fix (5件) - 全て解決済み

| ID | タイトル | 状態 |
|----|---------|------|
| SF-001 | rehype-sanitizeとの互換性に関する技術検討が不足 | **解決済み** |
| SF-002 | SSR/CSR対応の技術的制約が不明確 | **解決済み** |
| SF-003 | セキュリティ考慮事項が未記載 | **解決済み** |
| SF-004 | アプローチBの参照パッケージ名が不正確 | **解決済み** |
| SF-005 | 影響ファイルにスタイル関連ファイルが含まれていない | **解決済み** |

**SF-001 対応確認**:
「セキュリティ考慮事項」に「rehype-sanitizeとの互換性」サブセクションが追加され、以下の内容が記載された:
- mermaid処理をサニタイズの前後どちらで行うかの検討
- サニタイズスキーマのカスタマイズ（mermaid用SVG要素の許可リスト）

**SF-002 対応確認**:
非機能要件およびSSR対応の実装方針が詳細に記載された:
- 方式A（推奨）: `next/dynamic` の `ssr: false` オプション
- 方式B: `useEffect` 内でのクライアントサイドレンダリング
- 方式C: rehype-mermaid/remark-mermaidjsプラグイン使用時の設定

**SF-003 対応確認**:
「セキュリティ考慮事項」セクションが新規追加:
- mermaidのsecurityLevel設定（'strict'推奨）
- Issue #95のSVG XSS対策5項目への参照
- AC-05にsecurityLevel 'strict'設定の受け入れ条件を追加

**SF-004 対応確認**:
存在しない`@tntd/react-markdown-mermaid`の参照が削除され、実在するパッケージが正しく参照されている:
- [rehype-mermaid](https://github.com/remcohaszing/rehype-mermaid) (npm version 3.0.0)
- [remark-mermaidjs](https://github.com/remcohaszing/remark-mermaidjs) (npm version 7.0.0)

**SF-005 対応確認**:
影響ファイル（想定）に「スタイル関連ファイル（mermaidダイアグラムのカスタムスタイル調整が必要な場合）」が追加された。

---

### Nice to Have (4件) - 3件解決済み、1件部分的解決

| ID | タイトル | 状態 |
|----|---------|------|
| NTH-001 | バンドルサイズへの影響評価が未記載 | **解決済み** |
| NTH-002 | テスト戦略の詳細が未記載 | **解決済み** |
| NTH-003 | モバイル対応の考慮が未記載 | **部分的解決** |
| NTH-004 | 関連IssueにIssue #49が含まれていない | **解決済み** |

**NTH-001 対応確認**:
「バンドルサイズへの影響」セクションが追加:
- mermaidライブラリサイズ（約500KB以上、react-markdown関連の10倍以上）
- 軽減策3点: next/dynamic遅延読み込み、条件付き読み込み、バンドルサイズ測定方法

**NTH-002 対応確認**:
AC-04のテストケースが具体化:
- 正常系: flowchart描画、sequenceDiagram描画
- 異常系: 構文エラー時のエラー表示
- 互換性: rehype-sanitizeとの互換性テスト

**NTH-003 部分的解決**:
Issue #99でモバイル対応（タブ切替UI、スワイプ等）が実装済みであり、mermaidダイアグラムはSVGとしてレンダリングされるため自然にレスポンシブになる。ただし、大きなダイアグラムのスクロール/ズームについての明示的な考慮は引き続き不足している。

**NTH-004 対応確認**:
関連Issueセクションに以下が追加された:
> #49 マークダウンエディタとビューワー（エディタ本体の実装）

---

## 新規指摘事項

### Should Fix（推奨対応）

#### SF2-001: mermaidバージョン記載が最新版と不整合

**カテゴリ**: 正確性
**場所**: 技術検討事項 > mermaidバージョン方針

**問題**:
Issueでは「マイナーバージョンで固定（`^11.12.x`）」と記載されているが、`^11.12.x`はセマンティックバージョニングとして不正な形式である。

**証拠**:
- npm show mermaidで確認した最新版: 11.12.2
- 正しいsemver形式: `^11.12.0`（11.12.x互換）または`~11.12.2`（パッチ更新のみ）

**推奨対応**:
「`^11.12.0`」または「`~11.12.2`」に修正する。

---

#### SF2-002: rehype-mermaidの制約事項が未記載

**カテゴリ**: 完全性
**場所**: 技術検討事項 > 実装アプローチ候補

**問題**:
rehype-mermaidのstrategyオプション（'img-png', 'img-svg', 'inline-svg', 'pre-mermaid'）についての記載がない。Next.jsでのクライアントサイド描画には適切なstrategy選択が重要である。

**推奨対応**:
アプローチBの説明に以下を追記:
> rehype-mermaidのstrategyオプション: 'inline-svg'がクライアントサイド描画に適している。ssr: false環境での使用時は'pre-mermaid'（クライアントで描画）も選択肢となる。

---

#### SF2-003: AC-03の回帰テスト対象にシンタックスハイライトが含まれていない

**カテゴリ**: 整合性
**場所**: 受け入れ条件 > AC-03

**問題**:
現在のMarkdownEditor.tsx（L751-754, L776-779）ではrehype-highlightによるシンタックスハイライトが実装されている。mermaidコードブロックの処理とrehype-highlightの処理順序によっては、他のコードブロックの表示に影響が出る可能性がある。

**推奨対応**:
AC-03に以下を追加:
> - シンタックスハイライト（rehype-highlight）が他の言語のコードブロック（JavaScript、Python等）で正常に動作すること

---

### Nice to Have（あれば良い）

#### NTH2-001: モバイルでの大きなダイアグラム表示の考慮

**カテゴリ**: 完全性
**場所**: 要件 > 非機能要件

**問題**:
複雑なER図やフローチャートなど大きなダイアグラムがモバイル画面でどのように表示されるかの明示的な考慮がない。

**推奨対応**:
以下のいずれかを追記:
- 「大きなダイアグラムは横スクロール可能であること」
- 「モバイルでのダイアグラム表示はデスクトップと同様の動作とし、特別な対応は行わない」

---

#### NTH2-002: エラーメッセージの国際化

**カテゴリ**: 明確性
**場所**: 受け入れ条件 > AC-02

**問題**:
構文エラー時のエラーメッセージの言語（日本語/英語）についての記載がない。

**推奨対応**:
「エラーメッセージはmermaidライブラリのデフォルト（英語）を使用する」等の方針を追記する。

---

#### NTH2-003: CI/CD影響の具体的な数値の精度

**カテゴリ**: ドキュメント
**場所**: 技術検討事項 > CI/CDへの影響

**問題**:
「npm install時間: +10-20秒」は推定値であり、実測値ではない可能性がある。

**推奨対応**:
「（推定値：実装時に実測すること）」等の注記を追加する。

---

## 技術的整合性の確認

### コードベースとの整合性

| 確認項目 | 状態 | 備考 |
|---------|------|------|
| MarkdownEditor.tsx構造 | Good | rehypePlugins配列への統合方針が適切 |
| rehype-sanitize互換性 | Good | セキュリティ考慮事項で言及されている |
| package.json依存関係 | Good | 既存依存との競合リスクなし |
| テストファイル構造 | Good | tests/unit/components/MarkdownEditor.test.tsx が存在 |

### パッケージ存在確認

| パッケージ名 | npm上の存在 | 最新版 |
|-------------|-------------|--------|
| rehype-mermaid | **確認済み** | 3.0.0 |
| remark-mermaidjs | **確認済み** | 7.0.0 |
| mermaid | **確認済み** | 11.12.2 |

### 推奨アプローチの妥当性

Issueで推奨されている「アプローチB: rehype-mermaidプラグイン」は以下の理由で適切である:
1. 既存のrehype-sanitize, rehype-highlightとの統合が容易
2. メンテナンスが活発（最新版: 2024-10-08リリース）
3. Next.js環境での実績あり

---

## 参照ファイル

### コード
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/src/components/worktree/MarkdownEditor.tsx`: mermaid機能追加の主要対象ファイル
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/package.json`: mermaid依存追加の対象ファイル

### ドキュメント
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/dev-reports/design/issue-49-markdown-editor-design-policy.md`: マークダウンエディタ本体の設計書
- `/Users/maenokota/share/work/github_kewton/MyCodeBranchDesk/dev-reports/design/issue-99-markdown-editor-display-improvement-design-policy.md`: 表示機能改善の設計書

---

## 推奨アクション

1. **即座に対応**: Should Fix指摘（SF2-001, SF2-002, SF2-003）を設計書作成前に反映
2. **設計フェーズ開始**: Issueは実装準備が整っており、設計書作成に進むことを推奨
3. **実装時の注意**: rehype-mermaidのstrategyオプション選定は実装の方向性に影響するため、早期に調査すること

---

*レビュー完了: 2026-01-30*
*レビュアー: Issue Review Agent (Stage 5)*
