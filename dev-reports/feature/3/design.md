# Issue #4: 複数SWE CLI対応 - 設計方針

## 1. アーキテクチャ概要

### 1.1 全体構成

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (React)                     │
│  ┌────────────────┐  ┌────────────────┐                │
│  │ WorktreeCard   │  │ WorktreeDetail │                │
│  │ (CLI選択UI)    │  │ (メッセージUI) │                │
│  └────────────────┘  └────────────────┘                │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                   API Routes (Next.js)                   │
│  ┌────────────────────────────────────────────────────┐ │
│  │  /api/worktrees/[id]/send                          │ │
│  │  /api/worktrees/[id]/cli-tools                     │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│              CLI Abstraction Layer (新規)               │
│  ┌────────────────────────────────────────────────────┐ │
│  │           CLIToolManager (統合管理)                │ │
│  │  ┌──────────────┐  ┌──────────────┐              │ │
│  │  │ ICLITool     │  │ CLIToolFactory│             │ │
│  │  │ (Interface)  │  │               │             │ │
│  │  └──────────────┘  └──────────────┘              │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ ClaudeTool   │  │ CodexTool    │  │ GeminiTool   │
│ (既存改修)   │  │ (新規)       │  │ (新規)       │
└──────────────┘  └──────────────┘  └──────────────┘
           │                  │                  │
           ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────┐
│              Tmux Session Manager (既存改修)            │
└─────────────────────────────────────────────────────────┘
```

### 1.2 設計原則

1. **Single Responsibility Principle (SRP)**
   - 各CLIツールの実装は独立したクラス/モジュールに分離
   - 共通ロジックは抽象化レイヤーで管理

2. **Open/Closed Principle (OCP)**
   - 新しいCLIツールの追加時に既存コードの変更を最小化
   - インターフェース経由で拡張可能

3. **Dependency Inversion Principle (DIP)**
   - 上位モジュールは抽象に依存、具象に依存しない
   - ICLIToolインターフェースを介して各ツールを操作

4. **Strategy Pattern**
   - CLIツールの選択と切り替えをStrategyパターンで実装

## 2. コアインターフェース設計

### 2.1 ICLITool インターフェース

```typescript
/**
 * SWE CLIツールの共通インターフェース
 */
export interface ICLITool {
  /** CLIツールの識別子 (claude, codex, gemini) */
  readonly id: CLIToolType;

  /** CLIツールの表示名 */
  readonly name: string;

  /** CLIツールのコマンド名 */
  readonly command: string;

  /**
   * CLIツールがインストールされているか確認
   */
  isInstalled(): Promise<boolean>;

  /**
   * セッションが実行中かチェック
   * @param worktreeId - Worktree ID
   */
  isRunning(worktreeId: string): Promise<boolean>;

  /**
   * 新しいセッションを開始
   * @param worktreeId - Worktree ID
   * @param worktreePath - Worktreeのパス
   * @param options - CLIツール固有のオプション
   */
  startSession(
    worktreeId: string,
    worktreePath: string,
    options?: CLIToolOptions
  ): Promise<void>;

  /**
   * メッセージを送信
   * @param worktreeId - Worktree ID
   * @param message - 送信するメッセージ
   */
  sendMessage(worktreeId: string, message: string): Promise<void>;

  /**
   * セッションを終了
   * @param worktreeId - Worktree ID
   */
  killSession(worktreeId: string): Promise<void>;

  /**
   * セッション名を取得
   * @param worktreeId - Worktree ID
   */
  getSessionName(worktreeId: string): string;

  /**
   * CLIツール固有の設定を検証
   */
  validateConfig(): Promise<boolean>;
}

/**
 * CLIツールタイプ
 */
export type CLIToolType = 'claude' | 'codex' | 'gemini';

/**
 * CLIツールオプション（拡張可能）
 */
export interface CLIToolOptions {
  baseUrl?: string;
  [key: string]: any;
}
```

### 2.2 CLIToolManager クラス

```typescript
/**
 * CLIツールの統合管理クラス
 * Singletonパターンで実装
 */
export class CLIToolManager {
  private static instance: CLIToolManager;
  private tools: Map<CLIToolType, ICLITool>;

  private constructor() {
    this.tools = new Map();
    this.registerTools();
  }

  public static getInstance(): CLIToolManager {
    if (!CLIToolManager.instance) {
      CLIToolManager.instance = new CLIToolManager();
    }
    return CLIToolManager.instance;
  }

  /**
   * CLIツールを登録
   */
  private registerTools(): void {
    this.tools.set('claude', new ClaudeTool());
    this.tools.set('codex', new CodexTool());
    this.tools.set('gemini', new GeminiTool());
  }

  /**
   * CLIツールを取得
   */
  public getTool(type: CLIToolType): ICLITool {
    const tool = this.tools.get(type);
    if (!tool) {
      throw new Error(`CLI tool '${type}' not found`);
    }
    return tool;
  }

  /**
   * 利用可能なCLIツール一覧を取得
   */
  public async getAvailableTools(): Promise<CLIToolInfo[]> {
    const tools: CLIToolInfo[] = [];
    for (const [type, tool] of this.tools) {
      const installed = await tool.isInstalled();
      tools.push({
        id: type,
        name: tool.name,
        command: tool.command,
        installed,
      });
    }
    return tools;
  }
}

export interface CLIToolInfo {
  id: CLIToolType;
  name: string;
  command: string;
  installed: boolean;
}
```

### 2.3 CLITool実装例（ClaudeTool）

```typescript
/**
 * Claude Code CLI実装
 */
export class ClaudeTool implements ICLITool {
  public readonly id: CLIToolType = 'claude';
  public readonly name: string = 'Claude Code';
  public readonly command: string = 'claude';

  async isInstalled(): Promise<boolean> {
    try {
      await execAsync('which claude', { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  async isRunning(worktreeId: string): Promise<boolean> {
    const sessionName = this.getSessionName(worktreeId);
    return await hasSession(sessionName);
  }

  async startSession(
    worktreeId: string,
    worktreePath: string,
    options?: CLIToolOptions
  ): Promise<void> {
    const sessionName = this.getSessionName(worktreeId);

    // tmuxセッション作成
    await createSession(sessionName, worktreePath);

    // Claude Code起動コマンド
    const baseUrl = options?.baseUrl || 'http://localhost:3000';
    const command = `claude --webhook-url="${baseUrl}/api/hooks/claude-done?worktreeId=${worktreeId}"`;

    await sendKeys(sessionName, command);
  }

  async sendMessage(worktreeId: string, message: string): Promise<void> {
    const sessionName = this.getSessionName(worktreeId);
    await sendKeys(sessionName, message);
  }

  async killSession(worktreeId: string): Promise<void> {
    const sessionName = this.getSessionName(worktreeId);
    await killSession(sessionName);
  }

  getSessionName(worktreeId: string): string {
    return `mcbd-${this.id}-${worktreeId}`;
  }

  async validateConfig(): Promise<boolean> {
    return await this.isInstalled();
  }
}
```

## 3. データベース設計

### 3.1 スキーマ変更

#### worktreesテーブル（拡張）
```sql
ALTER TABLE worktrees ADD COLUMN swe_cli TEXT DEFAULT 'claude';
```

| カラム名 | 型 | NULL | デフォルト | 説明 |
|---------|-----|------|-----------|------|
| swe_cli | TEXT | YES | 'claude' | 使用するCLIツール (claude/codex/gemini) |

#### 新規テーブル: cli_tool_configs
```sql
CREATE TABLE IF NOT EXISTS cli_tool_configs (
  id TEXT PRIMARY KEY,                  -- CLIツールID (claude/codex/gemini)
  name TEXT NOT NULL,                   -- 表示名
  command TEXT NOT NULL,                -- コマンド名
  enabled INTEGER DEFAULT 1,            -- 有効/無効 (0/1)
  config_json TEXT,                     -- JSON形式の設定
  created_at INTEGER NOT NULL,          -- 作成日時
  updated_at INTEGER NOT NULL           -- 更新日時
);
```

### 3.2 マイグレーション

```typescript
// src/lib/db-migrations.ts に追加

export function migration_004_add_swe_cli_support(db: Database.Database): void {
  console.log('Running migration 004: Add SWE CLI support');

  // worktreesテーブルにswe_cliカラム追加
  db.exec(`
    ALTER TABLE worktrees
    ADD COLUMN swe_cli TEXT DEFAULT 'claude';
  `);

  // cli_tool_configsテーブル作成
  db.exec(`
    CREATE TABLE IF NOT EXISTS cli_tool_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      command TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      config_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // デフォルトCLIツール設定を挿入
  const now = Date.now();
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO cli_tool_configs (id, name, command, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertStmt.run('claude', 'Claude Code', 'claude', 1, now, now);
  insertStmt.run('codex', 'Codex CLI', 'codex', 1, now, now);
  insertStmt.run('gemini', 'Gemini CLI', 'gemini', 1, now, now);

  console.log('Migration 004 completed');
}
```

## 4. ディレクトリ構成

```
src/
├── lib/
│   ├── cli-tools/              # CLIツール関連（新規）
│   │   ├── index.ts            # エクスポート
│   │   ├── types.ts            # 型定義・インターフェース
│   │   ├── manager.ts          # CLIToolManager
│   │   ├── factory.ts          # CLIToolFactory
│   │   ├── base.ts             # BaseCLITool（共通実装）
│   │   ├── claude.ts           # ClaudeTool
│   │   ├── codex.ts            # CodexTool
│   │   └── gemini.ts           # GeminiTool
│   ├── claude-session.ts       # 既存（ClaudeTool移行後は削除）
│   └── db.ts                   # DB操作（拡張）
├── app/
│   └── api/
│       └── worktrees/
│           └── [id]/
│               ├── send/       # メッセージ送信（改修）
│               └── cli-tools/  # CLIツール管理API（新規）
│                   └── route.ts
└── components/
    └── worktree/
        ├── WorktreeCard.tsx    # CLIツール表示追加
        ├── WorktreeDetail.tsx  # CLIツール切り替え追加
        └── CLIToolSelector.tsx # CLIツール選択UI（新規）
```

## 5. API設計

### 5.1 CLIツール管理API

#### GET /api/worktrees/[id]/cli-tools
**用途**: 利用可能なCLIツール一覧を取得

**レスポンス**:
```json
{
  "current": "claude",
  "available": [
    {
      "id": "claude",
      "name": "Claude Code",
      "command": "claude",
      "installed": true
    },
    {
      "id": "codex",
      "name": "Codex CLI",
      "command": "codex",
      "installed": false
    },
    {
      "id": "gemini",
      "name": "Gemini CLI",
      "command": "gemini",
      "installed": true
    }
  ]
}
```

#### PUT /api/worktrees/[id]/cli-tools
**用途**: Worktreeが使用するCLIツールを変更

**リクエスト**:
```json
{
  "cliTool": "codex"
}
```

**レスポンス**:
```json
{
  "success": true,
  "worktree": {
    "id": "feature-foo",
    "name": "feature/foo",
    "swe_cli": "codex"
  }
}
```

### 5.2 メッセージ送信API（改修）

#### POST /api/worktrees/[id]/send

**既存の実装を改修し、CLIツールを動的に選択**

```typescript
// Before
const session = await startClaudeSession(...);

// After
const manager = CLIToolManager.getInstance();
const cliTool = manager.getTool(worktree.swe_cli || 'claude');
await cliTool.startSession(worktreeId, worktreePath, { baseUrl });
```

## 6. UI/UXコンポーネント設計

### 6.1 CLIToolSelector コンポーネント

```typescript
interface CLIToolSelectorProps {
  currentTool: CLIToolType;
  availableTools: CLIToolInfo[];
  onChange: (tool: CLIToolType) => void;
  disabled?: boolean;
}

export function CLIToolSelector({
  currentTool,
  availableTools,
  onChange,
  disabled = false,
}: CLIToolSelectorProps) {
  return (
    <div className="cli-tool-selector">
      <label>SWE CLI Tool</label>
      <select
        value={currentTool}
        onChange={(e) => onChange(e.target.value as CLIToolType)}
        disabled={disabled}
      >
        {availableTools.map(tool => (
          <option
            key={tool.id}
            value={tool.id}
            disabled={!tool.installed}
          >
            {tool.name} {!tool.installed && '(Not installed)'}
          </option>
        ))}
      </select>
    </div>
  );
}
```

### 6.2 WorktreeCard 表示変更

```typescript
// CLIツールアイコン/バッジの追加
<Badge variant="info">
  {worktree.swe_cli === 'claude' && '🤖 Claude'}
  {worktree.swe_cli === 'codex' && '💻 Codex'}
  {worktree.swe_cli === 'gemini' && '✨ Gemini'}
</Badge>
```

## 7. エラーハンドリング戦略

### 7.1 CLIツール未インストール時

```typescript
class CLIToolNotInstalledError extends Error {
  constructor(toolName: string) {
    super(`CLI tool '${toolName}' is not installed`);
    this.name = 'CLIToolNotInstalledError';
  }
}

// 使用例
if (!await tool.isInstalled()) {
  throw new CLIToolNotInstalledError(tool.name);
}
```

### 7.2 セッション起動失敗時

```typescript
class SessionStartError extends Error {
  constructor(toolName: string, originalError: Error) {
    super(`Failed to start ${toolName} session: ${originalError.message}`);
    this.name = 'SessionStartError';
  }
}
```

### 7.3 フォールバック戦略

```typescript
async function sendMessageWithFallback(
  worktreeId: string,
  message: string,
  primaryTool: CLIToolType
): Promise<void> {
  const manager = CLIToolManager.getInstance();

  try {
    const tool = manager.getTool(primaryTool);
    await tool.sendMessage(worktreeId, message);
  } catch (error) {
    console.error(`Primary tool '${primaryTool}' failed:`, error);

    // フォールバック: Claudeを使用
    if (primaryTool !== 'claude') {
      const claudeTool = manager.getTool('claude');
      await claudeTool.sendMessage(worktreeId, message);
    } else {
      throw error;
    }
  }
}
```

## 8. テスト戦略

### 8.1 ユニットテスト

```typescript
// tests/unit/cli-tools/claude.test.ts
describe('ClaudeTool', () => {
  let tool: ClaudeTool;

  beforeEach(() => {
    tool = new ClaudeTool();
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('claude');
    expect(tool.name).toBe('Claude Code');
  });

  it('should generate correct session name', () => {
    const sessionName = tool.getSessionName('feature-foo');
    expect(sessionName).toBe('mcbd-claude-feature-foo');
  });

  it('should check if installed', async () => {
    const installed = await tool.isInstalled();
    expect(typeof installed).toBe('boolean');
  });
});
```

### 8.2 統合テスト

```typescript
// tests/integration/cli-tool-manager.test.ts
describe('CLIToolManager Integration', () => {
  let manager: CLIToolManager;

  beforeAll(() => {
    manager = CLIToolManager.getInstance();
  });

  it('should get all available tools', async () => {
    const tools = await manager.getAvailableTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some(t => t.id === 'claude')).toBe(true);
  });

  it('should get specific tool', () => {
    const tool = manager.getTool('claude');
    expect(tool.id).toBe('claude');
  });

  it('should throw error for unknown tool', () => {
    expect(() => manager.getTool('unknown' as any)).toThrow();
  });
});
```

### 8.3 E2Eテスト（Playwright）

```typescript
test('should switch CLI tool and send message', async ({ page }) => {
  // Worktree詳細ページに移動
  await page.goto('/worktrees/feature-foo');

  // CLIツール選択
  await page.selectOption('select[name="cli-tool"]', 'codex');
  await page.click('button:text("Save")');

  // メッセージ送信
  await page.fill('textarea[placeholder*="Type your message"]', 'Test message');
  await page.press('textarea[placeholder*="Type your message"]', 'Enter');

  // レスポンス確認
  await expect(page.locator('.message-list')).toContainText('Test message');
});
```

## 9. パフォーマンス最適化

### 9.1 遅延ロード

```typescript
// CLIツール実装を遅延ロード
export class CLIToolFactory {
  private static toolCache: Map<CLIToolType, ICLITool> = new Map();

  static async createTool(type: CLIToolType): Promise<ICLITool> {
    if (this.toolCache.has(type)) {
      return this.toolCache.get(type)!;
    }

    let tool: ICLITool;
    switch (type) {
      case 'claude':
        const { ClaudeTool } = await import('./claude');
        tool = new ClaudeTool();
        break;
      case 'codex':
        const { CodexTool } = await import('./codex');
        tool = new CodexTool();
        break;
      case 'gemini':
        const { GeminiTool } = await import('./gemini');
        tool = new GeminiTool();
        break;
    }

    this.toolCache.set(type, tool);
    return tool;
  }
}
```

### 9.2 キャッシング

```typescript
// CLIツールのインストール状態をキャッシュ
class InstallationCache {
  private cache: Map<CLIToolType, { installed: boolean; timestamp: number }> = new Map();
  private readonly TTL = 60000; // 1分

  async isInstalled(tool: ICLITool): Promise<boolean> {
    const cached = this.cache.get(tool.id);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.TTL) {
      return cached.installed;
    }

    const installed = await tool.isInstalled();
    this.cache.set(tool.id, { installed, timestamp: now });
    return installed;
  }
}
```

## 10. セキュリティ考慮事項

### 10.1 コマンドインジェクション対策

```typescript
function sanitizeMessage(message: string): string {
  // 危険な文字をエスケープ
  return message
    .replace(/[`$()]/g, '\\$&')
    .replace(/[\n\r]/g, ' ');
}

async sendMessage(worktreeId: string, message: string): Promise<void> {
  const sanitized = sanitizeMessage(message);
  const sessionName = this.getSessionName(worktreeId);
  await sendKeys(sessionName, sanitized);
}
```

### 10.2 CLIツール実行権限

```typescript
// CLIツールの実行前に権限チェック
async validatePermissions(command: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`which ${command}`);
    const commandPath = stdout.trim();

    // 実行可能か確認
    await execAsync(`test -x ${commandPath}`);
    return true;
  } catch {
    return false;
  }
}
```

## 11. 移行戦略

### 11.1 段階的移行

**Step 1**: 抽象化レイヤー実装
- ICLIToolインターフェース定義
- CLIToolManager実装
- ClaudeTool実装（既存コードのリファクタリング）

**Step 2**: 既存機能の移行
- claude-session.tsの機能をClaudeToolに移行
- API routesでCLIToolManagerを使用するように変更
- 既存機能のテスト

**Step 3**: 新規CLIツール追加
- CodexTool実装
- GeminiTool実装
- UI/UX追加

**Step 4**: 完全移行
- claude-session.tsを非推奨化
- ドキュメント更新

### 11.2 互換性維持

```typescript
// 既存APIとの互換性を維持
export async function isClaudeRunning(worktreeId: string): Promise<boolean> {
  const manager = CLIToolManager.getInstance();
  const tool = manager.getTool('claude');
  return await tool.isRunning(worktreeId);
}

// 新しいAPI
export async function isCLIToolRunning(
  worktreeId: string,
  toolType: CLIToolType
): Promise<boolean> {
  const manager = CLIToolManager.getInstance();
  const tool = manager.getTool(toolType);
  return await tool.isRunning(worktreeId);
}
```

## 12. ドキュメント要件

### 12.1 開発者向けドキュメント

1. **新規CLIツール追加ガイド**
   - ICLIToolインターフェースの実装方法
   - CLIToolManagerへの登録方法
   - テストの書き方

2. **アーキテクチャドキュメント**
   - システム構成図
   - データフロー
   - シーケンス図

### 12.2 ユーザー向けドキュメント

1. **CLIツール選択ガイド**
   - 各ツールの特徴と使い分け
   - インストール方法
   - トラブルシューティング

## 13. 実装チェックリスト

### Phase 1: 基盤整備
- [ ] ICLIToolインターフェース定義
- [ ] CLIToolManager実装
- [ ] CLIToolFactory実装
- [ ] BaseCLITool実装（共通機能）
- [ ] ClaudeTool実装（リファクタリング）
- [ ] データベースマイグレーション
- [ ] ユニットテスト作成

### Phase 2: Codex CLI対応
- [ ] CodexTool実装
- [ ] Codex固有のコマンド調査
- [ ] Codexインストール確認機能
- [ ] Codexセッション管理
- [ ] 統合テスト作成

### Phase 3: Gemini CLI対応
- [ ] GeminiTool実装
- [ ] Gemini固有のコマンド調査
- [ ] Geminiインストール確認機能
- [ ] Geminiセッション管理
- [ ] 統合テスト作成

### Phase 4: UI/UX実装
- [ ] CLIToolSelectorコンポーネント
- [ ] WorktreeCard拡張
- [ ] WorktreeDetail拡張
- [ ] CLIツール管理API
- [ ] E2Eテスト作成

### Phase 5: テスト・調整
- [ ] 全体統合テスト
- [ ] パフォーマンステスト
- [ ] セキュリティテスト
- [ ] ドキュメント作成
- [ ] バグ修正

## 14. 補足事項

### 14.1 Codex CLI / Gemini CLI 調査事項

実装前に以下を調査する必要があります:
- [ ] Codex CLIの正式なコマンド名とインストール方法
- [ ] Codex CLIのメッセージ送信形式
- [ ] Codex CLIのWebhook対応状況
- [ ] Gemini CLIの正式なコマンド名とインストール方法
- [ ] Gemini CLIのメッセージ送信形式
- [ ] Gemini CLIのWebhook対応状況

### 14.2 将来の拡張性

- カスタムCLIツールのプラグイン対応
- CLIツールごとの詳細設定UI
- CLIツールのパフォーマンス比較機能
- CLIツールの自動選択機能（タスクに応じて最適なツールを推奨）
