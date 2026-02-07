# Architecture Review Report: Issue #181 Security Review (Stage 4)

**Issue**: #181 - fix: 複数行オプションを含むmultiple choiceプロンプトが検出されない
**Review Focus**: セキュリティ (Security)
**Date**: 2026-02-07
**Reviewer**: Architecture Review Agent (Stage 4)
**Status**: **approved** (5/5)

---

## 1. Executive Summary

Issue #181 の設計方針書に対するセキュリティレビューを実施した。本修正は `src/lib/prompt-detector.ts` の `detectMultipleChoicePrompt()` 関数内部で継続行検出条件を拡張するものであり、2つの正規表現パターンの追加と `isContinuationLine()` 関数の抽出が主な変更内容である。

セキュリティ観点での結論として、本修正に **セキュリティ上の問題は検出されなかった**。設計書セクション7のセキュリティ設計は正確であり、実際のコードベースとの照合でも矛盾は見られなかった。OWASP Top 10 の各項目についても準拠状態が維持されている。

---

## 2. Review Checklist

### 2-1. ReDoS脆弱性分析

| パターン | アンカー | 量指定子 | バックトラッキング | 計算量 | 判定 |
|---------|---------|---------|------------------|--------|------|
| `/^[\/~]/` | `^` (先頭) | なし | なし | O(1) | **安全** |
| `/^[a-zA-Z0-9_-]+$/` | `^` `$` (両端) | `+` | 単一文字クラスのためなし | O(n) | **安全** |
| `/^\s{2,}[^\d]/` (既存) | `^` (先頭) | `{2,}` | なし | O(n) | **安全** |
| `/^\s*\d+\./` (既存) | `^` (先頭) | `*` | なし | O(n) | **安全** |
| `DEFAULT_OPTION_PATTERN` (既存) | `^` `$` (両端) | `\s*`, `\s*`, `.+` | 単一パターンのためなし | O(n) | **安全** |
| `NORMAL_OPTION_PATTERN` (既存) | `^` `$` (両端) | `\s*`, `.+` | 単一パターンのためなし | O(n) | **安全** |

**結論**: 追加される正規表現はいずれもアンカー付きであり、ReDoSリスクは存在しない。設計書セクション7-1の分析は正確である。

**補足**: データフロー上流で使用される `stripAnsi()` の `ANSI_PATTERN`（`/\x1b\[[0-9;]*[a-zA-Z]|\x1b\][^\x07]*\x07|\[[0-9;]*m/g`）は非アンカーかつグローバルフラグ付きだが、実際の tmux 出力サイズでは問題にならない。これは Issue #181 のスコープ外の既存コードである。

### 2-2. コマンドインジェクション分析

Issue #181 の修正は正規表現による文字列マッチングのみであり、以下の理由からコマンドインジェクションリスクは存在しない。

1. **修正箇所**: `detectMultipleChoicePrompt()` 内の `isContinuationLine()` 関数は、`rawLine` と `line` のパターンマッチングを行うのみ。外部コマンド実行やDB操作は一切行わない。

2. **Auto-Yes経路の安全性**: 検出結果は `auto-yes-manager.ts` の `pollAutoYes()` を経由して `resolveAutoAnswer()` に渡される。`resolveAutoAnswer()` は `option.number.toString()` のみを返す（`/src/lib/auto-yes-resolver.ts` L35）。この数値文字列が `sendKeys()` に渡されるため、任意コマンドの実行は不可能である。

3. **手動応答経路の安全性**: `/api/worktrees/[id]/respond/route.ts` でユーザーが手動で応答する場合、multiple_choice のオプション番号は `parseInt()` + 有効番号検証（L83-93）を経由する。カスタムテキスト入力（L97-101）は既存の設計であり Issue #181 の変更とは無関係。

**実際のコード確認結果**:

`/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/auto-yes-resolver.ts` L35:
```typescript
return target.number.toString();
```

`/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/tmux.ts` L212-217:
```typescript
const escapedKeys = keys.replace(/'/g, "'\\''");
const command = sendEnter
  ? `tmux send-keys -t "${sessionName}" '${escapedKeys}' C-m`
  : `tmux send-keys -t "${sessionName}" '${escapedKeys}'`;
```

**結論**: 設計書セクション7-2の記述は正確。Issue #181 によりコマンドインジェクションリスクが増加することはない。

### 2-3. XSS分析

検出された `option.label` がUI上で表示される箇所を確認した。

**PromptMessage.tsx** (`/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/components/worktree/PromptMessage.tsx` L117):
```tsx
<span className="flex-1">{option.label}</span>
```

**PromptPanel.tsx** (`/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/components/worktree/PromptPanel.tsx` L286):
```tsx
<span className="font-medium">{option.number}. {option.label}</span>
```

両コンポーネントとも JSX テキストノードとして `option.label` を表示しており、React の自動エスケープが適用される。`dangerouslySetInnerHTML` の使用は確認されなかった。

`question` テキストも同様に JSX テキストノードで表示（PromptPanel.tsx L146, PromptMessage.tsx L52）。

**結論**: 設計書セクション7-3の記述は正確。XSS リスクは存在しない。

### 2-4. 偽陽性によるセキュリティ影響分析

Issue #181 で追加される `isPathContinuation` 条件は、逆順スキャンの継続行判定を拡張するものである。これにより、以下のセキュリティ影響を分析した。

**偽陽性シナリオ（非 multiple_choice 出力が誤って multiple_choice と検出される場合）**:

多層防御により偽陽性は極めて困難である。

| 防御層 | チェック内容 | バイパス条件 |
|--------|------------|-------------|
| Layer 1 | thinking状態スキップ | thinking状態でないこと |
| Layer 2 Pass 1 | U+276F カーソル存在チェック | 出力に `❯ N.` パターンが含まれること |
| Layer 3 | 連番検証（1始まり連番） | オプション番号が1,2,3...であること |
| Layer 4 | 2オプション以上 + デフォルト指示子 | 2つ以上のオプション行 + `❯` 付き行が必要 |

**`isPathContinuation` が偽陽性を引き起こす条件**: `isPathContinuation` は `options.length > 0` の場合にのみ評価され、`continue` でスキップするのみ（逆順スキャンの走査を続行）。この条件は、本来「スキャンを停止する」（`break` で `questionEndIndex` を設定する）行を「スキップ」させるため、走査範囲が広がる方向に作用する。しかし、最終的に Layer 3/4 の検証を通過しなければ `isPrompt: true` にはならない。

**結論**: `isPathContinuation` の追加が偽陽性を直接引き起こすリスクは極めて低い。偽陽性が仮に発生した場合でも、Auto-Yes はデフォルト選択肢の番号を送信するのみであり、Claude CLI 側で不正な選択は拒否される。セキュリティ上の実害はない。

### 2-5. Auto-Yes自動応答のセキュリティ影響分析

Auto-Yes 経路における Issue #181 の影響を確認した。

**データフロー**:
```
tmux output
  -> stripAnsi()
  -> detectThinking() [Layer 1: thinking中はスキップ]
  -> detectPrompt()
    -> detectMultipleChoicePrompt()
      -> Pass 1: ❯ 存在チェック [Layer 2]
      -> Pass 2: オプション収集 + isContinuationLine() [修正対象]
      -> isConsecutiveFromOne() [Layer 3]
      -> options.length >= 2 && hasDefaultIndicator [Layer 4]
  -> resolveAutoAnswer() [数値文字列のみ返却]
  -> sendKeys() [tmux に送信]
```

**安全性の根拠**:

1. `resolveAutoAnswer()` は `option.number.toString()` のみを返す。label テキストは応答内容に使用されない。
2. Issue #181 で label が途中切れになっても、`option.number` は正しく検出されるため Auto-Yes の動作に影響しない。
3. Auto-Yes の保護機構（worktreeId検証、MAX_CONCURRENT_POLLERS=50、1時間タイムアウト、指数バックオフ、重複応答防止）は Issue #181 で変更されない。

**結論**: Auto-Yes 自動応答に対するセキュリティ影響はない。

### 2-6. OWASP Top 10 準拠チェック

| OWASP ID | 項目 | 判定 | 根拠 |
|----------|------|------|------|
| A01 | Broken Access Control | Pass | アクセス制御への変更なし。worktreeId検証、API認証は既存機構が維持 |
| A02 | Cryptographic Failures | N/A | 暗号処理への変更なし |
| A03 | Injection | **Pass** | 正規表現マッチングのみ。外部コマンド・SQL・LDAPへの入力なし |
| A04 | Insecure Design | **Pass** | 4層多層防御設計が維持。偽陽性/偽陰性のトレードオフが設計書に文書化 |
| A05 | Security Misconfiguration | N/A | 設定変更なし |
| A06 | Vulnerable and Outdated Components | N/A | 依存ライブラリの追加・更新なし |
| A07 | Identification and Authentication Failures | N/A | 認証機構への変更なし |
| A08 | Software and Data Integrity Failures | Pass | tmux出力の読み取り専用。データ改竄パスなし |
| A09 | Security Logging and Monitoring Failures | Pass | 既存ログ機構維持。auto-yes-manager.tsのセキュリティログ |
| A10 | Server-Side Request Forgery | N/A | 外部リクエストへの変更なし |

---

## 3. 設計書セキュリティセクション（セクション7）の評価

| セクション | 記述内容 | 正確性 | コードとの整合性 |
|-----------|---------|--------|----------------|
| 7-1 ReDoSリスク | `/^[\/~]/` は O(1)、`/^[a-zA-Z0-9_-]+$/` はバックトラッキングなし O(n) | 正確 | 実コードのパターン定義と一致 |
| 7-2 コマンドインジェクション | 正規表現マッチングのみ、外部コマンド実行なし | 正確 | detectMultipleChoicePrompt() の実装を確認済み |
| 7-3 XSS | React自動エスケープにより防御 | 正確 | PromptMessage.tsx, PromptPanel.tsx で JSX テキストノード使用を確認 |

**評価**: 設計書のセキュリティ設計セクションは簡潔だが正確であり、必要十分な分析が記載されている。

---

## 4. Risk Assessment

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|--------|---------|-----------|
| ReDoS | 追加正規表現によるReDoS | Low | Low | N/A（リスクなし） |
| コマンドインジェクション | 検出結果経由の不正コマンド実行 | Low | Low | N/A（リスクなし） |
| XSS | ラベルテキスト表示時のスクリプト実行 | Low | Low | N/A（React自動エスケープ） |
| 偽陽性による意図しない自動応答 | 誤検出でAuto-Yesが不正な応答を送信 | Medium | Low | N/A（多層防御で十分） |

---

## 5. Improvement Recommendations

### 5-1. Must Fix

なし。

### 5-2. Should Fix

なし。

### 5-3. Consider (参考情報)

| ID | カテゴリ | タイトル | 推奨事項 |
|----|---------|---------|---------|
| S4-001 | ReDoS | ANSI_PATTERN の非アンカーパターン（スコープ外） | 将来的なパフォーマンスレビューで確認。現状は問題なし |
| S4-002 | Auto-Yes安全性 | 多層防御の妥当性確認 | 現状の4層防御で十分。追加対策不要 |
| S4-003 | コマンドインジェクション隣接 | sendKeys() の exec() ベース設計（スコープ外） | 将来的に execFile() ベースへの移行を検討 |
| S4-004 | XSS防御深度 | dangerouslySetInnerHTML の将来使用への注意 | 現状の React 自動エスケープで十分 |

---

## 6. Approval Status

**Status**: approved (5/5)

本修正はセキュリティ観点で問題なく、設計書のセキュリティ分析も正確である。以下の理由から承認とする。

1. 追加される正規表現はいずれも ReDoS に対して安全なパターンである
2. 修正箇所は純粋な文字列パターンマッチングであり、外部コマンド実行・DB操作は行わない
3. Auto-Yes 経由のデータフローでは `resolveAutoAnswer()` が数値文字列のみを返すため、コマンドインジェクションの経路は存在しない
4. UI表示は React 自動エスケープにより XSS から保護されている
5. 4層の多層防御により偽陽性のリスクは極めて低く、仮に発生しても Auto-Yes の送信内容は数値文字列に限定される
6. OWASP Top 10 の全項目について準拠状態が維持されている

---

*Generated by Architecture Review Agent (Stage 4: Security Review)*
*Date: 2026-02-07*
