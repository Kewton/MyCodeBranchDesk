# サイドバーステータスバリエーション分析

Issue #31: サイドバーのUX改善

---

## 1. インジケーターの種類

### 1.1 左側インジケーター（BranchStatus）

セッションの状態を示す。

| ステータス | 表示 | 意味 |
|-----------|------|------|
| `idle` | グレーの丸 | セッション未起動 |
| `ready` | 緑の丸 | セッション起動中、新規入力待ち |
| `running` | 青スピナー | 処理中（thinking） |
| `waiting` | 黄色の丸 | yes/noプロンプト回答待ち（要対応） |
| `generating` | 青スピナー | 生成中（現状runningと同等） |

> **変更点**: `waiting` を緑から**黄色**に変更。`ready`との視覚的区別を明確化し、ユーザーの対応が必要であることを強調。

### 1.2 右側インジケーター（hasUnread）

未読メッセージの有無を示す。

| 状態 | 表示 | 意味 |
|------|------|------|
| `true` | 青い小丸 | 未読メッセージあり |
| `false` | なし | 未読なし |

### 1.3 注意事項

- **ポーリング間隔**: 状態遷移は即時ではなく、約2秒のポーリング間隔で更新される
- **ターミナル優先**: DBの状態よりターミナルの実際の状態を優先して判定

---

## 2. BranchStatus の詳細シナリオ

### 2.1 idle（グレー）

**条件**: tmuxセッションが存在しない

**シナリオ**:
- アプリ起動直後、まだClaude Codeを起動していない
- ユーザーが明示的にセッションを終了した
- セッションがタイムアウトで終了した

### 2.2 ready（緑）

**条件**: セッション起動中 AND 処理中でない AND プロンプト待ちでない

**シナリオ**:
- Claude Codeが起動し、`❯` プロンプトが表示されている
- Claudeが回答を完了し、次の入力を待っている
- ユーザーがメッセージを入力する直前の状態

**ターミナル表示例**:
```
────────────────────────────────────────
❯
```

### 2.3 running（青スピナー）

**条件**: セッション起動中 AND 処理中（thinking/considering）

**シナリオ**:
- ユーザーがメッセージを送信した直後
- Claudeが考え中（✻ Considering...）
- Claudeがコードを読み込み中
- Claudeがファイルを検索中

**ターミナル表示例**:
```
✻ Considering… (ctrl+c to interrupt · 30s)
```
```
· Beboppin'…
```

### 2.4 waiting（黄色）

**条件**: セッション起動中 AND yes/no または複数選択プロンプトが表示されている

**シナリオ**:
- Claudeがファイル編集の許可を求めている
- Claudeがコマンド実行の許可を求めている
- 複数の選択肢から選ぶ必要がある

**ターミナル表示例**:
```
Do you want to proceed?
❯ 1. Yes
  2. No

Esc to cancel · Tab to add additional instructions
```

> **UXポイント**: 黄色はユーザーの即座のアクションが必要であることを示す警告色

### 2.5 generating（青スピナー）

**条件**: Claudeがレスポンスを生成中

**現状**: `running`と同等の扱い。将来的に分離する可能性あり。

**シナリオ**:
- Claudeがコードを出力中
- Claudeが長文の回答を生成中

---

## 3. hasUnread の詳細シナリオ

### 3.1 現在の実装（問題あり）

```typescript
const hasUnread = Boolean(worktree.lastUserMessageAt);
```

**問題**: 一度でもメッセージがあれば常に`true`

### 3.2 あるべき実装

```typescript
const hasUnread = worktree.lastViewedAt
  ? (worktree.lastAssistantMessageAt > worktree.lastViewedAt)
  : Boolean(worktree.lastAssistantMessageAt);
```

### 3.3 未読となるべきシナリオ

| シナリオ | hasUnread | 理由 |
|---------|-----------|------|
| 新しいアシスタントメッセージがある | `true` | 閲覧前の新規メッセージ |
| 新しいプロンプトが表示された | `true` | 対応が必要 |
| ユーザーが別ブランチにいる間にClaudeが回答した | `true` | 見逃し防止 |
| ユーザーがブランチを閲覧した直後 | `false` | 既読 |
| 古いメッセージのみ | `false` | すでに閲覧済み |

### 3.4 既読となるべきタイミング

| タイミング | 処理 |
|-----------|------|
| ブランチを選択（クリック） | `lastViewedAt = now()` |
| メッセージ一覧を表示 | `lastViewedAt = now()` |
| プロンプトに回答 | `lastViewedAt = now()` |

---

## 4. 状態遷移図

### 4.1 BranchStatus の遷移

```
                         ┌─────────────────────────────────────────┐
                         │                                         │
                         ▼                                         │
┌──────┐  start    ┌───────┐  send message  ┌─────────┐            │
│ idle │ ────────► │ ready │ ─────────────► │ running │            │
└──────┘           └───────┘                └─────────┘            │
    ▲                  ▲                         │                 │
    │                  │                         │                 │
    │                  │   response complete     │                 │
    │                  └─────────────────────────┤                 │
    │                  ▲                         │                 │
    │                  │                         ▼                 │
    │                  │   prompt answered  ┌─────────┐            │
    │                  └─────────────────── │ waiting │            │
    │                  ▲                    └─────────┘            │
    │                  │                         │                 │
    │                  │   output complete       │                 │
    │                  │                         ▼                 │
    │                  │                   ┌────────────┐          │
    │                  └─────────────────  │ generating │          │
    │                                      └────────────┘          │
    │                                            │                 │
    │              session end                   │                 │
    └────────────────────────────────────────────┴─────────────────┘
```

### 4.2 hasUnread の遷移

```
                      new assistant message
                    (while viewing other branch)
    ┌───────┐  ─────────────────────────────────►  ┌──────┐
    │ false │                                      │ true │
    └───────┘  ◄─────────────────────────────────  └──────┘
                       view this branch
                    (lastViewedAt = now())
```

---

## 5. 組み合わせマトリックス

### 5.1 全組み合わせ（理論上）

| BranchStatus | hasUnread | 発生シナリオ | 優先度 |
|--------------|-----------|-------------|--------|
| idle | false | 新規worktree、セッション未起動 | 高 |
| idle | true | セッション終了後、未読メッセージあり | 中 |
| ready | false | アクティブセッション、既読 | 高 |
| ready | true | アクティブセッション、別タブで回答があった | 中 |
| running | false | 処理中、自分が送信したばかり | 高 |
| running | true | 処理中、別ブランチから戻ってきた | 低 |
| waiting | false | プロンプト表示中、自分で見ている | 高 |
| waiting | true | プロンプト表示中、別タブから戻った | 高 |
| generating | false | 生成中 | 高 |
| generating | true | 生成中（稀） | 低 |

### 5.2 実際に頻出するパターン

| パターン | 状態 | ユーザーアクション |
|---------|------|------------------|
| 作業開始前 | idle + false | セッション起動 |
| 作業中 | ready + false | メッセージ入力 |
| 送信直後 | running + false | 待機 |
| プロンプト表示 | waiting + false | Yes/No選択 |
| 別ブランチで作業後戻る | ready + true | 確認して既読に |
| マルチタスク中 | waiting + true | 緊急対応が必要 |

---

## 6. 推奨される改修

### 6.1 DB スキーマ追加

```sql
ALTER TABLE worktrees ADD COLUMN last_viewed_at TEXT;
ALTER TABLE worktrees ADD COLUMN last_assistant_message_at TEXT;
```

### 6.2 型定義追加

```typescript
interface Worktree {
  // 既存フィールド...
  lastViewedAt?: Date;
  lastAssistantMessageAt?: Date;
}
```

### 6.3 lastAssistantMessageAt の取得

```typescript
// lib/db.ts に追加
// chat_messagesテーブルから role='assistant' の最新タイムスタンプを取得
function getLastAssistantMessageAt(db: Database, worktreeId: string): Date | undefined {
  const row = db.prepare(`
    SELECT MAX(timestamp) as last_at
    FROM chat_messages
    WHERE worktree_id = ? AND role = 'assistant'
  `).get(worktreeId) as { last_at: string | null };

  return row?.last_at ? new Date(row.last_at) : undefined;
}

// getWorktreeById, getWorktrees で使用
```

### 6.4 hasUnread ロジック改修

```typescript
function calculateHasUnread(worktree: Worktree): boolean {
  // アシスタントメッセージがなければ未読なし
  if (!worktree.lastAssistantMessageAt) {
    return false;
  }

  // 最後の閲覧時刻がない場合は、メッセージがあれば未読
  if (!worktree.lastViewedAt) {
    return true;
  }

  // アシスタントの最後のメッセージが閲覧後なら未読
  return worktree.lastAssistantMessageAt > worktree.lastViewedAt;
}
```

### 6.5 既読更新API

```typescript
// PATCH /api/worktrees/:id/viewed
export async function markAsViewed(worktreeId: string): Promise<void> {
  const db = getDbInstance();
  db.prepare(`
    UPDATE worktrees
    SET last_viewed_at = ?
    WHERE id = ?
  `).run(new Date().toISOString(), worktreeId);
}
```

### 6.6 フロントエンド連携

```typescript
// ブランチ選択時に既読更新
const handleBranchSelect = async (branchId: string) => {
  setSelectedBranch(branchId);
  await fetch(`/api/worktrees/${branchId}/viewed`, { method: 'PATCH' });
};
```

### 6.7 waitingステータスの色変更

```typescript
// BranchStatusIndicator.tsx
const statusConfig: Record<BranchStatus, StatusConfig> = {
  // ...
  waiting: {
    color: 'bg-yellow-500',  // 緑から黄色に変更
    label: 'Waiting for response',
    type: 'dot',
  },
  // ...
};
```

---

## 7. 状態遷移テーブル（詳細）

> **注意**: 状態遷移は約2秒のポーリング間隔で更新されるため、即時反映ではない

### 7.1 基本フロー

| # | ターミナル状態 | 左 | 右 | アクション | 左(後) | 右(後) |
|---|--------------|----|----|-----------|--------|--------|
| 1 | セッションなし | idle(灰) | false | セッション起動 | ready(緑) | false |
| 2 | `❯` プロンプト表示 | ready(緑) | false | メッセージ送信 | running(青) | false |
| 3 | `✻ Considering...` | running(青) | false | （待機） | running(青) | false |
| 4 | 回答出力中 | running(青) | false | （待機） | running(青) | false |
| 5 | 回答完了、`❯` 表示 | running(青) | false | （自動遷移） | ready(緑) | false |
| 6 | `❯` プロンプト表示 | ready(緑) | false | セッション終了 | idle(灰) | false |

### 7.2 yes/no プロンプトフロー

| # | ターミナル状態 | 左 | 右 | アクション | 左(後) | 右(後) |
|---|--------------|----|----|-----------|--------|--------|
| 1 | `✻ Considering...` | running(青) | false | （待機） | running(青) | false |
| 2 | yes/no プロンプト表示 | running(青) | false | （自動遷移） | waiting(黄) | false |
| 3 | yes/no プロンプト表示 | waiting(黄) | false | Yes選択（UI） | running(青) | false |
| 4 | yes/no プロンプト表示 | waiting(黄) | false | Yes入力（ターミナル） | running(青) | false |
| 5 | `✻ Considering...` | running(青) | false | （待機） | running(青) | false |
| 6 | 回答完了、`❯` 表示 | running(青) | false | （自動遷移） | ready(緑) | false |

### 7.3 マルチタスクフロー（別ブランチで作業中）

| # | ターミナル状態 | 左 | 右 | アクション | 左(後) | 右(後) |
|---|--------------|----|----|-----------|--------|--------|
| 1 | `❯` プロンプト表示 | ready(緑) | false | 別ブランチを選択 | ready(緑) | false |
| 2 | `❯` プロンプト表示 | ready(緑) | false | （別タブ作業中に）Claudeが回答完了 | ready(緑) | **true** |
| 3 | `❯` プロンプト表示 | ready(緑) | true | このブランチを選択 | ready(緑) | **false** |

### 7.4 マルチタスクフロー（プロンプト待ち）

| # | ターミナル状態 | 左 | 右 | アクション | 左(後) | 右(後) |
|---|--------------|----|----|-----------|--------|--------|
| 1 | `✻ Considering...` | running(青) | false | 別ブランチを選択 | running(青) | false |
| 2 | yes/no プロンプト表示 | waiting(黄) | false | （別タブ作業中に）プロンプト表示 | waiting(黄) | **true** |
| 3 | yes/no プロンプト表示 | waiting(黄) | true | このブランチを選択 | waiting(黄) | **false** |
| 4 | yes/no プロンプト表示 | waiting(黄) | false | Yes選択 | running(青) | false |

### 7.5 ターミナルで直接操作

| # | ターミナル状態 | 左 | 右 | アクション | 左(後) | 右(後) |
|---|--------------|----|----|-----------|--------|--------|
| 1 | yes/no プロンプト表示 | waiting(黄) | false | ターミナルでYes入力 | running(青) | false |
| 2 | `❯` プロンプト表示 | ready(緑) | false | ターミナルでメッセージ入力 | running(青) | false |
| 3 | `✻ Considering...` | running(青) | false | ターミナルでCtrl+C | ready(緑) | false |

### 7.6 エラー・例外ケース

| # | ターミナル状態 | 左 | 右 | アクション | 左(後) | 右(後) |
|---|--------------|----|----|-----------|--------|--------|
| 1 | セッションクラッシュ | running(青) | * | （自動検出） | idle(灰) | *保持* |
| 2 | ネットワークエラー | running(青) | * | （タイムアウト） | ready(緑) | *保持* |
| 3 | 長時間thinking | running(青) | false | （5分経過） | running(青) | false |

> **注**: `*保持*` = エラー発生前の状態を維持。未読があれば未読のまま。

---

## 8. 凡例

### 左側インジケーター
- `idle(灰)` = グレーの丸（セッション未起動）
- `ready(緑)` = 緑の丸（入力待ち）
- `running(青)` = 青スピナー（処理中）
- `waiting(黄)` = 黄色の丸（プロンプト回答待ち・要対応）
- `generating(青)` = 青スピナー（生成中）

### 右側インジケーター
- `false` = 表示なし（既読）
- `true` = 青い小丸（未読あり）
- `*保持*` = 前の状態を維持
- **太字** = 状態変化のポイント

---

## 9. 実装優先度

| 優先度 | 項目 | 理由 |
|--------|------|------|
| 高 | DBスキーマ追加 (last_viewed_at, last_assistant_message_at) | 他の改修の前提条件 |
| 高 | hasUnreadロジック修正 | 現状では常にtrueになる問題 |
| 高 | 既読更新API | 基本機能 |
| 高 | waitingの色を黄色に変更 | ready/waitingの視覚的区別 |
| 中 | フロントエンド連携（ブランチ選択時に既読更新） | UX改善 |
| 低 | generating/running分離 | 将来的な改善 |

---

## 10. 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2026-01-10 | 初版作成 |
| 2026-01-10 | レビュー反映: waiting色を黄色に変更、状態遷移図にgenerating追加、ポーリング遅延の注記追加、エラーケースの右側インジケーター修正、lastAssistantMessageAt取得方法追加 |
