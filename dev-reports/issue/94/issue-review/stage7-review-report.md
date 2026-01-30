# Issue #94 レビューレポート

**レビュー日**: 2026-01-30
**フォーカス**: 影響範囲レビュー
**イテレーション**: 2回目
**ステージ**: Stage 7

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 0 |
| Should Fix | 1 |
| Nice to Have | 2 |

**総合評価**: 良好 - 実装可能

## 前回指摘事項（Stage 3）の対応状況

Stage 3で指摘された6件の影響範囲に関する指摘事項はすべて対応済み。

| ID | カテゴリ | 対応状況 |
|----|---------|----------|
| MF-1 | 設定ファイルへの影響 | **対応済み** - next.config.jsのbodySizeLimit設定例追加、api.bodyParser非推奨の説明追記 |
| MF-2 | 既存APIへの影響 | **対応済み** - 新規エンドポイント`/api/worktrees/:id/files/:path/upload`作成方針を明記 |
| SF-1 | 影響ファイル | **対応済み** - 新規作成4件、変更6件のファイル一覧を追加 |
| SF-2 | テストへの影響 | **対応済み** - 単体/結合/E2Eの3レベルテスト計画を追加 |
| SF-3 | 依存関係 | **対応済み** - Next.js 13+ネイティブformData()使用、追加ライブラリ不要と明記 |
| SF-4 | パフォーマンスへの影響 | **対応済み** - メモリ使用量、同時アップロード制限の考慮事項を追加 |

---

## Should Fix（推奨対応）

### SF-1: 既存FileTreeView.test.tsxにアップロードメニュー項目のテストケース追加が必要

**カテゴリ**: テストへの影響
**場所**: テスト計画 セクション / tests/unit/components/worktree/FileTreeView.test.tsx

**問題**:
既存の`tests/unit/components/worktree/FileTreeView.test.tsx`にコンテキストメニューの「ファイルをアップロード」項目表示テストの追加が必要。

**証拠**:
現在のFileTreeView.test.tsxはコンテキストメニューのNew File/New Directory/Rename/Deleteのみテスト。onUploadコールバック追加時のテストケース追加が必要。

**推奨対応**:
テスト計画セクションに既存テストファイルの変更範囲も明記することを推奨。例: 「既存テストの変更: tests/unit/components/worktree/FileTreeView.test.tsx - onUploadコールバックとメニュー項目のテスト追加」

---

## Nice to Have（あれば良い）

### NTH-1: CLAUDE.md更新計画の詳細化

**カテゴリ**: 設定ファイルへの影響
**場所**: 影響ファイル一覧 セクション

**問題**:
CLAUDE.mdの更新計画が影響ファイル一覧に含まれていない。

**推奨対応**:
- 「主要機能モジュール」テーブルに`src/config/uploadable-extensions.ts`を追加
- 「最近の実装機能」セクションにIssue #94の概要追加

---

### NTH-2: Issue #95との実装順序の明確化

**カテゴリ**: 依存関係
**場所**: 関連Issue セクション

**問題**:
Issue #95（画像ファイルビューワ）との依存関係は記載されているが、実装順序が明示的に記載されていない。

**証拠**:
「本Issueで画像アップロード後、Issue #95でビューワを実装することで画像が視認可能になる」と記載あり。実装順序は暗黙的に示されているが明示的な記載はない。

**推奨対応**:
実装順序（本Issue #94先行 -> Issue #95後続）を明記し、共通コンポーネントの検討も追加すると計画がより明確になる。

---

## 影響範囲サマリー

### 新規作成ファイル

| ファイル | 説明 |
|----------|------|
| `src/config/uploadable-extensions.ts` | アップロード可能拡張子設定 |
| `src/app/api/worktrees/[id]/files/[...path]/upload/route.ts` | 新規アップロードエンドポイント |
| `tests/unit/config/uploadable-extensions.test.ts` | 拡張子設定の単体テスト |
| `tests/e2e/file-upload.spec.ts` | アップロード機能のE2Eテスト |

### 変更ファイル

| ファイル | 変更内容 | 影響度 |
|----------|----------|--------|
| `src/lib/file-operations.ts` | writeBinaryFile()関数の新規追加 | 高 |
| `src/components/worktree/FileTreeView.tsx` | onUpload callback propの追加 | 高 |
| `src/components/worktree/ContextMenu.tsx` | 「ファイルをアップロード」項目追加 | 高 |
| `src/hooks/useContextMenu.ts` | uploadアクション用の型拡張 | 中 |
| `src/types/markdown-editor.ts` | アップロードレスポンス型の追加 | 中 |
| `next.config.js` | bodySizeLimit: '2mb' -> '6mb' | 中 |
| `tests/unit/components/worktree/FileTreeView.test.tsx` | onUploadテストケース追加 | 中 |

### 破壊的変更

**なし** - 新規エンドポイント追加のため既存APIに影響なし。後方互換性は完全に維持される。

### パフォーマンス考慮事項

- 5MBファイルアップロード時のメモリ使用量増加（Issue内に対策記載済み）
- 初期実装では単一ファイルアップロードのみ対応

### セキュリティ考慮事項

- パストラバーサル防止（既存isPathSafe()活用）
- MIMEタイプ検証（対応表記載済み）
- 実行ファイルブロック（ブロックリスト記載済み）
- ファイルサイズ制限（5MB）

---

## 参照ファイル

### コード

| ファイル | 関連性 |
|----------|--------|
| `src/components/worktree/FileTreeView.tsx` | アップロードUI追加箇所 |
| `src/components/worktree/ContextMenu.tsx` | メニュー項目追加箇所 |
| `src/lib/file-operations.ts` | バイナリ書き込み関数追加箇所 |
| `src/hooks/useContextMenu.ts` | 状態管理拡張箇所 |
| `next.config.js` | サイズ制限設定変更箇所 |
| `src/app/api/worktrees/[id]/files/[...path]/route.ts` | 既存API（参考設計） |

### テスト

| ファイル | 関連性 |
|----------|--------|
| `tests/unit/components/worktree/FileTreeView.test.tsx` | 既存テスト - 変更必要 |
| `tests/e2e/file-upload.spec.ts` | 新規E2Eテスト |
| `tests/unit/config/uploadable-extensions.test.ts` | 新規単体テスト |

### ドキュメント

| ファイル | 関連性 |
|----------|--------|
| `CLAUDE.md` | 主要機能モジュール一覧への追加推奨 |

---

## 総合評価

Stage 3で指摘された影響範囲に関する6件の指摘事項（Must Fix: 2件、Should Fix: 4件）はすべて適切に対応されている。

**対応済み項目**:
- next.config.js設定詳細化（bodySizeLimit: '6mb'、api.bodyParser非推奨説明）
- 新規エンドポイント方針明確化（`/api/worktrees/:id/files/:path/upload`）
- 影響ファイル一覧追加（新規4件、変更6件）
- テスト計画追加（単体/結合/E2E）
- multipart/form-data処理方法明記（Next.jsネイティブformData()）
- パフォーマンス考慮事項追加（メモリ使用量、同時アップロード制限）

**残りの指摘**:
- Should Fix: 1件（既存テストファイル変更範囲の明確化）
- Nice to Have: 2件（CLAUDE.md更新計画、Issue #95連携詳細化）

影響範囲分析は十分なレベルに達しており、実装開始可能な状態である。破壊的変更なし、後方互換性も確保されている。
