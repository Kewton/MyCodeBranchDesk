# Issue #100 レビュー報告書

## 基本情報

| 項目 | 内容 |
|------|------|
| Issue番号 | #100 |
| タイトル | feat: マークダウンプレビューでmermaidダイアグラムを描画できるようにする |
| レビュー日 | 2026-01-30 |
| レビューステージ | Stage 1 |
| フォーカスエリア | 通常レビュー（Consistency & Correctness） |

---

## 1. レビュー概要

Issue #100は、既存のマークダウンエディタ（Issue #49で実装）のプレビュー機能に、mermaidダイアグラムの描画機能を追加する機能拡張Issueである。

### 1.1 Issueの構成

| セクション | 評価 |
|-----------|------|
| 概要 | 明確 |
| 背景 | 要修正（Issue番号の誤り） |
| 機能要件 | 明確 |
| 非機能要件 | 要明確化（SSR対応） |
| 技術検討事項 | 要修正（パッケージ名、セキュリティ考慮） |
| 影響ファイル | 不完全 |
| 受け入れ条件 | 妥当 |

---

## 2. 指摘事項

### 2.1 Must Fix（必須修正）

#### MF-001: 背景情報の誤り

**カテゴリ**: 整合性

**問題点**:
Issueの背景に「Issue #99 でマークダウンエディタを実装」と記載されているが、これは誤りである。

- **Issue #49**: マークダウンエディタとビューワーの本体実装
- **Issue #99**: マークダウンエディタ表示機能改善（最大化、リサイズ、モバイル対応等）

**影響**: 関連Issueの誤認識により、作業範囲の理解に混乱が生じる可能性がある。

**推奨対応**:
```diff
- Issue #99 でマークダウンエディタを実装
+ Issue #49 でマークダウンエディタを実装、Issue #99 で表示機能を改善
```

---

### 2.2 Should Fix（推奨修正）

#### SF-001: rehype-sanitizeとの互換性に関する技術検討が不足

**カテゴリ**: 明確さ

**問題点**:
現在の`MarkdownEditor.tsx`では、XSS対策として`rehype-sanitize`が実装されている（Issue #49設計書 [SEC-MF-001]参照）。

```typescript
// 現在の実装（MarkdownEditor.tsx L749-756）
<ReactMarkdown
  remarkPlugins={[remarkGfm]}
  rehypePlugins={[
    rehypeSanitize, // [SEC-MF-001] XSS protection
    rehypeHighlight,
  ]}
>
```

mermaid導入時に、rehype-sanitizeがmermaid生成コンテンツをブロックする可能性がある。

**推奨対応**:
技術検討事項に以下を追加:
- rehype-sanitizeのカスタムスキーマでmermaid要素を許可する方法
- または、mermaidブロックのみサニタイズを迂回する方法

---

#### SF-002: SSR/CSR対応の技術的制約が不明確

**カテゴリ**: 明確さ

**問題点**:
非機能要件に「SSR/CSR両方で正常動作」とあるが、mermaidはクライアントサイドでのDOM操作を必要とする。現在の`MarkdownEditor.tsx`は`'use client'`ディレクティブでクライアントコンポーネントとして実装されている。

**推奨対応**:
要件を以下のように明確化:
```diff
- SSR/CSR両方で正常動作
+ SSR環境でのハイドレーション後に正常動作すること。SSR時はプレースホルダー（コードブロック）を表示し、クライアント側でダイアグラムに置換する。
```

---

#### SF-003: セキュリティ考慮事項が未記載

**カテゴリ**: 完全性

**問題点**:
mermaidダイアグラムはSVGを生成する。SVGにはXSSリスクがある。

Issue #95（画像ファイルビューワ）では、SVG XSS対策として以下5項目を実装:
1. scriptタグ拒否
2. イベントハンドラ属性（on*）拒否
3. javascript:/data:/vbscript:スキーム拒否
4. foreignObject要素拒否
5. マジックバイト検証

**推奨対応**:
セキュリティ考慮事項セクションを追加:

```markdown
## セキュリティ考慮事項

### SVG XSS対策
- mermaidライブラリの`securityLevel`設定を使用
  - `strict`: 最も安全（推奨）
  - `loose`: 一部機能が制限される可能性
  - `antiscript`: スクリプト実行のみ防止
- 生成されたSVGに対する追加のサニタイズは不要（mermaid内部で対策済み）
- 外部からのmermaidコードインジェクションはrehype-sanitizeで防止済み
```

---

#### SF-004: アプローチBの参照パッケージ名が不正確

**カテゴリ**: 正確性

**問題点**:
Issueに記載の`@tntd/react-markdown-mermaid`はnpmで確認できない。

**推奨対応**:
実在するパッケージに修正:

| パッケージ | 説明 |
|-----------|------|
| `mermaid` | 公式ライブラリ（直接使用） |
| `remark-mermaidjs` | remarkプラグイン |
| `rehype-mermaid` | rehypeプラグイン |

---

#### SF-005: 影響ファイルにスタイル関連ファイルが含まれていない

**カテゴリ**: 完全性

**問題点**:
mermaidダイアグラムのスタイリングにはCSS調整が必要になる可能性がある。

**推奨対応**:
影響ファイルに追加:
```markdown
### 影響ファイル（想定）
- `src/components/worktree/MarkdownEditor.tsx`
- `package.json`
- **`src/app/globals.css` または mermaid用CSSファイル（スタイル調整が必要な場合）**
```

---

### 2.3 Nice to Have（改善提案）

| ID | タイトル | 内容 |
|----|---------|------|
| NTH-001 | バンドルサイズ影響評価 | mermaidは約500KB以上。dynamic importによる遅延読み込みを検討 |
| NTH-002 | テスト戦略の詳細 | 構文エラー時の挙動、各ダイアグラムタイプの描画確認等のテストケース例を記載 |
| NTH-003 | モバイル対応考慮 | mermaidダイアグラムのモバイル表示（スクロール、ズーム等）の検討 |
| NTH-004 | 関連Issue追加 | Issue #49（マークダウンエディタ本体）を関連Issueに追加 |

---

## 3. チェックリスト結果

| チェック項目 | 状態 | 備考 |
|-------------|------|------|
| 既存コードとの整合性 | Partial | rehype-sanitize等のセキュリティ機構との互換性考慮が不足 |
| 既存ドキュメントとの整合性 | Partial | Issue #99と#49の役割の混同あり |
| 記載内容の正確性 | Partial | パッケージ名の誤り、SSR対応の技術的実現可能性が不明確 |
| 要件の明確さ | Good | 機能要件（対応ダイアグラム種別）は明確 |
| 受け入れ条件の妥当性 | Good | AC-01からAC-04は妥当 |

---

## 4. 関連コードベース参照

### 4.1 現在のMarkdownEditor構成

```
src/components/worktree/MarkdownEditor.tsx
- react-markdown v10.1.0
- remark-gfm v4.0.1
- rehype-sanitize v6.0.0 (XSS対策)
- rehype-highlight v7.0.2 (コードハイライト)
```

### 4.2 関連設計書

| ドキュメント | パス |
|-------------|------|
| Issue #49 設計書 | `dev-reports/design/issue-49-markdown-editor-design-policy.md` |
| Issue #99 設計書 | `dev-reports/design/issue-99-markdown-editor-display-improvement-design-policy.md` |

### 4.3 セキュリティ参照

- Issue #49 セクション7.4: XSS対策（rehype-sanitize導入）
- Issue #95: SVG XSS対策（5項目）
- `src/config/image-extensions.ts`: SVG XSS検証ロジック

---

## 5. 総合評価

### 5.1 サマリー

Issue #100は、要件の大枠は明確だが、以下の点で改善が必要:

1. **背景情報の誤り**: Issue #99とIssue #49の役割が混同されている
2. **セキュリティ考慮不足**: rehype-sanitizeとの互換性、SVG XSS対策が未検討
3. **技術的実現可能性**: SSR対応の制約が不明確
4. **参照情報の誤り**: 存在しないパッケージ名の記載

### 5.2 推奨アクション

Should Fix指摘事項を反映後、設計フェーズに進むことを推奨。

**優先度高**:
- SF-001: rehype-sanitizeとの互換性確認
- SF-003: セキュリティ考慮事項の追加

**優先度中**:
- MF-001: 背景情報の修正
- SF-002: SSR/CSR要件の明確化
- SF-004: パッケージ名の修正

---

## 6. 次のステップ

1. Issue本文の修正（MF-001, SF-001~SF-005対応）
2. Stage 2レビュー（影響範囲レビュー）の実施
3. 設計方針書の作成

---

*レビュー実施: Claude Opus 4.5*
*レビュー日時: 2026-01-30*
