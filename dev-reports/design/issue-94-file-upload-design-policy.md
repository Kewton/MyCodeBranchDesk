# Issue #94 ファイルアップロード機能 設計方針書

## 1. 概要

### 1.1 目的
FileTreeViewにて指定したディレクトリにファイルをアップロードする機能を実装する。
スクリーンショットやCSVファイルなど、Claude Codeの分析に必要な情報を効率的に提供可能にする。

### 1.2 スコープ
- ファイルアップロードAPI（新規エンドポイント）
- UI（右クリックメニュー、ファイル選択ダイアログ）
- セキュリティ対策（パストラバーサル防止、MIMEタイプ検証、マジックバイト検証）

### 1.3 対象外
- 複数ファイル同時アップロード（将来拡張）
- ドラッグ&ドロップ（将来拡張）
- 画像プレビュー機能（Issue #95で対応）

---

## 2. アーキテクチャ設計

### 2.1 システム構成図

```
+-----------------------------------------------------------------+
|                        Client (Browser)                          |
+-----------------------------------------------------------------+
|  FileTreeView.tsx                                                |
|    +-- ContextMenu.tsx                                           |
|          +-- onUpload callback                                   |
|                +-- <input type="file">                           |
|                      +-- multipart/form-data POST                |
+-----------------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------------+
|                    API Layer (Next.js)                           |
+-----------------------------------------------------------------+
|  /api/worktrees/[id]/files/[...path]/upload/route.ts (NEW)      |
|    +-- request.formData() でファイル取得                          |
|    +-- uploadable-extensions.ts で拡張子検証                      |
|    +-- path-validator.ts でパス検証                              |
|    +-- magic-bytes検証（file-type or カスタム実装）               |
|    +-- file-operations.ts でファイル書き込み                      |
+-----------------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------------+
|                    Business Logic Layer                          |
+-----------------------------------------------------------------+
|  src/lib/file-operations.ts                                      |
|    +-- writeBinaryFile(filePath, buffer) (NEW)                   |
|                                                                  |
|  src/config/uploadable-extensions.ts (NEW)                       |
|    +-- UploadableExtensionValidator (interface)                  |
|    +-- UPLOADABLE_EXTENSIONS                                     |
|    +-- isUploadableExtension()                                   |
|    +-- validateMimeType()                                        |
|    +-- validateMagicBytes() (NEW)                                |
+-----------------------------------------------------------------+
                              |
                              v
+-----------------------------------------------------------------+
|                    File System Layer                             |
+-----------------------------------------------------------------+
|  fs.promises.writeFile(filePath, buffer)                         |
+-----------------------------------------------------------------+
```

### 2.2 データフロー

```
1. ユーザーが右クリックメニューから「ファイルをアップロード」選択
2. ファイル選択ダイアログが開く
3. ユーザーがファイルを選択
4. クライアント側でファイルサイズ・拡張子の事前検証
5. multipart/form-data形式でAPIにPOST
6. API側で以下を検証:
   - パストラバーサル（isPathSafe()）
   - 拡張子（isUploadableExtension()）
   - MIMEタイプ（validateMimeType()）
   - マジックバイト（validateMagicBytes()）[SEC-001]
   - ファイルサイズ（5MB制限）
   - ファイル名検証（isValidNewName() forUpload: true）
   - 同名ファイル存在チェック
7. 検証OK → writeBinaryFile()でファイル保存
8. 成功/失敗レスポンスを返却
9. クライアント側でToast通知表示
10. ファイルツリー自動更新
```

### 2.3 エンドポイント分離の設計根拠

**技術的理由**: multipart/form-dataを使用するため、既存のJSON APIとContent-Typeが異なる。
- 既存API: `POST /api/worktrees/[id]/files/[...path]` は `application/json` を使用
- アップロードAPI: `multipart/form-data` を使用

Content-Typeの違いによるエンドポイント分離は、Next.jsのAPIルートハンドラにおいて
リクエスト処理ロジックを明確に分離できるため、保守性が向上する。

---

## 3. 詳細設計

### 3.1 新規APIエンドポイント

**パス**: `/api/worktrees/[id]/files/[...path]/upload`
**メソッド**: POST
**Content-Type**: multipart/form-data

#### リクエスト
```typescript
// FormData
{
  file: File  // アップロードするファイル
}
```

#### レスポンス

**[CONS-002] レスポンスにおけるfilenameフィールドの設計方針**:
APIレスポンスには `filename` フィールドを含めるが、これは `FileOperationResult` の拡張ではなく、
APIルート層で独自に構築する。理由:
1. `FileOperationResult` は汎用的なインターフェースであり、全操作で `filename` が必要なわけではない
2. 既存の `createFileOrDirectory()` 等との一貫性を保つ
3. APIレスポンス固有の情報はAPIルート層で付加する設計パターンに従う

```typescript
// 成功時 (201 Created)
// Note: filename はAPIルート層で追加（writeBinaryFile()の戻り値には含まれない）
{
  success: true,
  path: string,      // 保存先パス（writeBinaryFile()から）
  filename: string,  // ファイル名（APIルートで request.name から取得）
  size: number       // ファイルサイズ（バイト）（writeBinaryFile()から）
}

// エラー時 (400/403/409/413/500)
{
  success: false,
  error: {
    code: string,    // エラーコード
    message: string  // ユーザー向けメッセージ（[SEC-005] 具体的な拡張子情報を含めない）
  }
}
```

#### エラーコード
| コード | HTTPステータス | 説明 |
|--------|--------------|------|
| `INVALID_PATH` | 403 | パストラバーサル検出 |
| `INVALID_EXTENSION` | 400 | 非対応拡張子 |
| `INVALID_MIME_TYPE` | 400 | MIMEタイプ不一致 |
| `INVALID_MAGIC_BYTES` | 400 | マジックバイト不一致（[SEC-001]） |
| `FILE_EXISTS` | 409 | 同名ファイル存在 |
| `FILE_TOO_LARGE` | 413 | サイズ上限超過 |
| `INVALID_FILENAME` | 400 | 不正なファイル名（[SEC-004]） |
| `INTERNAL_ERROR` | 500 | サーバーエラー |

**[CONS-001] エラーコード型の拡張とHTTPステータスマッピングの同時更新**:
`src/lib/file-operations.ts` の `FileOperationErrorCode` 型に以下を追加する:
- `INVALID_EXTENSION`
- `INVALID_MIME_TYPE`
- `INVALID_MAGIC_BYTES` （[SEC-001]）
- `FILE_TOO_LARGE`
- `INVALID_FILENAME` （[SEC-004]）

**重要**: `FileOperationErrorCode` 型と `ERROR_CODE_TO_HTTP_STATUS` マッピングは**必ず同時に更新**すること。
型のみ追加してマッピングを更新しないと、`createErrorResult()` 関数でコンパイルは通るが、
HTTPステータス変換時に予期しない動作（undefinedが返る等）となる可能性がある。

また、`createErrorResult()` 関数が新しいエラーコードを正しく処理できることを単体テストで確認すること。

### 3.2 新規設定ファイル

**ファイルパス**: `src/config/uploadable-extensions.ts`

**[CONSISTENCY-001] editable-extensions.ts との設計パターン統一**:
既存の `editable-extensions.ts` が使用する `ExtensionValidator` パターンを踏襲し、
`UploadableExtensionValidator` インターフェースを定義する。

**[CONS-003] maxFileSizeのrequired/optional整合性についての設計判断**:
既存の `ExtensionValidator` では `maxFileSize?: number` とオプショナルだが、
`UploadableExtensionValidator` では `maxFileSize: number` を必須とする。これは意図的な違いであり、理由は以下:
1. 編集機能ではサイズ制限が不要なファイル形式が存在し得る（テキストファイル等）
2. アップロード機能では**全ての拡張子でサイズ制限が必須**（セキュリティ・サーバー負荷の観点）
3. 将来的に `editable-extensions.ts` もサイズ制限必須に統一することは検討課題とする

**[CONS-007] 命名規則の設計判断**:
`UPLOADABLE_EXTENSION_VALIDATORS` という命名を採用する。既存の `EXTENSION_VALIDATORS` とは異なるが、
これは以下の理由により許容する:
1. `UPLOADABLE_` プレフィックスは目的（アップロード用）を明確に示す
2. `EDITABLE_EXTENSIONS` と `UPLOADABLE_EXTENSIONS` の命名パターンと整合性がある
3. 将来的な統一ルールとして「`{目的}_EXTENSION_VALIDATORS`」パターンを採用する

**[SEC-001] マジックバイト検証の追加**:
各拡張子に対応するマジックバイト（ファイルシグネチャ）を定義し、実際のファイル内容を検証する。

**[SEC-002] SVGファイルの除外**:
SVGファイルはXML形式でありJavaScript埋め込みによるStored XSS攻撃のリスクがあるため、
許可リストから除外する。将来的にサニタイズ処理（DOMPurify等）を実装後に再検討する。

```typescript
/**
 * Uploadable Extension Validator Configuration
 * [CONSISTENCY-001] Pattern aligned with editable-extensions.ts
 * [SEC-001] Includes magic bytes validation
 * [SEC-002] SVG excluded due to XSS risk
 *
 * This module defines which file extensions can be uploaded.
 */

/**
 * Magic bytes definition for file type validation
 * [SEC-001] Required for server-side content verification
 */
export interface MagicBytesDefinition {
  /** Magic bytes as hex array */
  bytes: number[];
  /** Offset from file start (default: 0) */
  offset?: number;
}

/**
 * Uploadable extension validator configuration
 * Follows the same pattern as ExtensionValidator in editable-extensions.ts
 * [CONS-003] maxFileSize is required (unlike optional in ExtensionValidator)
 * [SEC-001] magicBytes added for content verification
 */
export interface UploadableExtensionValidator {
  /** File extension (e.g., '.png', '.csv') */
  extension: string;
  /** Maximum file size in bytes (required for uploads) */
  maxFileSize: number;
  /** Allowed MIME types for this extension */
  allowedMimeTypes: string[];
  /** Magic bytes for file type validation (optional for text files) */
  magicBytes?: MagicBytesDefinition[];
}

/**
 * Default maximum file size (5MB)
 */
export const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024;

/**
 * Validators for each supported uploadable extension
 * [CONS-007] Naming follows {PURPOSE}_EXTENSION_VALIDATORS pattern
 * [SEC-001] Magic bytes defined for binary files
 * [SEC-002] SVG removed from list due to XSS risk
 */
export const UPLOADABLE_EXTENSION_VALIDATORS: UploadableExtensionValidator[] = [
  // 画像（バイナリ - マジックバイト検証必須）
  {
    extension: '.png',
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
    allowedMimeTypes: ['image/png'],
    magicBytes: [{ bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] }]  // PNG signature
  },
  {
    extension: '.jpg',
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
    allowedMimeTypes: ['image/jpeg'],
    magicBytes: [{ bytes: [0xFF, 0xD8, 0xFF] }]  // JPEG signature
  },
  {
    extension: '.jpeg',
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
    allowedMimeTypes: ['image/jpeg'],
    magicBytes: [{ bytes: [0xFF, 0xD8, 0xFF] }]  // JPEG signature
  },
  {
    extension: '.gif',
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
    allowedMimeTypes: ['image/gif'],
    magicBytes: [
      { bytes: [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] },  // GIF87a
      { bytes: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] }   // GIF89a
    ]
  },
  {
    extension: '.webp',
    maxFileSize: DEFAULT_MAX_FILE_SIZE,
    allowedMimeTypes: ['image/webp'],
    magicBytes: [{ bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }]  // RIFF header (WebP starts with RIFF)
  },
  // [SEC-002] SVG removed: XSS risk due to embedded JavaScript capability
  // { extension: '.svg', maxFileSize: DEFAULT_MAX_FILE_SIZE, allowedMimeTypes: ['image/svg+xml'] },

  // テキスト（マジックバイト検証なし - 内容検証は別途）
  { extension: '.txt', maxFileSize: DEFAULT_MAX_FILE_SIZE, allowedMimeTypes: ['text/plain'] },
  { extension: '.log', maxFileSize: DEFAULT_MAX_FILE_SIZE, allowedMimeTypes: ['text/plain'] },
  { extension: '.md', maxFileSize: DEFAULT_MAX_FILE_SIZE, allowedMimeTypes: ['text/markdown', 'text/plain'] },
  { extension: '.csv', maxFileSize: DEFAULT_MAX_FILE_SIZE, allowedMimeTypes: ['text/csv'] },

  // 設定（構造化テキスト - 構文検証追加）
  { extension: '.json', maxFileSize: DEFAULT_MAX_FILE_SIZE, allowedMimeTypes: ['application/json'] },
  { extension: '.yaml', maxFileSize: DEFAULT_MAX_FILE_SIZE, allowedMimeTypes: ['text/yaml', 'application/x-yaml'] },
  { extension: '.yml', maxFileSize: DEFAULT_MAX_FILE_SIZE, allowedMimeTypes: ['text/yaml', 'application/x-yaml'] },
];

/**
 * List of uploadable extensions (derived from validators)
 */
export const UPLOADABLE_EXTENSIONS: readonly string[] =
  UPLOADABLE_EXTENSION_VALIDATORS.map(v => v.extension) as readonly string[];

/**
 * Check if a file extension is uploadable
 *
 * @param extension - File extension including the dot (e.g., '.png')
 * @returns True if the extension is uploadable
 */
export function isUploadableExtension(extension: string): boolean {
  if (!extension) return false;
  const normalizedExt = extension.toLowerCase();
  return UPLOADABLE_EXTENSIONS.includes(normalizedExt);
}

/**
 * Validate MIME type for a given extension
 *
 * @param extension - File extension (e.g., '.png')
 * @param mimeType - MIME type to validate
 * @returns True if the MIME type is allowed for this extension
 */
export function validateMimeType(extension: string, mimeType: string): boolean {
  const normalizedExt = extension.toLowerCase();
  const validator = UPLOADABLE_EXTENSION_VALIDATORS.find(
    v => v.extension === normalizedExt
  );
  return validator?.allowedMimeTypes.includes(mimeType) ?? false;
}

/**
 * Validate magic bytes for a given extension
 * [SEC-001] Server-side content verification
 *
 * @param extension - File extension (e.g., '.png')
 * @param buffer - File content as Buffer
 * @returns True if magic bytes match, or if no magic bytes defined for this extension
 */
export function validateMagicBytes(extension: string, buffer: Buffer): boolean {
  const normalizedExt = extension.toLowerCase();
  const validator = UPLOADABLE_EXTENSION_VALIDATORS.find(
    v => v.extension === normalizedExt
  );

  // No magic bytes defined (text files) - skip validation
  if (!validator?.magicBytes || validator.magicBytes.length === 0) {
    return true;
  }

  // Check if any of the defined magic bytes match
  return validator.magicBytes.some(magic => {
    const offset = magic.offset ?? 0;
    if (buffer.length < offset + magic.bytes.length) {
      return false;
    }
    return magic.bytes.every((byte, index) => buffer[offset + index] === byte);
  });
}

/**
 * Get maximum file size for a given extension
 *
 * @param extension - File extension (e.g., '.png')
 * @returns Maximum file size in bytes, or DEFAULT_MAX_FILE_SIZE if not found
 */
export function getMaxFileSize(extension: string): number {
  const normalizedExt = extension.toLowerCase();
  const validator = UPLOADABLE_EXTENSION_VALIDATORS.find(
    v => v.extension === normalizedExt
  );
  return validator?.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;
}

/**
 * Validate YAML content for dangerous tags
 * [SEC-006] Prevent YAML deserialization attacks
 *
 * @param content - YAML content as string
 * @returns True if YAML is safe (no dangerous tags)
 */
export function isYamlSafe(content: string): boolean {
  // Block dangerous YAML tags that could lead to code execution
  const dangerousTags = [
    /!ruby\/object/i,
    /!python\/object/i,
    /!!python/i,
    /!!ruby/i,
    /!<tag:yaml\.org,2002:python/i,
    /!<tag:yaml\.org,2002:ruby/i,
  ];

  return !dangerousTags.some(pattern => pattern.test(content));
}

/**
 * Validate JSON syntax
 * [SEC-007] Ensure JSON is valid before accepting
 *
 * @param content - JSON content as string
 * @returns True if JSON is syntactically valid
 */
export function isJsonValid(content: string): boolean {
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
}
```

### 3.3 バイナリファイル書き込み関数

**ファイルパス**: `src/lib/file-operations.ts`に追加

**[SOLID-001] 責務分離の設計方針**:
`writeBinaryFile()` 関数は、既存の `createFileOrDirectory()` と同様のパターンに従い、
検証とファイル書き込みの両方を担当する。これは「多層防御」の設計判断による。

- **APIルート層**: リクエストパラメータの検証（拡張子、MIMEタイプ、マジックバイト、サイズ）
- **file-operations層**: パス安全性とファイルシステムレベルの検証

この多層防御により、API層をバイパスした直接呼び出しでもセキュリティが担保される。

**[DRY-002] パストラバーサル検証の重複について**:
APIルート（`getWorktreeAndValidatePath()`）と `writeBinaryFile()` の両方でパス検証を行う。
これは意図的な多層防御であり、以下の理由から許容する:
1. セキュリティ上重要な検証は多層で行うべき
2. `file-operations.ts` の関数は他のコンテキストからも呼び出される可能性がある
3. 検証処理のオーバーヘッドは軽微

```typescript
/**
 * Write binary file to the filesystem
 * [SOLID-001] Follows the same pattern as createFileOrDirectory()
 * [DRY-002] Includes path validation as defense-in-depth
 *
 * @param worktreeRoot - Root directory of the worktree
 * @param relativePath - Relative path for the new file
 * @param buffer - Binary content to write
 * @returns Success or error with size information
 */
export async function writeBinaryFile(
  worktreeRoot: string,
  relativePath: string,
  buffer: Buffer
): Promise<FileOperationResult> {
  // Validate path (defense-in-depth)
  if (!isPathSafe(relativePath, worktreeRoot)) {
    return createErrorResult('INVALID_PATH');
  }

  const fullPath = join(worktreeRoot, relativePath);

  // Check if file already exists
  if (existsSync(fullPath)) {
    return createErrorResult('FILE_EXISTS');
  }

  try {
    // Ensure parent directory exists
    const parentDir = dirname(fullPath);
    if (!existsSync(parentDir)) {
      await mkdir(parentDir, { recursive: true });
    }

    // Write binary file
    await writeFile(fullPath, buffer);

    return {
      success: true,
      path: relativePath,
      size: buffer.length,  // [QUALITY-001] size property added
    };
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'EACCES') {
      return createErrorResult('PERMISSION_DENIED');
    }
    if (nodeError.code === 'ENOSPC') {
      return createErrorResult('DISK_FULL');
    }
    return createErrorResult('INTERNAL_ERROR');
  }
}
```

**[QUALITY-001] FileOperationResult型の拡張**:
`FileOperationResult` インターフェースに `size?: number` プロパティを追加する:

**[IMPACT-001] 後方互換性の確認**:
`size?: number` はオプショナルプロパティとして追加するため、既存コードに影響なし。
現在 `FileOperationResult` を返す関数（`readFileContent`, `updateFileContent`, `createFileOrDirectory`,
`deleteFileOrDirectory`, `renameFileOrDirectory`）は `size` を返していないが、
型定義上オプショナルのため問題なく動作する。

```typescript
export interface FileOperationResult {
  success: boolean;
  path?: string;
  content?: string;
  size?: number;  // [QUALITY-001] Added for upload response (optional for backward compatibility)
  error?: {
    code: string;
    message: string;
  };
}
```

### 3.4 UI変更

#### ContextMenu.tsx への項目追加

**[CONS-004] ContextMenuProps インターフェースの拡張**:
`src/components/worktree/ContextMenu.tsx` の `ContextMenuProps` インターフェースに
`onUpload` コールバックを追加する必要がある。

```typescript
// ContextMenuProps インターフェースに追加
interface ContextMenuProps {
  // ... 既存props
  onUpload?: (targetPath: string) => void;  // [CONS-004] 追加必須
}

// メニュー項目に追加
{
  label: 'ファイルをアップロード',
  icon: Upload,
  onClick: () => onUpload?.(targetPath),
  showWhen: isDirectory  // ディレクトリ選択時のみ表示
}
```

#### FileTreeView.tsx への props 追加

**[IMPACT-002] Props フローの明確化**:
`onUpload` コールバックは以下のように伝播する:

```
WorktreeDetailRefactored.tsx
  └── handleUpload() 定義
        │
        ▼
FileTreeView.tsx (FileTreeViewProps.onUpload)
  └── onUpload prop を受け取り ContextMenu に渡す
        │
        ▼
ContextMenu.tsx (ContextMenuProps.onUpload)
  └── 「ファイルをアップロード」メニュークリック時に呼び出し
```

```typescript
interface FileTreeViewProps {
  // ... 既存props
  onUpload?: (targetDir: string) => void;  // 追加
}

// FileTreeView.tsx 内での ContextMenu への伝播
<ContextMenu
  // ... 既存props
  onUpload={onUpload}  // FileTreeViewProps.onUpload を ContextMenu に渡す
/>
```

---

## 4. セキュリティ設計

### 4.1 パストラバーサル防止
- 既存の `isPathSafe()` 関数を使用
- `..` や絶対パスを含むパスを拒否
- worktreeの基準パス外へのアクセスを防止

### 4.2 ファイル名検証

**[DRY-001] 既存のisValidNewName()関数を拡張して利用**:
新規に `sanitizeFilename()` 関数を作成せず、既存の `isValidNewName()` 関数を拡張する。

現在の `isValidNewName()` は以下をチェックしている:
- 空名前チェック
- `..` ディレクトリトラバーサル
- `/` および `\\` パスセパレータ

**[SEC-004] ファイル名検証の強化**:
アップロード用に以下の検証を追加する:
- null bytes（\0）
- 改行文字（\n, \r）
- 全ての制御文字（ASCII 0x00-0x1F）
- OS固有の禁止文字（<>:"|?*）
- 先頭/末尾のスペース・ドット（Windows互換性）

```typescript
/**
 * Characters forbidden by various operating systems
 * [SEC-004] Added for cross-platform compatibility and security
 */
const OS_FORBIDDEN_CHARS = /[<>:"|?*]/;

/**
 * Control characters (ASCII 0x00-0x1F)
 * [SEC-004] All control characters should be rejected
 */
const CONTROL_CHARS = /[\x00-\x1F]/;

/**
 * Validate a new file/directory name
 * [DRY-001] Unified filename validation for create and upload
 * [SEC-004] Enhanced validation for upload security
 *
 * @param newName - The new name to validate
 * @param options - Validation options
 * @returns Validation result
 */
export function isValidNewName(
  newName: string,
  options?: { forUpload?: boolean }
): { valid: boolean; error?: string } {
  // Check for empty name
  if (!newName || newName.trim() === '') {
    return { valid: false, error: 'Name cannot be empty' };
  }

  // Check for directory traversal first (before path separators)
  if (newName.includes('..')) {
    return { valid: false, error: 'Name cannot contain ".."' };
  }

  // Check for directory separators
  if (newName.includes('/') || newName.includes('\\')) {
    return { valid: false, error: 'Name cannot contain path separators' };
  }

  // Additional checks for upload
  if (options?.forUpload) {
    // [SEC-004] Check for all control characters (includes null bytes, newlines)
    if (CONTROL_CHARS.test(newName)) {
      return { valid: false, error: 'Name cannot contain control characters' };
    }

    // [SEC-004] Check for OS-specific forbidden characters
    if (OS_FORBIDDEN_CHARS.test(newName)) {
      return { valid: false, error: 'Name contains forbidden characters' };
    }

    // [SEC-004] Check for leading/trailing spaces or dots (Windows compatibility)
    if (newName !== newName.trim() || newName.startsWith('.') && newName.length > 1 && newName.endsWith('.')) {
      // Note: Allow single dot hidden files like .gitignore
      if (newName.endsWith(' ') || newName.endsWith('.')) {
        return { valid: false, error: 'Name cannot end with space or dot' };
      }
    }
  }

  return { valid: true };
}
```

### 4.3 MIMEタイプ検証
- ブラウザから送信されるMIMEタイプと拡張子の整合性を検証
- 偽装防止のため、拡張子に基づく許可MIMEタイプリストと照合

**[SEC-001] マジックバイト検証の追加**:
MIMEタイプはクライアントが自由に設定可能なため、実際のファイル内容を検証する必要がある。
各画像形式のマジックバイト（ファイルシグネチャ）を検証し、拡張子偽装攻撃を防止する。

検証順序:
1. 拡張子チェック（ホワイトリスト）
2. MIMEタイプチェック（クライアント提供値）
3. **マジックバイトチェック（実際のファイル内容）** ← 必須

```typescript
// API route での検証順序
const ext = extname(filename).toLowerCase();

// 1. 拡張子チェック
if (!isUploadableExtension(ext)) {
  return createErrorResult('INVALID_EXTENSION');
}

// 2. MIMEタイプチェック
if (!validateMimeType(ext, file.type)) {
  return createErrorResult('INVALID_MIME_TYPE');
}

// 3. マジックバイトチェック [SEC-001]
const buffer = Buffer.from(await file.arrayBuffer());
if (!validateMagicBytes(ext, buffer)) {
  return createErrorResult('INVALID_MAGIC_BYTES');
}
```

### 4.4 拡張子検証方針

**[SOLID-002] ホワイトリスト方式の採用**:
許可リスト（ホワイトリスト）方式のみを採用し、拒否リスト（ブラックリスト）は使用しない。

**設計方針**:
- `UPLOADABLE_EXTENSION_VALIDATORS` で許可する拡張子を明示的に定義
- 許可リストに含まれない拡張子は自動的に拒否される
- `BLOCKED_EXTENSIONS` リストは削除（不要）

**[SEC-002] SVGファイルの除外**:
SVGファイルはXML形式であり、以下のリスクがあるため許可リストから除外する:
- scriptタグによるJavaScript埋め込み
- onload等のイベントハンドラ
- 外部リソース参照（xlink:href）
- Stored XSS攻撃のベクター

将来的にSVGを許可する場合は、以下のサニタイズ処理が必須:
- DOMPurify等によるscriptタグ、イベントハンドラの除去
- 外部リソース参照の除去
- または、PNGへのラスタライズ処理

**理由**:
1. 許可リストと拒否リストの併用は混乱を招く
2. ホワイトリスト方式はセキュリティ上より安全（明示的に許可されたもののみ受け入れ）
3. 将来の拡張時にも明確な基準を維持できる

**削除する設計（実装しない）**:
```typescript
// この設計は採用しない
const BLOCKED_EXTENSIONS = ['.exe', '.sh', '.bat', '.cmd', '.ps1', '.dll', '.so'];
```

### 4.5 ファイルサイズ制限
- クライアント側: ファイル選択時に事前検証
- サーバー側: FormData取得後に検証
- next.config.js: `experimental.serverActions.bodySizeLimit: '6mb'`

**[CONS-006] bodySizeLimit変更の影響分析**:
現在の `bodySizeLimit` は `2mb` だが、本機能実装に伴い `6mb` に変更する。

**変更理由**:
- ファイルアップロードの制限は5MBだが、multipart/form-dataのオーバーヘッドを考慮し6mbに設定

**[IMPACT-003] 影響を受ける既存APIルート一覧**:
`next.config.js` の `bodySizeLimit` 変更は全てのAPI ルートに影響する。以下は影響を受ける既存エンドポイント:

| エンドポイント | メソッド | 用途 | 入力サイズ検証 |
|---------------|---------|------|---------------|
| `/api/worktrees` | POST | ワークツリー作成 | 検証済み（小サイズ） |
| `/api/worktrees/[id]` | PUT/DELETE | ワークツリー更新/削除 | 検証済み（小サイズ） |
| `/api/worktrees/[id]/files/[...path]` | PUT | ファイル更新 | 要確認 |
| `/api/worktrees/[id]/files/[...path]` | POST | ファイル/ディレクトリ作成 | 要確認 |
| `/api/repositories` | POST/DELETE | リポジトリ操作 | 検証済み（小サイズ） |
| `/api/repositories/clone` | POST | クローン開始 | 検証済み（小サイズ） |
| `/api/sessions` | POST | セッション作成 | 検証済み（小サイズ） |

**注意**: 既存の PUT `/api/worktrees/[id]/files/[...path]` は JSON ボディでファイルコンテンツを受け取るため、
大きなファイル編集時にも 6MB 制限が適用される。これは既存機能の改善（2MB -> 6MB）となるが、
意図しない大きなリクエストを受け付けるリスクもある。

**影響範囲**:
1. **メモリ使用量**: 最大リクエストサイズが3倍になるため、同時リクエスト時のメモリ使用量が増加する可能性
2. **既存APIへの影響**: 全てのServer Actionsに適用されるため、既存のAPIでも6mbまでのリクエストが許容される
3. **DoS攻撃リスク**: 大きなリクエストが許容されることで、悪意あるリクエストによるリソース消費リスクが増加

**[SEC-003] DoS攻撃耐性の強化**:
初期実装では以下の軽減策を実施する:

1. **早期サイズ検証**: アップロードAPIでは5MBの検証を早期に行い、超過時は即座にエラーを返す
2. **route segment config**: アップロードAPI専用の `bodySizeLimit` を設定し、他APIは2MB維持を検討
   ```typescript
   // app/api/worktrees/[id]/files/[...path]/upload/route.ts
   export const config = {
     api: {
       bodyParser: {
         sizeLimit: '6mb',
       },
     },
   };
   ```
3. **将来的改善案**: レートリミット導入（同一IPからの単位時間あたりのアップロード数制限）

### 4.6 構造化ファイルの検証

**[SEC-006] YAMLファイルの安全性検証**:
YAMLファイルはアップロード時に以下の検証を行う:
- 危険なYAMLタグ（!ruby/object, !python/object等）の検出と拒否
- アップロード後の自動解析・設定適用は行わない

**[SEC-007] JSONファイルの構文検証**:
JSONファイルはアップロード時に以下の検証を行う:
- JSON.parse()による構文検証
- 不正なJSONはエラー返却

```typescript
// API route での構造化ファイル検証
if (ext === '.yaml' || ext === '.yml') {
  const content = buffer.toString('utf-8');
  if (!isYamlSafe(content)) {
    return createErrorResult('INVALID_FILE_CONTENT');  // 危険なYAMLタグ検出
  }
}

if (ext === '.json') {
  const content = buffer.toString('utf-8');
  if (!isJsonValid(content)) {
    return createErrorResult('INVALID_FILE_CONTENT');  // JSON構文エラー
  }
}
```

### 4.7 エラーメッセージのセキュリティ

**[SEC-005] 情報漏洩防止**:
エラーメッセージには具体的な拡張子情報を含めない。

**変更前（情報漏洩リスクあり）**:
```typescript
{ message: '対応していないファイル形式です（.exe）' }
```

**変更後（安全）**:
```typescript
{ message: '対応していないファイル形式です' }
```

クライアント側検証はUX向上目的のみとし、**サーバー側の検証が正**として設計する。
クライアント側の検証は容易にバイパス可能であることを前提とする。

---

## 5. エラーハンドリング設計

### 5.1 クライアント側エラー
| シナリオ | 対応 |
|---------|------|
| ファイルサイズ超過（事前検証） | ファイル選択ダイアログでエラー表示 |
| 非対応拡張子（事前検証） | ファイル選択ダイアログでエラー表示 |
| ネットワークエラー | Toast通知「アップロードに失敗しました。ネットワークを確認してください」 |

**Note**: クライアント側検証はUX向上目的のみ。サーバー側検証が必ず実行される。

### 5.2 サーバー側エラー

**[SEC-005] エラーメッセージから具体的な情報を除外**:

| エラーコード | ユーザー向けメッセージ |
|-------------|---------------------|
| `INVALID_PATH` | 不正なファイルパスです |
| `INVALID_EXTENSION` | 対応していないファイル形式です |
| `INVALID_MIME_TYPE` | ファイルの形式が正しくありません |
| `INVALID_MAGIC_BYTES` | ファイルの形式が正しくありません |
| `INVALID_FILENAME` | 不正なファイル名です |
| `INVALID_FILE_CONTENT` | ファイルの内容が不正です |
| `FILE_EXISTS` | 同名のファイルが既に存在します |
| `FILE_TOO_LARGE` | ファイルサイズが上限を超えています |
| `INTERNAL_ERROR` | サーバーエラーが発生しました |

---

## 6. パフォーマンス設計

### 6.1 メモリ使用量
- 5MBファイルを処理する際のメモリ使用量を考慮
- FormDataからBufferへの変換時に一時的に倍のメモリを使用する可能性
- 対策: ファイルサイズを事前検証し、大きなファイルは早期にリジェクト

### 6.2 同時アップロード
- 初期実装では単一ファイルのみ対応
- 複数ファイル同時アップロードは将来拡張として検討
- 同時アップロード時のサーバー負荷を考慮し、キューイングを検討

---

## 7. テスト設計

### 7.1 単体テスト

**テストファイル**: `tests/unit/config/uploadable-extensions.test.ts`

**[CONS-005] テストパターンの選択について**:
本設計では `test.each()` を使用したパラメタライズドテストを採用する。
既存の `editable-extensions.test.ts` は個別の `it()` を使用しているが、
新規テストファイルでは以下の理由により `test.each()` を採用:
1. 同じロジックに対する複数入力のテストが多く、パラメタライズが適している
2. テストケース追加時のコード量が減り、保守性が向上
3. 将来的に既存テストもパラメタライズパターンに統一することを検討課題とする

```typescript
describe('uploadable-extensions', () => {
  describe('isUploadableExtension', () => {
    test.each(['.png', '.jpg', '.md', '.csv', '.json'])(
      '%s は許可される', (ext) => expect(isUploadableExtension(ext)).toBe(true)
    );
    test.each(['.exe', '.sh', '.bat', '.svg'])(  // [SEC-002] SVG is now rejected
      '%s は拒否される', (ext) => expect(isUploadableExtension(ext)).toBe(false)
    );
  });

  describe('validateMimeType', () => {
    test('.png と image/png は一致', () => {
      expect(validateMimeType('.png', 'image/png')).toBe(true);
    });
    test('.png と text/plain は不一致', () => {
      expect(validateMimeType('.png', 'text/plain')).toBe(false);
    });
  });

  // [SEC-001] Magic bytes validation tests
  describe('validateMagicBytes', () => {
    test('valid PNG magic bytes', () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
      expect(validateMagicBytes('.png', pngBuffer)).toBe(true);
    });
    test('invalid PNG magic bytes (text content)', () => {
      const textBuffer = Buffer.from('Hello World');
      expect(validateMagicBytes('.png', textBuffer)).toBe(false);
    });
    test('text files skip magic bytes validation', () => {
      const textBuffer = Buffer.from('Hello World');
      expect(validateMagicBytes('.txt', textBuffer)).toBe(true);
    });
  });

  // [SEC-006] YAML safety tests
  describe('isYamlSafe', () => {
    test('safe YAML content', () => {
      expect(isYamlSafe('key: value\nlist:\n  - item1')).toBe(true);
    });
    test('dangerous !ruby/object tag', () => {
      expect(isYamlSafe('--- !ruby/object:Gem::Requirement')).toBe(false);
    });
    test('dangerous !python/object tag', () => {
      expect(isYamlSafe('!!python/object/apply:os.system')).toBe(false);
    });
  });

  // [SEC-007] JSON validation tests
  describe('isJsonValid', () => {
    test('valid JSON', () => {
      expect(isJsonValid('{"key": "value"}')).toBe(true);
    });
    test('invalid JSON', () => {
      expect(isJsonValid('{key: value}')).toBe(false);
    });
  });

  describe('getMaxFileSize', () => {
    test('returns default size for known extension', () => {
      expect(getMaxFileSize('.png')).toBe(5 * 1024 * 1024);
    });
    test('returns default size for unknown extension', () => {
      expect(getMaxFileSize('.xyz')).toBe(5 * 1024 * 1024);
    });
  });
});
```

**テストファイル**: `tests/unit/components/worktree/FileTreeView.test.tsx`（追加）

```typescript
describe('ContextMenu Upload', () => {
  test('ディレクトリ選択時に「ファイルをアップロード」が表示される', () => {
    // ...
  });
  test('onUploadコールバックが正しく呼び出される', () => {
    // ...
  });
});
```

**テストファイル**: `tests/unit/lib/file-operations.test.ts`（追加）

```typescript
// [SEC-004] Enhanced filename validation tests
describe('isValidNewName with upload options', () => {
  test('rejects null bytes for upload', () => {
    const result = isValidNewName('file\0name.txt', { forUpload: true });
    expect(result.valid).toBe(false);
  });
  test('rejects control characters for upload', () => {
    const result = isValidNewName('file\x01name.txt', { forUpload: true });
    expect(result.valid).toBe(false);
  });
  test('rejects OS forbidden characters for upload', () => {
    const result = isValidNewName('file<name>.txt', { forUpload: true });
    expect(result.valid).toBe(false);
  });
  test('rejects trailing space for upload', () => {
    const result = isValidNewName('filename.txt ', { forUpload: true });
    expect(result.valid).toBe(false);
  });
  test('allows normal names for upload', () => {
    const result = isValidNewName('file.txt', { forUpload: true });
    expect(result.valid).toBe(true);
  });
});

// [CONS-001] createErrorResult with new error codes
describe('createErrorResult with upload error codes', () => {
  test('creates error result for INVALID_EXTENSION', () => {
    const result = createErrorResult('INVALID_EXTENSION');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_EXTENSION');
  });
  test('creates error result for INVALID_MIME_TYPE', () => {
    const result = createErrorResult('INVALID_MIME_TYPE');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_MIME_TYPE');
  });
  test('creates error result for INVALID_MAGIC_BYTES', () => {
    const result = createErrorResult('INVALID_MAGIC_BYTES');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_MAGIC_BYTES');
  });
  test('creates error result for FILE_TOO_LARGE', () => {
    const result = createErrorResult('FILE_TOO_LARGE');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('FILE_TOO_LARGE');
  });
  test('creates error result for INVALID_FILENAME', () => {
    const result = createErrorResult('INVALID_FILENAME');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_FILENAME');
  });
});
```

### 7.2 結合テスト

**テストファイル**: `tests/integration/api/file-upload.test.ts`

```typescript
describe('POST /api/worktrees/:id/files/:path/upload', () => {
  test('正常なファイルをアップロードできる', async () => { /* ... */ });
  test('サイズ超過ファイルは413エラー', async () => { /* ... */ });
  test('非対応拡張子は400エラー', async () => { /* ... */ });
  test('MIMEタイプ不一致は400エラー', async () => { /* ... */ });
  test('パストラバーサルは403エラー', async () => { /* ... */ });
  test('同名ファイル存在時は409エラー', async () => { /* ... */ });

  // [QUALITY-002] MIMEタイプ偽装テスト
  test('MIMEタイプ偽装（.png拡張子でtext/plain送信）は400エラー', async () => {
    // .png 拡張子のファイルを text/plain MIMEタイプで送信
    // 期待: INVALID_MIME_TYPE エラー (400)
  });

  // [SEC-001] Magic bytes validation tests
  test('マジックバイト不一致（.png拡張子でテキストコンテンツ）は400エラー', async () => {
    // .png 拡張子のファイルにテキストコンテンツを送信
    // 期待: INVALID_MAGIC_BYTES エラー (400)
  });

  // [SEC-002] SVG rejection test
  test('SVGファイルは400エラー', async () => {
    // SVGファイルのアップロードを試行
    // 期待: INVALID_EXTENSION エラー (400)
  });

  // [SEC-004] Filename validation tests
  test('制御文字を含むファイル名は400エラー', async () => {
    // 期待: INVALID_FILENAME エラー (400)
  });

  // [SEC-006] YAML safety test
  test('危険なYAMLタグを含むファイルは400エラー', async () => {
    // !ruby/object等を含むYAMLファイルのアップロードを試行
    // 期待: INVALID_FILE_CONTENT エラー (400)
  });

  // [SEC-007] JSON validation test
  test('不正なJSON構文は400エラー', async () => {
    // 構文エラーのあるJSONファイルのアップロードを試行
    // 期待: INVALID_FILE_CONTENT エラー (400)
  });
});
```

### 7.3 E2Eテスト

**テストファイル**: `tests/e2e/file-upload.spec.ts`

```typescript
test('右クリックメニューからファイルをアップロードできる', async ({ page }) => {
  // 1. ディレクトリを右クリック
  // 2. 「ファイルをアップロード」をクリック
  // 3. ファイル選択
  // 4. アップロード完了を確認
  // 5. Toast通知を確認
  // 6. ファイルツリーに反映されていることを確認
});
```

---

## 8. 影響範囲

### 8.1 新規作成ファイル
| ファイル | 説明 |
|----------|------|
| `src/config/uploadable-extensions.ts` | 拡張子・MIMEタイプ・マジックバイト設定 |
| `src/app/api/worktrees/[id]/files/[...path]/upload/route.ts` | アップロードAPI |
| `tests/unit/config/uploadable-extensions.test.ts` | 単体テスト |
| `tests/e2e/file-upload.spec.ts` | E2Eテスト |

### 8.2 変更ファイル
| ファイル | 変更内容 |
|----------|----------|
| `src/lib/file-operations.ts` | `writeBinaryFile()` 関数追加、`FileOperationResult`に`size`追加、`FileOperationErrorCode`にエラーコード追加（INVALID_EXTENSION, INVALID_MIME_TYPE, INVALID_MAGIC_BYTES, FILE_TOO_LARGE, INVALID_FILENAME, INVALID_FILE_CONTENT）、**[IMPACT-006] `ERROR_MESSAGES`にメッセージ追加**、`isValidNewName()`にオプション引数追加・**[SEC-004]検証強化** |
| `src/components/worktree/FileTreeView.tsx` | `onUpload` prop追加、**[IMPACT-002] ContextMenuへのonUpload伝播** |
| `src/components/worktree/ContextMenu.tsx` | アップロードメニュー項目追加、**[CONS-004] `ContextMenuProps`に`onUpload`追加** |
| `src/components/worktree/WorktreeDetailRefactored.tsx` | **[IMPACT-004] handleUploadコールバック追加、FileTreeViewへのonUpload prop追加、アップロード成功後のrefreshTrigger更新** |
| `next.config.js` | `bodySizeLimit` 設定変更（2mb -> 6mb）**[IMPACT-003]** |
| `src/app/api/worktrees/[id]/files/[...path]/route.ts` | `ERROR_CODE_TO_HTTP_STATUS`マッピング追加 |
| `tests/unit/components/worktree/FileTreeView.test.tsx` | テストケース追加 |
| `tests/unit/lib/file-operations.test.ts` | **[CONS-001] createErrorResult新エラーコードテスト追加**、**[SEC-004] ファイル名検証テスト追加** |

**[IMPACT-008] useContextMenu.ts について**:
`src/hooks/useContextMenu.ts` は変更**不要**。現在の実装では `openMenu`, `closeMenu`, `resetMenu` のみを提供し、
アクション固有のロジック（`onUpload` など）は含まない。アップロードアクションは `ContextMenu.tsx` 側で
`onUpload` prop として受け取り、メニュークリック時に呼び出すため、フック自体の変更は必要ない。

### 8.3 後方互換性
- 新規APIエンドポイントの追加のため、既存APIに影響なし
- 既存の `createFileOrDirectory()` は変更せず、新規 `writeBinaryFile()` を追加
- `isValidNewName()` はオプション引数追加のため、既存呼び出しには影響なし

---

## 9. 依存関係

### 9.1 外部依存
- なし（Next.js 13+のネイティブFormData APIを使用）
- マジックバイト検証はカスタム実装（file-type npmパッケージは将来的な検討事項）

### 9.2 内部依存
| 依存元 | 依存先 | 説明 |
|--------|--------|------|
| upload/route.ts | uploadable-extensions.ts | 拡張子・MIMEタイプ・マジックバイト検証 |
| upload/route.ts | path-validator.ts | パス検証 |
| upload/route.ts | file-operations.ts | ファイル書き込み |
| ContextMenu.tsx | FileTreeView.tsx | onUploadコールバック |

---

## 10. 設計原則の適用

### 10.1 SOLID原則
- **S (単一責任)**: APIルート、検証ロジック、ファイル操作を分離。ただし、`writeBinaryFile()` は既存パターンに従い検証込みで実装（多層防御）
- **O (開放閉鎖)**: `UPLOADABLE_EXTENSION_VALIDATORS` を設定ファイルで管理し、拡張可能。`ExtensionValidator` パターンに統一
- **D (依存性逆転)**: ファイル操作は `file-operations.ts` に抽象化

### 10.2 KISS原則
- 初期実装は単一ファイルアップロードのみ対応
- 複雑なストリーミング処理は行わず、シンプルなBuffer処理
- 5MB制限の場合、プログレス表示は不要。シンプルなToast通知のみで十分

### 10.3 YAGNI原則
- 複数ファイル同時アップロードは将来拡張として保留
- プログレス表示は5MB制限では不要と判断し、実装しない

### 10.4 DRY原則
- **[DRY-001]**: ファイル名検証を `isValidNewName()` に統一。`sanitizeFilename()` は新規作成しない
- **[DRY-002]**: パストラバーサル検証の重複は多層防御として意図的に許容
- 拡張子検証ロジックを `uploadable-extensions.ts` に集約
- パス検証は既存の `isPathSafe()` を再利用

---

## 11. レビュー指摘事項の反映サマリー

### 11.1 Stage 1 (設計原則レビュー) - 2026-01-30

| ID | 重要度 | 対応内容 |
|----|--------|----------|
| DRY-001 | must_fix | `sanitizeFilename()` 新規作成を取りやめ、`isValidNewName()` を拡張して統一 |
| CONSISTENCY-001 | must_fix | `uploadable-extensions.ts` を `ExtensionValidator` パターンに統一 |
| SOLID-001 | should_fix | `writeBinaryFile()` の多層防御設計を明記 |
| SOLID-002 | should_fix | ホワイトリスト方式に統一、`BLOCKED_EXTENSIONS` は不採用 |
| DRY-002 | should_fix | パストラバーサル検証の多層防御として意図的な重複を明記 |
| CONSISTENCY-002 | should_fix | `FileOperationErrorCode` 型の拡張を明記 |
| QUALITY-001 | should_fix | `FileOperationResult` に `size` プロパティ追加を明記 |
| QUALITY-002 | nice_to_have | MIMEタイプ偽装のテストケースを追加 |

### 11.2 Stage 2 (整合性レビュー) - 2026-01-30

| ID | 重要度 | 対応内容 |
|----|--------|----------|
| CONS-001 | must_fix | `FileOperationErrorCode`型と`ERROR_CODE_TO_HTTP_STATUS`マッピングの同時更新を明記、`createErrorResult()`のテストケース追加 |
| CONS-002 | must_fix | APIレスポンスの`filename`フィールドはAPIルート層で追加する設計方針を明記（`writeBinaryFile()`の戻り値には含めない） |
| CONS-003 | should_fix | `maxFileSize`のrequired/optional差異は意図的な設計判断であることを明記 |
| CONS-004 | should_fix | `ContextMenuProps`インターフェースへの`onUpload`追加を明記、影響範囲に追加 |
| CONS-005 | should_fix | `test.each()`パターン採用の理由と将来的な統一検討を明記 |
| CONS-006 | should_fix | `bodySizeLimit`変更（2mb->6mb）の影響分析と軽減策を追記 |
| CONS-007 | should_fix | `UPLOADABLE_EXTENSION_VALIDATORS`命名規則の設計判断を明記 |

### 11.3 Stage 3 (影響分析レビュー) - 2026-01-30

| ID | 重要度 | 対応内容 |
|----|--------|----------|
| IMPACT-001 | must_fix | `FileOperationResult.size?: number` がオプショナル追加で後方互換性ありであることを明記 |
| IMPACT-002 | must_fix | `FileTreeViewProps.onUpload` -> `ContextMenu.onUpload` のpropsフローを明確化 |
| IMPACT-003 | must_fix | `bodySizeLimit`変更（2mb->6mb）が全APIルートに影響することを明記、影響するAPI一覧追加 |
| IMPACT-004 | should_fix | `WorktreeDetailRefactored.tsx` を影響ファイル一覧に追加 |
| IMPACT-006 | should_fix | `ERROR_MESSAGES`更新を実装チェックリストに追加 |
| IMPACT-008 | should_fix | `useContextMenu.ts` への変更は不要であることを明確化 |

### 11.4 Stage 4 (セキュリティレビュー) - 2026-01-30

| ID | 重要度 | OWASP | 対応内容 |
|----|--------|-------|----------|
| SEC-001 | must_fix | A04:2021 | マジックバイト検証を追加。`validateMagicBytes()`関数、`MagicBytesDefinition`インターフェース、各画像形式のシグネチャ定義 |
| SEC-002 | must_fix | A03:2021 | SVGファイルを許可リストから除外（XSSリスク）。将来的にサニタイズ実装後に再検討 |
| SEC-003 | should_fix | A05:2021 | DoS攻撃耐性強化。route segment config、レートリミット導入を検討事項として記載 |
| SEC-004 | should_fix | A03:2021 | ファイル名検証強化。全制御文字、OS禁止文字、先頭/末尾スペース・ドットのチェック追加 |
| SEC-005 | should_fix | A01:2021 | エラーメッセージから具体的な拡張子情報を除外。情報漏洩防止 |
| SEC-006 | should_fix | A03:2021 | YAML安全性検証。危険なタグ（!ruby/object等）の検出と拒否 |
| SEC-007 | should_fix | A08:2021 | JSON構文検証。アップロード前にJSON.parse()で検証 |

---

## 12. 実装チェックリスト

### Phase 1: 型定義・設定
- [ ] `src/lib/file-operations.ts` に `FileOperationErrorCode` 拡張（INVALID_EXTENSION, INVALID_MIME_TYPE, INVALID_MAGIC_BYTES, FILE_TOO_LARGE, INVALID_FILENAME, INVALID_FILE_CONTENT）
- [ ] **[CONS-001]** `src/app/api/worktrees/[id]/files/[...path]/route.ts` の `ERROR_CODE_TO_HTTP_STATUS` も同時に更新
- [ ] **[IMPACT-006]** `src/lib/file-operations.ts` の `ERROR_MESSAGES` に新エラーコードのメッセージ追加 **[SEC-005] 具体的な情報を含めない**
- [ ] `src/lib/file-operations.ts` の `FileOperationResult` に `size?: number` 追加 **[IMPACT-001] オプショナル追加で後方互換性あり**
- [ ] `src/lib/file-operations.ts` の `isValidNewName()` にオプション引数追加 **[SEC-004] 検証強化**
- [ ] `src/config/uploadable-extensions.ts` 作成（`UploadableExtensionValidator` パターン）
- [ ] **[SEC-001]** `MagicBytesDefinition` インターフェースと `validateMagicBytes()` 関数追加
- [ ] **[SEC-002]** SVGを許可リストから除外
- [ ] **[SEC-006]** `isYamlSafe()` 関数追加
- [ ] **[SEC-007]** `isJsonValid()` 関数追加

### Phase 2: ビジネスロジック
- [ ] `src/lib/file-operations.ts` に `writeBinaryFile()` 追加
- [ ] **[CONS-002]** `writeBinaryFile()` は `filename` を返さない（APIルート層で追加）

### Phase 3: API
- [ ] `src/app/api/worktrees/[id]/files/[...path]/upload/route.ts` 作成
- [ ] **[CONS-002]** レスポンスに `filename` を追加（`file.name` から取得）
- [ ] **[SEC-001]** マジックバイト検証を追加
- [ ] **[SEC-004]** ファイル名検証（`isValidNewName({ forUpload: true })`）を追加
- [ ] **[SEC-005]** エラーメッセージから具体的な情報を除外
- [ ] **[SEC-006]** YAML安全性検証を追加
- [ ] **[SEC-007]** JSON構文検証を追加
- [ ] **[CONS-006]** `next.config.js` の `bodySizeLimit` を `6mb` に変更
- [ ] **[SEC-003]** route segment configの設定を検討

### Phase 4: UI
- [ ] **[CONS-004]** `src/components/worktree/ContextMenu.tsx` の `ContextMenuProps` に `onUpload` 追加
- [ ] `src/components/worktree/ContextMenu.tsx` にメニュー項目追加
- [ ] `src/components/worktree/FileTreeView.tsx` に `onUpload` prop追加 **[IMPACT-002] ContextMenuへの伝播も実装**
- [ ] **[IMPACT-004]** `src/components/worktree/WorktreeDetailRefactored.tsx` に `handleUpload` コールバック追加
- [ ] **[IMPACT-004]** `WorktreeDetailRefactored.tsx` でアップロード成功後に `refreshTrigger` を更新

### Phase 5: テスト
- [ ] 単体テスト作成（uploadable-extensions, isValidNewName拡張）
- [ ] **[SEC-001]** マジックバイト検証のテストケース追加
- [ ] **[SEC-002]** SVG拒否のテストケース追加
- [ ] **[SEC-004]** ファイル名検証強化のテストケース追加
- [ ] **[SEC-006]** YAML安全性検証のテストケース追加
- [ ] **[SEC-007]** JSON構文検証のテストケース追加
- [ ] **[CONS-001]** `createErrorResult()` の新エラーコードテスト追加
- [ ] 結合テスト作成（MIMEタイプ偽装テスト、マジックバイト検証テスト含む）
- [ ] E2Eテスト作成

### Phase 6: ドキュメント
- [ ] CLAUDE.md 更新（実装完了後）

---

## 13. 関連ドキュメント

- Issue #94: https://github.com/Kewton/CommandMate/issues/94
- Issue #95 (画像ファイルビューワ): 本Issueの後続として実装
- 既存設計参考: `dev-reports/design/issue-49-markdown-editor-design-policy.md`
- 参考実装: `src/config/editable-extensions.ts`

---

*作成日: 2026-01-30*
*更新履歴:*
- 2026-01-30: 初版作成（Issue #94の内容に基づく）
- 2026-01-30: Stage 1 設計原則レビュー指摘反映（DRY-001, CONSISTENCY-001 must_fix対応、should_fix 5件対応）
- 2026-01-30: Stage 2 整合性レビュー指摘反映（CONS-001, CONS-002 must_fix対応、should_fix 5件対応）
- 2026-01-30: Stage 3 影響分析レビュー指摘反映（IMPACT-001, IMPACT-002, IMPACT-003 must_fix対応、should_fix 3件対応）
- 2026-01-30: Stage 4 セキュリティレビュー指摘反映（SEC-001, SEC-002 must_fix対応、SEC-003〜SEC-007 should_fix対応）
