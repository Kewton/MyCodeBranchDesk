# Architecture Review: Issue #181 - Stage 2 整合性レビュー

**日付**: 2026-02-07
**対象**: Issue #181 - 複数行オプションを含むmultiple choiceプロンプトが検出されない
**設計書**: `dev-reports/design/issue-181-multiline-option-detection-design-policy.md`
**レビュー種別**: 整合性レビュー（設計書 vs 実装コードの一致性）

---

## 1. レビュー概要

設計方針書に記載された全27箇所の行番号参照、コードスニペット、動作説明、型定義、呼び出しチェーン、テスト計画を実際のソースコードと照合した。

### 検証対象ファイル一覧

| ファイル | 検証箇所 | 結果 |
|---------|---------|------|
| `src/lib/prompt-detector.ts` | 行56, 67-155, 198, 206, 222, 223-225, 226-228, 230-232, 243 | 全一致 |
| `src/lib/auto-yes-resolver.ts` | 行24-35 | 概ね一致（1行ずれ） |
| `src/lib/auto-yes-manager.ts` | 行280 | 関数位置の記載が曖昧 |
| `src/lib/status-detector.ts` | 行44, 80 | 完全一致 |
| `src/lib/claude-poller.ts` | 行164, 232 | 完全一致 |
| `src/lib/response-poller.ts` | 行248, 442, 556 | 完全一致 |
| `src/app/api/worktrees/route.ts` | 行62 | 完全一致 |
| `src/app/api/worktrees/[id]/route.ts` | 行62 | 完全一致 |
| `src/app/api/worktrees/[id]/current-output/route.ts` | 行79 | 完全一致 |
| `src/app/api/worktrees/[id]/respond/route.ts` | getAnswerInput import | 完全一致 |
| `src/hooks/useAutoYes.ts` | promptData 型使用 | 完全一致 |
| `tests/unit/prompt-detector.test.ts` | multiple choice テスト不在 | 確認済み |
| `src/types/models.ts` | PromptData, MultipleChoiceOption | 完全一致 |

---

## 2. 指摘事項

### 2.1 Must Fix (2件)

#### DR2-F004: テストの逆順スキャン動作は問題なし（調査完了）

当初、逆順スキャンとunshiftによるoptions配列構築がテストケースの期待値と整合するか懸念があったが、詳細調査の結果、問題なしと判断した。

- **テスト期待値**: `options[0] = {number: 1, label: 'Yes', isDefault: true}`
- **実際の動作**: 逆順スキャンで「3. No」->「2. Yes, and...」->「1. Yes」の順に検出、unshiftで先頭に挿入するため最終的に `options = [{1, Yes, true}, {2, ..., false}, {3, No, false}]`
- **結論**: 設計書のテスト期待値は正確

#### DR2-F006: 空行の挙動説明が不足

設計書セクション4.2の再現シナリオでは、テスト入力に含まれる空行（`''`）の逆順スキャン時の挙動が説明されていない。空行は `line = ''` となり、`optionPattern` にマッチせず、`options.length > 0 && line && ...` の `line` 条件も falsy のためどの分岐にも入らず、次のイテレーションに進む。この「空行はスキャンを中断しない」という動作はテストケースの前提条件であるため、明示すべきである。

### 2.2 Should Fix (3件)

#### DR2-F001: auto-yes-manager.ts の行番号参照が曖昧

- **設計書記載**: `280行目 pollAutoYes()`
- **実際**: `pollAutoYes()` 関数は262行目で定義。280行目は関数内部の `detectPrompt()` 呼び出し箇所
- **推奨修正**: `262行目 pollAutoYes() 内 280行目 detectPrompt()` と明確化

#### DR2-F002: auto-yes-resolver.ts の行番号が1行ずれ

- **設計書記載**: `24-35行目`
- **実際**: `multiple_choice` ブロックは23行目の `if` 文から始まる。24-35行目は if 本体のみ
- **影響**: 実用上の問題はないが、正確には23-36行目

#### DR2-F005: 継続行スキップの動作説明がやや曖昧

設計書セクション4.4の説明は、継続行のスキップがオプション2のラベルを不完全にしているように読める。実際には、オプション2の行自体は `optionPattern` に正常にマッチし、label にはオプション2の行内テキストがそのまま使われる。折り返し行は単にスキップされるだけである。

### 2.3 Nice to Have (4件)

| ID | タイトル | 概要 |
|----|---------|------|
| DR2-F003 | PromptDetectionResult の定義場所 | prompt-detector.ts 内の型であることを明示すべき |
| DR2-F007 | 逆順スキャンの省略ステップ | Esc行と空行の処理ステップが省略されている |
| DR2-F008 | テストの型ガード不足 | MultipleChoicePromptData 用の型ガードが未定義 |
| DR2-F009 | テストコードの import 説明 | 既存ファイルへの追記であることを明示すべき |

---

## 3. コードスニペット検証結果

### 3.1 修正対象コード（226-228行目）

**設計書のBefore:**
```typescript
const hasLeadingSpaces = rawLine.match(/^\s{2,}[^\d]/) && !rawLine.match(/^\s*\d+\./);
const isShortFragment = line.length < 5 && !line.endsWith('?');
const isContinuationLine = hasLeadingSpaces || isShortFragment;
```

**実際のコード（prompt-detector.ts 226-228行目）:**
```typescript
const hasLeadingSpaces = rawLine.match(/^\s{2,}[^\d]/) && !rawLine.match(/^\s*\d+\./);
const isShortFragment = line.length < 5 && !line.endsWith('?');
const isContinuationLine = hasLeadingSpaces || isShortFragment;
```

**結果**: 完全一致

### 3.2 optionPattern（198行目）

**設計書**: `/^\s*([❯ ]\s*)?(\d+)\.\s*(.+)$/`
**実際**: `/^\s*([❯ ]\s*)?(\d+)\.\s*(.+)$/`

**結果**: 完全一致

### 3.3 コメント（223-225行目）

**設計書**:
```
// Check if this is a continuation line (indented line between options)
// Continuation lines typically start with spaces (like "  work/github...")
// Also treat very short lines (< 5 chars) as potential word-wrap fragments
```

**実際**: 完全一致

---

## 4. 呼び出しチェーン検証

設計書セクション3.2の影響範囲分析で記載された全7ファイルの `detectPrompt()` 呼び出し箇所を検証した。

| ファイル | 設計書の行番号 | 実際の行番号 | 一致 |
|---------|-------------|-------------|------|
| auto-yes-manager.ts | 280 | 280 | Yes（関数名の記載は曖昧） |
| status-detector.ts | 80 | 80 | Yes |
| claude-poller.ts | 164 | 164 | Yes |
| claude-poller.ts | 232 | 232 | Yes |
| response-poller.ts | 248 | 248 | Yes |
| response-poller.ts | 442 | 442 | Yes |
| response-poller.ts | 556 | 556 | Yes |
| worktrees/route.ts | 62 | 62 | Yes |
| worktrees/[id]/route.ts | 62 | 62 | Yes |
| current-output/route.ts | 79 | 79 | Yes |

---

## 5. 型定義検証

| 型 | 定義場所 | 変更なし | 備考 |
|---|---------|---------|------|
| `PromptDetectionResult` | `src/lib/prompt-detector.ts:14` | Yes | 修正対象ファイル内だが変更不要 |
| `PromptData` | `src/types/models.ts:176` | Yes | Union型 |
| `MultipleChoiceOption` | `src/types/models.ts:153` | Yes | number, label, isDefault, requiresTextInput |
| `YesNoPromptData` | `src/types/models.ts:142` | Yes | options: ['yes', 'no'] 固定 |
| `MultipleChoicePromptData` | `src/types/models.ts:167` | Yes | options: MultipleChoiceOption[] |

---

## 6. 全体評価

**整合性スコア: 高**

設計書は実装コードの実態を高い精度で反映している。全27箇所の行番号参照のうち、実質的な不一致は1箇所（auto-yes-manager.ts の関数位置記載の曖昧さ）のみ。コードスニペット、正規表現パターン、型定義、呼び出しチェーンは全て実際のコードと一致する。提案された修正（`isPathContinuation` 条件の追加）は設計書の記載通りに実装可能である。

Must Fix の2件は調査の結果いずれも「説明の明確化」レベルの修正であり、設計自体の根本的な問題ではない。テスト計画は既存テストファイルの構造と整合しており、追記形式で実装可能である。

---

## 7. 成果物

- **レビュー結果JSON**: `dev-reports/issue/181/multi-stage-design-review/stage2-review-result.json`
- **レビューレポート**: `dev-reports/review/2026-02-07-issue181-architecture-review.md`
