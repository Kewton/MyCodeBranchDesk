# Issue #181 レビューレポート (Stage 3)

**レビュー日**: 2026-02-07
**フォーカス**: 影響範囲レビュー
**イテレーション**: 1回目
**ステージ**: 3 (影響範囲レビュー 1回目)

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 1 |
| Should Fix | 4 |
| Nice to Have | 3 |

前回のステージ（Stage 1: 通常レビュー、Stage 2: 指摘事項反映）で全8件の指摘が反映済み。本ステージでは影響範囲の網羅性、正確性、テストカバレッジを重点的にレビューした。

---

## Must Fix（必須対応）

### S3-F001: detectPrompt()呼び出し元テーブルに prompt-response/route.ts が欠落

**カテゴリ**: 影響ファイル
**場所**: ## 影響範囲 > detectPrompt()呼び出し元（間接影響）テーブル

**問題**:
`src/app/api/worktrees/[id]/prompt-response/route.ts` は line 75 で `detectPrompt()` を直接呼び出しているが、Issue の影響範囲テーブルにもhttps://github.com/Kewton/CommandMate/issues/181の「prompt-detector.tsからの関連関数を使用するモジュール」セクションにも記載されていない。

このファイルは Issue #161 で追加されたレースコンディション防止ロジック（プロンプト送信前に `detectPrompt()` で再検証する）を含んでおり、`useAutoYes.ts` からの auto-response API 呼び出し先として重要な位置にある。本修正によりこの re-verification の精度が向上するため、影響は positive だが、影響範囲から漏れている。

**証拠**:
```
src/app/api/worktrees/[id]/prompt-response/route.ts
line 14: import { detectPrompt } from '@/lib/prompt-detector';
line 75: const promptCheck = detectPrompt(cleanOutput);
```

Issue の影響範囲テーブルには以下のファイルが列挙されているが、prompt-response/route.ts は含まれていない:
- auto-yes-manager.ts
- status-detector.ts
- claude-poller.ts
- response-poller.ts
- worktrees/route.ts
- worktrees/[id]/route.ts
- worktrees/[id]/current-output/route.ts

**推奨対応**:
detectPrompt()呼び出し元テーブルに以下の行を追加:

| ファイル | 呼び出し箇所 | 影響内容 |
|---------|-------------|---------|
| `src/app/api/worktrees/[id]/prompt-response/route.ts` | line 75 | プロンプト送信前の re-verification 精度が向上。折り返しを含む multiple choice プロンプトに対する auto-response 送信が、レースコンディションなく正しく動作するようになる |

---

## Should Fix（推奨対応）

### S3-F002: status-detector.ts の影響レベルが過大評価されている

**カテゴリ**: 影響ファイル
**場所**: ## 影響範囲 > detectPrompt()呼び出し元テーブル > status-detector.ts 行

**問題**:
Issue では `status-detector.ts` を他の API route ファイルと同列に「detectPrompt()呼び出し元（間接影響）」テーブルに記載し、「セッションステータス判定の精度が向上。'waiting' ステータスがより正確になる」と影響を記述している。しかし、`detectSessionStatus()` 関数は現時点で runtime コードから呼び出されていない。

`src/` 配下で `detectSessionStatus` を import しているのは `src/lib/__tests__/status-detector.test.ts` のみ。API route ファイル（`worktrees/route.ts`, `[id]/route.ts`）はサイドバーステータス判定のために `detectPrompt()` を直接呼び出しており、`detectSessionStatus()` 経由ではない。

**証拠**:
```
$ grep -r 'detectSessionStatus' src/ (テスト除く)
src/lib/status-detector.ts:68:export function detectSessionStatus(
(これ以外の import/呼び出しなし)
```

**推奨対応**:
影響テーブル内の status-detector.ts の記載に「Note: 本関数は現時点では runtime コードから呼び出されておらず、テストでのみ使用されている。将来的に使用された場合に影響を受ける」旨の注記を追加する。

---

### S3-F003: response-poller.ts の3箇所の detectPrompt() 呼び出しの役割区別が不明確

**カテゴリ**: 影響ファイル
**場所**: ## 影響範囲 > detectPrompt()呼び出し元テーブル > response-poller.ts 行

**問題**:
Issue では response-poller.ts について「line 248, 442, 556（3箇所）」と行番号を列挙し、影響内容を一括で「応答完了判定とプロンプトメッセージ保存の精度が向上」と記述しているが、各呼び出し箇所の役割とガード条件が異なる。

**証拠**:
- **line 248**: `extractResponse()` 内、`if (cliToolId === 'claude')` ガード付き。Claude の permission prompt の早期検出用。`stripAnsi()` 済みの full output に対して呼び出し。
- **line 442**: `extractResponse()` 内、ガードなし（全CLIツール対象）。通常完了判定でキャッチされなかった interactive prompt のフォールバック検出。raw full output に対して呼び出し。
- **line 556**: `checkForResponse()` 内。完了レスポンスが prompt かどうかの分類判定。`result.response` に対して呼び出し。DB 保存時の `messageType: 'prompt'` 設定と WebSocket broadcast に直接影響。

**推奨対応**:
影響テーブル内で3箇所を個別に記載するか、影響内容の説明内で各箇所の役割を区別して記述する。特に line 248 が Claude 専用ガード付きである点は重要。

---

### S3-F004: yes/no プロンプトへの交差影響テストの具体的なデータが不足

**カテゴリ**: テスト範囲
**場所**: ## テスト要件 > 3. 偽陽性テスト、4. 回帰テスト

**問題**:
偽陽性リスク分析の項目5および偽陽性テスト項目で yes/no プロンプトへの交差影響が言及されているが、正常系テスト（項目1）と異なり具体的なテスト入力データ例が提供されていない。

**証拠**:
正常系テストには以下の具体的な入力データが提供済み:
```typescript
const output = [
  'Do you want to proceed?',
  '\u276F 1. Yes',
  '  2. Yes, and don\'t ask again...',
  '/Users/maenokota/...',
  'ndmate-issue-161',
  '  3. No',
  '',
  'Esc to cancel ...',
].join('\n');
```

一方、偽陽性テストには「yes/noプロンプト出力にnumbered optionに類似する行が含まれるケース」との記述のみで、具体的なテストデータが未定義。

**推奨対応**:
以下のようなテスト入力データ例を偽陽性テスト項目に追加:
```typescript
// パス行を含む yes/no プロンプトが正しく yes/no として検出されること
const output = [
  'File /Users/maenokota/share/work/github_kewton/comma',
  'ndmate-issue-161/src/lib/test.ts already exists',
  'Do you want to overwrite? (y/n)',
].join('\n');
// Expected: isPrompt === true, type === 'yes_no'
```

---

### S3-F005: 継続行スキップ動作（ラベル非連結）の検証テストが未定義

**カテゴリ**: テスト範囲
**場所**: ## 偽陽性リスク分析 > 項目4 および ## テスト要件

**問題**:
Issue の偽陽性リスク分析項目4で「継続行のテキストは直前に検出されたオプションの label には連結されない」と明記されているが、この動作を明示的に検証する assertion がテスト要件に含まれていない。正常系テストの expected では `options.length === 3` のみが要求されており、各オプションの `label` 値の検証が含まれていない。

**証拠**:
テスト要件の正常系テスト expected コメント:
```
// Expected: isPrompt === true, promptData.type === 'multiple_choice', options.length === 3
```

偽陽性リスク分析項目4:
> 「このため、オプション2のラベルは折り返し前の部分（"Yes, and don't ask again for curl and python3 commands in"）のみとなる。」

**推奨対応**:
テスト要件の正常系テストの expected に以下の assertion を追加:
```typescript
// options[0].label === 'Yes'
// options[1].label === "Yes, and don't ask again for curl and python3 commands in"
// options[2].label === 'No'
// options[0].isDefault === true (❯ indicator)
```

---

## Nice to Have（あれば良い）

### S3-F006: UIコンポーネントの具体的なファイルパスが未列挙

**カテゴリ**: ドキュメント更新
**場所**: ## 影響範囲 > prompt-detector.tsからの関連関数を使用するモジュール

**問題**:
「UIコンポーネント（プロンプト表示）」として一括記載されているが、具体的なコンポーネントファイルパスが列挙されていない。

**推奨対応**:
プロンプト UI 表示に関連するコンポーネント（例: `src/components/worktree/WorktreeDetailRefactored.tsx` 内のプロンプトボタン表示部分）の参照を追加する。型構造に変更がないためコード変更不要である点は現在の記載通り。

---

### S3-F007: パフォーマンス影響の評価にポーリング頻度の補足があるとよい

**カテゴリ**: 影響ファイル
**場所**: ## 影響範囲 > パフォーマンス影響

**問題**:
「追加される正規表現は単純パターンであり、既存のポーリング間隔（2秒）と比較して無視できるオーバーヘッド」は妥当な評価だが、`detectPrompt()` が呼ばれるコンテキストの詳細な列挙があると説得力が増す。

**推奨対応**:
以下のコンテキスト情報を補足:
- `worktrees/route.ts`: 全worktree x 3 CLIツール の O(N) ループ内で呼び出し
- `response-poller.ts`, `claude-poller.ts`, `auto-yes-manager.ts`: 2秒間隔ポーリング
- `current-output/route.ts`: クライアント polling 頻度依存

いずれのケースでも追加される2つの正規表現（`/^[\/~]/` と `/^[a-zA-Z0-9_-]+$/`）は行単位の O(n) 操作であり、実質的な影響はない。

---

### S3-F008: ターミナル幅テストでオプション番号行折り返しの制限事項が未明記

**カテゴリ**: テスト範囲
**場所**: ## テスト要件 > 5. 異なるターミナル幅による折り返しパターンテスト

**問題**:
テスト要件項目5に「幅が極端に狭い場合にオプション番号行自体が折り返されるケース」が記載されているが、この場合に `isPathContinuation` 修正だけでは対応できない可能性がある。

折り返し後の行（例: `don't ask again for...`）はアポストロフィや空白を含むため `/^[a-zA-Z0-9_-]+$/` にマッチせず、`/^[\/~]/` にもマッチしない。`hasLeadingSpaces` で捕捉されるかどうかは、tmux がターミナル折り返し時に先頭スペースを付与するかどうかに依存する。

**推奨対応**:
この制限事項をテスト要件またはIssue本文に明記し、「オプション番号行自体の折り返しは hasLeadingSpaces 条件への依存であり、本修正のスコープ外である」旨の注記を追加する。

---

## 参照ファイル

### コード（直接変更対象）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/prompt-detector.ts` (line 266-324): detectMultipleChoicePrompt() の逆順スキャン・継続行検出ロジック

### コード（影響範囲 - 欠落指摘あり）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/app/api/worktrees/[id]/prompt-response/route.ts` (line 14, 75): detectPrompt() を直接呼び出し -- **Issue の影響テーブルに未記載 (S3-F001)**

### コード（影響範囲 - 正確性指摘あり）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/status-detector.ts` (line 68, 80): detectPrompt() を呼び出すが runtime 呼び出し元なし (S3-F002)
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/response-poller.ts` (line 248, 442, 556): 3箇所の detectPrompt() 呼び出しの役割区別 (S3-F003)

### コード（影響範囲 - 検証済み・正確）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/auto-yes-manager.ts` (line 290): detectPrompt() 呼び出し -- Issue 記載と一致
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/claude-poller.ts` (line 164, 232): detectPrompt() 呼び出し -- Issue 記載と一致
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/app/api/worktrees/route.ts` (line 62): detectPrompt() 呼び出し -- Issue 記載と一致
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/app/api/worktrees/[id]/route.ts` (line 62): detectPrompt() 呼び出し -- Issue 記載と一致
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/app/api/worktrees/[id]/current-output/route.ts` (line 88): detectPrompt() 呼び出し -- Issue 記載と一致

### コード（関連モジュール - 検証済み・正確）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/app/api/worktrees/[id]/respond/route.ts` (line 12, 105): getAnswerInput() のみ使用 -- Issue 記載と一致
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/lib/auto-yes-resolver.ts`: resolveAutoAnswer() はオプション number を使用 -- Issue 記載と一致
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/src/hooks/useAutoYes.ts`: クライアント側フック -- Issue 記載と一致

### テスト
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/tests/unit/prompt-detector.test.ts`: テストケース追加対象。現在 multiple choice の折り返しテストなし

### ドキュメント
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/CLAUDE.md`: Issue #161 実装詳細との整合性確認
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-181/dev-reports/design/issue-161-auto-yes-false-positive-design-policy.md`: Layer 1/2/3 防御の設計背景

---

## 影響範囲の総合評価

### 全体的な評価
Issue #181 の影響範囲の記載は**概ね正確かつ網羅的**である。Stage 1/2 のレビューを経て、detectPrompt() 呼び出し元のテーブル化、各呼び出し元の影響内容の具体化、検出順序の差異の注記など、重要な情報が追加されている。

### 主要な懸念点
1. **prompt-response/route.ts の欠落 (Must Fix)**: detectPrompt() を直接呼び出す重要なファイルが影響範囲テーブルから漏れている。Auto-Yes の re-verification パスに影響するため、記載が必要。
2. **status-detector.ts の影響レベル (Should Fix)**: 実行時に使用されていない関数が他の runtime コードと同列に記載されており、影響レベルの認識に誤解を生む可能性がある。
3. **テストカバレッジのギャップ (Should Fix)**: 偽陽性テストとラベル検証テストの具体的なデータが不足しており、実装者が正確なテストを書くための情報が不十分。

### 破壊的変更の評価
本修正は `PromptDetectionResult` および `PromptData` の型構造に変更を加えないため、**破壊的変更はない**。継続行検出条件の追加は検出範囲の拡大（これまで false negative だったケースが正しく検出される）であり、既存の正常検出に影響を与えない設計である。

### セキュリティへの影響
追加される正規表現 `/^[\/~]/` と `/^[a-zA-Z0-9_-]+$/` は anchored pattern であり、ReDoS のリスクはない（S4-001 準拠）。偽陽性による auto-yes の誤送信リスクは偽陽性リスク分析で詳細に検討されており、実質的なリスクは低い。

### 互換性への影響
後方互換性は完全に維持される。型の変更なし、API の変更なし、外部インターフェースの変更なし。
