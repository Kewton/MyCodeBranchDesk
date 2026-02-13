# Issue #256 影響分析レビュー (Stage 3)

## Executive Summary

Issue #256（選択メッセージ検出改善）の設計方針書について、影響範囲（Impact Scope）の観点でアーキテクチャレビューを実施した。

**結果: conditionally_approved (スコア: 4/5)**

設計方針書に記載された変更対象ファイルと影響範囲は概ね正確であり、破壊的変更のリスクは低い。変更は `src/lib/prompt-detector.ts` の内部ロジック修正に閉じており、公開インターフェース（`detectPrompt()`, `DetectPromptOptions`, `PromptDetectionResult`）に変更がないため、6つの呼び出し元モジュールへの実質的影響はない。データベーススキーマ変更もAPI応答構造変更もなく、マイグレーションは不要である。

ただし、影響確認必要ファイルの一覧に `respond/route.ts` が欠落していること、および MF-001 変更（Pass 2ループ内の呼び出し順序変更）による Issue #181 テスト群への影響分析が不足していることが確認された。

---

## 1. 影響範囲の正確性

### 1.1 直接変更ファイル

| ファイル | 設計方針書の記載 | 実コードとの整合 | 評価 |
|---------|---------------|----------------|------|
| `src/lib/prompt-detector.ts` | isQuestionLikeLine() Pattern 2追加、findQuestionLineInRange()新規関数、SEC-001b上方走査、Pass 2ループ内先行チェック、QUESTION_SCAN_RANGE定数 | 既存コード（L315-332, L461-496, L514-528）の変更箇所と一致 | 正確 |
| `tests/unit/prompt-detector.test.ts` | 新規テストケース17件追加 | 既存テストファイル（1800行）に追加する形式で整合 | 正確 |

**分析**: 変更対象ファイルは2ファイルのみであり、設計方針書の記載と実コードの変更箇所が正確に対応している。`isQuestionLikeLine()`（L315-332）、Pass 2ループ（L461-496）、SEC-001bガード（L514-528）は全て `prompt-detector.ts` 内に閉じており、他ファイルへの直接変更は不要である。

### 1.2 間接影響ファイル（設計方針書に記載あり）

| ファイル | 依存パス | 確認ポイント | 影響有無 |
|---------|---------|-------------|---------|
| `src/lib/auto-yes-manager.ts` (L319) | `detectPrompt()` 呼び出し | False Positive時の自動応答誤送信 | 影響なし（戻り値構造不変） |
| `src/lib/auto-yes-resolver.ts` | `auto-yes-manager.ts` 経由で `promptData` 受取 | `resolveAutoAnswer()` の判定ロジック | 影響なし（`promptData` 構造不変） |
| `src/lib/response-poller.ts` (L330, L490, L605) | `detectPrompt()` 呼び出し（`detectPromptWithOptions()` ヘルパー経由） | DBゴーストメッセージ保存 | 影響なし（戻り値構造不変） |
| `src/lib/status-detector.ts` (L142) | `detectPrompt()` 呼び出し | ステータス誤判定 | 影響なし（戻り値構造不変） |
| `src/app/api/worktrees/[id]/current-output/route.ts` (L94) | `detectPrompt()` 呼び出し | API応答の正確性 | 影響なし（戻り値構造不変） |
| `src/app/api/worktrees/[id]/prompt-response/route.ts` (L77) | `detectPrompt()` 呼び出し | レースコンディション防止 | 影響なし（戻り値構造不変） |

**分析**: 設計方針書に記載された6ファイルは全て `detectPrompt()` の公開インターフェースのみに依存しており、内部ロジック変更の影響を受けない。各呼び出し箇所の行番号も実コードと一致している。

### 1.3 間接影響ファイル（設計方針書に未記載） [MF-S3-001, SF-S3-001, SF-S3-002]

| ファイル | 依存パス | 欠落の重要度 | 実質影響 |
|---------|---------|-------------|---------|
| `src/app/api/worktrees/[id]/respond/route.ts` (L12) | `getAnswerInput()` をインポート | **中** - 影響確認一覧に追加すべき | 影響なし（`getAnswerInput()` 変更なし） |
| `src/lib/cli-patterns.ts` (L7) | `DetectPromptOptions` 型をインポート（`import type`） | 低 - 型のみの依存 | 影響なし（型定義変更なし） |
| `src/components/worktree/PromptPanel.tsx` | APIレスポンスの `promptData` を表示 | 低 - mermaid図には記載あり | 意図した影響あり（質問テキスト表示が改善される） |
| `src/components/mobile/MobilePromptSheet.tsx` | APIレスポンスの `promptData` を表示 | 低 - mermaid図には記載あり | 意図した影響あり（質問テキスト表示が改善される） |

---

## 2. 破壊的変更のリスク評価

### 2.1 公開インターフェースの不変性

本変更は `prompt-detector.ts` の内部ロジック修正に完全に閉じている。

| インターフェース | 変更有無 | 根拠 |
|---------------|---------|------|
| `detectPrompt(output: string, options?: DetectPromptOptions): PromptDetectionResult` | 変更なし | 引数型・戻り値型ともに不変 |
| `DetectPromptOptions` | 変更なし | `requireDefaultIndicator` フィールドのみ、追加なし |
| `PromptDetectionResult` | 変更なし | `isPrompt`, `promptData`, `cleanContent`, `rawContent` の全フィールド不変 |
| `getAnswerInput(answer: string, promptType?: string): string` | 変更なし | 本Issue のスコープ外 |
| `PromptData` (`@/types/models`) | 変更なし | `multiple_choice` の `question` フィールドの値が変化するが型は不変 |

### 2.2 内部関数の変更影響

| 関数 | 可視性 | 変更内容 | 外部影響 |
|------|--------|---------|---------|
| `isQuestionLikeLine()` | module-private | Pattern 2（行内`?`チェック）追加 | なし（exportされていない） |
| `findQuestionLineInRange()` | module-private（新規） | 上方走査ロジック | なし（新規関数） |
| `detectMultipleChoicePrompt()` | module-private | SEC-001bガード内でfindQuestionLineInRange()呼び出し追加、Pass 2ループ内のisQuestionLikeLine()先行チェック追加 | `detectPrompt()` 経由で間接的にTrue Positive増加（意図した動作） |
| `isContinuationLine()` | module-private | **変更なし** | なし（MF-001対応によりSRP維持） |

### 2.3 動作変化のリスク

| 変化パターン | リスク | 対策 |
|-------------|-------|------|
| True Positive増加（パターンA: 複数行折り返し質問） | 低 - 意図した動作改善 | T-256-A1~A3で検証 |
| True Positive増加（パターンB: model選択等） | 低 - 意図した動作改善 | T-256-B1~B2で検証 |
| False Positive増加 | **中** - Pattern 2の行内`?`チェックによるリスク | SEC-001bスコープ制約、T-256-FP1~FP2、既存T11h-T11mで検証 |
| Auto-Yes誤送信 | **中** - False Positive増加に連動 | Layer 1(thinking) + Layer 3(連番) + Layer 5(SEC-001b) + T11h-T11m |

**総合評価**: 破壊的変更のリスクは低い。公開インターフェースに変更がなく、動作変化はTrue Positive増加（バグ修正としての意図した改善）に限定される。False Positive増加リスクはSEC-001bガードのスコープ制約と既存テスト群（T11h-T11m）で十分に制御されている。

---

## 3. マイグレーションの必要性

| カテゴリ | マイグレーション必要性 | 根拠 |
|---------|---------------------|------|
| データベーススキーマ | 不要 | 設計方針書セクション7「変更なし」。`PromptData` 型の構造変更なし。DBに保存される `promptData` JSON構造は不変。 |
| API応答構造 | 不要 | 設計方針書セクション8「変更なし」。`current-output/route.ts` のレスポンスフィールドに変更なし。 |
| 設定ファイル | 不要 | 新規定数 `QUESTION_SCAN_RANGE` はソースコード内のハードコード定数であり、外部設定ファイルに依存しない。 |
| フロントエンドコンポーネント | 不要 | `PromptPanel.tsx`、`MobilePromptSheet.tsx` は `promptData.question` フィールドを表示するのみ。表示テキストの改善（質問テキストがより正確になる）は自動的に反映される。 |
| CLIツール連携 | 不要 | `buildDetectPromptOptions()` の挙動変更なし。CLIツール別のオプション設定は不変。 |

**結論**: マイグレーションは一切不要。デプロイ時の追加作業は発生しない。

---

## 4. テストカバレッジの妥当性

### 4.1 新規テストの網羅性

| テストカテゴリ | テスト数 | カバー対象 | 妥当性評価 |
|--------------|---------|-----------|-----------|
| パターンA（複数行折り返し） | 3件 (A1-A3) | 上方走査、行内`?`チェック、回帰 | 十分 |
| パターンB（質問形式でないプロンプト） | 2件 (B1-B2) | model選択、requireDefaultIndicator回帰 | 十分 |
| False Positive防止 | 2件 (FP1-FP2) | 上方走査FP、走査範囲外FP | 十分 |
| isContinuationLine相互作用 | 1件 (CL1) | MF-001: インデント付きキーワード行 | **やや不足** - 下記参照 |
| findQuestionLineInRange単体 | 4件 (FQ1-FQ4) | 範囲内発見、範囲外、スキップ、境界 | 十分（ただしテストアプローチ要確認） |
| 境界条件 | 3件 (BC1-BC3) | scanStart境界、index=0、6行以上折り返し | 十分 |

### 4.2 テストカバレッジの懸念事項

**CL1テストの補強検討**:

T-256-CL1はインデントされた `Select model` 行のテストだが、以下の追加シナリオも検討に値する:

1. `Select model` 行がisContinuationLine()のhasLeadingSpacesに該当するが、isQuestionLikeLine()のPattern 3（`:` 終端 + キーワード）にマッチしない場合（例: `  Model:` -- `model` はキーワードにない）
2. `Select model` 行がisContinuationLine()のisPathContinuationに該当する場合（例: `/select-model` のようなパス風の行）

ただし、これらはエッジケースであり、実際のCLI出力で発生する可能性は低いため、Consider事項とする。

**FQ1-FQ4テストのアプローチ**:

`findQuestionLineInRange()` はmodule-private関数（`export` なし）であるため、Vitestで直接テストできない。設計方針書のテストコードでは `findQuestionLineInRange()` を直接呼び出しているが、実装時にはテストアプローチの選択が必要:

- (a) テスト用に関数をexportする（`@internal` JSDocアノテーション付き）
- (b) `detectPrompt()` 経由の間接テストに書き換える
- (c) Vitestの `vi.importActual` 等を使ったモジュール内部アクセス

推奨は (b) の間接テストへの変更。

### 4.3 既存テスト回帰の妥当性

| テストグループ | 件数 | MF-001変更の影響 |
|--------------|------|-----------------|
| T11h-T11m (False Positive防止) | 6件 | **影響なし** - これらのテストは `questionEndIndex` に設定される行（`Recommendations:` 等）が `isQuestionLikeLine()` を通過するかどうかのテスト。MF-001のPass 2ループ内先行チェックにより、`isQuestionLikeLine()` が先に評価されるが、`Recommendations:` 行は `isQuestionLikeLine()` で false を返すため、従来どおり `isContinuationLine()` に到達する。動作不変。 |
| T11a-T11g (True Positive) | 7件 | **影響なし** - 質問行（`?` 終端 or キーワード + `:`）は `isQuestionLikeLine()` が先に true を返して `questionEndIndex` に設定される。従来は `isContinuationLine()` を通過後に設定されていた可能性があるが、最終結果（`questionEndIndex` が正しく設定される）は同じ。 |
| Issue #181 (multiline option) | 6件 | **要確認（SF-S3-003）** - `isContinuationLine()` のhasLeadingSpacesチェックとisQuestionLikeLine()先行チェックの相互作用。特に `  Do you want to proceed?` 行がテストに含まれており、MF-001変更前後で同じ結果が期待されるが、コードパスが変化する。結果は同じだが、パスの変化を設計方針書に明記すべき。 |
| Issue #161 (2パス検出) | 10件 | **影響なし** - 2パス検出の基本メカニズム（Pass 1のcursor検出、Pass 2のoption収集）は変更されない。 |

---

## 5. リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| 技術的リスク | Pattern 2（行内`?`チェック）によるFalse Positive | Low | Low | P3 |
| 技術的リスク | MF-001（Pass 2ループ内順序変更）による回帰バグ | Low | Low | P3 |
| 技術的リスク | findQuestionLineInRange()の境界条件バグ | Low | Low | P3 |
| セキュリティリスク | False Positiveに起因するAuto-Yes誤送信 | Med | Low | P2 |
| 運用リスク | テストカバレッジ不足による将来のデグレ | Low | Low | P3 |

---

## 6. 改善勧告

### 6.1 必須改善項目 (Must Fix)

**[MF-S3-001] respond/route.ts の影響確認ファイル一覧への追加**

`src/app/api/worktrees/[id]/respond/route.ts` は `getAnswerInput()` を `prompt-detector.ts` からインポートしている（L12）。設計方針書セクション11の「変更不要だが影響確認必要なファイル」に追加すべきである。

確認ポイント: `getAnswerInput()` インターフェースへの影響なし（本Issue のスコープ外）

### 6.2 推奨改善項目 (Should Fix)

**[SF-S3-001] cli-patterns.ts の依存関係の明記**

`src/lib/cli-patterns.ts` (L7) は `DetectPromptOptions` 型をインポートしている。型のみの依存であり実質影響はないが、影響範囲の完全性のためにセクション11に記載するか、影響なしの根拠を明記する。

**[SF-S3-002] PromptPanel/MobilePromptSheet の影響経路の明確化**

mermaid図に間接影響として記載されているが、セクション11の一覧には含まれていない。APIレスポンスの `promptData.question` フィールドの値が改善されることで、UIの表示テキストが変化する（意図した動作）ことを明記する。

**[SF-S3-003] Issue #181 テスト群に対する MF-001 影響分析の追記**

セクション9.2のIssue #181テスト群について、MF-001変更による影響有無の具体的な分析結果を追記する。特に `  Do you want to proceed?` のようなインデント付き質問行のテストケースで、`isQuestionLikeLine()` 先行チェック追加前後のコードパスの変化を文書化する。

### 6.3 検討事項 (Consider)

**[C-S3-001]** `findQuestionLineInRange()` のテストアプローチを明確にする。module-private関数の直接テストはVitestの標準的な方法では困難であるため、`detectPrompt()` 経由の間接テストへの書き換えを推奨する。

**[C-S3-002]** Pattern 2のFalse Positiveシナリオとして、URLパラメータ以外のパターン（ファイルパスの `?`、JSONデータ内の `?`）についても分析結果を記載する。

**[C-S3-003]** セクション11に「公開インターフェースに変更なし」の明示的な宣言を追加する。

---

## 7. 承認状態

| 項目 | 結果 |
|------|------|
| **ステータス** | conditionally_approved |
| **スコア** | 4/5 |
| **条件** | MF-S3-001（respond/route.ts の影響確認一覧追加）を対応すること |
| **推奨** | SF-S3-001~003 を可能な範囲で対応すること |

### 承認の根拠

1. 変更対象ファイルの特定は正確であり、変更が `prompt-detector.ts` 内部に完全に閉じている
2. 公開インターフェースに変更がなく、破壊的変更のリスクがない
3. マイグレーション不要
4. テストカバレッジは17件の新規テスト + 33件以上の既存回帰テストで十分
5. 影響確認ファイル一覧に軽微な欠落があるが、実質的な影響はない

### conditionally（条件付き）の理由

- respond/route.ts の欠落は、影響範囲の網羅性という品質基準の観点で修正すべきである
- MF-001変更によるIssue #181テスト群への影響分析が設計方針書に明示されていない点は、実装フェーズでの見落としリスクにつながる可能性がある

---

*Reviewed by: architecture-review-agent*
*Date: 2026-02-13*
*Focus: 影響範囲 (Impact Scope)*
*Stage: 3 (影響分析レビュー)*
