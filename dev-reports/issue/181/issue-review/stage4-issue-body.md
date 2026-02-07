## 問題概要

Claude CLIのmultiple choiceプロンプトで、オプションのテキストが長く複数行にまたがる場合、プロンプトとして検出されず、UIにyes/noメッセージとして表示されない。

## 再現手順

1. Claude CLIで長いパスを含むコマンド実行の確認プロンプトを表示させる
2. 例: `curl`や`python3`コマンドの実行許可プロンプト
3. オプション2のテキストが長く、ターミナル幅で折り返される状態

## 期待される動作

3択プロンプト（Yes / Yes, and don't ask again... / No）がUIにプロンプトメッセージとして表示され、ボタンで回答できる。

## 実際の動作

プロンプトが検出されず、ターミナル出力としてのみ表示される。Auto-Yesも動作しない。

## スクリーンショット

ターミナル出力:
```
Do you want to proceed?
❯ 1. Yes
  2. Yes, and don't ask again for curl and python3 commands in
/Users/maenokota/share/work/github_kewton/comma
ndmate-issue-161
  3. No

Esc to cancel · Tab to amend · ctrl+e to explain
```

オプション2の長いパスが複数行に折り返されている。

> **Note**: 上記はターミナル幅による折り返しを再現したテキスト表現です。実際のターミナルでは表示幅に応じて折り返し位置が異なる場合があります。

## 根本原因

`src/lib/prompt-detector.ts` の `detectMultipleChoicePrompt()` 関数で、継続行の検出が不十分。

### 検出アルゴリズムの問題

アルゴリズムは末尾から逆順にスキャンする。問題のターミナル出力に対して、以下のように処理される:

1. `  3. No` → オプション3として検出 ✓
2. `ndmate-issue-161` → **継続行として認識されない** ✗ → スキャン中断

**ここで逆順スキャンが中断するため、以下の行は評価されない:**

3. `/Users/maenokota/share/work/github_kewton/comma` → （未評価：仮に行2が修正されても、この行も同様に継続行として認識される必要がある）
4. `  2. Yes, and don't ask again for curl and python3 commands in` → （未評価：オプション2本体）
5. `❯ 1. Yes` → （未評価：オプション1）

**重要**: 修正は `ndmate-issue-161` だけでなく、`/Users/...comma` 行も含めた**複数行の連続的な継続行**を全て正しく処理する必要がある。行2が修正されて継続行と認識されても、次に評価される行3（`/Users/...`で始まるパス行）でも同じ問題が発生するため、両方のパターンに対応が必要。

### 継続行検出の制限（line 226-228）

```typescript
// src/lib/prompt-detector.ts, detectMultipleChoicePrompt() 関数内
const hasLeadingSpaces = rawLine.match(/^\s{2,}[^\d]/) && !rawLine.match(/^\s*\d+\./);
const isShortFragment = line.length < 5 && !line.endsWith('?');
const isContinuationLine = hasLeadingSpaces || isShortFragment;
```

現在の検出条件:
- 2文字以上の先頭スペースがある（かつ数字で始まらない）、または
- 5文字未満の短い行（かつ`?`で終わらない）

**不足している条件:**
- パス継続（`/`や`~`で始まる行） - 例: `/Users/maenokota/share/work/github_kewton/comma`
- ファイル名/パスの断片（英数字・ハイフン・アンダースコアのみで構成される行） - 例: `ndmate-issue-161`
- 長い行が折り返された場合の一般的なパターン

### 結果

```
options = [{number: 3, label: "No", isDefault: false}]
options.length < 2  →  true  // オプションが1つしかない（line 243の検証）
→ isPrompt: false  // プロンプトとして認識されない
```

> **Note**: `options.length < 2` の検証は `src/lib/prompt-detector.ts` の243行目で行われる。1から始まる連番チェックは行われておらず、オプション数が2未満またはデフォルトインジケータ（`❯`）がない場合にプロンプト非検出となる。

## 修正案

継続行の検出条件を拡張:

```typescript
// 現在（line 226-228）
const hasLeadingSpaces = rawLine.match(/^\s{2,}[^\d]/) && !rawLine.match(/^\s*\d+\./);
const isShortFragment = line.length < 5 && !line.endsWith('?');
const isContinuationLine = hasLeadingSpaces || isShortFragment;

// 修正案
const isPathContinuation = /^[\/~]/.test(line) || /^[a-zA-Z0-9_-]+$/.test(line);
const isContinuationLine = hasLeadingSpaces || isShortFragment || isPathContinuation;
```

### 偽陽性リスク分析

提案された `isPathContinuation` 条件の偽陽性リスク:

1. **`/^[\/~]/.test(line)`**: `/`または`~`で始まる行にマッチ。ファイルパスの折り返しを正確にカバーする。偽陽性リスクは低い（質問文が`/`で始まることは稀）。

2. **`/^[a-zA-Z0-9_-]+$/.test(line)`**: 英数字・ハイフン・アンダースコアのみで構成される行にマッチ。以下の偽陽性リスクがある:
   - 質問文中の単一単語（例: `Proceed`, `Continue`）がマッチする可能性
   - **緩和要因**: この条件は `options.length > 0`（既にオプションが1つ以上検出済み）の場合にのみ評価されるため、質問文がオプションとして扱われるケースは限定的
   - **偽陽性が発生した場合の影響**: 該当行は `continue` により**スキップされるのみ**で、直前のオプションのラベルには連結されない。結果的にオプション数やラベルテキストには影響しない

3. **継続行のスキップ動作について**: 現在のコード（line 230-232）では、継続行と判定された行は `continue` でスキップされ、次の行のスキャンが続行される。つまり、継続行のテキストは直前に検出されたオプションの `label` には連結されない。このため、オプション2のラベルは折り返し前の部分（`"Yes, and don't ask again for curl and python3 commands in"`）のみとなる。`auto-yes-resolver.ts` の `resolveAutoAnswer()` はオプションの `number` を使用するため、ラベルが途中で切れていてもAuto-Yesの動作には影響しない。ただし、UIに表示されるラベルが不完全になる可能性がある点は留意すべきである。

4. **yes/noプロンプトへの交差影響**: `detectMultipleChoicePrompt()` は `detectPrompt()` の中でPattern 0として最初に呼ばれる。この関数が `isPrompt: false` を返せば、後続のyes/noパターン（Pattern 1-5）が評価される。修正後の継続行条件が緩くなることで、逆順スキャンで走査範囲が広がり、偶然 `options.length >= 2 && hasDefaultIndicator` の条件を満たす可能性がゼロではない。ただし、numbered option pattern（`/^\s*([❯ ]\s*)?(\d+)\.\s*(.+)$/`）にマッチする行が2つ以上必要であり、かつ少なくとも1つが❯インジケータを含む必要があるため、実際の偽陽性リスクは低い。

5. **代替アプローチとのトレードオフ**:
   - 「オプション番号パターン (`^\s*\d+\.`) に一致しない行はすべて継続行」アプローチはよりシンプルだが、質問文自体も継続行として取り込んでしまうリスクがある
   - 現提案は明示的なパターンマッチのため、意図しないマッチの範囲がより限定的

## テスト要件

### 追加すべきテストケース

既存テスト `tests/unit/prompt-detector.test.ts` には multiple choice プロンプトのテストケースが不足しているため、以下を追加する:

1. **正常系: 複数行オプション検出**
   - 長いパスを含むオプションがターミナル幅で折り返された場合のプロンプト検出
   - `/`で始まるパス継続行、英数字のみの断片行の両方を含むケース

2. **正常系: パス以外の継続行**
   - 長い説明文がオプション内で折り返された場合

3. **偽陽性テスト**
   - 質問文の単語が継続行として誤認されないこと
   - オプションなしの通常テキスト出力が誤検出されないこと
   - **yes/noプロンプト出力にnumbered optionに類似する行が含まれるケース**の動作確認（例: ターミナル出力に `1. First item` のようなリスト表示が含まれ、末尾に `(y/n)` がある場合にyes/noとして正しく検出されること）

4. **回帰テスト**
   - 既存の正常ケース（折り返しなしの標準的なmultiple choiceプロンプト）が引き続き動作すること
   - 既存のyes/noプロンプト検出が影響を受けないこと

5. **異なるターミナル幅による折り返しパターンテスト**
   - 同じ出力がターミナル幅の違いにより異なる位置で折り返されるケースのテスト
   - 幅が極端に狭い場合にオプション番号行自体が折り返されるケース（例: `  2. Yes, and` の次行に `don't ask...` がある場合、先頭スペースの `hasLeadingSpaces` 条件で捕捉されることの確認）
   - 幅が広くて折り返しが発生しない場合（既存動作に影響しないことの確認）

## 受け入れ条件

- [ ] 複数行にまたがるオプションテキストを含むmultiple choiceプロンプトが正しく検出されること
- [ ] Auto-Yesが当該プロンプトで動作すること
- [ ] UIにプロンプトメッセージとボタンが表示されること
- [ ] 既存のプロンプト検出（yes/no、標準的なmultiple choice）が退行しないこと
- [ ] テスト要件セクションに記載のテストケースが追加されていること

## 影響範囲

### 直接変更対象

- `src/lib/prompt-detector.ts` - `detectMultipleChoicePrompt()` 関数の継続行検出ロジック修正
- `tests/unit/prompt-detector.test.ts` - テストケース追加

### detectPrompt()呼び出し元（間接影響）

修正は `detectMultipleChoicePrompt()` 内のみだが、`detectPrompt()` を呼び出す以下の全ファイルで検出精度が向上する。型構造（`PromptDetectionResult`, `PromptData`）に変更はないため、これらのファイルへのコード変更は不要。

| ファイル | 呼び出し箇所 | 影響内容 |
|---------|-------------|---------|
| `src/lib/auto-yes-manager.ts` | line 280 (`pollAutoYes()`) | Auto-Yes自動応答のプロンプト検出精度が向上。折り返しを含むmultiple choiceプロンプトで自動応答が正しく動作するようになる |
| `src/lib/status-detector.ts` | line 80 (`detectSessionStatus()`) | セッションステータス判定の精度が向上。これまで見逃されていたプロンプトが検出されるようになり、'waiting' ステータスがより正確になる。Issue #180のステータス表示不整合の部分的な改善にもなり得る。ただし偽陽性が導入された場合、サイドバーのステータスが不正確に 'waiting' と表示される可能性がある |
| `src/lib/claude-poller.ts` | line 164, 232 | 応答完了判定の精度が向上。折り返しを含むmultiple choiceプロンプトが正しく検出され、完了として処理される |
| `src/lib/response-poller.ts` | line 248, 442, 556（3箇所） | 応答完了判定とプロンプトメッセージ保存の精度が向上。これまで「応答未完了」として扱われていた出力が「プロンプト検出→完了」として処理され、promptタイプとしてDBに正しく保存されるようになる |
| `src/app/api/worktrees/route.ts` | line 62 | サイドバーのステータス表示（`isWaitingForResponse`）の精度が向上 |
| `src/app/api/worktrees/[id]/route.ts` | line 62 | 個別worktreeのステータス表示の精度が向上 |
| `src/app/api/worktrees/[id]/current-output/route.ts` | line 79 | リアルタイム出力のプロンプト検出（`isPromptWaiting`, `promptData`）がクライアントに正しく返却されるようになる |
| `src/app/api/worktrees/[id]/respond/route.ts` | `getAnswerInput()` のみ使用 | 影響は限定的（回答入力の取得のみ） |

### 検出結果を消費するモジュール（コード変更不要）

- `src/lib/auto-yes-resolver.ts` - `resolveAutoAnswer()` はオプションの `number` を使用するため、ラベルの不完全さによる影響なし
- `src/hooks/useAutoYes.ts` - クライアント側Auto-Yesフック。`promptData` の型構造が変わらないため、修正により正しくプロンプトが検出されるようになると既存のUI表示ロジックが自動的に動作する
- UIコンポーネント（プロンプト表示） - `promptData` の型構造は変更されないため、コード変更不要

### パフォーマンス影響

追加される正規表現（`/^[\/~]/` と `/^[a-zA-Z0-9_-]+$/`）は単純パターンであり、既存のポーリング間隔（2秒）と比較して無視できるオーバーヘッド。対応不要。

## 関連Issue

- #180 (ステータス表示の不整合 - 同じく検出ロジックの問題。`status-detector.ts` が `detectPrompt()` を使用しており、本修正によりステータス判定精度が向上する可能性がある)

---

## レビュー履歴

### イテレーション 1 (2026-02-07) - 影響範囲レビュー

- S3-F001 (Must Fix): 影響範囲セクションを拡充し、`detectPrompt()` を呼び出す全ファイルを一覧表形式で明記
- S3-F002 (Should Fix): `status-detector.ts` と Issue #180 との関連を影響範囲テーブルと関連Issueセクションに追記
- S3-F003 (Should Fix): `response-poller.ts`（3箇所）と `claude-poller.ts`（2箇所）の影響を追記
- S3-F004 (Should Fix): yes/noプロンプトへの交差影響を偽陽性リスク分析に追記、テスト要件にテストケース追加
- S3-F005 (Should Fix): 継続行のスキップ動作の記載を修正（`continue` によるスキップであり、ラベル連結ではない旨を明確化）
- S3-F006 (Nice to Have): UIコンポーネントの影響（コード変更不要）を影響範囲に追記
- S3-F007 (Nice to Have): パフォーマンス影響の評価を影響範囲に追記
- S3-F008 (Nice to Have): 異なるターミナル幅による折り返しパターンのテストケースをテスト要件に追加
