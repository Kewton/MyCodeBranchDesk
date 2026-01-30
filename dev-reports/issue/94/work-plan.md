# 作業計画書 - Issue #94 ファイルアップロード機能

## Issue概要

**Issue番号**: #94
**タイトル**: ファイルアップロード機能
**サイズ**: L（大規模）
**優先度**: High
**依存Issue**: なし
**後続Issue**: #95（画像ファイルビューワ）
**ラベル**: feature

## 背景

FileTreeViewにて指定したディレクトリにファイルをアップロードする機能を実装する。
スクリーンショットやCSVファイルなど、Claude Codeの分析に必要な情報を効率的に提供可能にする。

---

## 詳細タスク分解

### Phase 1: 型定義・設定（基盤整備）

#### Task 1.1: FileOperationErrorCode型の拡張
- **成果物**: `src/lib/file-operations.ts`
- **依存**: なし
- **内容**:
  - `FileOperationErrorCode`型に追加: `INVALID_EXTENSION`, `INVALID_MIME_TYPE`, `INVALID_MAGIC_BYTES`, `FILE_TOO_LARGE`, `INVALID_FILENAME`, `INVALID_FILE_CONTENT`
  - `ERROR_MESSAGES`に新エラーコードのメッセージ追加（[SEC-005] 具体的情報除外）
  - `FileOperationResult`に`size?: number`追加（[IMPACT-001] オプショナルで後方互換性維持）

#### Task 1.2: ERROR_CODE_TO_HTTP_STATUSマッピング更新
- **成果物**: `src/app/api/worktrees/[id]/files/[...path]/route.ts`
- **依存**: Task 1.1
- **内容**:
  - [CONS-001] `FileOperationErrorCode`と同時に`ERROR_CODE_TO_HTTP_STATUS`を更新
  - 新エラーコードのHTTPステータスマッピング追加

#### Task 1.3: isValidNewName関数の拡張
- **成果物**: `src/lib/file-operations.ts`
- **依存**: Task 1.1
- **内容**:
  - [DRY-001] 既存関数を拡張（`sanitizeFilename()`は作成しない）
  - [SEC-004] アップロード用検証追加（制御文字、OS禁止文字、先頭/末尾スペース・ドット）
  - オプション引数`{ forUpload?: boolean }`追加

#### Task 1.4: uploadable-extensions.ts作成
- **成果物**: `src/config/uploadable-extensions.ts`
- **依存**: なし
- **内容**:
  - [CONSISTENCY-001] `UploadableExtensionValidator`インターフェース定義
  - [SEC-001] `MagicBytesDefinition`インターフェース追加
  - `UPLOADABLE_EXTENSION_VALIDATORS`配列（マジックバイト含む）
  - [SEC-002] SVGを許可リストから除外
  - `isUploadableExtension()`, `validateMimeType()`, `getMaxFileSize()`関数
  - [SEC-001] `validateMagicBytes()`関数追加
  - [SEC-006] `isYamlSafe()`関数追加
  - [SEC-007] `isJsonValid()`関数追加

---

### Phase 2: ビジネスロジック

#### Task 2.1: writeBinaryFile関数の実装
- **成果物**: `src/lib/file-operations.ts`
- **依存**: Task 1.1, Task 1.3
- **内容**:
  - [SOLID-001] 多層防御設計（パス検証込み）
  - [DRY-002] パストラバーサル検証（意図的な重複）
  - [CONS-002] `filename`は返さない（APIルート層で追加）
  - 既存`createFileOrDirectory()`パターン踏襲

---

### Phase 3: APIエンドポイント

#### Task 3.1: アップロードAPIルート作成
- **成果物**: `src/app/api/worktrees/[id]/files/[...path]/upload/route.ts`
- **依存**: Task 1.2, Task 1.4, Task 2.1
- **内容**:
  - POST `multipart/form-data`対応
  - `request.formData()`でファイル取得
  - 検証順序: 拡張子 → MIMEタイプ → マジックバイト → サイズ → ファイル名 → 同名チェック
  - [SEC-001] マジックバイト検証
  - [SEC-004] ファイル名検証（`isValidNewName({ forUpload: true })`）
  - [SEC-005] エラーメッセージから具体的情報除外
  - [SEC-006] YAML安全性検証
  - [SEC-007] JSON構文検証
  - [CONS-002] レスポンスに`filename`追加

#### Task 3.2: next.config.js設定変更
- **成果物**: `next.config.js`
- **依存**: なし
- **内容**:
  - [CONS-006] `bodySizeLimit`を`2mb`から`6mb`に変更
  - [IMPACT-003] 全APIルートへの影響を認識

---

### Phase 4: UIコンポーネント

#### Task 4.1: ContextMenu更新
- **成果物**: `src/components/worktree/ContextMenu.tsx`
- **依存**: なし
- **内容**:
  - [CONS-004] `ContextMenuProps`に`onUpload`追加
  - 「ファイルをアップロード」メニュー項目追加（ディレクトリ選択時のみ表示）
  - Uploadアイコン使用

#### Task 4.2: FileTreeView更新
- **成果物**: `src/components/worktree/FileTreeView.tsx`
- **依存**: Task 4.1
- **内容**:
  - `FileTreeViewProps`に`onUpload`追加
  - [IMPACT-002] `onUpload`をContextMenuに伝播

#### Task 4.3: WorktreeDetailRefactored更新
- **成果物**: `src/components/worktree/WorktreeDetailRefactored.tsx`
- **依存**: Task 4.2, Task 3.1
- **内容**:
  - [IMPACT-004] `handleUpload`コールバック実装
  - ファイル選択ダイアログ（`<input type="file">`）
  - クライアント側事前検証（サイズ、拡張子）
  - APIコール実装（multipart/form-data）
  - Toast通知（成功/エラー）
  - アップロード成功後に`refreshTrigger`更新

---

### Phase 5: テスト

#### Task 5.1: uploadable-extensions単体テスト
- **成果物**: `tests/unit/config/uploadable-extensions.test.ts`
- **依存**: Task 1.4
- **内容**:
  - `isUploadableExtension()`テスト（許可/拒否パターン）
  - `validateMimeType()`テスト
  - [SEC-001] `validateMagicBytes()`テスト（PNG/JPEG/GIF/WebP）
  - [SEC-002] SVG拒否テスト
  - [SEC-006] `isYamlSafe()`テスト
  - [SEC-007] `isJsonValid()`テスト
  - `getMaxFileSize()`テスト

#### Task 5.2: file-operations単体テスト追加
- **成果物**: `tests/unit/lib/file-operations.test.ts`
- **依存**: Task 1.1, Task 1.3, Task 2.1
- **内容**:
  - [SEC-004] `isValidNewName({ forUpload: true })`テスト
  - [CONS-001] `createErrorResult()`新エラーコードテスト
  - `writeBinaryFile()`テスト

#### Task 5.3: FileTreeView単体テスト追加
- **成果物**: `tests/unit/components/worktree/FileTreeView.test.tsx`
- **依存**: Task 4.1, Task 4.2
- **内容**:
  - アップロードメニュー表示テスト
  - `onUpload`コールバックテスト

#### Task 5.4: 結合テスト作成
- **成果物**: `tests/integration/api/file-upload.test.ts`
- **依存**: Task 3.1
- **内容**:
  - 正常アップロードテスト
  - サイズ超過（413）テスト
  - 非対応拡張子（400）テスト
  - MIMEタイプ不一致（400）テスト
  - [SEC-001] マジックバイト不一致テスト
  - [SEC-002] SVG拒否テスト
  - [SEC-004] 制御文字ファイル名テスト
  - [SEC-006] 危険YAMLタグテスト
  - [SEC-007] 不正JSON構文テスト
  - パストラバーサル（403）テスト
  - 同名ファイル（409）テスト

#### Task 5.5: E2Eテスト作成
- **成果物**: `tests/e2e/file-upload.spec.ts`
- **依存**: Task 4.3
- **内容**:
  - 右クリックメニューからのアップロードフロー
  - アップロード成功時のToast通知
  - ファイルツリー自動更新確認
  - エラー時のToast通知

---

### Phase 6: ドキュメント

#### Task 6.1: CLAUDE.md更新
- **成果物**: `CLAUDE.md`
- **依存**: 全Phase完了
- **内容**:
  - 主要機能モジュールに`uploadable-extensions.ts`追加
  - 「最近の実装機能」にIssue #94概要追加

---

## タスク依存関係

```
Phase 1: 型定義・設定
┌────────────────┐
│   Task 1.1     │ FileOperationErrorCode拡張
│ file-operations│
└───────┬────────┘
        │
┌───────▼────────┐  ┌────────────────┐
│   Task 1.2     │  │   Task 1.3     │
│ERROR_CODE_TO_  │  │isValidNewName  │
│HTTP_STATUS     │  │    拡張        │
└───────┬────────┘  └───────┬────────┘
        │                   │
        └───────┬───────────┘
                │
┌───────────────┴───────────────────┐
│           Task 1.4                │ uploadable-extensions.ts
│  (並行可能: Task 1.1-1.3と独立)    │
└───────────────┬───────────────────┘

Phase 2: ビジネスロジック
                │
┌───────────────▼───────────────────┐
│           Task 2.1                │ writeBinaryFile()
│     (Task 1.1, 1.3に依存)         │
└───────────────┬───────────────────┘

Phase 3: API
                │
┌───────────────▼───────────────────┐  ┌────────────────┐
│           Task 3.1                │  │   Task 3.2     │
│     アップロードAPIルート          │  │next.config.js  │
│ (Task 1.2, 1.4, 2.1に依存)        │  │  (独立)        │
└───────────────┬───────────────────┘  └───────┬────────┘
                │                              │
Phase 4: UI     │                              │
┌───────────────┴──────────────────────────────┘
│
│  ┌────────────────┐
│  │   Task 4.1     │ ContextMenu (onUpload追加)
│  └───────┬────────┘
│          │
│  ┌───────▼────────┐
│  │   Task 4.2     │ FileTreeView (props伝播)
│  └───────┬────────┘
│          │
│  ┌───────▼────────┐
└─►│   Task 4.3     │ WorktreeDetailRefactored (実装本体)
   │(Task 3.1に依存)│
   └───────┬────────┘

Phase 5: テスト
           │
┌──────────┼──────────────────────────────────────────┐
│          │                                          │
│  ┌───────▼────────┐  ┌────────────────┐  ┌─────────▼───────┐
│  │   Task 5.1     │  │   Task 5.2     │  │   Task 5.3      │
│  │uploadable-ext  │  │file-operations │  │FileTreeView     │
│  │    テスト      │  │    テスト      │  │    テスト       │
│  └───────┬────────┘  └───────┬────────┘  └────────┬────────┘
│          │                   │                    │
│          └───────────────────┼────────────────────┘
│                              │
│                      ┌───────▼────────┐
│                      │   Task 5.4     │ 結合テスト
│                      └───────┬────────┘
│                              │
│                      ┌───────▼────────┐
└─────────────────────►│   Task 5.5     │ E2Eテスト
                       └───────┬────────┘

Phase 6: ドキュメント
                       ┌───────▼────────┐
                       │   Task 6.1     │ CLAUDE.md更新
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
- [ ] `src/config/uploadable-extensions.ts`
- [ ] `src/app/api/worktrees/[id]/files/[...path]/upload/route.ts`

### コード（変更）
- [ ] `src/lib/file-operations.ts`
- [ ] `src/app/api/worktrees/[id]/files/[...path]/route.ts`
- [ ] `src/components/worktree/ContextMenu.tsx`
- [ ] `src/components/worktree/FileTreeView.tsx`
- [ ] `src/components/worktree/WorktreeDetailRefactored.tsx`
- [ ] `next.config.js`

### テスト（新規作成）
- [ ] `tests/unit/config/uploadable-extensions.test.ts`
- [ ] `tests/integration/api/file-upload.test.ts`
- [ ] `tests/e2e/file-upload.spec.ts`

### テスト（変更）
- [ ] `tests/unit/lib/file-operations.test.ts`
- [ ] `tests/unit/components/worktree/FileTreeView.test.tsx`

### ドキュメント
- [ ] `CLAUDE.md`

---

## セキュリティチェックリスト

| 項目 | 対策 | 確認 |
|------|------|------|
| パストラバーサル | `isPathSafe()`（多層防御） | [ ] |
| 拡張子検証 | ホワイトリスト方式 | [ ] |
| MIMEタイプ検証 | 拡張子との整合性確認 | [ ] |
| マジックバイト検証 | [SEC-001] ファイル内容検証 | [ ] |
| SVG XSSリスク | [SEC-002] 許可リストから除外 | [ ] |
| ファイル名検証 | [SEC-004] 制御文字、OS禁止文字 | [ ] |
| エラーメッセージ | [SEC-005] 情報漏洩防止 | [ ] |
| YAMLデシリアライズ | [SEC-006] 危険タグ検出 | [ ] |
| JSON構文 | [SEC-007] 構文検証 | [ ] |
| サイズ制限 | 5MB（早期検証） | [ ] |

---

## Definition of Done

Issue完了条件：
- [ ] 全タスク（Task 1.1 〜 Task 6.1）完了
- [ ] 単体テストカバレッジ80%以上
- [ ] CIチェック全パス（lint, type-check, test, build）
- [ ] セキュリティチェックリスト全項目確認
- [ ] 受け入れ条件（13項目）全て満たす
- [ ] 設計方針書との整合性確認
- [ ] CLAUDE.md更新完了

---

## 受け入れ条件（Issueより）

- [ ] 画像ファイル（.png, .jpg, .jpeg, .gif, .webp）をアップロードできる
- [ ] テキストファイル（.txt, .log）をアップロードできる
- [ ] マークダウンファイル（.md）をアップロードできる
- [ ] CSVファイル（.csv）をアップロードできる
- [ ] 設定ファイル（.json, .yaml, .yml）をアップロードできる
- [ ] 1ファイルあたり5MBまでのファイルをアップロードできる
- [ ] ファイルサイズ超過時に適切なエラーメッセージが表示される
- [ ] 未対応の拡張子のファイルは拒否され、エラーメッセージが表示される
- [ ] アップロード完了後にファイルツリーが自動更新される
- [ ] アップロード完了時にToast通知が表示される
- [ ] パストラバーサル攻撃を防止できる（isPathSafe()による検証）
- [ ] 右クリックメニューから「ファイルをアップロード」が選択できる
- [ ] マジックバイト検証により拡張子偽装を防止できる

**Note**: [SEC-002]によりSVG（.svg）は許可リストから除外されたため、受け入れ条件から除外

---

## 次のアクション

作業計画承認後：

1. **ブランチ作成**
   ```bash
   git checkout -b feature/94-file-upload
   ```

2. **タスク実行**: 計画に従ってPhase順に実装

3. **進捗報告**: `/progress-report`で定期報告

4. **PR作成**: `/create-pr`で自動作成

---

## 関連ドキュメント

- **設計方針書**: `dev-reports/design/issue-94-file-upload-design-policy.md`
- **Issueレビュー結果**: `dev-reports/issue/94/issue-review/`
- **設計レビュー結果**: `dev-reports/issue/94/multi-stage-design-review/`
- **Issue URL**: https://github.com/Kewton/CommandMate/issues/94

---

*作成日: 2026-01-30*
