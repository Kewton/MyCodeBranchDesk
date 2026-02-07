# Issue #181: 複数行オプションを含むmultiple choiceプロンプトが検出されない - 設計方針書

## 1. 概要

Claude CLIのmultiple choiceプロンプトにおいて、オプションのテキストが長くターミナル幅で折り返されると、`detectMultipleChoicePrompt()` 関数がプロンプトを検出できない不具合の修正。これによりAuto-YesおよびUIのプロンプト表示が機能しなくなる。

**優先度**: 高（Auto-Yes機能およびUI表示に直接影響）

**修正対象**: `src/lib/prompt-detector.ts` の `detectMultipleChoicePrompt()` 関数内の継続行検出ロジック（226-228行目）

## 2. 設計方針

### 2.1 適用する設計原則

| 原則 | 適用内容 |
|------|---------|
| **OCP（開放/閉鎖原則）** | 既存の継続行検出条件（`hasLeadingSpaces`, `isShortFragment`）を変更せず、新しい `isPathContinuation` 条件を追加 |
| **KISS（単純さ）** | 2つの単純な正規表現の追加のみで解決。複雑なマルチライン結合ロジックは導入しない |
| **最小影響原則** | 型構造（`PromptDetectionResult`, `PromptData`, `MultipleChoiceOption`）に変更なし。呼び出し元のコード変更は不要 |
| **YAGNI** | 修正範囲を「パス系折り返し」に限定。一般的な英文テキスト折り返しへの対応は現時点では不要（Issue #181の再現シナリオに含まれないため） |

> **将来の拡張に関する注記**: 継続行の判定条件が今後さらに増加する場合は、条件をリスト化して反復処理するリファクタリング（ストラテジーパターンや条件配列化）を検討する。現時点では3条件のOR結合で十分にシンプルであり、過度な抽象化は不要（YAGNI）。（DR1-F004）

### 2.2 非採用案

| 方式 | メリット | デメリット | 不採用理由 |
|------|---------|-----------|-----------|
| オプション番号以外は全て継続行 | 最もシンプル | 質問文も継続行として取り込むリスク | 偽陽性リスクが高い |
| 継続行をオプションラベルに連結 | UIに完全なラベル表示可能 | 実装複雑、ラベル結合ロジックが必要 | `auto-yes-resolver.ts`は`number`のみ使用するため不要 |
| ターミナル幅を考慮した折り返し検出 | 正確な検出 | ターミナル幅取得が困難、環境依存 | 過度に複雑 |

## 3. 修正対象

### 3.1 直接変更対象ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/lib/prompt-detector.ts` | `detectMultipleChoicePrompt()` 関数の継続行検出ロジック拡張（226-228行目） |
| `tests/unit/prompt-detector.test.ts` | multiple choiceプロンプトのテストケース追加 |

### 3.2 変更不要ファイル（間接影響のみ）

型構造（`PromptDetectionResult`, `PromptData`）に変更がないため、以下のファイルへのコード変更は不要。

| ファイル | 呼び出し箇所 | 影響内容 |
|---------|-------------|---------|
| `src/lib/auto-yes-manager.ts` | 262行目 `pollAutoYes()` 内の280行目で `detectPrompt()` を呼び出し | 折り返しを含むmultiple choiceプロンプトでAuto-Yes自動応答が正しく動作するようになる |
| `src/lib/status-detector.ts` | 80行目 `detectSessionStatus()` | プロンプト検出精度が向上し'waiting'ステータスがより正確になる。`STATUS_CHECK_LINE_COUNT = 15`（44行目）の制限内に収まるケース（3オプション+継続行+質問+区切り行）で効果がある。**注意**: status-detector.tsは`detectPrompt()`にoutputの最後の15行(`STATUS_CHECK_LINE_COUNT`)のみを渡す（76行目）。`detectPrompt()`はその引数を`detectMultipleChoicePrompt()`にそのまま渡すため（56行目）、`detectMultipleChoicePrompt()`が実際にスキャンできるのは最大15行である。Issue #181の再現シナリオ（3オプション + 2折り返し行 + 質問文 + 区切り = 約8-9行）は15行以内に収まるため問題ないが、オプション数が多く各オプションに折り返し行がある場合はstatus-detector経由での検出に失敗する可能性がある。他の呼び出し元（response-poller.ts, claude-poller.ts, auto-yes-manager.ts, API routes）は全出力またはより大きなバッファを渡すためこの制限はない（DR3-F002） |
| `src/lib/claude-poller.ts` | 164行目, 232行目 | 応答完了判定の精度が向上 |
| `src/lib/response-poller.ts` | 248行目, 442行目, 556行目 | 応答完了判定とプロンプトメッセージ保存の精度が向上。promptタイプとしてDBに正しく保存されるようになる |
| `src/app/api/worktrees/route.ts` | 62行目 | サイドバーのステータス表示（`isWaitingForResponse`）の精度が向上 |
| `src/app/api/worktrees/[id]/route.ts` | 62行目 | 個別worktreeのステータス表示の精度が向上 |
| `src/app/api/worktrees/[id]/current-output/route.ts` | 79行目 | リアルタイム出力のプロンプト検出（`isPromptWaiting`, `promptData`）がクライアントに正しく返却されるようになる |

### 3.3 関連関数使用モジュール（コード変更不要）

| ファイル | 使用関数 | 備考 |
|---------|---------|------|
| `src/app/api/worktrees/[id]/respond/route.ts` | `getAnswerInput()` のみ | `detectPrompt()` は呼び出していない |
| `src/lib/auto-yes-resolver.ts` | `resolveAutoAnswer()` | オプションの `number` を使用するため、ラベルの不完全さによる影響なし |
| `src/hooks/useAutoYes.ts` | クライアント側Auto-Yesフック | `promptData` の型構造が変わらないため変更不要 |

### 3.4 UIラベル表示コンポーネント（コード変更不要、間接影響）（DR3-F001）

以下のコンポーネントは `option.label` を直接UIに表示する。型構造に変更はないためコード変更は不要だが、セクション11の制約事項1（ラベル不完全性）に直接関連する。将来ラベル連結対応を行う場合、これらのコンポーネントが影響範囲となる。

| ファイル | 使用箇所 | 影響内容 |
|---------|---------|----------|
| `src/components/worktree/PromptMessage.tsx` | 117行目 `{option.label}` 表示 | ラベルが不完全（折り返し前の部分のみ）で表示される可能性がある |
| `src/components/worktree/MessageList.tsx` | 301行目 `{option.label}` 表示 | 同上 |
| `src/components/worktree/PromptPanel.tsx` | 286行目 `{option.number}. {option.label}` 表示 | 同上 |
| `src/components/mobile/MobilePromptSheet.tsx` | 399行目 `{option.number}. {option.label}` 表示 | 同上 |

### 3.5 PromptData型伝搬チェーン（コード変更不要）（DR3-F004）

以下のファイルは `PromptData` 型を参照・伝搬するが、`label` フィールドを直接処理するロジックは含まない。型構造に変更がないため実質的な影響はない。

| ファイル | 使用内容 | 備考 |
|---------|---------|------|
| `src/hooks/useWorktreeUIState.ts` | 196行目, 260行目: `showPrompt(data: PromptData, ...)` | 型構造変更なしのため影響なし |
| `src/types/ui-state.ts` | 45行目: `data: PromptData \| null` | 同上 |
| `src/types/ui-actions.ts` | 27行目: `SHOW_PROMPT` アクション型 | 同上 |
| `src/components/worktree/WorktreeDetailRefactored.tsx` | 67行目: `promptData?: PromptData` props | 同上 |

## 4. 修正内容

### 4.1 現在のコード分析

**ファイル**: `src/lib/prompt-detector.ts` 226-228行目

```typescript
const hasLeadingSpaces = rawLine.match(/^\s{2,}[^\d]/) && !rawLine.match(/^\s*\d+\./);
const isShortFragment = line.length < 5 && !line.endsWith('?');
const isContinuationLine = hasLeadingSpaces || isShortFragment;
```

**現在の継続行検出条件**:
1. `hasLeadingSpaces`: 2文字以上の先頭スペースがある（かつ数字で始まらない）
2. `isShortFragment`: 5文字未満の短い行（かつ`?`で終わらない）

**不足している条件**:
- `/`や`~`で始まるパス継続行（例: `/Users/maenokota/share/work/github_kewton/comma`）
- 英数字・ハイフン・アンダースコアのみで構成されるパス断片行（例: `ndmate-issue-161`）

### 4.2 問題の再現シナリオ

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

逆順スキャン時の処理:
1. `'Esc to cancel ...'` と空行 `''` -- `options` が空のため `else if (options.length > 0 ...)` に入らず次へ進む
2. `  3. No` -- オプション3として検出 (OK)、`options = [{3, No, false}]`
3. `ndmate-issue-161` -- **継続行として認識されない** -- スキャン中断（`options.length > 0` かつ `line` はtruthy、しかし `hasLeadingSpaces` = false かつ `isShortFragment` = false のため `isContinuationLine` = false で `break`）
4. 以降の行（オプション2、オプション1、質問文）は未評価

> **空行の挙動（DR2-F006）**: 空行（区切り行 `'Esc to cancel...'` の上下）は `line = ''`（trim後）となり、`optionPattern` にマッチせず、`else if` の `line` 条件も falsy のためどのブロックにも入らない。結果としてスキャンを中断せず、次のイテレーションに進む。テストケース（セクション7.1.1）に含まれる空行はこの挙動を前提としている。

**結果**: `options.length === 1` (< 2) のため `isPrompt: false` を返却（243行目）

### 4.3 修正案

**ファイル**: `src/lib/prompt-detector.ts` 226-228行目

```typescript
// Before (226-228行目)
const hasLeadingSpaces = rawLine.match(/^\s{2,}[^\d]/) && !rawLine.match(/^\s*\d+\./);
const isShortFragment = line.length < 5 && !line.endsWith('?');
const isContinuationLine = hasLeadingSpaces || isShortFragment;

// After
const hasLeadingSpaces = rawLine.match(/^\s{2,}[^\d]/) && !rawLine.match(/^\s*\d+\./);
const isShortFragment = line.length < 5 && !line.endsWith('?');
const isPathContinuation = /^[\/~]/.test(line) || /^[a-zA-Z0-9_-]+$/.test(line);
const isContinuationLine = hasLeadingSpaces || isShortFragment || isPathContinuation;
```

**追加条件の説明**:

| パターン | マッチ対象 | 用途 |
|---------|-----------|------|
| `/^[\/~]/.test(line)` | `/`または`~`で始まる行 | ファイルパスの折り返し行（例: `/Users/maenokota/...`） |
| `/^[a-zA-Z0-9_-]+$/.test(line)` | 英数字・ハイフン・アンダースコアのみで構成される行 | パス断片行（例: `ndmate-issue-161`） |

### 4.4 継続行のスキップ動作について

重要な設計上の注意点として、継続行と判定された行は230-232行目の `continue` により**スキップされるのみ**であり、直前のオプションの `label` には連結されない。

```typescript
// 230-232行目（既存コード、変更なし）
if (isContinuationLine) {
  // Skip continuation lines and continue scanning for more options
  continue;
}
```

これにより:
- オプション2は `'  2. Yes, and don't ask again for curl and python3 commands in'` の行で `optionPattern` にマッチし（`line = lines[i].trim()` でトリム後にマッチ判定）、ラベルは折り返し前の1行目のテキストのみ（`"Yes, and don't ask again for curl and python3 commands in"`）となる。折り返し行（`'/Users/...'` と `'ndmate-issue-161'`）は `continue` でスキップされ、ラベルには連結されない
- `auto-yes-resolver.ts` の `resolveAutoAnswer()` はオプションの `number` を使用するため（23-36行目、特に35行目の `target.number.toString()` で使用）、ラベルが途中で切れていてもAuto-Yesの動作には影響しない
- UIに表示されるラベルが不完全になる可能性がある点は制約事項として受容する（セクション11参照）

### 4.5 コメント更新

既存のコメント（223-225行目）を更新して、新しい継続行条件を含める:

```typescript
// Before (223-225行目)
// Check if this is a continuation line (indented line between options)
// Continuation lines typically start with spaces (like "  work/github...")
// Also treat very short lines (< 5 chars) as potential word-wrap fragments

// After
// Check if this is a continuation line (indented line between options or word-wrap fragments)
// Continuation lines include:
// - Lines with leading spaces (like "  work/github...")
// - Very short lines (< 5 chars) as potential word-wrap fragments
// - Path continuations starting with / or ~ (terminal line-wrap of file paths)
// - Path fragment lines containing only alphanumeric, hyphen, underscore chars
```

## 5. 偽陽性リスク分析

### 5.1 `/^[\/~]/.test(line)` パターン

- **マッチ対象**: `/`または`~`で始まる行
- **偽陽性リスク**: 低。質問文が`/`で始まることは稀。`~`で始まる文もほぼない
- **偽陽性発生時の影響**: 該当行は `continue` でスキップされるのみ。オプション数やラベルテキストには影響しない

### 5.2 `/^[a-zA-Z0-9_-]+$/.test(line)` パターン

- **マッチ対象**: 英数字・ハイフン・アンダースコアのみで構成される行
- **偽陽性リスク**: 中。質問文中の単一単語（例: `Proceed`, `Continue`）がマッチする可能性がある（DR1-F003）
- **緩和要因**:
  1. この条件は `options.length > 0`（222行目: `else if (options.length > 0 ...)`）の場合にのみ評価される
  2. 偽陽性が発生した場合でも、該当行は `continue` でスキップされるのみ
  3. プロンプトとして成立するには `options.length >= 2 && hasDefaultIndicator`（243行目）が必要
- **実質的な影響**: 偽陽性が発生してもスキャン範囲が広がるだけで、numbered optionパターン（`/^\s*([❯ ]\s*)?(\d+)\.\s*(.+)$/`、198行目）にマッチする行が2つ以上かつ`❯`インジケータが必要なため、最終的な誤検出リスクは低い
- **潜在的な副作用シナリオ**（DR1-F003）: 通常のテキスト出力に含まれる単一単語行が継続行として扱われ、その先のnumbered listが誤ってmultiple choiceプロンプトとして検出されるケースが理論上考えられる。ただし、上記緩和要因3の`❯`インジケータ必須条件により、このシナリオの実現可能性は極めて低い
- **Auto-Yesコンテキストでの偽陽性影響分析**（DR4-F002）:
  1. Auto-Yesが送信するのは `resolveAutoAnswer()` の戻り値（数字文字列: `"1"`, `"2"` 等）のみであり、任意のコマンド実行にはつながらない
  2. `❯` (U+276F) はUnicode「HEAVY RIGHT-POINTING ANGLE QUOTATION MARK ORNAMENT」であり、一般的なテキスト出力には含まれない特殊文字である。Claude CLIが選択インジケータとして使用する専用文字であるため、通常出力に含まれる可能性は極めて低い
  3. 万が一偽陽性でAuto-Yes応答が発生しても、Claude CLIがプロンプト状態でなければ入力は無視されるか通常テキストとして処理されるため、破壊的な副作用は生じない
- **将来的な改善案**（DR1-F003）: 偽陽性が実運用で問題となった場合は、以下の対策を検討する:
  - 最小長条件の追加（例: `line.length >= 3`）
  - 直前に検出済みのオプションラベルにパス文字列（`/`）が含まれる場合のみ `isPathContinuation` を有効にする
  - ただし、現時点ではKISS原則とのトレードオフにより現行案を採用する

### 5.3 yes/noプロンプトへの交差影響

`detectMultipleChoicePrompt()` は `detectPrompt()` の中でPattern 0として最初に呼ばれる（56行目）。この関数が `isPrompt: false` を返せば、後続のyes/noパターン（Pattern 1-5、67-155行目）が評価される。

修正後の継続行条件が緩くなることで、逆順スキャンの走査範囲が広がり、偶然 `options.length >= 2 && hasDefaultIndicator` の条件を満たす可能性がゼロではない。ただし:
- numbered optionパターンにマッチする行が2つ以上必要
- 少なくとも1つが`❯`インジケータを含む必要がある
- 実際のyes/noプロンプト出力にこの組み合わせが含まれる可能性は極めて低い

## 6. 影響範囲分析

### 6.1 直接的影響

| 項目 | 影響 |
|------|------|
| 変更対象ファイル | `src/lib/prompt-detector.ts`（226-228行目の1行追加+1行修正+コメント更新）、`tests/unit/prompt-detector.test.ts`（テストケース追加） |
| 型構造 | `PromptDetectionResult`（`prompt-detector.ts`）, `PromptData`, `MultipleChoiceOption`（`models.ts`）-- 変更なし |
| 関数シグネチャ | `detectMultipleChoicePrompt()`, `detectPrompt()` -- 変更なし |
| 呼び出し元 | コード変更不要（セクション3.2参照） |

#### 6.1.1 detectPrompt()の内部output伝搬構造（DR3-F005）

`detectPrompt()` は48行目で `lastLines = lines.slice(-10).join('\n')` を作成し、Pattern 1-5（yes/no系）の検出には `lastLines` を使用する。一方、Pattern 0（multiple choice）の検出では56行目で `detectMultipleChoicePrompt(output)` に元の `output` 全体を渡す。

この二重構造は、呼び出し元ごとに `detectPrompt()` に渡される output のサイズが異なることと相互作用する。

| 呼び出し元 | 渡されるoutputの範囲 | 本修正の効果 |
|-----------|---------------------|-------------|
| `src/lib/response-poller.ts` (248行目) | 全出力（stripAnsi済み） | 最大限発揮される |
| `src/lib/response-poller.ts` (442行目) | `lines.join('\n')` | 最大限発揮される |
| `src/lib/response-poller.ts` (556行目) | `result.response` | 最大限発揮される |
| `src/lib/claude-poller.ts` (164行目) | `fullOutput` | 最大限発揮される |
| `src/lib/claude-poller.ts` (232行目) | `result.response` | 最大限発揮される |
| `src/app/api/worktrees/[id]/current-output/route.ts` (79行目) | 全出力（stripAnsi済み） | 最大限発揮される |
| `src/lib/auto-yes-manager.ts` | `captureSessionOutput()` の結果（最大5000バイト） | 通常十分 |
| `src/lib/status-detector.ts` | last 15 lines（`STATUS_CHECK_LINE_COUNT`） | Issue #181シナリオ（約8-9行）では十分 |
| `src/app/api/worktrees/route.ts` (62行目) | `captureSessionOutput(timeout=100)` の結果 | 出力量が限定的な可能性がある（既存の制約） |
| `src/app/api/worktrees/[id]/route.ts` (62行目) | `captureSessionOutput(timeout=100)` の結果 | 出力量が限定的な可能性がある（既存の制約） |

いずれの呼び出し元も、本修正による悪影響（regression）は発生しない。効果の範囲が呼び出し元により異なるのみである。特に `worktrees/route.ts` と `worktrees/[id]/route.ts` は `captureSessionOutput()` を `timeout=100` で呼び出しており、取得できる出力が非常に短い可能性があるが、これは既存の制約であり本修正固有ではない。

#### 6.1.2 cleanContentの動作変化（DR3-F007）

修正前は折り返しを含むmultiple choiceプロンプトが検出されず、`detectPrompt()` が `isPrompt: false` を返すため `cleanContent = output.trim()`（全出力テキスト）がDBの `content` 列に保存されていた。修正後は `isPrompt: true` となり、`cleanContent = question.trim()`（質問文のみ、例: `'Do you want to proceed?'`）が保存される。

これは正しい動作への変更であり、`messageType` も `'normal'` から `'prompt'` に変わるため、UI側で適切なプロンプト表示が行われるようになる。この変化は `response-poller.ts`（565行目）と `claude-poller.ts`（241行目）で `createMessage()` の `content` フィールドに影響する。

### 6.2 パフォーマンス影響

追加される正規表現（`/^[\/~]/` と `/^[a-zA-Z0-9_-]+$/`）は単純なパターンであり:
- 行単位で評価される（文字列全体のスキャンではない）
- 既存のポーリング間隔（2秒）と比較して無視できるオーバーヘッド
- 既存の正規表現（`optionPattern`, `hasLeadingSpaces`チェック等）と同等の計算コスト

**対応不要。**

### 6.3 デプロイ・マイグレーション考慮事項（DR3-F006）

| 項目 | 影響 |
|------|------|
| DBスキーマ | 変更なし。既存の `chat_messages.prompt_data` カラムのJSON構造は不変 |
| 環境変数 | 変更なし |
| npm依存関係 | 変更なし |
| ビルド手順 | 変更なし。通常の `npm run build` で反映される |
| ダウンタイム | 不要。サーバー再起動のみで反映 |
| ロールバック | 変更前のコードに戻すだけで完了。DB上のデータに影響なし |

### 6.4 Issue #180との関連

`status-detector.ts` が `detectPrompt()` を使用（80行目）しており、本修正によりステータス判定精度が向上する可能性がある。折り返しを含むmultiple choiceプロンプトが正しく検出されるようになると、サイドバーのステータスが正確に'waiting'と表示される。

## 7. テスト計画

### 7.1 追加テストケース

既存テスト `tests/unit/prompt-detector.test.ts` に multiple choice プロンプトのテストケースを追加する。現在、このファイルには multiple choice に関するテストが存在しない。

> **テスト保守性に関する注記（DR1-F005）**: 複数のテストケースでmultiple choiceプロンプトの基本構造（質問文 + オプション一覧の形式）が繰り返されている。テストケースが今後さらに増加する場合は、ヘルパー関数（例: `buildMultipleChoiceOutput(options, wrappedLines?)`）を導入してテスト間の共通構造を抽出することを検討する。ただし、現時点ではテストの自己完結性と可読性を優先し、各テストケースに完全な出力文字列を記述する。

> **型安全性に関する注記（DR2-F008）**: テストコードでは `result.promptData?.options` に `toMatchObject` でアクセスしている。`PromptData` は `YesNoPromptData | MultipleChoicePromptData` のunion型であり、`options` の型が異なる（`YesNoPromptData` では `['yes', 'no']` 固定、`MultipleChoicePromptData` では `MultipleChoiceOption[]`）。`toMatchObject` は実行時には問題ないが、型安全性の観点から `isMultipleChoicePrompt()` 型ガードの定義を将来検討しても良い。既存テストでは `isYesNoPrompt()` 型ガードが使われているため、パターンとして統一するのが望ましい。ただし、本Issueのスコープでは `toMatchObject` での検証で十分である。

#### 7.1.1 正常系: 複数行オプション検出

> **注記（DR2-F009）**: 以下のテストケースは既存の `tests/unit/prompt-detector.test.ts` に追加する。`import { detectPrompt, getAnswerInput } from '@/lib/prompt-detector'` 等のimportは既存のものを使用する。

```typescript
describe('Pattern 0: Multiple choice (numbered options)', () => {
  it('should detect multiple choice prompt with multi-line wrapped options', () => {
    const output = [
      'Do you want to proceed?',
      '❯ 1. Yes',
      '  2. Yes, and don\'t ask again for curl and python3 commands in',
      '/Users/maenokota/share/work/github_kewton/comma',
      'ndmate-issue-161',
      '  3. No',
      '',
      'Esc to cancel · Tab to amend · ctrl+e to explain',
    ].join('\n');

    const result = detectPrompt(output);

    expect(result.isPrompt).toBe(true);
    expect(result.promptData?.type).toBe('multiple_choice');
    expect(result.promptData?.options).toHaveLength(3);
    expect(result.promptData?.options[0]).toMatchObject({
      number: 1, label: 'Yes', isDefault: true
    });
    expect(result.promptData?.options[2]).toMatchObject({
      number: 3, label: 'No', isDefault: false
    });
  });

  it('should detect standard multiple choice prompt without wrapping', () => {
    const output = [
      'Do you want to proceed?',
      '❯ 1. Yes',
      '  2. No',
      '  3. Cancel',
    ].join('\n');

    const result = detectPrompt(output);

    expect(result.isPrompt).toBe(true);
    expect(result.promptData?.type).toBe('multiple_choice');
    expect(result.promptData?.options).toHaveLength(3);
  });
});
```

#### 7.1.2 正常系: パス以外の継続行

```typescript
it('should detect prompt with path starting with ~', () => {
  const output = [
    'Do you want to proceed?',
    '❯ 1. Yes',
    '  2. Yes, and don\'t ask again for commands in',
    '~/projects/my-project',
    '  3. No',
  ].join('\n');

  const result = detectPrompt(output);

  expect(result.isPrompt).toBe(true);
  expect(result.promptData?.type).toBe('multiple_choice');
  expect(result.promptData?.options).toHaveLength(3);
});
```

#### 7.1.3 偽陽性テスト

```typescript
it('should not detect normal text with numbered list as multiple choice', () => {
  const output = [
    'Here are the steps:',
    '1. First, install dependencies',
    '2. Then run the build',
    '3. Finally deploy',
  ].join('\n');

  const result = detectPrompt(output);

  // No ❯ indicator, so should not be detected as multiple choice
  expect(result.isPrompt).toBe(false);
});

it('should still detect yes/no prompt when numbered list exists above', () => {
  const output = [
    'Steps completed:',
    '1. Built successfully',
    '2. Tests passed',
    'Do you want to deploy? (y/n)',
  ].join('\n');

  const result = detectPrompt(output);

  expect(result.isPrompt).toBe(true);
  expect(result.promptData?.type).toBe('yes_no');
});
```

#### 7.1.4 回帰テスト

```typescript
it('should detect existing yes/no prompts without regression', () => {
  const output = 'Would you like to continue? (y/n)';
  const result = detectPrompt(output);

  expect(result.isPrompt).toBe(true);
  expect(result.promptData?.type).toBe('yes_no');
});

it('should not detect normal output as prompt (regression)', () => {
  const output = 'This is just normal output without any prompt';
  const result = detectPrompt(output);

  expect(result.isPrompt).toBe(false);
});
```

#### 7.1.5 異なるターミナル幅による折り返しパターン

> **注記（DR1-F001, DR1-F002）**: 本修正はパス系折り返し行の検出に限定しており、一般的な英文テキスト（アポストロフィやスペースを含む行）の折り返しは検出対象外である。テストケースは提案された `isPathContinuation` パターンで実際にマッチする行のみを含むよう設計している。一般テキスト折り返しへの対応は将来のIssueで検討する（セクション11 制約事項4,5を参照）。

```typescript
it('should handle wide terminal with no wrapping', () => {
  const output = [
    'Do you want to proceed?',
    '❯ 1. Yes',
    '  2. Yes, and don\'t ask again for curl and python3 commands in /Users/maenokota/share/work/github_kewton/commandmate-issue-161',
    '  3. No',
  ].join('\n');

  const result = detectPrompt(output);

  expect(result.isPrompt).toBe(true);
  expect(result.promptData?.type).toBe('multiple_choice');
  expect(result.promptData?.options).toHaveLength(3);
});

it('should handle path continuation lines from terminal wrapping', () => {
  // This test covers the actual Issue #181 reproduction scenario:
  // Only path-based continuation lines (/path/..., fragment-only lines) are detected.
  // General English text wrapping is NOT covered by isPathContinuation.
  const output = [
    'Do you want to proceed?',
    '❯ 1. Yes',
    '  2. Yes, and don\'t ask again for curl and python3 commands in',
    '/Users/maenokota/share/work/github_kewton/comma',
    'ndmate-issue-161',
    '  3. No',
    '',
    'Esc to cancel · Tab to amend · ctrl+e to explain',
  ].join('\n');

  const result = detectPrompt(output);

  expect(result.isPrompt).toBe(true);
  expect(result.promptData?.type).toBe('multiple_choice');
  expect(result.promptData?.options).toHaveLength(3);
});

it('should handle multiple path continuation lines', () => {
  // Multiple path-based continuation lines: all match isPathContinuation patterns
  const output = [
    'Do you want to proceed?',
    '❯ 1. Yes',
    '  2. Yes, and don\'t ask again for commands in',
    '/Users/maenokota/share/work/',
    'github_kewton/comma',
    'ndmate-issue-161',
    '  3. No',
  ].join('\n');

  const result = detectPrompt(output);

  expect(result.isPrompt).toBe(true);
  expect(result.promptData?.type).toBe('multiple_choice');
  expect(result.promptData?.options).toHaveLength(3);
});
```

#### 7.1.6 検出対象外の折り返しパターン（既知の制約）

> **注記**: 以下のパターンは現在の `isPathContinuation` では検出できない。これらは制約事項として認識しており、将来のIssueで対応を検討する。

```typescript
// 以下は本修正のスコープ外（テストとしては追加しない）
// パターンA: 一般英文テキストの折り返し（DR1-F001）
// "don't ask again" -- アポストロフィとスペースを含むため isPathContinuation にマッチしない
// パターンB: スペースを含む英文の折り返し（DR1-F002）
// "curl and python3 commands in" -- スペースを含むため /^[a-zA-Z0-9_-]+$/ にマッチしない
//
// これらのケースでは、オプション2のラベル検出が途中で中断し、
// 後続のオプション1が検出されない可能性がある。
// ただし、Issue #181の実際の再現シナリオでは、折り返し位置が
// パス文字列の直前であるため、本修正で対応可能。
```

### 7.2 テスト実行方法

```bash
# 単体テストのみ実行
npm run test:unit -- tests/unit/prompt-detector.test.ts

# 全テスト実行（回帰確認）
npm run test:unit
```

#### 7.2.1 関連テストの回帰確認（DR3-F008）

以下の既存テストファイルにもmultiple choiceプロンプトに関連するテストが含まれる。これらは本修正でコード変更不要だが、回帰確認の対象として実行を推奨する。

```bash
# 関連テストの個別回帰確認
npm run test:unit -- tests/unit/lib/auto-yes-resolver.test.ts
npm run test:unit -- tests/unit/components/PromptPanel.test.tsx
npm run test:unit -- tests/unit/components/mobile/MobilePromptSheet.test.tsx
npm run test:unit -- tests/unit/components/worktree/MessageListOptimistic.test.tsx
```

| テストファイル | テスト内容 | 本修正との関連 |
|---------------|-----------|---------------|
| `tests/unit/lib/auto-yes-resolver.test.ts` | `resolveAutoAnswer()` のmultiple choiceテスト | `number` ベースの応答判定が変わらないことの確認 |
| `tests/unit/components/PromptPanel.test.tsx` | PromptPanelのmultiple choice表示テスト | `option.label` 表示の回帰確認 |
| `tests/unit/components/mobile/MobilePromptSheet.test.tsx` | MobilePromptSheetのmultiple choiceテスト | 同上 |
| `tests/unit/components/worktree/MessageListOptimistic.test.tsx` | MessageListのプロンプト表示テスト | プロンプトメッセージ表示の回帰確認 |

## 8. リスク分析

| リスク | 確率 | 影響度 | 緩和策 |
|--------|------|--------|--------|
| 新しい継続行条件による偽陽性 | 低 | 中 | `options.length >= 2 && hasDefaultIndicator` の既存バリデーション（243行目）で保護。偽陽性テストケースを追加 |
| `isPathContinuation` がyes/noプロンプトを誤ってmultiple choiceとして検出 | 極低 | 高 | `❯`インジケータ必須条件（243行目）で保護。交差影響テストケースを追加 |
| 逆順スキャン範囲拡大による意図しない行の取り込み | 低 | 低 | 継続行はスキップのみ（ラベル連結なし）。最大50行（206行目）の既存制限で保護。**安全性根拠**（DR4-F006）: (1) スキャンは最大50行という絶対的な上限で保護されており、50行を超える遡りは発生しない、(2) 継続行はスキップされるのみでオプション数には寄与しないため、偽のオプション行が2つ以上かつ`❯`インジケータ付きで存在しない限り誤検出は起こらない、(3) Auto-Yesが送信する値は数字1桁に限定されるため仮に誤検出が起きても被害は限定的 |
| `/^[a-zA-Z0-9_-]+$/` が短い単語にマッチ | 中 | 低 | 該当行はスキップされるのみ。最終的なオプション数+`❯`チェックで誤検出を防止 |

## 9. 受け入れ条件

- [ ] 複数行にまたがるオプションテキストを含むmultiple choiceプロンプトが正しく検出されること
- [ ] Auto-Yesが当該プロンプトで動作すること（`resolveAutoAnswer()` が正しいオプション番号を返却）
- [ ] UIにプロンプトメッセージとボタンが表示されること（`promptData` が正しく返却）
- [ ] 既存のプロンプト検出（yes/no Pattern 1-5、標準的なmultiple choice）が退行しないこと
- [ ] セクション7に記載の全テストケース（セクション7.1.6の検出対象外パターンを除く）が追加され、パスすること
- [ ] `npm run lint` が警告なしでパスすること
- [ ] `npx tsc --noEmit` が型エラーなしでパスすること

## 10. セキュリティ考慮事項

本修正はプロンプト検出のパターンマッチングロジックのみの変更であり、セキュリティへの影響は限定的。

| 項目 | 評価 |
|------|------|
| ReDoS（正規表現DoS） | リスクなし。追加パターン `/^[\/~]/` と `/^[a-zA-Z0-9_-]+$/` は固定長の先頭チェックまたは文字クラスのみで構成されており、バックトラッキングが発生しない。**技術的根拠**（DR4-F001）: `/^[\/~]/` は先頭1文字のみの固定チェックであり量指定子を持たない。`/^[a-zA-Z0-9_-]+$/` は単一の文字クラスと単一の量指定子 `+` のみで構成され、アンカー `^` と `$` で囲まれているため、ネストされた量指定子や重複する選択肢が存在せずcatastrophic backtrackingは発生しない |
| コマンドインジェクション | 影響なし。検出結果は `PromptData` 構造体として返却され、tmuxへの送信は `resolveAutoAnswer()` が返す数値文字列（`"1"`, `"2"`, `"3"` 等）のみ。**セキュリティ境界の明確化**（DR4-F003）: Auto-Yesフローでは `resolveAutoAnswer()` の戻り値のみが `sendKeys()` に渡され、ユーザー入力は経由しない。手動応答パス（`respond/route.ts` の respond API）は本修正のスコープ外であり変更なし。2つの応答パス（Auto-Yes / 手動応答）は独立したセキュリティ境界を持つ |
| XSS | 影響なし。ラベルテキストはReactの自動エスケープによりUIに安全に表示される |
| 入力検証 | 変更なし。`detectPrompt()` への入力はtmux出力をANSIストリップ済みのテキストであり、既存の入力パスに変更はない |

## 11. 制約事項

1. **ラベル不完全性**: 継続行のテキストはオプションのラベルに連結されない（既存の `continue` スキップ動作を維持）。そのため、UIに表示されるオプション2のラベルは折り返し前の部分のみとなる（例: `"Yes, and don't ask again for curl and python3 commands in"`）。この不完全なラベルはDBの `chat_messages.prompt_data` カラムにJSONとして永続化される（`response-poller.ts` 567行目, `claude-poller.ts` 243行目）（DR3-F003）。将来ラベル連結対応を行う場合、既存のDB保存データとの整合性を考慮する必要がある（マイグレーション不要だが、表示上の不一致が残存する可能性がある）。また、ラベルを直接表示するUIコンポーネント（`PromptMessage.tsx`, `MessageList.tsx`, `PromptPanel.tsx`, `MobilePromptSheet.tsx`）が影響を受ける（セクション3.4参照）。これは将来のIssueで対応を検討する余地がある
2. **ターミナル幅非依存**: 本修正はターミナル幅を考慮せず、パターンマッチで継続行を検出する。極端に長いオプションテキストが非常に狭いターミナルで表示される場合、先頭スペースを含む折り返し行（`hasLeadingSpaces` で捕捉）とパス/断片パターン（`isPathContinuation` で捕捉）の組み合わせで対応する
3. **逆順スキャン上限**: 既存の50行制限（206行目）は維持する。極端に多くの継続行を含むプロンプトでは検出漏れが発生する可能性があるが、実用上の問題はない
4. **一般テキスト折り返し非対応（DR1-F001）**: `isPathContinuation` はパス系文字列の折り返しに特化しており、アポストロフィやスペースを含む一般的な英文テキスト（例: `"don't ask again"`）の折り返し行は検出しない。このような折り返しが発生した場合、その時点でスキャンが中断し、以降のオプションが検出されない可能性がある。Issue #181の実際の再現シナリオでは折り返し位置がパス文字列の直前であるため実用上の問題はないが、極端に狭いターミナル幅で一般テキスト部分が折り返されるケースでは未対応
5. **スペースを含む英文断片の非対応（DR1-F002）**: `"curl and python3 commands in"` のようにスペースを含む英文が折り返し行となった場合、`/^[a-zA-Z0-9_-]+$/` パターンにマッチしないため継続行として認識されない。一般テキスト折り返しの検出は本修正のスコープ外であり、必要に応じて将来のIssueで対応を検討する
6. **ドット(.)を含むパス断片の非対応（DR1-F006）**: パターン `/^[a-zA-Z0-9_-]+$/` はドット(`.`)を含まないため、`"file.txt"` や `"v1.2.3"` のようなファイル名・バージョン文字列はマッチしない。Issue #181の再現シナリオではドット付き断片は出現しておらず、YAGNI原則に基づき現時点では対応しない。将来必要になった場合は `/^[a-zA-Z0-9_.-]+$/` への拡張を検討する
7. **detectMultipleChoicePrompt関数の責務拡大傾向（DR1-F007）**: `detectMultipleChoicePrompt()` は (1) オプション行検出、(2) 継続行判別、(3) 質問文抽出、(4) テキスト入力パターン判定 の4つの責務を持っている。本修正は (2) への条件追加のみで関数の責務を増やしてはいないが、今後さらに継続行パターンが増える場合は、継続行判定を独立した関数（例: `isContinuationLine(line, rawLine)`）として抽出するリファクタリングを検討すべきである。本Issueのスコープでは不要
8. **継続行判定のデバッグログ不在（DR4-F005）**: `detectMultipleChoicePrompt()` 内の継続行スキップ処理（230-232行目の `if (isContinuationLine)` ブロック）には、どの条件（`hasLeadingSpaces`, `isShortFragment`, `isPathContinuation`）でマッチしたかを記録する `logger.debug()` が存在しない。これは既存の問題であり本修正固有ではないが、将来のデバッグ効率向上のため、別Issueでログ追加を検討する。ポーリング間隔2秒でのログ量増大に留意が必要
9. **ラベル不完全性による `requiresTextInput` 判定精度の低下（DR4-F008）**: `TEXT_INPUT_PATTERNS` は `opt.label` に対して適用される（prompt-detector.ts 274行目）。継続行がラベルに連結されないため、折り返しによりラベルが途中で切れた場合、本来 `requiresTextInput` が true になるべきオプションのパターンマッチに失敗する可能性がある。ただし、テキスト入力を要求するオプション（`type here`, `tell me` 等を含む）は通常短いテキストであり、ターミナル幅による折り返しが発生する可能性は極めて低い

## 12. 関連ドキュメント

- Issue #181: https://github.com/Kewton/CommandMate/issues/181
- Issue #180: ステータス表示の不整合（`status-detector.ts` が `detectPrompt()` を使用）
- Issue #138: サーバー側Auto-Yesポーリング設計方針書: `dev-reports/design/issue-138-server-side-auto-yes-polling-design-policy.md`

## 13. レビュー指摘事項サマリー

### Stage 1: 通常レビュー（設計原則）

| ID | 重要度 | カテゴリ | タイトル | 対応内容 |
|----|--------|---------|---------|---------|
| DR1-F001 | Must Fix | 設計判断 | テストケース「don't ask again」継続行が提案パターンにマッチしない | セクション7.1.5のテストケースを修正。一般テキスト折り返しのテストケースを削除し、パス系折り返しのみに限定。制約事項4として明記 |
| DR1-F002 | Must Fix | 設計判断 | テストケース「curl and python3 commands in」もマッチしない | セクション7.1.5のテストケースを修正。スペースを含む英文断片のテストケースを除外。制約事項5として明記 |
| DR1-F003 | Should Fix | KISS | `/^[a-zA-Z0-9_-]+$/` の偽陽性リスク | セクション5.2に潜在的副作用シナリオと将来的改善案を追記。現時点ではKISS原則とのトレードオフにより現行案を採用 |
| DR1-F004 | Nice to Have | OCP | 将来の拡張ポイントの明示 | セクション2.1に将来の条件リスト化リファクタリングに関する注記を追加 |
| DR1-F005 | Nice to Have | DRY | テストケースにおけるプロンプト出力文字列の重複 | セクション7.1にテストヘルパー関数導入の検討ノートを追加 |
| DR1-F006 | Nice to Have | YAGNI | ドット(.)を含むパス断片への対応漏れ | 制約事項6として明記。YAGNI原則に基づき現時点では対応しない |
| DR1-F007 | Nice to Have | SRP | detectMultipleChoicePrompt関数の責務拡大 | 制約事項7として明記。将来のリファクタリング候補として記録 |

### Stage 2: 整合性レビュー

| ID | 重要度 | カテゴリ | タイトル | 対応内容 |
|----|--------|---------|---------|---------|
| DR2-F001 | Should Fix | 行番号不一致 | auto-yes-manager.ts の pollAutoYes() 行番号参照が曖昧 | セクション3.2の表を修正。「262行目 pollAutoYes() 内の280行目で detectPrompt() を呼び出し」と明確化 |
| DR2-F002 | Nice to Have | 行番号不一致 | auto-yes-resolver.ts の行番号が1行ずれている | セクション4.4を修正。「23-36行目、特に35行目の target.number.toString() で使用」に更新 |
| DR2-F003 | Nice to Have | 動作記述不一致 | PromptDetectionResult の定義場所に関する暗黙の前提 | セクション6.1の型構造行を修正。各型の定義ファイル（prompt-detector.ts / models.ts）を明示 |
| DR2-F004 | Must Fix -> 問題なし | コード不一致 | テストコードの promptData.options[0] の isDefault 検証 | 詳細調査の結果、設計書の記載は正確であり問題なしと確認。unshift()による正順配列構築により期待値は正しい。対応不要 |
| DR2-F005 | Should Fix | 動作記述不一致 | テスト入力のオプション2の rawLine 先頭スペースの扱いの明示が不足 | セクション4.4の説明を修正。オプション2が optionPattern にマッチする過程と折り返し行のスキップ動作を明確化 |
| DR2-F006 | Must Fix -> 説明追加 | コード不一致 | 空行の挙動説明が不足 | セクション4.2に空行の挙動に関する注記を追加。空行はどの条件にもマッチせずスキャンを中断しないことを明示 |
| DR2-F007 | Should Fix | 動作記述不一致 | 再現シナリオの逆順スキャン説明でオプション行以外の行の扱いが不完全 | セクション4.2の逆順スキャン説明にステップ1として 'Esc to cancel...' と空行の処理を追加 |
| DR2-F008 | Nice to Have | テスト不一致 | テストファイルのimport文にMultipleChoicePromptData型が含まれていない | セクション7.1にテスト型安全性に関する注記を追加。将来的な型ガード導入の検討を記録 |
| DR2-F009 | Nice to Have | 動作記述不一致 | 設計書のテストコードで detectPrompt の import 元が明示されていない | セクション7.1.1の冒頭に「既存ファイルへの追記であり、importは既存のものを使用」する旨の注記を追加 |

### Stage 3: 影響分析レビュー

| ID | 重要度 | カテゴリ | タイトル | 対応内容 |
|----|--------|---------|---------|---------|
| DR3-F001 | Should Fix | 影響範囲の漏れ | PromptMessage.tsx と MessageList.tsx がUIラベル表示影響の記載対象に含まれていない | セクション3.4を新設し、option.labelを直接UI表示する4つのコンポーネントを追加（PromptMessage.tsx, MessageList.tsx, PromptPanel.tsx, MobilePromptSheet.tsx） |
| DR3-F002 | Should Fix | 呼び出し元の漏れ | status-detector.ts における detectPrompt() への入力が last 15 lines に切り詰められている点の影響分析が不十分 | セクション3.2の status-detector.ts の記載を拡充。15行制限とdetectMultipleChoicePrompt()への伝搬を明示 |
| DR3-F003 | Nice to Have | 副作用 | DB保存される promptData.options[].label が不完全になる点の影響の明示不足 | セクション11の制約事項1にDB永続化の影響とUIコンポーネントへの参照を追記 |
| DR3-F004 | Nice to Have | 影響範囲の漏れ | useAutoYes.ts とクライアント側 PromptData 消費チェーンの記載が不十分 | セクション3.5を新設し、PromptData型伝搬チェーン（useWorktreeUIState.ts, ui-state.ts, ui-actions.ts, WorktreeDetailRefactored.tsx）を追記 |
| DR3-F005 | Must Fix | 影響範囲の漏れ | detectPrompt() 内部で lastLines を作成するが detectMultipleChoicePrompt() には full output を渡す設計の説明不足 | セクション6.1.1を新設し、呼び出し元ごとのoutputサイズ一覧表と効果の差異を詳細に記載 |
| DR3-F006 | Nice to Have | デプロイ考慮 | デプロイ・マイグレーション考慮事項のセクションが存在しない | セクション6.3を新設し、DBスキーマ・環境変数・npm依存関係・ビルド手順・ダウンタイム・ロールバックの全てが「変更なし」であることを明示 |
| DR3-F007 | Should Fix | 副作用 | cleanContent の変化による DB 保存 content の差異分析が不足 | セクション6.1.2を新設し、修正前後のcleanContentとmessageTypeの変化を明示。正しい動作への変更であることを記載 |
| DR3-F008 | Nice to Have | 影響範囲の漏れ | 既存テストファイルにmultiple choice関連テストが存在する他ファイルの記載がない | セクション7.2.1を新設し、回帰確認対象の4つの既存テストファイルを追記 |

### Stage 4: セキュリティレビュー

| ID | 重要度 | カテゴリ | タイトル | 対応内容 |
|----|--------|---------|---------|---------|
| DR4-F001 | Nice to Have | ReDoS | 追加正規表現パターンのReDoSリスク評価: 安全 | セクション10のReDoS行に技術的根拠（単一文字クラス・量指定子のみ、ネストなし）を追記 |
| DR4-F002 | Should Fix | データ整合性 | 偽陽性による意図しないAuto-Yesコマンド実行のリスク分析が不十分 | セクション5.2にAuto-Yesコンテキストでの偽陽性影響分析を追記。数字文字列限定・U+276F特殊性・非プロンプト状態での無害性を明記 |
| DR4-F003 | Nice to Have | インジェクション | tmux sendKeysへの入力が数値文字列に限定されていることの明示 | セクション10のコマンドインジェクション行にAuto-Yesフローと手動応答パスのセキュリティ境界を明記 |
| DR4-F004 | Nice to Have | XSS | 不完全なラベルテキストのUI表示におけるXSSリスク: 問題なし | 対応不要。設計書セクション10の記載は適切 |
| DR4-F005 | Nice to Have | ログ | 継続行判定の新条件追加に関するデバッグログの不在 | セクション11に制約事項8として追記。将来の別Issueでのログ追加を推奨 |
| DR4-F006 | Should Fix | データ整合性 | 50行逆順スキャン制限と継続行スキップの組み合わせによるスキャン範囲拡大の安全性分析 | セクション8のリスク分析表に安全性根拠（50行上限・オプション数非寄与・数字1桁限定）を追記 |
| DR4-F007 | Nice to Have | インジェクション | 手動応答パスのカスタムテキスト入力によるtmuxコマンドインジェクションリスク（既存問題、スコープ外） | 対応不要（本修正スコープ外）。将来のセキュリティ改善Issueとして記録 |
| DR4-F008 | Nice to Have | データ整合性 | requiresTextInput判定がラベル不完全性により誤動作する可能性 | セクション11に制約事項9として追記。テキスト入力オプションは通常短いため折り返し可能性は極めて低い旨を明記 |

## 14. 実装チェックリスト

### 必須項目

- [ ] `src/lib/prompt-detector.ts` 226-228行目に `isPathContinuation` 条件を追加
- [ ] `isPathContinuation` のパターン: `/^[\/~]/.test(line) || /^[a-zA-Z0-9_-]+$/.test(line)`
- [ ] `isContinuationLine` に `isPathContinuation` をOR条件として追加
- [ ] コメント（223-225行目）を更新して新しい継続行条件を記述
- [ ] テストケース追加: 複数行オプション検出（セクション7.1.1）
- [ ] テストケース追加: 標準multiple choiceプロンプト検出（セクション7.1.1）
- [ ] テストケース追加: `~` で始まるパス継続行（セクション7.1.2）
- [ ] テストケース追加: 偽陽性テスト -- 番号付きリストがmultiple choiceとして誤検出されない（セクション7.1.3）
- [ ] テストケース追加: 交差影響テスト -- yes/noプロンプトの正常検出（セクション7.1.3）
- [ ] テストケース追加: 回帰テスト（セクション7.1.4）
- [ ] テストケース追加: パス継続行による折り返しパターン（セクション7.1.5 -- パス系のみ）
- [ ] テストケースにおいて、一般テキスト折り返し（`"don't ask again"`, `"curl and python3 commands in"`）をテスト対象に含めないこと（DR1-F001, DR1-F002）
- [ ] `npm run lint` がパスすること
- [ ] `npx tsc --noEmit` がパスすること
- [ ] `npm run test:unit` が全テストパスすること

### 確認項目

- [ ] `/^[a-zA-Z0-9_-]+$/` パターンの偽陽性が実用上許容可能であることを確認（DR1-F003）
- [ ] 既存のyes/noプロンプト検出（Pattern 1-5）に退行がないことを確認
- [ ] 型構造（`PromptDetectionResult`, `PromptData`, `MultipleChoiceOption`）に変更がないことを確認

## 15. レビュー履歴

| 日付 | ステージ | レビュー内容 | 指摘件数 |
|------|---------|-------------|---------|
| 2026-02-07 | Stage 1: 通常レビュー（設計原則） | OCP, KISS, SRP, DRY, YAGNI観点でのレビュー | Must Fix: 2, Should Fix: 1, Nice to Have: 4 |
| 2026-02-07 | Stage 2: 整合性レビュー | 行番号参照、コード不一致、動作記述不一致、テスト不一致の検証 | Must Fix: 2(うち1件は問題なし確認), Should Fix: 3, Nice to Have: 4 |
| 2026-02-07 | Stage 3: 影響分析レビュー | 影響範囲の網羅性、呼び出し元のoutputサイズ差異、副作用（DB保存内容変化）、デプロイ考慮事項の検証 | Must Fix: 1, Should Fix: 3, Nice to Have: 4 |
| 2026-02-07 | Stage 4: セキュリティレビュー | ReDoS、コマンドインジェクション、XSS、データ整合性、Auto-Yes偽陽性影響、スキャン範囲拡大安全性の検証 | Must Fix: 0, Should Fix: 2, Nice to Have: 6 |

## 16. 変更履歴

| 日付 | 変更内容 |
|------|---------|
| 2026-02-07 | 初版作成 |
| 2026-02-07 | Stage 1レビュー指摘事項を反映: テストケース修正（DR1-F001, DR1-F002）、偽陽性リスク分析の詳細化（DR1-F003）、将来の拡張ポイント注記（DR1-F004）、テストDRYノート（DR1-F005）、制約事項追加（DR1-F006, DR1-F007）、実装チェックリスト追加 |
| 2026-02-07 | Stage 2整合性レビュー指摘事項を反映: pollAutoYes()行番号修正（DR2-F001）、resolveAutoAnswer()行番号修正（DR2-F002）、型定義場所の明示（DR2-F003）、テスト期待値の正確性確認（DR2-F004）、オプション2のマッチ動作説明修正（DR2-F005）、空行挙動の注記追加（DR2-F006）、逆順スキャンステップ追加（DR2-F007）、テスト型安全性注記追加（DR2-F008）、テストコードimport注記追加（DR2-F009） |
| 2026-02-07 | Stage 3影響分析レビュー指摘事項を反映: detectPrompt()のoutput伝搬構造分析追加（DR3-F005）、UIラベル表示コンポーネント追加（DR3-F001）、status-detector.tsの15行制限説明拡充（DR3-F002）、cleanContent動作変化の分析追加（DR3-F007）、DB永続化の影響追記（DR3-F003）、PromptData型伝搬チェーン追加（DR3-F004）、デプロイ考慮事項セクション新設（DR3-F006）、回帰確認対象テストファイル追記（DR3-F008） |
| 2026-02-07 | Stage 4セキュリティレビュー指摘事項を反映: Auto-Yesコンテキストでの偽陽性影響分析追記（DR4-F002）、スキャン範囲拡大の安全性根拠追記（DR4-F006）、ReDoS技術的根拠追記（DR4-F001）、Auto-Yesと手動応答パスのセキュリティ境界明確化（DR4-F003）、継続行デバッグログの制約事項追加（DR4-F005）、requiresTextInput判定精度の制約事項追加（DR4-F008） |
