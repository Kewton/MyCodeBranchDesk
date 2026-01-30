# 作業計画書 - Issue #95 画像ファイルビューワ

## Issue概要

**Issue番号**: #95
**タイトル**: 画像ファイルビューワ
**サイズ**: M（中規模）
**優先度**: Medium
**依存Issue**: #94（ファイルアップロード機能）- 完了済み
**ラベル**: feature

## 背景

FileTreeViewで画像ファイルを選択した際に、ビューワ領域で画像を視認可能にする。
Claude Codeと視覚的なコミュニケーションを可能にし、UIの問題議論やデザインレビューを効率化する。

---

## 詳細タスク分解

### 事前確認（Phase 0）

#### Task 0.1: 既存コード調査
- **内容**:
  - `tests/integration/api-file-operations.test.ts` の内容確認
  - FileContent型を参照しているコードのGrep確認
  - 既存テスト構造の確認（tests/unit/ or src/**/__tests__/）
- **依存**: なし

---

### Phase 1: 型定義・設定（基盤整備）

#### Task 1.1: image-extensions.ts作成
- **成果物**: `src/config/image-extensions.ts`
- **依存**: なし
- **内容**:
  - IMAGE_EXTENSIONS定数（.png, .jpg, .jpeg, .gif, .webp, .svg）
  - IMAGE_MAX_SIZE_BYTES定数（5MB）
  - ImageExtensionValidatorインターフェース
  - IMAGE_EXTENSION_VALIDATORS配列（マジックバイト定義）
  - isImageExtension()関数（ドット正規化処理）
  - validateImageMagicBytes()関数
  - validateWebPMagicBytes()関数（完全検証）
  - validateSvgContent()関数（XSS対策5項目）
  - validateImageContent()関数
  - ImageValidationResult型

#### Task 1.2: FileContent interface移動
- **成果物**: `src/types/models.ts`
- **依存**: なし
- **内容**:
  - FileContent interface追加（successフィールドなし）
  - FileContentResponse型追加（success wrapper）
  - isImage?, mimeType?オプショナルフィールド

#### Task 1.3: FileViewer.tsx型更新
- **成果物**: `src/components/worktree/FileViewer.tsx`
- **依存**: Task 1.2
- **内容**:
  - ローカルFileContent interface削除
  - `import { FileContent } from '@/types/models'`追加

---

### Phase 2: API拡張

#### Task 2.1: GET API拡張
- **成果物**: `src/app/api/worktrees/[id]/files/[...path]/route.ts`
- **依存**: Task 1.1
- **内容**:
  - 画像ファイル判定（isImageExtension使用）
  - ファイルサイズ検証（5MB制限）
  - マジックバイト検証
  - SVG検証（XSS対策5項目）
  - Base64 data URIエンコード
  - isImage, mimeTypeフィールド追加
  - 既存エラーコード活用（INVALID_MAGIC_BYTES, FILE_TOO_LARGE）

---

### Phase 3: UIコンポーネント

#### Task 3.1: ImageViewer.tsx作成
- **成果物**: `src/components/worktree/ImageViewer.tsx`
- **依存**: なし
- **内容**:
  - ImageViewerProps定義（src, alt, mimeType?, onError?）
  - シンプルなimgタグ使用（KISS原則）
  - 最大幅100%、最大高さ500px
  - エラーハンドリング

#### Task 3.2: FileViewer.tsx更新
- **成果物**: `src/components/worktree/FileViewer.tsx`
- **依存**: Task 1.3, Task 3.1
- **内容**:
  - isImage判定による条件分岐
  - ImageViewerコンポーネント呼び出し
  - 画像ファイル取り扱いフローのコメント追記

---

### Phase 4: テスト

#### Task 4.1: image-extensions単体テスト
- **成果物**: `tests/unit/config/image-extensions.test.ts`
- **依存**: Task 1.1
- **内容**:
  - isImageExtension()テスト
  - validateImageMagicBytes()テスト
  - validateWebPMagicBytes()テスト
  - validateSvgContent()テスト（XSS攻撃パターン含む）
  - validateImageContent()テスト

#### Task 4.2: SVG XSSセキュリティテスト
- **成果物**: `tests/unit/config/image-extensions.test.ts`（Task 4.1に含む）
- **依存**: Task 1.1
- **内容**:
  - イベントハンドラ属性（onload, onclick等）拒否テスト
  - javascript:スキーム拒否テスト
  - data:スキーム拒否テスト
  - vbscript:スキーム拒否テスト
  - foreignObject要素拒否テスト
  - 正常SVG受け入れテスト

#### Task 4.3: 結合テスト確認
- **成果物**: `tests/integration/api-file-operations.test.ts`（確認のみ）
- **依存**: Task 2.1
- **内容**:
  - 既存テストが壊れていないか確認
  - 必要に応じて画像API用テスト追加

#### Task 4.4: E2Eテスト作成
- **成果物**: `tests/e2e/image-viewer.spec.ts`
- **依存**: Task 3.2
- **内容**:
  - FileTreeViewから画像選択→FileViewerで表示フロー
  - PNG, JPEG, GIF, WebP表示テスト
  - SVG表示テスト
  - 5MB超ファイルエラーテスト
  - 非対応形式の従来動作テスト

---

### Phase 5: ドキュメント

#### Task 5.1: CLAUDE.md更新
- **成果物**: `CLAUDE.md`
- **依存**: 全Phase完了
- **内容**:
  - 主要機能モジュールにimage-extensions.ts追加
  - 「最近の実装機能」にIssue #95概要追加

---

## タスク依存関係

```
Phase 0: 事前確認
┌────────────────┐
│   Task 0.1     │ 既存コード調査
└───────┬────────┘
        │
Phase 1: 型定義・設定
        │
┌───────▼────────┐  ┌────────────────┐
│   Task 1.1     │  │   Task 1.2     │
│image-extensions│  │FileContent移動 │
└───────┬────────┘  └───────┬────────┘
        │                   │
        │           ┌───────▼────────┐
        │           │   Task 1.3     │
        │           │FileViewer型更新│
        │           └───────┬────────┘
        │                   │
Phase 2: API拡張            │
┌───────▼────────┐          │
│   Task 2.1     │          │
│  GET API拡張   │          │
└───────┬────────┘          │
        │                   │
Phase 3: UIコンポーネント   │
        │   ┌────────────────┐
        │   │   Task 3.1     │
        │   │ImageViewer作成 │
        │   └───────┬────────┘
        │           │
        │   ┌───────▼────────┐
        └──►│   Task 3.2     │◄─┘
            │FileViewer更新  │
            └───────┬────────┘
                    │
Phase 4: テスト     │
┌───────────────────┼───────────────────────┐
│                   │                       │
│ ┌────────────────┐│  ┌────────────────┐   │
│ │   Task 4.1     ││  │   Task 4.3     │   │
│ │単体テスト      ││  │結合テスト確認  │   │
│ │（XSS含む）     ││  │                │   │
│ └───────┬────────┘│  └───────┬────────┘   │
│         │         │          │            │
│         └─────────┼──────────┘            │
│                   │                       │
│           ┌───────▼────────┐              │
│           │   Task 4.4     │              │
│           │  E2Eテスト     │              │
│           └───────┬────────┘              │
│                   │                       │
└───────────────────┼───────────────────────┘
                    │
Phase 5: ドキュメント
            ┌───────▼────────┐
            │   Task 5.1     │
            │ CLAUDE.md更新  │
            └────────────────┘
```

---

## 品質チェック項目

| チェック項目 | コマンド | 基準 |
|-------------|----------|------|
| ESLint | `npm run lint` | エラー0件 |
| TypeScript | `npx tsc --noEmit` | 型エラー0件 |
| Unit Test | `npm run test:unit` | 全テストパス |
| Integration Test | `npm run test:integration` | 全テストパス |
| E2E Test | `npm run test:e2e` | 全テストパス |
| Build | `npm run build` | 成功 |

---

## 成果物チェックリスト

### コード（新規作成）
- [ ] `src/config/image-extensions.ts`
- [ ] `src/components/worktree/ImageViewer.tsx`

### コード（変更）
- [ ] `src/types/models.ts`
- [ ] `src/components/worktree/FileViewer.tsx`
- [ ] `src/app/api/worktrees/[id]/files/[...path]/route.ts`

### テスト（新規作成）
- [ ] `tests/unit/config/image-extensions.test.ts`
- [ ] `tests/e2e/image-viewer.spec.ts`

### ドキュメント
- [ ] `CLAUDE.md`

---

## セキュリティチェックリスト

| 項目 | 対策 | 確認 |
|------|------|------|
| パストラバーサル | `isPathSafe()`活用 | [ ] |
| 拡張子検証 | ホワイトリスト方式 | [ ] |
| MIMEタイプ検証 | マジックバイト検証 | [ ] |
| WebP完全検証 | RIFFヘッダー+WEBPシグネチャ | [ ] |
| SVG XSS: scriptタグ | 検出・拒否 | [ ] |
| SVG XSS: イベントハンドラ | on*属性検出・拒否 | [ ] |
| SVG XSS: javascript:スキーム | 検出・拒否 | [ ] |
| SVG XSS: foreignObject | 検出・拒否 | [ ] |
| サイズ制限 | 5MB | [ ] |
| エラーメッセージ | 情報漏洩防止 | [ ] |

---

## Definition of Done

Issue完了条件：
- [ ] 全タスク（Task 0.1 〜 Task 5.1）完了
- [ ] 単体テストカバレッジ80%以上
- [ ] CIチェック全パス（lint, type-check, test, build）
- [ ] セキュリティチェックリスト全項目確認
- [ ] 受け入れ条件（8項目）全て満たす
- [ ] 設計方針書との整合性確認
- [ ] CLAUDE.md更新完了

---

## 受け入れ条件（Issueより）

1. [ ] PNG, JPG, GIF, WEBP, SVG形式の画像ファイルがFileTreeViewで選択可能
2. [ ] 選択した画像ファイルがビューワ領域に表示される
3. [ ] 画像は最大幅100%、最大高さ500pxで表示される
4. [ ] 5MB以上の画像ファイルはエラーメッセージを表示
5. [ ] 対応外のファイル形式は従来通りの動作
6. [ ] 単体テストが追加されている
7. [ ] E2Eテストが追加されている
8. [ ] SVG XSS攻撃（イベントハンドラ、javascript:スキーム、foreignObject）が防止されている

---

## 次のアクション

作業計画承認後：

1. **ブランチ作成**
   ```bash
   git checkout -b feature/95-image-viewer
   ```

2. **タスク実行**: 計画に従ってPhase順に実装

3. **進捗報告**: `/progress-report`で定期報告

4. **PR作成**: `/create-pr`で自動作成

---

## 関連ドキュメント

- **設計方針書**: `dev-reports/design/issue-95-image-viewer-design-policy.md`
- **Issueレビュー結果**: `dev-reports/issue/95/issue-review/`
- **設計レビュー結果**: `dev-reports/issue/95/multi-stage-design-review/`
- **Issue URL**: https://github.com/Kewton/CommandMate/issues/95
- **依存Issue #94**: https://github.com/Kewton/CommandMate/issues/94（完了済み）

---

*作成日: 2026-01-30*
