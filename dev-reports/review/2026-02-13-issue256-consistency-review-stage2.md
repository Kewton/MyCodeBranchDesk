# Architecture Review Report: Issue #256 整合性レビュー (Stage 2)

| 項目 | 内容 |
|------|------|
| **Issue** | #256 選択メッセージ検出改善 |
| **レビュー種別** | 整合性 (Consistency) - Stage 2 |
| **日付** | 2026-02-13 |
| **ステータス** | needs_major_changes |
| **スコア** | 2/5 |

---

## Executive Summary

Issue #256 の設計方針書と現在のソースコードの整合性をレビューした結果、設計方針書に記載された全ての変更項目が未実装であることが判明した。設計方針書は Stage 1 の設計原則レビューを経て改訂済みであり、MF-001/SF-001/SF-002/SF-003 の各指摘事項が反映された完成度の高い設計文書となっているが、対応する実装はまだ着手されていない状態である。

本レビューは「設計と実装の一致確認」が目的であるため、全項目が未実装という結果は needs_major_changes と評価する。ただし、これは設計方針書が策定直後であり実装フェーズ前であることが原因であり、設計方針書自体の品質には問題がない。

---

## 詳細な整合性分析

### 設計項目と実装状況の対照表

| 設計項目 | 設計書の記載 | 実装状況 | 差異 |
|---------|------------|---------|------|
| isQuestionLikeLine() Pattern 2 | 行内 `?`/`？` チェック追加 (5.2節) | **未実装** | Pattern 1 (endsWith) と Pattern 2 (colon+keyword) のみ。設計書の新 Pattern 2 は存在しない |
| QUESTION_SCAN_RANGE 定数 | `= 3` で定義、SF-002ガイドライン付きJSDoc (5.3節) | **未実装** | 定数が存在しない |
| findQuestionLineInRange() 関数 | 上方走査ロジックを独立関数として抽出 (5.3節, SF-003) | **未実装** | 関数が存在しない |
| SEC-001b 上方走査 | isQuestionLikeLine() 失敗時に findQuestionLineInRange() でフォールバック (5.3節) | **未実装** | 現在は isQuestionLikeLine() が false なら即座に noPromptResult() を返す |
| Pass 2 isQuestionLikeLine() 先行チェック | isContinuationLine() の手前に追加 (5.5節, MF-001) | **未実装** | isContinuationLine() のみが呼ばれている |
| isContinuationLine() 変更なし制約 | コード変更しない (5.5節, MF-001) | 適合 | 現時点では変更されていない（実装前の状態） |
| テストケース T-256-A1~A3 | パターンA: 複数行折り返し質問 (9.1節) | **未実装** | テストが存在しない |
| テストケース T-256-B1~B2 | パターンB: 質問形式でないプロンプト (9.1節) | **未実装** | テストが存在しない |
| テストケース T-256-FP1~FP2, CL1 | False Positive防止, isContinuationLine相互作用 (9.1節) | **未実装** | テストが存在しない |
| テストケース T-256-FQ1~FQ4, BC1~BC3 | findQuestionLineInRange単体, 境界条件 (9.1節) | **未実装** | テストが存在しない |

### 整合性スコア: 0/10 項目実装済み (0%)

---

## Must Fix 項目 (6件)

### MF-S2-001: isQuestionLikeLine() Pattern 2（行内?チェック）が未実装

**設計書の記載** (5.2節):

```typescript
// Pattern 2 (NEW): Lines containing question mark anywhere
// Handles multi-line question wrapping where '?' is mid-line
if (line.includes('?') || line.includes('\uff1f')) return true;
```

**現在の実装** (`/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/prompt-detector.ts` L315-332):

```typescript
function isQuestionLikeLine(line: string): boolean {
  if (line.length === 0) return false;
  // Pattern 1: Lines ending with question mark
  if (line.endsWith('?') || line.endsWith('\uff1f')) return true;
  // Pattern 2: Lines ending with colon + keyword (設計書では Pattern 3 に番号変更予定)
  if (line.endsWith(':')) {
    if (QUESTION_KEYWORD_PATTERN.test(line)) return true;
  }
  return false;
}
```

**差異**: 設計書の新 Pattern 2（行内 `?` チェック）が追加されていない。現在の Pattern 2 は設計書の Pattern 3（colon + keyword）に対応する。

---

### MF-S2-002: findQuestionLineInRange() 関数が未実装

**設計書の記載** (5.3節, SF-003):

```typescript
function findQuestionLineInRange(
  lines: string[],
  startIndex: number,
  scanRange: number,
  lowerBound: number
): boolean {
  const scanLimit = Math.max(lowerBound, startIndex - scanRange);
  for (let i = startIndex - 1; i >= scanLimit; i--) {
    const candidateLine = lines[i]?.trim() ?? '';
    if (!candidateLine || SEPARATOR_LINE_PATTERN.test(candidateLine)) continue;
    if (isQuestionLikeLine(candidateLine)) {
      return true;
    }
  }
  return false;
}
```

**現在の実装**: この関数はコードベースに存在しない。`grep` の結果でも確認済み。

---

### MF-S2-003: QUESTION_SCAN_RANGE 定数が未実装

**設計書の記載** (5.3節):

```typescript
const QUESTION_SCAN_RANGE = 3;
```

SF-002ガイドライン付きのJSDocコメントも含む。

**現在の実装**: この定数はコードベースに存在しない。

---

### MF-S2-004: SEC-001b ガードの上方走査ロジックが未実装

**設計書の記載** (5.3節):

```typescript
// SEC-001b: Question line validation with upward scan (SF-003: function call)
const questionLine = lines[questionEndIndex]?.trim() ?? '';
if (!isQuestionLikeLine(questionLine)) {
  if (!findQuestionLineInRange(lines, questionEndIndex, QUESTION_SCAN_RANGE, scanStart)) {
    return noPromptResult(output);
  }
}
```

**現在の実装** (`/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/prompt-detector.ts` L522-528):

```typescript
const questionLine = lines[questionEndIndex]?.trim() ?? '';
if (!isQuestionLikeLine(questionLine)) {
  return noPromptResult(output);
}
```

**差異**: `isQuestionLikeLine()` が false を返した場合、上方走査のフォールバック（`findQuestionLineInRange()` の呼び出し）がなく、即座に `noPromptResult()` を返している。

---

### MF-S2-005: Pass 2 逆スキャンループ内の isQuestionLikeLine() 先行チェックが未実装（MF-001対応）

**設計書の記載** (5.5節):

```typescript
if (collectedOptions.length > 0) {
  // NEW (MF-001): Check if line is a question-like line BEFORE continuation check
  if (isQuestionLikeLine(line)) {
    questionEndIndex = i;
    break;
  }
  // EXISTING: Check if line is a continuation line
  if (isContinuationLine(rawLine, line)) {
    continue;
  }
  // ... existing questionEndIndex assignment logic ...
}
```

**現在の実装** (`/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/prompt-detector.ts` L482-495):

```typescript
if (collectedOptions.length > 0 && line && !SEPARATOR_LINE_PATTERN.test(line)) {
  const rawLine = lines[i];
  if (isContinuationLine(rawLine, line)) {
    continue;
  }
  questionEndIndex = i;
  break;
}
```

**差異**: `isContinuationLine()` の手前に `isQuestionLikeLine()` チェックが存在しない。インデントされた質問キーワード行（例: `  Select model`）が continuation line として誤分類される可能性がある。

---

### MF-S2-006: 設計方針書記載の全新規テストケースが未実装

**設計書の記載** (9.1節): 以下のテストケースが定義されている。

- T-256-A1~A3: パターンA（複数行折り返し質問）
- T-256-B1~B2: パターンB（質問形式でないプロンプト）
- T-256-FP1~FP2: False Positive防止
- T-256-CL1: isContinuationLine相互作用（MF-001対応）
- T-256-FQ1~FQ4: findQuestionLineInRange単体テスト（SF-003対応）
- T-256-BC1~BC3: 境界条件

**現在の実装** (`/Users/maenokota/share/work/github_kewton/commandmate-issue-256/tests/unit/prompt-detector.test.ts`): テストファイル内に `T-256` や `T256` の文字列は一切存在しない。

---

## Consider 項目 (2件)

### C-S2-001: isContinuationLine() のコードは設計方針書と整合的

設計方針書 5.5節の MF-001 対応では `isContinuationLine()` のコードを一切変更しないと明記されている。現在の実装 (`/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/prompt-detector.ts` L381-395) はこの要件に適合している。実装時にこの制約が維持されることを確認する必要がある。

### C-S2-002: 影響範囲ファイルの変更不要確認

設計方針書 11章の「変更不要だが影響確認必要なファイル」を確認した。

| ファイル | 呼び出し箇所 | 変更必要性 |
|---------|-------------|-----------|
| `src/lib/auto-yes-manager.ts` | L319: `detectPrompt(cleanOutput, promptOptions)` | 不要（detectPrompt のインターフェース変更なし） |
| `src/lib/response-poller.ts` | L130, L330, L490, L605: `detectPromptWithOptions()` 経由 | 不要 |
| `src/lib/status-detector.ts` | L142: `detectPrompt(cleanOutput, promptOptions)` | 不要 |

全て `detectPrompt()` を呼び出す側であり、内部改善のみで外部インターフェースに変更がないため、設計方針書の記載と整合している。

---

## リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| 技術的リスク | 設計の全項目が未実装のため、実装フェーズでの整合性維持が必要 | High | High | P1 |
| セキュリティ | 未実装のため False Positive/Auto-Yes 安全性への影響はまだ発生していない | Medium | Low | P2 |
| 運用リスク | 既存テスト（3087件）は全パスしているため、現時点での運用影響なし | Low | Low | P3 |

---

## 既存テスト回帰確認

設計方針書 9.2節に記載された既存テスト回帰確認を実施した。

| テストグループ | 件数 | 結果 |
|--------------|------|------|
| T11h-T11m (False Positive防止) | 6件 | PASS |
| T11a-T11g (True Positive) | 7件 | PASS |
| T1-T4 (番号リスト拒否) | 4件 | PASS |
| Issue #181 (multiline option) | 7件 | PASS |
| Issue #161 (2パス検出) | テスト群 | PASS |
| 全テスト | 3087件 | PASS (7 skipped) |

注: Worker forks のエラーが1件報告されたが、テスト自体の失敗ではなくVitest Worker プロセスの問題であり、テスト結果には影響しない。

---

## 設計方針書のコード例と実装の詳細比較

### 1. isQuestionLikeLine() のパターン番号体系

| 設計方針書のパターン | 設計書の内容 | 現在の実装のパターン | 対応 |
|-------------------|------------|-------------------|------|
| Pattern 1 | endsWith('?') / endsWith('?') | Pattern 1 (L323) | 一致 |
| Pattern 2 (NEW) | includes('?') / includes('?') | **存在しない** | 未実装 |
| Pattern 3 (renumbered) | endsWith(':') + QUESTION_KEYWORD_PATTERN | Pattern 2 (L327-329) | 番号不一致（実装は旧番号のまま） |

### 2. SEC-001b ガードの構造比較

**設計書の構造**:
```
SEC-001b:
  1. isQuestionLikeLine(questionLine) を試行
  2. 失敗時: findQuestionLineInRange() で上方走査
  3. 上方走査も失敗: noPromptResult()
```

**現在の実装の構造**:
```
SEC-001b:
  1. isQuestionLikeLine(questionLine) を試行
  2. 失敗時: 即座に noPromptResult()
```

### 3. Pass 2 逆スキャンループの制御フロー比較

**設計書の制御フロー**:
```
non-option line -> isQuestionLikeLine() -> true -> questionEndIndex = i; break
                                        -> false -> isContinuationLine() -> true -> continue
                                                                         -> false -> questionEndIndex = i; break
```

**現在の実装の制御フロー**:
```
non-option line -> isContinuationLine() -> true -> continue
                                        -> false -> questionEndIndex = i; break
```

---

## 改善推奨事項

### 実装フェーズでの推奨順序

1. **Step 1**: `QUESTION_SCAN_RANGE` 定数の追加（SF-002ガイドライン付き）
2. **Step 2**: `isQuestionLikeLine()` に Pattern 2（行内 `?` チェック）を追加（SF-001スコープ制約コメント付き）
3. **Step 3**: `findQuestionLineInRange()` 関数の実装（SF-003対応）
4. **Step 4**: SEC-001b ガードの更新（上方走査フォールバック追加）
5. **Step 5**: Pass 2 逆スキャンループの更新（MF-001: isQuestionLikeLine() 先行チェック追加）
6. **Step 6**: 全新規テストケースの追加（T-256-A1~A3, B1~B2, FP1~FP2, CL1, FQ1~FQ4, BC1~BC3）
7. **Step 7**: 既存テスト回帰確認（T11h-T11m, T11a-T11g, T1-T4 等）
8. **Step 8**: CLAUDE.md の prompt-detector.ts 説明行に Issue #256 変更概要を追記

---

## Approval Status

**ステータス: needs_major_changes**

設計方針書に記載された全ての実装項目（6件の Must Fix）が未実装であるため、整合性レビューとしては needs_major_changes と評価する。設計方針書は Stage 1 レビューを経て高品質であり、実装チェックリスト（12章）に従って実装を進めることで整合性を確保できる。

---

*Generated by architecture-review-agent for Issue #256*
*Review type: 整合性 (Consistency) - Stage 2*
*Date: 2026-02-13*
