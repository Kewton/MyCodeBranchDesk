# Issue #256 設計原則レビュー (Stage 1: 通常レビュー)

## Executive Summary

Issue #256「選択メッセージ検出改善」の設計方針書を SOLID / KISS / YAGNI / DRY の観点でレビューした。全体として設計の質は高く、既存アーキテクチャへの影響を最小化しつつ問題を解決する方針が選定されている。しかし、`isContinuationLine()` への `QUESTION_KEYWORD_PATTERN` チェック追加案が SRP (単一責任原則) に抵触する点が主要な懸念事項である。

- **ステータス**: 条件付き承認 (conditionally_approved)
- **スコア**: 4/5
- **必須改善**: 1件
- **推奨改善**: 3件
- **検討事項**: 3件

---

## 1. レビュー対象

| 項目 | 内容 |
|------|------|
| **Issue** | #256 選択メッセージが表示されない |
| **設計方針書** | `dev-reports/design/issue-256-multiple-choice-prompt-detection-design-policy.md` |
| **主要変更ファイル** | `src/lib/prompt-detector.ts` |
| **テストファイル** | `tests/unit/prompt-detector.test.ts` |
| **レビュー観点** | SOLID / KISS / YAGNI / DRY |

---

## 2. 設計原則チェックリスト

### 2.1 SOLID原則

#### SRP (単一責任原則) -- 条件付きパス

**良い点**:
- `isQuestionLikeLine()` は「行が質問的かどうか」の判定に責務が限定されている
- SEC-001b ガードは「False Positive 防止」の責務を持つ
- `detectMultipleChoicePrompt()` 内の各 Layer (1-5) が明確な防御責務を持つ

**懸念点** (MF-001):
設計方針書 3.3 節の `isContinuationLine()` 修正案で `QUESTION_KEYWORD_PATTERN` チェックを追加する方針は、「継続行判定」という責務に「質問行判定」の責務を混入させる。

現在の `isContinuationLine()` (prompt-detector.ts L381-395):
```typescript
function isContinuationLine(rawLine: string, line: string): boolean {
  const endsWithQuestion = line.endsWith('?') || line.endsWith('\uff1f');
  const hasLeadingSpaces = /^\s{2,}[^\d]/.test(rawLine) && !/^\s*\d+\./.test(rawLine) && !endsWithQuestion;
  const isShortFragment = line.length < 5 && !endsWithQuestion;
  const isPathContinuation = /^[\/~]/.test(line) || (line.length >= 2 && /^[a-zA-Z0-9_-]+$/.test(line));
  return !!hasLeadingSpaces || isShortFragment || isPathContinuation;
}
```

設計方針書の修正案:
```typescript
// NEW: Lines containing selection keywords should not be treated as continuation
const containsQuestionKeyword = QUESTION_KEYWORD_PATTERN.test(line);
const hasLeadingSpaces = /^\s{2,}[^\d]/.test(rawLine)
  && !/^\s*\d+\./.test(rawLine)
  && !endsWithQuestion
  && !containsQuestionKeyword;  // NEW: SRP違反の懸念
```

この変更により `isContinuationLine()` は `QUESTION_KEYWORD_PATTERN` に暗黙的に依存することになり、キーワードリストの変更が `isContinuationLine()` の動作にも影響する。

**推奨**: Pass 2 逆スキャンのループ内で、`isContinuationLine()` の前に `isQuestionLikeLine()` チェックを行い、質問行と認識できれば `questionEndIndex` に設定して `break` する方式が SRP を維持する。

#### OCP (開放閉鎖原則) -- パス

- `isQuestionLikeLine()` への Pattern 2 追加は既存の Pattern 1 / Pattern 3 の動作を変更しない
- SEC-001b ガードへの上方走査はフォールバック処理として追加される形で、既存フローの変更は最小限
- 代替案D (isQuestionLikeLine() のインターフェース変更) を不採用とした判断は OCP 観点で適切

#### LSP (リスコフ置換原則) -- 適用外

本修正にはクラス継承やインターフェース実装のシナリオがなく、LSP 適用外。

#### ISP (インターフェース分離原則) -- パス

- `isQuestionLikeLine(line: string): boolean` のシグネチャは変更なし
- `DetectPromptOptions` インターフェースも変更不要
- 代替案D を不採用とした判断は ISP 観点でも適切

#### DIP (依存性逆転原則) -- 適用外

`prompt-detector.ts` は CLI ツール非依存を維持している。CLI ツール固有のオプション構築は `cli-patterns.ts` の `buildDetectPromptOptions()` が担当しており、依存方向が適切に管理されている (auto-yes-manager.ts L318, status-detector.ts L141 で確認)。

### 2.2 KISS原則 -- 条件付きパス

**良い点**:
- 上方走査ロジック自体は `for` ループと `isQuestionLikeLine()` 再利用によるシンプルな構造
- Pattern 2 (行内 `?` チェック) は `line.includes('?')` というシンプルな実装
- 代替案C (Pattern 4 無条件キーワード) を「実装シンプルだが False Positive リスク大」として不採用とした判断は適切

**懸念点** (SF-003):
SEC-001b ガード内に上方走査の `for` ループを直接埋め込むと、現在4行のシンプルなガードが約15行に膨張する。`detectMultipleChoicePrompt()` 関数全体は既に約170行あり、さらなる複雑度増加は可読性を損なう。

**推奨**: 上方走査ロジックを独立した関数（例: `findQuestionLineInRange(lines, questionEndIndex, scanStart)`）に抽出し、SEC-001b ガード内では関数呼び出しのみとする。

### 2.3 YAGNI原則 -- パス

**良い点**:
- 代替案C (Pattern 4 無条件キーワード) を過剰設計として明確に非採用
- `QUESTION_SCAN_RANGE = 3` は必要最小限の値を選択（4行以上離れたケースは非対応と明示）
- `isContinuationLine()` への変更も報告された問題解決に必要な範囲に限定
- 設計方針書の Decision Table (IC-256-001 から IC-256-004) でトレードオフが明確に文書化されている

**注意点** (SF-002):
`QUESTION_SCAN_RANGE = 3` の根拠は経験的な実測値 (model 選択で1-2行、折り返しで2-3行) に基づく。値の変更ガイドラインの明文化が保守性向上に寄与する。

### 2.4 DRY原則 -- パス

**良い点**:
- `isQuestionLikeLine()` を SEC-001b ガード内でも再利用（設計方針書3.3節の走査ロジック）
- `SEPARATOR_LINE_PATTERN` を上方走査のスキップ条件として再利用
- `QUESTION_KEYWORD_PATTERN` を `isContinuationLine()` でも再利用（ただし SRP 観点で要検討）
- 新たな重複コードの導入はない

---

## 3. リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| 技術的リスク | isContinuationLine() の SRP 違反により将来のキーワード追加時に意図しない副作用が発生 | Medium | Medium | P1 |
| 技術的リスク | SEC-001b ガードの複雑度増加による保守性低下 | Low | High | P2 |
| 技術的リスク | Pattern 2 (行内 ? チェック) の False Positive (URL パラメータ等) | Low | Low | P3 |
| セキュリティリスク | False Positive による Auto-Yes 誤送信 | High | Low | P2 |
| 運用リスク | QUESTION_SCAN_RANGE=3 で検出できないエッジケースの報告 | Low | Low | P3 |

---

## 4. 改善推奨事項

### 4.1 必須改善項目 (Must Fix)

#### MF-001: isContinuationLine() の SRP 違反回避

**問題**: 設計方針書 3.3 節の `isContinuationLine()` への `QUESTION_KEYWORD_PATTERN` チェック追加は、「継続行判定」と「質問行判定」の責務を混在させる。

**推奨実装方針**: Pass 2 逆スキャンのループ内 (prompt-detector.ts L483-495) で、`isContinuationLine()` を呼ぶ前に `isQuestionLikeLine()` で質問行かどうかをチェックする。

```typescript
// Non-option line handling (L483付近)
if (collectedOptions.length > 0 && line && !SEPARATOR_LINE_PATTERN.test(line)) {
  const rawLine = lines[i];

  // NEW: Check if this is a question-like line BEFORE continuation check
  // This preserves isContinuationLine()'s SRP (it only judges continuation)
  if (isQuestionLikeLine(line)) {
    questionEndIndex = i;
    break;
  }

  if (isContinuationLine(rawLine, line)) {
    continue;
  }

  questionEndIndex = i;
  break;
}
```

このアプローチにより:
- `isContinuationLine()` の責務は変更なし (SRP 維持)
- `isQuestionLikeLine()` の既存ロジックで判定 (DRY 維持)
- `QUESTION_KEYWORD_PATTERN` を含むインデント行は質問行として認識され、continuation line としてスキップされない
- 既存テスト T11h-T11m には影響なし（これらのテストではインデントなしの見出し行が対象）

**注意**: この方式を採用する場合、`endsWithQuestion` チェックによる `?` 終端行の continuation line 除外ロジック (`isContinuationLine()` L388-389) との重複が生まれるが、防御層として両方を残すことは安全性の観点で許容される。

### 4.2 推奨改善項目 (Should Fix)

#### SF-001: Pattern 2 のスコープ制約の明文化

`isQuestionLikeLine()` は module-private 関数だが、Pattern 2 (行内 `?` チェック) が SEC-001b ガード内のみで安全に機能するという前提を設計書に明記する。将来 `isQuestionLikeLine()` が別文脈で使用される場合の注意事項をコメントとして残す。

#### SF-002: QUESTION_SCAN_RANGE の変更ガイドライン

IC-256-001 の設計定数コメントに、値を変更する際の判断基準を追記する:
- 値を増やす条件: 新しいプロンプト形式で質問行が3行以上離れているケースが確認された場合
- 値を増やすリスク: False Positive の表面積拡大
- 最大推奨値: 5 (question text 抽出範囲 `questionEndIndex - 5` を超えない)

#### SF-003: 上方走査ロジックの関数抽出

SEC-001b ガード内の上方走査を独立関数に抽出する:

```typescript
/**
 * Search upward from questionEndIndex for a question-like line.
 * @returns true if a question-like line was found within QUESTION_SCAN_RANGE
 */
function hasQuestionLineInRange(
  lines: string[],
  questionEndIndex: number,
  scanStart: number
): boolean {
  const scanLimit = Math.max(scanStart, questionEndIndex - QUESTION_SCAN_RANGE);
  for (let i = questionEndIndex - 1; i >= scanLimit; i--) {
    const candidateLine = lines[i]?.trim() ?? '';
    if (!candidateLine || SEPARATOR_LINE_PATTERN.test(candidateLine)) continue;
    if (isQuestionLikeLine(candidateLine)) return true;
  }
  return false;
}
```

### 4.3 検討事項 (Consider)

#### C-001: SEC-001b の2段階フロー明確化

上方走査を含むロジック全体を一つの関数にまとめることで、「questionEndIndex行チェック -> 失敗 -> 上方走査」というフロー制御の意図を関数名で表現する。

#### C-002: isContinuationLine() の将来的リファクタリング

条件数が4つ以上に増えた場合、各判定条件を名前付き関数に分離するか、ルールエンジンパターンの導入を検討する。ただし YAGNI に従い、現時点では過度な抽象化は不要。

#### C-003: SEPARATOR_LINE_PATTERN の再利用 (良好)

上方走査で `SEPARATOR_LINE_PATTERN` をスキップ条件として使用している点は DRY 原則に適合しており、良い設計判断として記録する。

---

## 5. 設計原則準拠サマリ

| 原則 | 評価 | 根拠 |
|------|------|------|
| **SRP** | 条件付きパス | isQuestionLikeLine() / SEC-001bガード / isContinuationLine() の責務分離は基本的に良好だが、isContinuationLine() への QUESTION_KEYWORD_PATTERN 追加案が SRP 違反 |
| **OCP** | パス | パターン追加による拡張方式で既存動作を破壊しない |
| **LSP** | N/A | 継承・インターフェース実装なし |
| **ISP** | パス | 関数インターフェース変更なし |
| **DIP** | N/A | prompt-detector.ts の CLI ツール非依存は維持 |
| **KISS** | 条件付きパス | 上方走査自体はシンプルだが SEC-001b ガードへの直接埋め込みで複雑度増加 |
| **YAGNI** | パス | 不要な機能拡張を適切に非採用、定数値は必要最小限 |
| **DRY** | パス | 既存関数・パターン定数の適切な再利用、新たな重複なし |

---

## 6. 総合評価

設計方針書は、既存の多層防御アーキテクチャ (Layer 1-5) を理解した上で、影響範囲を最小化する修正方針を選定しており、全体的な設計判断は優れている。特に以下の点が評価できる:

1. **代替案の比較分析が適切**: 4つの代替案を明確な基準で評価し、影響範囲最小の案Aを選定
2. **False Positive 防止テストの継続**: T11h-T11m の全パスを確認する計画が明記
3. **YAGNI の適用**: Pattern 4 (無条件キーワード) の非採用判断が適切
4. **DRY の実践**: `isQuestionLikeLine()` や `SEPARATOR_LINE_PATTERN` の再利用

主要な改善点は `isContinuationLine()` への質問キーワード判定の混入回避であり、これを解決すれば実装に進んで問題ない。

---

*Reviewed by: architecture-review-agent*
*Date: 2026-02-13*
*Focus: 設計原則 (SOLID/KISS/YAGNI/DRY)*
*Stage: 1 (通常レビュー)*
