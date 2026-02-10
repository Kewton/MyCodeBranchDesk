# Architecture Review Report: Issue #212 - Stage 2 整合性レビュー

## Executive Summary

| 項目 | 内容 |
|------|------|
| **Issue** | #212 - 複数行メッセージ送信時の[Pasted text]検知 + Enter自動送信 |
| **レビュー段階** | Stage 2: 整合性レビュー |
| **対象文書** | `dev-reports/design/issue-212-pasted-text-detection-design-policy.md` |
| **ステータス** | conditionally_approved |
| **スコア** | 4/5 |
| **レビュー日** | 2026-02-10 |

設計方針書はIssue #212の目的・スコープと高い整合性を持ち、既存コードベースの構造・パターン・関数名を正確に参照している。行番号も概ね正確で、1-2行の軽微なずれのみ。ただし、コード例間での型定義の不一致（loggerパラメータ型）、不要なimport指定（codex.tsへのstripAnsi/PASTED_TEXT_PATTERN）、未定義関数（sleep）の使用、およびテストファイルの新規作成が変更種別に反映されていない点を指摘する。

---

## 1. Issue #212との整合性

### 評価: 整合

| 項目 | Issue記載 | 設計書記載 | 一致 |
|------|----------|-----------|------|
| 目的 | Pasted text検知 + Enter自動送信 | 同一 | OK |
| アプローチ | CLIの挙動に追従（paste-buffer無効化を回避） | 同一（Section 1 背景に明記） | OK |
| 対象CLI | Claude CLI, Codex CLI | 同一（Gemini CLIは非対象と明記） | OK |
| 変更ファイル | claude-session.ts, codex.ts, cli-patterns.ts, response-poller.ts | 同一 + 新規pasted-text-helper.ts | OK |
| 過去の試行 | PR #171-#184の7回のRevert済み試行 | Section 1 背景に記載 | OK |

---

## 2. 既存コードベースとの整合性

### 2.1 関数・定数の実在確認

| 設計書で参照 | ファイル | 実在 | 備考 |
|-------------|---------|------|------|
| `sendKeys(sessionName, keys, sendEnter)` | `src/lib/tmux.ts` L207 | OK | シグネチャ一致 |
| `capturePane(sessionName, options)` | `src/lib/tmux.ts` L316 | OK | `{ startLine: -10 }` パターンは既存使用例あり |
| `stripAnsi(str)` | `src/lib/cli-patterns.ts` L205 | OK | export済み |
| `CLAUDE_PROMPT_PATTERN` | `src/lib/cli-patterns.ts` L54 | OK | |
| `CLAUDE_POST_PROMPT_DELAY` | `src/lib/claude-session.ts` L77 | OK | 500ms |
| `createLogger(module)` | `src/lib/logger.ts` L293 | OK | |
| `Logger` interface | `src/lib/logger.ts` L59 | OK | warn(action, data?) メソッドあり |
| `getCliToolPatterns(cliToolId)` | `src/lib/cli-patterns.ts` L121 | OK | skipPatterns配列を返す |
| `sendMessageToClaude()` | `src/lib/claude-session.ts` L394 | OK | |
| `CodexTool.sendMessage()` | `src/lib/cli-tools/codex.ts` L111 | OK | |

### 2.2 行番号の正確性

| 設計書の参照 | 記載行番号 | 実際の行番号 | 差異 |
|-------------|-----------|-------------|------|
| claude-session.ts セッション存在確認 | L398-406 | L398-406 | なし（L398はconst sessionName） |
| claude-session.ts プロンプト確認 | L409-413 | L408-413 | 1行ずれ |
| claude-session.ts 安定性待機 | L421 | L421 | なし |
| claude-session.ts sendKeys(message) | L424 | L424 | なし |
| claude-session.ts sendKeys(Enter) | L425 | L425 | なし |
| claude-session.ts ログ出力 | L426 | L426 | なし |
| codex.ts セッション存在確認 | L112-119 | L112-119 | なし |
| codex.ts sendKeys(message) | L124 | L124 | なし |
| codex.ts 100ms待機 | L127 | L127 | なし |
| codex.ts execAsync(C-m) | L130 | L130 | なし |
| codex.ts 200ms待機 | L133 | L133 | なし |
| response-poller.ts skipPatterns | L135-158 | L135-159 | 1行ずれ |
| cli-patterns.ts claude skipPatterns | L133-141 | L133-141 | なし |

### 2.3 既存パターン・慣例の正確性

| パターン | 設計書の記述 | 実コードベース | 一致 |
|---------|------------|--------------|------|
| Strategy パターン（CLI Tool抽象化） | ICLITool interfaceによる各ツール実装 | BaseCLIToolクラス継承（claude.ts, codex.ts, gemini.ts） | OK |
| Export定数パターン | claude-session.tsの定数群 | CLAUDE_INIT_TIMEOUT等がexport const | OK |
| Pattern Registry | cli-patterns.tsでパターン集約 | CLAUDE_PROMPT_PATTERN, CODEX_PROMPT_PATTERN等 | OK |
| Facade パターン | session-cleanup.tsが隠蔽 | pasted-text-helper.tsが検知ループを隠蔽する設計 | OK |
| ClaudeTool委譲パターン | claude-session.tsに委譲 | claude.ts L66: `sendMessageToClaude(worktreeId, message)` | OK |
| sendKeys('', true) = Enter送信 | 空文字 + sendEnter=true | claude-session.ts L360, L425で使用実績 | OK |
| createLogger使用パターン | `createLogger('module-name')` | cli-patterns.ts L10, cli-session.ts等で使用 | OK |

---

## 3. 内部整合性

### 3.1 セクション間の矛盾チェック

| チェック項目 | 結果 | 詳細 |
|-------------|------|------|
| アーキテクチャ図 vs レイヤー構成表 | OK | mermaid図の全ノードがレイヤー構成表に反映されている |
| 実装順序 vs 変更ファイル一覧 | OK | 11ステップ全てが変更ファイル一覧のファイルに対応 |
| テスト設計 vs 変更ファイル一覧 | **要修正** | response-poller.test.tsが変更種別「テスト追加」だが実際は新規作成 |
| タイミングチャート vs 定数値 | OK | PASTED_TEXT_DETECT_DELAY=500ms, MAX_RETRIES=3の値が一致 |
| 最悪ケース実行時間の計算 | OK | 500ms x 3 = 1500ms は正確 |
| loggerパラメータ型 | **要修正** | Section 3.1 (`ReturnType<typeof createLogger>`) vs Section 4.4 (`Logger`) |
| codex.ts import一覧 vs ヘルパー責務 | **要修正** | stripAnsi, PASTED_TEXT_PATTERNはヘルパー内部で使用、codex.tsへのimportは不要 |
| sleep関数の使用 vs プロジェクト慣例 | **要修正** | sleep関数は未定義。setTimeoutパターンが慣例 |

### 3.2 loggerパラメータ設計の不統一

設計書内でloggerの取り扱いが2パターン混在している。

**パターンA（Section 3.1）**: 呼び出し側からloggerを注入
```typescript
async function detectAndResendIfPastedText(
  sessionName: string,
  logger?: ReturnType<typeof createLogger>  // 外部注入
): Promise<void>
```

**パターンB（Section 4.5, SF-004記述）**: ヘルパー内部でlogger生成
```typescript
// pasted-text-helper.ts
import { createLogger } from './logger';
const logger = createLogger('pasted-text');
```

パターンBではloggerパラメータが不要になるため、関数シグネチャと矛盾する。どちらかに統一すべきである。

---

## 4. CLAUDE.mdとの整合性

| チェック項目 | 結果 | 詳細 |
|-------------|------|------|
| ファイル構成（src/lib/配下） | OK | pasted-text-helper.tsはsrc/lib/に配置、既存構造と整合 |
| モジュール説明 | **注意** | pasted-text-helper.tsが主要機能モジュール表に未記載（実装後に追加必要） |
| TypeScript規約（strict: true） | OK | 型定義が明示的 |
| コーディング規約（console.log禁止） | OK | SF-004でcreateLoggerパターンを採用 |
| テストフレームワーク（Vitest） | OK | テスト設計がVitestの構文を使用 |
| テストパス（tests/unit/lib/） | OK | 既存テスト配置パターンと一致 |

---

## 5. 指摘事項一覧

### Must Fix（2件）

| ID | カテゴリ | タイトル | 影響 |
|----|---------|---------|------|
| MF-S2-001 | 内部整合性 | loggerパラメータ型がSection 3.1と4.4で不一致 | 実装時の混乱。Logger型への統一が必要 |
| MF-S2-002 | 内部整合性 | codex.ts新規importにstripAnsi/PASTED_TEXT_PATTERNが含まれているがヘルパーに委譲されているため不要 | SF-001の責務分離方針と矛盾 |

### Should Fix（5件）

| ID | カテゴリ | タイトル | 影響 |
|----|---------|---------|------|
| SF-S2-001 | コードベース整合性 | claude-session.tsのセッション存在確認の行番号が厳密には1行ずれ | 軽微。実装時の参照精度 |
| SF-S2-002 | コードベース整合性 | logger生成方式（外部注入 vs 内部生成）が統一されていない | 設計の明確性 |
| SF-S2-003 | テスト設計整合性 | response-poller.test.tsの新規作成が変更種別に反映されていない | 変更ファイル一覧の正確性 |
| SF-S2-004 | コードベース整合性 | Section 4.5系統2の行番号がcli-patterns.tsの行番号であることが不明瞭 | 実装時の参照先混乱 |
| SF-S2-005 | 内部整合性 | sleep関数が未定義だがコード例で使用 | プロジェクト慣例との不整合 |

### Consider（4件）

| ID | カテゴリ | タイトル |
|----|---------|---------|
| C-S2-001 | 設計完全性 | codex.tsでのmessage変数スコープの明示化 |
| C-S2-002 | CLAUDE.md整合性 | pasted-text-helper.tsのモジュール表への追加（実装後タスク） |
| C-S2-003 | パターン整合性 | sendKeys('', true)パターンの実績確認（確認済み、問題なし） |
| C-S2-004 | テスト設計整合性 | codex.test.tsの既存テストと新規モック付きテストのスタイル統合 |

---

## 6. リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| 技術的リスク | 設計書のコード例と実装の乖離 | Low | Medium | P2 |
| 技術的リスク | response-poller.test.ts新規作成の工数見落とし | Low | Low | P3 |
| 運用リスク | CLAUDE.mdモジュール表の更新漏れ | Low | Medium | P3 |

---

## 7. 改善推奨事項

### 7.1 MF-S2-001 への対応案

Section 3.1のコード例を以下のように修正する。

```typescript
// 修正前
async function detectAndResendIfPastedText(
  sessionName: string,
  logger?: ReturnType<typeof createLogger>
): Promise<void>

// 修正後
import type { Logger } from './logger';

async function detectAndResendIfPastedText(
  sessionName: string,
  logger?: Logger
): Promise<void>
```

### 7.2 MF-S2-002 への対応案

Section 4.3の新規importを以下のように修正する。

```typescript
// 修正前（不要なimportあり）
import { hasSession, createSession, sendKeys, capturePane, killSession } from '../tmux';
import { stripAnsi, PASTED_TEXT_PATTERN } from '../cli-patterns';
import { detectAndResendIfPastedText } from '../pasted-text-helper';

// 修正後（ヘルパーのimportのみ追加）
import { detectAndResendIfPastedText } from '../pasted-text-helper';
```

### 7.3 SF-S2-005 への対応案

Section 3.1のsleep呼び出しを既存パターンに置き換える。

```typescript
// 修正前
await sleep(PASTED_TEXT_DETECT_DELAY);

// 修正後
await new Promise(resolve => setTimeout(resolve, PASTED_TEXT_DETECT_DELAY));
```

---

## 8. 総合評価

設計方針書は全体として高品質であり、Stage 1レビュー指摘への対応（MF-001~C-004）も適切に反映されている。Issue #212の目的・スコープとの整合性は完全であり、既存コードベースの参照も概ね正確である。

指摘事項はいずれもコード例内の不一致や記述の精度に関するものであり、設計のアーキテクチャ判断やアプローチそのものに問題はない。Must Fix 2件を修正すれば実装フェーズに進行可能と判断する。

**判定: Conditionally Approved（Must Fix 2件の修正後に実装開始可）**

---

*Generated by architecture-review-agent*
*Date: 2026-02-10*
*Stage: 2 (整合性レビュー)*
