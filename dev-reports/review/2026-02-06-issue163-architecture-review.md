# Architecture Review Report: Issue #163

## Stage 1 - 通常レビュー（設計原則評価）

| 項目 | 内容 |
|------|------|
| Issue | #163 - 複数行メッセージのバッファ送信方式 |
| レビュー対象 | 設計方針書 issue-163-multiline-message-buffer-design-policy.md |
| レビュー観点 | SOLID / KISS / YAGNI / DRY |
| レビュー日 | 2026-02-06 |
| ステータス | **条件付き承認 (Conditionally Approved)** |
| スコア | **4 / 5** |

---

## 1. エグゼクティブサマリー

Issue #163の設計方針書は、複数行テキストの`tmux send-keys`によるペースト検出問題に対して、`tmux load-buffer/paste-buffer`方式で解決する設計を提示している。全体として設計原則への準拠度は高く、特にOCP（既存`sendKeys()`に変更なし）とKISS（自動切替を行わない判断）は優れている。

主な改善点は、コードベース全体に散在する`sendKeys(text, false) + sendKeys('', true)`パターンのDRY違反と、既存テスト修正計画の詳細化である。これらは設計に軽微な修正を加えることで対応可能であり、実装着手のブロッカーとはならない。

---

## 2. 設計原則別評価

### 2.1 SRP（単一責任原則） - スコア: 4/5

**評価**: 良好

`sendTextViaBuffer()`はバッファ経由のテキスト送信のみに責務を限定しており、SRPに準拠している。

**良い点**:
- `sendTextViaBuffer()`の責務が明確（バッファロード -> ペースト -> Enter送信）
- `tmux.ts`にtmux操作関数を集約する設計方針

**指摘事項**:
- `src/lib/cli-tools/codex.ts`の`sendMessage()`（110-116行目）では、`sendKeys()`と`execAsync('tmux send-keys ...')`が混在しており、tmux操作がtmux.tsに集約されていない。設計書4.2.3項の変更によりこの問題は解消される予定だが、設計書でこの既存のSRP違反の解消を明示的に記載するとよい。

```typescript
// codex.ts 現状（SRP違反：tmux操作がモジュール外で直接実行）
await sendKeys(sessionName, message, false);
await new Promise((resolve) => setTimeout(resolve, 100));
await execAsync(`tmux send-keys -t "${sessionName}" C-m`);
```

### 2.2 OCP（開放閉鎖原則） - スコア: 5/5

**評価**: 優秀

既存の`sendKeys()`関数に一切変更を加えず、新関数`sendTextViaBuffer()`を追加する設計はOCPに完全準拠している。

**良い点**:
- `sendKeys()`の既存シグネチャ・挙動が完全に維持される
- 既存の`sendKeys()`呼び出し元（auto-yes-manager.ts、respond/route.ts等）に影響なし
- 新関数追加のみで機能拡張を実現

**テスト影響の詳細**:
設計書8.3項で既存テスト修正を記載しているが、具体的な修正内容の詳細化が望ましい。`tests/unit/lib/claude-session.test.ts`の318-326行目では以下のアサーションが存在する：

```typescript
// 現行テスト（sendKeys を2回呼ぶことを検証）
expect(sendKeys).toHaveBeenCalledTimes(2);
expect(sendKeys).toHaveBeenNthCalledWith(1, 'mcbd-claude-test-worktree', 'Hello Claude', false);
expect(sendKeys).toHaveBeenNthCalledWith(2, 'mcbd-claude-test-worktree', '', true);
```

このテストはsendTextViaBuffer()導入後に書き換えが必要となる。

### 2.3 DRY（Don't Repeat Yourself） - スコア: 3/5

**評価**: 改善余地あり

tmux.tsへの関数集約はDRYに適合するが、コードベース全体を分析すると以下のパターンが4箇所以上で重複している。

**重複パターン: 「テキスト送信 + 待機 + Enter送信」の3ステップ**:

| ファイル | コード |
|----------|--------|
| `claude-session.ts:390-391` | `sendKeys(name, msg, false)` + `sendKeys(name, '', true)` |
| `codex.ts:110-116` | `sendKeys(name, msg, false)` + `setTimeout(100)` + `execAsync('C-m')` |
| `auto-yes-manager.ts:302-304` | `sendKeys(name, answer, false)` + `setTimeout(100)` + `sendKeys(name, '', true)` |
| `respond/route.ts:149-156` | `sendKeys(name, input, false)` + `setTimeout(100)` + `sendKeys(name, '', true)` |
| `prompt-response/route.ts:68-74` | `sendKeys(name, answer, false)` + `setTimeout(100)` + `sendKeys(name, '', true)` |

このパターンはtmux.tsにヘルパー関数として抽出すべきである。

**推奨**: `sendTextViaBuffer()`はユーザーメッセージ（複数行対応が必要なケース）用であり、短い応答（y/n、数値選択等）には`sendKeysWithEnter()`のようなヘルパー関数を別途追加して共通化する。

### 2.4 KISS（Keep It Simple, Stupid） - スコア: 4/5

**評価**: 良好

**良い点**:
- メッセージ長や改行有無による自動切替を行わない判断は優秀。「ユーザーメッセージ送信は常にsendTextViaBuffer()」という明確なルールがKISSに適合する
- 使い分け基準が表形式で明確に定義されている（設計書3.3項）

**指摘事項**:
- エスケープ処理（4.1項のステップ2）は`printf '%s'`経由のシェル実行に起因する複雑さ。4種の特殊文字のエスケープ順序に依存関係がある点は、実装時のバグリスクとなる

```
エスケープ順序（順序重要）:
a. \ -> \\   (最初に処理しないと二重エスケープ)
b. $ -> \$
c. " -> \"
d. ` -> \`
```

**改善提案**: `child_process.execFile()`でシェルを経由せずtmuxコマンドを実行し、標準入力にテキストを渡す方式であれば、エスケープ処理自体が不要になる。ただしNode.jsのchild_process APIでstdinパイプとtmuxのload-buffer `-`（stdin読み取り）の組み合わせが正しく動作するかの検証が必要。

### 2.5 YAGNI（You Ain't Gonna Need It） - スコア: 4/5

**評価**: 良好

**良い点**:
- sendKeys/sendTextViaBufferの自動切替を実装しない判断はYAGNIに完全準拠
- 変更対象外ファイルの明確な判断基準（設計書5.2項）

**検討事項**:
- `sendTextViaBuffer()`の`sendEnter`パラメータ（デフォルト`true`）について、設計書の全使用例（4.2.2、4.2.3）では`sendEnter=true`のみが使われている。`sendEnter=false`の具体的なユースケースが現時点で存在しない
- ただし、既存`sendKeys()`との対称性維持の観点で残す判断は合理的。コストも最小限（boolean分岐1箇所のみ）であるため、厳密にはYAGNI違反だが実質的な問題は小さい

---

## 3. リスク評価

| リスク種別 | 内容 | 影響度 | 発生確率 | 対策優先度 |
|-----------|------|--------|---------|-----------|
| 技術的リスク | エスケープ処理の順序バグ | Medium | Low | P2 |
| 技術的リスク | バッファ名の並行アクセス競合 | Low | Low | P3 |
| セキュリティリスク | コマンドインジェクション（printf経由） | Medium | Low | P2 |
| 運用リスク | 既存テスト修正漏れによるCI失敗 | Low | Medium | P2 |

### 3.1 技術的リスク - Low

`sendTextViaBuffer()`は新規追加であり、既存機能に影響しない。エスケープ処理の順序依存はユニットテスト（設計書8.1項）で十分カバーされる計画。

### 3.2 セキュリティリスク - Low

SEC-001からSEC-004まで包括的なセキュリティ対策が設計されている。NULバイト除去、バッファ名サニタイズ、バッファリーク防止も網羅的。printf経由のエスケープ処理は既知のアプローチであり、テストで検証される。

### 3.3 運用リスク - Low

後方互換性が完全に維持され、APIインターフェースに変更なし。デプロイリスクは最小限。

---

## 4. 改善推奨事項

### 4.1 必須改善項目 (Must Fix) - 1件

#### MF-001: sendKeys 2段階送信パターンのDRY改善

**現状**: `sendKeys(text, false)` + `delay` + `sendKeys('', true)`の3ステップパターンが5箇所に散在している。

**推奨対応**: tmux.tsに以下のようなヘルパー関数を追加する設計を検討する。

```typescript
// 短い応答（y/n, 数値等）を送信する際のヘルパー
export async function sendKeysWithEnter(
  sessionName: string,
  keys: string,
  delayMs: number = 100
): Promise<void> {
  await sendKeys(sessionName, keys, false);
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  await sendKeys(sessionName, '', true);
}
```

注: この改善はIssue #163のスコープ外として別Issueで対応してもよい。設計書で「将来課題」として記載することを推奨。

### 4.2 推奨改善項目 (Should Fix) - 3件

#### SF-001: execFile方式の検討

設計書に「代替案として`execFile()`方式を検討したがエスケープの確実性を優先した」等の判断根拠を追記する。

#### SF-002: codex.ts execAsync直接呼び出しの解消明示

設計書4.2.3項に、この変更により`codex.ts`からの`execAsync`によるtmux直接呼び出しが解消される旨を明記する。

#### SF-003: 既存テスト修正計画の詳細化

設計書8.3項に具体的なテスト修正内容を追記する。特に`claude-session.test.ts`の`'should use sendKeys for Enter instead of execAsync (CONS-001)'`テストケースの修正内容。

### 4.3 検討事項 (Consider) - 3件

#### CS-001: sendEnterパラメータのYAGNI評価

現時点でsendEnter=falseのユースケースがなければ削除を検討。API対称性維持の判断は許容範囲。

#### CS-002: respond/route.ts等のバッファ送信対応

ユーザーが複数行入力するUIが追加された場合のフォローアップIssue作成を推奨。

#### CS-003: バッファ名の一意性保証

並行送信のリスクは低いが、バッファ名にタイムスタンプ等を付与して防御的に設計することを検討。

---

## 5. レビュー対象ファイル一覧

| ファイル | パス | レビュー内容 |
|----------|------|-------------|
| 設計方針書 | `dev-reports/design/issue-163-multiline-message-buffer-design-policy.md` | 主レビュー対象 |
| tmux.ts | `src/lib/tmux.ts` | sendKeys()の現行実装確認 |
| claude-session.ts | `src/lib/claude-session.ts` | sendMessageToClaude()の現行実装確認 |
| codex.ts | `src/lib/cli-tools/codex.ts` | sendMessage()の現行実装確認 |
| gemini.ts | `src/lib/cli-tools/gemini.ts` | 非対象ファイルの確認（パイプ方式） |
| cli-patterns.ts | `src/lib/cli-patterns.ts` | パターン定数の確認 |
| auto-yes-manager.ts | `src/lib/auto-yes-manager.ts` | sendKeys使用パターンの確認 |
| respond/route.ts | `src/app/api/worktrees/[id]/respond/route.ts` | sendKeys使用パターンの確認 |
| prompt-response/route.ts | `src/app/api/worktrees/[id]/prompt-response/route.ts` | sendKeys使用パターンの確認 |
| claude-session.test.ts | `tests/unit/lib/claude-session.test.ts` | 既存テストの影響確認 |

---

## 6. 総合評価

| 設計原則 | スコア | 評価 |
|---------|--------|------|
| SRP (単一責任原則) | 4/5 | 良好 - sendTextViaBuffer()の責務は明確 |
| OCP (開放閉鎖原則) | 5/5 | 優秀 - 既存関数に変更なし |
| LSP (リスコフの置換原則) | 5/5 | 該当なし - 継承・ポリモーフィズムの変更なし |
| ISP (インターフェース分離原則) | 5/5 | 該当なし - 関数レベルのIFは適切 |
| DIP (依存性逆転原則) | 4/5 | 良好 - tmux.tsへの適切な依存 |
| KISS | 4/5 | 良好 - 自動切替なしの判断は秀逸 |
| YAGNI | 4/5 | 良好 - sendEnterパラメータは要検討 |
| DRY | 3/5 | 改善余地あり - 2段階送信パターンの重複 |

**総合スコア: 4/5 - 条件付き承認**

設計方針書は全体として高品質であり、問題解決のアプローチは適切である。MF-001（DRY改善の方針明示）を設計書に追記した上で実装着手を推奨する。SF項目は実装フェーズで対応可能。

---

## 7. レビュー履歴

| 日付 | ステージ | レビューア | 結果 |
|------|---------|-----------|------|
| 2026-02-06 | Stage 1 (通常レビュー) | architecture-review-agent | 条件付き承認 (4/5) |
