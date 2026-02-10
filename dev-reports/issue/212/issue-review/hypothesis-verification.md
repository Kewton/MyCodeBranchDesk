# Issue #212 仮説検証レポート

## 検証日時
- 2026-02-10

## 検証結果サマリー

| # | 仮説/主張 | 判定 | 根拠 |
|---|----------|------|------|
| 1 | PR #171~#176が全てRevert済み | **Partially** | PR #174は欠番。#171,#172,#173,#175,#176は存在するが、state=MERGEDであり、別のRevertコミットで打ち消されている。加えてPR #183, #184も関連しRevert済み |
| 2 | paste-buffer等が想定通りに反応しない | **Confirmed** | paste-buffer/bracketed paste関連のコードは全て削除されており、git履歴に5回の試行と全Revertが記録されている |
| 3 | `[Pasted text]` 表示の挙動 | **Unverifiable** | 実行時の動作に依存（コードベースのみでは検証不可）。ただしIssue #163にスクリーンショットと再現手順あり |
| 4 | 既存関数（sendKeys等）の存在 | **Confirmed** | `sendKeys()`, `capturePane()`, `stripAnsi()` の3関数全てが存在し、Issueの説明と一致する機能を持つ |
| 5 | 変更対象ファイル・関数の存在 | **Confirmed** | `src/lib/claude-session.ts` の `sendMessageToClaude()` (L394) と `src/lib/cli-tools/codex.ts` の `sendMessage()` (L111) の両方が存在 |

## 詳細検証

### 仮説 1: PR #171~#176が全てRevert済み

**Issue内の記述**: "Issue #163 では5回の実装試行（PR #171~#176）で「ペースト検出を回避する」アプローチを取ったが、全てRevert済み"

**検証手順**:
1. `gh pr view` で各PRの存在と状態を確認
2. `git log --all --grep="revert"` でRevertコミットを確認

**判定**: **Partially**

**根拠**:

各PRの状態:

| PR | Title | State | Revertコミット |
|----|-------|-------|----------------|
| #171 | fix(#163): 複数行メッセージのバッファ送信方式でペースト検出を回避 | MERGED | `61f184b` |
| #172 | fix(#163): sendTextViaBuffer shell escaping error on long strings | MERGED | `7dab83e` |
| #173 | fix(#163): enable bracketed paste for multiline message delivery | MERGED | `95c894e` |
| #174 | **存在しない（欠番）** | - | - |
| #175 | fix(#163): explicit bracketed paste markers for multiline text | MERGED | `64bab67` |
| #176 | fix(#163): use sendKeys for single-line, sendTextViaBuffer for multiline | MERGED | `77148c4` |

重要な補足:
- PR #174は欠番であり、Issue #163自身にも「PR #174 はこのIssueに関連するPRとしては存在しない（欠番）」と注記されている
- Issueの記述「5回の実装試行（PR #171~#176）」は正確には「5回の実装試行（PR #171, #172, #173, #175, #176）」であり、PR #174は欠番を含む連番表記
- さらにPR #183と#184も存在し（いずれもMERGED後にRevert `5fe3fb6`, `d626397`）、合計7つのPRがIssue #163に関連している。ただしIssue #212は「5回の実装試行」と記述しており、PR #183, #184への言及は別途確認が必要
- 全PRの`state`はMERGED（closedではなくマージ済み）だが、対応するRevertコミットが全て存在するため、効果は打ち消されている

**Issueへの影響**:
- Issue #212の記述は概ね正確。PR #174が欠番であることはIssue #163内に注記済み
- PR #183, #184のRevertについてはIssue #212の記述範囲外だが、追加の試行として存在する点は認識すべき

---

### 仮説 2: paste-buffer等が想定通りに反応しない

**Issue内の記述**: "Claude CLIのink-based TextInputがpaste-bufferやbracketed paste markersに対して想定通りに反応しない"

**検証手順**:
1. `git log --all --grep="paste"` でpaste関連コミット履歴を確認
2. `git log --all --grep="bracketed"` でbracketed paste関連コミット履歴を確認
3. 現在のコードベースで `paste`, `bracketed`, `sendTextViaBuffer`, `send-keys -l` を検索

**判定**: **Confirmed**

**根拠**:

Git履歴に以下の痕跡が確認された:
- `0d7717c` feat(tmux): add sendTextViaBuffer() for multiline message sending
- `1fb5244` fix(#163): enable bracketed paste for multiline message delivery
- `c373b79` fix(#163): send explicit bracketed paste markers for multiline text
- `6e4a493` fix(multiline): use paste-buffer instead of send-keys -l for multiline messages (#163)
- `17dc9d5` fix(#163): use sendKeys for single-line, sendTextViaBuffer for multiline

コミットメッセージ `17dc9d5` に明確な記述:
> "paste-buffer delivers text as a single pty write, which Claude CLI's ink-based TextInput may interpret differently from individual keystrokes"

現在のコードベースでの検索結果:
- `sendTextViaBuffer` -- **該当なし**（完全に削除されている）
- `send-keys -l` -- **該当なし**（完全に削除されている）
- `paste` / `bracketed` -- **src/ 配下に該当なし**（全て削除されている）

全てのpaste-buffer/bracketed paste関連コードがRevertにより削除されていることが確認された。

**Issueへの影響**: なし。仮説は正確。

---

### 仮説 3: `[Pasted text]` 表示の挙動

**Issue内の記述**: "Claude CLIは複数行テキストのペーストを検知すると `[Pasted text #N +XX lines]` と折りたたみ表示し、ユーザーの確認（Enter）を待つ"

**検証手順**:
1. 実行時の動作のため、コードベースのみでの検証は不可

**判定**: **Unverifiable**

**根拠**: Claude CLIの実行時の動作に依存するため、コードベースのみでは検証不可。ただし、Issue #163に以下の補強情報がある:
- スクリーンショット付きの再現手順が記載されている
- `anthropics/claude-code #3412` への外部参照がある
- 7回のPR試行とRevertという実績が挙動の存在を強く示唆する

**Issueへの影響**: なし（実装時に動作確認が必要）

---

### 仮説 4: 既存関数の存在

**Issue内の記述**: "`sendKeys()`、`capturePane()`、`stripAnsi()` 等の既存関数をそのまま使用"

**検証手順**:
1. `src/lib/claude-session.ts` を読み込み、import文と関数使用箇所を確認
2. `src/lib/tmux.ts` で関数定義を確認
3. `src/lib/cli-patterns.ts` で関数定義を確認

**判定**: **Confirmed**

**根拠**:

| 関数 | 定義ファイル | シグネチャ | claude-session.tsでの使用 |
|------|-------------|-----------|--------------------------|
| `sendKeys()` | `src/lib/tmux.ts` (L207) | `sendKeys(sessionName: string, keys: string, sendEnter: boolean = true): Promise<void>` | import済み（L9）、L328, L424, L425, L479で使用 |
| `capturePane()` | `src/lib/tmux.ts` (L316) | `capturePane(sessionName: string, linesOrOptions?: number \| CapturePaneOptions): Promise<string>` | import済み（L10）、L270, L342, L409, L455で使用 |
| `stripAnsi()` | `src/lib/cli-patterns.ts` (L205) | `stripAnsi(str: string): string` | import済み（L16）、L273, L348, L410で使用 |

3関数全てが存在し、Issue #212の説明と一致する機能を持っている。

**Issueへの影響**: なし。

---

### 仮説 5: 変更対象ファイル・関数の存在

**Issue内の記述**: "主な変更対象は `src/lib/claude-session.ts` の `sendMessageToClaude()`"、"`src/lib/cli-tools/codex.ts` の `sendMessage()`"

**検証手順**:
1. 各ファイルの存在確認
2. 各関数の存在とシグネチャを確認

**判定**: **Confirmed**

**根拠**:

| ファイル | 関数 | 行番号 | シグネチャ |
|----------|------|--------|-----------|
| `src/lib/claude-session.ts` | `sendMessageToClaude()` | L394 | `async function sendMessageToClaude(worktreeId: string, message: string): Promise<void>` |
| `src/lib/cli-tools/codex.ts` | `sendMessage()` | L111 | `async sendMessage(worktreeId: string, message: string): Promise<void>` |

両ファイル・両関数が存在する。

`sendMessageToClaude()` の現在の送信ロジック（L424-425）:
```typescript
await sendKeys(sessionName, message, false);
await sendKeys(sessionName, '', true);
```

`codex.ts` の `sendMessage()` の現在の送信ロジック（L124, L130）:
```typescript
await sendKeys(sessionName, message, false);
// ...
await execAsync(`tmux send-keys -t "${sessionName}" C-m`);
```

Issue #163の指摘通り、`codex.ts` は `sendKeys()` と直接 `execAsync(tmux send-keys)` の2つの送信パスを持っている。

**Issueへの影響**: なし。

---

## Stage 1レビューへの申し送り事項

1. **仮説1（Partially Confirmed）**: Issue #212は「5回の実装試行（PR #171~#176）」と記述しているが、PR #174は欠番である。Issue #163にはこの注記が存在するため、Issue #212側の記述も厳密には「PR #171, #172, #173, #175, #176の5件」とすべき。ただし、これはIssue #163からの引用であり、実質的な問題はない。
2. **PR #183, #184の存在**: Issue #212の記述範囲外だが、PR #171~#176の5件に加えてPR #183, #184も関連試行として存在しRevert済み（合計7件のPR）。Issue #212の「方式E」が、これら追加試行も踏まえた上での新アプローチであることを確認すべき。
3. **仮説3（Unverifiable）**: `[Pasted text]` 表示の挙動はコードベースからは検証不可だが、Issue #163のスクリーンショットと外部参照（claude-code #3412）が補強情報として存在する。実装時に動作確認が必須。
4. **codex.tsの二重パス**: Issue #163が指摘する通り、`codex.ts` の `sendMessage()` は `sendKeys()` と直接 `execAsync(tmux send-keys C-m)` の2つの送信パスを持つ。Issue #212の修正実装時、両パスへの対応が必要。
5. **全仮説の総合判定**: 5件中3件がConfirmed、1件がPartially Confirmed（軽微）、1件がUnverifiable（構造的に検証不可）。Issue #212の前提条件と原因分析は概ね正確であり、Stage 1レビューに進行して問題ない。
