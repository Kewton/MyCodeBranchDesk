# Issue #181 影響範囲レビューレポート

**レビュー日**: 2026-02-07
**フォーカス**: 影響範囲レビュー
**イテレーション**: 1回目
**ステージ**: 3（影響範囲レビュー 1回目）

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 1 |
| Should Fix | 4 |
| Nice to Have | 3 |
| **合計** | **8** |

### 全体評価

Issue #181の影響範囲セクションは、直接的な変更対象（`prompt-detector.ts` と `auto-yes-resolver.ts`）は正しく特定しているが、`detectPrompt()` を呼び出す **10ファイル** のうち大半が影響範囲に記載されていない。

修正対象は `prompt-detector.ts` 内の `detectMultipleChoicePrompt()` 関数のみであり、型構造（`PromptDetectionResult`, `PromptData`）に変更はないため **破壊的変更は発生しない**。しかし、影響範囲の可視化が不十分なため、実装者がテスト範囲を正しく設定できるよう拡充が必要である。

---

## Must Fix（必須対応）

### S3-F001: detectPrompt()の呼び出し元が影響範囲セクションに大幅に不足

**カテゴリ**: 影響範囲の漏れ
**場所**: 影響範囲 セクション

**問題**:

Issueの影響範囲セクションでは、以下のファイルのみが記載されている:
- `src/lib/prompt-detector.ts`
- `tests/unit/prompt-detector.test.ts`
- `src/lib/auto-yes-resolver.ts`
- UIのプロンプト表示機能

しかし、実際に `detectPrompt()` を直接呼び出しているファイルは **10ファイル** 存在する:

| # | ファイル | 呼び出し箇所 | Issueに記載 |
|---|---------|-------------|------------|
| 1 | `src/lib/prompt-detector.ts` | 定義元 (line 56) | あり |
| 2 | `src/lib/auto-yes-manager.ts` | line 280 | あり（間接） |
| 3 | `src/lib/status-detector.ts` | line 80 | **なし** |
| 4 | `src/lib/claude-poller.ts` | line 164, 232 | **なし** |
| 5 | `src/lib/response-poller.ts` | line 248, 442, 556 | **なし** |
| 6 | `src/app/api/worktrees/route.ts` | line 62 | **なし** |
| 7 | `src/app/api/worktrees/[id]/route.ts` | line 62 | **なし** |
| 8 | `src/app/api/worktrees/[id]/current-output/route.ts` | line 79 | **なし** |
| 9 | `src/app/api/worktrees/[id]/respond/route.ts` | getAnswerInputのみ | **なし** |
| 10 | `src/hooks/useAutoYes.ts` | resolveAutoAnswer経由 | **なし** |

**推奨対応**:

影響範囲セクションを拡充し、全ての呼び出し元を記載する。特に `status-detector.ts`（Issue #180直接関連）、`response-poller.ts`（3箇所呼び出し）、`claude-poller.ts`（2箇所呼び出し）は重要。

---

## Should Fix（推奨対応）

### S3-F002: status-detector.tsへの波及がIssue #180との関連で重要

**カテゴリ**: 波及効果
**場所**: 影響範囲 セクション / 関連Issue セクション

**問題**:

`src/lib/status-detector.ts` の `detectSessionStatus()` 関数は、`detectPrompt()` を使って最後15行からプロンプトを検出し、検出された場合にセッションステータスを `'waiting'` と判定する:

```typescript
// src/lib/status-detector.ts:80
const promptDetection = detectPrompt(lastLines);
if (promptDetection.isPrompt) {
  return {
    status: 'waiting',
    confidence: 'high',
    reason: 'prompt_detected',
  };
}
```

Issue #180「モバイルステータス表示の不整合」は、まさにこのステータス検出ロジックの問題を扱っている。Issue #181の修正が正しく動作すれば、折り返しを含むmultiple choiceプロンプトが正しく検出され、ステータスも正確に `'waiting'` となる。逆に偽陽性が導入された場合、ステータスが誤って `'waiting'` と表示されるリスクがある。

**推奨対応**:

影響範囲に `src/lib/status-detector.ts` を追加し、Issue #180との関連を明記する。

---

### S3-F003: response-poller.tsとclaude-poller.tsへの波及（応答完了判定への影響）

**カテゴリ**: 波及効果
**場所**: 影響範囲 セクション

**問題**:

`response-poller.ts` は `detectPrompt()` を **3箇所** で使用している:
1. **line 248**: 早期プロンプト検出 - Claude権限プロンプトの特別処理
2. **line 442**: インタラクティブプロンプト検出 - 応答完了判定
3. **line 556**: 完了応答のプロンプトチェック - メッセージDB保存判定

`claude-poller.ts` も **2箇所** で使用:
1. **line 164**: 完了応答のプロンプト検出
2. **line 232**: 応答結果のプロンプトチェック

これらの箇所では、`detectPrompt()` の結果が `isPrompt: true` を返すと、応答が「完了（プロンプト待ち）」として処理され、メッセージが `prompt` タイプとしてDBに保存される。修正により、これまで検出されなかった折り返しmultiple choiceプロンプトが正しく検出されるようになり、ポーラーの挙動が変わる。

**推奨対応**:

影響範囲にこれらのファイルを追加し、「応答完了判定の精度が向上する」旨を記載する。

---

### S3-F004: isPathContinuationの正規表現がyes/noプロンプトの検出に影響する可能性

**カテゴリ**: リスク
**場所**: 修正案 セクション / テスト要件 セクション

**問題**:

`detectMultipleChoicePrompt()` は `detectPrompt()` 内で **Pattern 0** として最初に呼ばれる。この関数が `isPrompt: false` を返した場合にのみ、後続のyes/noパターン（Pattern 1-5）が評価される。

継続行条件が緩くなると、逆順スキャンでより多くの行が「継続行」として消費され、走査範囲が広がる。万が一、numbered option pattern にマッチする行が偶然2つ以上存在し、かつ1つが `❯` を含む場合、本来yes/noプロンプトとして検出されるべき出力が `multiple_choice` 型として誤検出される可能性がある。

実際のリスクは低い（`❯` インジケータが必要なため）が、テストケースとしてカバーすべき。

**推奨対応**:

テスト要件に以下を追加:
- ターミナル出力に `1. First item` のようなリスト表示が含まれ、かつ最後に `(y/n)` がある場合、yes/noプロンプトとして正しく検出されること

---

### S3-F005: Auto-Yesのラベル連結に関するIssue記載の不正確さ

**カテゴリ**: リスク
**場所**: 修正案 > 偽陽性リスク分析 セクション

**問題**:

Issueの偽陽性リスク分析では「該当行が直前のオプションのラベルに連結される」と記載されているが、実際のコードでは継続行は `continue` によりスキップされるだけで、**ラベルに連結される処理は存在しない**:

```typescript
// src/lib/prompt-detector.ts:230-233
if (isContinuationLine) {
  // Skip continuation lines and continue scanning for more options
  continue;  // ← ラベルへの連結はない
}
```

これは、修正後のオプション2のラベルが `'Yes, and don't ask again for curl and python3 commands in'` のように途中で切れたまま格納されることを意味する。`auto-yes-resolver.ts` の `resolveAutoAnswer()` はオプションの `number` を使用するため自動応答への影響はないが、UIに表示されるラベルが不完全になる。

**推奨対応**:

(1) 偽陽性リスク分析の「ラベルに連結される」記載を修正する。(2) 継続行テキストをラベルに連結する処理を追加するかどうかは、修正案のスコープとして別途検討する。

---

## Nice to Have（あれば良い）

### S3-F006: UIコンポーネント側の影響が具体的に特定されていない

**カテゴリ**: 影響範囲の漏れ
**場所**: 影響範囲 セクション

Issueでは「UIのプロンプト表示機能」と記載しているが、具体的なファイルが示されていない。`current-output/route.ts` からのレスポンスを消費するクライアントコンポーネントや `useAutoYes.ts` フックなどを特定することで、実装者が影響確認をしやすくなる。ただし、UI側は `promptData` の型構造が変わらないため、コード変更は不要。

---

### S3-F007: 正規表現追加によるパフォーマンス影響の考慮

**カテゴリ**: パフォーマンス
**場所**: 影響範囲 セクション

修正案で追加される2つの正規表現（`/^[\/~]/` と `/^[a-zA-Z0-9_-]+$/`）は単純なパターンであり、既存のポーリング間隔（2秒）と比較して無視できるオーバーヘッド。しかし、パフォーマンスの観点からの言及があるとより完全。

---

### S3-F008: 異なるターミナル幅・エンコーディングによる影響の考慮不足

**カテゴリ**: リスク
**場所**: テスト要件 セクション

修正案の `isPathContinuation` は特定の折り返しパターンを想定しているが、ターミナル幅が異なれば折り返し位置も変わる。異なる折り返しパターン（同じ出力が異なる位置で折り返されるケース）のテストケース追加を推奨する。

---

## 影響チェーン図

```
detectMultipleChoicePrompt() [修正対象]
  |
  v
detectPrompt() [呼び出し元ラッパー]
  |
  +---> auto-yes-manager.ts:pollAutoYes()     --> Auto-Yes自動応答
  |       |
  |       +---> auto-yes-resolver.ts:resolveAutoAnswer()
  |
  +---> status-detector.ts:detectSessionStatus() --> ステータス判定 (Issue #180関連)
  |
  +---> claude-poller.ts:extractClaudeResponse() --> 応答完了判定
  |     claude-poller.ts:checkForResponse()       --> メッセージDB保存
  |
  +---> response-poller.ts:extractCliResponse()  --> 早期プロンプト検出
  |     response-poller.ts:extractCliResponse()  --> インタラクティブプロンプト
  |     response-poller.ts:checkForResponse()    --> 完了応答プロンプトチェック
  |
  +---> worktrees/route.ts (GET)                 --> サイドバーステータス表示
  |
  +---> worktrees/[id]/route.ts (GET)            --> 個別worktreeステータス
  |
  +---> worktrees/[id]/current-output/route.ts   --> リアルタイムプロンプト検出
          |
          +---> useAutoYes.ts (client hook)       --> クライアント側Auto-Yes
```

## 破壊的変更の有無

**なし**。修正は `detectMultipleChoicePrompt()` 内部の継続行判定ロジックのみであり、以下の理由から後方互換性は維持される:

1. `PromptDetectionResult` 型の構造に変更なし
2. `PromptData` 型（`YesNoPromptData | MultipleChoicePromptData`）に変更なし
3. `detectPrompt()` の公開インターフェース（引数・戻り値）に変更なし
4. 既存の正常ケース（折り返しなしのプロンプト）の検出ロジックに変更なし

## 参照ファイル

### コード（修正対象）
| ファイル | 説明 |
|---------|------|
| `src/lib/prompt-detector.ts` | 修正対象: detectMultipleChoicePrompt() の継続行検出ロジック (line 226-228) |
| `tests/unit/prompt-detector.test.ts` | テスト追加対象: multiple choiceプロンプトのテストケースが不足 |

### コード（影響先 - Issueに記載なし）
| ファイル | 説明 |
|---------|------|
| `src/lib/status-detector.ts` | detectPrompt() 呼び出し (line 80): ステータス判定。Issue #180と密接に関連 |
| `src/lib/claude-poller.ts` | detectPrompt() 呼び出し (line 164, 232): 応答完了判定 |
| `src/lib/response-poller.ts` | detectPrompt() 呼び出し (line 248, 442, 556): 応答抽出・プロンプト検出 |
| `src/app/api/worktrees/route.ts` | detectPrompt() 呼び出し (line 62): サイドバーステータス表示 |
| `src/app/api/worktrees/[id]/route.ts` | detectPrompt() 呼び出し (line 62): 個別worktreeステータス |
| `src/app/api/worktrees/[id]/current-output/route.ts` | detectPrompt() 呼び出し (line 79): リアルタイムプロンプト検出 |

### コード（影響先 - Issueに記載あり）
| ファイル | 説明 |
|---------|------|
| `src/lib/auto-yes-manager.ts` | detectPrompt() 呼び出し (line 280): Auto-Yesポーリング |
| `src/lib/auto-yes-resolver.ts` | 間接影響: promptDataの消費。コード変更不要 |
| `src/hooks/useAutoYes.ts` | 間接影響: クライアント側Auto-Yes。コード変更不要 |
