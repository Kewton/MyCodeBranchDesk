# Architecture Review: Issue #181 - 影響範囲レビュー

## Executive Summary

Issue #181（複数行オプションを含むmultiple choiceプロンプト検出修正）の設計方針書に対して、影響範囲の観点からレビューを実施した。

設計書の影響スコープ分析は概ね正確であり、直接変更対象（`src/lib/prompt-detector.ts` と `tests/unit/prompt-detector.test.ts`）の記載に問題はない。サーバー側の間接影響ファイルも大部分が正確に列挙されている。ただし、`respond/route.ts`（`getAnswerInput` 使用）の欠落、`response-poller.ts` の呼び出し箇所数の不明確さ、クライアント側間接影響パスの未記載という3点の改善余地がある。

型構造への影響なし、公開インターフェースの変更なし、条件追加は `||` による加算的変更であることから、**既存動作への後方互換性は完全に維持される**。テストカバレッジも直接変更対象に対して十分であり、間接影響ファイルは既存テストで回帰テストが担保される。

**ステータス: 条件付き承認（conditionally_approved）**
**スコア: 4/5**

---

## 1. 影響範囲の詳細分析

### 1-1. 直接変更ファイル

| ファイル | 変更内容 | リスク |
|---------|---------|-------|
| `src/lib/prompt-detector.ts` | `detectMultipleChoicePrompt()` 内の継続行検出ロジック拡張、`isContinuationLine()` 関数抽出 | Low: ロジック変更は Pass 2 逆順スキャンの非オプション行判定部のみ |
| `tests/unit/prompt-detector.test.ts` | 正常系/偽陽性/回帰/境界値テストケース追加 | Low: テスト追加のみ |

設計書の記載と実際のコードを照合した結果、直接変更対象の特定は正確である。

### 1-2. サーバー側間接影響ファイル（コード変更不要）

以下のファイルは `detectPrompt()` を呼び出しており、`detectMultipleChoicePrompt()` の検出結果の変化が間接的に影響する。

| ファイル | detectPrompt 呼び出し箇所 | 呼び出しコンテキスト | 設計書記載 |
|---------|------------------------|-------------------|-----------|
| `src/lib/auto-yes-manager.ts` | L290 (1箇所) | `pollAutoYes()` 内、thinking状態スキップ後 | 記載あり (AYM) |
| `src/lib/status-detector.ts` | L80 (1箇所) | `detectSessionStatus()` 内、最後15行に対して | 記載あり (SD) |
| `src/lib/claude-poller.ts` | L164, L232 (2箇所) | `extractClaudeResponse()` 内と `checkForResponse()` 内 | 記載あり (CP)、対応表で注記あり |
| `src/lib/response-poller.ts` | L248, L442, L556 (3箇所) | `extractResponse()` 内早期チェック、非完了時フォールバック、完了レスポンス分析 | 記載あり (RP)、**呼び出し箇所数の注記なし** |
| `src/app/api/worktrees/route.ts` | L62 (1箇所) | ワークツリー一覧取得時のステータス判定 | 記載あり (WR) |
| `src/app/api/worktrees/[id]/route.ts` | L62 (1箇所) | 個別ワークツリー取得時のステータス判定 | 記載あり (WIR) |
| `src/app/api/worktrees/[id]/current-output/route.ts` | L88 (1箇所) | 現在出力取得、thinking時スキップあり | 記載あり (COR) |
| `src/app/api/worktrees/[id]/prompt-response/route.ts` | L75 (1箇所) | プロンプト応答前の再検証 | 記載あり (PRR) |
| **`src/app/api/worktrees/[id]/respond/route.ts`** | なし（getAnswerInput使用） | `getAnswerInput()` による応答入力変換 | **未記載** |

### 1-3. クライアント側間接影響ファイル（API経由、コード変更不要）

| ファイル | 影響パス | 設計書記載 |
|---------|---------|-----------|
| `src/hooks/useAutoYes.ts` | current-output API -> promptData -> resolveAutoAnswer() | **未記載** |

### 1-4. 検出結果のまとめ

- **設計書で正しく記載されている間接影響ファイル**: 8ファイル
- **設計書で欠落している間接影響ファイル**: 1ファイル (`respond/route.ts`) + 1クライアントファイル (`useAutoYes.ts`)
- **全ファイルで型構造変更なし、公開インターフェース変更なし**: 確認済み
- **実際の動作影響**: なし（全間接影響ファイルはコード変更不要）

---

## 2. 変更の波及効果分析

### 2-1. 直接的な波及効果

`detectMultipleChoicePrompt()` の内部ロジック変更は以下の経路で波及する:

```
detectMultipleChoicePrompt() [変更]
  -> detectPrompt() [変更なし、呼び出すのみ]
    -> 全12箇所の呼び出し元（7ファイル）
```

波及の特性:
- **検出精度の向上**: 従来検出できなかった折り返しパターンが検出可能になる
- **偽陽性リスクの増加**: `isPathContinuation` 条件の追加により、英数字のみの行がスキップされる（設計書で分析済み）
- **結果の型構造は不変**: `PromptDetectionResult` の構造は変わらないため、全呼び出し元のコード変更は不要

### 2-2. 間接的な波及効果

| 波及パス | 影響内容 | リスク |
|---------|---------|-------|
| `detectPrompt` -> `auto-yes-manager.ts` -> `sendKeys` | 折り返しプロンプトが検出されるようになり、Auto-Yesが正しく応答 | Low: 期待される改善 |
| `detectPrompt` -> `status-detector.ts` -> サイドバーステータス | 折り返しプロンプトで 'waiting' ステータスが正しく表示 | Low: 期待される改善 |
| `detectPrompt` -> `claude-poller.ts` -> メッセージ保存 | 折り返しプロンプトがプロンプトメッセージとして保存 | Low: 期待される改善 |
| `detectPrompt` -> `response-poller.ts` -> メッセージ保存 | 同上 | Low: 期待される改善 |
| `detectPrompt` -> APIルート -> クライアントUI | 折り返しプロンプトのUIボタン表示が可能に | Low: 期待される改善 |

### 2-3. 波及が発生しない箇所

- `respond/route.ts`: `getAnswerInput()` のみを使用。`detectPrompt()` は呼び出さない。Issue #181 では `getAnswerInput()` に変更はないため影響なし
- `useAutoYes.ts`: `resolveAutoAnswer()` を使用。`promptData.type` と `option.number` に依存するが、型構造の変更がないため影響なし

---

## 3. テストカバレッジの妥当性

### 3-1. 直接変更対象のテストカバレッジ

| テスト対象 | テストファイル | カバレッジ評価 |
|-----------|-------------|-------------|
| `detectMultipleChoicePrompt()` 継続行ロジック | `tests/unit/prompt-detector.test.ts` | 高: 正常系/偽陽性/境界値テストが設計書で網羅 |
| `isContinuationLine()` 関数 | `tests/unit/prompt-detector.test.ts` | 高: `detectPrompt()` 経由で間接的に検証 |

### 3-2. 間接影響ファイルのテストカバレッジ

| ファイル | 関連テストファイル | カバレッジ評価 |
|---------|----------------|-------------|
| `auto-yes-manager.ts` | `tests/unit/lib/auto-yes-manager.test.ts` | 中: detectPrompt をモック。Layer 1 テストは含むが Issue #181 固有のテストなし |
| `auto-yes-resolver.ts` | `tests/unit/lib/auto-yes-resolver.test.ts` | 高: option.number 使用のテストあり |
| `status-detector.ts` | テストファイルなし | 低: 専用テストが存在しない (C-001) |
| `claude-poller.ts` | テストファイルなし | 低: ポーラーの結合テストは困難 |
| `response-poller.ts` | テストファイルなし | 低: 同上 |
| `prompt-response/route.ts` | `tests/unit/api/prompt-response-verification.test.ts` | 高: detectPrompt モックでの再検証テストあり |
| `respond/route.ts` | テストファイルなし | N/A: getAnswerInput のみ使用、影響なし |

### 3-3. テストカバレッジの総合評価

Issue #181 の修正は `detectMultipleChoicePrompt()` 内部のロジック変更のみであり、型構造・公開インターフェースの変更はない。したがって:

1. **直接的な機能テスト**: `tests/unit/prompt-detector.test.ts` で十分にカバー
2. **回帰テスト**: 既存の Issue #161 テストケース（16件）が退行を検出
3. **間接影響のテスト**: 型変更なしのため、既存の結合テストは影響を受けない
4. **欠落**: `status-detector.ts` の専用テストがないが、Issue #181 のスコープ外

---

## 4. 互換性への影響

### 4-1. 後方互換性

| 互換性項目 | 評価 | 根拠 |
|-----------|------|------|
| `detectPrompt()` 公開インターフェース | 完全互換 | 関数シグネチャ、戻り値型の変更なし |
| `PromptDetectionResult` 型 | 完全互換 | 型定義の変更なし |
| `PromptData` / `MultipleChoicePromptData` 型 | 完全互換 | 型定義の変更なし |
| `getAnswerInput()` 公開インターフェース | 完全互換 | 変更なし |
| 既存の yes/no 検出 | 完全互換 | 修正は `detectMultipleChoicePrompt()` 内部のみ |
| 既存の multiple choice 検出 | 完全互換 | `||` による加算的条件追加。既存の `hasLeadingSpaces` / `isShortFragment` 判定は変更なし |

### 4-2. 前方互換性（将来の拡張への影響）

- `isContinuationLine()` の関数抽出（SF-002）により、将来的なパターン追加が容易になる
- 設計書セクション9-4で CONTINUATION_PATTERNS 配列化のリファクタリング候補が記録されている
- `isPathContinuation` の `line.length >= 2` 最小長チェック（SF-001）により、将来のパターン追加時の安全マージンが確保されている

---

## 5. パフォーマンスへの影響

設計書セクション8の分析は正確である。

| 評価項目 | 結果 |
|---------|------|
| 追加される正規表現数 | 2（`/^[\/~]/` と `/^[a-zA-Z0-9_-]+$/`） |
| 実行コンテキスト | Pass 2 逆順スキャン内、非オプション行に対してのみ |
| 計算量 | O(n) per line (n = line.length)、バックトラッキングなし |
| 全呼び出し元への影響 | 12箇所（7ファイル）で追加処理が走るが、ポーリング間隔（2秒）と比較して無視できるレベル |
| メモリ影響 | なし（新しいデータ構造の追加なし） |

---

## 6. 他の Issue との関連性

| 関連 Issue | 関連性 | 評価 |
|-----------|-------|------|
| Issue #161 | 2パス検出方式、多層防御の基盤。Issue #181 は Layer 2 内部の修正 | 適切に記載。用語・パターン参照も正確 |
| Issue #180 | ステータス表示の不整合。Issue #181 の修正で部分的改善の可能性 | 適切に言及 |
| Issue #138 | サーバー側 Auto-Yes ポーリング。pollAutoYes() 内の detectPrompt 呼び出しが影響を受ける | 設計書の間接影響に含まれており適切 |
| Issue #153 | Auto-Yes 状態の globalThis 永続化。Issue #181 とは独立 | 関連なし（適切） |

---

## 7. リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| 技術的リスク | `isPathContinuation` の偽陽性（英単語行のスキップ） | Low | Low | P3: 設計書で分析済み、`options.length > 0` ガードで緩和 |
| 技術的リスク | status-detector.ts の15行ウィンドウ制約 | Low | Low | P3: 現行の再現シナリオ（8行程度）では問題なし |
| セキュリティリスク | なし | N/A | N/A | N/A |
| 運用リスク | 影響スコープ図の欠落によるレビュー不足 | Low | Low | P2: S3-001, S3-002 で対応 |

---

## 8. 改善推奨事項

### 8-1. Should Fix

| ID | カテゴリ | タイトル | 推奨対応 |
|----|---------|---------|---------|
| S3-001 | 影響スコープ欠落 | `respond/route.ts` が影響スコープ図に未記載 | mermaid図と略称対応表に追加。影響なしの注記付き |
| S3-002 | 影響スコープ欠落 | クライアント側間接影響パス（`useAutoYes.ts`）が未記載 | セクション2-2に注記追加。または別サブグラフで記載 |
| S3-003 | 影響スコープ精度 | `response-poller.ts` の detectPrompt 呼び出し箇所数（3箇所）が不明確 | 略称対応表の RP エントリに呼び出し箇所の注記追加 |

### 8-2. Consider

| ID | カテゴリ | タイトル | 備考 |
|----|---------|---------|------|
| C-001 | テストカバレッジ | `status-detector.ts` のテストファイルが存在しない | Issue #181 スコープ外。将来的なテスト追加を検討 |
| C-002 | テストカバレッジ | 間接影響ファイルのテストが detectPrompt をモックしている点の注記 | 設計書のテスト設計セクションへの注記を検討 |
| C-003 | 互換性 | status-detector.ts の15行ウィンドウ制約 | 現状問題なし。将来的な制限事項として認識 |
| C-004 | パフォーマンス | パフォーマンス影響の評価は妥当 | 対応不要（肯定的評価） |
| C-005 | 関連Issue | Issue #180 との関連性の記載は適切 | 対応不要（肯定的評価） |

---

## 9. 承認ステータス

**ステータス**: 条件付き承認（conditionally_approved）

**条件**:
1. S3-001: `respond/route.ts` を影響スコープ図に追加する
2. S3-002: クライアント側間接影響パスの注記を追加する（簡易な注記でも可）
3. S3-003: `response-poller.ts` の呼び出し箇所数を略称対応表に注記する

上記3点はいずれも設計書の記載の網羅性に関する指摘であり、実装の正確性やリスクには影響しない。実装への着手は上記の設計書修正と並行して可能である。

---

*Generated by architecture-review-agent (Stage 3: Impact Scope Review)*
*Date: 2026-02-07*
