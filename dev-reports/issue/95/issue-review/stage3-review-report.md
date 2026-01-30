# Issue #95 影響範囲レビューレポート

**レビュー日**: 2026-01-30
**フォーカス**: 影響範囲レビュー
**イテレーション**: 1回目（Stage 3）

---

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 1 |
| Should Fix | 4 |
| Nice to Have | 3 |

**総合評価**: Issue #95（画像ファイルビューワ）は影響範囲が明確に定義されており、Issue #49（マークダウンエディタ）の設計パターンを踏襲した堅実な設計となっている。ただし、APIレスポンス形式の変更による既存コードへの影響、Base64エンコードによるメモリ使用量、およびテストカバレッジについて追加の検討が必要。

---

## Must Fix（必須対応）

### MF-001: APIレスポンス形式の既存互換性

**カテゴリ**: 破壊的変更
**影響レベル**: 高
**場所**: 技術的実装方針 - 3. 画像データ取得方法

**問題**:
`GET /api/worktrees/:id/files/:path` APIのレスポンス形式変更による既存コードへの影響が未検討。

**証拠**:
既存の `FileViewer.tsx`（L18-23）は以下の `FileContent` interface を期待している:

```typescript
interface FileContent {
  path: string;
  content: string;
  extension: string;
  worktreePath: string;
}
```

Issueでは画像ファイル時に `isImage` フラグと `mimeType` フィールドを追加すると記載されているが、既存の型定義との整合性が未検討。

**影響を受けるファイル**:
- `src/components/worktree/FileViewer.tsx`
- `src/app/api/worktrees/[id]/files/[...path]/route.ts`
- `src/types/models.ts`（型定義追加が必要）

**推奨対応**:
以下のいずれかの方針を明記すること:

1. **既存互換性を維持する方針**: `content` フィールドは文字列型を維持し、画像の場合のみBase64プレフィックス（`data:image/png;base64,...`）を含める形式にする。`isImage`, `mimeType` は追加オプションフィールドとして定義。

2. **別エンドポイント方針**: 画像ファイル用の別エンドポイント（例: `/api/worktrees/:id/images/:path`）を新設し、既存APIに影響を与えない。

---

## Should Fix（推奨対応）

### SF-001: Base64エンコードのメモリ影響

**カテゴリ**: パフォーマンスへの影響
**影響レベル**: 中
**場所**: セキュリティ考慮事項 - 2. 画像ファイルサイズ上限

**問題**:
Base64エンコードによるメモリ使用量増加の具体的な数値がIssue記載の10MB上限と整合しない。

**証拠**:
- Base64エンコードは元データの約1.33倍のサイズになる
- 10MBの画像 -> 約13.3MBのBase64文字列
- Issue #49では1MBのファイルサイズ上限を設定（`dev-reports/design/issue-49-markdown-editor-design-policy.md` Section 8.1）

**推奨対応**:
- より保守的な上限（例: 5MB）を検討するか、10MB上限の根拠を明記
- APIレスポンスとクライアント側のメモリ使用量について考慮事項を追加

---

### SF-002: handleFileSelect関数の分岐複雑化

**カテゴリ**: 既存コードへの影響
**影響レベル**: 中
**場所**: 関連コンポーネント - WorktreeDetailRefactored.tsx

**問題**:
現在の `handleFileSelect`（L919-930）は `EDITABLE_EXTENSIONS` で分岐している。`IMAGE_EXTENSIONS` を追加すると条件分岐が3つに増え、複雑化する。

**現在のコード**:
```typescript
const handleFileSelect = useCallback((path: string) => {
  const extension = path.split('.').pop()?.toLowerCase();
  const extWithDot = extension ? `.${extension}` : '';

  if (EDITABLE_EXTENSIONS.includes(extWithDot)) {
    setEditorFilePath(path);
  } else {
    setFileViewerPath(path);
  }
}, []);
```

**推奨対応**:
- `isImageFile()`, `isEditableFile()` のようなユーティリティ関数を `src/lib/file-operations.ts` に追加
- 判定ロジックを一元化し、`handleFileSelect` はシンプルな分岐のみに

**影響を受けるファイル**:
- `src/components/worktree/WorktreeDetailRefactored.tsx`
- `src/lib/file-operations.ts`
- `src/config/image-extensions.ts`（新規作成）

---

### SF-003: E2Eテストシナリオの具体化

**カテゴリ**: テストへの影響
**影響レベル**: 中
**場所**: 受け入れ条件 - E2Eテストが追加されている

**問題**:
受け入れ条件に「E2Eテストが追加されている」と記載されているが、具体的なテストシナリオが不足。

**推奨対応**:
`tests/e2e/markdown-editor.spec.ts` を参考に、以下のテストシナリオを明記:

1. 画像ファイル選択時にビューワー表示
2. 10MB超えファイルでエラーメッセージ表示
3. 非対応形式（.pdf等）で従来動作（テキスト表示 or エラー）
4. モーダル拡大表示（オプション機能の場合）
5. SVGファイルの表示確認

**新規作成ファイル**:
- `tests/e2e/image-viewer.spec.ts`

---

### SF-004: MIMEタイプ検証の実装方法

**カテゴリ**: 依存関係
**影響レベル**: 中
**場所**: セキュリティ考慮事項 - 3. MIMEタイプ検証

**問題**:
「拡張子だけでなくファイルのMIMEタイプも検証」と記載されているが、実装方法が未定義。

**推奨対応**:
Node.jsでファイルのMIMEタイプを検出する方法を明記:

**選択肢1**: 外部ライブラリ使用
- `file-type`: マジックバイトベースの検出（推奨）
- `mime-types`: 拡張子ベースの検出

**選択肢2**: 自作マジックバイト検証（依存追加を避ける場合）
```typescript
// 例: PNG判定
const isPng = (buffer: Buffer) =>
  buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
```

Issue #49の設計方針（依存追加を最小限）との整合性を考慮し、選択した方針を明記すること。

---

## Nice to Have（あれば良い）

### NTH-001: CLAUDE.mdへの機能追加記載

**カテゴリ**: ドキュメント更新
**場所**: Issue本文全体

**推奨対応**:
実装完了後、`CLAUDE.md` の「最近の実装機能」セクション（L251-295）にIssue #95の概要を追加すること。Issue #49と同様の記載パターンを踏襲。

---

### NTH-002: 画像キャッシュ機能の将来検討

**カテゴリ**: 将来の拡張性
**場所**: 対象外事項 - 画像のキャッシュ機能

**推奨対応**:
対象外事項としてキャッシュ機能を明記しているのは良い判断。ただし、大きな画像ファイルの繰り返し読み込みによるパフォーマンス影響が発生した場合の将来拡張ポイントとして、設計書に記載を検討。

---

### NTH-003: image-extensions.tsの設計詳細

**カテゴリ**: 設定ファイルへの影響
**場所**: 技術的実装方針 - 4. 画像拡張子設定

**推奨対応**:
`editable-extensions.ts` の設計パターン（`ExtensionValidator` interface、`validateContent` 関数）を踏襲する場合、画像ファイル用のバリデーション（ファイルサイズ上限、MIMEタイプ検証）も設定ファイルに含めることを検討。

```typescript
// src/config/image-extensions.ts（参考）
export interface ImageValidator {
  extension: string;
  mimeType: string;
  magicBytes?: number[];
  maxFileSize: number;
}

export const IMAGE_VALIDATORS: ImageValidator[] = [
  { extension: '.png', mimeType: 'image/png', magicBytes: [0x89, 0x50, 0x4E, 0x47], maxFileSize: 10 * 1024 * 1024 },
  { extension: '.jpg', mimeType: 'image/jpeg', magicBytes: [0xFF, 0xD8, 0xFF], maxFileSize: 10 * 1024 * 1024 },
  // ...
];
```

---

## 影響分析サマリー

### 影響ファイル一覧

| パス | 変更タイプ | リスクレベル | 変更内容 |
|-----|----------|-------------|---------|
| `src/app/api/worktrees/[id]/files/[...path]/route.ts` | 大幅変更 | **高** | GET handlerの拡張（画像ファイル判定、Base64エンコード、MIMEタイプ返却） |
| `src/components/worktree/FileViewer.tsx` | 大幅変更 | 中 | 画像ファイル表示コンポーネントの追加または分岐処理 |
| `src/components/worktree/WorktreeDetailRefactored.tsx` | 軽微変更 | 低 | handleFileSelect関数への画像判定分岐追加 |
| `src/lib/file-operations.ts` | 軽微変更 | 低 | isImageFile()関数追加 |
| `src/types/models.ts` | 軽微変更 | 低 | FileContent interfaceの拡張 |

### 新規ファイル

| パス | 推定行数 | 説明 |
|-----|---------|------|
| `src/config/image-extensions.ts` | 50行 | 対応画像拡張子のホワイトリスト管理 |
| `src/components/worktree/ImageViewer.tsx` | 150行 | 画像表示コンポーネント（オプション） |
| `tests/e2e/image-viewer.spec.ts` | 100行 | E2Eテスト |

### Breaking Changes

| ID | 説明 | 重大度 | 軽減策 |
|----|------|--------|--------|
| BC-001 | GET /api/worktrees/:id/files/:path のレスポンス形式が画像ファイル時に拡張される | 中 | 既存フィールドは維持し、画像固有フィールドを追加オプションとして返却 |

### パフォーマンス影響

| 項目 | リスク | 説明 |
|-----|--------|------|
| メモリ | 中 | 10MB画像ファイルをBase64エンコードすると約13.3MBのメモリを使用 |
| ネットワーク | 低 | Base64エンコードにより転送データ量が約33%増加（ローカル環境での使用を前提） |

---

## 参照ファイル

### コード
- `src/components/worktree/FileViewer.tsx` (L18-23): FileContent interfaceの型定義
- `src/app/api/worktrees/[id]/files/[...path]/route.ts` (L106-139): 既存GET handler
- `src/components/worktree/WorktreeDetailRefactored.tsx` (L919-930): handleFileSelect関数
- `src/config/editable-extensions.ts`: image-extensions.tsの設計パターン参考
- `src/lib/file-operations.ts` (L83-86): isEditableFile関数

### ドキュメント
- `dev-reports/design/issue-49-markdown-editor-design-policy.md`: 設計パターンの参考
- `docs/architecture.md`: システムアーキテクチャの参照
- `CLAUDE.md`: プロジェクト概要、実装完了後の更新対象

---

## レビュー所見

Issue #95は Issue #49（マークダウンエディタ）と類似した機能追加であり、設計パターンを踏襲することで実装リスクを低減できる。

**主な懸念点**:
1. APIレスポンス形式の既存互換性（MF-001）
2. Base64エンコードによるメモリ使用量（SF-001）
3. MIMEタイプ検証の実装方法（SF-004）

これらを事前に明確化することで円滑な実装が可能。

**レビュアー信頼度**: 高
