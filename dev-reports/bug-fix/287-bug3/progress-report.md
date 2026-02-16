# 進捗レポート - Bug Fix 287-bug3

## 概要

**Issue**: #287 - Worktree プロンプト検出の誤検出バグ (Bug3)
**Bug ID**: 287-bug3
**ブランチ**: feature/287-worktree
**報告日時**: 2026-02-16 19:37:45
**ステータス**: 完了 (全フェーズ成功)

---

## 不具合概要

`prompt-detector.ts` の `detectMultipleChoicePrompt()` が Claude の過去の会話テキスト内の番号付きリストをアクティブな `multiple_choice` プロンプトとして誤検出する。セッションがアイドル状態でも `isPromptWaiting: true` が返され、UIに偽の「Claudeからの確認」ダイアログが表示される。

**根本原因**: Pass 2 逆方向スキャン (L651-701) で、`collectedOptions.length === 0` の場合に非オプション行をスキップし、過去の番号付きリストまで到達する。`❯` (U+276F) アイドルプロンプトがバリアとして機能していなかった。

**重大度**: High - Auto-Yes モードでも偽プロンプトに自動応答を試み、不要な入力が送信される可能性がある。

---

## フェーズ別結果

### Phase 1: 不具合調査
**ステータス**: 完了

- **エラー分類**: LogicError (missing scan barrier)
- **再現確認**: 成功
- **影響ファイル**: `src/lib/prompt-detector.ts`
- **根本原因**: Pass 2 逆方向スキャンに `❯` バリアが欠落
  - `collectedOptions.length === 0` 時、非オプション行 (`❯` アイドルプロンプト、`❯ <user-input>`) が完全にスキップされる
  - 50行ウィンドウ内の古い番号付きリストまでスキャンが到達し、誤検出が発生
  - `requireDefaultIndicator=false` (Claude向け) により Pass 1 の `❯` ゲートが無効化されており、主要な防御が効いていなかった

---

### Phase 2: 対策案提示
**ステータス**: 完了

- **選択した対策**: Pass 2 逆方向スキャンに `❯` バリア追加
- **方針**: `collectedOptions.length === 0` かつ行が `❯` (U+276F) で始まる (DEFAULT_OPTION_PATTERN に非マッチ) 場合、`noPromptResult` を返してスキャン停止
- **リスク**: Low - DEFAULT_OPTION_PATTERN は `❯ + 番号.テキスト` 形式のみマッチするため、アイドルプロンプトやユーザー入力行は非マッチ

---

### Phase 3: 作業計画
**ステータス**: 完了

- **修正範囲**: 最小変更 (1ファイル修正 + テスト追加)
- **修正対象**: `src/lib/prompt-detector.ts` (バリアロジック追加)
- **テスト対象**: `tests/unit/prompt-detector.test.ts` (バリアテストケース追加)

---

### Phase 4: TDD修正
**ステータス**: 成功

- **テスト結果**: 3439/3439 passed (0 failed)
- **新規テスト**: 4件追加
- **静的解析**: ESLint 0 errors, TypeScript 0 errors

**変更ファイル**:
- `src/lib/prompt-detector.ts` (L672-680: バリアロジック追加、+10行)
- `tests/unit/prompt-detector.test.ts` (L2074-2145: 4テストケース追加、+73行)

**新規テストケース**:
1. should NOT detect numbered list after user typed at prompt as multiple choice
2. should NOT detect numbered list above idle prompt as multiple choice
3. should still detect active prompt without marker (リグレッション防止)
4. should still detect active prompt with default indicator (リグレッション防止)

**コミット**:
- `32c4446`: fix(#287): add user input prompt barrier to prevent false positive detection

---

### Phase 5: 受入テスト
**ステータス**: 全パス

| シナリオ | 結果 |
|---------|------|
| prompt-detector.test.ts 全165テストパス | PASSED |
| TypeScript型チェック 0エラー | PASSED |
| ESLint 0エラー/警告 | PASSED |
| ビルド成功 | PASSED |
| バリアロジック存在確認 (L672-680) | PASSED |
| auto-yes-manager.test.ts 全53テストパス | PASSED |
| 全ユニットテスト (3439件) パス | PASSED |

**受入基準検証**:

| 受入基準 | 検証結果 |
|---------|---------|
| 過去の会話テキスト内の番号付きリストが誤検出されないこと | 検証済み |
| アクティブな multiple_choice プロンプトが正常に検出されること | 検証済み |
| requireDefaultIndicator=false (Claude) と true (その他) の両方で動作すること | 検証済み |
| 既存テスト全165件がパスすること | 検証済み |
| 新規テストケース4件が追加されていること | 検証済み |
| ESLint/TypeScript エラーが 0 件であること | 検証済み |
| ビルドが成功すること | 検証済み |

---

## 総合品質メトリクス

| 指標 | 値 |
|------|-----|
| ユニットテスト合計 | 3439 passed / 0 failed |
| prompt-detector テスト | 165 passed (4件新規追加) |
| ESLint エラー | 0件 |
| TypeScript エラー | 0件 |
| ビルド | 成功 |
| 受入テストシナリオ | 7/7 passed |
| 受入基準 | 7/7 verified |

---

## 修正内容サマリー

### 変更差分 (src/lib/prompt-detector.ts L672-680)

```typescript
// [Issue #287 Bug3] User input prompt barrier:
// When no options have been collected yet and the line starts with ❯ (U+276F)
// but did NOT match DEFAULT_OPTION_PATTERN above, this line is a Claude Code
// user input prompt (e.g., "❯ 1", "❯ /command") or idle prompt ("❯").
// Anything above this line in the scrollback is historical conversation text,
// not an active prompt. Stop scanning to prevent false positives.
if (collectedOptions.length === 0 && line.startsWith('\u276F')) {
  return noPromptResult(output);
}
```

**変更規模**: 2ファイル, +83行 (本体+10行, テスト+73行)

---

## ブロッカー

なし。全フェーズが成功し、全受入基準を満たしている。

---

## 次のステップ

1. **Bug Fix 287-bug3 完了** - 全フェーズが成功し、品質基準を満たしている
2. **他のバグ修正との統合確認** - Bug1, Bug2 の修正と合わせて、Issue #287 全体の動作確認
3. **PR作成/更新** - Issue #287 の全修正を含むPRの作成またはレビュー依頼
4. **マージ後のデプロイ計画** - mainブランチへのマージ準備

---

## 備考

- 修正は最小限の変更 (10行のロジック追加) で根本原因を解消
- 4件のテストケースで誤検出防止とリグレッション防止の両方をカバー
- 既存の3435テストに影響なし (全パス)
- Issue #287 で報告された事象の真の原因 (Bug3) が修正完了

**Bug Fix 287-bug3 の修正が完了しました。**
