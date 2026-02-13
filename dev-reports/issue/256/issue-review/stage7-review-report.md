# Issue #256 影響範囲レビューレポート（2回目）

**レビュー日**: 2026-02-13
**フォーカス**: 影響範囲レビュー
**ステージ**: 7（影響範囲レビュー 2回目）

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 0 |
| Should Fix | 1 |
| Nice to Have | 1 |

---

## Stage 3 指摘事項の対応状況

Stage 3（影響範囲レビュー 1回目）で指摘した全6件の対応状況を確認した。

| ID | カテゴリ | 指摘概要 | ステータス |
|----|---------|---------|-----------|
| MF-1 | 破壊的変更 | Auto-Yes関連ファイルが影響範囲に未記載 | **対応済み** |
| SF-1 | テスト範囲 | 代替案Aの既存テスト影響分析不足 | **対応済み** |
| SF-2 | 依存関係 | response-poller.tsの影響パス詳細不足 | **対応済み** |
| SF-3 | 影響ファイル | route.tsの二重detectPrompt()呼び出し詳細不足 | **対応済み** |
| NTH-1 | ドキュメント更新 | CLAUDE.mdモジュール説明の更新タスク | **対応済み** |
| NTH-2 | テスト範囲 | Layer 1統合テスト追加検討 | **対応済み** |

### 各対応の検証詳細

**MF-1（Auto-Yes関連ファイル）**: 影響範囲テーブルに `auto-yes-manager.ts`（影響度: 高）と `auto-yes-resolver.ts`（影響度: 高）が追加されている。False Positiveによる自動応答誤送信リスクがtmuxキー送信の行番号レベルで具体的に記載されている。受入条件に「Auto-Yes連携確認」セクションが新設され、3項目のチェックリストが定義されている。

**SF-1（代替案Aのテスト影響分析）**: 対策案に「代替案A採用時の既存テスト影響分析」サブセクションが追加されている。T11h-T11m、Issue #181 multiline option continuation、50-line window boundaryの3つの影響分析が記載され、受入条件にも対応するテストケースセクションが新設されている。

**SF-2（response-poller.ts影響パス）**: 影響範囲テーブルのresponse-poller.tsの説明が3箇所の呼び出し位置（L330, L490, L605）とFalse Positive時の影響パス（DB保存、WebSocket配信、PromptPanel誤表示）を具体的に記載している。

**SF-3（route.ts二重呼び出し）**: 影響範囲テーブルにL80（detectSessionStatus経由）とL94（直接呼び出し）の二重パス詳細と、buildDetectPromptOptions()による同一options使用、API応答のisPromptWaiting/promptDataへの影響が記載されている。

**NTH-1（CLAUDE.md更新）**: 「実装完了時の追加作業」セクションが新設され、CLAUDE.mdの更新タスクが明記されている。

**NTH-2（Layer 1統合テスト）**: Auto-Yes連携確認セクションにthinking状態のLayer 1確認テスト観点が追加されている。

---

## 影響伝播図（更新版）

Stage 3で作成した影響伝播図に、新規発見の `prompt-response/route.ts` を追加した。

```
isQuestionLikeLine() [変更対象]
  |
  v
detectMultipleChoicePrompt() [prompt-detector.ts]
  |
  v
detectPrompt() [prompt-detector.ts] ... エクスポート関数
  |
  +---> status-detector.ts (L142: detectSessionStatus内)
  |       |
  |       +---> current-output/route.ts (L80: hasActivePrompt判定)
  |
  +---> current-output/route.ts (L94: promptData取得)
  |       |
  |       +---> API応答 -> PromptPanel.tsx / MobilePromptSheet.tsx
  |
  +---> response-poller.ts (L330, L490, L605: 3箇所)
  |       |
  |       +---> DB保存 (createMessage) + WebSocket配信 (broadcastMessage)
  |
  +---> auto-yes-manager.ts (L319: pollAutoYes内)
  |       |
  |       +---> auto-yes-resolver.ts (resolveAutoAnswer)
  |       |
  |       +---> tmux sendKeys / sendSpecialKeys [自動応答送信]
  |
  +---> prompt-response/route.ts (L77: プロンプト再検証) [新規発見]
          |
          +---> tmux sendKeys / sendSpecialKeys [ユーザー手動応答送信]
```

---

## Should Fix（推奨対応）

### SF-1: prompt-response/route.ts が影響範囲テーブルに未記載

**カテゴリ**: 影響ファイル
**場所**: Issue本文 > 影響範囲 > 関連ファイル（変更不要だが影響確認必要）

**問題**:
`src/app/api/worktrees/[id]/prompt-response/route.ts` の L77 で `detectPrompt()` が呼び出されているが、Issue本文の影響範囲テーブルに記載されていない。このAPIエンドポイントは、ユーザーがPromptPanelから回答を送信する際に呼ばれ、送信直前にプロンプトがまだアクティブかを再検証する役割を持つ（Issue #161: レースコンディション防止）。

**影響パス**:

```typescript
// prompt-response/route.ts L72-85
let promptCheck: PromptDetectionResult | null = null;
try {
  const currentOutput = await captureSessionOutput(params.id, cliToolId, 5000);
  const cleanOutput = stripAnsi(currentOutput);
  const promptOptions = buildDetectPromptOptions(cliToolId);
  promptCheck = detectPrompt(cleanOutput, promptOptions);  // <-- isQuestionLikeLine()変更の影響

  if (!promptCheck.isPrompt) {
    return NextResponse.json({
      success: false,
      reason: 'prompt_no_longer_active',
      answer,
    });
  }
} catch {
  // capture失敗時はガードをスキップして送信を続行
}
```

- L77 の `detectPrompt()` は `isQuestionLikeLine()` の変更の影響を受ける
- L96-148 で `promptCheck.promptData.type === 'multiple_choice'` の判定に基づき、Claude CodeのArrow/Enter方式のキー送信が行われる
- **True Positive 増加（本Issueの意図）の場合**: これまでプロンプトが検出されず `prompt_no_longer_active` で拒否されていたケースが、正しくプロンプトとして再検証されるようになる。ポジティブな影響
- **False Positive 増加の場合**: プロンプトが実際には消失しているにもかかわらず、再検証が true を返し、ガードを通過してキー送信が実行されるリスクがある

**影響度**: 低。理由: (1) ユーザーの手動操作が前提であり、auto-yes-manager.tsのような自動ポーリングではないため、リスク発現頻度が低い。(2) プロンプトが消失している場合は `captureSessionOutput()` の時点で出力内容が変わっており、`detectPrompt()` が false を返す可能性が高い。(3) catch節で capture 失敗時にはガードをスキップするため、最悪のケースでも既存の動作（ガードなし送信）にフォールバックする。

**推奨対応**:
影響範囲テーブルに以下を追加する:

| ファイル | 関連 | 影響度 |
|---------|------|--------|
| `src/app/api/worktrees/[id]/prompt-response/route.ts` | L77の`detectPrompt()`呼び出し。プロンプト送信前の再検証（Issue #161レースコンディション防止）。True Positive増加はポジティブ。False Positive時はガード通過リスクあるが、手動操作前提のため影響は限定的 | **低** |

---

## Nice to Have（あれば良い）

### NTH-1: 影響範囲テーブルでの影響方向性の明示

**カテゴリ**: テスト範囲
**場所**: 影響範囲 > 関連ファイル

**問題**:
本Issue #256の修正は「True Positiveを増加させる（パターンA/Bを検出可能にする）」方向の変更であり、False Positiveの増加は意図していない。しかし、影響範囲テーブルの各ファイルの説明では、False Positive時の影響のみが記載されており、正常ケース（True Positive増加）での影響が明示されていない。

**推奨対応**:
影響範囲テーブルに一文の前置きとして「本修正はTrue Positive増加（検出精度向上）を意図しており、以下のFalse Positive影響は既存テスト（T11h-T11m）と新規テストで防止される」等のコンテキストを追加すると、レビューアーの理解が向上する。

ただし、受入条件でFalse Positive防止テスト（T11h-T11m全パス、URLパラメータ誤検出テスト、Auto-Yes連携確認等）が既に網羅的に定義されているため、影響の方向性は文脈から読み取れる。あくまで読みやすさの改善提案であり、実装上の影響はない。

---

## 影響範囲マトリクス（最終版）

Stage 3の影響範囲マトリクスに新規発見の `prompt-response/route.ts` を追加した最終版。

| ファイル | 変更要否 | 影響度 | False Positive時の影響 |
|---------|---------|--------|----------------------|
| `src/lib/prompt-detector.ts` | 変更必要 | -- | -- |
| `tests/unit/prompt-detector.test.ts` | 変更必要 | -- | -- |
| `src/lib/auto-yes-manager.ts` | 変更不要 | **高** | tmuxへの誤キー送信 |
| `src/lib/auto-yes-resolver.ts` | 変更不要 | **高** | 誤応答値の決定 |
| `src/lib/response-poller.ts` | 変更不要 | **中** | DBゴーストメッセージ + ポーリング停止 |
| `src/lib/status-detector.ts` | 変更不要 | **中** | ステータス誤判定（waiting） |
| `src/app/api/.../current-output/route.ts` | 変更不要 | **中** | API応答にゴーストpromptData |
| `src/app/api/.../prompt-response/route.ts` | 変更不要 | **低** | プロンプト再検証ガード通過 [新規] |
| `src/components/worktree/PromptPanel.tsx` | 変更不要 | **低** | 不正promptDataの表示 |
| `src/components/mobile/MobilePromptSheet.tsx` | 変更不要 | **低** | 不正promptDataの表示 |
| `CLAUDE.md` | 更新推奨 | **低** | -- |

---

## 破壊的変更の有無

**破壊的変更なし**。Stage 3のレビューでの判定と同一。`isQuestionLikeLine()` はモジュールプライベート関数であり、エクスポートされていない。API型定義への変更もない。

False Positive防止の網羅性については、受入条件に以下のセーフティネットが設けられている:
- T11h-T11m全パス（既存False Positive防止テスト）
- URLパラメータ行の誤検出テスト
- Auto-Yes連携確認（3項目）
- 代替案A/B採用時の追加テスト

---

## 総合評価

**品質**: 高
**実装準備状態**: 実装着手可能

Stage 3で指摘した全6件はすべて適切に反映されている。影響範囲の分析は `detectPrompt()` の全呼び出し箇所を網羅しており（prompt-response/route.tsを除く）、影響伝播パスが行番号レベルで具体化されている。新規のShould Fix 1件（prompt-response/route.ts）は影響度が低い追加ファイルの記載漏れであり、Issueの品質を大きく損なうものではない。

全レビューサイクル（Stage 1~7）を通じて、本Issueは以下の品質基準を満たしている:
- 根本原因分析: 仮説検証で全6件Confirmed
- 対策案: 代替案A/Bの比較検討、推奨案の明示、False Positiveリスク評価
- 影響範囲: 11ファイルの影響パス分析（変更対象2 + 間接影響8 + ドキュメント1）
- 受入条件: 8セクション・27項目以上のチェックリスト
- テスト設計: 回帰テスト + 新規パターン + False Positive防止 + 統合テスト観点

---

## 参照ファイル

### コード
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/app/api/worktrees/[id]/prompt-response/route.ts`: 新規指摘（detectPrompt() L77のプロンプト再検証パス）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/prompt-detector.ts`: 変更対象（isQuestionLikeLine() L315-332、SEC-001b L514-529）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/auto-yes-manager.ts`: Stage 3 MF-1で指摘し反映済み（detectPrompt() L319）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/auto-yes-resolver.ts`: Stage 3 MF-1で指摘し反映済み（resolveAutoAnswer() L18-39）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/response-poller.ts`: Stage 3 SF-2で指摘し反映済み（detectPrompt() L330, L490, L605）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/status-detector.ts`: Stage 3 SF-3で指摘し反映済み（detectPrompt() L142）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/app/api/worktrees/[id]/current-output/route.ts`: Stage 3 SF-3で指摘し反映済み（二重detectPrompt() L80, L94）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/tests/unit/prompt-detector.test.ts`: テスト追加対象（T11h-T11m: L1346-1387が回帰テストの要）

### ドキュメント
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/CLAUDE.md`: モジュール説明の更新対象（実装完了時タスクとして記載済み）
