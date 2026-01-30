# Issue #94 レビューレポート - 影響範囲レビュー

**レビュー日**: 2026-01-30
**フォーカス**: 影響範囲レビュー
**イテレーション**: 1回目
**ステージ**: 3

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 2 |
| Should Fix | 4 |
| Nice to Have | 3 |

---

## Must Fix（必須対応）

### MF-1: next.config.jsのbodySizeLimit設定が不足

**カテゴリ**: 設定ファイルへの影響
**場所**: next.config.js / 提案する解決策 セクション

**問題**:
現在のnext.config.jsの設定は`serverActions.bodySizeLimit: '2mb'`のみです。5MBのファイルアップロードを実現するには、API Routesのリクエストボディ制限の明示的な設定が必要です。

**証拠**:
```javascript
// next.config.js:8-11
experimental: {
  serverActions: {
    bodySizeLimit: '2mb',
  },
},
```

Next.js API Routesのデフォルトボディサイズ制限は4MBです。5MBアップロードを許可するには以下のような設定が必要:

```javascript
api: {
  bodyParser: {
    sizeLimit: '6mb', // 5MBより少し大きめに設定
  },
},
```

**推奨対応**:
Issueに具体的なnext.config.js設定変更内容を記載してください。

---

### MF-2: 既存ファイル操作APIがmultipart/form-data非対応

**カテゴリ**: 既存APIへの影響
**場所**: 既存ファイル操作APIとの整合性 セクション

**問題**:
既存の`/api/worktrees/[id]/files/[...path]/route.ts`はJSON形式のリクエストボディのみに対応しており、バイナリファイルのアップロードには対応していません。

**証拠**:
```typescript
// route.ts:162
const body = await request.json();
```

現在のAPI実装は`request.json()`を使用しており、multipart/form-dataを処理できません。

**推奨対応**:
以下のいずれかの方針を明確に決定し、Issueに記載してください:
1. 新規エンドポイント `/api/worktrees/:id/files/:path/upload` を作成
2. 既存APIを拡張し、Content-Type判定でJSON/FormDataを分岐処理

---

## Should Fix（推奨対応）

### SF-1: 影響を受けるファイルの一覧が不完全

**カテゴリ**: 影響ファイル
**場所**: 技術参照 セクション

**問題**:
技術参照セクションに記載されているファイル一覧が不完全です。

**推奨対応**:
以下のファイルも影響範囲に追加してください:

| ファイル | 影響内容 |
|----------|----------|
| `src/config/uploadable-extensions.ts` | 新規作成（対応拡張子一元管理） |
| `src/types/markdown-editor.ts` | FileOperationRequest型の拡張検討 |
| `src/hooks/useContextMenu.ts` | Upload用メニュー項目追加の型対応 |
| `next.config.js` | bodyParser設定追加 |

---

### SF-2: テスト計画の記載がない

**カテゴリ**: テストへの影響
**場所**: Issue本文全体

**問題**:
ファイルアップロード機能のテスト計画が記載されていません。

**推奨対応**:
以下のテスト追加計画を記載してください:

1. **単体テスト**
   - `tests/unit/config/uploadable-extensions.test.ts` - 対応拡張子検証
   - アップロードロジックのユニットテスト

2. **結合テスト**
   - APIエンドポイントのmultipart/form-data処理テスト
   - セキュリティテスト（MIMEタイプ検証、パストラバーサル防止）

3. **E2Eテスト**
   - `tests/e2e/file-upload.spec.ts` - 右クリックメニューからのアップロードフロー

**参考**: 既存テストファイル
- `tests/unit/lib/file-operations.test.ts`
- `tests/e2e/file-tree-operations.spec.ts`

---

### SF-3: ファイルアップロード用ライブラリの検討が未記載

**カテゴリ**: 依存関係
**場所**: 提案する解決策 セクション

**問題**:
multipart/form-dataの処理方法について、具体的な実装方針が未記載です。

**推奨対応**:
以下のいずれかの方針を明記してください:

1. **Next.js ネイティブサポート使用**（推奨）
   - Next.js 13+はFormDataをネイティブサポート
   - `request.formData()` を使用
   - 追加依存なし

2. **外部ライブラリ使用**
   - formidable, multer等
   - package.jsonへの依存追加が必要

---

### SF-4: 大量ファイル処理時の考慮が不足

**カテゴリ**: パフォーマンスへの影響
**場所**: ファイルサイズ制限 セクション

**問題**:
5MBファイルアップロード時のパフォーマンス考慮事項が不足しています。

**証拠**:
```typescript
// editable-extensions.ts:35
maxFileSize: 1024 * 1024, // 1MB
```

現在の.mdファイルは1MB制限ですが、アップロード機能では5MB対応が必要であり、メモリ使用量が5倍になる可能性があります。

**推奨対応**:
以下の考慮事項を追加してください:
- 同時アップロード数の制限（例: 最大3ファイル）
- 大容量ファイルのストリーミング処理の検討
- アップロード中のキャンセル機能の検討

---

## Nice to Have（あれば良い）

### NTH-1: ドキュメント更新計画の記載

**カテゴリ**: ドキュメント更新
**場所**: Issue本文全体

**推奨対応**:
以下のドキュメント更新計画を追記すると良いです:
- `CLAUDE.md`: 主要機能モジュールに`uploadable-extensions.ts`追加
- `docs/features/`: ファイルアップロード機能のドキュメント追加
- APIドキュメント: 新規/拡張エンドポイントの仕様

---

### NTH-2: 後方互換性への影響確認

**カテゴリ**: 破壊的変更
**場所**: 既存ファイル操作APIとの整合性 セクション

**推奨対応**:
既存APIとの互換性方針を明記すると良いです:
- 新規エンドポイント作成の場合: 後方互換性に問題なし
- 既存API拡張の場合: Content-Type判定で互換性維持可能

---

### NTH-3: Issue #95との依存関係の詳細化

**カテゴリ**: 関連Issue
**場所**: 関連Issue セクション

**推奨対応**:
Issue #95（画像ファイルビューワ）との関係について以下を追記すると良いです:
- 実装順序: Issue #94 -> Issue #95
- 共通コンポーネントの検討（画像プレビュー等）

---

## 影響範囲サマリー

### 新規作成ファイル

| ファイル | 説明 |
|----------|------|
| `src/config/uploadable-extensions.ts` | アップロード可能拡張子設定 |
| `tests/unit/config/uploadable-extensions.test.ts` | 単体テスト |
| `tests/e2e/file-upload.spec.ts` | E2Eテスト |

### 変更が必要なファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/app/api/worktrees/[id]/files/[...path]/route.ts` | multipart対応またはエンドポイント追加 |
| `src/lib/file-operations.ts` | バイナリファイル書き込み関数追加 |
| `src/components/worktree/FileTreeView.tsx` | onUpload callback追加 |
| `src/components/worktree/ContextMenu.tsx` | 「ファイルをアップロード」項目追加 |
| `src/types/markdown-editor.ts` | 型定義拡張 |
| `next.config.js` | bodyParser設定追加 |

### 破壊的変更

なし（新規エンドポイント作成の場合）

### パフォーマンス考慮事項

- 5MBファイルアップロード時のメモリ使用量増加
- 同時アップロード処理時のサーバー負荷

### セキュリティ考慮事項

- MIMEタイプ検証の実装（Issue記載済み）
- 実行ファイルブロックリストの管理（Issue記載済み）
- アップロードサイズ制限の適用（Issue記載済み）

---

## 参照ファイル

### コード

| ファイル | 関連性 |
|----------|--------|
| `src/app/api/worktrees/[id]/files/[...path]/route.ts` | 既存ファイル操作API |
| `src/lib/file-operations.ts` | ファイル操作ビジネスロジック |
| `src/lib/path-validator.ts` | パストラバーサル防止 |
| `src/config/editable-extensions.ts` | 拡張子設定の参考設計 |
| `src/components/worktree/FileTreeView.tsx` | アップロードUI追加箇所 |
| `src/components/worktree/ContextMenu.tsx` | 右クリックメニュー |

### テスト

| ファイル | 関連性 |
|----------|--------|
| `tests/unit/lib/file-operations.test.ts` | 既存ファイル操作テスト |
| `tests/e2e/file-tree-operations.spec.ts` | 既存FileTree E2Eテスト |
| `tests/integration/security.test.ts` | セキュリティテスト |

### ドキュメント

| ファイル | 関連性 |
|----------|--------|
| `CLAUDE.md` | プロジェクトガイドライン |
