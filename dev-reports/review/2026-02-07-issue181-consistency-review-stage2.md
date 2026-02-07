# Architecture Review Report: Issue #181 - Stage 2 整合性レビュー

## Executive Summary

| 項目 | 値 |
|------|-----|
| **Issue** | #181 - fix: 複数行オプションを含むmultiple choiceプロンプト検出修正 |
| **レビュー種別** | 整合性 (Consistency) |
| **ステージ** | Stage 2 |
| **ステータス** | conditionally_approved |
| **スコア** | 4/5 |
| **レビュー日** | 2026-02-07 |

設計方針書は全体的に高い整合性を維持している。設計書と実際のコードベースの間で関数名、変数名、パターン定義、型構造が正確に一致しており、Issue #161設計書との用語の一貫性も保たれている。Must Fix 1件、Should Fix 5件、Consider 4件の指摘がある。Must Fix項目はテストコードの前提条件の明示に関するものであり、設計の根本的な問題ではない。

---

## 1. 設計方針書と実際のコードベースの整合性

### 1-1. 関数名・変数名の整合性

| 設計書の参照 | 実際のコード | 整合性 |
|-------------|------------|--------|
| `detectMultipleChoicePrompt()` | `src/lib/prompt-detector.ts` L233 | 一致 |
| `detectPrompt()` | `src/lib/prompt-detector.ts` L44 | 一致 |
| `DEFAULT_OPTION_PATTERN` | `src/lib/prompt-detector.ts` L182 | 一致 |
| `NORMAL_OPTION_PATTERN` | `src/lib/prompt-detector.ts` L189 | 一致 |
| `isConsecutiveFromOne()` | `src/lib/prompt-detector.ts` L204 | 一致 |
| `resolveAutoAnswer()` | `src/lib/auto-yes-resolver.ts` L18 | 一致 |
| `isContinuationLine` (inline) | `src/lib/prompt-detector.ts` L295 | 一致（ローカル変数） |
| `hasLeadingSpaces` | `src/lib/prompt-detector.ts` L293 | 一致 |
| `isShortFragment` | `src/lib/prompt-detector.ts` L294 | 一致 |

### 1-2. 正規表現パターンの整合性

| 設計書の記載パターン | 実際のコード | 整合性 |
|-------------------|------------|--------|
| `/^\s*\u276F\s*(\d+)\.\s*(.+)$/` | `src/lib/prompt-detector.ts` L182 | 一致 |
| `/^\s*(\d+)\.\s*(.+)$/` | `src/lib/prompt-detector.ts` L189 | 一致 |
| `/^\s{2,}[^\d]/` (hasLeadingSpaces) | `src/lib/prompt-detector.ts` L293 | 一致 |
| `/^\s*\d+\./` (hasLeadingSpaces除外) | `src/lib/prompt-detector.ts` L293 | 一致 |

### 1-3. 修正前コードの照合

設計書セクション4-2「修正前の継続行条件」のコードブロック:

```typescript
const hasLeadingSpaces = rawLine.match(/^\s{2,}[^\d]/) && !rawLine.match(/^\s*\d+\./);
const isShortFragment = line.length < 5 && !line.endsWith('?');
const isContinuationLine = hasLeadingSpaces || isShortFragment;
```

実際の `src/lib/prompt-detector.ts` L293-295:

```typescript
const hasLeadingSpaces = rawLine.match(/^\s{2,}[^\d]/) && !rawLine.match(/^\s*\d+\./);
const isShortFragment = line.length < 5 && !line.endsWith('?');
const isContinuationLine = hasLeadingSpaces || isShortFragment;
```

**判定**: 完全一致。

### 1-4. 型構造の整合性

設計書セクション2-3で「型変更なし」と宣言されている。検証結果:

- `PromptDetectionResult`: `src/lib/prompt-detector.ts` L14-21 -- 変更不要を確認
- `PromptData`: `src/types/models.ts` L176 -- Union型、変更不要を確認
- `MultipleChoicePromptData`: `src/types/models.ts` L167-171 -- 変更不要を確認
- `MultipleChoiceOption`: `src/types/models.ts` L153-162 -- `number`, `label`, `isDefault`, `requiresTextInput` フィールド全て存在を確認

**判定**: 整合性あり。

### 1-5. ガード条件の省略 [S2-002]

設計書セクション4-2の修正前・修正後コード例では、`isContinuationLine` の評価が行われるコンテキスト（`options.length > 0 && line && !line.match(/^[-─]+$/)`）が省略されている。実際のコード L288 では:

```typescript
if (options.length > 0 && line && !line.match(/^[-─]+$/)) {
```

このガード条件はセクション5-2の偽陽性リスク分析で「`options.length > 0` の場合のみ評価される」と記載されており、設計書の記述自体は正しい。しかし、コード例から省略されていることで、読者が修正箇所の正確な文脈を把握しにくい。

---

## 2. 設計方針書とIssue #181記載内容の整合性

### 2-1. 問題の記述

設計書セクション1-2の再現シナリオは、Issue #181のタイトル「複数行オプションを含むmultiple choiceプロンプトが検出されない」と正確に対応している。ターミナル幅で折り返されるオプションテキストの具体例が示されており、問題の根本原因（逆順スキャンが継続行で中断される）が明確に分析されている。

### 2-2. 修正方針の対応

設計書の修正方針は以下の点でIssue #181の要件を満たしている:

1. **継続行検出の拡張**: パス文字列の折り返し行を継続行として認識する条件を追加
2. **既存動作の維持**: `||` による条件の加算的追加で、既存の `hasLeadingSpaces` と `isShortFragment` に影響しない
3. **Auto-Yes動作への影響なし**: `resolveAutoAnswer()` が `option.number` を使用する点が正確に認識されている

**判定**: 整合性あり。

---

## 3. 設計方針書内の各セクション間の整合性

### 3-1. 修正案(セクション4) <-> テスト設計(セクション6)

| 修正項目 | テストカバレッジ | 整合性 |
|---------|---------------|--------|
| isPathContinuation `/^[\/~]/` | セクション6-3-1 正常系テスト | 整合 |
| isPathContinuation `/^[a-zA-Z0-9_-]+$/` | セクション6-3-4 境界値テスト | 整合（ただし後述の懸念あり） |
| `line.length >= 2` 最小長チェック (SF-001) | セクション6-3-4 テスト2 | 部分的不整合 [S2-003] |
| `isContinuationLine()` 関数抽出 (SF-002) | テスト設計には直接反映なし | 整合（実装タスクとして記載） |
| ラベル非連結 | セクション6-3-3 | 整合 |

### 3-2. テスト設計(セクション6) <-> 受入条件(セクション11)

受入条件のチェックリストに含まれる項目:

| 受入条件 | テストセクション | 整合性 |
|---------|----------------|--------|
| 複数行プロンプト検出 | 6-3-1 | 整合 |
| Auto-Yes動作 | 記載あり（resolveAutoAnswer参照） | 整合（テストは暗黙的） |
| UI表示 | 記載あり（型構造変更なし） | 整合 |
| 退行テスト | 既存テスト | 整合 |
| isContinuationLine関数抽出 (SF-002) | 10-1 タスク1 | 整合 |
| 最小長チェック (SF-001) | 6-3-4 | 整合 |
| 英単語境界値テスト (C-003) | 6-3-4 | 整合 |

### 3-3. SF-001/SF-002/SF-003 の反映追跡

| 指摘ID | セクション4-2 | セクション5-2 | セクション9-1 | セクション10-1 | セクション11 | セクション15 |
|--------|-------------|-------------|-------------|--------------|-------------|-------------|
| SF-001 | 反映済 | 反映済 | 反映済 | 反映済 | 反映済 | 反映済 |
| SF-002 | 反映済 | N/A | 反映済 | 反映済 | 反映済 | 反映済 |
| SF-003 | N/A | N/A | セクション9-4に記載 | 反映済 | N/A（将来） | 反映済 |

**判定**: 全指摘が一貫して各セクションに反映されている。

---

## 4. 既存設計書（Issue #161等）との整合性

### 4-1. 2パス検出方式の参照

設計書セクション4-1で参照している「2パス検出方式」は Issue #161 設計書セクション3.1で定義されており、以下の点で正確に一致:

- Pass 1: 50行ウィンドウ内で `DEFAULT_OPTION_PATTERN`（❯付き）をスキャン
- Pass 2: ❯が確認された場合のみ `DEFAULT_OPTION_PATTERN` + `NORMAL_OPTION_PATTERN` で収集
- 逆順スキャン構造

### 4-2. 多層防御のLayer番号

| Layer | Issue #161 設計書 | Issue #181 設計書 | 整合性 |
|-------|-----------------|-----------------|--------|
| Layer 1 | thinking状態チェック（呼び出し元） | セクション4-1テーブルに記載 | 一致 |
| Layer 2 | 2パス❯検出 | 「逆順スキャン」として修正対象 | 一致 |
| Layer 3 | 連番検証 | セクション4-1テーブルに記載 | 一致 |
| Layer 4 | options >= 2 && hasDefault | セクション4-1テーブルに記載 | 一致 |

### 4-3. パターン定義の一致

| パターン | Issue #161 | Issue #181 | 実際のコード | 整合性 |
|---------|-----------|-----------|------------|--------|
| DEFAULT_OPTION_PATTERN | `/^\s*❯\s*(\d+)\.\s*(.+)$/` | 参照のみ | L182 一致 | 整合 |
| NORMAL_OPTION_PATTERN | `/^\s*(\d+)\.\s*(.+)$/` | 参照のみ | L189 一致 | 整合 |

**判定**: Issue #161との整合性は高い。

---

## 5. テストケースの期待値と設計の整合性

### 5-1. セクション6-3-1: 正常系テスト

期待値の検証:

- `options.length === 3`: 設計上、`❯ 1. Yes` + `2. Yes, and don't...` + `3. No` の3オプション -- 整合
- `options[0].label === 'Yes'`: DEFAULT_OPTION_PATTERN のキャプチャグループ2 -- 整合
- `options[0].isDefault === true`: ❯付き行 -- 整合
- `options[1].label === "Yes, and don't ask again for curl and python3 commands in"`: 折り返し前の部分のみ -- 整合（ラベル非連結設計と一致）
- `options[2].label === 'No'`: NORMAL_OPTION_PATTERN -- 整合

### 5-2. セクション6-3-4 テスト2: SF-001効果検証 [S2-003]

入力: `❯ 1. Option A` + `Y` + `  2. Option B`

期待値: `options.length === 2`

**問題**: `Y` は1文字の行であり、`line.length < 5 && !line.endsWith('?')` が true となるため、**既存の** `isShortFragment` 条件で継続行としてスキップされる。SF-001 の `line.length >= 2` チェック（`isPathContinuation` 内）の有無にかかわらず、この行は isShortFragment で捕捉される。このテストは SF-001 の効果を単独で検証していない。

テスト自体は正しい結果を期待しており、テストとして壊れることはないが、SF-001 の「1文字行がisPathContinuationにマッチしない」ことを直接証明するテストとしては不十分である。

### 5-3. セクション6-3-2: 偽陽性テスト

入力: パス行を含む yes/no プロンプト

期待値: `type === 'yes_no'`

**検証**: `detectMultipleChoicePrompt` は ❯ インジケーターがない出力に対して Pass 1 で `isPrompt: false` を返す。その後 Pattern 1 の `(y/n)` パターンがマッチする。整合性あり。

### 5-4. isMultipleChoicePrompt 型ガードの前提 [S2-001]

設計書のテストコード例で使用される `isMultipleChoicePrompt()` 関数は `src/lib/prompt-detector.ts` からエクスポートされておらず、`tests/unit/prompt-detector.test.ts` のローカル定義（L11-13）として存在する。設計書のテストコード例はこのローカル定義を暗黙的に前提としているが、明示されていない。

---

## 6. リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|-------|---------|-----------|
| 技術的リスク | SF-001のテスト検証精度不足により、isPathContinuationの1文字行除外が別の条件でカバーされていることが見落とされる | Low | Low | P3 |
| 技術的リスク | テストコード例の型ガード前提条件不明確により実装時に混乱 | Medium | Medium | P2 |
| 設計整合性リスク | ガード条件（options.length > 0）の省略による文脈不足 | Low | Low | P3 |
| 設計整合性リスク | prompt-response/route.ts の影響スコープ図での可視性 | Low | Low | P3 |

---

## 7. 改善推奨事項

### 7-1. 必須改善項目 (Must Fix): 1件

**[S2-001] テストコードの前提条件明示**

設計書セクション6-3-1, 6-3-3のテストコードで使用される `isMultipleChoicePrompt` 型ガードが、テストファイル内のローカル定義であることを明記する。実装者がテストコードをそのまま使用した際にコンパイルエラーが発生する可能性を排除する。

### 7-2. 推奨改善項目 (Should Fix): 5件

1. **[S2-002]** セクション4-2の修正後コード例に `options.length > 0` ガード条件のコンテキストを追加
2. **[S2-003]** セクション6-3-4テスト2にSF-001の効果検証の限界を注記するか、より適切なテスト入力に変更
3. **[S2-004]** セクション2-2のmermaid図のノードラベルとファイルパスの対応関係を明確化
4. **[S2-005]** セクション4-2の `isContinuationLine()` のJSDocに rawLine/line パラメータの定義を追記
5. **[S2-006]** セクション4-1でLayer 1がIssue #181の変更スコープ外であることを注記

### 7-3. 検討事項 (Consider): 4件

1. **[C-001]** テストケースでの `Esc to cancel` フッター行の有無の一貫性検証
2. **[C-002]** セクション11受入条件へのラベル非連結検証の明示的追加
3. **[C-003]** セクション5-3の「直前のオプション」表現を逆順スキャンコンテキストに合わせて修正
4. **[C-004]** claude-poller.ts のdetectPrompt呼び出し箇所の正確な把握

---

## 8. 整合性評価サマリー

| 観点 | スコア | コメント |
|------|--------|---------|
| 設計書 vs コードベース | 4/5 | 関数名・パターン正確。ガード条件省略とパラメータ定義の不足が軽微な課題 |
| 設計書 vs Issue #181 | 5/5 | 問題記述、根本原因分析、修正方針が完全に一致 |
| セクション間整合性 | 4/5 | SF-001/002/003の反映は一貫。テストケース6-3-4のSF-001検証精度が軽微な課題 |
| Issue #161設計書との整合性 | 5/5 | 用語、Layer番号、パターン定義が全て正確 |
| テスト期待値 vs 設計 | 4/5 | 大部分整合。isMultipleChoicePrompt前提条件とSF-001テスト精度に課題 |

---

## 9. 承認ステータス

**conditionally_approved** -- Must Fix 1件（テスト前提条件の明示）の対応を条件として承認する。設計の根本的な整合性は高く、Must Fix項目は設計書の記述追加のみで解決可能である。

---

*Generated by architecture-review-agent (Stage 2: 整合性レビュー)*
*Reviewed files: 15 files across design documents, source code, and test files*
