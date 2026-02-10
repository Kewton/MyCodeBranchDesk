# Architecture Review Report: Issue #212 - Stage 4 Security Review

## Executive Summary

| 項目 | 内容 |
|------|------|
| **Issue** | #212 - 複数行メッセージ送信時の[Pasted text]検知 + Enter自動送信 |
| **Review Stage** | Stage 4: セキュリティレビュー |
| **Status** | conditionally_approved |
| **Score** | 4 / 5 |
| **Reviewed By** | Architecture Review Agent |
| **Date** | 2026-02-10 |

Issue #212 の設計方針書に対して OWASP Top 10 準拠、入力検証、認証・認可、データ保護、エラーハンドリング、ログ・監視の観点からセキュリティレビューを実施した。

本変更はローカル tmux セッション内での操作に限定されており、ネットワーク越しの攻撃面は増加しない。全体的なセキュリティリスクは **低** と評価する。1件の Must Fix（sessionName のバリデーション方針の明示）、3件の Should Fix（ログコンテキスト強化、正規表現の false positive 文書化、定数の環境変数上書き検討）、5件の Consider を報告する。

---

## OWASP Top 10 Checklist

### A01:2021 - Broken Access Control

**評価: PASS**

tmux セッションへのアクセスは OS ユーザーレベルの権限で保護されている。tmux はソケットファイルの所有者のみがセッションにアクセスできるため、他ユーザーからの不正アクセスは OS 層で防止される。API 層では `route.ts` の worktree 存在確認（DB lookup）が既存のアクセス制御として機能しており、本変更は API 層に変更を加えない。

### A02:2021 - Cryptographic Failures

**評価: NOT APPLICABLE**

本変更は暗号化・機密データの取り扱いを含まない。tmux バッファの読み取りはローカル操作のみであり、ネットワーク転送は発生しない。

### A03:2021 - Injection

**評価: CONDITIONAL PASS** (MF-S4-001 対応が必要)

`detectAndResendIfPastedText(sessionName)` は受け取った `sessionName` を `capturePane()` および `sendKeys()` に渡す。これらの関数は最終的に以下の形式で tmux コマンドを実行する:

```
tmux capture-pane -t "${sessionName}" -p -e -S -10 -E -
tmux send-keys -t "${sessionName}" '' C-m
```

`tmux.ts` の `sendKeys()` 関数は `keys` パラメータに対してシングルクォートエスケープ (`keys.replace(/'/g, "'\\''")`) を適用しているが、`sessionName` に対しては直接のエスケープ処理はなく、ダブルクォートで囲むのみとなっている。

実運用上、`sessionName` は `getSessionName()` で `'mcbd-claude-{worktreeId}'` 形式に固定されるため、コマンドインジェクションのリスクは極めて低い。しかし、`pasted-text-helper.ts` を独立した共通ヘルパーとして公開する以上、入力の安全性に関する前提条件を設計書に明記すべきである。

**正規表現の ReDoS リスク**: `PASTED_TEXT_PATTERN = /\[Pasted text #\d+/` は固定文字列 + 数字クラスの単純なパターンであり、線形時間で評価される。ReDoS リスクはない。

`sendKeys(sessionName, '', true)` による Enter 再送は、空文字列をシングルクォートエスケープした後に `C-m` を付与する形式であり、インジェクションリスクはない。

### A04:2021 - Insecure Design

**評価: PASS**

Detect-and-Retry パターンは以下の安全設計を備えている:

1. **リトライ上限**: `MAX_PASTED_TEXT_RETRIES = 3` で無限ループを防止
2. **改行ガード条件**: `message.includes('\n')` で不要な検知ループを回避
3. **Graceful degradation**: パターン不一致時は Issue #212 以前の動作に戻るのみ
4. **フェイルセーフ**: リトライ上限到達時はログ出力のみで例外をスローしない

### A05:2021 - Security Misconfiguration

**評価: PASS**

新規定数（`PASTED_TEXT_DETECT_DELAY`, `MAX_PASTED_TEXT_RETRIES`）はプロジェクト全体の定数管理方針（ハードコード + export）に従って `cli-patterns.ts` に配置される。既存の `CLAUDE_INIT_TIMEOUT`, `CLAUDE_POST_PROMPT_DELAY` 等と同じパターンであり、一貫性がある。

### A06:2021 - Vulnerable and Outdated Components

**評価: NOT APPLICABLE**

新規外部依存の追加はない。既存の `tmux`, `cli-patterns`, `logger` モジュールのみを使用する。

### A07:2021 - Identification and Authentication Failures

**評価: NOT APPLICABLE**

本変更は認証・認可メカニズムに影響しない。

### A08:2021 - Software and Data Integrity Failures

**評価: PASS**

`response-poller.ts` の `skipPatterns` に `PASTED_TEXT_PATTERN` を追加することで、CLI ツールの応答データから `[Pasted text #N +XX lines]` 行を除去する。これは応答データの整合性向上に寄与する。`assistant-response-saver.ts` 経由の `cleanClaudeResponse()` パスでも同様にフィルタリングされ、保存データへの汚染を防止する。

### A09:2021 - Security Logging and Monitoring Failures

**評価: CONDITIONAL PASS** (SF-S4-001 対応を推奨)

リトライ上限到達時の構造化ログ（`createLogger('pasted-text').warn`）は設計済み（SF-004）。`logger.ts` の `sanitize()` 機能により、ログ出力時の機密情報漏洩は防止される。ただし、ログに含まれるコンテキスト情報（sessionName のみ）は運用時のトレーサビリティとしてやや不足。

### A10:2021 - Server-Side Request Forgery (SSRF)

**評価: NOT APPLICABLE**

本変更はネットワークリクエストを発行しない。tmux コマンドのローカル実行のみ。

---

## 入力検証の評価

| 入力 | バリデーション状況 | 評価 |
|------|------------------|------|
| `sessionName` | `getSessionName()` で固定形式に変換。API 層で worktreeId の DB 存在確認済み | 十分（ヘルパー内バリデーション方針の明示を推奨） |
| `message` | API 層（`route.ts` L63-68）で非空文字列検証済み。`message.includes('\n')` で改行有無を判定 | 十分 |
| `capturePane` 出力 | `stripAnsi()` 適用後に `PASTED_TEXT_PATTERN` で照合。tmux バッファの直接読み取り | 十分 |
| `PASTED_TEXT_PATTERN` | 固定定数。正規表現は線形時間評価。ReDoS リスクなし | 十分 |

---

## エラーハンドリングの評価

| エラーシナリオ | 設計上の対応 | 評価 |
|--------------|------------|------|
| `capturePane` 失敗 | エラーを呼び出し元に伝播（try-catch で握りつぶさない） | 適切 |
| `sendKeys` 失敗 | `tmux.ts` がスローするエラーをそのまま伝播 | 適切 |
| リトライ上限到達 | `logger.warn` で記録。例外はスローしない。処理継続 | 適切（フェイルセーフ） |
| `stripAnsi` で除去しきれない ANSI シーケンス | パターンマッチ失敗 -> Pasted text 未検知 -> 既存動作に戻る | 適切（graceful degradation） |

---

## Risk Assessment

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| セキュリティ | sessionName 経由の tmux コマンドインジェクション | Low | Very Low | P2（設計文書への明記） |
| セキュリティ | PASTED_TEXT_PATTERN の false positive による応答損失 | Low | Low | P3（文書化で対応） |
| 運用リスク | リトライ上限到達時のトレーサビリティ不足 | Low | Low | P3（ログ強化） |
| 技術リスク | Claude CLI バージョンアップによるフォーマット変更 | Low | Medium | P3（graceful degradation で対応済み） |

---

## Findings

### Must Fix (1件)

#### MF-S4-001: sessionName のバリデーション方針の明示

**カテゴリ**: A03:2021 - Injection
**重要度**: Medium

`detectAndResendIfPastedText(sessionName)` は `sessionName` を tmux コマンドに展開する `capturePane()` / `sendKeys()` に直接渡す。`tmux.ts` ではセッション名をダブルクォートで囲んでいるが、ダブルクォート内でもコマンド置換（`$()`、バッククォート）が理論的には可能である。

実運用上は `getSessionName()` で `'mcbd-claude-{worktreeId}'` 形式に固定されるため実害のリスクは極めて低いが、`pasted-text-helper.ts` を独立ヘルパーとして公開する以上、入力の安全性に関する前提条件を設計書に明記すべきである。

**推奨対応**: 設計書 Section 4.4 の `@designNote` に以下のいずれかを追記する:
- (A) `sessionName` は `getSessionName()` 経由の固定形式のみを受け付ける前提であること
- (B) `tmux.ts` のダブルクォートエスケープに依存する設計根拠の明記
- (C) ヘルパー内での `/^[a-zA-Z0-9_-]+$/` バリデーション追加の検討

### Should Fix (3件)

#### SF-S4-001: リトライ上限到達時のログコンテキスト強化

**カテゴリ**: A09:2021 - Security Logging and Monitoring Failures
**重要度**: Low

リトライ上限到達時のログに `sessionName` と `maxRetries` のみが記録される設計となっている。運用時のインシデント調査では、どの操作でリトライ上限に達したかのコンテキスト（worktreeId、メッセージの行数等）が必要になる可能性がある。

**推奨対応**: ヘルパーのシグネチャを変更せずに、呼び出し元（`claude-session.ts`, `codex.ts`）でヘルパー呼び出し前後に info レベルのログを追加し、worktreeId との紐付けを可能にする。

#### SF-S4-002: PASTED_TEXT_PATTERN の skipPatterns 使用時の false positive 文書化

**カテゴリ**: A04:2021 - Insecure Design
**重要度**: Low

`PASTED_TEXT_PATTERN = /\[Pasted text #\d+/` は部分マッチであるため、`response-poller.ts` の `skipPatterns` で使用される場合、行内のどこかに `[Pasted text #` が含まれるだけで当該行がフィルタされる。Claude CLI がペースト検知について言及する応答（例: ユーザーが `[Pasted text]` について質問した場合）で false positive が発生しうる。

**推奨対応**: 設計書の PASTE-001 コメントに、skipPatterns での使用時の false positive シナリオと「応答内容の損失は軽微（当該行のみ）であり、機能的影響は許容範囲内」との判断根拠を追記する。

#### SF-S4-003: 定数の環境変数上書きに関する将来方針の記載

**カテゴリ**: A05:2021 - Security Misconfiguration
**重要度**: Low

`PASTED_TEXT_DETECT_DELAY` (500ms) と `MAX_PASTED_TEXT_RETRIES` (3) はハードコード定数であり、環境変数による上書き手段がない。プロジェクト全体の方針（`CLAUDE_INIT_TIMEOUT` 等も同様にハードコード）と一貫しているため即座の対応は不要だが、将来の拡張可能性を記載しておくと有用。

**推奨対応**: 設計書の制約条件セクション（Section 11）に将来的な環境変数対応の可能性を注記。

### Consider (5件)

#### C-S4-001: stripAnsi() の既知制限が pasted-text-helper.ts にも適用される点の文書化

`cli-patterns.ts` の SEC-002 コメントに文書化済みの `stripAnsi()` の制限事項（8-bit CSI 等非対応）は、`pasted-text-helper.ts` でも同様に適用される。追加対応は不要だが、SEC-002 コメントに参照を追記することを検討。

#### C-S4-002: Claude CLI バージョンアップへの耐性

Stage 3 レビューの C-S3-002 で確認済み。graceful degradation 設計で対応。

#### C-S4-003: tmux セッションアクセス制御の前提条件の明示

設計書 Section 6 の「タイミング攻撃」行に、tmux ソケットの OS レベルアクセス制御に依存する前提を補足として追記することを検討。

#### C-S4-004: Pasted text 検知成功時のログ出力

検知+Enter 再送の成功パスに logger.info または logger.debug を追加し、機能の発動頻度を可視化することを検討。

#### C-S4-005: sendKeys('', true) の空文字列 Enter 再送の安全性テスト

既存の `claude-session.ts` L360 付近での同パターン使用実績があり、リスクは低い。`pasted-text-helper.test.ts` に明示的な検証を追加することを検討。

---

## Approval Status

**Status: Conditionally Approved**

Must Fix 1件（MF-S4-001: sessionName バリデーション方針の設計書への明記）の対応を条件とする。セキュリティ上の実害リスクは低く、設計文書レベルの補強で対応可能な指摘が中心である。本変更の攻撃面はローカル tmux セッションに限定されており、ネットワーク越しの新たな攻撃経路は発生しない。

---

*Generated by Architecture Review Agent*
*Review target: `dev-reports/design/issue-212-pasted-text-detection-design-policy.md`*
*Result file: `dev-reports/issue/212/multi-stage-design-review/stage4-review-result.json`*
