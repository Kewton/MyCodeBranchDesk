# Architecture Review Report: Issue #212 - Stage 1 (Design Principles)

| Item | Value |
|------|-------|
| **Issue** | #212 - Pasted text detection + Enter auto-send |
| **Stage** | Stage 1: Design Principles Review |
| **Status** | Conditionally Approved |
| **Score** | 4 / 5 |
| **Date** | 2026-02-10 |
| **Reviewer** | Architecture Review Agent |

---

## Executive Summary

Issue #212 の設計方針書は、過去7回のRevert済みPR試行（Issue #163）の教訓を活かし、Claude CLIの挙動に「追従」するDetect-and-Retryアプローチを採用している。設計全体としてはSOLID原則、KISS原則、YAGNI原則への準拠度が高く、変更影響範囲も適切に限定されている。

主要な懸念点は、全メッセージ（単一行を含む）に対して+500msの検知遅延を一律に課す設計判断がKISS/パフォーマンスの観点から過剰であること、およびclaude-session.tsとcodex.ts間の検知ロジック重複がDRY原則との緊張関係にあることの2点である。

条件付き承認とし、MF-001（単一行メッセージの遅延回避）の対処を実装前に決定することを推奨する。

---

## Detailed Findings

### Must Fix (1 item)

#### MF-001: 単一行メッセージに対する不要な+500ms遅延

| Attribute | Value |
|-----------|-------|
| **Category** | Performance / KISS |
| **Severity** | High |
| **Location** | Section 7 (Performance), Section 8 (Design Decisions) |

**問題**:

設計方針書では以下の理由で全メッセージに検知確認を行うとしている:

> 単一行メッセージでもtmuxがペーストとして扱う可能性がゼロではないため

しかし、tmuxの `send-keys` コマンドの実装を確認すると:

```typescript
// tmux.ts L214-217
const command = sendEnter
  ? `tmux send-keys -t "${sessionName}" '${escapedKeys}' C-m`
  : `tmux send-keys -t "${sessionName}" '${escapedKeys}'`;
```

`send-keys` で送信されたテキストは改行を含まない限り、tmux側でペーストとして扱われない。Claude CLIの `[Pasted text]` 表示は、テキスト内の改行をトリガーとして発生する。

現状の設計では、全メッセージ送信に対してAPI応答時間が+500ms増加する。単一行メッセージが「高頻度」と設計書自身が認めている以上、この遅延は大半の操作に影響する。

**推奨対策**:

```typescript
// 改行を含むメッセージのみ検知ロジックを実行
if (message.includes('\n')) {
  // Pasted text detection loop
}
```

この条件分岐により:
- 単一行メッセージ: 遅延なし（大半のケース）
- 複数行メッセージ: 従来通り+500ms~+1500ms

代替案B（メッセージ長による条件分岐）とは異なり、改行の有無は客観的で曖昧さのない判定基準である。

---

### Should Fix (4 items)

#### SF-001: claude-session.tsとcodex.tsの検知ロジック重複

| Attribute | Value |
|-----------|-------|
| **Category** | DRY |
| **Severity** | Medium |
| **Location** | Section 3.1 (Detect-and-Retry Pattern) |

**問題**:

設計方針書ではインライン実装を選択し、YAGNI原則を根拠としている:

> 初期実装では共通ヘルパーとして切り出さず、各sendMessage内にインライン実装する

しかし、Issue #212の時点で既に2箇所（claude-session.ts、codex.ts）に同一ロジックを実装することが確定している。YAGNIは「将来必要になるかもしれない機能を先行実装しない」原則であり、「現時点で確定している重複を放置する」根拠としては不適切。

検知タイミングの違い（Enter送信後のフック位置）は呼び出し側で制御可能であり、ループ本体は共通化できる:

```typescript
// cli-patterns.ts or new module
export async function detectAndResendIfPastedText(
  sessionName: string,
  maxRetries: number = MAX_PASTED_TEXT_RETRIES,
  delay: number = PASTED_TEXT_DETECT_DELAY
): Promise<void> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    await sleep(delay);
    const output = await capturePane(sessionName, { startLine: -10 });
    if (!PASTED_TEXT_PATTERN.test(stripAnsi(output))) {
      return;
    }
    await sendKeys(sessionName, '', true);
  }
  logger.warn('Pasted text detection: max retries reached');
}
```

**推奨**: 初回実装時に共通ヘルパーとして切り出す。2箇所の同時実装が確定している以上、DRY優先が妥当。

---

#### SF-002: 定数の配置場所

| Attribute | Value |
|-----------|-------|
| **Category** | OCP / Testability |
| **Severity** | Medium |
| **Location** | Section 4.1 (Constant Design) |

**問題**:

`PASTED_TEXT_DETECT_DELAY` と `MAX_PASTED_TEXT_RETRIES` を `claude-session.ts` に配置する設計だが、`codex.ts` でも同じ値が必要。

現在の `claude-session.ts` の定数群（`CLAUDE_INIT_TIMEOUT`, `CLAUDE_POST_PROMPT_DELAY` 等）はClaude固有の定数であるが、Pasted text検知定数はCLIツール横断の共通定数。

`codex.ts` が `claude-session.ts` からimportすると:
- モジュール名からClaude固有と推測されるモジュールへの意味的に不適切な依存
- codex.tsのテスト時にclaude-session.tsのモック設定が必要になる可能性

**推奨**: `cli-patterns.ts` に `PASTED_TEXT_DETECT_DELAY` と `MAX_PASTED_TEXT_RETRIES` を配置。`PASTED_TEXT_PATTERN` と同じモジュールで一元管理。

---

#### SF-003: codex.tsテストのEnter送信方式混在の検証

| Attribute | Value |
|-----------|-------|
| **Category** | Test Design |
| **Severity** | Medium |
| **Location** | Section 5.3 (codex.test.ts Test Design) |

**問題**:

`codex.ts` の既存 `sendMessage()` では `execAsync(tmux send-keys C-m)` でEnterを送信しているが、Pasted text再送時は `sendKeys(sessionName, '', true)` を使用する設計。テスト設計でこの混在が検証されているか不明確。

特にテストケース2「Enter再送にsendKeysを使用」は再送部分のみの検証であり、全体の呼び出しフロー（sendKeys(msg, false) -> execAsync(C-m) -> capturePane -> sendKeys('', true)）の順序を検証していない。

**推奨**: 呼び出し順序を含む統合的なテストケースを追加。

---

#### SF-004: リトライ上限到達時のログ方式

| Attribute | Value |
|-----------|-------|
| **Category** | Design Completeness |
| **Severity** | Low |
| **Location** | Section 4.2, Step 7f |

**問題**:

設計方針書では `console.warn` を使用しているが、プロジェクトでは `createLogger()` パターンが既に導入されている（cli-patterns.tsのL10参照）。

```typescript
// 既存パターン（cli-patterns.ts L10）
const logger = createLogger('cli-patterns');
```

一貫性のため `createLogger('claude-session')` を使用すべき。なお、claude-session.ts自体にも既にTODOコメント（L362）でログ方式統一が課題として認識されている。

**推奨**: `createLogger` を使用。Issue #212の範囲でclaude-session.ts全体のログ統一は不要だが、新規追加コードは統一パターンに従うべき。

---

### Consider (4 items)

#### C-001: Gemini CLIでのPasted text発生可能性

Gemini CLIが `変更なし` とされている理由（non-interactiveモード）の設計根拠をコード内コメントとして残すことで、将来の保守者が判断を追跡しやすくなる。

#### C-002: response-poller.tsのcleanClaudeResponse()テスト追加

`cleanClaudeResponse()` の `skipPatterns` に `PASTED_TEXT_PATTERN` を追加するが、対応するテストケースが設計書に含まれていない。`[Pasted text #1 +46 lines]` を含むレスポンス文字列が適切にフィルタリングされることを検証するテストを追加すべき。

#### C-003: capturePane({ startLine: -10 })のキャプチャ範囲

検知用の `capturePane` は直近10行をキャプチャするが、`[Pasted text]` 表示が常にバッファ末尾から10行以内に出現する保証の根拠が不明。非常に長いメッセージをペーストした場合、CLIの表示レイアウトによっては10行を超える位置に表示される可能性がある。実測による検証を推奨。

#### C-004: PASTED_TEXT_PATTERNのfalse positive/negative分析

現在のパターン `/\[Pasted text #\d+/` は先頭部分のみマッチする設計で、PASTE-001として設計根拠が記載されている。ただし、false positiveのリスク評価（ユーザーのメッセージやCLI出力に `[Pasted text #` という文字列が偶然含まれるケース）が明示されていない。実用上のリスクは極めて低いが、設計書にトレードオフ分析を明記すると良い。

---

## Risk Assessment

| Risk Type | Content | Impact | Probability | Priority |
|-----------|---------|--------|-------------|----------|
| Technical | 単一行メッセージへの一律+500ms遅延によるUX劣化 | Medium | High | P1 |
| Technical | claude-session.tsとcodex.tsの検知ロジック重複による保守コスト | Low | Medium | P2 |
| Operational | capturePane範囲不足による検知失敗 | Medium | Low | P3 |
| Security | PASTED_TEXT_PATTERNの偽装リスク | Low | Low | P3 |
| Technical | Claude CLI バージョン更新による[Pasted text]フォーマット変更 | Medium | Low | P3 |

---

## Design Principles Checklist

| Principle | Status | Note |
|-----------|--------|------|
| **SRP** | PASS | パターン定義(cli-patterns.ts)、セッション管理(claude-session.ts)、CLIツール固有(codex.ts)、レスポンス処理(response-poller.ts)の責務分離が適切 |
| **OCP** | PASS | skipPatternsへの追加で既存コードへの影響を最小化。getCliToolPatterns()の拡張も既存パターンに沿った変更 |
| **LSP** | PASS | CodexToolはBaseCLITool/ICLIToolの契約を維持。sendMessage()のシグネチャ変更なし |
| **ISP** | PASS | ICLIToolインターフェースに影響しない内部実装変更 |
| **DIP** | CONDITIONAL | PASTED_TEXT_PATTERNの定数抽象化は良い。検知ロジックがtmux.tsに直接依存する点はテスト容易性に影響 |
| **KISS** | CONDITIONAL | Detect-and-Retryパターン自体はシンプルだが、全メッセージへの一律適用が過剰（MF-001） |
| **YAGNI** | PASS | 共通ヘルパー化の先送りはYAGNI準拠（ただしDRYとの緊張関係あり：SF-001） |
| **DRY** | CONDITIONAL | パターン定数の一元化は良い。検知ループ本体の2箇所重複は改善余地あり（SF-001） |

---

## Approval Status

**Conditionally Approved** -- 以下の条件を満たすことで承認:

1. **MF-001の対処方針決定**: 単一行メッセージへの+500ms遅延を回避するため、`message.includes('\n')` による条件分岐の採用/却下を明確に判断し、却下する場合はその技術的根拠を設計書に追記すること
2. **SF-002の検討**: PASTED_TEXT_DETECT_DELAY/MAX_PASTED_TEXT_RETRIES の配置場所を検討すること

SF-001（DRYヘルパー化）およびSF-003（テスト設計補強）は実装フェーズでの対応でも可。

---

*Generated by Architecture Review Agent*
*Date: 2026-02-10*
