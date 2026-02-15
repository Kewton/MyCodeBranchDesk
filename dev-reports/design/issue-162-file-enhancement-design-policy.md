# 設計方針書: Issue #162 ファイル機能強化

## 1. 概要

Issue #162 は以下の3つのファイル操作機能を強化する:

1. **ファイル/ディレクトリの移動** - コンテキストメニューから移動先を選択して移動
2. **ファイルの作成時刻表示** - ファイルツリーにファイルサイズと共に作成時刻を常時表示
3. **ファイル内容のコピー** - FileViewerにコピーボタンを追加し、テキストファイル全文をクリップボードにコピー

---

## 2. アーキテクチャ設計

### 2-1. レイヤー構成（変更箇所）

```
プレゼンテーション層
├── ContextMenu.tsx          ← 「移動」メニュー項目追加
├── FileTreeView.tsx         ← 作成時刻表示追加、onMove コールバック追加
├── FileViewer.tsx           ← コピーボタン追加
├── WorktreeDetailRefactored.tsx ← useFileOperations() フック経由でハンドラー統合
└── MoveDialog.tsx           ← 新規: 移動先ディレクトリ選択ダイアログ

カスタムフック層（MF-002 対応: 新規）
└── useFileOperations.ts     ← 新規: ファイル操作ハンドラー群を集約するカスタムフック

ビジネスロジック層
├── file-operations.ts       ← moveFileOrDirectory() 関数追加、validateFileOperation() ヘルパー追加
├── file-tree.ts             ← readDirectory() で birthtime 取得
└── date-utils.ts            ← 新規: formatRelativeTime() 関数（SF-001 対応）

データモデル層
└── types/models.ts          ← TreeItem に birthtime フィールド追加（CO-001 対応: mtime は初回不要）

APIルート層
└── route.ts (PATCH)         ← action: "move" 対応追加（SF-003 対応: ハンドラーマップ導入検討）
```

### 2-2. データフロー

#### ファイル移動フロー
```
ContextMenu → onMove → WorktreeDetailRefactored
→ useFileOperations().handleMove → MoveDialog（移動先選択）
→ PATCH /api/worktrees/[id]/files/[...path]
→ route.ts (action: "move") → moveFileOrDirectory()
→ validateFileOperation() → fs.rename() → レスポンス → ツリーリフレッシュ
```

#### 作成時刻表示フロー
```
FileTreeView → fetchDirectory → /api/worktrees/[id]/tree/[path]
→ readDirectory() → lstat() → birthtime 取得
→ TreeItem に格納 → TreeNode で表示（formatRelativeTime() 使用）
```

#### ファイル内容コピーフロー
```
FileViewer → コピーボタン click → copyToClipboard(content)
→ アイコン変更フィードバック（Copy → Check、2秒後に復帰）
```

---

## 3. 機能別設計

### 3-1. ファイル/ディレクトリ移動

#### 3-1-0. 共通バリデーションヘルパー: `validateFileOperation()` (MF-001 対応)

**ファイル**: `src/lib/file-operations.ts`

**設計根拠 (MF-001)**: `moveFileOrDirectory()` と `renameFileOrDirectory()` はパス検証、存在チェック、`isPathSafe()` 呼び出し、エラーハンドリングなど大幅に重複するロジックを持つ。DRY原則に従い、共通バリデーションロジックを内部ヘルパー関数に抽出する。

```typescript
/**
 * ファイル操作の共通バリデーションを実行する内部ヘルパー関数
 * moveFileOrDirectory() と renameFileOrDirectory() の共通処理を集約
 *
 * @param worktreeRoot - ワークツリーのルートパス
 * @param sourcePath - 操作対象のソースパス（相対パス）
 * @returns バリデーション結果（成功時は解決済みパス情報、失敗時はエラー結果）
 */
function validateFileOperation(
  worktreeRoot: string,
  sourcePath: string
): { success: true; resolvedSource: string } | { success: false; error: FileOperationResult } {
  // 1. isPathSafe() でソースパスの安全性検証
  // 2. ソースパスの存在チェック (existsSync)
  // 3. パーミッションエラーハンドリング
  // 4. 解決済み絶対パスの返却
}
```

**利用箇所**:
- `moveFileOrDirectory()` - ソースパス検証 + 移動先パス検証
- `renameFileOrDirectory()` - ソースパス検証（既存ロジックをリファクタリング）

**バリデーション処理の責務分担**:
| 処理 | validateFileOperation() | moveFileOrDirectory() | renameFileOrDirectory() |
|------|:-:|:-:|:-:|
| `isPathSafe()` ソース検証 | o | - | - |
| ソースパス存在チェック | o | - | - |
| パーミッションエラーハンドリング | o | - | - |
| 移動先 `isPathSafe()` 検証 | - | o | - |
| **ソースの保護ディレクトリチェック（SEC-S4-004）** | - | o | - |
| 保護ディレクトリチェック（移動先ディレクトリ自体 + 最終パス） | - | o | - |
| 移動先シンボリックリンク検証（SEC-S4-002） | - | o | - |
| 同一パスチェック | - | o | o |
| 自身の子への移動チェック（パスセパレータ付き: SEC-S4-005） | - | o | - |
| 最終移動先パス `isPathSafe()` 検証（SEC-S4-008） | - | o | - |
| 移動先存在チェック + TOCTOU 防御（SEC-S4-001） | - | o | o |

**バリデーション責務の明確化 (SF-S2-003)**: `validateFileOperation()` はソースパスの検証のみを担当する。移動先（destination）パスの検証は各操作関数（`moveFileOrDirectory()` 等）の責務である。`isPathSafe()` は空文字列に対して `false` を返すため、`validateFileOperation()` 経由で空パスも検出される。`moveFileOrDirectory()` は移動先パスに対して別途 `isPathSafe()` を呼び出し、移動先固有のバリデーション（保護ディレクトリチェック、自身の子への移動チェック等）を実行する。

#### 3-1-1. バックエンド: `moveFileOrDirectory()`

**ファイル**: `src/lib/file-operations.ts`

```typescript
export async function moveFileOrDirectory(
  worktreeRoot: string,
  sourcePath: string,
  destinationDir: string
): Promise<FileOperationResult>
```

**返り値の `path` フィールド仕様 (SF-S3-005)**: `FileOperationResult.path` には移動後のファイル/ディレクトリの**ワークツリールートからの相対パス**を設定する。具体的には、`path.join(destinationDir, path.basename(sourcePath))` で算出した相対パスを返す。これにより PATCH API のレスポンスで一貫した相対パスをクライアントに返却できる。

**設計方針**:
- [SEC-001] `isPathSafe()` でソースパス・移動先パスの両方を検証
- [SEC-002] 移動先が保護ディレクトリ（`.git`, `node_modules`等）の場合は拒否
- [SEC-003] 移動先に同名ファイルが既に存在する場合はエラー（上書き防止）
- [SEC-004] ソースと移動先が同じパスの場合はエラー
- [SEC-005] **（SEC-S4-004）** ソースパスが保護ディレクトリ内のファイルである場合は移動を拒否。`deleteFileOrDirectory()` の `isProtectedDirectory(relativePath)` と同等のチェックをソースパスに対して実行する。これにより `.git/config`、`.git/HEAD` 等の重要ファイルの移動を防止する
- [SEC-006] **（SEC-S4-002）** 移動先ディレクトリの解決済みパスを `fs.realpathSync()` で取得し、ワークツリールート内に収まることを `isPathSafe()` で検証する。これによりシンボリックリンクを経由したワークツリー外への書き込みを防止する
- [SEC-007] **（SEC-S4-005）** MOVE_INTO_SELF チェックでは、ソースパスの末尾にパスセパレータを付加してから `startsWith` 判定を行う。具体的には `resolvedDest.startsWith(resolvedSource + path.sep)` とする。これにより `src` ディレクトリを `src-backup/` に移動する場合の誤検出を防止する
- [SEC-008] **（SEC-S4-008）** 最終的な移動先パス（`path.join(destinationDir, path.basename(sourcePath))`）に対しても `isPathSafe()` を実行する。`path.basename()` は通常安全だが、防御的プログラミングとしてエッジケース（ソースファイル名に '..' が含まれる場合等）に備える
- [SEC-009] **（SEC-S4-001）** `existsSync()` による事前チェックは UX 向上のために残しつつ、`fs.rename()` の EEXIST/ENOTEMPTY エラーをキャッチして `FILE_EXISTS` エラーとして返す防御的ハンドリングを追加する。これにより TOCTOU（Time-of-Check to Time-of-Use）競合状態での整合性を担保する
- [DRY-001] `validateFileOperation()` で共通バリデーション処理を再利用（MF-001）
- [DRY-002] `createErrorResult()` を共通利用
- Node.js `fs/promises` の `rename()` を使用（同一ファイルシステム内の移動）

**エラーコード追加**:
- `MOVE_SAME_PATH`: ソースと移動先が同じ
- `MOVE_INTO_SELF`: ディレクトリを自身の子に移動しようとした場合

**`FileOperationErrorCode` 型への追加**:
```typescript
| 'MOVE_SAME_PATH'
| 'MOVE_INTO_SELF'
```

#### 3-1-2. APIルート: PATCH アクション拡張

**ファイル**: `src/app/api/worktrees/[id]/files/[...path]/route.ts`

**変更内容**: 既存の PATCH ハンドラーに `action: "move"` を追加

```typescript
// 既存: action === 'rename' → renameFileOrDirectory()
// 追加: action === 'move' → moveFileOrDirectory()
```

**リクエストボディ（move）**:
```json
{
  "action": "move",
  "destination": "path/to/target/directory"
}
```

**destination パラメータバリデーション (MF-S3-002)**: リクエストボディの `destination` パラメータに対して、既存の `rename` アクションの `newName` バリデーションと同等の型チェック・存在チェックを実施すること。具体的には以下のバリデーションをハンドラー内で実行する:

```typescript
// destination パラメータのバリデーション（rename の newName と同等）
if (!destination || typeof destination !== 'string') {
  return NextResponse.json(
    { error: 'destination is required and must be a string' },
    { status: 400 }
  );
}
```

このバリデーションは `moveFileOrDirectory()` の呼び出し前に PATCH ハンドラー内で実行し、不正な入力がビジネスロジック層に到達しないようにする。

**レスポンス**:
```json
{
  "success": true,
  "path": "path/to/target/directory/filename"
}
```

**レスポンス `path` フィールドの仕様 (SF-S3-005)**: レスポンスの `path` フィールドは、移動後のファイル/ディレクトリの**ワークツリールートからの相対パス**を返す。例えば、`src/utils/helper.ts` を `src/lib/` に移動した場合、`path` は `src/lib/helper.ts` となる。これは既存の `rename` アクションの `renameResult.path`（リネーム後のファイルの相対パス）と一貫した仕様である。

**エラーコードのHTTPステータスマッピング追加**:
```typescript
MOVE_SAME_PATH: 400,
MOVE_INTO_SELF: 400,
```

**不明アクションのエラーメッセージ更新 (SF-S2-002)**: 既存の PATCH ハンドラーは不明アクション受信時に `'Unknown action. Supported: "rename"'` というエラーメッセージを返す。`move` アクション追加に伴い、このメッセージを `'Unknown action. Supported: "rename", "move"'` に更新すること。

**OCP対応に関する方針 (SF-003)**:
現時点ではアクションが `rename` と `move` の2つのみであるため、`switch` 文で実装する。3つ目のアクションが追加される時点で、アクションハンドラーマップ（`Record<string, handler>`）によるディスパッチパターンへのリファクタリングを行う。

```typescript
// 将来のリファクタリング例（3つ目のアクション追加時）:
// const ACTION_HANDLERS: Record<string, (worktree, path, body) => Promise<Result>> = {
//   rename: handleRename,
//   move: handleMove,
//   // 新しいアクション追加時にここに追加するだけ
// };
```

#### 3-1-3. フロントエンド: MoveDialog コンポーネント

**新規ファイル**: `src/components/worktree/MoveDialog.tsx`

**設計方針**:
- [SOLID-SRP] 移動先ディレクトリ選択に特化したコンポーネント
- [KISS] 既存の `Modal` コンポーネントを利用
- ディレクトリ一覧を取得するために既存の tree API (`/api/worktrees/[id]/tree/[path]`) を利用
- ディレクトリのみ表示（クライアント側フィルタ）
- 展開・折りたたみ可能なツリー表示
- 現在のファイルの親ディレクトリはデフォルトで選択状態
- ルートディレクトリ（`""`）も移動先として選択可能

**Props**:
```typescript
interface MoveDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (destinationDir: string) => void;
  worktreeId: string;
  sourcePath: string;
  sourceType: 'file' | 'directory';
}
```

**sourceType Props に関する注記 (CO-003)**: `sourceType` はダイアログの表示テキスト（"Move file" vs "Move directory"）およびバリデーション（ディレクトリの自身の子への移動防止）に使用する。表示テキストのみの用途であれば `sourcePath` からの推論で代替可能だが、バリデーション目的もあるため明示的な Props として維持する。

**ディレクトリフィルタリング方針 (SF-002)**:
初回実装ではクライアント側フィルタリング（tree API から全エントリ取得後、ディレクトリのみ抽出）で実装する。パフォーマンス問題が発生した場合に、tree API にクエリパラメータ `?type=directory` を追加してサーバー側フィルタリングをサポートする。

**ディレクトリ展開時のローディング表示 (SF-S3-003)**: 大規模リポジトリではネストされたディレクトリの展開に複数回の API 呼び出しが必要となり、レイテンシが発生する可能性がある。UX 劣化を防ぐため、ディレクトリ展開時にはローディングインジケーター（スピナー等）を表示すること。展開中のディレクトリノードの横にインラインスピナーを配置するか、またはディレクトリ内のプレースホルダーテキスト（"Loading..."）を表示する。

#### 3-1-4. コンテキストメニュー拡張

**ファイル**: `src/components/worktree/ContextMenu.tsx`

**変更内容**:
- `onMove` コールバックを `ContextMenuProps` に追加
- 「Move」メニュー項目を追加（`FolderInput` アイコン使用、lucide-react）
- ファイル・ディレクトリ両方で表示
- Rename の直後、Delete の前に配置

**ラベル実装方針 (MF-S2-001)**: 既存の ContextMenu.tsx では全てのメニューラベル（'New File', 'New Directory', 'Rename', 'Delete', 'Upload File'）がハードコードされた英語文字列であり、i18n（`useTranslations`）を使用していない。整合性のため、新規追加する「Move」ラベルもハードコードされた英語文字列として実装する。ContextMenu 全体の i18n 対応は本 Issue のスコープ外とし、別途リファクタリング Issue として対応すべきである。

**onMove コールバックの伝播範囲 (SF-S3-002)**: `onMove` コールバックは FileTreeView の Props として受け取り、FileTreeView が ContextMenu コンポーネントに直接渡す。TreeNodeProps への追加は**不要**である。理由: 現在の ContextMenu パターンでは、FileTreeView が ContextMenu に `onUpload` 等のコールバックを直接渡しており（TreeNode を経由しない）、`onMove` も同じパターンに従う。TreeNode は再帰的にレンダリングされるため、不要な props 追加は memo 化されたコンポーネントの再レンダリングに影響する可能性がある。

#### 3-1-5. WorktreeDetailRefactored 統合 (MF-002 対応)

**ファイル**: `src/components/worktree/WorktreeDetailRefactored.tsx`

**設計根拠 (MF-002)**: WorktreeDetailRefactored.tsx は既に2100行を超える巨大コンポーネントである。`handleMove` と `MoveDialog` の状態管理を直接追加するとさらに肥大化し SRP 違反が深刻化する。ファイル操作ハンドラー群をカスタムフック `useFileOperations()` に抽出し、SRP/KISS 原則に準拠させる。

**変更内容**:
- `useFileOperations()` フックの導入（下記 3-1-6 参照）
- 既存の handleNewFile, handleNewDirectory, handleRename, handleDelete, handleUpload を段階的に `useFileOperations()` に移行
- 新規の handleMove は最初から `useFileOperations()` フック内に実装
- `MoveDialog` の状態管理（`moveTarget` state）は `useFileOperations()` フック内で管理
- 移動成功時の Toast 通知とツリーリフレッシュ
- `FileTreeView` と `ContextMenu` への `onMove` コールバック伝播

#### 3-1-6. useFileOperations() カスタムフック (MF-002 対応: 新規)

**新規ファイル**: `src/hooks/useFileOperations.ts`

**設計根拠 (MF-002)**: WorktreeDetailRefactored.tsx の肥大化を防止し、SRP原則に準拠させるため、ファイル操作に関するハンドラー群と状態管理をカスタムフックに集約する。

```typescript
/**
 * ファイル操作ハンドラーと関連状態を管理するカスタムフック
 *
 * @param worktreeId - 対象ワークツリーのID
 * @param onRefresh - ツリーリフレッシュコールバック
 * @returns ファイル操作ハンドラー群と状態
 */
export function useFileOperations(worktreeId: string, onRefresh: () => void) {
  // 状態管理
  // - moveTarget: { path: string; type: 'file' | 'directory' } | null
  // - isMoveDialogOpen: boolean

  // ハンドラー
  // - handleMove(path: string, type: 'file' | 'directory'): void
  // - handleMoveConfirm(destinationDir: string): Promise<void>
  // - handleMoveCancel(): void

  // 将来的に以下も移行
  // - handleNewFile, handleNewDirectory, handleRename, handleDelete, handleUpload

  return {
    moveTarget,
    isMoveDialogOpen,
    handleMove,
    handleMoveConfirm,
    handleMoveCancel,
  };
}
```

**段階的移行方針**:
1. **Phase 1（本Issue）**: `handleMove` + MoveDialog状態管理のみを `useFileOperations()` に配置
2. **Phase 2（将来のリファクタリング）**: 既存の handleNewFile, handleNewDirectory, handleRename, handleDelete, handleUpload を `useFileOperations()` に移行

この段階的アプローチにより、本Issueの変更範囲を最小限に保ちつつ、新規追加分は正しいアーキテクチャパターンに従う。

### 3-2. ファイル作成時刻表示

#### 3-2-1. データモデル拡張

**ファイル**: `src/types/models.ts`

**`TreeItem` インターフェースに追加**:
```typescript
export interface TreeItem {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  extension?: string;
  itemCount?: number;
  /** File creation time (ISO 8601 string) - files only */
  birthtime?: string;
}
```

**設計方針**:
- [COMPAT-001] `birthtime` はオプショナル（後方互換性）
- [PERF-001] ISO 8601 文字列として転送（JSON シリアライズ効率）
- ディレクトリにはオプショナルで設定しない（表示対象はファイルのみ）

**mtime に関する方針 (CO-001)**: YAGNI 原則に従い、初回実装では `birthtime` のみを追加する。`mtime` は UI 表示で使用されず、設計書の表示フォーマット例にも登場しない。`mtime` が必要になった時点（例: ソート機能追加時）に追加する。ただし、`lstat()` から取得するデータであり追加コストが極めて低いため、実装時に開発者の判断で `mtime` も含めることは許容する。

#### 3-2-2. file-tree.ts の変更

**ファイル**: `src/lib/file-tree.ts`

**`readDirectory()` の変更**:
- ファイルの場合、`lstat()` の結果から `birthtime` を取得
- `toISOString()` で文字列に変換して TreeItem に格納

```typescript
if (entryStat.isFile()) {
  const item: TreeItem = {
    name,
    type: 'file',
    size: entryStat.size,
    birthtime: entryStat.birthtime.toISOString(),
  };
  // ...
}
```

#### 3-2-3. FileTreeView の表示変更

**ファイル**: `src/components/worktree/FileTreeView.tsx`

**TreeNode コンポーネントの変更**:
- ファイルサイズの右側に作成時刻を表示
- `formatRelativeTime()` を `src/lib/date-utils.ts` からインポートして使用（SF-001 対応）
- レスポンシブ対応: モバイルでは時刻を非表示にするか短縮表示

**表示フォーマット**:
```
ファイル名                    1.2 KB  2h ago
```

**ツールチップ対応 (CO-002)**: TreeNode で時刻表示する `span` 要素に `title={item.birthtime}` を設定し、ブラウザネイティブのツールチップで正確な日時を表示する。コスト極小で UX 向上に寄与する。

**ロケール取得方針 (MF-S2-002)**: 現在の FileTreeView.tsx は i18n（`useTranslations`, `useLocale`）を一切使用していない。`formatRelativeTime()` の `locale` パラメータに `date-fns` のロケールオブジェクトを渡すため、以下の手順でロケール情報を取得する:

1. `useLocale()` を `next-intl` からインポートして FileTreeView コンポーネントに追加
2. 取得したロケール文字列を `getDateFnsLocale()` （`src/lib/date-locale.ts`）で `date-fns` ロケールオブジェクトに変換
3. TreeNode コンポーネントに `locale` を props として渡すか、TreeNode 内で直接 `useLocale()` を呼び出す

```typescript
// FileTreeView.tsx への追加インポート
import { useLocale } from 'next-intl';
import { getDateFnsLocale } from '@/lib/date-locale';

// コンポーネント内
const locale = useLocale();
const dateFnsLocale = getDateFnsLocale(locale);

// TreeNode での使用
<span className="text-xs text-gray-400" title={item.birthtime}>
  {formatRelativeTime(item.birthtime, dateFnsLocale)}
</span>
```

**設計方針**:
- [PERF-002] `formatRelativeTime()` はメモ化を考慮（レンダリング最適化）
- [UX-001] 相対時間表示で直感的に時系列把握可能
- [UX-002] `title` 属性で正確な日時をツールチップ表示（CO-002）
- [i18n-001] `date-fns` の `formatDistanceToNow` を使用し、`getDateFnsLocale()` でロケール対応
- [i18n-002] `useLocale()` で next-intl からロケール文字列を取得（MF-S2-002）

#### 3-2-4. formatRelativeTime() ユーティリティ (SF-001 対応)

**新規ファイル**: `src/lib/date-utils.ts`

**設計根拠 (SF-001)**: `formatRelativeTime()` を `FileTreeView.tsx` 内のヘルパーとして定義すると、テスタビリティが低下し、将来他のコンポーネントからの再利用が困難になる。既存の `src/lib/date-locale.ts` と同じ日付関連ユーティリティ層に配置することで、DRY 原則に準拠し、ユニットテストも容易になる。

```typescript
/**
 * ISO 8601 文字列を相対時間表示に変換する
 *
 * @param isoString - ISO 8601 形式の日時文字列
 * @param locale - ロケール（date-fns ロケール）
 * @returns "2h ago", "3d ago" 等の相対時間文字列
 */
export function formatRelativeTime(isoString: string, locale?: Locale): string {
  // date-fns の formatDistanceToNow を使用
  // getDateFnsLocale() でロケール対応
}
```

**配置先の選択理由**: 既存の `src/lib/date-locale.ts` への追加も検討したが、`date-locale.ts` は `date-fns` ロケールマッピングに特化した役割のため、新規ファイル `date-utils.ts` に分離する。`date-utils.ts` は `date-locale.ts` の `getDateFnsLocale()` をインポートして使用する。

### 3-3. ファイル内容コピー

#### 3-3-1. FileViewer にコピーボタン追加

**ファイル**: `src/components/worktree/FileViewer.tsx`

**変更内容**:
- テキストファイル表示時（`!content.isImage`）にコピーボタンを追加
- ヘッダー部分（ファイルパス表示エリア）の右側に配置
- 既存の `copyToClipboard()` （`src/lib/clipboard-utils.ts`）を呼び出し
- コピー成功/失敗のフィードバック表示（ボタンのアイコン変更: Copy → Check）

**ボタンUI**:
- アイコン: `Copy` (lucide-react) → 成功時 `Check` (lucide-react)
- サイズ: `w-4 h-4`（既存UIとの整合性）
- 成功後2秒で元のアイコンに戻る

**フィードバック方式の明確化 (SF-S2-004)**: コピー結果のフィードバックはアイコン変更のみ（Copy -> Check）で実装し、Toast 通知は使用しない。理由:
1. FileViewer.tsx は現在 i18n（`useTranslations`）を使用しておらず、Toast テキストのために i18n インフラを追加するのはスコープ過剰
2. アイコン変更のみのフィードバックはテキスト不要で、i18n 対応が不要
3. 失敗時はアイコンを元に戻さない（Check に変わらない）ことで暗黙的にエラーを示す

これに伴い、Section 5-1 の i18n キーから `copySuccess` / `copyFailed` を削除する（アイコンベースのフィードバックには不要）。

**設計方針**:
- [SOLID-SRP] コピー機能はボタンに閉じた実装
- [DRY-001] 既存の `copyToClipboard()` を再利用
- [SEC-001] ANSI エスケープコード除去は `copyToClipboard()` が処理済み
- [UX-002] 画像ファイルにはコピーボタンを表示しない
- [CONSISTENCY-001] アイコンのみのフィードバックで i18n 不要（SF-S2-004）

---

## 4. セキュリティ設計

### 4-1. ファイル移動のセキュリティ

| 脅威 | 対策 | 実装箇所 | レビュー根拠 |
|------|------|----------|-------------|
| ディレクトリトラバーサル | `isPathSafe()` でソース・移動先の両方を検証 | `validateFileOperation()` / `moveFileOrDirectory()` | 既存設計 |
| 保護ディレクトリへの移動 | `isProtectedDirectory()` で移動先ディレクトリ自体および最終パス（移動先 + ファイル名）の両方を検証（SF-S2-005） | `moveFileOrDirectory()` | 既存設計 |
| **保護ディレクトリからの移動出し** | ソースパスに対して `isProtectedDirectory()` チェックを適用し、保護ディレクトリ内ファイル（`.git/config`, `.git/HEAD` 等）の移動を禁止。`deleteFileOrDirectory()` の既存パターンと整合 | `moveFileOrDirectory()` | **SEC-S4-004 (must-fix)** |
| 自身の子への移動 | ソースパスの末尾にパスセパレータ `path.sep` を付加してから `startsWith` 判定。`resolvedDest.startsWith(resolvedSource + path.sep)` で誤検出を防止 | `moveFileOrDirectory()` | **SEC-S4-005 (should-fix)** |
| 既存ファイルの上書き（TOCTOU 防御） | `existsSync()` による事前チェック（UX向上）に加え、`fs.rename()` の EEXIST/ENOTEMPTY エラーをキャッチして `FILE_EXISTS` エラーとして返す防御的ハンドリング | `moveFileOrDirectory()` | **SEC-S4-001 (should-fix)** |
| **シンボリックリンクを経由したワークツリー外書き込み** | 移動先ディレクトリの解決済みパスを `fs.realpathSync()` で取得し、`isPathSafe()` でワークツリールート内に収まることを検証。`readDirectory()` のシンボリックリンクスキップはファイルツリー表示時のみであり、`moveFileOrDirectory()` の移動先パスには適用されないため、別途検証が必要 | `moveFileOrDirectory()` | **SEC-S4-002 (should-fix)** |
| **最終移動先パスの安全性** | 最終的な移動先パス（`path.join(destinationDir, path.basename(sourcePath))`）に対しても `isPathSafe()` を実行。防御的プログラミングとしてエッジケースに備える | `moveFileOrDirectory()` | **SEC-S4-008 (should-fix)** |
| パス情報の漏洩 | エラーレスポンスに絶対パスを含めない | `createErrorResult()` 既存パターン | 既存設計 |

### 4-2. 作成時刻表示のセキュリティ

- 追加リスクなし（既に `lstat()` で取得している `stat` 情報の拡張のみ）

### 4-3. ファイル内容コピーのセキュリティ

- ANSI エスケープコード除去は既存の `copyToClipboard()` で対応済み
- クリップボードAPIはブラウザのセキュリティコンテキストで保護されている

---

## 5. i18n 対応

### 5-1. 追加翻訳キー

**配置先変更 (SF-004)**: ファイル操作固有の翻訳キーは `common.json`（汎用キー: cancel, confirm, delete 等を格納）ではなく、`worktree.json`（worktree 機能の翻訳を担当）に配置する。既存の名前空間の一貫性を維持するため。

**ContextMenu ラベルに関する方針 (MF-S2-001)**: ContextMenu.tsx の既存ラベル（'New File', 'New Directory', 'Rename', 'Delete', 'Upload File'）は全てハードコードされた英語文字列であり、i18n を使用していない。そのため、「Move」ラベルも i18n キーとしては定義せず、ハードコードで実装する。以下の `worktree.json` の `fileTree` セクションには ContextMenu のラベルキーを含めない。ContextMenu 全体の i18n 対応は別途リファクタリング Issue で対応する。

**エラーメッセージの配置先 (SF-S2-001)**: 既存のファイル操作エラーメッセージ（`failedToCreateFile`, `failedToCreateDirectory`, `failedToRename`, `failedToDelete`）は `error.json` の `fileOps` セクションに配置されている。整合性のため、移動失敗メッセージも `error.json` の `fileOps` セクションに配置する（`worktree.json` ではない）。

**コピーフィードバックに関する方針 (SF-S2-004)**: FileViewer のコピーフィードバックはアイコン変更のみ（Copy -> Check）で実装するため、`copySuccess` / `copyFailed` の i18n キーは不要。削除する。`copyContent` キーについても、FileViewer.tsx が現在 i18n を使用していないため削除する。コピーボタンはアイコンのみ（テキストなし）で実装する。

**Cancel ボタンの DRY 対応 (CO-S2-004)**: MoveDialog のキャンセルボタンには既存の `common.json` の `cancel` キーを使用する（`tCommon('cancel')`）。`fileTree.moveCancel` キーは重複となるため追加しない。

**`locales/en/worktree.json`** に `fileTree` セクションを追加:
```json
{
  "fileTree": {
    "moveTo": "Move to...",
    "moveDialogTitle": "Select destination",
    "moveConfirm": "Move here",
    "moveSuccess": "Moved successfully",
    "timeAgo": "{time} ago",
    "rootDirectory": "Root"
  }
}
```

**`locales/ja/worktree.json`** に `fileTree` セクションを追加:
```json
{
  "fileTree": {
    "moveTo": "移動先を選択...",
    "moveDialogTitle": "移動先を選択",
    "moveConfirm": "ここに移動",
    "moveSuccess": "移動しました",
    "timeAgo": "{time}前",
    "rootDirectory": "ルート"
  }
}
```

**`locales/en/error.json`** の `fileOps` セクションに追加:
```json
{
  "fileOps": {
    "failedToMove": "Failed to move"
  }
}
```

**`locales/ja/error.json`** の `fileOps` セクションに追加:
```json
{
  "fileOps": {
    "failedToMove": "移動に失敗しました"
  }
}
```

**i18n 使用時の名前空間指定**: MoveDialog コンポーネントからは `useTranslations('worktree')` で `t('fileTree.moveTo')` 等にアクセスし、キャンセルボタンは `useTranslations('common')` で `tCommon('cancel')` を使用する。エラーメッセージは `useTranslations('error')` で `tError('fileOps.failedToMove')` にアクセスする。

---

## 6. テスト戦略

### 6-1. ユニットテスト

| テスト対象 | テスト内容 | ファイル |
|-----------|-----------|---------|
| `validateFileOperation()` | パス検証、存在チェック、パーミッションエラー（MF-001） | `tests/unit/lib/file-operations-validate.test.ts` |
| `moveFileOrDirectory()` | 正常移動、保護ディレクトリ拒否、同一パスエラー、自身の子への移動防止、既存ファイル上書き防止 | `tests/unit/lib/file-operations-move.test.ts` |
| PATCH route (move) | action: move のリクエスト処理、バリデーション、エラーレスポンス | `tests/unit/api/files-route-move.test.ts` |
| `readDirectory()` birthtime | 時刻情報の取得と形式 | `tests/unit/lib/file-tree-timestamps.test.ts` |
| `formatRelativeTime()` | 各種時間差の表示フォーマット、ロケール対応（SF-001） | `tests/unit/lib/date-utils.test.ts` |
| `TreeItem` 型 | birthtime フィールドの後方互換性 | 型チェック（tsc --noEmit） |

### 6-2. テスト方針

- [TDD] Red-Green-Refactor サイクルで実装
- バックエンド関数は実際のファイルシステム操作を含むため、`tmp` ディレクトリを使用したテスト
- フロントエンドコンポーネントはユニットテストの対象外（既存パターンに準拠）
- `validateFileOperation()` は独立した関数として単体テスト可能（MF-001 によるテスタビリティ向上）
- `formatRelativeTime()` は独立したユーティリティとして単体テスト可能（SF-001 によるテスタビリティ向上）

### 6-3. 回帰テスト戦略 (MF-S3-001)

`renameFileOrDirectory()` を `validateFileOperation()` を使用するようリファクタリングする際、既存の `tests/unit/lib/file-operations.test.ts` に含まれる `renameFileOrDirectory()` のテストケースに対して以下の回帰テスト要件を満たすこと:

1. **既存テスト全件パス**: リファクタリング後に `tests/unit/lib/file-operations.test.ts` 内の `renameFileOrDirectory()` 関連テストが全てパスすること
2. **動作互換性確認**: `validateFileOperation()` の導入により、`renameFileOrDirectory()` の外部動作（入力・出力・エラーコード・エラーメッセージ）が変更されないこと
3. **テスト実行順序**: リファクタリング前に既存テストが全てパスすることを確認し、リファクタリング後に再度全てパスすることを確認する
4. **影響ファイル**: `src/lib/file-operations.ts` の変更後、`tests/unit/lib/file-operations.test.ts` を必ず実行すること

### 6-4. カスタムフックのテスト方針 (SF-S3-004)

`useFileOperations.ts` カスタムフックのテストについて:

**方針**: 本 Issue ではカスタムフックのユニットテストを**テスト対象外**とする。

**理由**:
1. プロジェクトの既存パターンとして、フロントエンドコンポーネントおよびカスタムフックはユニットテストの対象外（Section 6-2）
2. `useFileOperations()` の主要ロジック（API 呼び出し、エラーハンドリング）のうち、バックエンド側のロジックは `moveFileOrDirectory()` および PATCH route のテストでカバーされる
3. `handleMoveConfirm()` の API 呼び出しロジックは fetch ラッパーであり、複雑なビジネスロジックを含まない

**将来的な検討**: `useFileOperations()` に複雑なロジック（キャッシュ制御、楽観的更新、リトライ等）が追加される場合は、`tests/unit/hooks/useFileOperations.test.ts` の追加を検討する。

---

## 7. パフォーマンス考慮

| 項目 | 影響 | 対策 |
|------|------|------|
| TreeItem への birthtime 追加 | JSON ペイロードサイズ微増 | ISO文字列で最小化（~24bytes/item） |
| `lstat()` の追加情報 | なし（既に呼び出し済みの stat から取得） | 追加I/Oなし |
| 移動ダイアログのディレクトリ取得 | 追加API呼び出し | 既存tree APIを再利用、キャッシュ活用。将来的に `?type=directory` サーバー側フィルタ追加可能（SF-002） |
| `formatDistanceToNow` の呼び出し | レンダリング負荷 | `useMemo` でメモ化検討 |

---

## 8. 設計上の決定事項とトレードオフ

| 決定事項 | 理由 | トレードオフ |
|---------|------|-------------|
| `fs.rename()` で移動 | シンプル、アトミック | 異なるファイルシステム間での移動は非対応（Worktree内移動のみなので問題なし）。Docker ボリュームマウントやシンボリックリンク介在時に EXDEV エラーの可能性あり（CO-S3-004）。EXDEV エラー時はわかりやすいエラーメッセージを返すことを検討 |
| 相対時間表示 + `title` 属性ツールチップ | 時系列把握が直感的 + 正確な日時も確認可能（CO-002） | `title` 属性のツールチップはモバイルで利用不可 |
| ISO 8601文字列でAPI転送 | JSONシリアライズ互換 | クライアント側でのパース処理が必要 |
| MoveDialog を新規コンポーネント | SRP準拠、再利用性 | ファイル数増加 |
| コピーボタンは FileViewer 内に配置 | 既存UIとの整合性 | コンテキストメニューからのコピーは別途対応必要（今回スコープ外） |
| `validateFileOperation()` ヘルパー抽出 | DRY準拠、テスタビリティ向上（MF-001） | 関数呼び出しの間接レベルが1段増加 |
| `useFileOperations()` フック導入 | SRP準拠、コンポーネント肥大化防止（MF-002） | 段階的移行が必要（Phase 1/2） |
| `formatRelativeTime()` を `date-utils.ts` に配置 | DRY準拠、テスタビリティ向上（SF-001） | ファイル数増加 |
| i18n キーを `worktree.json` に配置 | 名前空間一貫性（SF-004） | コンポーネントの `useTranslations` 引数が変わる |
| 初回は `birthtime` のみ追加 | YAGNI原則（CO-001） | `mtime` が必要な場合に追加実装が必要 |
| PATCH ハンドラーは `switch` 文 | 現時点では2アクションのみ（SF-003） | 3つ目のアクション追加時にリファクタリング必要 |
| ContextMenu 「Move」ラベルをハードコード | 既存ラベルが全てハードコード英語（MF-S2-001） | ContextMenu 全体の i18n は別 Issue で対応が必要 |
| FileTreeView に `useLocale()` を追加 | `formatRelativeTime()` に date-fns ロケールが必要（MF-S2-002） | FileTreeView に新たな next-intl 依存を追加 |
| Move エラーメッセージを `error.json` に配置 | 既存の fileOps エラーパターンとの整合（SF-S2-001） | 名前空間が worktree と error に分散 |
| コピーフィードバックはアイコンのみ | FileViewer に i18n 未使用、Toast 不要（SF-S2-004） | テキストによるエラー詳細表示ができない |
| MoveDialog のキャンセルに `common.cancel` を使用 | DRY 原則、既存キー再利用（CO-S2-004） | MoveDialog が common 名前空間にも依存 |

---

## 9. 実装対象ファイル一覧

| ファイル | 変更種別 | 内容 |
|---------|---------|------|
| `src/types/models.ts` | 修正 | TreeItem に birthtime 追加 |
| `src/lib/file-operations.ts` | 修正 | validateFileOperation() ヘルパー追加、moveFileOrDirectory() 追加、エラーコード追加、renameFileOrDirectory() リファクタリング |
| `src/lib/file-tree.ts` | 修正 | readDirectory() で birthtime 取得 |
| `src/lib/date-utils.ts` | 新規 | formatRelativeTime() ユーティリティ |
| `src/hooks/useFileOperations.ts` | 新規 | ファイル操作ハンドラー集約フック |
| `src/app/api/worktrees/[id]/files/[...path]/route.ts` | 修正 | PATCH に action:"move" 追加 |
| `src/components/worktree/ContextMenu.tsx` | 修正 | 「Move」メニュー項目追加 |
| `src/components/worktree/FileTreeView.tsx` | 修正 | 作成時刻表示追加（title属性含む）、onMove prop 追加 |
| `src/components/worktree/FileViewer.tsx` | 修正 | コピーボタン追加 |
| `src/components/worktree/MoveDialog.tsx` | 新規 | 移動先ディレクトリ選択ダイアログ |
| `src/components/worktree/WorktreeDetailRefactored.tsx` | 修正 | useFileOperations() フック統合 |
| `locales/en/worktree.json` | 修正 | fileTree 翻訳キー追加（UI ラベルのみ、エラーメッセージは error.json） |
| `locales/ja/worktree.json` | 修正 | fileTree 翻訳キー追加（UI ラベルのみ、エラーメッセージは error.json） |
| `locales/en/error.json` | 修正 | fileOps.failedToMove 追加（SF-S2-001） |
| `locales/ja/error.json` | 修正 | fileOps.failedToMove 追加（SF-S2-001） |
| `tests/unit/lib/file-operations-validate.test.ts` | 新規 | validateFileOperation テスト |
| `tests/unit/lib/file-operations-move.test.ts` | 新規 | moveFileOrDirectory テスト |
| `tests/unit/lib/file-tree-timestamps.test.ts` | 新規 | birthtime テスト |
| `tests/unit/lib/date-utils.test.ts` | 新規 | formatRelativeTime テスト |
| `tests/unit/api/files-route-move.test.ts` | 新規 | PATCH move API テスト |

### 9-1. 間接影響ファイル (SF-S3-001)

以下のファイルは直接変更しないが、本 Issue の変更により間接的な影響を受ける可能性がある。実装時に動作確認を行うこと。

| ファイル | 影響内容 | リスク |
|---------|---------|-------|
| `src/hooks/useFileSearch.ts` | `TreeItem` 型を import して `filterByName` 関数で使用。`birthtime?: string` のオプショナルフィールド追加により型が変更されるが、`name`/`type` フィールドのみ参照しているため実質的な影響なし | low |
| `src/hooks/useContextMenu.ts` | `ContextMenuState` 型を使用しているが変更なし | none |
| `src/app/api/worktrees/[id]/tree/route.ts` | `readDirectory()` の戻り値に `birthtime` が含まれるようになるが、`JSON.stringify` で自動シリアライズされるため変更不要 | none |
| `src/app/api/worktrees/[id]/tree/[...path]/route.ts` | 同上 | none |
| `tests/unit/lib/file-operations.test.ts` | `renameFileOrDirectory()` リファクタリングにより既存テストケースへの回帰影響（MF-S3-001 で対応） | medium |

---

## 10. 制約条件

- CLAUDE.md の SOLID / KISS / YAGNI / DRY 原則に準拠
- TypeScript strict モード
- 既存テストをすべてパスすること
- ESLint エラー 0件
- i18n 対応 (en/ja)
- **ローカル環境前提（SEC-S4-006）**: 本ツールはローカル開発環境での使用を前提としており、全 API ルート（GET, PUT, POST, DELETE, PATCH）に認証・認可メカニズムは実装されていない。ファイル移動操作（move）は破壊的な副作用を持つため、ネットワーク公開時には認証メカニズムの追加が必須である。これは本 Issue のスコープ外だが、将来のセキュリティ改善として記録する

---

## 11. レビュー履歴

| レビュー日 | ステージ | レビュー種別 | スコア | ステータス |
|-----------|---------|-------------|--------|-----------|
| 2026-02-15 | Stage 1 | 通常レビュー（設計原則） | 4/5 | 条件付き承認 |
| 2026-02-15 | Stage 2 | 整合性レビュー | 4/5 | 条件付き承認 |
| 2026-02-15 | Stage 3 | 影響分析レビュー | 4/5 | 条件付き承認 |
| 2026-02-15 | Stage 4 | セキュリティレビュー（OWASP Top 10 2021） | 4/5 | 条件付き承認 |

---

## 12. レビュー指摘事項サマリー

### Stage 1: 通常レビュー（設計原則）

#### Must Fix（必須修正）

| ID | 原則 | タイトル | 対応内容 | 反映セクション |
|----|------|---------|---------|---------------|
| MF-001 | DRY | moveFileOrDirectory() と renameFileOrDirectory() のコード重複 | `validateFileOperation()` 共通バリデーションヘルパーを設計に追加 | 3-1-0, 3-1-1, 6-1, 8, 9 |
| MF-002 | SRP/KISS | WorktreeDetailRefactored への handleMove 追加による肥大化 | `useFileOperations()` カスタムフックを設計に追加、段階的移行方針策定 | 2-1, 3-1-5, 3-1-6, 8, 9 |

#### Should Fix（推奨修正）

| ID | 原則 | タイトル | 対応内容 | 反映セクション |
|----|------|---------|---------|---------------|
| SF-001 | DRY | formatRelativeTime() が FileTreeView 内に定義される設計 | `src/lib/date-utils.ts` に配置変更、テストファイル追加 | 2-1, 3-2-3, 3-2-4(新規), 6-1, 8, 9 |
| SF-002 | KISS | MoveDialog のディレクトリツリー取得が tree API を再利用する設計の複雑さ | クライアント側フィルタで初回実装、将来の `?type=directory` パラメータ追加を注記 | 3-1-3, 7 |
| SF-003 | OCP | PATCH ハンドラーの action 分岐が if/else チェーンになる可能性 | 現時点は switch 文、3つ目のアクション追加時にハンドラーマップへリファクタリングする方針を明記 | 3-1-2, 8 |
| SF-004 | DRY | i18n キーの名前空間配置 | `common.json` から `worktree.json` に配置先変更 | 5-1, 8, 9 |

#### Consider（検討事項）

| ID | 原則 | タイトル | 対応内容 | 反映セクション |
|----|------|---------|---------|---------------|
| CO-001 | YAGNI | mtime フィールドの必要性 | 初回は birthtime のみ追加、mtime は必要時に追加する方針を明記 | 2-1, 3-2-1, 3-2-2, 8 |
| CO-002 | KISS | ツールチップによる正確な日時表示の将来対応 | `title` 属性でブラウザネイティブツールチップを設定する設計を追加 | 3-2-3, 8 |
| CO-003 | ISP | MoveDialogProps の sourceType パラメータ | バリデーション目的で維持する理由を注記 | 3-1-3 |

#### Compliant（準拠済み）

| ID | 原則 | タイトル |
|----|------|---------|
| CP-001 | SRP | MoveDialog を独立コンポーネントとして設計 |
| CP-002 | DRY | 既存の copyToClipboard() 再利用 |
| CP-003 | DRY | createErrorResult() の共通利用 |
| CP-004 | KISS | fs.rename() による移動実装 |
| CP-005 | Security Design | MOVE_INTO_SELF エラーコードの追加 |
| CP-006 | Backward Compatibility | TreeItem の birthtime をオプショナルフィールドとして追加 |
| CP-007 | DRY / Consistency | 既存の ERROR_CODE_TO_HTTP_STATUS マップへの追加 |
| CP-008 | Consistency | 既存の PATCH API パターンへの統合 |

### Stage 2: 整合性レビュー

#### Must Fix（必須修正）

| ID | カテゴリ | タイトル | 対応内容 | 反映セクション |
|----|---------|---------|---------|---------------|
| MF-S2-001 | i18n-consistency | ContextMenu ラベルがハードコードされた英語だが設計は i18n を想定 | 「Move」ラベルもハードコード英語で実装し、既存パターンと整合させる。ContextMenu 全体の i18n は別 Issue で対応 | 3-1-4, 5-1, 13 |
| MF-S2-002 | i18n-consistency | FileTreeView に i18n 未使用 - locale パラメータ取得方法が未定義 | `useLocale()` を next-intl からインポートし、`getDateFnsLocale()` で date-fns ロケールに変換する方針を明記 | 3-2-3, 13 |

#### Should Fix（推奨修正）

| ID | カテゴリ | タイトル | 対応内容 | 反映セクション |
|----|---------|---------|---------|---------------|
| SF-S2-001 | error-handling-consistency | Move エラーメッセージは error.json パターンに従うべき | `failedToMove` を `error.json` の `fileOps` セクションに配置。UI ラベルのみ `worktree.json` に配置 | 5-1, 13 |
| SF-S2-002 | api-consistency | PATCH ハンドラーの不明アクションエラーメッセージにサポート済みアクション一覧を反映 | エラーメッセージを `'Supported: "rename", "move"'` に更新する旨を明記 | 3-1-2, 13 |
| SF-S2-003 | validation-consistency | validateFileOperation() のパス検証責務の明確化 | ソースパスのみを検証する責務であることを明記。移動先パス検証は moveFileOrDirectory() の責務 | 3-1-0, 13 |
| SF-S2-004 | component-consistency | FileViewer コピーボタンのフィードバック方式と i18n の整合 | アイコン変更のみ（Toast 不使用）に明確化。copySuccess/copyFailed i18n キーを削除 | 3-3-1, 5-1, 13 |
| SF-S2-005 | security-consistency | Move 移動先の isProtectedDirectory() チェック詳細化 | 移動先ディレクトリ自体と最終パス（移動先 + ファイル名）の両方をチェックすることを明記 | 3-1-0, 4-1, 13 |

#### Consider（検討事項）

| ID | カテゴリ | タイトル | 対応内容 | 反映セクション |
|----|---------|---------|---------|---------------|
| CO-S2-001 | pattern-consistency | 既存ファイル操作が window.prompt/alert 使用だが MoveDialog は Modal/Toast | Phase 2（useFileOperations()フック）で既存ハンドラーも Dialog/Toast パターンに移行予定。現時点では不整合を許容 | 3-1-6（既存の段階的移行方針で対応済み） |
| CO-S2-002 | api-consistency | PATCH move の 'destination' と rename の 'newName' フィールド名の違い | セマンティクスが異なるため適切。変更不要 | - |
| CO-S2-003 | date-formatting-consistency | WorktreeCard.tsx のインライン formatDistanceToNow との重複 | 将来の DRY 改善として文書化。本 Issue のスコープ外 | 3-2-4（既存の設計根拠で対応済み） |
| CO-S2-004 | i18n-consistency | fileTree.moveCancel が common.json の cancel キーと重複 | `tCommon('cancel')` を使用し、`fileTree.moveCancel` キーを削除 | 5-1 |

#### Compliant（準拠済み）

| ID | カテゴリ | タイトル |
|----|---------|---------|
| CP-S2-001 | api-pattern | PATCH アクションディスパッチパターンが既存 route.ts 構造に合致 |
| CP-S2-002 | error-code-pattern | ERROR_CODE_TO_HTTP_STATUS マップ拡張が既存パターンに準拠 |
| CP-S2-003 | file-operation-pattern | moveFileOrDirectory() の関数シグネチャが既存パターンに準拠 |
| CP-S2-004 | security-pattern | isPathSafe() のソース・移動先両方への適用が防御的プログラミングに準拠 |
| CP-S2-005 | component-pattern | MoveDialog が既存 Modal コンポーネントを使用 |
| CP-S2-006 | hook-pattern | useFileOperations() が既存カスタムフック命名・配置規約に準拠 |
| CP-S2-007 | data-model-pattern | TreeItem birthtime オプショナルフィールドが後方互換パターンに準拠 |
| CP-S2-008 | utility-pattern | date-utils.ts の src/lib/ 配置が既存ユーティリティモジュールパターンに準拠 |
| CP-S2-009 | clipboard-pattern | 既存 copyToClipboard() の再利用 |
| CP-S2-010 | fs-pattern | lstat() での birthtime 取得が既存 readDirectory() パターンに準拠 |
| CP-S2-011 | context-menu-pattern | ContextMenu onMove コールバックが既存オプショナルコールバックパターンに準拠 |
| CP-S2-012 | error-result-pattern | createErrorResult() の再利用が DRY パターンに準拠 |

### Stage 3: 影響分析レビュー

#### Must Fix（必須修正）

| ID | カテゴリ | タイトル | 対応内容 | 反映セクション |
|----|---------|---------|---------|---------------|
| MF-S3-001 | ripple-effect | renameFileOrDirectory() リファクタリングが既存テストに影響する | 回帰テスト戦略を追加し、リファクタリング後に既存テストが全てパスすることを確認する要件を明記 | 6-3, 9-1, 13 |
| MF-S3-002 | api-contract | PATCH API の action パラメータ 'move' 追加時の destination バリデーション欠如 | `destination` パラメータの存在チェックと型チェック（`!destination \|\| typeof destination !== 'string'`）を PATCH ハンドラー内で実行する仕様を明記 | 3-1-2, 13 |

#### Should Fix（推奨修正）

| ID | カテゴリ | タイトル | 対応内容 | 反映セクション |
|----|---------|---------|---------|---------------|
| SF-S3-001 | backward-compatibility | useFileSearch フックの TreeItem 依存への影響確認 | `useFileSearch.ts` を間接影響ファイル一覧に追加。`name`/`type` フィールドのみ参照のため実質的な影響なし | 9-1 |
| SF-S3-002 | ripple-effect | FileTreeView の TreeNodeProps に onMove callback を追加する影響 | `onMove` は ContextMenu 経由で処理されるため TreeNodeProps への追加は不要であることを明確化 | 3-1-4 |
| SF-S3-003 | performance | MoveDialog のディレクトリツリー取得が大規模リポジトリで遅延する可能性 | ディレクトリ展開時のローディングインジケーター表示を MoveDialog の仕様に追加 | 3-1-3, 13 |
| SF-S3-004 | testing-coverage | useFileOperations フックのテスト戦略が未定義 | カスタムフックのテスト方針セクションを追加。既存パターンに合わせてテスト対象外とし、その理由を明記 | 6-4 |
| SF-S3-005 | api-contract | move 操作のレスポンスに path フィールドの内容が不明確 | `moveFileOrDirectory()` の返り値および PATCH API レスポンスの `path` が移動後のファイルの相対パスであることを明記 | 3-1-1, 3-1-2 |

#### Consider（検討事項）

| ID | カテゴリ | タイトル | 対応内容 | 反映セクション |
|----|---------|---------|---------|---------------|
| CO-S3-001 | backward-compatibility | TreeResponse の API レスポンスサイズ増加 | 約 24 バイト/エントリの増加。Section 7 で言及済み。現時点では対応不要 | - |
| CO-S3-002 | ripple-effect | WorktreeCard.tsx の formatDistanceToNow と date-utils.ts の重複 | CO-S2-003 で文書化済み。本 Issue のスコープ外 | - |
| CO-S3-003 | database-migration | データベーススキーマへの影響なし | TreeItem は API レスポンスの型であり DB テーブルとは独立。マイグレーション不要 | - |
| CO-S3-004 | edge-case | fs.rename() のクロスデバイス移動制限 | Worktree 内移動のみのため通常問題なし。EXDEV エラー時のわかりやすいエラーメッセージを検討 | 8 |
| CO-S3-005 | edge-case | macOS/Linux での birthtime の信頼性 | オプショナルフィールドのため取得失敗時は undefined。現状維持で可 | - |

#### Compliant（準拠済み）

| ID | カテゴリ | タイトル |
|----|---------|---------|
| CP-S3-001 | backward-compatibility | TreeItem の birthtime オプショナル追加は後方互換 |
| CP-S3-002 | api-contract | PATCH API の action 拡張は後方互換 |
| CP-S3-003 | api-contract | tree API のレスポンス構造は後方互換 |
| CP-S3-004 | backward-compatibility | ContextMenu の onMove prop はオプショナル |
| CP-S3-005 | backward-compatibility | FileViewer のコピーボタンは UI 追加のみ |
| CP-S3-006 | backward-compatibility | i18n キー追加は既存キーに影響なし |
| CP-S3-007 | backward-compatibility | FileOperationErrorCode の型拡張は後方互換 |
| CP-S3-008 | backward-compatibility | ERROR_CODE_TO_HTTP_STATUS マップ拡張は後方互換 |
| CP-S3-009 | backward-compatibility | FileTreeViewProps への onMove 追加はオプショナル |
| CP-S3-010 | dependency | date-fns と next-intl の依存関係は既存 |

### Stage 4: セキュリティレビュー（OWASP Top 10 2021）

**全体スコア**: 4/5（条件付き承認）
**全体リスク**: medium
**リスク根拠**: ファイル移動操作は破壊的な副作用（元の場所からファイルが消失する）を持つため、削除操作と同等のセキュリティ考慮が必要。ローカル開発環境での使用前提のため実質的なリスクは中程度。

#### Must Fix（必須修正）

| ID | OWASP | タイトル | 対応内容 | 反映セクション |
|----|-------|---------|---------|---------------|
| SEC-S4-004 | A04:2021 | moveFileOrDirectory() のソースパスに対する保護ディレクトリチェックが欠如 | ソースパスに対する `isProtectedDirectory()` チェックを追加。`.git/config` や `.git/HEAD` 等の重要ファイルの移動を防止。`deleteFileOrDirectory()` の既存パターンと整合させる。バリデーション責務分担表に「ソースの保護ディレクトリチェック」行を追加 | 3-1-0, 3-1-1, 4-1, 13 |

#### Should Fix（推奨修正）

| ID | OWASP | タイトル | 対応内容 | 反映セクション |
|----|-------|---------|---------|---------------|
| SEC-S4-001 | A01:2021 | moveFileOrDirectory() に TOCTOU 競合状態が存在する | `fs.rename()` の EEXIST/ENOTEMPTY エラーをキャッチして `FILE_EXISTS` エラーとして返す防御的ハンドリングを追加。`existsSync()` は事前チェックとして残しつつ、rename() のエラーハンドリングで最終的な整合性を担保 | 3-1-0, 3-1-1, 4-1, 13 |
| SEC-S4-002 | A01:2021 | 移動先パスに対するシンボリックリンク検証が未設計 | `moveFileOrDirectory()` 内で移動先ディレクトリの解決済みパス（`fs.realpathSync`）を取得し、`isPathSafe()` でワークツリールート内に収まることを検証。`readDirectory()` のシンボリックリンクスキップは表示時のみで移動先検証には不十分 | 3-1-0, 3-1-1, 4-1, 13 |
| SEC-S4-005 | A04:2021 | MOVE_INTO_SELF チェックのプレフィックス判定にパスセパレータが不足する可能性 | `resolvedDest.startsWith(resolvedSource + path.sep)` でパスセパレータを付加してから判定。`src` を `src-backup/` に移動する場合の誤検出を防止 | 3-1-1, 4-1, 13 |
| SEC-S4-006 | A05:2021 | API 認証・認可メカニズムが存在しない（既存課題） | ローカル環境前提であること、ネットワーク公開時には認証メカニズムの追加が必要である旨を制約条件セクションに明記。本 Issue のスコープ外 | 10, 13 |
| SEC-S4-008 | A08:2021 | 移動先の最終パスに対する isPathSafe() 検証が明示的に設計されていない | 最終的な移動先パス（`path.join(destinationDir, path.basename(sourcePath))`）に対する `isPathSafe()` 検証を明示的に追加。防御的プログラミングとしてエッジケースに備える | 3-1-0, 3-1-1, 4-1, 13 |

#### Optional（将来検討）

| ID | OWASP | タイトル | 対応内容 | 反映セクション |
|----|-------|---------|---------|---------------|
| SEC-S4-003 | A01:2021 | 保護ディレクトリからの移動出し（exfiltration）防止が未設計 | SEC-S4-004 でソースパスの保護ディレクトリチェックを追加することで対応済み。SEC-S4-004 の対応範囲に包含される | - |
| SEC-S4-007 | A05:2021 | console.error によるサーバー側エラーログにスタックトレースが含まれる可能性 | 将来的に `api-logger.ts` の `withLogging()` パターンを使用してログの構造化を検討。本 Issue のスコープ外 | - |
| SEC-S4-009 | A09:2021 | ファイル移動操作のセキュリティログが未設計 | 将来の改善として、CLIモジュールの `security-logger.ts` パターンをAPI層にも展開することを検討。本 Issue のスコープ外 | - |

#### Compliant（準拠済み）

| ID | OWASP | タイトル |
|----|-------|---------|
| CP-S4-001 | A02:2021 | 暗号処理は本機能のスコープ外 |
| CP-S4-002 | A03:2021 | パスインジェクション対策が適切に設計されている |
| CP-S4-003 | A03:2021 | destination パラメータの入力バリデーションが設計されている |
| CP-S4-004 | A06:2021 | 新規外部依存の追加なし |
| CP-S4-005 | A07:2021 | 認証機能は本ツールのスコープ外 |
| CP-S4-006 | A10:2021 | SSRF リスクなし |
| CP-S4-007 | - | パストラバーサル対策が適切 |
| CP-S4-008 | - | ディレクトリトラバーサル保護が既存パターン踏襲 |
| CP-S4-009 | - | 入力バリデーションが多層的に設計 |
| CP-S4-010 | - | エラーレスポンスに絶対パスを含めない |
| CP-S4-011 | - | PATCH API の拡張が既存セキュリティパターン準拠 |
| CP-S4-012 | - | XSS 防止が適切 |

---

## 13. 実装チェックリスト

### Phase 1: バックエンド実装

- [ ] **MF-001**: `src/lib/file-operations.ts` に `validateFileOperation()` 内部ヘルパー関数を追加
- [ ] **MF-001**: 既存の `renameFileOrDirectory()` を `validateFileOperation()` を使用するようリファクタリング
- [ ] **SF-S2-003**: `validateFileOperation()` はソースパス検証のみ担当。移動先パス検証は `moveFileOrDirectory()` 内で実行
- [ ] `src/lib/file-operations.ts` に `moveFileOrDirectory()` を追加（`validateFileOperation()` 使用）
- [ ] **SF-S2-005**: `moveFileOrDirectory()` 内で `isProtectedDirectory()` を移動先ディレクトリ自体および最終パス（移動先 + ファイル名）の両方に適用
- [ ] **SEC-S4-004 (must-fix)**: `moveFileOrDirectory()` 内でソースパスに対して `isProtectedDirectory()` チェックを追加。`.git/config`、`.git/HEAD` 等の保護ディレクトリ内ファイルの移動を禁止。`deleteFileOrDirectory()` の既存パターン（`isProtectedDirectory(relativePath)`）と整合させる
- [ ] **SEC-S4-002 (should-fix)**: `moveFileOrDirectory()` 内で移動先ディレクトリの解決済みパスを `fs.realpathSync()` で取得し、`isPathSafe()` でワークツリールート内に収まることを検証。シンボリックリンクを経由したワークツリー外書き込みを防止
- [ ] **SEC-S4-005 (should-fix)**: MOVE_INTO_SELF チェックで `resolvedDest.startsWith(resolvedSource + path.sep)` を使用し、パスセパレータを付加してから判定。`src` を `src-backup/` に移動する場合の誤検出を防止
- [ ] **SEC-S4-008 (should-fix)**: 最終的な移動先パス（`path.join(destinationDir, path.basename(sourcePath))`）に対しても `isPathSafe()` を実行。防御的プログラミングとしてエッジケースに備える
- [ ] **SEC-S4-001 (should-fix)**: `existsSync()` による事前チェックに加え、`fs.rename()` の EEXIST/ENOTEMPTY エラーをキャッチして `FILE_EXISTS` エラーとして返す防御的ハンドリングを追加。TOCTOU 競合状態での整合性を担保
- [ ] `FileOperationErrorCode` に `MOVE_SAME_PATH` / `MOVE_INTO_SELF` を追加
- [ ] `ERROR_CODE_TO_HTTP_STATUS` マップにエラーコードのマッピングを追加
- [ ] `src/lib/file-tree.ts` の `readDirectory()` で `birthtime` を取得・格納
- [ ] **CO-001**: `mtime` は初回実装では追加しない（YAGNI）。開発者判断で追加は許容
- [ ] `src/types/models.ts` の `TreeItem` に `birthtime?: string` を追加
- [ ] **SF-001**: `src/lib/date-utils.ts` を新規作成し `formatRelativeTime()` を実装
- [ ] **SF-S3-005**: `moveFileOrDirectory()` の返り値 `FileOperationResult.path` に移動後のファイルの相対パス（`path.join(destinationDir, path.basename(sourcePath))`）を設定
- [ ] `src/app/api/worktrees/[id]/files/[...path]/route.ts` の PATCH に `action: "move"` を追加
- [ ] **MF-S3-002**: PATCH ハンドラー内で `destination` パラメータのバリデーション（`!destination || typeof destination !== 'string'`）を `moveFileOrDirectory()` 呼び出し前に実行
- [ ] **SF-003**: PATCH ハンドラーは `switch` 文で実装（2アクション時点）
- [ ] **SF-S2-002**: 不明アクション時のエラーメッセージを `'Unknown action. Supported: "rename", "move"'` に更新

### Phase 2: フロントエンド実装

- [ ] **MF-002**: `src/hooks/useFileOperations.ts` を新規作成
- [ ] `src/components/worktree/MoveDialog.tsx` を新規作成
- [ ] **SF-002**: MoveDialog はクライアント側フィルタリングで実装
- [ ] **SF-S3-003**: MoveDialog のディレクトリ展開時にローディングインジケーター（スピナー等）を表示
- [ ] **CO-003**: `sourceType` Props はバリデーション目的で維持
- [ ] **MF-S2-001**: `src/components/worktree/ContextMenu.tsx` に「Move」メニュー項目をハードコード英語ラベルで追加（既存パターンに整合）
- [ ] **SF-S3-002**: `onMove` は FileTreeView から ContextMenu に直接渡す（TreeNodeProps への追加は不要）
- [ ] **MF-S2-002**: `src/components/worktree/FileTreeView.tsx` に `useLocale()` を next-intl からインポートし、`getDateFnsLocale()` でロケール変換して `formatRelativeTime()` に渡す
- [ ] `src/components/worktree/FileTreeView.tsx` に作成時刻表示を追加
- [ ] **CO-002**: 時刻表示の `span` 要素に `title={item.birthtime}` を設定
- [ ] **SF-S2-004**: `src/components/worktree/FileViewer.tsx` にコピーボタンを追加（アイコンのみのフィードバック、Toast 不使用、i18n 不要）
- [ ] **MF-002**: `WorktreeDetailRefactored.tsx` に `useFileOperations()` フックを統合

### Phase 3: i18n 対応

- [ ] **SF-004**: `locales/en/worktree.json` に `fileTree` セクションを追加（`move`, `moveCancel`, `copyContent`, `copySuccess`, `copyFailed` キーは含めない）
- [ ] **SF-004**: `locales/ja/worktree.json` に `fileTree` セクションを追加（同上）
- [ ] **SF-S2-001**: `locales/en/error.json` の `fileOps` セクションに `failedToMove` を追加
- [ ] **SF-S2-001**: `locales/ja/error.json` の `fileOps` セクションに `failedToMove` を追加
- [ ] **CO-S2-004**: MoveDialog のキャンセルボタンは `tCommon('cancel')` を使用（`common.json` の既存キー）
- [ ] MoveDialog コンポーネントの `useTranslations('worktree')` 経由でアクセスを確認
- [ ] エラーメッセージは `useTranslations('error')` 経由で `tError('fileOps.failedToMove')` にアクセスを確認

### Phase 4: テスト

- [ ] **MF-001**: `tests/unit/lib/file-operations-validate.test.ts` を作成
- [ ] `tests/unit/lib/file-operations-move.test.ts` を作成
- [ ] `tests/unit/lib/file-tree-timestamps.test.ts` を作成
- [ ] **SF-001**: `tests/unit/lib/date-utils.test.ts` を作成
- [ ] `tests/unit/api/files-route-move.test.ts` を作成
- [ ] **MF-S3-001**: `renameFileOrDirectory()` リファクタリング前に既存の `tests/unit/lib/file-operations.test.ts` が全てパスすることを確認
- [ ] **MF-S3-001**: `renameFileOrDirectory()` リファクタリング後に既存の `tests/unit/lib/file-operations.test.ts` が全てパスすることを確認（回帰テスト）
- [ ] **MF-S3-001**: `renameFileOrDirectory()` の外部動作（入力・出力・エラーコード）がリファクタリング前後で変わらないことを確認
- [ ] 全既存テストが通ること (`npm run test:unit`)
- [ ] ESLint エラーが0件であること (`npm run lint`)
- [ ] TypeScript 型チェックが通ること (`npx tsc --noEmit`)
