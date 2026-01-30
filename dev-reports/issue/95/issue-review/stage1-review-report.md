# Issue #95 レビューレポート

**レビュー日**: 2026-01-30
**フォーカス**: 通常レビュー（整合性・正確性）
**イテレーション**: 1回目

---

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 2 |
| Should Fix | 4 |
| Nice to Have | 3 |

**総評**: Issue #95「画像ファイルビューワ」は機能として有用だが、現状のIssue記載内容は抽象度が高く、実装に必要な情報が不足している。特に受け入れ条件と技術的な実装方針の明確化が必須。Issue #49（マークダウンエディタ）の設計書を参考に、詳細な要件定義を行うことを推奨する。

---

## Must Fix（必須対応）

### MF-1: 受け入れ条件が未定義

**カテゴリ**: 明確性
**場所**: Issue本文

**問題**:
Issueには「画像ファイルの場合ビューワてま確認可能」とのみ記載されており、具体的な受け入れ条件が存在しない。これでは実装完了の判断基準が不明確である。

**証拠**:
- Issue本文に受け入れ条件セクションがない
- 対応する画像形式、表示方法、サイズ制限などの具体的な仕様が未定義

**推奨対応**:
以下のような具体的な受け入れ条件を追加してください:

```markdown
## 受け入れ条件
- [ ] 対応画像形式: PNG, JPG/JPEG, GIF, WEBP, SVG
- [ ] FileTreeViewで画像ファイルをクリックすると画像ビューワーが表示される
- [ ] 画像は最大幅100%、最大高さ500pxで表示される
- [ ] 画像クリックでモーダル拡大表示が可能
- [ ] 10MB以上の画像ファイルは警告を表示する
- [ ] 非対応形式のファイルはエラーメッセージを表示する
```

---

### MF-2: 技術的な実装方針が未記載

**カテゴリ**: 完全性
**場所**: ## 提案する解決策 セクション

**問題**:
Issue #49の設計書（1559行）では詳細な技術選定・セキュリティ設計・API設計が記載されているのに対し、本Issueには具体的な実装方針がない。

**証拠**:
- Issue #49: `dev-reports/design/issue-49-markdown-editor-design-policy.md` に詳細設計あり
- Issue #95: 「画像ファイルの場合ビューワてま確認可能」の1行のみ

**推奨対応**:
以下の技術詳細を追加してください:

1. **対応する画像形式の一覧**
   - PNG, JPG/JPEG, GIF, WEBP, SVG
   - MIMEタイプ検証の有無

2. **画像の表示方法**
   - FileViewer.tsx拡張 or 新規ImageViewerコンポーネント作成
   - `<img>` タグ or Next.js Image コンポーネント

3. **画像データの取得方法**
   - Base64エンコードでJSON返却
   - または Content-Type 切り替えによるバイナリ直接返却

4. **セキュリティ考慮**
   - 画像サイズ上限
   - ファイル拡張子のホワイトリスト検証

---

## Should Fix（推奨対応）

### SF-1: 既存のファイルビューワー構成との関係が不明確

**カテゴリ**: 整合性
**場所**: ## 提案する解決策 セクション

**問題**:
`src/components/worktree/FileViewer.tsx`（132行）は現在テキストコンテンツのみ対応している。画像表示をどのように統合するか不明確である。

**証拠**:
```typescript
// src/components/worktree/FileViewer.tsx (L119-125)
{content && !loading && !error && (
  <div className="bg-gray-50 rounded-lg overflow-hidden">
    ...
    <pre className="text-sm overflow-x-auto">
      <code className={`language-${content.extension}`}>
        {content.content}  // テキストコンテンツのみ対応
      </code>
    </pre>
  </div>
)}
```

**推奨対応**:
以下のいずれかの方針を明記してください:
- A案: FileViewer.tsxを拡張し、拡張子に応じて画像/テキスト表示を切り替え
- B案: 新規ImageViewer.tsxコンポーネントを作成し、WorktreeDetailRefactored.tsxで使い分け

---

### SF-2: API層での画像バイナリ対応が未検討

**カテゴリ**: 整合性
**場所**: ## 提案する解決策 セクション

**問題**:
現在のGET /api/worktrees/:id/files/:pathはテキストコンテンツをJSONで返却する設計であり、画像バイナリを扱うための考慮がない。

**証拠**:
```typescript
// src/app/api/worktrees/[id]/files/[...path]/route.ts (L127-134)
return NextResponse.json({
  success: true,
  path: relativePath,
  content: fileResult.content,  // テキスト前提
  extension,
  worktreePath: worktree.path,
});
```

**推奨対応**:
以下のいずれかのAPI拡張方針を検討してください:
- A案: 画像ファイルの場合、Base64エンコードして `content` フィールドに格納
- B案: クエリパラメータ `?raw=true` で Content-Type を切り替えてバイナリ直接返却
- C案: 画像専用エンドポイント `/api/worktrees/:id/images/:path` を新設

---

### SF-3: セキュリティ考慮事項が未記載

**カテゴリ**: 技術的妥当性
**場所**: Issue本文

**問題**:
Issue #49ではセキュリティ設計に1セクションを割いているが、本Issueにはセキュリティ観点の記載がない。

**証拠**:
```typescript
// src/config/editable-extensions.ts
export const EDITABLE_EXTENSIONS: readonly string[] = ['.md'] as const;
```
Issue #49では編集可能拡張子をホワイトリストで制限している。

**推奨対応**:
同様のパターンで画像拡張子の設定を検討してください:

```typescript
// src/config/viewable-extensions.ts（新規作成案）
export const IMAGE_EXTENSIONS: readonly string[] = [
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'
] as const;

export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
```

---

### SF-4: 誤字がある

**カテゴリ**: 正確性
**場所**: ## 提案する解決策 セクション

**問題**:
「ビューワてま確認可能」は「ビューワで確認可能」の誤入力と推測される。

**推奨対応**:
「画像ファイルの場合ビューワ**で**確認可能」に修正してください。

---

## Nice to Have（あれば良い）

### NTH-1: 関連Issueへの参照がない

**カテゴリ**: 完全性
**場所**: Issue本文

**問題**:
Issue #49（マークダウンエディタ）との関連が記載されていない。

**推奨対応**:
以下のような関連Issue参照を追加:

```markdown
## 関連Issue
- #49 マークダウンエディタとビューワー - ファイルビューワー拡張の設計パターン参考
```

---

### NTH-2: ユースケースの具体例がない

**カテゴリ**: 完全性
**場所**: ## 背景・課題 セクション

**問題**:
「Claude Codeと視覚的なコミュニケーションがとれるようになる」という記載は抽象的である。

**推奨対応**:
具体的なユースケースを追加:

```markdown
## 背景・課題
Claude Codeと視覚的なコミュニケーションがとれるようになる。

### 具体的なユースケース
- スクリーンショットを確認しながらUIの問題を議論
- 生成されたチャート・図表の確認
- デザインモックアップのレビュー
- エラー画面のスクリーンショット共有
```

---

### NTH-3: 対象外事項（スコープ外）の明記がない

**カテゴリ**: 完全性
**場所**: Issue本文

**問題**:
Issue #49では「1.3 対象外」セクションで明確にスコープ外を定義している。

**推奨対応**:
対象外事項を追加:

```markdown
## 対象外
- 画像のアップロード機能
- 画像の編集・加工機能（リサイズ、トリミング等）
- 動画ファイルの再生
- PDFファイルの表示
```

---

## 参照ファイル

### コード

| ファイル | 関連性 |
|----------|--------|
| `src/components/worktree/FileViewer.tsx` | 既存のファイルビューワー。画像表示機能の拡張先候補 |
| `src/components/worktree/FileTreeView.tsx` | ファイルツリー表示。画像ファイル選択時の処理追加が必要 |
| `src/app/api/worktrees/[id]/files/[...path]/route.ts` | ファイル取得API。画像バイナリ対応の拡張が必要 |
| `src/config/editable-extensions.ts` | 編集可能拡張子設定。画像拡張子設定の参考パターン |
| `src/components/worktree/WorktreeDetailRefactored.tsx` | ファイル選択時の表示切替処理。画像ビューワー表示の統合先 |

### ドキュメント

| ファイル | 関連性 |
|----------|--------|
| `dev-reports/design/issue-49-markdown-editor-design-policy.md` | マークダウンエディタ設計書。ファイルビューワー拡張の設計パターン参考 |
| `CLAUDE.md` | プロジェクトガイドライン。ファイル構成とコーディング規約の参照 |
| `docs/architecture.md` | システムアーキテクチャ。API設計パターンの参照 |

---

## 推奨アクション

1. **即時対応（Must Fix）**
   - 受け入れ条件を具体的に定義する
   - 技術的な実装方針を追加する

2. **Issue更新後**
   - 設計方針書（design-policy.md）の作成を検討
   - Issue #49の設計書をテンプレートとして活用

3. **実装開始前**
   - API層の画像バイナリ対応方針を決定
   - セキュリティ設計を完了

---

*レビュー完了: 2026-01-30*
