# Issue #181 レビューレポート

**レビュー日**: 2026-02-07
**フォーカス**: 通常レビュー（整合性・正確性）
**イテレーション**: 1回目（ステージ1）

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 1 |
| Should Fix | 5 |
| Nice to Have | 2 |

Issue #181 は全体として技術的に妥当な分析と修正案を提示しているが、**行番号の参照が複数箇所で実際のコードと一致しない**という正確性の問題が主要な指摘事項となる。また、`isConsecutiveFromOne()` に関する記述の矛盾、`status-detector.ts` と `auto-yes-manager.ts` の検出順序の違いに関する記載の不足が確認された。

---

## Must Fix（必須対応）

### S1-F001: 行番号の参照が実際のコードと一致しない（複数箇所）

**カテゴリ**: 正確性
**場所**: Issue本文の複数セクション

**問題**:
Issueで参照されている行番号が、実際のコードの行番号と一致しない箇所が複数ある。実装者が誤った行を参照して修正を行うリスクがある。

**証拠**:

| Issueの記載 | 実際の行番号 | ファイル |
|------------|------------|--------|
| line 226-228（継続行検出） | line 292-295 | `src/lib/prompt-detector.ts` |
| line 230-232（継続行スキップ） | line 297-300 | `src/lib/prompt-detector.ts` |
| line 243（options.length < 2） | line 319 | `src/lib/prompt-detector.ts` |
| line 280（pollAutoYes内detectPrompt） | line 290 | `src/lib/auto-yes-manager.ts` |
| line 79（current-output内detectPrompt） | line 88 | `src/app/api/worktrees/[id]/current-output/route.ts` |

**推奨対応**:
全ての行番号参照を実際のコードに合わせて修正してください。

---

## Should Fix（推奨対応）

### S1-F002: 「連番チェックは行われておらず」の記述が実際のコードと矛盾

**カテゴリ**: 正確性
**場所**: ## 根本原因 > ### 結果セクション内のNoteブロック

**問題**:
Noteに「`options.length < 2` の検証は `src/lib/prompt-detector.ts` の243行目で行われる。1から始まる連番チェックは行われておらず」と記載されているが、実際には `isConsecutiveFromOne()` 関数（line 204-211）が存在し、Layer 3（line 308-315）で呼び出されている。

**証拠**:
```typescript
// src/lib/prompt-detector.ts line 204-211
function isConsecutiveFromOne(numbers: number[]): boolean {
  if (numbers.length === 0) return false;
  if (numbers[0] !== 1) return false;
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] !== numbers[i - 1] + 1) return false;
  }
  return true;
}

// line 308-315: Layer 3で呼び出し
const optionNumbers = options.map(opt => opt.number);
if (!isConsecutiveFromOne(optionNumbers)) {
  return { isPrompt: false, cleanContent: output.trim() };
}
```

本Issueのケースでは、options が `[{number: 3, label: "No"}]` のみのため、`isConsecutiveFromOne([3])` が `false` を返し、Layer 3 で非検出となる。Layer 4 の `options.length < 2` チェックにも到達するが、Layer 3 が先に動作する。

**推奨対応**:
Noteの記述を「Layer 3 の連番チェック（isConsecutiveFromOne）で numbers[0] !== 1 により非検出となる。仮にLayer 3を通過しても、Layer 4 の options.length < 2 チェックでも非検出となる」のように修正してください。

---

### S1-F003: スクリーンショットの折り返しパターンの一般性について補足が不足

**カテゴリ**: 明確性
**場所**: ## スクリーンショット セクション

**問題**:
ターミナル出力例で `comma` / `ndmate-issue-161` という折り返しが示されているが、これはターミナル幅が特定値の場合の一例に過ぎない。Noteは追加済みだが、修正案が「この特定の折り返しパターンのみ」を対象としていないことをより強調すべき。

**推奨対応**:
Noteに「修正案は特定の折り返し位置に依存せず、パスの途中で折り返された任意の断片行（`/Users/...` で始まる行、英数字のみの断片行など）を汎用的にカバーする」旨を追記してください。

---

### S1-F004: 偽陽性リスク分析でのオプション行マッチ順序の明記

**カテゴリ**: 技術的妥当性
**場所**: ## 偽陽性リスク分析 > 項目2

**問題**:
`/^[a-zA-Z0-9_-]+$/` が単一英単語にマッチする偽陽性リスクについて、「options.length > 0 の場合にのみ評価される」という緩和要因は記載されているが、より根本的な安全性の根拠が欠けている。実際には、正当なオプション行は `NORMAL_OPTION_PATTERN` (`/^\s*(\d+)\.\s*(.+)$/`) または `DEFAULT_OPTION_PATTERN` で先にキャッチされるため、`isPathContinuation` のチェックまで到達しない。

**推奨対応**:
偽陽性リスク分析に「正当なオプション行（番号付き）は逆順スキャンの line 270-285 で DEFAULT_OPTION_PATTERN / NORMAL_OPTION_PATTERN により先にキャッチされるため、isPathContinuation チェック（line 288以降の non-option line handling ブロック内）には到達しない」という安全性の根拠を追記してください。

---

### S1-F005: 修正案コード例で `line` vs `rawLine` の使い分けが不明確

**カテゴリ**: 完全性
**場所**: ## 修正案 セクション

**問題**:
修正案のコード例で `isPathContinuation` が `line` に対してテストしているが、ターミナル折り返しにより先頭にスペースが付与される場合がある。既存コードでは `hasLeadingSpaces` は `rawLine`（trim前）を使い、`isShortFragment` は `line`（trim後）を使っている。`isPathContinuation` がどちらを使うべきかの根拠が記載されていない。

**証拠**:
```typescript
// 既存コード (src/lib/prompt-detector.ts line 292-295)
const rawLine = lines[i]; // Original line with indentation preserved
const hasLeadingSpaces = rawLine.match(/^\s{2,}[^\d]/) && !rawLine.match(/^\s*\d+\./);
const isShortFragment = line.length < 5 && !line.endsWith('?');
// line は lines[i].trim() (line 267)
```

`/^[\/~]/` はパスの先頭を検出するため、trim済みの `line` で正しい。`rawLine` を使うと先頭スペースにより常にマッチしない。ただし、この判断根拠を修正案に明記すべき。

**推奨対応**:
修正案に「`isPathContinuation` は trim済みの `line` に対してテストする。これは rawLine（折り返しによる先頭スペースを含む可能性がある）ではパスの先頭文字 `/` や `~` が検出できないため」という注記を追記してください。

---

### S1-F006: status-detector.ts と auto-yes-manager.ts の検出順序の不一致が未記載

**カテゴリ**: 正確性
**場所**: ## 影響範囲 > detectPrompt()呼び出し元テーブル内 status-detector.ts

**問題**:
`status-detector.ts` (line 78-87) では `detectPrompt()` が `detectThinking()` よりも先に呼ばれるが、`auto-yes-manager.ts` (line 281-290) では `detectThinking()` が先に呼ばれる。この検出順序の違いにより、thinking中にプロンプトが偽検出された場合の挙動が異なる。

- `auto-yes-manager.ts`: thinking中はプロンプト検出をスキップ（Layer 1防御）-> 自動応答なし -> 安全
- `status-detector.ts`: プロンプト検出が先 -> thinking中でも偽検出されれば `'waiting'` を返す -> サイドバー表示が不正確になる可能性

**証拠**:
```typescript
// status-detector.ts (line 78-87): prompt -> thinking の順
const promptDetection = detectPrompt(lastLines);
if (promptDetection.isPrompt) {
  return { status: 'waiting', confidence: 'high', reason: 'prompt_detected' };
}
if (detectThinking(cliToolId, lastLines)) {
  return { status: 'running', confidence: 'high', reason: 'thinking_indicator' };
}

// auto-yes-manager.ts (line 281-290): thinking -> prompt の順
if (detectThinking(cliToolId, cleanOutput)) {
  scheduleNextPoll(worktreeId, cliToolId);
  return;
}
const promptDetection = detectPrompt(cleanOutput);
```

**推奨対応**:
影響範囲テーブルの `status-detector.ts` の影響内容に、「status-detector.ts では detectPrompt() が detectThinking() よりも先に呼ばれるため、thinking中のプロンプト偽検出に対する Layer 1 防御が適用されない。本修正で継続行条件を緩和した場合、status-detector.ts 経由での偽陽性リスクは auto-yes-manager.ts より高い可能性がある」旨を追記してください。

---

## Nice to Have（あれば良い）

### S1-F007: テスト要件に具体的なテスト入力データ例を追加

**カテゴリ**: 完全性
**場所**: ## テスト要件 > 1. 正常系: 複数行オプション検出

**問題**:
テスト要件は高レベルの説明のみで、実装者が即座にテストコードを書けるような具体的な入力データ例が示されていない。

**推奨対応**:
スクリーンショットセクションのターミナル出力をそのままテストデータとして使用する疑似コードを追加すると、実装者の理解が深まり作業効率が向上する。

---

### S1-F008: 関連Issue #180 との関連性の具体例

**カテゴリ**: 完全性
**場所**: ## 関連Issue セクション

**問題**:
Issue #180 との関連が抽象的な記述のみで、具体的にどのシナリオで改善が見込まれるかの例がない。

**推奨対応**:
「例: 複数行折り返しを含む permission prompt が表示されている際、status-detector.ts が prompt を検出できず 'running'（低信頼度）を返すケースが、本修正により 'waiting'（高信頼度）として正しく検出されるようになる」のような具体例を追加するとよい。

---

## 参照ファイル

### コード
| ファイル | 関連性 |
|---------|--------|
| `src/lib/prompt-detector.ts` (line 266-324) | 直接変更対象: detectMultipleChoicePrompt() の逆順スキャン・継続行検出ロジック |
| `src/lib/prompt-detector.ts` (line 204-211) | isConsecutiveFromOne() - Issueの記述と矛盾する箇所 |
| `src/lib/auto-yes-manager.ts` (line 281-290) | pollAutoYes() 内の thinking -> prompt 検出順序 |
| `src/lib/status-detector.ts` (line 78-87) | detectSessionStatus() 内の prompt -> thinking 検出順序 |
| `src/lib/claude-poller.ts` (line 164, 232) | detectPrompt() 呼び出し箇所 |
| `src/lib/response-poller.ts` (line 248, 442, 556) | detectPrompt() 呼び出し箇所（3箇所） |
| `src/app/api/worktrees/route.ts` (line 62) | サイドバーステータスのプロンプト検出 |
| `src/app/api/worktrees/[id]/route.ts` (line 62) | 個別worktreeステータスのプロンプト検出 |
| `src/app/api/worktrees/[id]/current-output/route.ts` (line 88) | リアルタイム出力のプロンプト検出 |
| `tests/unit/prompt-detector.test.ts` | テストケース追加対象 |

### ドキュメント
| ファイル | 関連性 |
|---------|--------|
| `CLAUDE.md` | Issue #161 の実装詳細が記載されており、本Issue修正との整合性確認対象 |
