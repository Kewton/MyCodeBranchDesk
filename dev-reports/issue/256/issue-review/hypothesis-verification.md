# Issue #256 仮説検証レポート

## 検証日時
- 2026-02-13

## 検証結果サマリー

| # | 仮説/主張 | 判定 | 根拠 |
|---|----------|------|------|
| 1 | 根本原因は `src/lib/prompt-detector.ts` の `isQuestionLikeLine()` 関数（L315-332） | **Confirmed** | コード確認済み（L315-332に実装） |
| 2 | 失敗パターンA: 末尾が「。」の質問文が未対応 | **Confirmed** | Pattern 1（`?`チェック）、Pattern 2（`:` チェック）のいずれもマッチせず、L331で `false` を返す |
| 3 | 失敗パターンB: 末尾が `.` のプロンプトが未対応 | **Confirmed** | Pattern 2は `:` 終端時のみ（L327-328）なので、`.` 終端では QUESTION_KEYWORD_PATTERN が活用されない |
| 4 | QUESTION_KEYWORD_PATTERN が `:` 終端時のみ活用される | **Confirmed** | L327-328 で `:` 終端時のみキーワードチェックが実行される |
| 5 | questionEndIndex はオプション1の手前の最後の非オプション行 | **Confirmed** | L493-494 で非空行・非セパレータ行が見つかったら break |
| 6 | Layer 5 SEC-001b で質問行妥当性検証が実行される | **Confirmed** | L522-528 で `isQuestionLikeLine()` を呼び出し、`false` の場合はプロンプト未検出 |

## 詳細検証

### 仮説 1: 根本原因は `isQuestionLikeLine()` 関数

**Issue内の記述**:
> ### 原因箇所: `src/lib/prompt-detector.ts` の `isQuestionLikeLine()` 関数（L315-332）
> **Layer 5 SEC-001b** の質問行妥当性検証で検出が失敗する。

**検証手順**:
1. `src/lib/prompt-detector.ts` の L315-332 を確認
2. `isQuestionLikeLine()` 関数の実装を確認

**判定**: **Confirmed**

**根拠**:
```typescript
// src/lib/prompt-detector.ts L315-332
function isQuestionLikeLine(line: string): boolean {
  if (line.length === 0) return false;

  // Pattern 1: Lines ending with question mark (English or full-width Japanese)
  if (line.endsWith('?') || line.endsWith('\uff1f')) return true;

  // Pattern 2: Lines ending with colon that contain a selection/input keyword
  if (line.endsWith(':')) {
    if (QUESTION_KEYWORD_PATTERN.test(line)) return true;
  }

  return false;
}
```

Layer 5 SEC-001b の実装（L522-528）:
```typescript
// SEC-001b: Question line exists but is not actually a question/selection request.
const questionLine = lines[questionEndIndex]?.trim() ?? '';
if (!isQuestionLikeLine(questionLine)) {
  return noPromptResult(output);
}
```

**Issueへの影響**: なし（正確な記述）

---

### 仮説 2: 失敗パターンA - 末尾が「。」の質問文が未対応

**Issue内の記述**:
> 1. Pass 2の逆スキャンで、オプション1の手前にある**最後の非オプション行**が `questionEndIndex` に設定される
> 2. その行の末尾は **「。」（句点）** で終わっている
> 3. `isQuestionLikeLine()` は `?`、`？`（全角）、`:` のみチェックし、**`。`は未対応**
> 4. Layer 5 SEC-001b で「質問行ではない」と判定 → **プロンプト未検出**

**検証手順**:
1. `isQuestionLikeLine()` 関数のロジックを確認
2. 「。」で終わる行が Pattern 1、Pattern 2 のいずれにマッチするか確認

**判定**: **Confirmed**

**根拠**:
- Pattern 1（L323）: `line.endsWith('?') || line.endsWith('\uff1f')` → 「。」はマッチしない
- Pattern 2（L327-328）: `line.endsWith(':')` → 「。」はマッチしない
- L331: `return false;` → 「。」で終わる行は `false` を返す

**Issueへの影響**: なし（正確な記述）

---

### 仮説 3: 失敗パターンB - 末尾が `.` のプロンプトが未対応

**Issue内の記述**:
> 1. Pass 2の逆スキャンでオプション1-3を収集し、`questionEndIndex` に「Switch between...--model.」行を設定
> 2. この行の末尾は **`.`（ピリオド）** で終わっている
> 3. `isQuestionLikeLine()` で `?` でも `？` でも `:` でもない → **false**
> 4. Layer 5 SEC-001b で「質問行ではない」と判定 → **プロンプト未検出**
>
> **注意**: この行には「select」「specify」等のキーワードが含まれているが、Pattern 2は `:` 終端時のみキーワードチェックするため、`.` 終端では活用されない。

**検証手順**:
1. Pattern 2のロジックを確認（L327-328）
2. `:` 終端時のみキーワードチェックが実行されることを確認

**判定**: **Confirmed**

**根拠**:
```typescript
// Pattern 2: Lines ending with colon that contain a selection/input keyword
if (line.endsWith(':')) {
  if (QUESTION_KEYWORD_PATTERN.test(line)) return true;
}
```

- L327 で `line.endsWith(':')` をチェック
- `.` で終わる行は L327 の条件を満たさないため、L328 のキーワードチェックが実行されない
- L331 で `return false;` を返す

**Issueへの影響**: なし（正確な記述）

---

### 仮説 4: QUESTION_KEYWORD_PATTERN が `:` 終端時のみ活用される

**Issue内の記述**:
> Pattern 2は `:` 終端時のみキーワードチェックするため、`.` 終端では活用されない。

**検証手順**:
1. QUESTION_KEYWORD_PATTERN の定義を確認（L294）
2. Pattern 2のロジックを確認（L327-328）

**判定**: **Confirmed**

**根拠**:
```typescript
// L294
const QUESTION_KEYWORD_PATTERN = /(?:select|choose|pick|which|what|how|where|enter|type|specify|confirm|approve|accept|reject|decide|preference|option)/i;

// L327-328
if (line.endsWith(':')) {
  if (QUESTION_KEYWORD_PATTERN.test(line)) return true;
}
```

- QUESTION_KEYWORD_PATTERN は L294 で定義されている（Issueの記述と一致）
- L327 の条件（`:` 終端）を満たす場合のみ L328 でキーワードチェックが実行される

**Issueへの影響**: なし（正確な記述）

---

### 仮説 5: questionEndIndex はオプション1の手前の最後の非オプション行

**Issue内の記述**:
> 1. Pass 2の逆スキャンで、オプション1の手前にある**最後の非オプション行**が `questionEndIndex` に設定される

**検証手順**:
1. Pass 2のロジックを確認（L459-495）
2. `questionEndIndex` の設定ロジックを確認

**判定**: **Confirmed**

**根拠**:
```typescript
// L459-495
let questionEndIndex = -1;

for (let i = effectiveEnd - 1; i >= scanStart; i--) {
  const line = lines[i].trim();

  // Try DEFAULT_OPTION_PATTERN first (❯ indicator)
  const defaultMatch = DEFAULT_OPTION_PATTERN.exec(line);
  if (defaultMatch) {
    // ... オプション収集 ...
    continue;
  }

  // Try PLAIN_OPTION_PATTERN
  const plainMatch = PLAIN_OPTION_PATTERN.exec(line);
  if (plainMatch) {
    // ... オプション収集 ...
    continue;
  }

  // Non-option line found
  if (!line || SEPARATOR_LINE_PATTERN.test(line)) {
    // ... 継続行チェック ...
    continue;
  }

  // Found a non-empty, non-separator line before options - likely the question
  questionEndIndex = i;
  break;
}
```

- 末尾から逆順スキャン（L461）
- オプションパターンにマッチする行を収集
- 非空行・非セパレータ行が見つかったら `questionEndIndex = i` として break（L493-494）

**Issueへの影響**: なし（正確な記述）

---

### 仮説 6: Layer 5 SEC-001b で質問行妥当性検証が実行される

**Issue内の記述**:
> **Layer 5 SEC-001b** の質問行妥当性検証で検出が失敗する。

**検証手順**:
1. Layer 5 SEC-001b の実装を確認（L522-528）
2. `isQuestionLikeLine()` の呼び出しを確認

**判定**: **Confirmed**

**根拠**:
```typescript
// L511-528
// Layer 5 [SEC-001]: Enhanced question line validation for requireDefaultIndicator=false.
if (!requireDefault) {
  // SEC-001a: No question line found (questionEndIndex === -1) - reject.
  if (questionEndIndex === -1) {
    return noPromptResult(output);
  }

  // SEC-001b: Question line exists but is not actually a question/selection request.
  const questionLine = lines[questionEndIndex]?.trim() ?? '';
  if (!isQuestionLikeLine(questionLine)) {
    return noPromptResult(output);
  }
}
```

- L525 で `questionLine = lines[questionEndIndex]?.trim() ?? ''` を取得
- L526 で `isQuestionLikeLine(questionLine)` を呼び出し
- `false` の場合は L527 で `noPromptResult(output)` を返す（プロンプト未検出）

**Issueへの影響**: なし（正確な記述）

---

## Stage 1レビューへの申し送り事項

**すべての仮説が Confirmed のため、特記事項なし。**

Issueの記述は非常に正確で、コードベースの実装と完全に一致しています。以下の点を確認：

1. ✅ 根本原因の特定が正確（`isQuestionLikeLine()` 関数）
2. ✅ 失敗パターンA（「。」終端）の分析が正確
3. ✅ 失敗パターンB（`.` 終端）の分析が正確
4. ✅ QUESTION_KEYWORD_PATTERN の活用条件が正確
5. ✅ questionEndIndex の設定ロジックが正確
6. ✅ Layer 5 SEC-001b の実装が正確

**Stage 1 通常レビューでの確認ポイント**:
- 対策案のセキュリティ影響（Pattern 4の追加による誤検出リスク）
- テストケースの網羅性
- 影響範囲の正確性

---

*Generated by multi-stage-issue-review command - Phase 0.5*
