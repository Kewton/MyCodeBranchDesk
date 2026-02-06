# Architecture Review: Issue #163 - Stage 3 影響分析レビュー

## Executive Summary

**Issue**: #163 - 複数行メッセージのバッファ送信方式
**Focus**: 影響範囲（Impact Scope）
**Status**: 条件付き承認 (conditionally_approved)
**Score**: 4/5
**Date**: 2026-02-06

sendTextViaBuffer() の追加による影響範囲を、全 sendKeys() 呼び出し元（13箇所）、CLIツール Strategy パターン、APIルート、ビルド構成、テストの観点から分析した。変更の波及効果は限定的であり、後方互換性は維持される。1件の Must Fix（設計書 SF-002 の対象範囲に関する矛盾）と2件の Should Fix を検出した。

---

## 1. 影響範囲マップ

### 1.1 直接変更対象（3ファイル）

| ファイル | 変更種別 | リスク | 変更内容 |
|----------|----------|--------|---------|
| `src/lib/tmux.ts` | 追加 | 低 | `sendTextViaBuffer()` 関数の新規追加。既存 export 9関数に変更なし |
| `src/lib/claude-session.ts` | 修正 | 中 | `sendMessageToClaude()` の送信部分を sendKeys() 2回 -> sendTextViaBuffer() 1回に変更。import 追加 |
| `src/lib/cli-tools/codex.ts` | 修正 | 中 | `sendMessage()` の送信部分を sendKeys() + execAsync(C-m) -> sendTextViaBuffer() に変更。import 追加 |

### 1.2 間接影響（呼び出しチェーン経由、3ファイル）

| ファイル | 影響種別 | リスク | 説明 |
|----------|----------|--------|------|
| `src/lib/cli-tools/claude.ts` | 呼び出しチェーン | 低 | sendMessageToClaude() のラッパー。インターフェース不変 |
| `src/lib/cli-tools/manager.ts` | 依存解決 | なし | ICLITool.sendMessage() 契約に変更なし |
| `src/app/api/worktrees/[id]/send/route.ts` | 呼び出しチェーン | 低 | cliTool.sendMessage() を呼び出すが API インターフェース不変 |

### 1.3 影響なし（7ファイル）

| ファイル | 影響なしの理由 |
|----------|---------------|
| `src/lib/auto-yes-manager.ts` | sendKeys() 直接使用（302-304行目）。単純な y/n 応答のみ。sendKeys() は変更されない |
| `src/app/api/worktrees/[id]/respond/route.ts` | sendKeys() 直接使用（149-156行目）。単純な応答のみ |
| `src/app/api/worktrees/[id]/prompt-response/route.ts` | sendKeys() 直接使用（68-74行目）。単純な応答のみ |
| `src/app/api/worktrees/[id]/terminal/route.ts` | tmux.sendKeys() 使用（57行目）。単一行コマンドが主 |
| `src/lib/cli-tools/gemini.ts` | 非インタラクティブモード。sendKeys() で echo パイプ送信（102行目） |
| `src/lib/session-cleanup.ts` | tmux.ts からの直接インポートなし。Facade パターンでポーラー停止のみ |
| `src/lib/terminal-websocket.ts` | 独自の spawn() 方式。tmux.ts モジュール非使用 |

---

## 2. sendKeys() 全呼び出し元の網羅的分析

grep による全呼び出し元の洗い出しを実施した。src/ ディレクトリ配下で `sendKeys(` を呼び出す箇所は計13箇所（テストコード除く）。

### 2.1 Issue #163 で変更される呼び出し（2箇所）

| # | ファイル | 行 | 現行コード | 変更後 |
|---|---------|-----|----------|--------|
| 1 | `src/lib/claude-session.ts` | 390-391 | `sendKeys(sessionName, message, false)` + `sendKeys(sessionName, '', true)` | `sendTextViaBuffer(sessionName, message, true)` |
| 2 | `src/lib/cli-tools/codex.ts` | 110+116 | `sendKeys(sessionName, message, false)` + `execAsync(tmux send-keys ... C-m)` | `sendTextViaBuffer(sessionName, message, true)` |

### 2.2 変更せず正常動作が維持される呼び出し（11箇所）

| # | ファイル | 行 | 用途 | 変更不要の理由 |
|---|---------|-----|------|--------------|
| 1 | `src/lib/claude-session.ts` | 307 | CLI起動コマンド送信 `sendKeys(sessionName, claudePath, true)` | 単一行パス文字列。ペースト検出問題なし |
| 2 | `src/lib/claude-session.ts` | 446 | 停止時の空文字列送信 `sendKeys(sessionName, '', false)` | 制御用途。空文字列 |
| 3 | `src/lib/cli-tools/codex.ts` | 73 | CLI起動 `sendKeys(sessionName, 'codex', true)` | 単一単語。ペースト検出問題なし |
| 4 | `src/lib/cli-tools/codex.ts` | 79 | 更新スキップ `sendKeys(sessionName, '2', true)` | 単一文字。ペースト検出問題なし |
| 5 | `src/lib/cli-tools/gemini.ts` | 102 | パイプコマンド `sendKeys(sessionName, 'echo ... \| gemini', true)` | 非インタラクティブモード。改行なし |
| 6 | `src/lib/auto-yes-manager.ts` | 302 | 自動応答 `sendKeys(sessionName, answer, false)` | y/n 等の単一文字応答 |
| 7 | `src/lib/auto-yes-manager.ts` | 304 | Enter送信 `sendKeys(sessionName, '', true)` | Enter キーのみ |
| 8 | `src/app/api/.../respond/route.ts` | 149 | ユーザー応答 `sendKeys(sessionName, input, false)` | 数値選択、y/n 等の単一行入力 |
| 9 | `src/app/api/.../respond/route.ts` | 156 | Enter送信 `sendKeys(sessionName, '', true)` | Enter キーのみ |
| 10 | `src/app/api/.../prompt-response/route.ts` | 68 | プロンプト応答 `sendKeys(sessionName, answer, false)` | 単一行応答 |
| 11 | `src/app/api/.../terminal/route.ts` | 57 | ターミナルコマンド `tmux.sendKeys(sessionName, command)` | 通常は単一行コマンド |

**結論**: 変更しない11箇所はいずれも単一行テキスト（CLI起動コマンド、制御文字、単一文字応答、短いコマンド）の送信であり、複数行テキストのペースト検出問題が発生しないケースである。sendKeys() は変更されないため、これらの呼び出しは正常に動作し続ける。

---

## 3. CLIツール Strategy パターンへの影響

### 3.1 影響分析

```
ICLITool (types.ts)          -- sendMessage() シグネチャ変更なし
  |
  +-- BaseCLITool (base.ts)  -- sendSpecialKey のみ import。影響なし
       |
       +-- ClaudeTool (claude.ts)  -- sendMessageToClaude() のラッパー。間接影響のみ
       +-- CodexTool (codex.ts)    -- sendMessage() 内部実装変更（直接変更）
       +-- GeminiTool (gemini.ts)  -- 非インタラクティブモード。影響なし
```

- **ICLITool インターフェース**: `sendMessage(worktreeId: string, message: string): Promise<void>` のシグネチャに変更なし。Liskov Substitution Principle を維持。
- **CLIToolManager**: `getTool()` が返すインスタンスの sendMessage() 契約は不変。呼び出し元の send/route.ts には影響なし。
- **base.ts**: `sendSpecialKey` のみを tmux.ts から import (9行目)。sendTextViaBuffer() の追加には影響されない。

### 3.2 codex.ts の import 変更

```typescript
// 変更前:
import { hasSession, createSession, sendKeys, killSession } from '../tmux';

// 変更後:
import { hasSession, createSession, sendKeys, sendTextViaBuffer, killSession } from '../tmux';
```

- `sendKeys` は startSession() (73, 79行目) で引き続き使用されるため import 残存
- `execAsync` は killSession() (141行目) で引き続き使用されるため import 残存
- sendMessage() 内の execAsync tmux 呼び出し（116行目）のみが除去される

### 3.3 claude-session.ts の import 変更

```typescript
// 変更前:
import { hasSession, createSession, sendKeys, capturePane, killSession } from './tmux';

// 変更後:
import { hasSession, createSession, sendKeys, sendTextViaBuffer, capturePane, killSession } from './tmux';
```

- `sendKeys` は startClaudeSession() (307行目) と stopClaudeSession() (446行目) で引き続き使用されるため import 残存

---

## 4. APIルートへの影響

### 4.1 send/route.ts（間接影響）

- **呼び出しチェーン**: `cliTool.sendMessage(params.id, body.content)` (141行目) -> ClaudeTool/CodexTool の sendMessage()
- **影響**: 内部送信方式が sendKeys -> sendTextViaBuffer に変わるが、API リクエスト/レスポンスインターフェースは不変
- **リスク**: 低。cliTool.sendMessage() の戻り値型 (Promise<void>) に変更なし

### 4.2 respond/route.ts（影響なし）

- sendKeys() を直接使用（149, 156行目）
- 単純な応答（数値選択、y/n）のみ
- sendKeys() は変更されないため影響なし

### 4.3 prompt-response/route.ts（影響なし）

- sendKeys() を直接使用（68, 74行目）
- 単純な応答のみ
- sendKeys() は変更されないため影響なし

### 4.4 terminal/route.ts（影響なし）

- `tmux.sendKeys(sessionName, command)` を使用（57行目）
- namespace import (`import * as tmux`) のため sendTextViaBuffer() も tmux namespace に含まれるが、呼び出し箇所に変更なし

---

## 5. auto-yes-manager.ts への影響

**影響なし。**

- sendKeys() を直接使用（302, 304行目）
- 用途: 自動応答（y/n 等の単一文字）の送信
- sendKeys() は変更されないため動作に変更なし
- 将来課題として MF-001（sendKeysWithEnter() ヘルパー）で統一を検討（設計書 11.1 項）

---

## 6. session-cleanup.ts への影響

**影響なし。**

- tmux.ts からの直接インポートなし
- stopResponsePolling, stopClaudePolling, stopAutoYesPolling のみを使用
- killSession は引数で受け取る `KillSessionFn` を通じて呼び出し
- sendTextViaBuffer() の追加とは完全に無関係

---

## 7. ビルドへの影響

### 7.1 Next.js ビルド (`npm run build`)

- **リスク**: 低
- tsconfig.json は `include: ['**/*.ts']` で全 TypeScript ファイルをカバー
- 新規 export の追加のみであり、既存型への破壊的変更なし
- ESLint: 未使用 import の問題なし（sendTextViaBuffer は import 直後に使用）

### 7.2 CLI ビルド (`npm run build:cli`)

- **リスク**: なし
- tsconfig.cli.json は `src/cli/**/*` のみを include
- tmux.ts, claude-session.ts は src/cli/ 外のため CLI ビルドに影響なし

### 7.3 サーバービルド (`npm run build:server`)

- **リスク**: 低
- tsconfig.server.json は `src/lib/tmux.ts` を明示的に include していない
- ただし `src/lib/cli-tools/**/*.ts` が含まれており、codex.ts -> tmux.ts の依存関係で暗黙的にコンパイルされる
- **確認事項**: 実装後に `npm run build:server` を実行し、正常にコンパイルされることを確認する

### 7.4 TypeScript コンパイル (`npx tsc --noEmit`)

- **リスク**: 低
- 新規関数追加と import 変更のみ
- 型互換性に影響する変更なし

---

## 8. テストへの影響

### 8.1 既存テストへの破壊的変更（1件）

**ファイル**: `tests/unit/lib/claude-session.test.ts`
**テスト名**: `'should use sendKeys for Enter instead of execAsync (CONS-001)'` (318行目)

```typescript
// 現行のアサーション（変更が必要）:
expect(sendKeys).toHaveBeenCalledTimes(2);
expect(sendKeys).toHaveBeenNthCalledWith(1, 'mcbd-claude-test-worktree', 'Hello Claude', false);
expect(sendKeys).toHaveBeenNthCalledWith(2, 'mcbd-claude-test-worktree', '', true);

// 修正後のアサーション:
expect(sendTextViaBuffer).toHaveBeenCalledTimes(1);
expect(sendTextViaBuffer).toHaveBeenCalledWith('mcbd-claude-test-worktree', 'Hello Claude', true);
```

加えて、モック設定に `sendTextViaBuffer: vi.fn()` を追加する必要がある（11行目付近のvi.mock ブロック）。

### 8.2 影響を受けない既存テスト

- `tests/unit/tmux.test.ts`: sendKeys, capturePane, killSession 等の既存テスト。sendKeys() は変更されないため影響なし
- `tests/unit/cli-tools/codex.test.ts`: ツールプロパティ、セッション名、isInstalled、isRunning テスト。sendMessage() テストは存在しないため破壊的変更なし

### 8.3 新規追加が必要なテスト（3ファイル）

1. **tests/unit/tmux.test.ts** (既存ファイルへのセクション追加): sendTextViaBuffer() のユニットテスト（14ケース、設計書 8.1 項）
2. **tests/unit/cli-tools/codex.test.ts** (既存ファイルへのセクション追加): sendMessage() の sendTextViaBuffer() 呼び出し検証（設計書 8.3.2 項）
3. **tests/integration/tmux-buffer.test.ts** (新規ファイル): 実 tmux 環境での統合テスト（設計書 8.2 項）

---

## 9. レビュー指摘事項

### 9.1 必須改善項目 (Must Fix)

#### IMP-001: codex.ts killSession() 内の execAsync tmux 直接呼び出しが設計書 SF-002 の対象範囲と矛盾

**重要度**: 中

設計書 4.2.3 項の SF-002 では『codex.ts から execAsync のtmux関連呼び出しが残存していないことを確認すること』と記載しているが、killSession() (141行目) に `execAsync(`tmux send-keys -t "${sessionName}" C-d`)` が残存する。sendMessage() の修正だけでは SF-002 の記載と矛盾する。

**該当コード** (`src/lib/cli-tools/codex.ts` 141行目):
```typescript
await execAsync(`tmux send-keys -t "${sessionName}" C-d`);
```

同様のパターンは `gemini.ts` (124行目) と `claude-session.ts` (448行目) にも存在する。

**推奨対応**: 以下のいずれかを実施:
- **Option A**: SF-002 の記載を修正し、対応範囲を sendMessage() 内の execAsync 除去のみに限定することを明記する
- **Option B**: killSession() の C-d 送信も `sendSpecialKey('C-d')` に置き換える（`sendSpecialKey` は既に tmux.ts に定義済みで、base.ts の interrupt() で使用実績あり）

### 9.2 推奨改善項目 (Should Fix)

#### IMP-002: tsconfig.server.json に src/lib/tmux.ts が明示的に含まれていない

**重要度**: 低

現状は依存解決で暗黙的にコンパイルされるが、実装後に `npm run build:server` を実行して確認すべき。

#### IMP-003: sendMessageToClaude() の prompt 未検出時動作の確認

**重要度**: 低

prompt 未検出時に warning を出力して送信を続行するフローが、sendTextViaBuffer() への変更後も正常に動作することを確認すべき。バッファ操作は prompt 状態に依存しないため技術的には問題ないが、テストで確認する価値がある。

### 9.3 検討事項 (Consider)

#### IMP-004: terminal/route.ts の namespace import

namespace import (`import * as tmux`) により sendTextViaBuffer() が自動的にアクセス可能になる。将来的な複数行コマンド送信の可能性を認識しておく。

#### IMP-005: terminal-websocket.ts の独立した spawn 方式

tmux.ts モジュールを経由しない独立実装が存在する。本 Issue の範囲外だが、将来的な SRP 統一の候補。

---

## 10. リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|--------|---------|-----------|
| 技術的リスク | sendTextViaBuffer() のエスケープ処理不備 | Low | Low | P3 - ユニットテストでカバー |
| 技術的リスク | tsconfig.server.json の暗黙的依存解決失敗 | Low | Low | P3 - ビルド実行で確認 |
| セキュリティリスク | バッファ経由のコマンドインジェクション | Low | Low | P3 - SEC-001, SEC-002 で対策済み |
| 運用リスク | Codex/Claude CLI の送信動作変更 | Low | Low | P3 - 統合テストでカバー |
| テストリスク | 既存テスト1件の破壊的変更 | Low | High | P1 - 設計書に修正計画記載済み |

---

## 11. 後方互換性の確認

| 項目 | 状態 | 詳細 |
|------|------|------|
| sendKeys() 関数 | 変更なし | 既存 11 箇所の呼び出しに影響なし |
| sendSpecialKey() 関数 | 変更なし | base.ts の interrupt() に影響なし |
| ICLITool.sendMessage() | シグネチャ変更なし | Strategy パターンの契約を維持 |
| API リクエスト/レスポンス | 変更なし | send/route.ts, respond/route.ts 等のインターフェース不変 |
| tmux.ts の既存 export | 変更なし | 新規 export (sendTextViaBuffer) の追加のみ |

---

## 12. 承認判定

**ステータス: 条件付き承認**

設計書の影響範囲分析は全体的に正確であり、変更の波及効果は限定的に抑えられている。sendKeys() の全 13 箇所を検証した結果、変更対象の 2 箇所と変更しない 11 箇所の判断は適切である。

ただし、IMP-001（SF-002 の対象範囲矛盾）は設計書の記載を修正する必要がある。killSession() 内の execAsync tmux 呼び出しの存在を認識した上で、本 Issue の対応範囲を明確にすべきである。

IMP-001 への対応を完了した上で、実装に進むことを推奨する。

---

## 13. レビュー指摘事項サマリー

| ID | 分類 | タイトル | 重要度 | 対応方針 |
|----|------|---------|--------|---------|
| IMP-001 | 影響範囲 | codex.ts killSession() 内の execAsync tmux 直接呼び出しが SF-002 対象範囲と矛盾 | Must Fix | SF-002 の対応範囲を sendMessage() 内に限定する旨を明記、または killSession() も対応範囲に含める |
| IMP-002 | 影響範囲 | tsconfig.server.json に tmux.ts が明示的に含まれていない | Should Fix | 実装後に npm run build:server で確認 |
| IMP-003 | 影響範囲 | sendMessageToClaude() の prompt 未検出時動作の確認 | Should Fix | テストで sendTextViaBuffer() が prompt 状態に依存しないことを確認 |
| IMP-004 | 影響範囲 | terminal/route.ts の namespace import への影響 | Consider | 現時点で対応不要。将来的な利用可能性を認識 |
| IMP-005 | 影響範囲 | terminal-websocket.ts の独立した spawn 方式 | Consider | 本 Issue 範囲外。将来的な SRP 統一の候補 |
