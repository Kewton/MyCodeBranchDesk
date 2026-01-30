# Issue #49 影響範囲レビューレポート（Stage 3）

**レビュー日**: 2026-01-30
**フォーカス**: 影響範囲レビュー（1回目）
**ステージ**: 3/4

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 2 |
| Should Fix | 4 |
| Nice to Have | 3 |

Issue #49は既存のFilesタブを拡張してマークダウンエディタ機能を追加する中規模の機能追加です。影響範囲として、APIルートへの4つの新規HTTPメソッド追加、FileTreeViewへの右クリックメニュー追加、新規MarkdownEditorコンポーネント作成が主要な変更点です。

---

## Must Fix（必須対応）

### MF-1: 既存API route.tsへのHTTPメソッド追加による破壊的変更リスク

**カテゴリ**: 影響ファイル
**場所**: 技術仕様 > API設計 セクション

**問題**:
現在 `src/app/api/worktrees/[id]/files/[...path]/route.ts` はGETメソッドのみ実装されています。同一ファイルにPUT/POST/DELETE/PATCHメソッドを追加するか、別ファイルにするかの方針が未定義です。

**証拠**:
```typescript
// 現在の実装 (src/app/api/worktrees/[id]/files/[...path]/route.ts)
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string; path: string[] } }
) { ... }
// PUT, POST, DELETE, PATCHは未実装
```

**推奨対応**:
- 既存GET APIの動作が変わらないことを明記
- PUT/POST/DELETE/PATCHメソッド追加時の既存クライアントへの影響がないことを確認するテストケースをIssueに追加

---

### MF-2: FileTreeViewコンポーネントへの右クリックメニュー追加による大幅な変更

**カテゴリ**: 依存関係
**場所**: 技術仕様 > 既存コンポーネントとの関係 セクション

**問題**:
FileTreeView.tsx (465行) の変更範囲が具体化されていません。右クリックメニュー実装には以下の追加が必要です：
- TreeNodeコンポーネントへのcontextmenuイベント
- MenuコンポーネントUI
- 操作別ハンドラー（追加/リネーム/削除）

**証拠**:
```typescript
// 現在のFileTreeView (src/components/worktree/FileTreeView.tsx)
export interface FileTreeViewProps {
  worktreeId: string;
  onFileSelect?: (filePath: string) => void;  // 現在のコールバック
  className?: string;
}
// 右クリックメニュー関連のpropsは未定義
```

**推奨対応**:
- TreeNodeへのcontextmenu追加箇所を明記
- 新規追加するPropsインターフェースを設計書に追加
- Menuコンポーネントの配置方針（既存UIコンポーネント活用 or 新規作成）を決定

---

## Should Fix（推奨対応）

### SF-1: テスト対象・テスト計画の記載がない

**カテゴリ**: テスト範囲
**場所**: Issue全体

**問題**:
テスト計画が未記載です。

**証拠**:
既存テストファイル：
- `tests/integration/api-file-tree.test.ts` (328行)
- `tests/unit/lib/file-tree.test.ts` (475行)

**推奨対応**:
以下のテスト計画を受け入れ条件または別セクションに追加：
1. API新規メソッド（PUT/POST/DELETE/PATCH）のユニットテスト
2. FileTreeView右クリックメニューのコンポーネントテスト
3. MarkdownEditorのコンポーネントテスト
4. E2Eテスト（ファイル作成→編集→保存の一連フロー）

---

### SF-2: WorktreeDetailRefactoredへの影響が未評価

**カテゴリ**: 移行考慮
**場所**: 技術仕様 > 既存コンポーネントとの関係 セクション

**問題**:
WorktreeDetailRefactored.tsx (約1300行) がFileTreeView, FileViewerを使用しています。MarkdownEditorへの切り替えロジックの追加箇所が不明確です。

**証拠**:
```typescript
// WorktreeDetailRefactored.tsx L891-901
const handleFilePathClick = useCallback((path: string) => {
  setFileViewerPath(path);
}, []);

const handleFileSelect = useCallback((path: string) => {
  setFileViewerPath(path);
}, []);
// mdファイル判定ロジックの追加が必要
```

**推奨対応**:
- mdファイル選択時にMarkdownEditor、それ以外はFileViewerを表示する分岐ロジックの追加箇所を明記
- 状態管理（editorMode等）の追加が必要かどうかを検討

---

### SF-3: 大きなmdファイル編集時のパフォーマンス考慮が未記載

**カテゴリ**: パフォーマンス
**場所**: 機能要件 > エディタ・ビューワー セクション

**問題**:
大きなファイルを編集する際のパフォーマンス影響が考慮されていません。

**証拠**:
```typescript
// src/lib/file-tree.ts
export const LIMITS = {
  MAX_FILE_SIZE_PREVIEW: 1024 * 1024,  // 1MB
} as const;
```

**推奨対応**:
- ファイルサイズ上限（例: 1MBをプレビュー制限から流用）を明記
- 上限を超えるファイルでの警告表示仕様を追加

---

### SF-4: CLAUDE.md への機能追記が必要

**カテゴリ**: ドキュメント更新
**場所**: Issue全体

**問題**:
実装完了後のドキュメント更新について言及がありません。

**推奨対応**:
実装完了後、以下のドキュメント更新を行う旨を明記：
- CLAUDE.md「主要機能モジュール」セクションにMarkdownEditor追加
- CLAUDE.md「最近の実装機能」セクションにIssue #49の概要追加
- 必要に応じてdocs/配下のドキュメント更新

---

## Nice to Have（あれば良い）

### NTH-1: LeftPaneTabSwitcherへの影響が未記載

**カテゴリ**: 完全性
**場所**: 技術仕様 > 既存コンポーネントとの関係 セクション

```typescript
// LeftPaneTabSwitcher.tsx L19, L101-105
export type LeftPaneTab = 'history' | 'files' | 'memo';

const TABS: TabConfig[] = [
  { id: 'history', label: 'History', icon: <HistoryIcon /> },
  { id: 'files', label: 'Files', icon: <FilesIcon /> },
  { id: 'memo', label: 'Memo', icon: <MemoIcon /> },
];
```

**推奨対応**:
Filesタブ選択時のパネル切り替えロジックの具体的な変更内容を記載

---

### NTH-2: 新規依存ライブラリの追加確認が未記載

**カテゴリ**: 完全性
**場所**: 技術仕様 セクション

**証拠**:
```json
// package.json L34-36
"react-markdown": "^10.1.0",
"remark-gfm": "^4.0.1",
```

**推奨対応**:
react-markdown, remark-gfmは既にpackage.jsonに存在することを確認済み。追加の依存関係が不要であることを明記すると安心

---

### NTH-3: MessageList.tsxでのMarkdown表示との整合性

**カテゴリ**: 完全性
**場所**: 技術仕様 > 既存コンポーネントとの関係 セクション

**証拠**:
```typescript
// MessageList.tsx L14-15
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
```

**推奨対応**:
MarkdownEditorでも同じスタイリング・設定を適用することで一貫性を保つことを推奨

---

## 影響分析

### 影響を受けるファイル一覧

| ファイル | 変更タイプ | 説明 |
|---------|-----------|------|
| `src/app/api/worktrees/[id]/files/[...path]/route.ts` | 大規模変更 | PUT, POST, DELETE, PATCHメソッド追加 |
| `src/components/worktree/FileTreeView.tsx` | 大規模変更 | 右クリックメニュー機能追加 |
| `src/components/worktree/MarkdownEditor.tsx` | 新規作成 | マークダウンエディタ + プレビュー |
| `src/components/worktree/WorktreeDetailRefactored.tsx` | 小規模変更 | mdファイル選択時の表示ロジック追加 |
| `src/lib/file-tree.ts` | 小規模変更 | 書き込み・削除用関数追加の可能性 |
| `tests/integration/api-file-tree.test.ts` | 大規模変更 | 新規メソッドのテスト追加 |
| `tests/unit/lib/file-tree.test.ts` | 小規模変更 | 新規関数のテスト追加 |

### 影響を受けるAPI

| エンドポイント | タイプ | 説明 |
|---------------|-------|------|
| `PUT /api/worktrees/:id/files/:path` | 新規 | ファイル内容更新 |
| `POST /api/worktrees/:id/files/:path` | 新規 | ファイル/ディレクトリ作成 |
| `DELETE /api/worktrees/:id/files/:path` | 新規 | ファイル/ディレクトリ削除 |
| `PATCH /api/worktrees/:id/files/:path/rename` | 新規 | リネーム |
| `GET /api/worktrees/:id/files/:path` | 既存 | 変更なし（後方互換性維持） |

### 影響を受けるコンポーネント

| コンポーネント | 変更タイプ | 説明 |
|---------------|-----------|------|
| FileTreeView | 大規模変更 | 右クリックメニュー追加 |
| FileViewer | 変更なし | モーダル形式を維持 |
| MarkdownEditor | 新規 | 新規コンポーネント |
| WorktreeDetailRefactored | 小規模変更 | 表示ロジック追加 |

### セキュリティ考慮事項

| 項目 | ステータス | 説明 |
|------|----------|------|
| パストラバーサル対策 | 対応済み | 既存のisPathSafe関数を活用 |
| md拡張子制限 | 対応済み | 編集可能ファイルをmdのみに制限 |
| worktreeスコープ制限 | 対応済み | APIがworktree内のみアクセス可能 |

### パフォーマンス考慮事項

| 項目 | リスク | 推奨対応 |
|------|-------|---------|
| 大きなmdファイルの編集 | 中 | ファイルサイズ上限と警告表示の追加 |
| リアルタイムプレビュー | 低 | デバウンス処理の検討 |

---

## 破壊的変更

**なし** - 既存のGET APIは変更なく維持されます。新規メソッドの追加のみです。

---

## 参照ファイル

### コード
- `src/app/api/worktrees/[id]/files/[...path]/route.ts`: 既存ファイルAPI（GETのみ）
- `src/components/worktree/FileTreeView.tsx`: 変更対象のファイルツリーコンポーネント
- `src/components/worktree/FileViewer.tsx`: 参考コンポーネント（モーダル形式維持）
- `src/components/worktree/WorktreeDetailRefactored.tsx`: 統合コンポーネント
- `src/lib/file-tree.ts`: ファイルツリービジネスロジック
- `src/lib/path-validator.ts`: パス検証ユーティリティ

### テスト
- `tests/integration/api-file-tree.test.ts`: APIインテグレーションテスト
- `tests/unit/lib/file-tree.test.ts`: ユニットテスト

### ドキュメント
- `CLAUDE.md`: プロジェクトガイドライン（更新対象）
- `package.json`: 依存関係（react-markdown, remark-gfm既存）
