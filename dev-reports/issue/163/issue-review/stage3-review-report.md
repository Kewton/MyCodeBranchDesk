# Issue #163 影響範囲レビュー報告書

## Stage 3: 影響範囲レビュー（1回目）

**レビュー日**: 2026-02-06
**対象Issue**: #163 長いメッセージの場合、メッセージを送信してもclaude側で処理が開始されない

---

## 1. 概要

Issue #163は、複数行メッセージ送信時にClaude CLIが「Pasted text」として認識してしまう問題を解決するため、tmuxの`load-buffer/paste-buffer`方式を導入する変更である。本レビューでは、この変更が既存システムに与える影響範囲を分析した。

---

## 2. 影響を受けるファイル

### 2.1 直接変更対象

| ファイル | 変更種別 | リスクレベル | 説明 |
|----------|----------|--------------|------|
| `src/lib/tmux.ts` | 追加 | 低 | `sendTextViaBuffer()`関数の新規追加 |
| `src/lib/claude-session.ts` | 修正 | 中 | `sendMessageToClaude()`で新関数を使用 |
| `src/lib/cli-tools/codex.ts` | 修正 | 中 | `sendMessage()`で新関数を使用 |

### 2.2 間接的影響（変更対象外）

| ファイル | 影響 | 理由 |
|----------|------|------|
| `src/lib/cli-tools/gemini.ts` | なし | 非インタラクティブモード（パイプ経由）のため |
| `src/lib/auto-yes-manager.ts` | なし | 単純なyes/no応答のみ |
| `src/app/api/worktrees/[id]/respond/route.ts` | 将来的検討 | 現状は単一行応答のみ |
| `src/app/api/worktrees/[id]/prompt-response/route.ts` | 将来的検討 | 現状は単一行応答のみ |
| `src/app/api/worktrees/[id]/terminal/route.ts` | 将来的検討 | 現状は単一行コマンドが主 |

---

## 3. 後方互換性

**ステータス**: 互換性あり

### 分析結果

- 既存の`sendKeys()`関数は変更なく残存
- 新規関数`sendTextViaBuffer()`が追加される
- APIインターフェースに変更なし
- 外部から見た動作は同一（複数行メッセージが正常に送信される）

### 破壊的変更

なし

---

## 4. テストへの影響

### 4.1 既存テスト

| テストファイル | 影響 |
|----------------|------|
| `tests/unit/tmux.test.ts` | 軽微（モック追加が必要な可能性） |
| `tests/unit/lib/claude-session.test.ts` | `sendTextViaBuffer`のモック追加が必要 |
| `tests/unit/cli-tools/codex.test.ts` | 現状簡易的なテストのため影響小 |

### 4.2 新規テスト（必須）

1. **`tests/unit/lib/tmux.test.ts`** - `sendTextViaBuffer()`のユニットテスト
   - 正常系（単一行、複数行50+行）
   - エスケープ処理（`$`, `"`, `\`, バッククォート）
   - バッファ名サニタイズ
   - エラーハンドリング（バッファクリーンアップ）
   - エッジケース（空文字、超長文、NULバイト）

2. **`tests/integration/tmux-buffer.test.ts`** - 統合テスト
   - Claude CLIでの複数行メッセージ送信
   - Codex CLIでの複数行メッセージ送信
   - Gemini CLIへの非影響確認

---

## 5. パフォーマンスへの影響

**ステータス**: 中立〜やや改善

### 分析結果

- `load-buffer/paste-buffer`方式は`send-keys`方式と同等のパフォーマンス
- 大量テキスト送信時はやや効率的（ペースト検出回避による安定性向上）
- `paste-buffer -d`オプションによりアトミック操作が可能
- バッファ作成・削除のオーバーヘッドは数ミリ秒程度で無視可能

### 考慮事項

- エラー時のバッファリーク防止により長期運用でのメモリ消費増加を回避
- バッファ名サニタイズにより予期しないバッファ名衝突を防止

---

## 6. 検出事項

### 6.1 Should Fix（推奨修正）

| ID | タイトル | 重要度 |
|----|----------|--------|
| SF-IMP-001 | APIエンドポイントでのsendKeys使用箇所も検討が必要 | 中 |
| SF-IMP-002 | auto-yes-manager.tsでのsendKeys使用 | 低 |

**SF-IMP-001 詳細**:
複数のAPIエンドポイント（respond, prompt-response, terminal）が`sendKeys`を直接使用している。現状はプロンプト応答が単一行（yes/no/数値）のため問題ないが、将来的に複数行入力を受け付ける場合は`sendTextViaBuffer()`の適用を検討すべき。

**SF-IMP-002 詳細**:
`auto-yes-manager.ts`は単純なyes/no応答のみのため、現状は`sendKeys()`で問題なし。Issue #163の修正対象外として記録する。

### 6.2 Nice to Have（改善提案）

| ID | タイトル |
|----|----------|
| NTH-IMP-001 | sendTextViaBufferのドキュメント強化 |
| NTH-IMP-002 | 統合テストの追加を推奨 |

---

## 7. 関連Issue

| Issue | 関連性 | 説明 |
|-------|--------|------|
| #152 | 関連 | Claude CLI初回メッセージ送信問題。`waitForPrompt()`との連携が必要 |
| #138 | なし | Auto-Yes機能。sendKeysを使用しているが単純応答のみで影響なし |

---

## 8. 結論

Issue #163の変更は**影響範囲が限定的**であり、**後方互換性が維持**される。主な変更対象は3ファイル（tmux.ts, claude-session.ts, codex.ts）で、新規関数追加と使用関数の切り替えのみ。

**リスク評価**: 低〜中

- 既存機能への影響は最小限
- テスト追加により品質担保可能
- パフォーマンスへの悪影響なし

**推奨事項**:
1. Issue記載のテスト戦略に従ってテストを実装
2. Claude CLI / Codex CLIでの手動テストを実施
3. SF-IMP-001について将来的な拡張時に再検討
