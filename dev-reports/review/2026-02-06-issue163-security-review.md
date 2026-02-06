# Architecture Review: Issue #163 - Stage 4 Security Review

## Executive Summary

| Item | Detail |
|------|--------|
| Issue | #163 - 複数行メッセージのバッファ送信方式 |
| Stage | Stage 4 - セキュリティレビュー |
| Focus | OWASP Top 10 準拠、コマンドインジェクション対策 |
| Status | 条件付き承認 (Conditionally Approved) |
| Score | 4/5 |
| Date | 2026-02-06 |
| Reviewer | Architecture Review Agent |

**総合評価**: 設計書のセキュリティ設計は概ね適切であり、コマンドインジェクション対策の基本的な要件を満たしている。エスケープ処理の4種（`\`, `$`, `"`, `` ` ``）は正しい順序で定義されており、バッファ名サニタイズ（SEC-002）とNULバイト除去（SEC-004）も適切。ただし、設計書の記載完全性として、エスケープ不要文字の根拠明記、制御文字フィルタリング方針の明確化、セッション名の安全性前提の明記、およびプロセスクラッシュ時のバッファ残留シナリオの追記が推奨される。

---

## 1. Review Scope

### 1.1 Review Target

- **設計方針書**: `dev-reports/design/issue-163-multiline-message-buffer-design-policy.md`
- **Primary Source**: `src/lib/tmux.ts` (既存 sendKeys() のエスケープ処理パターン確認)
- **Affected Sources**: `src/lib/claude-session.ts`, `src/lib/cli-tools/codex.ts`

### 1.2 Related Source Files (Context)

| File | Relevance |
|------|-----------|
| `src/lib/tmux.ts` | sendKeys() の既存エスケープ方式（シングルクォート + `'\\''` エスケープ）を確認 |
| `src/lib/claude-session.ts` | sendMessageToClaude() の呼び出しパターン、sessionName の生成元を確認 |
| `src/lib/cli-tools/codex.ts` | sendMessage() の既存 execAsync tmux 直接呼び出しパターンを確認 |
| `src/lib/cli-tools/gemini.ts` | sendMessage() のエスケープ方式（シングルクォート）を比較参照 |
| `src/lib/cli-tools/claude.ts` | ClaudeTool.sendMessage() -> sendMessageToClaude() の呼び出しチェーンを確認 |
| `src/lib/cli-patterns.ts` | ANSI コード除去パターンなど、文字列処理の参考 |
| `src/lib/auto-yes-manager.ts` | sendKeys() による応答送信パターン、worktreeId 検証パターンを参照 |
| `src/app/api/worktrees/[id]/respond/route.ts` | sendKeys() による応答送信パターンを参照 |
| `src/app/api/worktrees/[id]/terminal/route.ts` | namespace import の tmux.sendKeys() パターンを参照 |

---

## 2. Security Check Details

### 2.1 CHECK-01: エスケープ処理の完全性 (A03:2021 Injection)

**状態**: PASS (注記付き)

#### 2.1.1 ダブルクォート内のエスケープ対象文字

設計書4.1項で定義されたエスケープ処理は以下の4種:

```
a. \ -> \\   (バックスラッシュ - 最初に処理)
b. $ -> \$   (変数展開防止)
c. " -> \"   (ダブルクォート)
d. ` -> \`   (コマンド置換防止)
```

**分析**:

ダブルクォート内でシェルが特殊解釈する文字は `$`, `` ` ``, `"`, `\`, `!` の5種。設計書では `!` が対象外だが、`printf` コマンドの引数として使用される文脈では `!`（ヒストリ展開）は非対話シェルでは無効であるため問題ない（`exec()` / `execAsync()` は非対話シェル `/bin/sh -c` で実行）。

- **`\`（バックスラッシュ）**: 最初にエスケープすることで二重エスケープを防止。正しい。
- **`$`（ドル記号）**: 変数展開防止。正しい。
- **`"`（ダブルクォート）**: 文字列の終端と解釈される問題を防止。正しい。
- **`` ` ``（バッククォート）**: コマンド置換防止。正しい。
- **`!`（エクスクラメーション）**: 非対話シェルではヒストリ展開が無効。エスケープ不要。正しい。

**エスケープ順序**: `\` を最初に処理することで、後続のエスケープ処理で追加された `\` が再エスケープされる問題を防止。設計は正しい。

#### 2.1.2 シングルクォートのエスケープ

**結論**: 不要（正しい判断）

シングルクォート `'` はダブルクォート内では特別な意味を持たない。`printf '%s' "${escapedText}"` のコマンド文字列において、`${escapedText}` がダブルクォートで囲まれているため、その内部のシングルクォートはリテラル文字として扱われる。

なお、`printf` の書式指定子 `'%s'` はシングルクォートで囲まれており、ユーザー入力テキストはその中に含まれないため干渉しない。

#### 2.1.3 改行（\n）の処理

**結論**: 正しく処理される

`printf '%s'` の `%s` フォーマット指定子は、引数をそのまま出力する。`%b` とは異なり、バックスラッシュエスケープシーケンスの解釈を行わない。したがって:

- リテラルな改行文字（`\n`）: そのままバイト列として出力される（正しい）
- `\n` という2文字の文字列: `\` が `\\` にエスケープされ、`\\n` として出力される（正しい -- `\\` がシェルで `\` に戻り、`\n` という2文字が出力される）

改行を含む複数行テキストは、`printf '%s'` のパイプ出力を通じて `tmux load-buffer -` のstdinに正しく入力される。

#### 2.1.4 タブ（\t）と CR（\r）

**結論**: `printf '%s'` では特殊解釈されない

- **タブ（\t）**: リテラルなタブ文字としてバッファに格納される。正しい動作。
- **CR（\r）**: リテラルとしてバッファに格納される。ターミナル上での表示改竄の可能性あり（SEC-SF-001で詳述）。

#### 2.1.5 % 文字の処理

**結論**: エスケープ不要（設計書への注記推奨 -- SEC-MF-001）

`printf '%s' "${escapedText}"` では、フォーマット指定子は `'%s'` で固定（ハードコード）されている。ユーザー入力テキストはフォーマット指定子ではなく引数として渡される。そのため `%d`, `%x`, `%%` などの文字列がユーザー入力に含まれていても、フォーマット指定子として解釈されることはない。

技術的にはリスクがないが、設計書にこの判断根拠を明記することで、将来のレビュー担当者が「見落とし」でないことを確認できる。

### 2.2 CHECK-02: バッファ名インジェクション (A03:2021 Injection)

**状態**: PASS

設計書SEC-002の定義:
- セッション名から `[^a-zA-Z0-9_-]` を `_` に置換
- プレフィックス `cm-` を付与

**分析**:

置換後のバッファ名は `cm-[a-zA-Z0-9_-]+` のパターンのみとなり、シェル特殊文字やtmuxコマンド区切り文字を含む余地がない。tmuxバッファ名として安全な文字セットのみが許可されている。

`cm-` プレフィックスにより、ユーザーが手動で作成した tmux バッファや他のツールのバッファとの名前衝突リスクが軽減されている。

### 2.3 CHECK-03: セッション名インジェクション (A03:2021 Injection)

**状態**: PASS (注記付き -- SEC-SF-002)

設計書で `tmux paste-buffer -t "${sessionName}"` のセッション名がダブルクォートで囲まれている。

**分析**:

1. **既存パターンとの一致**: 既存の `sendKeys()` 関数（`/Users/maenokota/share/work/github_kewton/commandmate-issue-163/src/lib/tmux.ts` 216行目）でも同一の `-t "${sessionName}"` パターンを使用:

```typescript
// sendKeys() (tmux.ts:216)
const command = sendEnter
  ? `tmux send-keys -t "${sessionName}" '${escapedKeys}' C-m`
  : `tmux send-keys -t "${sessionName}" '${escapedKeys}'`;
```

2. **セッション名の生成元**: `getSessionName()` 関数（`/Users/maenokota/share/work/github_kewton/commandmate-issue-163/src/lib/claude-session.ts` 169行目）で `mcbd-claude-{worktreeId}` として生成。worktreeId は DB 由来の値。

3. **worktreeId の安全性**: `auto-yes-manager.ts` では `isValidWorktreeId()` で `[a-zA-Z0-9_-]+` パターンの検証を実施（71行目）。しかし `sendTextViaBuffer()` の呼び出し元では明示的な検証が行われていない。

4. **新規リスク**: 既存の `sendKeys()` と同一のパターンであり、`sendTextViaBuffer()` 追加による新規リスクは発生しない。

**推奨**: 設計書にセッション名の安全性前提（DB由来、`getSessionName()` 経由で生成）を明記する。

### 2.4 CHECK-04: NULバイト処理 (A04:2021 Insecure Design)

**状態**: PASS (注記付き)

設計書SEC-004で `text.replace(/\0/g, '')` によるNULバイト除去が定義されている。

**分析**:

- **NULバイト除去の妥当性**: NULバイトはC文字列の終端文字であり、`printf` やシェルでの文字列処理で予期しない截断を引き起こす。除去は適切。
- **NUL除去後の空文字列**: テスト戦略8.1項で「空文字列」のエッジケースがカバーされている。NULのみで構成されたテキストが除去後に空文字列になるケースも「NULバイト」テストカテゴリでカバー。
- **NUL以外の制御文字**: `\x01`-`\x1f`（NUL除く）および `\x7f` については方針が未記載。SEC-SF-001として指摘。

### 2.5 CHECK-05: バッファリーク防止 (A05:2021 Security Misconfiguration)

**状態**: PASS (注記付き -- SEC-SF-003)

設計書SEC-003およびエラーハンドリング（7項）で以下の多層防御が定義:

| シナリオ | 対策 | バッファ状態 |
|---------|------|------------|
| 正常完了 | `paste-buffer -d` で自動削除 | 削除済み |
| paste-buffer 失敗 | catch ブロックで `delete-buffer` 実行 | 削除済み |
| load-buffer 失敗 | バッファ未作成のため削除不要 | 存在しない |
| delete-buffer 失敗 | `2>/dev/null \|\| true` で例外抑制 | 残留（低リスク） |
| Node.js クラッシュ | 対策なし | 残留 |

**プロセスクラッシュ時の残留リスク**:

`load-buffer` 成功後、`paste-buffer` 実行前に Node.js プロセスがクラッシュした場合、バッファが tmux サーバーのメモリ上に残留する。tmux サーバーが再起動されるか、手動で `tmux delete-buffer -b cm-{name}` を実行するまで残留し続ける。

**リスク評価**: メッセージ内容は CLI ツール（Claude CLI/Codex CLI）への指示テキストであり、パスワードや API キー等の機密情報が含まれる可能性は通常運用では低い。tmux サーバーはローカルプロセスであり、リモートからのアクセスは不可。総合リスクは低い。

### 2.6 CHECK-06: 既存 sendKeys() との比較分析

**状態**: INFORMATIONAL

| 項目 | sendKeys() (既存) | sendTextViaBuffer() (新規) |
|------|-------------------|---------------------------|
| クォーティング | シングルクォート `'${escapedKeys}'` | ダブルクォート `"${escapedText}"` |
| エスケープ対象 | `'` -> `'\''` (1種) | `\`, `$`, `"`, `` ` `` (4種) |
| 実行方式 | `execAsync()` (shell: true) | `execAsync()` (shell: true) |
| 入力経路 | tmux send-keys 引数 | printf パイプ -> tmux load-buffer stdin |
| 改行対応 | 不可（ペースト検出問題） | 可（バッファ経由で回避） |
| セッション名保護 | ダブルクォート `-t "${sessionName}"` | ダブルクォート `-t "${sessionName}"` |

**評価**: 両関数とも各クォーティングコンテキストに適切なエスケープを実施している。`sendTextViaBuffer()` のエスケープ対象が4種に増加しているのは、ダブルクォートコンテキストでの特殊文字がシングルクォートコンテキストより多いことに起因し、技術的に正しい。

---

## 3. OWASP Top 10 Checklist

| OWASP ID | Category | Status | Note |
|----------|----------|--------|------|
| A01:2021 | Broken Access Control | N/A | 内部関数。APIレベルの制御は既存で担保。 |
| A02:2021 | Cryptographic Failures | N/A | 暗号化処理なし。 |
| A03:2021 | Injection | PASS (注記付き) | 4種エスケープ+NUL除去+バッファ名サニタイズ。制御文字方針と%注記を推奨。 |
| A04:2021 | Insecure Design | PASS (注記付き) | バッファ経由方式は適切。前提条件の明記と残留シナリオの追記を推奨。 |
| A05:2021 | Security Misconfiguration | PASS | -dフラグ自動削除+エラー時クリーンアップ。 |
| A06:2021 | Vulnerable Components | N/A | 外部ライブラリ追加なし。 |
| A07:2021 | Auth Failures | N/A | 認証変更なし。 |
| A08:2021 | Data Integrity | PASS | エスケープ順序が適切。 |
| A09:2021 | Logging/Monitoring | PASS | 既存ログ維持。 |
| A10:2021 | SSRF | N/A | サーバーリクエスト変更なし。 |

---

## 4. Detailed Findings

### 4.1 Must Fix (1 item)

#### SEC-MF-001: printf '%s' の引数内での % 文字のエスケープ不要理由の明記

| Item | Detail |
|------|--------|
| OWASP | A03:2021 Injection |
| Severity | Low |
| Impact | Documentation completeness |

**問題**: 設計書SEC-001のエスケープ対象リストに `%` が含まれていないが、不要理由が明記されていない。

**技術的分析**: `printf '%s' "${escapedText}"` において、フォーマット指定子 `%s` はハードコードされた固定文字列 `'%s'`（シングルクォートで囲まれている）である。ユーザー入力はフォーマット指定子ではなく引数として渡されるため、入力内の `%` がフォーマット指定子として解釈されることはない。

```bash
# 安全な例: %d は引数であり、フォーマット指定子ではない
printf '%s' "User typed %d and %x"
# 出力: User typed %d and %x
```

**推奨対応**: 設計書SEC-001に以下の注記を追加:

> `%` 文字: `printf '%s'` の `'%s'` はフォーマット指定子として固定されており、ユーザー入力はその引数として渡される。したがって入力内の `%` がフォーマット指定子として解釈されることはなく、エスケープは不要。

### 4.2 Should Fix (3 items)

#### SEC-SF-001: 制御文字（\x01-\x1f）のフィルタリング方針不足

| Item | Detail |
|------|--------|
| OWASP | A03:2021 Injection |
| Severity | Low |
| Impact | Terminal display integrity |

**問題**: SEC-004でNULバイト除去は定義されているが、その他の制御文字に対する方針が未記載。

**リスクシナリオ**:

1. **CR（\r, 0x0D）**: ターミナル行頭復帰。攻撃者が `innocent text\rmalicious command` のようなテキストを送信した場合、ターミナル上の表示が改竄される可能性がある。ただし、tmuxバッファ経由のペーストでは CLIツール（Claude CLI等）がテキスト全体を受け取るため、実際のコマンド実行には至らない。
2. **BS（\x08, Backspace）**: ターミナル表示上のカーソル後退。表示上の文字上書きに使用される可能性がある。
3. **ESC（\x1b）**: ANSIエスケープシーケンスの開始。ただし、CLIツールへの入力としてはエスケープシーケンスとして解釈される可能性は低い。

**緩和要因**:
- ユーザー入力はWebブラウザのテキストエリアから入力されるため、制御文字が意図的に含まれる可能性は極めて低い。
- CLIツール（Claude CLI）はペーストされたテキストを「メッセージ内容」として解釈し、シェルコマンドとして実行しない。
- CommandMateはローカル開発ツールであり、攻撃者がユーザーの入力を操作するシナリオは想定しにくい。

**推奨対応**: 以下のいずれかを実施:
- 改行（`\n`）とタブ（`\t`）を除く制御文字を除去: `text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')`
- または設計書SEC-004に「改行・タブ以外の制御文字は通常運用で入力されないため、NULバイトのみを除去対象とする」旨を明記

#### SEC-SF-002: セッション名の安全性前提の明記

| Item | Detail |
|------|--------|
| OWASP | A04:2021 Insecure Design |
| Severity | Low |
| Impact | Documentation completeness |

**問題**: `tmux paste-buffer -t "${sessionName}"` および `tmux send-keys -t "${sessionName}"` でセッション名がダブルクォートで囲まれているが、sessionName内にダブルクォートが含まれる場合のリスクが設計書で明示的に議論されていない。

**既存コードの分析**:

```typescript
// claude-session.ts:169 - セッション名生成
export function getSessionName(worktreeId: string): string {
  return `mcbd-claude-${worktreeId}`;
}

// cli-tools/base.ts (推定) - CLIツール共通パターン
getSessionName(worktreeId: string): string {
  return `mcbd-${this.id}-${worktreeId}`;
}
```

worktreeId はデータベースから取得される値で、通常はUUID形式（`[a-f0-9-]`）または英数字+ハイフン形式。ダブルクォートやシェル特殊文字を含む可能性は極めて低い。

**推奨対応**: 設計書に以下の注記を追加:

> sessionName は `getSessionName()` 関数経由で `mcbd-{cliToolId}-{worktreeId}` として生成される。worktreeId はDB由来の値であり、シェル特殊文字（`"`, `$`, `` ` ``, `\`）を含まない前提。これは既存の `sendKeys()` 関数と同一のリスクレベルであり、新規のインジェクションリスクは追加されない。

#### SEC-SF-003: プロセスクラッシュ時のバッファ残留リスクの明記

| Item | Detail |
|------|--------|
| OWASP | A04:2021 Insecure Design |
| Severity | Low |
| Impact | Residual data exposure |

**問題**: SEC-003で正常時とエラー時のバッファクリーンアップは設計されているが、Node.jsプロセスのクラッシュ時のバッファ残留シナリオが記載されていない。

**残留シナリオ**: `load-buffer` でバッファにテキストが格納された後、`paste-buffer` 実行前に以下のいずれかが発生した場合:
- Node.jsプロセスの予期しないクラッシュ（OOM, SEGFAULT等）
- OSレベルのプロセス強制終了（kill -9）
- 電源断

tmuxサーバーはNode.jsプロセスとは独立して動作しているため、tmuxサーバーが再起動されるまでバッファはメモリ上に残留する。

**推奨対応**: 設計書SEC-003に以下を追加:

> **プロセスクラッシュ時の残留リスク**: load-buffer成功後にNode.jsプロセスがクラッシュした場合、tmuxバッファが残留する。残留バッファの内容はCLIツールへの指示テキストであり、パスワード等の機密情報が含まれる可能性は通常運用では低い。残留バッファは `tmux list-buffers` で確認し、`tmux delete-buffer -b cm-{name}` で手動削除可能。tmuxサーバーの再起動でも自動的に解消される。

### 4.3 Consider (3 items)

#### SEC-CS-001: execFile()/spawn方式への移行

設計書4.3項（SF-001）で既に認識されている。`exec()` は内部でシェル（`/bin/sh -c`）を経由するため、エスケープ処理が必要になる根本原因となっている。`execFile()` または `spawn()` でstdinパイプを使用すれば、シェルを経由しないためエスケープ処理自体が不要になる。

現行設計での対応は不要。将来Issueとして適切に分類されている。

#### SEC-CS-002: バッファ名の並行アクセス

CS-003で既に認識されている。ローカル開発ツールという使用コンテキストにおいて、攻撃者がタイミングを狙ってバッファ内容を差し替えるシナリオは非現実的。

#### SEC-CS-003: シングルクォートのエスケープ不要確認

ダブルクォート内でシングルクォートは特別な意味を持たず、エスケープ不要。この判断は正しい。

---

## 5. Specific Security Check Results

### 5.1 エスケープ処理の完全性

```
[PASS] \ -> \\  (バックスラッシュ、最初にエスケープ)
[PASS] $ -> \$  (変数展開防止)
[PASS] " -> \"  (ダブルクォート)
[PASS] ` -> \`  (コマンド置換防止)
[PASS] '       (シングルクォート - ダブルクォート内で不要)
[PASS] \n      (改行 - printf '%s' で正しく処理)
[PASS] \t      (タブ - printf '%s' で正しく処理)
[NOTE] %       (パーセント - 技術的に不要だが設計書に注記推奨)
[NOTE] \r      (CR - Terminal Injection リスクあり、方針明記推奨)
[NOTE] \x01-\x1f (制御文字 - フィルタリング方針未記載)
```

### 5.2 バッファ名サニタイズ

```
[PASS] 英数字のみ許可 ([a-zA-Z0-9_-])
[PASS] cm- プレフィックス (衝突回避)
[PASS] 特殊文字 -> _ 置換
```

### 5.3 セッション名保護

```
[PASS] ダブルクォートで囲む (-t "${sessionName}")
[PASS] 既存 sendKeys() と同一パターン
[NOTE] sessionName の安全性前提を設計書に明記推奨
```

### 5.4 NULバイト処理

```
[PASS] \0 除去 (text.replace(/\0/g, ''))
[PASS] 空文字列ケースのテストカバレッジ
[NOTE] NUL以外の制御文字の方針未記載
```

### 5.5 バッファリーク防止

```
[PASS] paste-buffer -d (正常時自動削除)
[PASS] delete-buffer フォールバック (エラー時)
[PASS] 2>/dev/null || true (クリーンアップ失敗時の例外抑制)
[NOTE] プロセスクラッシュ時の残留リスク (低リスク)
```

---

## 6. Risk Assessment

| Risk Category | Level | Rationale |
|---------------|-------|-----------|
| Technical | Low | 既存の sendKeys() と同一のアーキテクチャパターン。エスケープ処理は正しい順序で定義。 |
| Security | Low | コマンドインジェクション対策は OWASP A03 要件を概ね充足。制御文字・%注記は文書化レベルの改善。 |
| Operational | Low | バッファ残留リスクは限定的。ローカル開発ツールとしての使用コンテキストでリスクが緩和。 |

---

## 7. Recommendations Summary

### 7.1 設計書への追記推奨事項

| ID | Section | Content |
|----|---------|---------|
| SEC-MF-001 | SEC-001 | `%` 文字のエスケープ不要理由を注記 |
| SEC-SF-001 | SEC-004 | NUL以外の制御文字のフィルタリング方針を明記 |
| SEC-SF-002 | SEC-001/SEC-002 | sessionNameの安全性前提を注記 |
| SEC-SF-003 | SEC-003 | プロセスクラッシュ時のバッファ残留シナリオを追記 |

### 7.2 実装時の確認事項

1. エスケープ処理の4種が正しい順序で実装されていること（`\` -> `$` -> `"` -> `` ` ``）
2. `printf '%s'` が使用されていること（`%b` ではないこと）
3. NULバイト除去が `replace(/\0/g, '')` で実装されていること
4. バッファ名サニタイズが `replace(/[^a-zA-Z0-9_-]/g, '_')` で実装されていること
5. エラー時のバッファクリーンアップが try-catch/finally で実装されていること

---

## 8. Approval

**Status**: 条件付き承認 (Conditionally Approved)

**条件**:
- SEC-MF-001: `%` 文字のエスケープ不要理由を設計書SEC-001に注記すること

**推奨改善（承認条件ではない）**:
- SEC-SF-001: 制御文字フィルタリング方針の明記
- SEC-SF-002: セッション名の安全性前提の明記
- SEC-SF-003: バッファ残留シナリオの明記

**Score**: 4/5

セキュリティ設計は基本的に健全であり、コマンドインジェクション対策の核となるエスケープ処理は正しく設計されている。指摘事項は主に設計書の記載完全性に関するものであり、技術的なセキュリティ脆弱性ではない。
