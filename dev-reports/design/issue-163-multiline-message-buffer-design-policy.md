# 設計方針書: Issue #163 - 複数行メッセージのバッファ送信方式

## 1. 概要

### 1.1 問題
複数行テキスト（改行を含むメッセージ）を`tmux send-keys`で送信すると、Claude CLIがこれを「ペースト操作」として認識し、`[Pasted text #1 +XX lines]`と表示されるだけで処理が開始されない。

### 1.2 根本原因
- `tmux send-keys`で複数行の改行を含むテキストを送信すると、Claude CLIがペースト操作として検出
- Claude CLIのセキュリティ機構（大量テキスト一括実行防止）により折りたたまれる
- 展開・確認する方法がない制限あり（[claude-code#3412](https://github.com/anthropics/claude-code/issues/3412)）

### 1.3 解決方針
**方式1: tmux load-buffer/paste-buffer** を採用。バッファ経由でテキストを送信し、ペースト検出を回避する。

---

## 2. 設計原則

| 原則 | 適用方針 |
|------|---------|
| SRP | `sendTextViaBuffer()`はバッファ送信のみに責務を限定 |
| OCP | 既存`sendKeys()`に変更なし、新関数を追加 |
| DRY | 共通tmux関数（`tmux.ts`）に配置し、Claude/Codex両方から利用 |
| KISS | エスケープ処理とバッファ操作のみのシンプルな実装 |
| YAGNI | 判断基準の自動切替（sendKeys/sendTextViaBuffer）は実装しない。呼び出し側で明示的に使い分ける |

---

## 3. アーキテクチャ設計

### 3.1 コンポーネント構成

```
src/lib/tmux.ts                    ← sendTextViaBuffer() 追加
  ↑ 使用
src/lib/claude-session.ts          ← sendMessageToClaude() 修正
src/lib/cli-tools/codex.ts         ← sendMessage() 修正
```

### 3.2 関数シグネチャ

```typescript
/**
 * 複数行テキストをバッファ経由で送信（ペースト検出回避）
 */
export async function sendTextViaBuffer(
  sessionName: string,
  text: string,
  sendEnter: boolean = true
): Promise<void>
```

### 3.3 sendKeys() と sendTextViaBuffer() の使い分け

| 関数 | 用途 | 使用ケース |
|------|------|-----------|
| `sendKeys()` | 単一行・制御キー | Enter、Ctrl+C、短いコマンド、CLIコマンド起動 |
| `sendTextViaBuffer()` | ユーザーメッセージ送信 | ユーザーが入力したメッセージ全般（単一行・複数行問わず） |

**設計判断**: ユーザーメッセージの送信は常に`sendTextViaBuffer()`を使用する。メッセージ長や改行有無による自動切替は行わない（KISS原則）。

---

## 4. 詳細設計

### 4.1 sendTextViaBuffer() 処理フロー

```
1. バッファ名の生成とサニタイズ
   - セッション名から英数字・ハイフン・アンダースコアのみ抽出
   - プレフィックス "cm-" を付与

2. テキストの前処理
   - NULバイト（\0）の除去
   - エスケープ処理（順序重要）:
     a. \ → \\\\ （バックスラッシュを最初に。二重エスケープ防止）
     b. $ → \\$  （変数展開防止）
     c. " → \\"  （ダブルクォート）
     d. ` → \\`  （コマンド置換防止）

3. バッファへのロード
   - printf '%s' "${escapedText}" | tmux load-buffer -b "${bufferName}" -

4. バッファのペースト
   - tmux paste-buffer -t "${sessionName}" -b "${bufferName}" -dp
   - -d: ペースト後にバッファを自動削除
   - -p: 末尾改行なし

5. Enterキー送信（sendEnter=trueの場合）
   - tmux send-keys -t "${sessionName}" C-m

6. エラーハンドリング
   - try-catch でエラー時にバッファクリーンアップを実行
   - tmux delete-buffer -b "${bufferName}" 2>/dev/null || true
```

### 4.2 変更箇所

#### 4.2.1 src/lib/tmux.ts（新規関数追加）

- `sendTextViaBuffer()` 関数を追加
- 既存の `sendKeys()` は変更なし（後方互換性維持）

#### 4.2.2 src/lib/claude-session.ts（sendMessageToClaude修正）

**変更前**:
```typescript
await sendKeys(sessionName, message, false);  // Message without Enter
await sendKeys(sessionName, '', true);        // Enter key
```

**変更後**:
```typescript
await sendTextViaBuffer(sessionName, message, true);  // バッファ経由で送信+Enter
```

#### 4.2.3 src/lib/cli-tools/codex.ts（sendMessage修正） [SF-002]

**変更前**:
```typescript
await sendKeys(sessionName, message, false);
await new Promise((resolve) => setTimeout(resolve, 100));
await execAsync(`tmux send-keys -t "${sessionName}" C-m`);
```

**変更後**:
```typescript
await sendTextViaBuffer(sessionName, message, true);  // バッファ経由で送信+Enter
```

> **改善ポイント [SF-002]**: この変更により、codex.ts `sendMessage()` 内の `execAsync(`tmux send-keys -t ...`)` 直接呼び出しが除去される。ただし、`killSession()`（141行目）には `execAsync(`tmux send-keys -t "${sessionName}" C-d`)` が残存する。本Issue（#163）での SF-002 対応範囲は `sendMessage()` 内の execAsync 除去に限定する。`killSession()` 内の Ctrl+D 送信の `sendSpecialKey()` への移行は将来課題（11.4項）として扱う。 [IMP-001]

### 4.3 実装注記: execFile() 方式への改善可能性 [SF-001]

> **注記**: 現行設計では `execAsync()` 経由（シェル実行）で `printf '%s' | tmux load-buffer` を実行するため、4.1項のエスケープ処理（`\`, `$`, `"`, `` ` `` の4種）が必要となる。将来的に `execFile('tmux', ['load-buffer', '-b', bufferName, '-'], {input: text})` のように `execFile()` + stdinパイプ方式に変更すれば、シェルを経由しないためエスケープ処理の大部分が不要になり、SEC-001のコマンドインジェクション対策も根本的に解決される。
>
> ただし、Node.js `child_process` APIのstdin入力方式の制約（`execFile` はデフォルトで stdin にデータを送れないため `spawn` が必要になる可能性）を確認する必要がある。本Issue（#163）では現行の `execAsync()` + エスケープ方式で実装し、`execFile()` 方式への移行は別Issueとして検討する。

---

## 5. 影響範囲

### 5.1 直接変更対象

| ファイル | 変更種別 | リスク |
|----------|----------|--------|
| `src/lib/tmux.ts` | 追加（新規関数） | 低 - 既存関数に変更なし |
| `src/lib/claude-session.ts` | 修正（sendMessageToClaude内） | 中 - 送信方式変更 |
| `src/lib/cli-tools/codex.ts` | 修正（sendMessage内） | 中 - 送信方式変更 |

### 5.2 変更対象外（影響なし）

| ファイル | 理由 |
|----------|------|
| `src/lib/cli-tools/gemini.ts` | 非インタラクティブモード（`echo | gemini`パイプ方式）のため対象外 |
| `src/lib/auto-yes-manager.ts` | 単純なyes/no応答（1行）のみで`sendKeys()`で問題なし |
| `src/app/api/worktrees/[id]/respond/route.ts` | 単純な応答（1行）のみ。将来検討 |
| `src/app/api/worktrees/[id]/prompt-response/route.ts` | 単純な応答（1行）のみ。将来検討 |
| `src/app/api/worktrees/[id]/terminal/route.ts` | 単一行コマンドが主。将来検討 |

### 5.3 後方互換性

- `sendKeys()` は変更なし（既存呼び出し元に影響なし）
- `sendTextViaBuffer()` は新規追加（破壊的変更なし）
- APIインターフェースに変更なし

---

## 6. セキュリティ設計

### SEC-001: コマンドインジェクション防止
- `printf '%s'` の引数をダブルクォートで囲む
- `$`, `"`, `\`, `` ` `` をエスケープ処理
- エスケープ順序: `\` → `$` → `"` → `` ` ``（二重エスケープ防止のため`\`を最初に処理）
- `%` 文字はエスケープ不要: `printf '%s'` のフォーマット指定子は `'%s'` で固定（ハードコード）されており、ユーザー入力はその**引数**として渡される。したがって、入力内の `%` 文字がフォーマット指定子（`%d`, `%x` 等）として解釈されることはない（`%b` 指定子ではなく `%s` 指定子を使用しているため、`\n` 等のバックスラッシュエスケープも特殊解釈されない） [SEC-MF-001]
- **sessionNameの安全性前提**: `sessionName` は `getSessionName()` 経由で `'mcbd-{cliToolId}-{worktreeId}'` として生成される。`worktreeId` はDB由来のUUID形式であり、シェル特殊文字（`"`, `$`, `` ` ``, `\` 等）を含まない。`tmux paste-buffer -t "${sessionName}"` のセッション名に対する追加のサニタイズは不要であり、既存の `sendKeys()` と同一のリスクレベルである [SEC-SF-002]

### SEC-002: バッファ名サニタイズ
- セッション名から `[^a-zA-Z0-9_-]` を `_` に置換
- プレフィックス `cm-` で他のバッファとの衝突を回避

### SEC-003: バッファリーク防止
- `paste-buffer -d` で正常時はペースト後に自動削除
- エラー時はfinally/catchブロックで `delete-buffer` を実行
- `2>/dev/null || true` でクリーンアップ失敗時も例外を抑制
- **プロセスクラッシュ時のバッファ残留リスク** [SEC-SF-003]: `tmux load-buffer` 成功後にNode.jsプロセスがクラッシュ（SIGKILL、OOM等）した場合、`paste-buffer` も `delete-buffer` も実行されず、tmuxサーバープロセスのメモリ上にバッファが残留する。tmuxサーバーが再起動されるか、`tmux delete-buffer -b cm-{bufferName}` を手動実行するまで残留し続ける。ただし、バッファの内容はCLIツールへの指示メッセージであり、機密情報（認証トークン、パスワード等）を含むことは通常運用で想定されないため、セキュリティリスクは低い

### SEC-004: NULバイト除去
- NULバイト（`\0`）はC文字列終端として扱われ、`printf`やtmuxで予期しない動作を引き起こすため事前に除去
- `text.replace(/\0/g, '')` で全NULバイトを除去

### SEC-005: 制御文字のフィルタリングポリシー [SEC-SF-001]
- **除去対象**: NULバイト（`\0`, 0x00）のみ（SEC-004で対応）
- **パススルー対象**: NUL以外の制御文字（`\x01`-`\x1f`, `\x7f`）は除去しない
- **設計判断の根拠**:
  - `\r`（CR, 0x0D）はターミナル上で行頭復帰を引き起こし表示を改竄する可能性がある（Terminal Injection類似）
  - `\x08`（Backspace）は表示上の文字上書きに使用される可能性がある
  - `\x7f`（DEL）も同様のリスクがある
  - しかし、`sendTextViaBuffer()` の用途はユーザーがWebUIから入力したメッセージをCLIツールに送信することであり、制御文字が含まれることは通常運用で想定されない
  - 改行（`\n`, 0x0A）とタブ（`\t`, 0x09）はメッセージの正当な構成要素であり、除去すべきではない
  - 改行を除外した制御文字の選択的フィルタリングは複雑性を増すため、KISS原則に基づきNULバイトのみの除去とする
- **リスク評価**: 低（ユーザー入力経路がWebUI経由に限定されており、意図的な制御文字注入のリスクは低い）

---

## 7. エラーハンドリング

| エラーケース | 対応 |
|-------------|------|
| tmux load-buffer 失敗 | エラーをスローし、バッファクリーンアップを試行 |
| tmux paste-buffer 失敗 | エラーをスローし、バッファクリーンアップを試行 |
| tmux send-keys (Enter) 失敗 | エラーをスロー（バッファは既にペースト済み） |
| バッファクリーンアップ失敗 | 警告のみ（メインエラーを優先） |

---

## 8. テスト戦略

### 8.1 ユニットテスト（tests/unit/lib/tmux.test.ts）

| テストカテゴリ | テストケース |
|---------------|-------------|
| 正常系 | 単一行テキスト送信 |
| 正常系 | 複数行テキスト（50+行）送信 |
| 正常系 | sendEnter=false でEnterキー非送信 |
| エスケープ | `$` のエスケープ（変数展開防止） |
| エスケープ | `"` のエスケープ |
| エスケープ | `` ` `` のエスケープ（コマンド置換防止） |
| エスケープ | `\` のエスケープ |
| バッファ名 | 特殊文字を含むセッション名のサニタイズ |
| エラー | load-buffer失敗時のクリーンアップ |
| エラー | paste-buffer失敗時のクリーンアップ |
| エッジケース | 空文字列 |
| エッジケース | 超長文（10000+文字） |
| エッジケース | 特殊文字のみのテキスト |
| NULバイト | 先頭/中間/末尾/連続/NULのみ |
| prompt未検出時 | prompt未検出でcatchブロック経由後の`sendTextViaBuffer()`正常動作 [IMP-003] |

### 8.2 統合テスト（tests/integration/tmux-buffer.test.ts）

- `process.env.TMUX` チェックで非tmux環境では自動スキップ
- CI/CD環境（GitHub Actions）では自動スキップ
- 実tmuxセッションでのバッファ送信検証

### 8.3 既存テスト修正・新規テスト追加 [SF-003] [CONS-001] [CONS-002]

#### 8.3.1 tests/unit/lib/claude-session.test.ts（既存テスト修正）

**修正対象テスト**: `'should use sendKeys for Enter instead of execAsync (CONS-001)'`（318行目付近）

**現状のアサーション** [CONS-002対応: 実コードのリテラル値で正確に記載]:
```typescript
// sendKeys が2回呼ばれることを検証（1回目: メッセージ送信、2回目: Enterキー）
expect(sendKeys).toHaveBeenCalledTimes(2);
expect(sendKeys).toHaveBeenNthCalledWith(1, 'mcbd-claude-test-worktree', 'Hello Claude', false);
expect(sendKeys).toHaveBeenNthCalledWith(2, 'mcbd-claude-test-worktree', '', true);
```

**修正後のアサーション**:
```typescript
// sendTextViaBuffer が1回呼ばれることを検証（バッファ経由でメッセージ+Enter送信）
expect(sendTextViaBuffer).toHaveBeenCalledTimes(1);
expect(sendTextViaBuffer).toHaveBeenCalledWith('mcbd-claude-test-worktree', 'Hello Claude', true);
// sendKeys はメッセージ送信では呼ばれない（制御キー送信のみで使用）
```

**追加モック設定**:
```typescript
vi.mock('@/lib/tmux', () => ({
  sendKeys: vi.fn(),
  sendTextViaBuffer: vi.fn(),  // 追加
  // 既存のモック...
}));
```

**テスト名変更**: テストの意図が変わるため、テスト名を `'should use sendTextViaBuffer for message sending'` 等に更新する。

#### 8.3.2 tests/unit/cli-tools/codex.test.ts（新規テスト追加） [CONS-001]

> **注意**: 現状の `codex.test.ts` には `sendMessage()` のテストが存在しない。テストファイルにはツールプロパティ、セッション名生成、`isInstalled`、`isRunning`、インターフェース実装の検証のみが含まれる。そのため、「既存テスト修正」ではなく「新規テスト追加」として実装する。

**新規追加テスト**: `sendMessage()` の `sendTextViaBuffer()` 呼び出し検証

```typescript
describe('sendMessage', () => {
  it('should use sendTextViaBuffer for message sending', async () => {
    // sendTextViaBuffer が1回呼ばれることを検証
    expect(sendTextViaBuffer).toHaveBeenCalledTimes(1);
    expect(sendTextViaBuffer).toHaveBeenCalledWith(sessionName, message, true);
    // execAsync のtmux直接呼び出しが存在しないことを検証
    expect(execAsync).not.toHaveBeenCalledWith(expect.stringContaining('tmux send-keys'));
  });
});
```

**必要なモック設定（新規追加）**:
```typescript
vi.mock('@/lib/tmux', () => ({
  sendKeys: vi.fn(),
  sendTextViaBuffer: vi.fn(),  // 新規
  hasSession: vi.fn(),
  capturePane: vi.fn(),
}));
```

**補足**: テストの前提として、`hasSession` のモック（`true`を返す）やtmuxセッションの存在確認モックなど、`sendMessage()` 実行に必要なセットアップを追加すること。具体的なセットアップ内容は実装時に `codex.ts` の `sendMessage()` メソッドの前提条件を確認して決定する。

---

## 9. 受け入れ条件

### 機能要件
- [ ] 50行以上の複数行メッセージがClaude CLIに正常に送信される
- [ ] 100行以上の複数行メッセージがClaude CLIに正常に送信される
- [ ] 改行を含むテキストが正しく送信される（改行が保持される）
- [ ] 送信後、Claude CLIが処理を開始する（「[Pasted text...]」で停止しない）

### セキュリティ要件
- [ ] 特殊文字（`$`, `"`, `\`, `` ` ``）を含むメッセージが正しくエスケープされる
- [ ] コマンドインジェクション試行テストをパスする
- [ ] バッファ名に不正な文字が含まれる場合、サニタイズされる
- [ ] NULバイトを含むテキストが適切に処理される

### 互換性要件
- [ ] Claude CLIで正常動作する
- [ ] Codex CLIで正常動作する
- [ ] Gemini CLIの既存動作に影響がない

### エラーハンドリング
- [ ] バッファ作成失敗時に適切なエラーメッセージが出力される
- [ ] ペースト失敗時にバッファがクリーンアップされる

### レビュー指摘対応（Stage 1）
- [ ] [SF-002] codex.ts `sendMessage()` 内から `execAsync` のtmux直接呼び出しが除去されている（killSession()内の残存は11.4項の将来課題として許容） [IMP-001]
- [ ] [SF-003] `claude-session.test.ts` の `sendKeys` 2回呼び出し検証が `sendTextViaBuffer` 1回呼び出し検証に修正されている
- [ ] [SF-003] `codex.test.ts` に `sendMessage()` の `sendTextViaBuffer` 検証テストが新規追加されている
- [ ] [SF-003] 修正後・新規追加後のテストが全てパスする

### レビュー指摘対応（Stage 2）
- [ ] [CONS-001] `codex.test.ts` の `sendMessage()` テストが「新規追加」として実装されている（既存テスト修正ではない）
- [ ] [CONS-002] `claude-session.test.ts` の修正後テストでリテラル値（`'mcbd-claude-test-worktree'`, `'Hello Claude'`）が正しく使用されている

### レビュー指摘対応（Stage 3）
- [ ] [IMP-001] 設計書4.2.3項のSF-002注記がsendMessage()のみに限定されている（killSession()のexecAsync残存を明記）
- [ ] [IMP-001] 将来課題（11.4項）にkillSession()内のexecAsync直接呼び出しの移行が記載されている
- [ ] [IMP-002] 実装後に `npm run build:server` を実行し、tmux.tsが正しくコンパイルされることを確認する
- [ ] [IMP-002] tsconfig.server.jsonの暗黙的依存解決でsendTextViaBuffer()含むtmux.tsがビルドされることを確認する
- [ ] [IMP-003] prompt未検出時（catchブロック経由）の`sendTextViaBuffer()`正常動作テストが存在する

### レビュー指摘対応（Stage 4）
- [ ] [SEC-MF-001] SEC-001に%文字がprintf '%s'の引数のためエスケープ不要である理由が明記されている
- [ ] [SEC-SF-001] SEC-005として制御文字（\r, \x08, \x7f等）のフィルタリングポリシー（パススルーする設計判断）が記載されている
- [ ] [SEC-SF-002] SEC-001にsessionNameの安全性前提（getSessionName()経由のDB由来worktreeId）が追記されている
- [ ] [SEC-SF-003] SEC-003にプロセスクラッシュ時のバッファ残留シナリオと機密情報リスク評価が追記されている

---

## 10. レビュー指摘事項サマリー

### Stage 1: 通常レビュー（設計原則） - 2026-02-06

| ID | 分類 | タイトル | 重要度 | 対応方針 |
|----|------|---------|--------|---------|
| MF-001 | DRY | sendKeys 2段階送信パターンの重複 | Must Fix | 将来課題として `sendKeysWithEnter()` ヘルパー関数を検討（11項に記載） |
| SF-001 | KISS | エスケープ処理の複雑さと実行方式の関連性 | Should Fix | `execFile()` 方式への改善可能性を注記（4.3項に記載） |
| SF-002 | SRP | codex.ts sendMessage()内のexecAsync直接呼び出し | Should Fix | 改善対象として明示、tmux.ts APIへの集約を確認（4.2.3項に記載） |
| SF-003 | OCP | 既存テスト修正の具体的内容不足 | Should Fix | テスト修正計画を詳細化（8.3項に記載） |
| CS-001 | YAGNI | sendEnterパラメータの必要性検討 | Consider | 既存API対称性の観点で許容。将来的に不要と判明した場合に削除 |
| CS-002 | DRY | respond/route.ts等のバッファ送信対応検討 | Consider | 現時点では対象外。複数行入力サポート時にフォローアップIssue作成 |
| CS-003 | 設計原則全般 | バッファ名の一意性保証 | Consider | 並行送信の発生可能性が低いため優先度低。将来課題として記録 |

### Stage 2: 整合性レビュー - 2026-02-06

| ID | 分類 | タイトル | 重要度 | 対応方針 |
|----|------|---------|--------|---------|
| CONS-001 | 整合性 | 設計書8.3.2項 codex.test.ts の既存テスト記載が実態と不一致 | Must Fix | 8.3.2項を「新規テスト追加」として書き直し。「現状のアサーション」セクションを削除し、sendMessage()テストが現状存在しないことを明記（8.3.2項に反映済み） |
| CONS-002 | 整合性 | 設計書8.3.1項のアサーション記載がハードコード値と変数名で不一致 | Should Fix | 「現状のアサーション」のコード引用を実際のリテラル値（`'mcbd-claude-test-worktree'`, `'Hello Claude'`）と一致させる（8.3.1項に反映済み） |

### Stage 3: 影響分析レビュー - 2026-02-06

| ID | 分類 | タイトル | 重要度 | 対応方針 |
|----|------|---------|--------|---------|
| IMP-001 | 影響範囲 | codex.ts killSession()内のexecAsync tmux直接呼び出しがSF-002対象外 | Must Fix | SF-002の対応範囲をsendMessage()のみに限定する旨を4.2.3項に明記。killSession()内のexecAsync移行は将来課題（11.4項）に追加。codex.ts(141行目), gemini.ts(124行目), claude-session.ts(448行目)の同パターンを記載（4.2.3項、11.4項に反映済み） |
| IMP-002 | 影響範囲 | tsconfig.server.jsonにsrc/lib/tmux.tsがincludeされていない潜在リスク | Should Fix | 受け入れ条件（9項）にnpm run build:server確認を追加。tsconfig.server.jsonの暗黙的依存解決の確認を実装時チェック項目とする（9項に反映済み） |
| IMP-003 | 影響範囲 | sendMessageToClaude() prompt未検出時catchブロックの動作変更確認 | Should Fix | テスト戦略（8.1項）にprompt未検出時のsendTextViaBuffer正常動作テストケースを追加（8.1項に反映済み） |
| IMP-004 | 影響範囲 | terminal/route.tsでのnamespace import (import * as tmux)への影響 | Consider | 現時点では対応不要。将来的に複数行コマンド送信が必要になった場合に検討 |
| IMP-005 | 影響範囲 | terminal-websocket.tsのspawn方式tmux呼び出しとの整合性 | Consider | 本Issueの範囲外。WebSocket用途が異なるため現状維持 |

### Stage 4: セキュリティレビュー - 2026-02-06

| ID | 分類 | タイトル | 重要度 | 対応方針 |
|----|------|---------|--------|---------|
| SEC-MF-001 | A03:2021 Injection | printf '%s' の引数内での % 文字のエスケープ不要理由の明記 | Must Fix | SEC-001に%文字がprintf '%s'の引数として渡されるためフォーマット指定子として解釈されずエスケープ不要である旨を追記（SEC-001に反映済み） |
| SEC-SF-001 | A03:2021 Injection | 制御文字（\x01-\x1f）のフィルタリング方針不足 | Should Fix | NUL以外の制御文字（\r, \x08, \x7f等）をパススルーする設計判断とその根拠を明記。SEC-005として新設（SEC-005に反映済み） |
| SEC-SF-002 | A04:2021 Insecure Design | セッション名の安全性前提の明記 | Should Fix | sessionNameはgetSessionName()経由のDB由来worktreeId（UUID形式）であり、シェル特殊文字を含まない前提をSEC-001に追記。既存sendKeys()と同一リスクレベル（SEC-001に反映済み） |
| SEC-SF-003 | A04:2021 Insecure Design | プロセスクラッシュ時のバッファ残留リスクの明記 | Should Fix | load-buffer成功後のNode.jsプロセスクラッシュ時にバッファが残留するシナリオをSEC-003に追記。機密情報リスクは低い旨も併記（SEC-003に反映済み） |
| SEC-CS-001 | A03:2021 Injection | execFile()/spawn方式への移行による根本的インジェクション対策 | Consider | 設計書4.3項（SF-001）で既に認識・記載済み。将来Issueとして別途追跡 |
| SEC-CS-002 | A04:2021 Insecure Design | バッファ名の並行アクセスによるレースコンディション | Consider | CS-003として既に管理済み。ローカルサーバーアーキテクチャでは非現実的 |
| SEC-CS-003 | A03:2021 Injection | シングルクォートのエスケープ不要確認 | Consider | ダブルクォート内ではシングルクォートは特別な意味を持たないため対応不要 |

---

## 11. 将来課題

### 11.1 sendKeysWithEnter() ヘルパー関数の導入 [MF-001]

**背景**: `sendTextViaBuffer()` 導入後も、以下の箇所に `sendKeys(sessionName, answer, false)` + `sendKeys(sessionName, '', true)` の2段階送信パターンが残存する。

**該当箇所**:
- `src/lib/auto-yes-manager.ts` - Auto-Yes自動応答
- `src/app/api/worktrees/[id]/respond/route.ts` - ユーザー応答
- `src/app/api/worktrees/[id]/prompt-response/route.ts` - プロンプト応答

**現状の設計判断**: これらは「単純な応答（1行）のみ」であり、ペースト検出問題は発生しないため、本Issue（#163）の直接対象外とする。

**推奨対応**: 別Issueとして `sendKeysWithEnter()` ヘルパー関数を `tmux.ts` に追加し、2段階送信パターンを統一する。

```typescript
// 提案: tmux.ts に追加
export async function sendKeysWithEnter(
  sessionName: string,
  text: string
): Promise<void> {
  await sendKeys(sessionName, text, false);
  await sendKeys(sessionName, '', true);
}
```

**DRY改善効果**: 3箇所の重複パターンが1関数呼び出しに統一され、送信ロジックの変更時に1箇所のみ修正すればよくなる。

### 11.2 バッファ名の一意性保証 [CS-003]

**背景**: 同一セッションに対して並行して `sendTextViaBuffer()` が呼ばれた場合、同じバッファ名が使用されレースコンディションが発生する可能性がある。

**現状の判断**: 現行のユースケースでは並行送信が発生しにくいため、優先度は低い。

**推奨対応**: 将来的に並行送信が必要になった場合、バッファ名にタイムスタンプやランダムサフィックスを付与して一意性を保証する。
例: `cm-{sanitized-session-name}-{Date.now()}-{randomSuffix}`

### 11.3 respond/route.ts 等のバッファ送信対応 [CS-002]

**背景**: `respond/route.ts` と `prompt-response/route.ts` でユーザーが複数行テキストを入力した場合、同じペースト検出問題が発生する可能性がある。

**現状の判断**: 現時点では「単純な応答（1行）のみ」という前提で対象外。

**推奨対応**: 将来的にこれらのルートで複数行入力をサポートする場合、フォローアップIssueを作成し `sendTextViaBuffer()` への移行を検討する。

### 11.4 killSession() 内の execAsync tmux 直接呼び出しの移行 [IMP-001]

**背景**: 各CLIツールの `killSession()` メソッド内に `execAsync(`tmux send-keys -t "${sessionName}" C-d`)` という tmux 直接呼び出しが残存している。これは `tmux.ts` モジュールの API を経由しない実装であり、SRP（単一責任原則）の観点で改善が望ましい。

**該当箇所**（3箇所で同一パターン）:
- `src/lib/cli-tools/codex.ts`（141行目） - `await execAsync(`tmux send-keys -t "${sessionName}" C-d`)`
- `src/lib/cli-tools/gemini.ts`（124行目） - `await execAsync(`tmux send-keys -t "${sessionName}" C-d`)`
- `src/lib/claude-session.ts`（448行目） - `await execAsync(`tmux send-keys -t "${sessionName}" C-d`)`

**現状の設計判断**: 本Issue（#163）での SF-002 対応範囲は `sendMessage()` 内の execAsync 除去に限定する。`killSession()` は Ctrl+D（制御キー）の送信であり、ユーザーメッセージ送信とは性質が異なるため、`sendTextViaBuffer()` の適用対象外である。

**推奨対応**: 別Issueとして、これら3箇所の `execAsync(`tmux send-keys ... C-d`)` を `tmux.ts` の `sendSpecialKey()` またはそれに相当する API 呼び出しに移行する。これにより、全ての tmux 操作が `tmux.ts` モジュールを経由する形に統一され、SRP に完全準拠する。

```typescript
// 現行（3箇所共通パターン）
await execAsync(`tmux send-keys -t "${sessionName}" C-d`);

// 推奨移行先（例）
await sendSpecialKey(sessionName, 'C-d');
// または
await sendKeys(sessionName, '', false); // 既存の sendKeys で C-d を送信
```

---

## 12. レビュー履歴

### 初版作成 (2026-02-06)
- Issue #163本文の設計情報を元に設計方針書を作成

### Stage 1: 通常レビュー 対応 (2026-02-06)
- **レビュー結果**: 条件付き承認（スコア: 4/5）
- **フォーカス**: 設計原則（SOLID/KISS/YAGNI/DRY）
- **リスク評価**: 技術: Low / セキュリティ: Low / 運用: Low
- **対応内容**:
  - [MF-001] 将来課題セクション（11.1項）を追加。sendKeys 2段階送信パターンの重複について `sendKeysWithEnter()` ヘルパー関数の導入を推奨
  - [SF-001] 実装注記（4.3項）を追加。`execFile()` 方式への改善可能性を記載
  - [SF-002] 変更箇所（4.2.3項）を更新。codex.tsの `execAsync` 直接呼び出し除去を改善対象として明示
  - [SF-003] 既存テスト修正（8.3項）を詳細化。具体的な修正内容を記載
  - レビュー指摘事項サマリー（10項）を追加
  - 将来課題セクション（11項）を追加（MF-001, CS-002, CS-003）
  - 実装チェックリスト（9項）にレビュー指摘対応項目を追加

### Stage 2: 整合性レビュー 対応 (2026-02-06)
- **レビュー結果**: 条件付き承認（スコア: 4/5）
- **フォーカス**: 設計書と実コードの整合性検証
- **リスク評価**: 技術: Low / セキュリティ: Low / 運用: Low
- **整合性チェック結果**: CHECK-01〜CHECK-06の6項目を検証。PASS: 4件、PASS_WITH_MINOR_DIFF: 1件（CHECK-04）、FAIL: 1件（CHECK-05）
- **対応内容**:
  - [CONS-001] 8.3.2項を全面改訂。codex.test.tsにsendMessage()テストが存在しない事実を正確に記載し、「既存テスト修正」から「新規テスト追加」に変更。「現状のアサーション」セクションを削除し、新規追加すべきテストケースとモック設定を記載
  - [CONS-002] 8.3.1項の「現状のアサーション」コード引用を、実際のテストコードのリテラル値（`'mcbd-claude-test-worktree'`, `'Hello Claude'`）と一致するよう修正。修正後のアサーションも同様にリテラル値で統一
  - レビュー指摘事項サマリー（10項）にStage 2の指摘を追加
  - 8.3項の見出しに [CONS-001] [CONS-002] タグを追加

### Stage 3: 影響分析レビュー 対応 (2026-02-06)
- **レビュー結果**: 条件付き承認（スコア: 4/5）
- **フォーカス**: 影響範囲分析（変更対象・間接影響・テスト影響・ビルド影響）
- **リスク評価**: 技術: Low / セキュリティ: Low / 運用: Low
- **対応内容**:
  - [IMP-001] 4.2.3項のSF-002注記を修正。対応範囲をsendMessage()のみに限定し、killSession()内のexecAsync残存を明記。将来課題セクション（11.4項）を新設し、codex.ts(141行目)、gemini.ts(124行目)、claude-session.ts(448行目)の3箇所に存在するexecAsync tmux直接呼び出しパターンの移行計画を記載
  - [IMP-002] 受け入れ条件（9項）にnpm run build:server確認およびtsconfig.server.jsonの暗黙的依存解決確認を追加
  - [IMP-003] テスト戦略（8.1項）にprompt未検出時のsendTextViaBuffer正常動作テストケースを追加
  - レビュー指摘事項サマリー（10項）にStage 3の指摘（IMP-001〜IMP-005）を追加
  - 受け入れ条件（9項）にStage 3レビュー指摘対応チェックリストを追加

### Stage 4: セキュリティレビュー 対応 (2026-02-06)
- **レビュー結果**: 条件付き承認（スコア: 4/5）
- **フォーカス**: セキュリティ（OWASP Top 10、インジェクション対策、バッファ安全性）
- **リスク評価**: 技術: Low / セキュリティ: Low / 運用: Low
- **OWASP Top 10チェック結果**: A01-A10の10カテゴリを検証。Not Applicable: 5件、Pass: 3件、Pass with Notes: 2件（A03 Injection, A04 Insecure Design）
- **対応内容**:
  - [SEC-MF-001] SEC-001に%文字のエスケープ不要理由を追記。printf '%s'の引数として渡されるためフォーマット指定子として解釈されない旨を明記
  - [SEC-SF-001] SEC-005を新設。NUL以外の制御文字（\r, \x08, \x7f等）をパススルーする設計判断とその根拠（KISS原則、WebUI経由の入力経路限定）を記載
  - [SEC-SF-002] SEC-001にsessionNameの安全性前提を追記。getSessionName()経由のDB由来worktreeId（UUID形式）を使用し、シェル特殊文字を含まない前提。既存sendKeys()と同一リスクレベル
  - [SEC-SF-003] SEC-003にプロセスクラッシュ時のバッファ残留シナリオを追記。Node.jsプロセスクラッシュ時にtmuxバッファが残留するリスクと、機密情報リスクが低い旨を明記
  - レビュー指摘事項サマリー（10項）にStage 4の指摘（SEC-MF-001, SEC-SF-001〜003, SEC-CS-001〜003）を追加
  - 受け入れ条件（9項）にStage 4レビュー指摘対応チェックリストを追加
