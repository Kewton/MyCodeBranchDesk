# Issue #256 影響範囲レビューレポート

**レビュー日**: 2026-02-13
**フォーカス**: 影響範囲レビュー
**ステージ**: 3（影響範囲レビュー 1回目）

## サマリー

| カテゴリ | 件数 |
|---------|------|
| Must Fix | 1 |
| Should Fix | 3 |
| Nice to Have | 2 |

---

## 影響伝播図

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
  |       +---> route.ts (L80: hasActivePrompt判定)
  |
  +---> route.ts (L94: promptData取得)
  |       |
  |       +---> API応答 -> PromptPanel.tsx / MobilePromptSheet.tsx
  |
  +---> response-poller.ts (L330, L490, L605: 3箇所)
  |       |
  |       +---> DB保存 (createMessage) + WebSocket配信 (broadcastMessage)
  |
  +---> auto-yes-manager.ts (L319: pollAutoYes内)
          |
          +---> auto-yes-resolver.ts (resolveAutoAnswer)
          |
          +---> tmux sendKeys / sendSpecialKeys [自動応答送信]
```

---

## Must Fix（必須対応）

### MF-1: Auto-Yes関連ファイルが影響範囲に未記載

**カテゴリ**: 破壊的変更
**場所**: Issue本文 > 影響範囲 > 関連ファイル（変更不要だが影響確認必要）

**問題**:
`isQuestionLikeLine()` の変更は Auto-Yes 機能の自動応答判定に直接波及するが、影響範囲セクションに `auto-yes-manager.ts` と `auto-yes-resolver.ts` が記載されていない。

**影響の詳細**:
- `auto-yes-manager.ts` L319 で `detectPrompt(cleanOutput, promptOptions)` が呼び出される
- プロンプト検出結果が true の場合、L328 で `resolveAutoAnswer(promptDetection.promptData)` が実行される
- `auto-yes-resolver.ts` は `multiple_choice` 型の場合、デフォルトオプションまたは最初のオプション番号を返す
- L336-398 で `sendKeys()` / `sendSpecialKeys()` によりtmuxセッションにキー入力が送信される
- **False Positive の場合**: 存在しないプロンプトに対してキー入力が送信され、CLIセッションの状態が壊れる

**証拠**:

```typescript
// auto-yes-manager.ts L317-319
const promptOptions = buildDetectPromptOptions(cliToolId);
const promptDetection = detectPrompt(cleanOutput, promptOptions);

// L328 - 検出結果に基づき自動応答
const answer = resolveAutoAnswer(promptDetection.promptData);
```

```typescript
// auto-yes-resolver.ts L23-35 - multiple_choice時の応答決定
if (promptData.type === 'multiple_choice') {
  const defaultOpt = promptData.options.find(o => o.isDefault);
  const target = defaultOpt ?? promptData.options[0];
  // ... target.number.toString() を返す
}
```

**推奨対応**:
影響範囲の「関連ファイル（変更不要だが影響確認必要）」テーブルに以下を追加する:

| ファイル | 関連 |
|---------|------|
| `src/lib/auto-yes-manager.ts` | Auto-Yes自動応答: detectPrompt()結果に基づくキー送信 |
| `src/lib/auto-yes-resolver.ts` | Auto-Yes応答決定: promptDataに基づく応答値の解決 |

---

## Should Fix（推奨対応）

### SF-1: 代替案A採用時の既存テストカバレッジ分析が不足

**カテゴリ**: テスト範囲
**場所**: 対策案 > パターンB対応

**問題**:
代替案A（`questionEndIndex` から上方N行走査でキーワードを探索）を採用した場合、`detectMultipleChoicePrompt()` 内の SEC-001b ガード（L514-529）周辺のロジック変更が必要となるが、既存テストへの影響分析が不足している。

**影響を受ける可能性がある既存テスト**:

1. **T11h-T11m（False Positive防止）**: 上方走査の範囲内にたまたまキーワードを含む行がある場合、False Positive が発生する可能性
   - 例: `Recommendations:` の上にたまたま `select` を含む行があった場合
2. **Issue #181 multiline option continuation テスト**: `isContinuationLine()` で走査を進めた後の `questionEndIndex` 位置が上方走査の起点となるため、走査範囲の計算に影響
3. **50-line window boundary テスト**: `questionEndIndex` の上方走査が `scanStart` 境界を超える場合のガード処理

**推奨対応**:
受入条件のテストセクションに以下を追加:
- 上方走査範囲内にキーワードを含む行がある場合のFalse Positiveテスト
- `questionEndIndex` が `scanStart` 付近にある場合の境界テスト
- `isContinuationLine()` でスキップされた行の直上に質問行がある場合のテスト

---

### SF-2: response-poller.ts の3箇所のdetectPrompt()呼び出しの影響パスが未分析

**カテゴリ**: 依存関係
**場所**: 影響範囲 > 関連ファイル

**問題**:
`response-poller.ts` 内で `detectPrompt()` が3箇所で呼び出されているが、影響範囲の記載は「プロンプト検出・DB保存」と簡潔すぎる。各呼び出し箇所での具体的な影響パスが分析されていない。

**3つの呼び出し箇所とその影響**:

| 箇所 | 行番号 | コンテキスト | False Positive時の影響 |
|------|--------|------------|----------------------|
| 1 | L330 | `extractResponse()` 内 Claude権限プロンプト早期検出 | 通常のCLI出力が `isComplete: true` で返却され、後続のクリーニング処理をスキップ |
| 2 | L490 | `extractResponse()` 末尾のインタラクティブプロンプト検出 | 同上 |
| 3 | L605 | `checkForResponse()` の完了後プロンプト検出 | DBに `messageType: 'prompt'` のゴーストメッセージ保存 + WebSocket配信 |

**特に重要な影響**: L605-626 の False Positive 時:
```typescript
// response-poller.ts L611-615
const message = createMessage(db, {
  worktreeId,
  role: 'assistant',
  content: promptDetection.rawContent || promptDetection.cleanContent,
  messageType: 'prompt',  // <-- ゴーストプロンプトとしてDB保存
  promptData: promptDetection.promptData,
  // ...
});
```
- DBに不正なプロンプトメッセージが保存される
- WebSocketでフロントエンドに配信される
- フロントエンドで PromptPanel/MobilePromptSheet が誤表示される
- `stopPolling()` が呼ばれてポーリングが停止し、実際のレスポンス取得が中断される

**推奨対応**:
影響範囲テーブルの `response-poller.ts` の記載を以下のように具体化する:

| ファイル | 関連 |
|---------|------|
| `src/lib/response-poller.ts` | プロンプト検出3箇所（L330, L490, L605）。False Positive時はDB保存・WebSocket配信・ポーリング停止に波及 |

---

### SF-3: route.ts のdetectPrompt()二重呼び出しパターンの影響

**カテゴリ**: 影響ファイル
**場所**: 影響範囲 > 関連ファイル

**問題**:
`current-output/route.ts` では `detectSessionStatus()` 経由（L80）と直接呼び出し（L94）の2箇所で `detectPrompt()` が実行される。この二重呼び出しは設計上許容されている（SF-001）が、影響範囲として両パスで `isQuestionLikeLine()` 変更が同一に波及する点が明記されていない。

**影響の具体的なパス**:

```
route.ts L80: detectSessionStatus(output, cliToolId)
  -> status-detector.ts L142: detectPrompt(cleanOutput, promptOptions)
    -> isQuestionLikeLine() [変更対象]
  -> statusResult.hasActivePrompt (L99: isPromptWaiting)

route.ts L94: detectPrompt(cleanOutput, promptOptions)
  -> isQuestionLikeLine() [変更対象]
  -> promptDetection.promptData (L126: API応答に含まれる)
```

- `isPromptWaiting` は `statusResult.hasActivePrompt` から取得（L99）
- `promptData` は `promptDetection.promptData` から取得（L126）
- 両方とも同一の `isQuestionLikeLine()` を使用するため、不整合リスクは低い
- ただし、変更によって `detectPrompt()` の処理時間が増加した場合、ポーリング間隔（2秒）内に二重呼び出しが完了するかの確認が必要

**推奨対応**:
影響範囲テーブルの `route.ts` の記載を「detectSessionStatus経由 + 直接呼び出しの二重パスで影響。isPromptWaitingとpromptDataの一貫性を確認」に更新する。

---

## Nice to Have（あれば良い）

### NTH-1: CLAUDE.md のモジュール説明更新

**カテゴリ**: ドキュメント更新
**場所**: CLAUDE.md

**問題**:
実装完了後、CLAUDE.md の `src/lib/prompt-detector.ts` の説明行に Issue #256 の変更概要を追記する必要がある。

**現在の記載**:
```
| `src/lib/prompt-detector.ts` | プロンプト検出ロジック（Issue #161: 2パス❯検出方式で誤検出防止、連番検証。Issue #193: DetectPromptOptions interface追加...。Issue #208: SEC-001b質問行妥当性検証追加、isQuestionLikeLine()による番号付きリスト誤検出防止。...） |
```

**推奨追記**: `Issue #256: isQuestionLikeLine()複数行質問対応・model選択プロンプト検出強化` を追加。

---

### NTH-2: auto-yes-manager.test.ts との統合テスト追加検討

**カテゴリ**: テスト範囲
**場所**: 受入条件 > テスト

**問題**:
既存の `auto-yes-manager.test.ts` には Layer 1 の thinking check テスト（Issue #161）が含まれている。`isQuestionLikeLine()` の変更後、Auto-Yes パスでの統合テストの追加を検討すると防御層の網羅性が向上する。

**検討すべきテストケース**:
- thinking check が効かない状態（thinkingインジケータなし）で、`isQuestionLikeLine()` の変更がFalse Positiveを防ぐ統合テスト
- model選択プロンプトが Auto-Yes で正しく自動応答されるテスト

---

## 影響範囲マトリクス

| ファイル | 変更要否 | 影響度 | False Positive時の影響 |
|---------|---------|--------|----------------------|
| `src/lib/prompt-detector.ts` | 変更必要 | -- | -- |
| `tests/unit/prompt-detector.test.ts` | 変更必要 | -- | -- |
| `src/lib/auto-yes-manager.ts` | 変更不要 | **高** | tmuxへの誤キー送信 |
| `src/lib/auto-yes-resolver.ts` | 変更不要 | **高** | 誤応答値の決定 |
| `src/lib/response-poller.ts` | 変更不要 | **中** | DBゴーストメッセージ + ポーリング停止 |
| `src/lib/status-detector.ts` | 変更不要 | **中** | ステータス誤判定（waiting） |
| `src/app/api/.../route.ts` | 変更不要 | **中** | API応答にゴーストpromptData |
| `src/components/worktree/PromptPanel.tsx` | 変更不要 | **低** | 不正promptDataの表示 |
| `src/components/mobile/MobilePromptSheet.tsx` | 変更不要 | **低** | 不正promptDataの表示 |
| `CLAUDE.md` | 更新推奨 | **低** | -- |

---

## 破壊的変更の有無

**破壊的変更なし**。`isQuestionLikeLine()` は `prompt-detector.ts` 内のモジュールプライベート関数であり、エクスポートされていない。変更は `detectPrompt()` のエクスポート関数の戻り値（`isPrompt` の判定結果）を通じて間接的に影響する。APIの型定義（`PromptDetectionResult`、`PromptData`）に変更はない。

ただし、**False Positive の増加は実質的な破壊的変更として機能する**。特に Auto-Yes 機能が有効な場合、誤検出がCLIセッションへの誤操作に直結するため、False Positive 防止テスト（T11h-T11m）の全パスが変更の最低条件である。

---

## 参照ファイル

### コード
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/prompt-detector.ts`: 変更対象（isQuestionLikeLine() L315-332、isContinuationLine() L381-395、SEC-001b L514-529）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/auto-yes-manager.ts`: 間接影響（detectPrompt() L319、sendKeys/sendSpecialKeys L336-398）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/auto-yes-resolver.ts`: 間接影響（resolveAutoAnswer() L18-39）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/response-poller.ts`: 間接影響（detectPrompt() L330, L490, L605）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/status-detector.ts`: 間接影響（detectPrompt() L142）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/app/api/worktrees/[id]/current-output/route.ts`: 間接影響（二重detectPrompt() L80, L94）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/src/lib/cli-patterns.ts`: 間接影響（buildDetectPromptOptions() L267-274）
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/tests/unit/prompt-detector.test.ts`: テスト追加対象（T11h-T11m: L1346-1387が回帰テストの要）

### ドキュメント
- `/Users/maenokota/share/work/github_kewton/commandmate-issue-256/CLAUDE.md`: モジュール説明の更新対象
