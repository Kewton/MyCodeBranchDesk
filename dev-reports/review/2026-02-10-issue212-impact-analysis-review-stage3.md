# Architecture Review: Issue #212 - Impact Analysis (Stage 3)

## Review Summary

| Item | Value |
|------|-------|
| Issue | #212 - Pasted text detection + Enter auto-send |
| Stage | 3 (Impact Analysis) |
| Focus | 影響範囲 (Impact Scope) |
| Status | conditionally_approved |
| Score | 4/5 |
| Date | 2026-02-10 |
| Design Document | `dev-reports/design/issue-212-pasted-text-detection-design-policy.md` |

---

## 1. Executive Summary

Issue #212 の設計方針書に対する影響範囲分析レビューを実施した。設計書は全体的に影響範囲の評価が丁寧に行われており、直接変更対象の網羅性は高い。しかし、`assistant-response-saver.ts` が `cleanClaudeResponse()` をimportしている間接的な依存関係が設計書の影響範囲サマリー（Section 10）で言及されていない点が Must Fix として検出された。

全体のリスクレベルは **Low** であり、変更はAPIシグネチャやデータベーススキーマに影響せず、既存機能への後方互換性も維持されている。

---

## 2. Direct Change Target Analysis

### 2.1 Change File Coverage

| File | Change Type | Risk | Assessment |
|------|-------------|------|------------|
| `src/lib/cli-patterns.ts` | 定数追加 + skipPatterns追加 | Low | 既存exportに追加のみ。既存パターンの動作は不変 |
| `src/lib/pasted-text-helper.ts` | **New** | Low | 新規モジュール。既存コードへの影響なし |
| `src/lib/claude-session.ts` | import + guard + helper call | Low | sendMessageToClaude() 末尾に条件付き追加。シグネチャ不変 |
| `src/lib/cli-tools/codex.ts` | import + guard + helper call | Low | sendMessage() 末尾に条件付き追加。シグネチャ不変 |
| `src/lib/response-poller.ts` | skipPatterns追加 | Low | cleanClaudeResponse() + getCliToolPatterns() に1要素追加 |

**Coverage Assessment**: 直接変更対象ファイルは全て網羅されている。設計書 Section 10 の変更ファイル一覧と一致する。見落としている直接変更ファイルはない。

---

## 3. Indirect Impact Analysis

### 3.1 Dependency Graph (変更ファイルに依存しているモジュール)

```
cli-patterns.ts (変更)
  <-- claude-session.ts (変更)
  <-- response-poller.ts (変更)
  <-- auto-yes-manager.ts (影響なし: PASTED_TEXT_PATTERN未使用)
  <-- status-detector.ts (影響なし: skipPatterns未使用)
  <-- assistant-response-saver.ts (影響なし: stripAnsiのみ使用)
  <-- prompt-response/route.ts (影響なし: stripAnsi, buildDetectPromptOptionsのみ)
  <-- current-output/route.ts (影響なし: stripAnsi, buildDetectPromptOptionsのみ)

claude-session.ts (変更)
  <-- cli-tools/claude.ts (自動反映: sendMessageToClaude委譲)
  <-- claude-poller.ts (影響なし: captureClaudeOutput/isClaudeRunningのみ使用)
  <-- hooks/claude-done/route.ts (影響なし: captureClaudeOutputのみ使用)

response-poller.ts (変更)
  <-- assistant-response-saver.ts (★間接影響: cleanClaudeResponse使用 - MF-S3-001)
  <-- send/route.ts (startPolling使用: 影響なし)
  <-- start-polling/route.ts (startPolling使用: 影響なし)
  <-- respond/route.ts (startPolling使用: 影響なし)
  <-- session-cleanup.ts (stopPolling使用: 影響なし)
  <-- cli-tools/manager.ts (stopPolling使用: 影響なし)
```

### 3.2 Indirect Impact Details

| File | Dependency Path | Impact | Risk | Design Coverage |
|------|----------------|--------|------|-----------------|
| `src/lib/assistant-response-saver.ts` | response-poller.ts -> cleanClaudeResponse() | [Pasted text] 行がフィルタリングされる（正の影響） | Low | **Not covered (MF-S3-001)** |
| `src/lib/cli-tools/claude.ts` | claude-session.ts -> sendMessageToClaude() | 自動反映 | Low | Covered |
| `src/app/api/.../send/route.ts` | cliTool.sendMessage() 経由 | APIレスポンスタイム+最大1500ms | Low | Covered |
| `src/lib/auto-yes-manager.ts` | cli-patterns.ts -> stripAnsi等 | 影響なし | None | Covered |
| `src/lib/status-detector.ts` | cli-patterns.ts -> getCliToolPatterns | 影響なし（skipPatterns未使用） | None | Covered |

### 3.3 API Changes

設計書で正しく評価されている通り、API シグネチャの変更はない。`POST /api/worktrees/:id/send` の内部動作のみ変更される。

### 3.4 Database Schema Changes

なし。設計書に明示的な記載はないが、データベース操作を含む変更がないため問題ない。

---

## 4. Test Impact Analysis

### 4.1 Test File Coverage

| Test File | Status | Design Coverage | Assessment |
|-----------|--------|----------------|------------|
| `tests/unit/lib/pasted-text-helper.test.ts` | New | Covered | 5テストケース。capturePane失敗時のエッジケースも含む |
| `tests/unit/lib/cli-patterns.test.ts` | Modified | Covered | PASTED_TEXT_PATTERNマッチ + 定数値 + skipPatterns確認 |
| `tests/unit/lib/claude-session.test.ts` | Modified | Covered | 改行ガード条件 + ヘルパー呼び出し検証 |
| `tests/unit/lib/response-poller.test.ts` | New | Covered | cleanClaudeResponse() のフィルタリング検証 |
| `tests/unit/cli-tools/codex.test.ts` | Modified | Covered | モック基盤構築 + 呼び出し順序テスト |
| `tests/integration/api-send-cli-tool.test.ts` | Regression | Covered | 既存パス確認 |

### 4.2 Test Coverage Gaps

1. **assistant-response-saver.ts 経由パスのテスト (MF-S3-001)**
   - `cleanClaudeResponse()` に PASTED_TEXT_PATTERN が追加されることで `assistant-response-saver.ts` の `cleanCliResponse()` -> `cleanClaudeResponse()` パスにも影響するが、このパスのテストが計画されていない。

2. **cli-patterns.test.ts の二重存在 (SF-S3-001)**
   - `src/lib/__tests__/cli-patterns.test.ts` と `tests/unit/lib/cli-patterns.test.ts` の両方が存在し、どちらにテストを追加するかが不明確。

3. **codex.test.ts のモック基盤によるregression (SF-S3-002)**
   - 既存のcodex.test.ts は tmux/child_process をモックしていないが、新テスト追加時にファイルレベルでモックを追加すると、既存テスト（`isRunning` の `should return false for non-existent session`）が影響を受ける。

### 4.3 Regression Test Scope

設計書で `api-send-cli-tool.test.ts` が回帰テストとして挙げられている。確認したところ、このテストは `sendMessageToClaude` をモックしているため、新機能の動作は検証されないが、APIインターフェースの不変性は確認できる。回帰テストとしての位置付けは妥当。

---

## 5. Performance Impact Analysis

### 5.1 Execution Time Impact

| Scenario | Additional Delay | Frequency | Assessment |
|----------|-----------------|-----------|------------|
| Single-line message | +0ms | High (majority) | No impact (guard skip) |
| Multi-line (no Pasted text) | +500ms | Medium | capturePane(-10) is lightweight |
| Multi-line (resolved in 1 try) | +1000ms | Medium | Acceptable |
| Multi-line (worst case, 3 retries) | +1500ms | Low | Acceptable for CLI usage |

### 5.2 Resource Impact

- **capturePane({ startLine: -10 })**: 10行のキャプチャはtmux側の処理として軽量。既存の capturePane({ startLine: -50 }) より範囲が狭く、リソース効率は良い。
- **PASTED_TEXT_PATTERN**: `/\[Pasted text #\d+/` は線形時間で評価される正規表現であり、ReDoS リスクなし。
- **stripAnsi()**: 既存のモジュールレベル定数パターンを使用。追加のオーバーヘッドなし。

### 5.3 Scalability

パフォーマンスへの影響は1セッション単位であり、複数ワークツリーの並列運用には影響しない。MAX_PASTED_TEXT_RETRIES=3 による上限があるため、異常時でも無限ループにはならない。

---

## 6. Compatibility Impact Analysis

### 6.1 Backward Compatibility

- **関数シグネチャ**: sendMessageToClaude(worktreeId, message) -- 変更なし
- **CodexTool.sendMessage(worktreeId, message)** -- 変更なし
- **cleanClaudeResponse(response)** -- 変更なし（内部skipPatternsの追加のみ）
- **getCliToolPatterns(cliToolId)** -- 戻り値のskipPatterns配列に1要素追加。消費側は `.some()` で走査するため、追加要素による破壊的変更なし。

### 6.2 Forward Extensibility

- 共通ヘルパー `detectAndResendIfPastedText()` により、将来のCLIツール追加時（例: Gemini インタラクティブモード）にも同じパターンを適用可能。
- `PASTED_TEXT_PATTERN` が cli-patterns.ts に集約されているため、パターン変更時の修正箇所が1箇所に限定される。
- MAX_PASTED_TEXT_RETRIES, PASTED_TEXT_DETECT_DELAY が定数として公開されているため、将来のチューニングが容易。

### 6.3 Claude CLI Version Dependency

設計書 Section 11 で適切に言及されている。PASTED_TEXT_PATTERN がマッチしなくなった場合でも graceful degradation（Issue #212 以前の状態に戻るだけ）であり、新たな問題は発生しない。

---

## 7. Findings Summary

### 7.1 Must Fix (1 item)

| ID | Category | Title | Severity |
|----|----------|-------|----------|
| MF-S3-001 | Indirect Impact | assistant-response-saver.ts の cleanClaudeResponse() 依存に対する影響が未評価 | Medium |

**Details**: `src/lib/assistant-response-saver.ts` (L24) が `response-poller.ts` から `cleanClaudeResponse()` をimportしている。`cleanClaudeResponse()` の `skipPatterns` に `PASTED_TEXT_PATTERN` を追加する変更は、`assistant-response-saver.ts` 経由のレスポンスクリーニングにも波及する。影響自体は正（[Pasted text] 行が保存時にもフィルタリングされる）だが、設計書 Section 10 の影響範囲サマリーに記載がない。

**Recommendation**: Section 10 に `assistant-response-saver.ts` を間接影響として追加し、正の影響である旨を明記する。

### 7.2 Should Fix (4 items)

| ID | Category | Title | Severity |
|----|----------|-------|----------|
| SF-S3-001 | Test Coverage | cli-patterns.test.ts の二重存在に関する方針未記載 | Low |
| SF-S3-002 | Test Coverage | codex.test.ts のモック基盤追加による既存テストへの影響リスク | Medium |
| SF-S3-003 | Indirect Impact | getCliToolPatterns('codex') の skipPatterns 追加の実測確認不足 | Low |
| SF-S3-004 | Test Coverage | 統合テスト回帰確認の基準不明確 | Low |

### 7.3 Consider (5 items)

| ID | Category | Title |
|----|----------|-------|
| C-S3-001 | Performance | capturePane キャプチャ範囲（-10 vs -50）の整合性 |
| C-S3-002 | Compatibility | Claude CLI バージョンアップ時のパターン互換性 |
| C-S3-003 | Extensibility | Gemini インタラクティブモード対応時のヘルパーシグネチャ |
| C-S3-004 | Test Naming | response-poller.test.ts のファイル命名 |
| C-S3-005 | Indirect Impact | claude-poller.ts（レガシー）への影響確認 |

---

## 8. Risk Assessment

| Risk Type | Level | Rationale |
|-----------|-------|-----------|
| Technical | Low | 関数シグネチャ変更なし。条件付き追加処理のみ。MAX_RETRIES=3 で上限設定済み |
| Security | Low | capturePane はローカルtmuxバッファ読み取り。正規表現はReDoS安全。外部入力なし |
| Operational | Low | 最悪ケースでも+1500ms。CLI応答時間に対して許容範囲。graceful degradation設計 |
| Overall | **Low** | 影響範囲が明確で限定的。後方互換性維持。テスト計画も概ね十分 |

---

## 9. Conclusion

Issue #212 の設計方針書は影響範囲の評価が概ね適切に行われている。直接変更対象は全て網羅されており、間接影響の大部分も Section 10 の「影響なし確認済み」リストで評価されている。

唯一の Must Fix は `assistant-response-saver.ts` の間接依存の見落としだが、影響自体は正の方向（[Pasted text] 行の追加フィルタリング）であり、リスクは低い。設計書への追記で解決可能。

Should Fix 4件のうち、SF-S3-002（codex.test.ts のモック基盤）が最も実装時の注意を要する。既存テストに影響しないモック構成の設計が必要。

全体として、Stage 3 影響分析レビューの結果は **conditionally_approved (4/5)** とする。MF-S3-001 の設計書修正が完了すれば approved に昇格可能。

---

*Reviewed by: Architecture Review Agent*
*Date: 2026-02-10*
*Stage: 3 (Impact Analysis)*
