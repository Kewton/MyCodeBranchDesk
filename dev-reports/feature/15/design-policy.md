# Issue #15: ファイルツリー表示機能 設計方針書

## 1. 概要

### 1.1 目的
Worktree 内のファイルをツリー形式で閲覧し、ファイル内容を確認できる機能を追加する。

### 1.2 スコープ
- ディレクトリ一覧 API の追加
- ファイルツリー UI コンポーネントの実装
- 既存 UI への統合（モバイル/デスクトップ両対応）

---

## 2. アーキテクチャ設計

### 2.1 システム構成図

```
┌─────────────────────────────────────────────────────────────┐
│                      クライアント                            │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  FileTreeView   │  │   FileViewer    │ ← 既存            │
│  │  (新規)         │──│   (既存)        │                   │
│  └────────┬────────┘  └────────┬────────┘                   │
└───────────┼─────────────────────┼───────────────────────────┘
            │                     │
            ▼                     ▼
┌───────────────────────────────────────────────────────────┐
│                    Next.js API Routes                      │
│  ┌─────────────────────┐  ┌─────────────────────────────┐  │
│  │ /api/worktrees/:id/ │  │ /api/worktrees/:id/files/   │  │
│  │ tree/[...path]      │  │ [...path] (既存)            │  │
│  │ (新規)              │  │                             │  │
│  └──────────┬──────────┘  └──────────┬──────────────────┘  │
└─────────────┼────────────────────────┼─────────────────────┘
              │                        │
              ▼                        ▼
┌───────────────────────────────────────────────────────────┐
│                    ファイルシステム                        │
│  ┌─────────────────────────────────────────────────────┐  │
│  │  Worktree Directory                                  │  │
│  │  ├── src/                                           │  │
│  │  │   ├── app/                                       │  │
│  │  │   ├── components/                                │  │
│  │  │   └── lib/                                       │  │
│  │  ├── docs/                                          │  │
│  │  └── package.json                                   │  │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

### 2.2 レイヤー構成

| レイヤー | 責務 | 該当ファイル |
|---------|------|-------------|
| **プレゼンテーション** | UI表示、ユーザー操作 | `src/components/worktree/FileTreeView.tsx` |
| **API** | HTTPエンドポイント | `src/app/api/worktrees/[id]/tree/` |
| **ビジネスロジック** | ディレクトリ走査、フィルタリング | `src/lib/file-tree.ts` |
| **インフラ** | ファイルシステムアクセス | Node.js `fs` モジュール |

---

## 3. 技術選定

| カテゴリ | 選定技術 | 選定理由 |
|---------|---------|---------|
| **ディレクトリ走査** | Node.js `fs.readdir` | 標準API、追加依存なし |
| **パス検証** | 既存 `path-validator.ts` | セキュリティ実装済み |
| **UIコンポーネント** | React + Tailwind | 既存技術スタック |
| **状態管理** | useState + useCallback | シンプル、既存パターン踏襲 |
| **アイコン** | Heroicons (SVG) | 既存プロジェクトで使用 |

### 3.1 代替案との比較

| 方法 | メリット | デメリット | 採用 |
|------|---------|-----------|------|
| **遅延読み込み** | 初期表示が速い、大規模対応 | 実装複雑性 | ✅ 採用 |
| 全ツリー一括読み込み | 実装シンプル | node_modules等で遅延 | ❌ |
| 仮想スクロール | 大量ファイル対応 | オーバーエンジニアリング | ❌ |

---

## 4. API設計

### 4.1 エンドポイント

#### ディレクトリ一覧取得
```
GET /api/worktrees/:id/tree
GET /api/worktrees/:id/tree/:path*
```

#### リクエスト
```typescript
// パラメータ
interface TreeParams {
  id: string;      // Worktree ID
  path?: string[]; // サブディレクトリパス（オプション）
}

// クエリパラメータ
interface TreeQuery {
  depth?: number;  // 取得深度（デフォルト: 1）
}
```

#### レスポンス
```typescript
interface TreeResponse {
  path: string;           // 現在のパス
  name: string;           // ディレクトリ名
  items: TreeItem[];      // 子アイテム
  parentPath: string | null; // 親パス（ルートの場合null）
}

interface TreeItem {
  name: string;           // ファイル/ディレクトリ名
  type: 'file' | 'directory';
  size?: number;          // ファイルサイズ（ファイルのみ）
  extension?: string;     // 拡張子（ファイルのみ）
  itemCount?: number;     // 子アイテム数（ディレクトリのみ）
}
```

#### レスポンス例
```json
{
  "path": "src",
  "name": "src",
  "parentPath": "",
  "items": [
    {
      "name": "app",
      "type": "directory",
      "itemCount": 5
    },
    {
      "name": "components",
      "type": "directory",
      "itemCount": 12
    },
    {
      "name": "index.ts",
      "type": "file",
      "size": 1234,
      "extension": "ts"
    }
  ]
}
```

### 4.2 エラーレスポンス

| ステータス | 説明 | レスポンス |
|-----------|------|-----------|
| 400 | 不正なパス | `{ "error": "Invalid path" }` |
| 403 | アクセス拒否 | `{ "error": "Access denied" }` |
| 404 | 未検出 | `{ "error": "Directory not found" }` |
| 500 | サーバーエラー | `{ "error": "Failed to read directory" }` |

---

## 5. UIコンポーネント設計

### 5.1 コンポーネント構成

```
FileTreeView (メインコンポーネント)
├── FileTreeHeader (パンくずリスト)
├── FileTreeList (アイテム一覧)
│   ├── FileTreeItem (ディレクトリ)
│   │   └── [再帰的にFileTreeList]
│   └── FileTreeItem (ファイル)
└── FileViewer (モーダル - 既存)
```

### 5.2 コンポーネント詳細

#### FileTreeView
```typescript
interface FileTreeViewProps {
  worktreeId: string;
  initialPath?: string;
  onFileSelect?: (path: string) => void;
  className?: string;
}
```

#### FileTreeItem
```typescript
interface FileTreeItemProps {
  item: TreeItem;
  path: string;
  depth: number;
  isExpanded?: boolean;
  onToggle?: (path: string) => void;
  onFileClick?: (path: string) => void;
}
```

### 5.3 状態管理

```typescript
interface FileTreeState {
  currentPath: string;           // 現在表示中のパス
  expandedPaths: Set<string>;    // 展開中のディレクトリ
  selectedFile: string | null;   // 選択中のファイル
  isLoading: boolean;            // 読み込み中フラグ
  error: string | null;          // エラーメッセージ
  cache: Map<string, TreeItem[]>; // ディレクトリキャッシュ
}
```

### 5.4 UI レイアウト

#### デスクトップ版
```
┌─────────────────────────────────────────┐
│ 📁 src > components > worktree         │ ← パンくずリスト
├─────────────────────────────────────────┤
│ 📁 .. (親ディレクトリ)                   │
│ 📁 error/                         (3)  │
│ 📁 layout/                        (2)  │
│ 📁 mobile/                        (3)  │
│ 📁 ui/                            (4)  │
│ 📄 FileViewer.tsx              2.1 KB  │
│ 📄 HistoryPane.tsx             5.4 KB  │
│ 📄 MessageInput.tsx            1.2 KB  │
└─────────────────────────────────────────┘
```

#### モバイル版
```
┌─────────────────────────────┐
│ ← src/components            │
├─────────────────────────────┤
│ 📁 error/              (3)  │
│ 📁 layout/             (2)  │
│ 📁 mobile/             (3)  │
│ 📁 ui/                 (4)  │
│ 📁 worktree/           (8)  │
│ 📄 FileViewer.tsx   2.1 KB  │
│ 📄 index.ts           156 B │
├─────────────────────────────┤
│ Term│Hist│Logs│Files│Info  │
└─────────────────────────────┘
```

---

## 6. 画面統合設計

### 6.1 モバイル版: Files タブ追加

**採用方式**: ボトムタブバーに Files タブを追加

**理由**:
- Logs タブと同様の閲覧専用機能
- Info タブに統合すると情報過多
- タブ切り替えでアクセスしやすい

#### MobileTab 拡張

```typescript
// 変更前
export type MobileTab = 'terminal' | 'history' | 'logs' | 'info';

// 変更後
export type MobileTab = 'terminal' | 'history' | 'logs' | 'files' | 'info';
```

#### タブ順序

```
Terminal | History | Logs | Files | Info
   ↓         ↓        ↓       ↓      ↓
 メイン    履歴    ログ   ファイル  情報
```

#### モバイル版レイアウト

```
┌─────────────────────────────┐
│ ← src/components            │  ← パンくず（戻る機能付き）
├─────────────────────────────┤
│ 📁 error/              (3)  │
│ 📁 layout/             (2)  │
│ 📁 mobile/             (3)  │
│ 📄 FileViewer.tsx   2.1 KB  │  ← タップでファイル内容表示
│ 📄 index.ts           156 B │
├─────────────────────────────┤
│ Term│Hist│Logs│Files│Info  │  ← ボトムタブバー
└─────────────────────────────┘
```

### 6.2 デスクトップ版: 左ペインタブ切り替え

**採用方式**: History ペインを History/Files のタブ切り替え式に変更

**理由**:
- 既存の2カラムレイアウトを維持
- History と Files は同時に見る必要性が低い
- 実装がシンプル
- Terminal ペインの幅を確保

#### デスクトップ版レイアウト

```
┌─────────────────────────────────────────────────────────┐
│  [←Back]  worktree-name                          [Info] │
├────────────────────────┬────────────────────────────────┤
│ [History] [Files]      │                                │
├────────────────────────┤      Terminal Pane             │
│                        │                                │
│  (選択したタブの内容)    │                                │
│                        │                                │
│  - History 選択時:     │                                │
│    メッセージ履歴表示   │                                │
│                        │                                │
│  - Files 選択時:       │                                │
│    ファイルツリー表示   │                                │
│                        │                                │
├────────────────────────┼────────────────────────────────┤
│                        │  [メッセージ入力]        [送信] │
└────────────────────────┴────────────────────────────────┘
```

#### 左ペインタブの状態管理

```typescript
type LeftPaneTab = 'history' | 'files';

interface LeftPaneState {
  activeTab: LeftPaneTab;
  // Files タブの状態
  currentPath: string;
  expandedPaths: Set<string>;
}
```

### 6.3 統合方式の比較（検討結果）

| 方式 | モバイル | デスクトップ | 採用 |
|------|---------|-------------|------|
| ボトムタブ追加 | ✅ 採用 | - | モバイルのみ |
| 左ペインタブ切り替え | - | ✅ 採用 | デスクトップのみ |
| 3カラム化 | - | ❌ | 画面が狭くなる |
| Info モーダル内 | - | ❌ | ツリー操作が窮屈 |

---

## 7. セキュリティ設計

### 7.1 脅威と対策

| 脅威 | 対策 | 実装 |
|------|------|------|
| **パストラバーサル** | パス検証 | `path-validator.ts` 使用 |
| **機密ファイル露出** | フィルタリング | `.git`, `.env` 除外 |
| **DoS (大量ファイル)** | 制限 | アイテム数上限、遅延読み込み |
| **シンボリックリンク追跡** | 検出・除外 | `lstat` でシンボリックリンク判定 |

### 7.2 除外パターン

```typescript
const EXCLUDED_PATTERNS = [
  '.git',           // Git内部ディレクトリ
  '.env',           // 環境変数ファイル
  '.env.*',         // 環境変数ファイル（派生）
  'node_modules',   // 依存モジュール（表示はするが展開制限）
  '.DS_Store',      // macOSシステムファイル
  'Thumbs.db',      // Windowsシステムファイル
  '*.pem',          // 秘密鍵
  '*.key',          // 秘密鍵
];
```

### 7.3 パス検証フロー

```
リクエストパス
     │
     ▼
┌─────────────────┐
│ URL デコード     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Null バイト検出  │──▶ エラー 400
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ パス正規化       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ ルート内検証     │──▶ エラー 403
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 除外パターン検証  │──▶ エラー 403
└────────┬────────┘
         │
         ▼
    ✅ 許可
```

---

## 8. パフォーマンス設計

### 8.1 最適化戦略

| 戦略 | 実装 | 効果 |
|------|------|------|
| **遅延読み込み** | ディレクトリ展開時に取得 | 初期表示高速化 |
| **クライアントキャッシュ** | Map でディレクトリ内容保持 | 再アクセス高速化 |
| **アイテム数制限** | 1ディレクトリ 500 件上限 | 大規模ディレクトリ対応 |
| **ソート最適化** | サーバー側でソート済み返却 | クライアント負荷軽減 |

### 8.2 表示順序

1. ディレクトリ（名前昇順）
2. ファイル（名前昇順）

### 8.3 制限値

```typescript
const LIMITS = {
  MAX_ITEMS_PER_DIR: 500,    // 1ディレクトリの最大表示数
  MAX_DEPTH: 10,             // 最大ネスト深度
  MAX_FILE_SIZE_PREVIEW: 1024 * 1024, // プレビュー最大サイズ (1MB)
};
```

---

## 9. 実装ファイル一覧

### 9.1 新規作成

| ファイル | 説明 |
|---------|------|
| `src/app/api/worktrees/[id]/tree/route.ts` | ルートディレクトリAPI |
| `src/app/api/worktrees/[id]/tree/[...path]/route.ts` | サブディレクトリAPI |
| `src/lib/file-tree.ts` | ファイルツリービジネスロジック |
| `src/components/worktree/FileTreeView.tsx` | ファイルツリーUIコンポーネント |
| `tests/unit/lib/file-tree.test.ts` | ユニットテスト |
| `tests/integration/api-file-tree.test.ts` | 統合テスト |

### 9.2 変更

| ファイル | 変更内容 |
|---------|---------|
| `src/components/mobile/MobileTabBar.tsx` | Files タブ追加 |
| `src/components/worktree/WorktreeDetailRefactored.tsx` | Files タブ統合 |
| `src/types/models.ts` | TreeItem 型定義追加（必要に応じて） |

---

## 10. テスト計画

### 10.1 ユニットテスト

- `file-tree.ts`
  - ディレクトリ走査
  - 除外パターンフィルタリング
  - ソート処理
  - エラーハンドリング

### 10.2 統合テスト

- API エンドポイント
  - 正常系: ディレクトリ一覧取得
  - 異常系: 不正パス、存在しないパス
  - セキュリティ: パストラバーサル防止

### 10.3 E2E テスト（オプション）

- ファイルツリー表示
- ディレクトリ展開/折りたたみ
- ファイル選択とプレビュー

---

## 11. 実装フェーズ

### Phase 1: API 実装
1. `file-tree.ts` ビジネスロジック
2. `/api/worktrees/:id/tree` API ルート
3. ユニットテスト・統合テスト

### Phase 2: UI コンポーネント
1. `FileTreeView` コンポーネント
2. 既存 `FileViewer` との連携
3. レスポンシブ対応

### Phase 3: 画面統合
1. MobileTab に Files 追加
2. WorktreeDetailRefactored への統合
3. デスクトップ版対応

### Phase 4: 仕上げ
1. パフォーマンス最適化
2. ドキュメント更新
3. 最終テスト

---

## 12. 設計決定事項とトレードオフ

| 決定事項 | 理由 | トレードオフ |
|---------|------|-------------|
| 遅延読み込み採用 | 大規模リポジトリ対応 | 実装複雑性増加 |
| Files タブとして独立 | UX明確化 | タブ数増加 |
| node_modules 表示制限 | パフォーマンス確保 | 完全なツリー表示不可 |
| サーバー側ソート | クライアント負荷軽減 | API レスポンス増加 |

---

## 13. 関連ドキュメント

- [Issue #15](https://github.com/Kewton/MyCodeBranchDesk/issues/15)
- [UI/UX ガイド](../../docs/UI_UX_GUIDE.md)
- [アーキテクチャ](../../docs/architecture.md)

---

**作成日**: 2026-01-07
**作成者**: Claude Code
