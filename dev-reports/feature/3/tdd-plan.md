# Issue #4: 複数SWE CLI対応 - TDD作業計画

## TDDサイクル
各機能について以下のサイクルを回します:
1. **Red**: テストを先に書く（失敗する）
2. **Green**: テストを通すための最小限の実装
3. **Refactor**: コードをリファクタリング

## CLIツール情報
- **Claude Code**: `claude` (既存)
- **Codex CLI**: `codex` (新規) - Webhook不要
- **Gemini CLI**: `gemini` (新規) - Webhook不要

---

## Phase 1: 基盤整備（Week 1）

### Task 1.1: 型定義とインターフェース
**目標**: CLIツールの共通インターフェースを定義

#### Red (テスト作成)
```typescript
// tests/unit/cli-tools/types.test.ts
describe('CLITool Types', () => {
  it('should have valid CLI tool types', () => {
    const types: CLIToolType[] = ['claude', 'codex', 'gemini'];
    expect(types).toHaveLength(3);
  });
});
```

#### Green (実装)
```typescript
// src/lib/cli-tools/types.ts
export type CLIToolType = 'claude' | 'codex' | 'gemini';

export interface ICLITool {
  readonly id: CLIToolType;
  readonly name: string;
  readonly command: string;

  isInstalled(): Promise<boolean>;
  isRunning(worktreeId: string): Promise<boolean>;
  startSession(worktreeId: string, worktreePath: string): Promise<void>;
  sendMessage(worktreeId: string, message: string): Promise<void>;
  killSession(worktreeId: string): Promise<void>;
  getSessionName(worktreeId: string): string;
}
```

#### Refactor
- インターフェースのドキュメントコメント追加
- 型エクスポートの整理

**所要時間**: 2時間

---

### Task 1.2: BaseCLITool実装
**目標**: 各CLIツールの共通実装を提供する基底クラス

#### Red (テスト作成)
```typescript
// tests/unit/cli-tools/base.test.ts
describe('BaseCLITool', () => {
  it('should generate session name with correct format', () => {
    const tool = new TestCLITool(); // テスト用実装
    const sessionName = tool.getSessionName('feature-foo');
    expect(sessionName).toBe('mcbd-test-feature-foo');
  });

  it('should validate session name format', () => {
    const tool = new TestCLITool();
    const sessionName = tool.getSessionName('feature/bar');
    expect(sessionName).toMatch(/^mcbd-test-feature-bar$/);
  });
});
```

#### Green (実装)
```typescript
// src/lib/cli-tools/base.ts
import { execAsync } from '../utils';
import { ICLITool, CLIToolType } from './types';

export abstract class BaseCLITool implements ICLITool {
  abstract readonly id: CLIToolType;
  abstract readonly name: string;
  abstract readonly command: string;

  async isInstalled(): Promise<boolean> {
    try {
      await execAsync(`which ${this.command}`, { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  getSessionName(worktreeId: string): string {
    return `mcbd-${this.id}-${worktreeId}`;
  }

  abstract isRunning(worktreeId: string): Promise<boolean>;
  abstract startSession(worktreeId: string, worktreePath: string): Promise<void>;
  abstract sendMessage(worktreeId: string, message: string): Promise<void>;
  abstract killSession(worktreeId: string): Promise<void>;
}
```

#### Refactor
- エラーハンドリング強化
- ロギング追加

**所要時間**: 3時間

---

### Task 1.3: ClaudeTool実装（既存コードのリファクタリング）
**目標**: 既存のClaude Code機能を新しいアーキテクチャに移行

#### Red (テスト作成)
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
    expect(tool.command).toBe('claude');
  });

  it('should generate correct session name', () => {
    const sessionName = tool.getSessionName('feature-foo');
    expect(sessionName).toBe('mcbd-claude-feature-foo');
  });

  it('should check if installed', async () => {
    const installed = await tool.isInstalled();
    expect(typeof installed).toBe('boolean');
  });

  it('should check if session is running', async () => {
    const running = await tool.isRunning('feature-foo');
    expect(typeof running).toBe('boolean');
  });
});
```

#### Green (実装)
```typescript
// src/lib/cli-tools/claude.ts
import { BaseCLITool } from './base';
import { CLIToolType } from './types';
import { hasSession, createSession, sendKeys, killSession as killTmuxSession } from '../tmux';

export class ClaudeTool extends BaseCLITool {
  readonly id: CLIToolType = 'claude';
  readonly name = 'Claude Code';
  readonly command = 'claude';

  async isRunning(worktreeId: string): Promise<boolean> {
    const sessionName = this.getSessionName(worktreeId);
    return await hasSession(sessionName);
  }

  async startSession(worktreeId: string, worktreePath: string): Promise<void> {
    const sessionName = this.getSessionName(worktreeId);

    if (await this.isRunning(worktreeId)) {
      throw new Error(`Session ${sessionName} is already running`);
    }

    await createSession(sessionName, worktreePath);

    // Claude Code起動（Webhookなし）
    await sendKeys(sessionName, 'claude');
  }

  async sendMessage(worktreeId: string, message: string): Promise<void> {
    const sessionName = this.getSessionName(worktreeId);

    if (!await this.isRunning(worktreeId)) {
      throw new Error(`Session ${sessionName} is not running`);
    }

    await sendKeys(sessionName, message);
  }

  async killSession(worktreeId: string): Promise<void> {
    const sessionName = this.getSessionName(worktreeId);
    await killTmuxSession(sessionName);
  }
}
```

#### Refactor
- エラーメッセージの統一
- ロギング追加
- タイムアウト処理

**所要時間**: 4時間

---

### Task 1.4: CodexTool実装
**目標**: Codex CLIのサポート

#### Red (テスト作成)
```typescript
// tests/unit/cli-tools/codex.test.ts
describe('CodexTool', () => {
  let tool: CodexTool;

  beforeEach(() => {
    tool = new CodexTool();
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('codex');
    expect(tool.name).toBe('Codex CLI');
    expect(tool.command).toBe('codex');
  });

  it('should generate correct session name', () => {
    const sessionName = tool.getSessionName('feature-bar');
    expect(sessionName).toBe('mcbd-codex-feature-bar');
  });

  it('should start session without webhook', async () => {
    // モック使用
    const mockCreateSession = jest.spyOn(require('../tmux'), 'createSession');
    const mockSendKeys = jest.spyOn(require('../tmux'), 'sendKeys');

    await tool.startSession('test-id', '/path/to/worktree');

    expect(mockCreateSession).toHaveBeenCalledWith('mcbd-codex-test-id', '/path/to/worktree');
    expect(mockSendKeys).toHaveBeenCalledWith('mcbd-codex-test-id', 'codex');
  });
});
```

#### Green (実装)
```typescript
// src/lib/cli-tools/codex.ts
import { BaseCLITool } from './base';
import { CLIToolType } from './types';
import { hasSession, createSession, sendKeys, killSession as killTmuxSession } from '../tmux';

export class CodexTool extends BaseCLITool {
  readonly id: CLIToolType = 'codex';
  readonly name = 'Codex CLI';
  readonly command = 'codex';

  async isRunning(worktreeId: string): Promise<boolean> {
    const sessionName = this.getSessionName(worktreeId);
    return await hasSession(sessionName);
  }

  async startSession(worktreeId: string, worktreePath: string): Promise<void> {
    const sessionName = this.getSessionName(worktreeId);

    if (await this.isRunning(worktreeId)) {
      throw new Error(`Session ${sessionName} is already running`);
    }

    await createSession(sessionName, worktreePath);

    // Codex CLI起動（Webhookなし）
    await sendKeys(sessionName, 'codex');
  }

  async sendMessage(worktreeId: string, message: string): Promise<void> {
    const sessionName = this.getSessionName(worktreeId);

    if (!await this.isRunning(worktreeId)) {
      throw new Error(`Session ${sessionName} is not running`);
    }

    await sendKeys(sessionName, message);
  }

  async killSession(worktreeId: string): Promise<void> {
    const sessionName = this.getSessionName(worktreeId);
    await killTmuxSession(sessionName);
  }
}
```

#### Refactor
- ClaudeToolとの共通部分をBaseCLIToolに移動検討
- エラーハンドリング統一

**所要時間**: 3時間

---

### Task 1.5: GeminiTool実装
**目標**: Gemini CLIのサポート

#### Red (テスト作成)
```typescript
// tests/unit/cli-tools/gemini.test.ts
describe('GeminiTool', () => {
  let tool: GeminiTool;

  beforeEach(() => {
    tool = new GeminiTool();
  });

  it('should have correct id and name', () => {
    expect(tool.id).toBe('gemini');
    expect(tool.name).toBe('Gemini CLI');
    expect(tool.command).toBe('gemini');
  });

  it('should generate correct session name', () => {
    const sessionName = tool.getSessionName('feature-baz');
    expect(sessionName).toBe('mcbd-gemini-feature-baz');
  });
});
```

#### Green (実装)
```typescript
// src/lib/cli-tools/gemini.ts
import { BaseCLITool } from './base';
import { CLIToolType } from './types';
import { hasSession, createSession, sendKeys, killSession as killTmuxSession } from '../tmux';

export class GeminiTool extends BaseCLITool {
  readonly id: CLIToolType = 'gemini';
  readonly name = 'Gemini CLI';
  readonly command = 'gemini';

  async isRunning(worktreeId: string): Promise<boolean> {
    const sessionName = this.getSessionName(worktreeId);
    return await hasSession(sessionName);
  }

  async startSession(worktreeId: string, worktreePath: string): Promise<void> {
    const sessionName = this.getSessionName(worktreeId);

    if (await this.isRunning(worktreeId)) {
      throw new Error(`Session ${sessionName} is already running`);
    }

    await createSession(sessionName, worktreePath);

    // Gemini CLI起動（Webhookなし）
    await sendKeys(sessionName, 'gemini');
  }

  async sendMessage(worktreeId: string, message: string): Promise<void> {
    const sessionName = this.getSessionName(worktreeId);

    if (!await this.isRunning(worktreeId)) {
      throw new Error(`Session ${sessionName} is not running`);
    }

    await sendKeys(sessionName, message);
  }

  async killSession(worktreeId: string): Promise<void> {
    const sessionName = this.getSessionName(worktreeId);
    await killTmuxSession(sessionName);
  }
}
```

#### Refactor
- 3つのツール実装の共通化を検討
- テンプレートメソッドパターンの適用検討

**所要時間**: 2時間

---

### Task 1.6: CLIToolManager実装
**目標**: 全CLIツールの統合管理

#### Red (テスト作成)
```typescript
// tests/unit/cli-tools/manager.test.ts
describe('CLIToolManager', () => {
  let manager: CLIToolManager;

  beforeEach(() => {
    manager = CLIToolManager.getInstance();
  });

  it('should be singleton', () => {
    const manager2 = CLIToolManager.getInstance();
    expect(manager).toBe(manager2);
  });

  it('should get tool by type', () => {
    const claudeTool = manager.getTool('claude');
    expect(claudeTool.id).toBe('claude');

    const codexTool = manager.getTool('codex');
    expect(codexTool.id).toBe('codex');

    const geminiTool = manager.getTool('gemini');
    expect(geminiTool.id).toBe('gemini');
  });

  it('should throw error for unknown tool', () => {
    expect(() => manager.getTool('unknown' as any)).toThrow();
  });

  it('should get all available tools', async () => {
    const tools = await manager.getAvailableTools();
    expect(tools.length).toBe(3);
    expect(tools.map(t => t.id)).toEqual(['claude', 'codex', 'gemini']);
  });
});
```

#### Green (実装)
```typescript
// src/lib/cli-tools/manager.ts
import { ICLITool, CLIToolType } from './types';
import { ClaudeTool } from './claude';
import { CodexTool } from './codex';
import { GeminiTool } from './gemini';

export interface CLIToolInfo {
  id: CLIToolType;
  name: string;
  command: string;
  installed: boolean;
}

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

  private registerTools(): void {
    this.tools.set('claude', new ClaudeTool());
    this.tools.set('codex', new CodexTool());
    this.tools.set('gemini', new GeminiTool());
  }

  public getTool(type: CLIToolType): ICLITool {
    const tool = this.tools.get(type);
    if (!tool) {
      throw new Error(`CLI tool '${type}' not found`);
    }
    return tool;
  }

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
```

#### Refactor
- ツール登録のDI対応検討
- キャッシング機能追加

**所要時間**: 3時間

---

### Task 1.7: データベースマイグレーション
**目標**: worktreesテーブルにswe_cliカラムを追加

#### Red (テスト作成)
```typescript
// tests/unit/db-migrations.test.ts
describe('Migration 004: SWE CLI Support', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initDatabase(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should add swe_cli column to worktrees table', () => {
    migration_004_add_swe_cli_support(db);

    const tableInfo = db.prepare('PRAGMA table_info(worktrees)').all() as any[];
    const sweCLIColumn = tableInfo.find(col => col.name === 'swe_cli');

    expect(sweCLIColumn).toBeDefined();
    expect(sweCLIColumn.type).toBe('TEXT');
    expect(sweCLIColumn.dflt_value).toBe("'claude'");
  });

  it('should create cli_tool_configs table', () => {
    migration_004_add_swe_cli_support(db);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as any[];
    const hasTable = tables.some(t => t.name === 'cli_tool_configs');

    expect(hasTable).toBe(true);
  });

  it('should insert default CLI tool configs', () => {
    migration_004_add_swe_cli_support(db);

    const configs = db.prepare('SELECT * FROM cli_tool_configs').all() as any[];
    expect(configs.length).toBe(3);

    const ids = configs.map(c => c.id);
    expect(ids).toContain('claude');
    expect(ids).toContain('codex');
    expect(ids).toContain('gemini');
  });
});
```

#### Green (実装)
```typescript
// src/lib/db-migrations.ts
export function migration_004_add_swe_cli_support(db: Database.Database): void {
  console.log('Running migration 004: Add SWE CLI support');

  // worktreesテーブルにswe_cliカラム追加
  try {
    db.exec(`
      ALTER TABLE worktrees
      ADD COLUMN swe_cli TEXT DEFAULT 'claude';
    `);
  } catch (error) {
    // カラムが既に存在する場合はスキップ
    console.log('swe_cli column already exists, skipping');
  }

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

// マイグレーション配列に追加
export const migrations = [
  // ... 既存のマイグレーション
  migration_004_add_swe_cli_support,
];
```

#### Refactor
- マイグレーションのロールバック機能追加検討
- エラーハンドリング強化

**所要時間**: 3時間

---

## Phase 2: API実装（Week 2）

### Task 2.1: CLIツール管理API（GET）
**目標**: 利用可能なCLIツール一覧を取得

#### Red (テスト作成)
```typescript
// tests/integration/api-cli-tools.test.ts
describe('GET /api/worktrees/[id]/cli-tools', () => {
  it('should return available CLI tools', async () => {
    const response = await fetch('/api/worktrees/test-id/cli-tools');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveProperty('current');
    expect(data).toHaveProperty('available');
    expect(data.available).toHaveLength(3);
  });

  it('should include installation status', async () => {
    const response = await fetch('/api/worktrees/test-id/cli-tools');
    const data = await response.json();

    data.available.forEach((tool: any) => {
      expect(tool).toHaveProperty('id');
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('installed');
      expect(typeof tool.installed).toBe('boolean');
    });
  });
});
```

#### Green (実装)
```typescript
// src/app/api/worktrees/[id]/cli-tools/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDbInstance } from '@/lib/db-instance';
import { getWorktreeById } from '@/lib/db';
import { CLIToolManager } from '@/lib/cli-tools';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDbInstance();
    const worktree = getWorktreeById(db, params.id);

    if (!worktree) {
      return NextResponse.json(
        { error: 'Worktree not found' },
        { status: 404 }
      );
    }

    const manager = CLIToolManager.getInstance();
    const available = await manager.getAvailableTools();

    return NextResponse.json({
      current: worktree.swe_cli || 'claude',
      available,
    });
  } catch (error) {
    console.error('Error fetching CLI tools:', error);
    return NextResponse.json(
      { error: 'Failed to fetch CLI tools' },
      { status: 500 }
    );
  }
}
```

#### Refactor
- レスポンスキャッシング
- エラーハンドリング強化

**所要時間**: 3時間

---

### Task 2.2: CLIツール管理API（PUT）
**目標**: Worktreeが使用するCLIツールを変更

#### Red (テスト作成)
```typescript
describe('PUT /api/worktrees/[id]/cli-tools', () => {
  it('should update CLI tool', async () => {
    const response = await fetch('/api/worktrees/test-id/cli-tools', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliTool: 'codex' }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.worktree.swe_cli).toBe('codex');
  });

  it('should reject invalid CLI tool', async () => {
    const response = await fetch('/api/worktrees/test-id/cli-tools', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliTool: 'invalid' }),
    });

    expect(response.status).toBe(400);
  });
});
```

#### Green (実装)
```typescript
// src/app/api/worktrees/[id]/cli-tools/route.ts
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { cliTool } = body;

    // バリデーション
    const validTools: CLIToolType[] = ['claude', 'codex', 'gemini'];
    if (!validTools.includes(cliTool)) {
      return NextResponse.json(
        { error: 'Invalid CLI tool' },
        { status: 400 }
      );
    }

    const db = getDbInstance();

    // Worktree更新
    const stmt = db.prepare(`
      UPDATE worktrees
      SET swe_cli = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(cliTool, Date.now(), params.id);

    const worktree = getWorktreeById(db, params.id);

    return NextResponse.json({
      success: true,
      worktree,
    });
  } catch (error) {
    console.error('Error updating CLI tool:', error);
    return NextResponse.json(
      { error: 'Failed to update CLI tool' },
      { status: 500 }
    );
  }
}
```

#### Refactor
- トランザクション処理追加
- 監査ログ記録

**所要時間**: 3時間

---

### Task 2.3: メッセージ送信API改修
**目標**: CLIツールを動的に選択してメッセージ送信

#### Red (テスト作成)
```typescript
// tests/integration/api-send-message.test.ts
describe('POST /api/worktrees/[id]/send', () => {
  it('should send message using Claude', async () => {
    // Worktreeのswe_cliを'claude'に設定
    await setupWorktree('test-id', 'claude');

    const response = await fetch('/api/worktrees/test-id/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Test message' }),
    });

    expect(response.status).toBe(200);
  });

  it('should send message using Codex', async () => {
    await setupWorktree('test-id', 'codex');

    const response = await fetch('/api/worktrees/test-id/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Test message' }),
    });

    expect(response.status).toBe(200);
  });
});
```

#### Green (実装)
```typescript
// src/app/api/worktrees/[id]/send/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { message } = body;

    const db = getDbInstance();
    const worktree = getWorktreeById(db, params.id);

    if (!worktree) {
      return NextResponse.json(
        { error: 'Worktree not found' },
        { status: 404 }
      );
    }

    // CLIツールを取得
    const manager = CLIToolManager.getInstance();
    const cliTool = manager.getTool(worktree.swe_cli || 'claude');

    // セッションが実行中か確認
    const isRunning = await cliTool.isRunning(params.id);

    if (!isRunning) {
      // セッション開始
      await cliTool.startSession(params.id, worktree.path);
    }

    // メッセージ送信
    await cliTool.sendMessage(params.id, message);

    // メッセージをDBに保存
    saveMessage(db, {
      worktreeId: params.id,
      role: 'user',
      content: message,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
```

#### Refactor
- エラーハンドリング強化
- タイムアウト処理

**所要時間**: 4時間

---

## Phase 3: UI/UX実装（Week 3）

### Task 3.1: CLIToolSelectorコンポーネント
**目標**: CLIツール選択UIコンポーネント

#### Red (テスト作成)
```typescript
// tests/unit/components/CLIToolSelector.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { CLIToolSelector } from '@/components/worktree/CLIToolSelector';

describe('CLIToolSelector', () => {
  const mockTools = [
    { id: 'claude', name: 'Claude Code', command: 'claude', installed: true },
    { id: 'codex', name: 'Codex CLI', command: 'codex', installed: false },
    { id: 'gemini', name: 'Gemini CLI', command: 'gemini', installed: true },
  ];

  it('should render all tools', () => {
    render(
      <CLIToolSelector
        currentTool="claude"
        availableTools={mockTools}
        onChange={() => {}}
      />
    );

    expect(screen.getByText('Claude Code')).toBeInTheDocument();
    expect(screen.getByText(/Codex CLI.*Not installed/)).toBeInTheDocument();
    expect(screen.getByText('Gemini CLI')).toBeInTheDocument();
  });

  it('should call onChange when tool is selected', () => {
    const onChange = jest.fn();
    render(
      <CLIToolSelector
        currentTool="claude"
        availableTools={mockTools}
        onChange={onChange}
      />
    );

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'gemini' } });

    expect(onChange).toHaveBeenCalledWith('gemini');
  });

  it('should disable uninstalled tools', () => {
    render(
      <CLIToolSelector
        currentTool="claude"
        availableTools={mockTools}
        onChange={() => {}}
      />
    );

    const codexOption = screen.getByText(/Codex CLI/).closest('option');
    expect(codexOption).toBeDisabled();
  });
});
```

#### Green (実装)
```typescript
// src/components/worktree/CLIToolSelector.tsx
'use client';

import React from 'react';
import { CLIToolType, CLIToolInfo } from '@/lib/cli-tools';

export interface CLIToolSelectorProps {
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
    <div className="space-y-2">
      <label htmlFor="cli-tool" className="text-sm font-medium text-gray-700">
        SWE CLI Tool
      </label>
      <select
        id="cli-tool"
        value={currentTool}
        onChange={(e) => onChange(e.target.value as CLIToolType)}
        disabled={disabled}
        className="input w-full"
      >
        {availableTools.map((tool) => (
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

#### Refactor
- アイコン追加
- ツールの説明追加

**所要時間**: 3時間

---

### Task 3.2: WorktreeCard拡張
**目標**: CLIツールバッジ表示

#### Red (テスト作成)
```typescript
// tests/unit/components/WorktreeCard.test.tsx
it('should display CLI tool badge', () => {
  const worktree = {
    ...mockWorktree,
    swe_cli: 'codex',
  };

  render(<WorktreeCard worktree={worktree} />);

  expect(screen.getByText(/Codex/)).toBeInTheDocument();
});
```

#### Green (実装)
```typescript
// src/components/worktree/WorktreeCard.tsx
export function WorktreeCard({ worktree }: WorktreeCardProps) {
  const { swe_cli = 'claude' } = worktree;

  const cliToolLabels = {
    claude: '🤖 Claude',
    codex: '💻 Codex',
    gemini: '✨ Gemini',
  };

  return (
    <Card>
      {/* ... 既存コード ... */}
      <Badge variant="info">
        {cliToolLabels[swe_cli]}
      </Badge>
    </Card>
  );
}
```

#### Refactor
- バッジカラーの調整
- ツールチップ追加

**所要時間**: 2時間

---

### Task 3.3: WorktreeDetail拡張
**目標**: CLIツール切り替え機能

#### Red (テスト作成)
```typescript
// tests/integration/worktree-detail-cli-tool.test.tsx
it('should allow CLI tool switching', async () => {
  render(<WorktreeDetail worktreeId="test-id" />);

  // CLIツール選択
  const select = await screen.findByRole('combobox', { name: /CLI Tool/ });
  fireEvent.change(select, { target: { value: 'codex' } });

  // 保存ボタンクリック
  const saveButton = screen.getByRole('button', { name: /Save/ });
  fireEvent.click(saveButton);

  // 確認
  await waitFor(() => {
    expect(screen.getByText(/Successfully updated/)).toBeInTheDocument();
  });
});
```

#### Green (実装)
```typescript
// src/components/worktree/WorktreeDetail.tsx
export function WorktreeDetail({ worktreeId }: WorktreeDetailProps) {
  const [selectedTool, setSelectedTool] = useState<CLIToolType>('claude');
  const [availableTools, setAvailableTools] = useState<CLIToolInfo[]>([]);

  useEffect(() => {
    fetchCLITools();
  }, [worktreeId]);

  const fetchCLITools = async () => {
    const response = await fetch(`/api/worktrees/${worktreeId}/cli-tools`);
    const data = await response.json();
    setSelectedTool(data.current);
    setAvailableTools(data.available);
  };

  const handleToolChange = async (tool: CLIToolType) => {
    setSelectedTool(tool);

    const response = await fetch(`/api/worktrees/${worktreeId}/cli-tools`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliTool: tool }),
    });

    if (response.ok) {
      // 成功通知
    }
  };

  return (
    <div>
      {/* ... 既存コード ... */}
      <CLIToolSelector
        currentTool={selectedTool}
        availableTools={availableTools}
        onChange={handleToolChange}
      />
    </div>
  );
}
```

#### Refactor
- エラーハンドリング
- ローディング状態

**所要時間**: 4時間

---

## Phase 4: 統合テスト（Week 4）

### Task 4.1: E2Eテスト
**目標**: Playwrightを使用したE2Eテスト

#### Red (テスト作成)
```typescript
// tests/e2e/cli-tool-switching.spec.ts
import { test, expect } from '@playwright/test';

test('complete CLI tool workflow', async ({ page }) => {
  // ログイン・セットアップ
  await page.goto('/');

  // Worktree詳細ページ
  await page.click('text=feature/test');

  // CLIツール選択
  await page.selectOption('select[name="cli-tool"]', 'codex');
  await page.click('button:text("Save")');
  await expect(page.locator('.toast')).toContainText('Updated');

  // メッセージ送信
  await page.fill('textarea', 'Hello Codex');
  await page.press('textarea', 'Enter');

  // レスポンス確認
  await expect(page.locator('.message-list')).toContainText('Hello Codex');
});
```

#### Green (実装)
- Phase 1-3の実装で既に動作する

#### Refactor
- テストケース追加
- エッジケース対応

**所要時間**: 6時間

---

## タイムライン

| Phase | タスク | 所要時間 | 累積時間 |
|-------|--------|---------|----------|
| **Phase 1** | 型定義 | 2h | 2h |
| | BaseCLITool | 3h | 5h |
| | ClaudeTool | 4h | 9h |
| | CodexTool | 3h | 12h |
| | GeminiTool | 2h | 14h |
| | CLIToolManager | 3h | 17h |
| | DBマイグレーション | 3h | 20h |
| **Phase 2** | CLIツールAPI (GET) | 3h | 23h |
| | CLIツールAPI (PUT) | 3h | 26h |
| | 送信API改修 | 4h | 30h |
| **Phase 3** | CLIToolSelector | 3h | 33h |
| | WorktreeCard拡張 | 2h | 35h |
| | WorktreeDetail拡張 | 4h | 39h |
| **Phase 4** | E2Eテスト | 6h | 45h |

**合計所要時間**: 約45時間（約6営業日）

## 実装順序

1. **Week 1 (Phase 1)**: 基盤整備
   - Day 1-2: 型定義、BaseCLITool、ClaudeTool
   - Day 3-4: CodexTool、GeminiTool、CLIToolManager
   - Day 5: DBマイグレーション、テスト

2. **Week 2 (Phase 2)**: API実装
   - Day 1-2: CLIツール管理API
   - Day 3: メッセージ送信API改修
   - Day 4-5: テスト・バグ修正

3. **Week 3 (Phase 3)**: UI/UX実装
   - Day 1-2: CLIToolSelector
   - Day 3: WorktreeCard拡張
   - Day 4-5: WorktreeDetail拡張、テスト

4. **Week 4 (Phase 4)**: 統合テスト
   - Day 1-3: E2Eテスト
   - Day 4-5: バグ修正、リファクタリング

## 成功基準
- [ ] 全ユニットテストが通る（カバレッジ80%以上）
- [ ] 全統合テストが通る
- [ ] E2Eテストが通る
- [ ] 既存機能（Claude）が正常動作
- [ ] Codex、Geminiでメッセージ送受信可能
- [ ] CLIツール切り替えがスムーズ
- [ ] パフォーマンス劣化なし

## リスク管理
- **リスク**: Codex/Gemini CLIの仕様が想定と異なる
  - **対策**: 早期に実機テスト、モック使用も検討

- **リスク**: 既存機能への影響
  - **対策**: テストを先に書く（TDD）、段階的移行

- **リスク**: 時間不足
  - **対策**: MVPを優先、拡張機能は後回し
