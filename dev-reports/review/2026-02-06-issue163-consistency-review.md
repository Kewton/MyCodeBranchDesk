# Architecture Review Report: Issue #163 - Stage 2 (整合性レビュー)

## Executive Summary

| 項目 | 内容 |
|------|------|
| Issue | #163 - 複数行メッセージのバッファ送信方式 |
| レビュー種別 | Stage 2 - 整合性レビュー（設計書 vs 実装コード） |
| ステータス | 条件付き承認 (Conditionally Approved) |
| スコア | 4/5 |
| Must Fix | 1件 |
| Should Fix | 1件 |
| Consider | 0件 |
| レビュー日 | 2026-02-06 |

---

## 1. レビュー概要

Issue #163の設計方針書（`dev-reports/design/issue-163-multiline-message-buffer-design-policy.md`）に記載された「変更前」コード、変更対象外ファイルの記述、テスト修正計画が、実際のソースコード・テストコードと整合しているかを検証した。

### レビュー対象ファイル

| ファイル | 役割 |
|----------|------|
| `src/lib/tmux.ts` | tmuxセッション管理（sendTextViaBuffer追加先） |
| `src/lib/claude-session.ts` | Claude CLIセッション管理（sendMessageToClaude修正対象） |
| `src/lib/cli-tools/codex.ts` | Codex CLIツール（sendMessage修正対象） |
| `src/lib/auto-yes-manager.ts` | Auto-Yes状態管理（変更対象外確認） |
| `src/app/api/worktrees/[id]/respond/route.ts` | ユーザー応答API（変更対象外確認） |
| `src/app/api/worktrees/[id]/prompt-response/route.ts` | プロンプト応答API（変更対象外確認） |
| `tests/unit/lib/claude-session.test.ts` | Claude session単体テスト（テスト修正対象確認） |
| `tests/unit/cli-tools/codex.test.ts` | Codexツール単体テスト（テスト修正対象確認） |

---

## 2. 整合性チェックリスト

### CHECK-01: 設計書4.2.2項 vs claude-session.ts (390-391行目)

| 項目 | 結果 |
|------|------|
| 判定 | **PASS** |

**設計書の記載（4.2.2項「変更前」）:**
```typescript
await sendKeys(sessionName, message, false);  // Message without Enter
await sendKeys(sessionName, '', true);        // Enter key
```

**実際のコード（`src/lib/claude-session.ts` 390-391行目）:**
```typescript
await sendKeys(sessionName, message, false);  // Message without Enter
await sendKeys(sessionName, '', true);        // Enter key
```

**評価:** 完全一致。設計書の「変更前」コードは実装を正確に反映している。

---

### CHECK-02: 設計書4.2.3項 vs codex.ts (110-116行目)

| 項目 | 結果 |
|------|------|
| 判定 | **PASS** |

**設計書の記載（4.2.3項「変更前」）:**
```typescript
await sendKeys(sessionName, message, false);
await new Promise((resolve) => setTimeout(resolve, 100));
await execAsync(`tmux send-keys -t "${sessionName}" C-m`);
```

**実際のコード（`src/lib/cli-tools/codex.ts` 110-116行目）:**
```typescript
await sendKeys(sessionName, message, false);

// Wait a moment for the text to be typed
await new Promise((resolve) => setTimeout(resolve, 100));

// Send Enter key separately
await execAsync(`tmux send-keys -t "${sessionName}" C-m`);
```

**評価:** 完全一致。コメント行を除き、ロジックは設計書の記載通り。`sendKeys` + 100ms待機 + `execAsync`によるtmux直接呼び出しの3段構成が正確に記述されている。

---

### CHECK-03: 設計書5.2項 変更対象外ファイルのsendKeys使用箇所

| 項目 | 結果 |
|------|------|
| 判定 | **PASS** |

設計書5.2項で変更対象外とされた3ファイルのsendKeys使用パターンを検証した。

**auto-yes-manager.ts（302-304行目）:**
```typescript
await sendKeys(sessionName, answer, false);
await new Promise(resolve => setTimeout(resolve, 100));
await sendKeys(sessionName, '', true);
```
設計書記載「単純なyes/no応答（1行）のみでsendKeys()で問題なし」 -- 一致。

**respond/route.ts（149-156行目）:**
```typescript
await sendKeys(sessionName, input, false);
// Wait a moment for the input to be processed
await new Promise(resolve => setTimeout(resolve, 100));
// Send Enter
await sendKeys(sessionName, '', true);
```
設計書記載「単純な応答（1行）のみ。将来検討」 -- 一致。

**prompt-response/route.ts（68-74行目）:**
```typescript
await sendKeys(sessionName, answer, false);
// Wait a moment for the input to be processed
await new Promise(resolve => setTimeout(resolve, 100));
// Send Enter
await sendKeys(sessionName, '', true);
```
設計書記載「単純な応答（1行）のみ。将来検討」 -- 一致。

**評価:** 全3ファイルとも設計書の記載通り、sendKeys 2段階送信パターン（text送信 + delay + Enter送信）を使用しており、変更対象外とする判断の根拠が正確。

---

### CHECK-04: 設計書8.3.1項 vs claude-session.test.ts (318行目付近)

| 項目 | 結果 |
|------|------|
| 判定 | **PASS (軽微な差異あり)** |

**設計書の記載（8.3.1項「現状のアサーション」）:**
```typescript
expect(sendKeys).toHaveBeenCalledTimes(2);
expect(sendKeys).toHaveBeenNthCalledWith(1, sessionName, message, false);
expect(sendKeys).toHaveBeenNthCalledWith(2, sessionName, '', true);
```

**実際のテストコード（318-327行目）:**
```typescript
it('should use sendKeys for Enter instead of execAsync (CONS-001)', async () => {
  vi.mocked(capturePane).mockResolvedValue('> ');

  await sendMessageToClaude('test-worktree', 'Hello Claude');

  // Should call sendKeys twice: once for message, once for Enter
  expect(sendKeys).toHaveBeenCalledTimes(2);
  expect(sendKeys).toHaveBeenNthCalledWith(1, 'mcbd-claude-test-worktree', 'Hello Claude', false);
  expect(sendKeys).toHaveBeenNthCalledWith(2, 'mcbd-claude-test-worktree', '', true);
});
```

**差異の詳細:**
- テスト名: 設計書記載と完全一致
- アサーション構造: 完全一致（sendKeys 2回呼び出し検証）
- 引数の記載方法: 設計書は変数名（`sessionName`, `message`）、実コードはリテラル値（`'mcbd-claude-test-worktree'`, `'Hello Claude'`）
- 行番号: 設計書記載の「318行目付近」と実際の318行目が一致

**評価:** テスト名・アサーション構造・行番号いずれも一致。引数の記載方法が変数名 vs リテラル値で異なるが、意味的に等価であり実装に支障なし。

---

### CHECK-05: 設計書8.3.2項 vs codex.test.ts

| 項目 | 結果 |
|------|------|
| 判定 | **FAIL** |

**設計書の記載（8.3.2項「現状のアサーション」）:**
```typescript
// sendKeys + execAsync の呼び出しを検証
expect(sendKeys).toHaveBeenCalledWith(sessionName, message, false);
expect(execAsync).toHaveBeenCalledWith(`tmux send-keys -t "${sessionName}" C-m`);
```

**実際のテストコード（`tests/unit/cli-tools/codex.test.ts`全82行）:**

テストファイルには以下のテストスイートのみが存在する:
- `Tool properties` -- id, name, command, CLIToolType の検証
- `getSessionName` -- セッション名生成の検証
- `isInstalled` -- インストール確認の型検証
- `isRunning` -- セッション実行状態の検証
- `Interface implementation` -- 必須メソッドの存在確認

**sendMessage() に関するテストは一切存在しない。** `sendKeys` や `execAsync` のモックも設定されていない。

**評価:** 設計書は存在しないテストコードを「現状のアサーション」として引用している。これは実装時に混乱を招く可能性がある重大な不整合。設計書を修正し、「既存テスト修正」ではなく「新規テスト追加」として記述すべき。

---

### CHECK-06: import文・モジュール依存関係の整合性

| 項目 | 結果 |
|------|------|
| 判定 | **PASS** |

| ファイル | インポート元 | 行番号 | 設計書との整合 |
|----------|-------------|--------|--------------|
| claude-session.ts | `import { sendKeys } from './tmux'` | 9行目 | 一致 |
| codex.ts | `import { sendKeys } from '../tmux'` | 11行目 | 一致 |
| codex.ts | `const execAsync = promisify(exec)` | 17行目 | 一致（独自定義） |
| auto-yes-manager.ts | `import { sendKeys } from './tmux'` | 15行目 | 一致 |
| respond/route.ts | `import { sendKeys } from '@/lib/tmux'` | 9行目 | 一致 |
| prompt-response/route.ts | `import { sendKeys } from '@/lib/tmux'` | 10行目 | 一致 |

**評価:** 全ファイルのモジュール依存関係は設計書の記載と整合。設計書3.1項のコンポーネント構成図（tmux.ts -> claude-session.ts, codex.ts）も正確。

---

## 3. リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|--------|---------|-----------|
| 技術的リスク | codex.test.ts のテスト不整合により実装時に混乱が発生する可能性 | Low | Medium | P2 |
| セキュリティ | 該当なし | -- | -- | -- |
| 運用リスク | 該当なし | -- | -- | -- |

---

## 4. 指摘事項

### 4.1 必須改善項目 (Must Fix)

#### CONS-001: 設計書8.3.2項 codex.test.ts の既存テスト記載が実態と不一致

**重要度:** High

**詳細:**
設計書8.3.2項は以下のように記述している:

> **修正対象**: `sendMessage()` 関連テスト
>
> **現状のアサーション**:
> ```typescript
> expect(sendKeys).toHaveBeenCalledWith(sessionName, message, false);
> expect(execAsync).toHaveBeenCalledWith(`tmux send-keys -t "${sessionName}" C-m`);
> ```

しかし、実際の `tests/unit/cli-tools/codex.test.ts` には `sendMessage()` のテストが一切存在しない。テストファイルはツールプロパティ、セッション名生成、インストール確認、実行状態確認、インターフェース実装の検証のみで構成されている（全82行）。

設計書の「現状のアサーション」として引用されているコードは実在しないため、これは「既存テストの修正」ではなく「新規テストの追加」として扱う必要がある。

**推奨対応:**
設計書8.3.2項を以下のように修正する:
1. 「修正対象」を「新規追加」に変更
2. 「現状のアサーション」セクションを削除
3. 「新規追加テスト」として sendTextViaBuffer() を検証するテストケースを記載
4. モック設定（vi.mock）は新規追加として記述
5. 受け入れ条件（9項）の [SF-003] チェックリスト記述も「修正」ではなく「追加」に更新

---

### 4.2 推奨改善項目 (Should Fix)

#### CONS-002: 設計書8.3.1項のアサーション記載方法の差異

**重要度:** Low

**詳細:**
設計書8.3.1項の「現状のアサーション」は変数名（`sessionName`, `message`）を使用しているが、実際のテストコードではリテラル値（`'mcbd-claude-test-worktree'`, `'Hello Claude'`）を使用している。意味的には等価であり実装に支障はないが、設計書のコード引用の正確性という観点では改善の余地がある。

**推奨対応:**
設計書のコード引用を実コードのリテラル値に合わせて修正する。

---

## 5. 整合性総合評価

| 項目 | 判定 | 備考 |
|------|------|------|
| CHECK-01: 4.2.2項 claude-session.ts 変更前コード | PASS | 完全一致 |
| CHECK-02: 4.2.3項 codex.ts 変更前コード | PASS | 完全一致 |
| CHECK-03: 5.2項 変更対象外ファイル sendKeys 使用 | PASS | 3ファイル全て正確 |
| CHECK-04: 8.3.1項 claude-session.test.ts テスト | PASS | 軽微な表記差異のみ |
| CHECK-05: 8.3.2項 codex.test.ts テスト | **FAIL** | 記載テストが実在しない |
| CHECK-06: import文・モジュール依存関係 | PASS | 全ファイル整合 |

**総合判定:** 6項目中5項目がPASS、1項目がFAIL。FAIL項目は設計書の記述修正で対応可能であり、アーキテクチャ設計自体の品質には影響しない。

---

## 6. 承認判定

**ステータス: 条件付き承認 (Conditionally Approved)**

**条件:**
1. **CONS-001** を対応し、設計書8.3.2項の記述を実態に合わせて修正すること（「既存テスト修正」->「新規テスト追加」）

**承認後の実装への影響:**
- CHECK-01, CHECK-02の確認により、設計書4.2.2項・4.2.3項の変更前コードは正確であり、実装時にそのまま参照可能
- CHECK-03の確認により、変更対象外ファイルの判断は正確であり、追加修正は不要
- CHECK-04の確認により、claude-session.test.ts のテスト修正は設計書の記載に従い実施可能
- CHECK-05のFAILにより、codex.test.ts については「既存テスト修正」ではなく「sendMessage() テストの新規作成」として実装する

---

## 7. レビュー履歴

| Stage | 日付 | フォーカス | 結果 |
|-------|------|-----------|------|
| Stage 1 | 2026-02-06 | 設計原則 (SOLID/KISS/YAGNI/DRY) | 条件付き承認 (4/5) |
| Stage 2 | 2026-02-06 | 整合性（設計書 vs 実装コード） | 条件付き承認 (4/5) |
